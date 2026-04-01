import type { JSONValue, Message } from 'ai';
import { useCallback, useRef, useState } from 'react';
import { EnhancedStreamingMessageParser } from '~/lib/runtime/enhanced-message-parser';
import { workbenchStore } from '~/lib/stores/workbench';
import type { SegmentsGroupAnnotation } from '~/types/context';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useMessageParser');

const messageParser = new EnhancedStreamingMessageParser({
  callbacks: {
    onArtifactOpen: (data) => {
      logger.info('[DEBUG] onArtifactOpen', data);

      workbenchStore.showWorkbench.set(true);
      workbenchStore.addArtifact(data);
    },
    onArtifactClose: (data) => {
      logger.info('[DEBUG] onArtifactClose', data.artifactId);

      workbenchStore.updateArtifact(data, { closed: true });

      // Reset file modification tracking once after all files in the artifact are written,
      // rather than after each individual file write (which triggered a store update per file).
      workbenchStore.resetAllFileModifications();
    },
    onActionOpen: (data) => {
      logger.info('[DEBUG] onActionOpen', data.action.type, 'type' in data.action && data.action.type === 'file' ? (data.action as any).filePath : '');

      /*
       * File actions are streamed, so we add them immediately to show progress
       * Shell actions are complete when created by enhanced parser, so we wait for close
       */
      if (data.action.type === 'file') {
        workbenchStore.addAction(data);
      }
    },
    onActionClose: (data) => {
      logger.info('[DEBUG] onActionClose', data.action.type, 'type' in data.action && data.action.type === 'file' ? (data.action as any).filePath : '');

      /*
       * Add non-file actions (shell, build, start, etc.) when they close
       * Enhanced parser creates complete shell actions, so they're ready to execute
       */
      if (data.action.type !== 'file') {
        workbenchStore.addAction(data);
      }

      workbenchStore.runAction(data);
    },
    onActionStream: (data) => {
      logger.trace('onActionStream', data.action);
      workbenchStore.runAction(data, true);
    },
  },
});
const extractTextContent = (message: Message) => {
  if (!message?.content) {
    return '';
  }

  const raw = Array.isArray(message.content)
    ? (message.content.find((item) => item.type === 'text')?.text as string) || ''
    : message.content;

  /*
   * Some models (e.g. reasoning models served via OpenAI-compatible APIs like IDSGPT)
   * emit thinking tokens inline as <think>...</think> text in the stream rather than
   * as separate Vercel AI SDK reasoning parts (g: chunks).
   *
   * Two problems arise:
   * 1. The thinking text often contains bolt tag *mentions* (e.g. "I'll use <boltArtifact>
   *    to wrap the file") which confuse the parser into entering a broken artifact state,
   *    so the real artifact that follows is never detected.
   * 2. Some models place the *actual* <boltArtifact> block inside the <think> block and
   *    add a short confirmation ("Your app is ready!") after </think>. Stripping the whole
   *    block removes the artifact entirely — files are never written.
   *
   * Fix: for complete <think> blocks, extract any real <boltArtifact> tags and keep them;
   * discard everything else in the block. For an unclosed block (still streaming in), strip
   * from <think> to end of string — it will be re-evaluated once </think> arrives.
   */
  const cleaned = raw
    .replace(/<think>([\s\S]*?)<\/think>/g, (_match, thinkContent: string) => {
      // Hoist any complete boltArtifact blocks out of the think block so the parser
      // can process them. Non-artifact thinking text is discarded.
      const artifacts = thinkContent.match(/<boltArtifact[\s\S]*?<\/boltArtifact>/g);
      return artifacts ? artifacts.join('\n') : '';
    })
    .replace(/<think>[\s\S]*$/, ''); // unclosed block still streaming in — strip for now

  return cleaned;
};

const segmentsGroupIdFromAnnotation = (annotation: JSONValue): string | null => {
  if (annotation && typeof annotation === 'object' && 'type' in annotation && annotation.type === 'segmentsGroup') {
    return (annotation as SegmentsGroupAnnotation).segmentsGroupId;
  }

  return null;
};

export function useMessageParser() {
  const [parsedMessages, setParsedMessages] = useState<{ [key: number]: string }>({});

  /*
   * Track the last content fed to messageParser.parse() per message ID so we
   * can skip re-parsing historical messages that haven't changed. Without this,
   * every 100 ms cycle re-processes the entire conversation history even though
   * only the last (streaming) message is changing, causing UI jank that grows
   * linearly with conversation length.
   */
  const lastParsedContent = useRef<Record<string, string>>({});

  const parseMessages = useCallback((messages: Message[], isLoading: boolean) => {
    let reset = false;

    // Inform the parser whether we are currently streaming so it can skip
    // the expensive code-block detection pass during live streaming.
    messageParser.setStreaming(isLoading);

    if (import.meta.env.DEV && !isLoading) {
      reset = true;
      messageParser.reset();
      lastParsedContent.current = {};
    }

    const messageContents: Record<number, string> = {};
    const segmentGroups: Record<string, { firstGroupIndex: number }> = {};

    for (const [index, message] of messages.entries()) {
      if (message.role === 'user') {
        messageContents[index] = extractTextContent(message);
      } else if (message.role === 'assistant') {
        const segmentsGroupId = message.annotations?.reduce(
          (groupId: string | null, a) => groupId ?? segmentsGroupIdFromAnnotation(a),
          null,
        );

        if (!segmentsGroupId) {
          messageContents[index] = extractTextContent(message);
        } else {
          const firstIndex = segmentGroups[segmentsGroupId]?.firstGroupIndex;

          if (firstIndex === undefined) {
            segmentGroups[segmentsGroupId] = { firstGroupIndex: index };
            messageContents[index] = extractTextContent(message);
          } else {
            messageContents[firstIndex] += extractTextContent(message);
          }
        }
      }
    }

    for (const [index, message] of messages.entries()) {
      if (message.role === 'assistant' || message.role === 'user') {
        const content = messageContents[index];

        if (content !== undefined) {
          // Skip messages whose content hasn't changed — their parser state is already up to date
          if (!reset && lastParsedContent.current[message.id] === content) {
            continue;
          }

          lastParsedContent.current[message.id] = content;

          const newParsedContent = messageParser.parse(message.id, content);
          setParsedMessages((prevParsed) => ({
            ...prevParsed,
            [index]: !reset ? (prevParsed[index] || '') + newParsedContent : newParsedContent,
          }));
        }
      }
    }
  }, []);

  return { parsedMessages, parseMessages };
}
