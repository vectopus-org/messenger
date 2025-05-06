require('dotenv').config();

const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { handler } = require('./lambda/messenger/index.js');

// Initialize SNS client (region required)
const sns = new SNSClient({ region: 'us-east-1' });

// Topic ARN for remote lambda
const REMOTE_MESSENGER_TOPIC_ARN = process.env.REMOTE_MESSENGER_TOPIC_ARN;

// === LOCAL TESTS ===

const localSuccessEvent = {
    Records: [
        {
            Sns: {
                Message: JSON.stringify({
                    channel: '#general',
                    message: '✅ Local Lambda Slack success',
                    emoji: '👍',
                }),
            },
        },
    ],
};

const localFallbackEvent = {
    Records: [
        {
            Sns: {
                Message: JSON.stringify({
                    channel: '#slack-fallback-test', // Invalid channel to force fallback
                    message: '❌ Local Lambda Slack fails, fallback to SNS',
                    emoji: '🚨',
                }),
            },
        },
    ],
};

// === REMOTE TESTS ===

const remoteSuccessCommand = new PublishCommand({
    Subject: 'Remote Slack Success',
    Message: JSON.stringify({
        channel: '#general',
        message: '📡 Remote Lambda Slack success',
        emoji: '📬',
    }),
    TopicArn: REMOTE_MESSENGER_TOPIC_ARN,
});

const remoteFailureCommand = new PublishCommand({
    Subject: 'Remote Slack Failure',
    Message: JSON.stringify({
        channel: '#slack-fallback-test', // Invalid channel to force fallback
        message: '💥 Remote Lambda Slack fails, should fallback',
        emoji: '🧨',
    }),
    TopicArn: REMOTE_MESSENGER_TOPIC_ARN,
});

// === RUN TESTS ===

(async () => {
    console.log('\n--- LOCAL SUCCESS CASE ---');
    await handler(localSuccessEvent)
        .then(() => console.log('✅ Local success complete'))
        .catch((err) => console.error('❌ Local success error:', err));

    console.log('\n--- LOCAL FALLBACK CASE ---');
    await handler(localFallbackEvent)
        .then(() => console.log('✅ Local fallback complete'))
        .catch((err) => console.error('❌ Local fallback error:', err));

    console.log('\n--- REMOTE SUCCESS CASE ---');
    try {
        const result = await sns.send(remoteSuccessCommand);
        console.log('✅ Remote SNS success published:', result.MessageId);
    } catch (err) {
        console.error('❌ Remote SNS success error:', err.message);
    }

    console.log('\n--- REMOTE FAILURE CASE ---');
    try {
        const result = await sns.send(remoteFailureCommand);
        console.log('✅ Remote SNS failure test published:', result.MessageId);
    } catch (err) {
        console.error('❌ Remote SNS failure error:', err.message);
    }
})();