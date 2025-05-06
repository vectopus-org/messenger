const https = require('https');
const AWS = require('aws-sdk');

// Set required env vars
process.env.SLACK_MESSAGES_GENERAL = 'https://fake.slack.webhook/general';
process.env.SLACK_MESSAGES_ERRORS = 'https://fake.slack.webhook/errors';
process.env.SLACK_MESSAGES_UPLOAD = 'https://fake.slack.webhook/uploads';
process.env.SLACK_MESSAGES_TRANSACTIONS = 'https://fake.slack.webhook/transactions';
process.env.SLACK_MESSAGES_CONTRIBUTOR_SIGNUP = 'https://fake.slack.webhook/contributors';
process.env.SLACK_MESSAGES_SIGNUPS = 'https://fake.slack.webhook/signups';
process.env.FALLBACK_SNS_TOPIC_ARN = 'arn:aws:sns:us-east-1:511873596089:image-processing-topic';

// Mocks
jest.mock('https');
jest.mock('aws-sdk', () => {
    const publishMock = jest.fn().mockReturnValue({ promise: jest.fn().mockResolvedValue({}) });
    return {
        SNS: jest.fn(() => ({ publish: publishMock })),
    };
});

const snsInstance = new AWS.SNS();
const handler = require('../lambda/messenger/index.js').handler;

describe('vectoplus-messenger Lambda', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('sends Slack message if webhook works', async () => {
        https.request.mockImplementation((url, opts, cb) => {
            const res = {
                statusCode: 200,
                on: (event, fn) => event === 'end' && fn(),
            };
            cb(res);
            return {
                on: jest.fn(),
                write: jest.fn(),
                end: jest.fn(),
            };
        });

        const event = {
            Records: [
                {
                    Sns: {
                        Message: JSON.stringify({
                            channel: '#general',
                            message: 'Test message',
                            emoji: '🔥',
                        }),
                    },
                },
            ],
        };

        await handler(event);

        expect(https.request).toHaveBeenCalled();
        expect(snsInstance.publish).not.toHaveBeenCalled();
    });

    test('falls back to SNS if Slack fails', async () => {
        https.request.mockImplementation((url, opts, cb) => {
            const res = {
                statusCode: 500,
                on: (event, fn) => event === 'end' && fn(),
            };
            cb(res);
            return {
                on: jest.fn(),
                write: jest.fn(),
                end: jest.fn(),
            };
        });

        const event = {
            Records: [
                {
                    Sns: {
                        Message: JSON.stringify({
                            channel: '#general',
                            message: 'Fallback message',
                            emoji: '⚠️',
                        }),
                    },
                },
            ],
        };

        await handler(event);

        expect(snsInstance.publish).toHaveBeenCalledWith(
            expect.objectContaining({
                TopicArn: process.env.FALLBACK_SNS_TOPIC_ARN,
                Subject: '[Slack Fallback] #general',
                Message: expect.stringContaining('Fallback message'),
            })
        );
    });

    test('ignores record with missing message', async () => {
        const event = {
            Records: [
                {
                    Sns: {
                        Message: JSON.stringify({ channel: '#general' }),
                    },
                },
            ],
        };

        await handler(event);

        expect(https.request).not.toHaveBeenCalled();
        expect(snsInstance.publish).not.toHaveBeenCalled();
    });
});