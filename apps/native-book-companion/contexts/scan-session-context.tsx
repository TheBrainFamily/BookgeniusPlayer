import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  clearCompanionBookSlug,
  clearPersistedSession,
  loadCompanionBookSlug,
  loadPersistedSession,
  persistCompanionBookSlug,
  persistSession,
  type PersistedSession,
} from "@/lib/storage";
import { getBookSession, startScanSession, type BookSessionResponse } from "@/lib/pipeline";

export interface ResumeState {
  bookSlug: string;
  bookTitle: string;
  lastPageIndex: number;
  processedChapters: number[];
}

interface ScanSessionContextValue {
  isCheckingSession: boolean;
  resumeState: ResumeState | null;
  hasActiveSession: boolean;
  sessionId: string | null;
  currentBookSlug: string | null;
  currentBookTitle: string | null;
  startingPageIndex: number;
  processedChapters: number[];
  companionBookSlug: string | null;
  selectedChapterNumber: number;
  selectedPage: number;
  setSelectedChapterNumber: (chapter: number) => void;
  setSelectedPage: (page: number) => void;
  startNewSession: (bookTitle: string) => Promise<void>;
  resumeSession: () => void;
  clearSessionAndPersistence: () => Promise<void>;
  setCompanionBookSlug: (slug: string) => Promise<void>;
  refreshResumeState: () => Promise<void>;
}

const ScanSessionContext = createContext<ScanSessionContextValue | null>(null);

function toResumeState(session: BookSessionResponse): ResumeState {
  return {
    bookSlug: session.bookSlug,
    bookTitle: session.bookTitle,
    lastPageIndex: session.lastPageIndex,
    processedChapters: session.processedChapters,
  };
}

export function ScanSessionProvider({ children }: { children: React.ReactNode }) {
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [resumeState, setResumeState] = useState<ResumeState | null>(null);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentBookSlug, setCurrentBookSlug] = useState<string | null>(null);
  const [currentBookTitle, setCurrentBookTitle] = useState<string | null>(null);
  const [startingPageIndex, setStartingPageIndex] = useState(1);
  const [processedChapters, setProcessedChapters] = useState<number[]>([]);
  const [companionBookSlug, setCompanionBookSlugState] = useState<string | null>(null);
  const [selectedChapterNumber, setSelectedChapterNumber] = useState(1);
  const [selectedPage, setSelectedPage] = useState(1);

  const hydrateCompanionBookSlug = useCallback(async () => {
    const stored = await loadCompanionBookSlug();
    if (stored) {
      setCompanionBookSlugState(stored);
    }
  }, []);

  const refreshResumeState = useCallback(async () => {
    setIsCheckingSession(true);
    try {
      const persisted = await loadPersistedSession();
      if (!persisted) {
        setResumeState(null);
        return;
      }

      const session = await getBookSession(persisted.bookSlug);
      if (session.status === "completed") {
        await clearPersistedSession();
        setResumeState(null);
        return;
      }

      setResumeState(toResumeState(session));
      setCurrentBookSlug(session.bookSlug);
      setCurrentBookTitle(session.bookTitle);
      setSessionId(session.sessionId);
      setProcessedChapters(session.processedChapters);
      setCompanionBookSlugState(session.bookSlug);
      await persistCompanionBookSlug(session.bookSlug);
    } catch {
      await clearPersistedSession();
      setResumeState(null);
    } finally {
      setIsCheckingSession(false);
    }
  }, []);

  useEffect(() => {
    hydrateCompanionBookSlug();
  }, [hydrateCompanionBookSlug]);

  useEffect(() => {
    refreshResumeState();
  }, [refreshResumeState]);

  const startNewSession = useCallback(async (bookTitle: string) => {
    const response = await startScanSession(bookTitle);
    const session: PersistedSession = {
      sessionId: response.sessionId,
      bookSlug: response.bookSlug,
      bookTitle,
    };

    await persistSession(session);
    setHasActiveSession(true);
    setSessionId(response.sessionId);
    setCurrentBookSlug(response.bookSlug);
    setCurrentBookTitle(bookTitle);
    setStartingPageIndex(1);
    setProcessedChapters([]);
    setResumeState(null);
    setCompanionBookSlugState(response.bookSlug);
    await persistCompanionBookSlug(response.bookSlug);
  }, []);

  const resumeSession = useCallback(() => {
    if (!resumeState) return;
    setHasActiveSession(true);
    setStartingPageIndex(resumeState.lastPageIndex + 1);
    setCurrentBookSlug(resumeState.bookSlug);
    setCurrentBookTitle(resumeState.bookTitle);
    setProcessedChapters(resumeState.processedChapters);
    setResumeState(null);
  }, [resumeState]);

  const clearSessionAndPersistence = useCallback(async () => {
    await clearPersistedSession();
    setHasActiveSession(false);
    setResumeState(null);
    setSessionId(null);
    setCurrentBookSlug(null);
    setCurrentBookTitle(null);
    setStartingPageIndex(1);
    setProcessedChapters([]);
  }, []);

  const setCompanionBookSlug = useCallback(async (slug: string) => {
    setCompanionBookSlugState(slug);
    await persistCompanionBookSlug(slug);
  }, []);

  const value = useMemo<ScanSessionContextValue>(
    () => ({
      isCheckingSession,
      resumeState,
      hasActiveSession,
      sessionId,
      currentBookSlug,
      currentBookTitle,
      startingPageIndex,
      processedChapters,
      companionBookSlug,
      selectedChapterNumber,
      selectedPage,
      setSelectedChapterNumber,
      setSelectedPage,
      startNewSession,
      resumeSession,
      clearSessionAndPersistence,
      setCompanionBookSlug,
      refreshResumeState,
    }),
    [
      isCheckingSession,
      resumeState,
      hasActiveSession,
      sessionId,
      currentBookSlug,
      currentBookTitle,
      startingPageIndex,
      processedChapters,
      companionBookSlug,
      selectedChapterNumber,
      selectedPage,
      startNewSession,
      resumeSession,
      clearSessionAndPersistence,
      setCompanionBookSlug,
      refreshResumeState,
    ],
  );

  return <ScanSessionContext.Provider value={value}>{children}</ScanSessionContext.Provider>;
}

export function useScanSession() {
  const context = useContext(ScanSessionContext);
  if (!context) {
    throw new Error("useScanSession must be used within ScanSessionProvider");
  }
  return context;
}
