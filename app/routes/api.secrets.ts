import { json, type LoaderFunction } from '@remix-run/cloudflare';

export const loader: LoaderFunction = async ({ request, context }) => { // Access the context object
  const githubToken = context.cloudflare.env.GITHUB_TOKEN;

  console.log('REQUEST: ', request.headers.get('cookie'));


  return json({
    githubToken: githubToken || 'undefined',
  });
};
