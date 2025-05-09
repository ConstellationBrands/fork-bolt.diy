import React from 'react';

const EXAMPLE_PROMPTS = [
  // { text: 'Create a mobile app about bolt.diy' },
  // { text: 'Build a todo app in React using Tailwind' },
  // { text: 'Build a simple blog using Astro' },
  // { text: 'Create a cookie consent form using Material UI' },
  // { text: 'Make a space invaders game' },
  // { text: 'Make a Tic Tac Toe game in html, css and js only' },
  {
    text: "Modern shopping website",
    fullPrompt: `Let's build a modern shopping website together. Here's what we need
    Project Setup

    IMPORTANT: Don't generate Vercel or Netlify related files for integration.
    IMPORTANT: Don't generate git related files.


      * Create a project with:
        * README.md (explaining how to run the project)
        * package.json (with React + Tailwind CSS)
        * Clean folder structure (components/, pages/, styles/)

    Key Pages

      * Homepage (feature products)
      * Product listing page (with filters)
      * Shopping cart (with real-time updates)

    UI/UX Rules

      * Mobile-friendly design first
      * Professional color scheme (mention if you want specific colors)
      * Smooth animations for cart/add-to-cart

    Technical Specs

      * Use Next.js for the framework
      * Tailwind CSS for styling
      * Fake product data (no backend needed yet)

    Workflow
      * Edit files directly (don't show code unless I ask)
      * Explain each major change before making it
      * Stop and ask if you get stuck after 3 attempts

     Start by creating the basic structure and homepage.
     ULTRA IMPORTANT: Check with me before adding complex features.

    `
  },
];

export function ExamplePrompts(sendMessage?: { (event: React.UIEvent, messageInput?: string): void | undefined }) {
  return (
    <div id="examples" className="relative flex flex-col gap-9 w-full max-w-3xl mx-auto flex justify-center mt-6">
      <div
        className="flex flex-wrap justify-center gap-2"
        style={{
          animation: '.25s ease-out 0s 1 _fade-and-move-in_g2ptj_1 forwards',
        }}
      >
        {EXAMPLE_PROMPTS.map((examplePrompt, index: number) => {
          return (
            <button
              key={index}
              onClick={(event) => {
                sendMessage?.(event, examplePrompt.fullPrompt);
              }}
              className="border border-bolt-elements-borderColor rounded-full bg-gray-50 hover:bg-gray-100 dark:bg-gray-950 dark:hover:bg-gray-900 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary px-3 py-1 text-xs transition-theme"
            >
              {examplePrompt.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
