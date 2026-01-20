import AsyncStorage from "@react-native-async-storage/async-storage";

export interface PersistedSession {
  sessionId: string;
  bookSlug: string;
  bookTitle: string;
}

const SESSION_KEY = "native-book-companion.session";
const COMPANION_BOOK_KEY = "native-book-companion.companionBook";

export async function loadPersistedSession(): Promise<PersistedSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedSession;
  } catch {
    return null;
  }
}

export async function persistSession(session: PersistedSession): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function clearPersistedSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}

export async function loadCompanionBookSlug(): Promise<string | null> {
  return AsyncStorage.getItem(COMPANION_BOOK_KEY);
}

export async function persistCompanionBookSlug(slug: string): Promise<void> {
  await AsyncStorage.setItem(COMPANION_BOOK_KEY, slug);
}

export async function clearCompanionBookSlug(): Promise<void> {
  await AsyncStorage.removeItem(COMPANION_BOOK_KEY);
}
