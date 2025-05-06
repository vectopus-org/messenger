const https = require('https');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
require('dotenv').config();

// Set up SNS client
const sns = new SNSClient({ region: 'us-east-1' });

// Required ENV vars
const requiredEnvVars = [
    'SLACK_MESSAGES_GENERAL',
    'SLACK_MESSAGES_ERRORS',
    'SLACK_MESSAGES_UPLOAD',
    'SLACK_MESSAGES_TRANSACTIONS',
    'SLACK_MESSAGES_CONTRIBUTOR_SIGNUP',
    'SLACK_MESSAGES_SIGNUPS',
    'FALLBACK_SNS_TOPIC_ARN',
];

for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
        throw new Error(`Missing required environment variable: ${varName}`);
    }
}

const SlackWebhooks = {
    '#general'      : process.env.SLACK_MESSAGES_GENERAL,
    '#site-errors'  : process.env.SLACK_MESSAGES_ERRORS,
    '#uploads'      : process.env.SLACK_MESSAGES_UPLOAD,
    '#transactions' : process.env.SLACK_MESSAGES_TRANSACTIONS,
    '#contributors' : process.env.SLACK_MESSAGES_CONTRIBUTOR_SIGNUP,
    '#signups'      : process.env.SLACK_MESSAGES_SIGNUPS,
};

const sendSlackMessage = async ({ channel, message, emoji }) => {
    const webhookUrl = SlackWebhooks[channel];

    if (!webhookUrl) {
        throw new Error(`No webhook configured for channel: ${channel}`);
    }

    const body = JSON.stringify({
        text: emoji ? `${emoji} ${message}` : message,
    });

    return new Promise((resolve, reject) => {
        const req = https.request(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        }, (res) => {
            res.on('data', () => { }); // swallow
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve();
                } else {
                    reject(new Error(`Slack returned status ${res.statusCode}`));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
};

const sendSNSFallback = async ({ subject, message }) => {
    const command = new PublishCommand({
        TopicArn: process.env.FALLBACK_SNS_TOPIC_ARN,
        Subject: subject,
        Message: message,
    });

    await sns.send(command);
};

exports.handler = async (event) => {
    for (const record of event.Records) {
        try {
            const payload = JSON.parse(record.Sns.Message);
            const { channel, message, emoji } = payload;

            if (!channel || !message) {
                console.error('Missing required fields in payload:', payload);
                continue;
            }

            try {
                await sendSlackMessage({ channel, message, emoji });
                console.log(`Message sent to ${channel}`);
            } catch (slackErr) {
                console.error(`Slack error, falling back to SNS: ${slackErr.message}`);

                const fallbackMessage = emoji ? `${emoji} ${message}` : message;
                console.log('Sending fallback SNS message:', {
                    subject: `[Slack Fallback] ${channel}`,
                    message: fallbackMessage,
                });

                await sendSNSFallback({
                    subject: `[Slack Fallback] ${channel}`,
                    message: fallbackMessage,
                });
            }

        } catch (err) {
            console.error('Failed to process SNS record:', err.message);
        }
    }
};