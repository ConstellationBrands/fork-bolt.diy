import { json, type ActionFunction } from '@remix-run/cloudflare';
import * as AWS from '@aws-sdk/client-s3';


export const action: ActionFunction = async ({ request, context }) => {
  try {

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }

    const { zipFileBase64, bucketName, s3Key } = await request.json();

    const buffer = Buffer.from(zipFileBase64, 'base64');
    const s3 = new AWS.S3Client({
      region: 'us-east-1',
      credentials: {
        accessKeyId: context.cloudflare.env.AWS_ACCESS_KEY,
        secretAccessKey: context.cloudflare.env.AWS_SECRET_ACCESS_KEY,
      },
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
    // Production  : https://workflows.devop.app.cbrands.com/api/v1/events/enterprise-tool-flow-prod/zip
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
