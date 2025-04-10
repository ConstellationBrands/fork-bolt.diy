import { json, type ActionFunction  } from '@remix-run/cloudflare';
import * as AWS from '@aws-sdk/client-s3';
import { STSClient, AssumeRoleWithWebIdentityCommand } from '@aws-sdk/client-sts';


// Function to get the current token from the sidecar
async function getCurrentToken() {
  try {
    // In Cloudflare Workers, you'd use fetch instead of requiring a module
    const response = await fetch("http://token-provider.sandbox.svc.cluster.local:80/token");
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

export const action: ActionFunction  = async ({request, context}) => {

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const { zipFileBase64, bucketName, s3Key } = await request.json();

  let credentials;
  const token = await getCurrentToken();
  console.log(`AWS TOKEN: ${token}`)

  credentials = await getTemporaryCredentials(
    context.cloudflare.env.AWS_ROLE_ARN,
    token
  );
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
    })
  );
 
};
 