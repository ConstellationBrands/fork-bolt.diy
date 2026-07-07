import type { ActionAlert } from '~/types/actions';

export const ARCHITECT_NAME = 'Architect';

type ArchitectIssue = {
  id: string;
  title: string;
  source: ActionAlert['source'] | 'any';
  patterns: RegExp[];
  maxAutoAttempts: number;
  guidance: string[];
};

export type ArchitectDiagnosis = {
  issueId: string;
  title: string;
  fingerprint: string;
  maxAutoAttempts: number;
  guidance: string[];
  matchedPattern: string;
};

export type ArchitectAutoHealDecision = {
  shouldAutoHeal: boolean;
  reason: 'allowed' | 'attempt-limit';
  maxAutoAttempts: number;
};

const ARCHITECT_KNOWLEDGE_BASE: ArchitectIssue[] = [
  // ── Preview: runtime exceptions (framework-agnostic) ─────────────────────
  {
    id: 'preview-runtime-exception',
    title: 'Preview runtime exception',
    source: 'preview',
    patterns: [
      /PREVIEW_UNCAUGHT_EXCEPTION/i,
      /PREVIEW_UNHANDLED_REJECTION/i,
      /Uncaught\s+(?:Error|TypeError|ReferenceError|SyntaxError|RangeError)/i,
      /Unhandled\s+Promise\s+Rejection/i,
    ],
    maxAutoAttempts: 2,
    guidance: [
      'Inspect the preview/runtime error and identify the exact file, import, or state transition that caused it.',
      'Apply the smallest code fix that removes the runtime exception without rewriting unrelated parts of the app.',
      'Restart or refresh the preview if needed and verify that the app renders instead of showing the runtime error again.',
      'If a dependency or environment variable is missing, add the minimum safe fallback and report what changed.',
    ],
  },

  // ── Next.js specific ─────────────────────────────────────────────────────
  {
    id: 'nextjs-module-not-found',
    title: 'Next.js module not found',
    source: 'terminal',
    patterns: [
      /Module not found: Can't resolve ['"][^'"]+['"]/i,
      /Module not found: Error: Can't resolve/i,
    ],
    maxAutoAttempts: 2,
    guidance: [
      'Identify the missing module from the error message.',
      'If it is an npm package, install it with pnpm and verify the import path matches the package entry point.',
      'If it is a local file, fix the import path — check casing (Next.js is case-sensitive on Linux).',
      'Run the dev server again and confirm the error is gone.',
    ],
  },
  {
    id: 'nextjs-hydration-error',
    title: 'Next.js hydration mismatch',
    source: 'preview',
    patterns: [
      /Text content does not match server-rendered HTML/i,
      /Hydration failed because the initial UI does not match/i,
      /There was an error while hydrating/i,
      /did not match\. Server:/i,
    ],
    maxAutoAttempts: 2,
    guidance: [
      'Find the component where the server-rendered HTML differs from the client render.',
      'Common causes: Date.now(), Math.random(), window/document access during SSR, or browser-only APIs without a guard.',
      'Wrap browser-only code in a useEffect or add a typeof window !== "undefined" guard.',
      'If the component must be client-only, add the "use client" directive at the top of the file.',
      'Verify the fix by reloading — the hydration warning should be gone.',
    ],
  },
  {
    id: 'nextjs-build-failed',
    title: 'Next.js build optimization failed',
    source: 'terminal',
    patterns: [
      /Build optimization failed/i,
      /Export encountered errors on following paths/i,
      /Error occurred prerendering page/i,
    ],
    maxAutoAttempts: 2,
    guidance: [
      'Read the full build error to identify which page or route failed.',
      'Common causes: missing environment variables at build time, broken imports, or attempting to use browser APIs during static generation.',
      'Fix the identified file — add fallbacks for missing env vars or move browser API calls behind typeof window checks.',
      'Re-run the build and confirm it completes without errors.',
    ],
  },
  {
    id: 'nextjs-missing-dot-next',
    title: 'Next.js .next build directory missing',
    source: 'terminal',
    patterns: [
      /ENOENT.*\.next/i,
      /Could not find a production build.*\.next/i,
      /please run `next build`/i,
    ],
    maxAutoAttempts: 1,
    guidance: [
      'Run `pnpm run build` to generate the .next directory before starting the production server.',
      'If you only need the dev server, use `pnpm run dev` instead.',
      'Verify the build completes successfully before retrying.',
    ],
  },
  {
    id: 'nextjs-invalid-page-export',
    title: 'Next.js invalid page export',
    source: 'terminal',
    patterns: [
      /The default export is not a React Component/i,
      /Page.*does not export a default component/i,
      /You can not use both.*getStaticProps.*getServerSideProps/i,
    ],
    maxAutoAttempts: 2,
    guidance: [
      'Ensure the page file exports a React component as the default export.',
      'Do not mix getStaticProps and getServerSideProps in the same page file.',
      'If using the App Router, ensure the component is either a Server Component (default) or marked with "use client".',
      'Fix the export and restart the dev server.',
    ],
  },

  // ── Terminal: generic (framework-agnostic) ────────────────────────────────
  {
    id: 'missing-package-manifest',
    title: 'Project manifest missing',
    source: 'terminal',
    patterns: [
      /ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND/i,
      /Could not read package\.json/i,
    ],
    maxAutoAttempts: 2,
    guidance: [
      'Ensure commands run inside the generated project directory before install/lint/build.',
      'Scaffold non-interactively when needed and avoid interactive prompts.',
      'Install dependencies with pnpm and verify package.json exists before lint/build.',
    ],
  },
  {
    id: 'interactive-cli-cancelled',
    title: 'Interactive CLI cancelled',
    source: 'terminal',
    patterns: [/Operation cancelled/i, /Operation canceled/i],
    maxAutoAttempts: 1,
    guidance: [
      'Re-run scaffolding in non-interactive mode.',
      'Prefer `pnpm dlx create-next-app ... --no-interactive` or pass all flags explicitly.',
      'Continue setup only after scaffold succeeds.',
    ],
  },
  {
    id: 'npm-spawn-enoent',
    title: 'npm executable missing in shell path',
    source: 'terminal',
    patterns: [/jsh:\s*spawn npm ENOENT/i, /spawn npm ENOENT/i],
    maxAutoAttempts: 2,
    guidance: [
      'Avoid npm-only flows when npm is unavailable in the shell path.',
      'Use pnpm alternatives (pnpm dlx, pnpm install, pnpm run dev).',
      'If npm is required, verify binary availability first with `which npm` and fall back safely.',
    ],
  },
  {
    id: 'escaped-shell-separators',
    title: 'Escaped shell separators',
    source: 'terminal',
    patterns: [/jsh:\s*;&\s*can only be used in a case clause/i, /&amp;&amp;/i],
    maxAutoAttempts: 1,
    guidance: [
      'Decode HTML-escaped shell separators (`&amp;&amp;` → `&&`) before execution.',
      'Re-run only the failed command chain after normalization.',
      'Verify the command exits cleanly before continuing.',
    ],
  },
  {
    id: 'json-command-envelope',
    title: 'JSON-wrapped shell command',
    source: 'terminal',
    patterns: [/no such file or directory:\s*\{command:/i, /Run shell command:\s*\{"command":/i],
    maxAutoAttempts: 1,
    guidance: [
      'Extract the plain shell command string from JSON wrappers ({"command":"..."}).',
      'Re-run the unwrapped command directly in the shell.',
      'Continue only after the unwrapped command exits successfully.',
    ],
  },

  // ── Vite specific (kept — harmless if unused) ─────────────────────────────
  {
    id: 'vite-import-not-found',
    title: 'Vite import resolution failure',
    source: 'preview',
    patterns: [/\[plugin:vite:import-analysis\]/i, /Failed to resolve import/i],
    maxAutoAttempts: 2,
    guidance: [
      'Find the missing package or file path referenced by Vite.',
      'If it is a package dependency, add it with pnpm and keep version compatible with current stack.',
      'If it is a local file path issue, correct the import path/casing and keep changes minimal.',
      'Re-run the app and verify preview loads cleanly.',
    ],
  },

  {
    id: 'blocked-shell-mutation',
    title: 'Shell file mutation blocked',
    source: 'terminal',
    patterns: [
      /Blocked Shell Mutation/i,
      /Shell[- ]based file mutation/i,
      /Shell redirection that writes to files/i,
    ],
    maxAutoAttempts: 2,
    guidance: [
      'Retry the same project change by emitting complete file actions instead of shell commands that write files.',
      'Do not use shell redirection, `echo >`, `cat >`, `tee`, `sed -i`, inline Node scripts, or inline Python scripts to create or edit project files.',
      'Use `<boltAction type="file" filePath="...">` with the full file contents for every code change.',
      'Use shell actions only for dependency install, build, test, or start commands after file actions are emitted.',
      'Continue from the current workspace and original request; do not re-scaffold unless the workspace is empty or unrecoverable.',
    ],
  },

  // ── Catch-all fallbacks (must stay last — only match if nothing above did) ─
  {
    id: 'generic-terminal-error',
    title: 'Terminal error',
    source: 'terminal',
    patterns: [/.+/s],
    maxAutoAttempts: 2,
    guidance: [
      'Read the full terminal error and identify the root cause.',
      'Apply the minimal fix needed to resolve the error — change only what is required.',
      'Re-run the failed command and verify it exits successfully.',
      'If a dependency is missing, install it with pnpm; if a file path is wrong, fix the import.',
    ],
  },
  {
    id: 'generic-preview-error',
    title: 'Preview error',
    source: 'preview',
    patterns: [/.+/s],
    maxAutoAttempts: 2,
    guidance: [
      'Inspect the preview/runtime error and identify the exact component or line that caused it.',
      'Apply the smallest code fix that removes the error without rewriting unrelated parts.',
      'Refresh the preview and verify the app renders without errors.',
    ],
  },
];

function buildFingerprint(input: string): string {
  let hash = 5381;

  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }

  return (hash >>> 0).toString(16);
}

function getAlertText(alert: ActionAlert): string {
  return [alert.title, alert.description, alert.content].filter(Boolean).join('\n').trim();
}

export function diagnoseArchitectIssue(alert: ActionAlert | null | undefined): ArchitectDiagnosis | null {
  if (!alert) {
    return null;
  }

  const text = getAlertText(alert);

  if (!text) {
    return null;
  }

  for (const issue of ARCHITECT_KNOWLEDGE_BASE) {
    // If the alert has no source set, skip the source filter (match any issue).
    // If it does have a source, require it to match (or issue accepts 'any').
    if (alert.source !== undefined && issue.source !== 'any' && issue.source !== alert.source) {
      continue;
    }

    const matched = issue.patterns.find((pattern) => pattern.test(text));

    if (!matched) {
      continue;
    }

    return {
      issueId: issue.id,
      title: issue.title,
      fingerprint: `${issue.id}:${buildFingerprint(`${alert.source || 'unknown'}:${text}`)}`,
      maxAutoAttempts: issue.maxAutoAttempts,
      guidance: issue.guidance,
      matchedPattern: matched.source,
    };
  }

  return null;
}

export function decideArchitectAutoHeal(options: {
  diagnosis: ArchitectDiagnosis;
  attemptsForFingerprint: number;
}): ArchitectAutoHealDecision {
  const { diagnosis, attemptsForFingerprint } = options;

  if (attemptsForFingerprint >= diagnosis.maxAutoAttempts) {
    return {
      shouldAutoHeal: false,
      reason: 'attempt-limit',
      maxAutoAttempts: diagnosis.maxAutoAttempts,
    };
  }

  return {
    shouldAutoHeal: true,
    reason: 'allowed',
    maxAutoAttempts: diagnosis.maxAutoAttempts,
  };
}

export function buildArchitectAutoHealPrompt(options: {
  alert: ActionAlert;
  diagnosis: ArchitectDiagnosis;
  attemptNumber: number;
}): string {
  const { alert, diagnosis, attemptNumber } = options;
  const errorBlock = [alert.description, alert.content].filter(Boolean).join('\n');
  const numberedGuidance = diagnosis.guidance.map((line, idx) => `${idx + 1}. ${line}`).join('\n');

  return [
    `[${ARCHITECT_NAME} Auto-Heal]`,
    `Attempt ${attemptNumber}/${diagnosis.maxAutoAttempts}.`,
    `Issue: ${diagnosis.title} (${diagnosis.issueId}).`,
    `Matched by: ${diagnosis.matchedPattern}`,
    '',
    'Error details:',
    '```',
    errorBlock,
    '```',
    '',
    'Execute a safe self-heal workflow now:',
    numberedGuidance,
    '',
    'Safety guardrails:',
    '- Operate only within /home/project.',
    '- Do not run destructive commands (no rm -rf outside project, no sudo, no credential changes).',
    '- Apply the smallest fix that unblocks the build/preview.',
    '- If a command fails, include command + exit code + stderr and do not claim success.',
    '- Verify the fix by rerunning the relevant command(s) and report clear pass/fail evidence.',
  ].join('\n');
}
