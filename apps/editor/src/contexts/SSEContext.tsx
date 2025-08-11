import React, { createContext, useContext, useEffect } from 'react';
import {useBooksStore} from "../stores/booksStore.ts";

const SSEContext = createContext<EventSource | null>(null);

export const SSEProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentBook } = useBooksStore();
  const [eventSource, setEventSource] = React.useState<EventSource | null>(null);

  useEffect(() => {
    if (!currentBook) return;
    
    const source = new EventSource(`http://localhost:3000/api/text-editor/sse/book-updates?book=${currentBook}`);
    
    source.onerror = (error) => {
      console.error('[SSE] Connection error:', error);
    };

    setEventSource(source);

    return () => {
      source.close();
    };
  }, [currentBook]);

  return (
    <SSEContext.Provider value={eventSource}>
      {children}
    </SSEContext.Provider>
  );
};

export const useSSE = () => {
  return useContext(SSEContext);
};