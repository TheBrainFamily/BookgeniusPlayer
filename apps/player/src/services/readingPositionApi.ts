import { getPlatformId } from "@player/utils/getPlatformId";
import { getBookData } from "@player/state/bookDataStore";
import { getBookFromUrl } from "@player/getBookFromUrl";

export interface SavePositionInput {
  platformId: string;
  bookSlug: string;
  chapter: number;
  paragraph: number;
  progress?: number | null;
  source?: string | null;
}

export interface ReadingPosition {
  id: string;
  userId: string;
  platformId: string;
  bookSlug: string;
  chapter: number;
  paragraph: number;
  progress: number | null;
  source: string | null;
  createdAt: number;
}

/**
 * Build fetch options with credentials (cookie-based auth)
 */
const buildFetchOptions = (method: string, body?: object): RequestInit => {
  const options: RequestInit = { method, credentials: "include", headers: { "Content-Type": "application/json" } };

  if (body) {
    options.body = JSON.stringify(body);
  }

  return options;
};

/**
 * Save a reading position
 */
export const savePosition = async (input: SavePositionInput): Promise<ReadingPosition> => {
  const response = await fetch("/api/reading-position", buildFetchOptions("POST", input));

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      console.warn("Reading position save unauthorized; disabling remote sync for this session");
      throw new Error("Unauthorized");
    }
    throw new Error(`Failed to save position: ${response.status}`);
  }

  return response.json();
};

/**
 * Get the latest reading position for a book
 */
export const getLatestPosition = async (platformId: string, bookSlug: string): Promise<ReadingPosition | null> => {
  const params = new URLSearchParams({ platformId, bookSlug });

  const response = await fetch(`/api/reading-position?${params.toString()}`, buildFetchOptions("GET"));

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      console.warn("Reading position fetch unauthorized; using local only");
      return null;
    }
    if (response.status === 404) {
      return null;
    }
    throw new Error(`Failed to fetch latest position: ${response.status}`);
  }

  return response.json();
};

/**
 * Get reading position history for a book
 */
export const getPositionHistory = async (platformId: string, bookSlug: string, limit: number = 20): Promise<ReadingPosition[]> => {
  const params = new URLSearchParams({ platformId, bookSlug, limit: limit.toString() });

  const response = await fetch(`/api/reading-position/history?${params.toString()}`, buildFetchOptions("GET"));

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      console.warn("Reading position history unauthorized");
      return [];
    }
    throw new Error(`Failed to fetch position history: ${response.status}`);
  }

  return response.json();
};

/**
 * Promote a position to be the current furthest position
 */
export const promotePosition = async (id: string): Promise<ReadingPosition> => {
  const response = await fetch(`/api/reading-position/${id}/promote`, buildFetchOptions("POST"));

  if (!response.ok) {
    throw new Error(`Failed to promote position: ${response.status}`);
  }

  return response.json();
};

/**
 * Delete a reading position
 */
export const deletePosition = async (id: string): Promise<void> => {
  const response = await fetch(`/api/reading-position/${id}`, buildFetchOptions("DELETE"));

  if (!response.ok) {
    throw new Error(`Failed to delete position: ${response.status}`);
  }
};

/**
 * Helper to get current platform and book for convenience
 */
export const getCurrentPlatformAndBook = (): { platformId: string; bookSlug: string } => {
  const platformId = getPlatformId();

  const bookSlug = getBookFromUrl();

  return { platformId, bookSlug };
};
