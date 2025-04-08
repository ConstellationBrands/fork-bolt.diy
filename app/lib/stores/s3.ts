import * as AWS from '@aws-sdk/client-s3';

export async function uploadZipToS3(zipFileBase64: string, bucketName: string, s3Key: string): Promise<void> {
  try {
    const buffer = Buffer.from(zipFileBase64, 'base64');

    const s3 = new AWS.S3Client({
      region: 'us-east-1',
    })

    await s3.send(
      new AWS.PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: buffer,
      })
    );
    console.log(`Successfully uploaded zip to s3://${bucketName}/${s3Key}`);
  } catch (error) {
    console.error('Error uploading file:', error);
  }
}

