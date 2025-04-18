import { json, type ActionFunction } from '@remix-run/cloudflare';
import * as AWS from '@aws-sdk/client-s3';
import { STSClient, AssumeRoleWithWebIdentityCommand } from '@aws-sdk/client-sts';

// Function to get the current token from the sidecar
async function getCurrentToken(tokenService) {
  try {
    // In Cloudflare Workers, you'd use fetch instead of requiring a module
    console.log(`TOKEN SERVICE: ${tokenService}`);
    const response = await fetch(`${tokenService}/token`);
    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error('Error getting token:', error);
    throw new Error('Failed to get current token');
  }
}

async function getTemporaryCredentials(roleArn, webIdentityToken) {
  const stsClient = new STSClient({
    region: 'us-east-1',
  });

  const command = new AssumeRoleWithWebIdentityCommand({
    RoleArn: roleArn,
    RoleSessionName: 'cloudflare-worker-session',
    WebIdentityToken: webIdentityToken,
  });

  const response = await stsClient.send(command);

  return {
    accessKeyId: response.Credentials.AccessKeyId,
    secretAccessKey: response.Credentials.SecretAccessKey,
    sessionToken: response.Credentials.SessionToken,
    expiration: response.Credentials.Expiration,
  };
}

export const action: ActionFunction = async ({ request, context }) => {
  try {

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }

    const { zipFileBase64, bucketName, s3Key } = await request.json();

    let credentials;
    const tokenService = context.cloudflare.env.TOKEN_SERVICE_NAME;
    console.log(`TOKEN ENV VAR: ${tokenService}`);
    const token = await getCurrentToken(tokenService);
    console.log(`TOKEN: ${token}`);

    console.log('PRE SUBIDA');
    try {
      credentials = await getTemporaryCredentials(context.cloudflare.env.AWS_ROLE_ARN, token);
    } catch (error) {
      console.log('ERROR ', error);
    }
    console.log('POST TEMP CREDENTIALS');
    const buffer = Buffer.from(zipFileBase64, 'base64');
    const s3 = new AWS.S3Client({
      region: 'us-east-1',
      credentials,
    });

    await s3.send(
      new AWS.PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: buffer,
      }),
    );

    console.log('POST SUBIDA')

    // Sandbox/SDLC: https://workflows.devop.sdlc.app.cbrands.com/api/v1/events/enterprise-tool-flow-dev/zip
    const response = await fetch(context.cloudflare.env.ARGO_WORKFLOW_ENDPOINT, {
      method: 'POST',
      headers: {
        cookie: request.headers.get('cookie'),
      },
      body: JSON.stringify({
        zipfile_name: s3Key,
        bucket_name: context.cloudflare.env.BUCKET_NAME,
      })
    })
  
    console.log('RESPONSE', response.status.toString());

    return { success: true };
  } catch (error) {
    return { success: false };
  }
};
