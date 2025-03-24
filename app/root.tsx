import { useStore } from '@nanostores/react';
import type { LinksFunction } from '@remix-run/cloudflare';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from '@remix-run/react';
import tailwindReset from '@unocss/reset/tailwind-compat.css?url';
import { themeStore } from './lib/stores/theme';
import { stripIndents } from './utils/stripIndent';
import { createHead } from 'remix-island';
import { useEffect, useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ClientOnly } from 'remix-utils/client-only';

import reactToastifyStyles from 'react-toastify/dist/ReactToastify.css?url';
import globalStyles from './styles/index.scss?url';
import xtermStyles from '@xterm/xterm/css/xterm.css?url';

import 'virtual:uno.css';

export const links: LinksFunction = () => [
  {
    rel: 'icon',
    href: '/favicon.svg',
    type: 'image/svg+xml',
  },
  { rel: 'stylesheet', href: reactToastifyStyles },
  { rel: 'stylesheet', href: tailwindReset },
  { rel: 'stylesheet', href: globalStyles },
  { rel: 'stylesheet', href: xtermStyles },
  {
    rel: 'preconnect',
    href: 'https://fonts.googleapis.com',
  },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
];

const inlineThemeCode = stripIndents`
  setTutorialKitTheme();

  function setTutorialKitTheme() {
    let theme = localStorage.getItem('bolt_theme');

    if (!theme) {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    document.querySelector('html')?.setAttribute('data-theme', theme);
  }
`;

export const Head = createHead(() => (
  <>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <Meta />
    <Links />
    <script dangerouslySetInnerHTML={{ __html: inlineThemeCode }} />
  </>
));

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useStore(themeStore);

  useEffect(() => {
    document.querySelector('html')?.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <>
      <ClientOnly>{() => <DndProvider backend={HTML5Backend}>{children}</DndProvider>}</ClientOnly>
      <ScrollRestoration />
      <Scripts />
    </>
  );
}

import { logStore } from './lib/stores/logs';
import type { GitHubConnection, GitHubUserResponse } from '~/types/GitHub';
import Cookies from 'js-cookie';
import { toast } from 'react-toastify';
import { tokenStore } from '~/lib/stores/token';
import { connectionStore } from '~/lib/stores/connection';

// import { userLoader } from '@remix-run/react';

export default function App() {
  const theme = useStore(themeStore);
  const [connection, setConnection] = useState<GitHubConnection>({
    user: null,
    token: '',
    tokenType: 'classic',
  });

  const fetchGithubUser = async () => {
    try {
      const secretsResponse = await fetch('/api/secrets');
      const jsonData = await secretsResponse.json();

      const token = jsonData.githubToken;

      console.log(`EL TOKEN ${token}`);

      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Invalid token or unauthorized');
      }

      const data = (await response.json()) as GitHubUserResponse;
      const newConnection: GitHubConnection = {
        user: data,
        token,
        tokenType: connection.tokenType,
      };

      // localStorage.setItem('github_connection', JSON.stringify(newConnection));
      connectionStore.set(newConnection);
      // Cookies.set('githubToken', token);
      tokenStore.set(token);
      Cookies.set('githubUsername', data.login);
      // Cookies.set('git:github.com', JSON.stringify({ username: token, password: 'x-oauth-basic' }));

      setConnection(newConnection);
      toast.success('Successfully connected to GitHub');
    } catch (error) {
      logStore.logError('Failed to authenticate with GitHub', { error });
      toast.error('Failed to connect to GitHub');
      setConnection({ user: null, token: '', tokenType: 'classic' });
    } finally {
    }
  };

  useEffect(() => {
    logStore.logSystem('Application initialized', {
      theme,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    });
    fetchGithubUser();
  }, []);

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
