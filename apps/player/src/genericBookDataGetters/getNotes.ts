import { bookDataLoader } from "@player/services/bookDataLoader";

export type Note = { id: string; content: string };

let cachedNotes: Note[] | null = null;

export const getNotes = (): Note[] => {
  if (!cachedNotes) {
    throw new Error("Notes not loaded. Call loadNotes() first.");
  }
  return cachedNotes;
};

export const loadNotes = async (): Promise<Note[]> => {
  if (!cachedNotes) {
    cachedNotes = await bookDataLoader.getNotes();
  }
  return cachedNotes;
};

export const reloadNotes = async (): Promise<void> => {
  cachedNotes = await bookDataLoader.getNotes();
};

export const clearNotesCache = () => {
  cachedNotes = null;
};

// For live mode: directly inject notes into cache
export const setNotesCache = (value: Note[]) => {
  cachedNotes = value;
};
