import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';

export const meta: MetaFunction = () => {
  return [
    { title: 'Bolt.idsGPT' },
    {
      name: 'description',
      content: 'Talk with Bolt.idsGPT, an AI coding assistant from StackBlitz and customize by IDS!',
    },
  ];
};

export const loader = () => json({});

function HomeShellFallback() {
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
      <div className="w-full max-w-chat rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-5 text-sm text-bolt-elements-textSecondary">
          Preparing the coding workspace. The prompt box will become interactive as soon as the chat shell is ready.
        </div>
      </div>
    </main>
  );
}

/**
 * Landing page component for Bolt
 * Note: Settings functionality should ONLY be accessed through the sidebar menu.
 * Do not add settings button/panel to this landing page as it was intentionally removed
 * to keep the UI clean and consistent with the design system.
 */
export default function Index() {
  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <BackgroundRays />
      <Header />
      <ClientOnly fallback={<HomeShellFallback />}>{() => <Chat />}</ClientOnly>
    </div>
  );
}
