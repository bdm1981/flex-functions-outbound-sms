const Twilio = require("twilio");
const uuidv1 = require("uuid/v1");

const verifyEventProps = (event, fromNumber) => {
  const result = {
    success: false,
  };

  console.log(event);
  console.log("fromNumber: ", fromNumber);
  const { toName, toNumber, email, workerUri } = event;

  if (!fromNumber) {
    result.message = "Missing 'fromNumber' in request body";
  } else if (!toName) {
    result.message = "Missing 'toName' in request body";
  } else if (!toNumber) {
    result.message = "Missing 'toNumber' in request body";
  } else {
    result.success = true;
  }

  return result;
};

const getFlexFlow = (context, fromNumber) =>
  new Promise(async (resolve, reject) => {
    const client = require("twilio")(context.ACCOUNT_SID, context.AUTH_TOKEN);
    const workspaceSid = context.FLEX_WORKSPACE_SID;
    const workflowSid = context.FLEX_WORKFLOW_SID;
    const smsChannelSid = context.FLEX_SMS_CHANNEL_SID;
    const chatServiceSid = context.FLEX_CHAT_SERVICE_SID;
    const newFlowName = "OutboundSMS";

    let flexFlow;
    const flexFlows = await client.flexApi.flexFlow
      .list()
      .catch((error) => console.log(error));
    for (let flow of flexFlows)
      if (flow.friendlyName === newFlowName)
        flexFlow = await client.flexApi
          .flexFlow(flow.sid)
          .fetch()
          .catch((error) => console.log(error)); // fetch if true

    // create flow if not exists.
    if (!flexFlow) {
      const opts = {
        enabled: false,
        contactIdentity: context.FROM_NUMBER,
        integrationType: "task",
        "integration.workspaceSid": workspaceSid,
        "integration.workflowSid": workflowSid,
        "integration.channel": smsChannelSid,
        friendlyName: newFlowName,
        chatServiceSid: chatServiceSid,
        channelType: "sms",
        longLived: false,
        janitorEnabled: true,
      };
      // console.log('opts: ',opts)
      flexFlow = await client.flexApi.flexFlow
        .create(opts)
        .catch((error) => console.log(error));
    }

    return resolve(flexFlow);
  });

const createChatChannelWithTask = (
  context,
  flexFlowSid,
  identity,
  toNumber,
  toName,
  fromNumber,
  workerUri
) =>
  new Promise(async (resolve, reject) => {
    const client = require("twilio")(context.ACCOUNT_SID, context.AUTH_TOKEN);

    const newChannelOpts = {
      target: toNumber,
      taskAttributes: JSON.stringify({
        to: toNumber,
        direction: "outbound",
        name: toNumber,
        from: fromNumber,
        targetWorker: workerUri,
        autoAnswer: true,
      }),
      identity: `SMS${toNumber}`,
      chatFriendlyName: `Outbound Chat with ${toNumber}`,
      flexFlowSid: flexFlowSid,
      chatUserFriendlyName: toName,
      uniqueName: new Date().getTime(),
      longLived: false,
    };

    let newChannel = await client.flexApi.channel
      .create(newChannelOpts)
      .catch((error) => {
        console.log(error);
        return reject(error);
      });

    return resolve(newChannel);
  });

const createProxySession = (
  context,
  chatChannelSid,
  toNumber,
  toName,
  fromNumber,
  email,
  crmid,
  workerUri
) =>
  new Promise(async (resolve, reject) => {
    const client = Twilio(context.ACCOUNT_SID, context.AUTH_TOKEN);
    const proxyClient = client.proxy.services(context.TWILIO_PROXY_SERVICE_SID);

    let proxySession;
    try {
      const participants = [
        {
          Identifier: toNumber,
          ProxyIdentifier: fromNumber,
          FriendlyName: toName,
        },
        {
          Identifier: chatChannelSid,
          ProxyIdentifier: fromNumber,
          FriendlyName: toName,
        },
      ];
      proxySession = await proxyClient.sessions.create({
        uniqueName: chatChannelSid,
        mode: "message-only",
        participants: JSON.stringify(participants),
      });
    } catch (error) {
      console.error("Error creating proxy session.", error);
      return reject(error);
    }

    return resolve(proxySession);
  });

exports.handler = async function (context, event, callback) {
  console.log("Received event with properties:");
  Object.keys(event).forEach((key) => {
    console.log(`--${key}:`, event[key]);
  });

  const response = new Twilio.Response();
  response.appendHeader("Access-Control-Allow-Origin", "*");
  response.appendHeader("Access-Control-Allow-Methods", "OPTIONS, POST, GET");
  response.appendHeader("Content-Type", "application/json");
  response.appendHeader("Access-Control-Allow-Headers", "Content-Type");

  const eventCheck = verifyEventProps(event, context.FROM_NUMBER);
  if (!eventCheck.success) {
    console.log("Event property check failed.", eventCheck.message);
    response.setStatusCode(400);
    response.setBody({ status: 400, message: eventCheck.message });
    return callback(null, response);
  }

  const { toName, toNumber, email, workerUri } = event;

  let flexFlow;
  try {
    flexFlow = await getFlexFlow(context, context.FROM_NUMBER);
  } catch (error) {
    response.setStatusCode(error && error.status);
    response.setBody(error);
    return callback(null, response);
  }
  if (!flexFlow) {
    response.setStatusCode(500);
    response.setBody({ message: "Unable to find matching Flex Flow" });
    return callback(null, response);
  }

  const chatServicesSid = flexFlow.chat_service_sid;
  const flexFlowSid = flexFlow.sid;
  console.log("Matching flow chat service SID:", chatServicesSid);
  console.log("Matching flex flow sid:", flexFlowSid);

  const identity = uuidv1();

  let chatChannel;
  try {
    chatChannel = await createChatChannelWithTask(
      context,
      flexFlowSid,
      identity,
      toNumber,
      toName,
      context.FROM_NUMBER,
      email,
      workerUri
    );
  } catch (error) {
    response.setStatusCode(error && error.status);
    response.setBody(error);
    console.error(error);
    return callback(error, response);
  }
  if (!chatChannel) {
    response.setStatusCode(500);
    response.setBody({ message: "Failed to create chat channel" });
    return callback(null, response);
  }
  if (!chatChannel.sid) {
    response.setStatusCode(chatChannel.status);
    response.setBody(chatChannel);
    return callback(null, response);
  }
  console.log("Chat channel created:");
  const responseBody = { chatChannel: { identity } };
  Object.keys(chatChannel).forEach((key) => {
    console.log(`${key}: ${chatChannel[key]}`);
    responseBody.chatChannel[key] = chatChannel[key];
  });

  let proxySession;
  try {
    proxySession = await createProxySession(
      context,
      chatChannel.sid,
      toNumber,
      toName,
      context.FROM_NUMBER,
      email,
      workerUri
    );
  } catch (error) {
    response.setStatusCode(error && error.status);
    response.setBody(error);
    return callback(null, response);
  }
  if (!proxySession) {
    response.setStatusCode(500);
    response.setBody({ message: "Failed to create proxy session" });
    return callback(null, response);
  }
  if (!proxySession.sid) {
    response.setStatusCode(proxySession.status);
    response.setBody(proxySession);
    return callback(null, response);
  }
  console.log("Proxy session created:");
  responseBody.proxySession = {};
  Object.keys(proxySession).forEach((key) => {
    if (key === "_version" || key === "_solution") {
      return;
    }
    console.log(`${key}: ${proxySession[key]}`);
    responseBody.proxySession[key] = proxySession[key];
  });

  response.setBody(responseBody);
  return callback(null, response);
};
