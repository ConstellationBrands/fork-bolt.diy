import type { JSONValue, Message } from 'ai';
import { useCallback, useState } from 'react';
import { EnhancedStreamingMessageParser } from '~/lib/runtime/enhanced-message-parser';
import { workbenchStore } from '~/lib/stores/workbench';
import type { SegmentsGroupAnnotation } from '~/types/context';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useMessageParser');

const messageParser = new EnhancedStreamingMessageParser({
  callbacks: {
    onArtifactOpen: (data) => {
      logger.trace('onArtifactOpen', data);

      workbenchStore.showWorkbench.set(true);
      workbenchStore.addArtifact(data);
    },
    onArtifactClose: (data) => {
      logger.trace('onArtifactClose');

      workbenchStore.updateArtifact(data, { closed: true });
    },
    onActionOpen: (data) => {
      logger.trace('onActionOpen', data.action);

      /*
       * File actions are streamed, so we add them immediately to show progress
       * Shell actions are complete when created by enhanced parser, so we wait for close
       */
      if (data.action.type === 'file') {
        workbenchStore.addAction(data);
      }
    },
    onActionClose: (data) => {
      logger.trace('onActionClose', data.action);

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
const extractTextContent = (message: Message) =>
  Array.isArray(message.content)
    ? (message.content.find((item) => item.type === 'text')?.text as string) || ''
    : message.content;

const segmentsGroupIdFromAnnotation = (annotation: JSONValue): string | null => {
  if (annotation && typeof annotation === 'object' && 'type' in annotation && annotation.type === 'segmentsGroup') {
    return (annotation as SegmentsGroupAnnotation).segmentsGroupId;
  }

  return null;
};

export function useMessageParser() {
  const [parsedMessages, setParsedMessages] = useState<{ [key: number]: string }>({});

  const parseMessages = useCallback((messages: Message[], isLoading: boolean) => {
    let reset = false;

    if (import.meta.env.DEV && !isLoading) {
      reset = true;
      messageParser.reset();
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
