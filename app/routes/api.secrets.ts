import { json, type LoaderFunction } from '@remix-run/cloudflare';

export const loader: LoaderFunction = async ({ request, context }) => { // Access the context object
  const githubToken = context.cloudflare.env.GITHUB_TOKEN;

  console.log('REQUEST: ', request.headers.get('cookie'));

  const response = await fetch('https://workflows.devop.sdlc.app.cbrands.com/api/v1/events/enterprise-tool-flow-dev/zip', {
    method: 'POST',
    headers: {
      cookie: request.headers.get('cookie'),
    },
    body: JSON.stringify({
      zipfile_name: 'code.zip',
    })
  })

  console.log('RESPONSE', response.status.toString());


  return json({
    githubToken: githubToken || 'undefined',
  });
};
