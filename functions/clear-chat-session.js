exports.handler = async function (context, event, callback) {
  const Twilio = require("twilio");
  const client = require("twilio")(context.ACCOUNT_SID, context.AUTH_TOKEN);
  const { FLEX_CHAT_SERVICE_SID: chatServiceSid } = context;

  console.log("event details: ", event);

  const response = new Twilio.Response();
  response.appendHeader("Access-Control-Allow-Origin", "*");
  response.appendHeader("Access-Control-Allow-Methods", "OPTIONS, POST, GET");
  response.appendHeader("Content-Type", "application/json");
  response.appendHeader("Access-Control-Allow-Headers", "Content-Type");

  const responseBody = {
    success: false,
    payload: {
      errors: [],
    },
  }; // and this will be the Body of the response

  // Throwing everything in a try/catch block to handle errors
  try {
    if (Object.keys(event).length === 0) {
      // This handles the case where NO parameters were sent, allowing for empty Options request (since we don't have access to the Request method/headers)
      throw {
        status: 200,
        code: 60200,
        message: "No body sent.",
      };
    }

    if (!event.channelSid) {
      // We're missing our parameter! Throw an exception early.
      throw {
        status: 400,
        code: 60200,
        message: "Request must include a channelSid",
      };
    }

    // First pull the Channel via the Twilio SDK
    let channel = await client.chat
      .services(chatServiceSid)
      .channels(event.channelSid)
      .fetch(); // If this channel isn't found, it will throw a 404 error

    // if channel.attributes fails to parse, it'll throw a SyntaxError
    let channelAttributes = JSON.parse(channel.attributes);

    // Build the update object for the Chat Channel
    channelAttributes.status = "INACTIVE";
    let channelUpdate = {
      attributes: JSON.stringify(channelAttributes),
    }; // All we need to do for the Chat Channel is set 'status' to 'INACTIVE'

    await client.chat
      .services(chatServiceSid)
      .channels(event.channelSid)
      .update(channelUpdate);

    await client.proxy
      .services(context.TWILIO_PROXY_SERVICE_SID)
      .sessions(event.sessionSid)
      .remove();
    responseBody.success = true;
    responseBody.payload.message = "Chat ended.";
  } catch (e) {
    // We've caught an error! Handle the HTTP error response
    console.log(e.message || e);

    response.setStatusCode(e.status || 500);

    responseBody.success = false;
    responseBody.payload.errors = responseBody.payload.errors || [];
    responseBody.payload.errors.push({
      code: e.code || 500,
      message: e.message,
    });
  }

  response.setBody(responseBody);
  console.log(responseBody);
  callback(null, response);
};
