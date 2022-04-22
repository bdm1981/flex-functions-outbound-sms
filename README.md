# Supporting Functions for the Outbound SMS Flex Plugin

## Prerequisites
1. First make sure the Twilio CLI is installed. Instructions can be found [here](https://www.twilio.com/docs/twilio-cli/quickstart)
1. Install the Twilio serverless toolkit in order to deploy these functions from the CLI. [Instructions](https://www.twilio.com/docs/labs/serverless-toolkit/getting-started#install-the-twilio-serverless-toolkit)

## Setup
1. Copy or rename the .env-example file to .env. Gather the SIDs referenced below from the Flex project and save them in the .env file.

```
TWILIO_ACCOUNT_SID=AC
TWILIO_AUTH_TOKEN=
FROM_NUMBER=
TWILIO_PROXY_SERVICE_SID=KS
FLEX_WORKSPACE_SID=WS
FLEX_WORKFLOW_SID=WW
FLEX_SMS_CHANNEL_SID=TC
FLEX_CHAT_SERVICE_SID=IS
```

## Deploy
 Deploy the Functions from the cli by running the following command

`twilio serverless:deploy`

Make note of the serverless runtime domain. It will end in twil.io. Now that this is complete the Flex Plugin can be deployed. Follow the instructions [here](https://github.com/bdm1981/flex-plugin-outbound-sms)