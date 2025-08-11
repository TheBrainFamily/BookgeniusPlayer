import { useEffect } from 'react';
import { useSSE } from '../contexts/SSEContext';

interface SSEHandlers {
  onParagraphSelected: (data: {
    bookId: string;
    chapterId: string;
    paragraphId: string | number;
    timestamp: string;
  }) => void;
}

export const useEditorSSE = ({ onParagraphSelected }: SSEHandlers) => {
  const eventSource = useSSE();

  useEffect(() => {
    if (!eventSource) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'paragraph-selected') {
          console.log('[Editor SSE] Paragraph selected:', {
            bookId: data.bookId,
            chapterId: data.chapterId,
            paragraphId: data.paragraphId,
            paragraphIdType: typeof data.paragraphId,
            timestamp: data.timestamp
          });

          setTimeout(() => {
            console.log(`[Editor] About to highlight paragraphId: ${data.paragraphId}`);
            onParagraphSelected(data);
          }, 100);
        }
      } catch (error) {
        console.error('Failed to parse SSE message data:', error);
      }
    };

    eventSource.addEventListener('message', handleMessage);

    return () => {
      eventSource.removeEventListener('message', handleMessage);
    };
  }, [eventSource, onParagraphSelected]);
};