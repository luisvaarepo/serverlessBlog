import { Stack, StackProps, CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export class BlogPlatformStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const postsTable = new dynamodb.Table(this, 'PostsTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      partitionKey: { name: 'username', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const postsLambda = new nodejs.NodejsFunction(this, 'PostsLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../backend/src/handlers/posts.ts'),
      handler: 'handler',
      bundling: {
        target: 'node20',
        format: nodejs.OutputFormat.CJS
      },
      timeout: Duration.seconds(60),
      environment: {
        POSTS_TABLE_NAME: postsTable.tableName,
        USERS_TABLE_NAME: usersTable.tableName,
        AUTH_SECRET: process.env.AUTH_SECRET ?? 'change-me-in-prod',
        YOU_COM_SEARCH_API_KEY: process.env.YOU_COM_SEARCH_API_KEY ?? '',
        YOU_COM_RESEARCH_MODE: process.env.YOU_COM_RESEARCH_MODE ?? 'standard'
      }
    });

    postsTable.grantReadWriteData(postsLambda);
    usersTable.grantReadWriteData(postsLambda);

    const api = new apigateway.RestApi(this, 'BlogApi', {
      restApiName: 'ServerlessBlogApi',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
        allowMethods: apigateway.Cors.ALL_METHODS
      }
    });

    /**
     * Ensure API Gateway generated 4XX/5XX responses include CORS headers.
     */
    api.addGatewayResponse('Default4xxCors', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'"
      }
    });

    /**
     * Ensure API Gateway generated 5XX responses include CORS headers.
     */
    api.addGatewayResponse('Default5xxCors', {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'"
      }
    });

    /**
     * Ensure API Gateway auth failure responses include CORS headers.
     */
    api.addGatewayResponse('UnauthorizedCors', {
      type: apigateway.ResponseType.UNAUTHORIZED,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'"
      }
    });

    /**
     * Ensure API Gateway access denied responses include CORS headers.
     */
    api.addGatewayResponse('AccessDeniedCors', {
      type: apigateway.ResponseType.ACCESS_DENIED,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'"
      }
    });

    const apiRoot = api.root.addResource('api');
    const apiPosts = apiRoot.addResource('posts');
    const apiPremiumPosts = apiPosts.addResource('premium');
    const apiPostById = apiPosts.addResource('{id}');
    const apiRegister = apiRoot.addResource('register');
    const apiLogin = apiRoot.addResource('login');
    const postsIntegration = new apigateway.LambdaIntegration(postsLambda);
    const anonymousMethodOptions: apigateway.MethodOptions = {
      authorizationType: apigateway.AuthorizationType.NONE,
      apiKeyRequired: false
    };
    const corsOptions: apigateway.CorsOptions = {
      allowOrigins: apigateway.Cors.ALL_ORIGINS,
      allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      allowMethods: apigateway.Cors.ALL_METHODS
    };

    apiPosts.addMethod('GET', postsIntegration, anonymousMethodOptions);
    apiPosts.addMethod('POST', postsIntegration);
    apiPremiumPosts.addMethod('POST', postsIntegration);
    apiPostById.addMethod('GET', postsIntegration, anonymousMethodOptions);
    apiPostById.addMethod('PUT', postsIntegration);
    apiPostById.addMethod('DELETE', postsIntegration);
    apiRegister.addMethod('POST', postsIntegration, anonymousMethodOptions);
    apiLogin.addMethod('POST', postsIntegration, anonymousMethodOptions);

    new CfnOutput(this, 'ApiBaseUrl', {
      value: api.url,
      description: 'Base URL for the blog API'
    });
  }
}
