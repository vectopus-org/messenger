const cdk = require('aws-cdk-lib');
const { Stack, Duration } = cdk;
const iam = require('aws-cdk-lib/aws-iam');
const sns = require('aws-cdk-lib/aws-sns');
const lambda = require('aws-cdk-lib/aws-lambda');
const snsSubscriptions = require('aws-cdk-lib/aws-sns-subscriptions');
const path = require('path');
require('dotenv').config();

class MessengerStack extends Stack {
    constructor(scope, id, props) {
        super(scope, id, props);

        // SNS Topic for Slack message publishing
        const siteAlertsTopic = new sns.Topic(this, 'SiteAlertsTopic', {
            displayName: 'Vectoplus Site Alerts',
            topicName: 'site-alerts',
        });

        // Fallback SNS Topic (existing)
        const fallbackTopicArn = process.env.FALLBACK_SNS_TOPIC_ARN;

        const lambdaLayer = new lambda.LayerVersion(this, 'vectopus-messenger-layer', {
            name: 'vectopus-messenger-layer',
            code: lambda.Code.fromAsset('bin/layer/lambda.zip'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
            description: 'Lambda layer with aws-sdk and dotenv',
        });

        // IAM role for the Lambda
        const messengerLambdaRole = new iam.Role(this, 'MessengerLambdaRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            description: 'IAM role for messenger lambda to log and publish alerts',
            inlinePolicies: {
                MessengerInlinePolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                            resources: ['*'],
                        }),
                        new iam.PolicyStatement({
                            actions: ['sns:Publish'],
                            resources: [fallbackTopicArn],
                        }),
                    ],
                }),
            },
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
        });

        // Lambda Function
        const messengerLambda = new lambda.Function(this, 'MessengerLambda', {
            functionName: 'vectoplus-messenger',
            runtime: lambda.Runtime.NODEJS_20_X,
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/messenger/lambda.zip')),
            handler: 'index.handler',
            memorySize: 128,
            timeout: Duration.seconds(10),
            role: messengerLambdaRole,
            layers: [lambdaLayer],
            environment: {
                SLACK_MESSAGES_GENERAL: process.env.SLACK_MESSAGES_GENERAL,
                SLACK_MESSAGES_ERRORS: process.env.SLACK_MESSAGES_ERRORS,
                SLACK_MESSAGES_UPLOAD: process.env.SLACK_MESSAGES_UPLOAD,
                SLACK_MESSAGES_TRANSACTIONS: process.env.SLACK_MESSAGES_TRANSACTIONS,
                SLACK_MESSAGES_CONTRIBUTOR_SIGNUP: process.env.SLACK_MESSAGES_CONTRIBUTOR_SIGNUP,
                SLACK_MESSAGES_SIGNUPS: process.env.SLACK_MESSAGES_SIGNUPS,
                FALLBACK_SNS_TOPIC_ARN: fallbackTopicArn,
            },
        });

        // Subscribe the Lambda to the primary alerts topic
        siteAlertsTopic.addSubscription(
            new snsSubscriptions.LambdaSubscription(messengerLambda)
        );

        // Outputs
        new cdk.CfnOutput(this, 'SiteAlertsTopicArn', {
            value: siteAlertsTopic.topicArn,
        });

        new cdk.CfnOutput(this, 'FallbackTopicArn', {
            value: fallbackTopicArn,
        });
    }
}

module.exports = { MessengerStack };