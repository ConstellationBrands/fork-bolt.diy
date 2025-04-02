import { json, type LoaderFunction } from '@remix-run/cloudflare';

export const loader: LoaderFunction = async ({ context }) => { // Access the context object
  const githubToken = context.cloudflare.env.GITHUB_TOKEN;

  return json({
    githubToken: githubToken || 'undefined',
  });
};
