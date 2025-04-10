import * as AWS from '@aws-sdk/client-s3';
import { toast } from 'react-toastify';

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

    const jsonData = await response.json();
    const status = jsonData.success;

    if (status === true) {
      console.log(`Successfully uploaded zip to s3://${bucketName}/${s3Key}`);
      toast.success('Success, your preview will be ready in a moment... ')
    } else {
      toast.error('Failure generating preview, please try again...')
      throw new Error('Failure uploading')

    }


  } catch (error) {
    console.error('Error uploading file:', error);
  }
}

