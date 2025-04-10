import * as AWS from '@aws-sdk/client-s3';

export async function uploadZipToS3(zipFileBase64: string, bucketName: string, s3Key: string): Promise<void> {
  try {
    const response = await fetch('/api/aws-credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        zipFileBase64,
        bucketName,
        s3Key,
      }),
    });

    console.log(`Successfully uploaded zip to s3://${bucketName}/${s3Key}`);
  } catch (error) {
    console.error('Error uploading file:', error);
  }
}

