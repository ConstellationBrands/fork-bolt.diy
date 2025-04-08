import { json, type LoaderFunction } from '@remix-run/cloudflare';

export const loader: LoaderFunction = async ({ context }) => { 
  try {
    const credentials = {
      accessKeyId: context.cloudflare.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: context.cloudflare.env.AWS_SECRET_ACCESS_KEY,
    }
    return json(credentials);
  } catch (error) {
    console.error('Error accessing credentials', error);
    return json({error: 'Error accessing credentials'}, { status: 500 });
  }
};
