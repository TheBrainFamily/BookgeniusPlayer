import { Platform } from "react-native";

const DEFAULT_PIPELINE_URL = "http://192.168.1.26:4000";

export const PIPELINE_URL =
  process.env.EXPO_PUBLIC_PIPELINE_URL ?? DEFAULT_PIPELINE_URL;

export interface StartSessionResponse {
  sessionId: string;
  bookSlug: string;
}

export interface BookSessionResponse {
  sessionId: string;
  bookSlug: string;
  bookTitle: string;
  status: string;
  lastPageIndex: number;
  processedChapters: number[];
  isProcessing: boolean;
}

export interface UploadPageResponse {
  pageIndex: number;
  ocrStatus: string;
}

export async function startScanSession(bookTitle: string): Promise<StartSessionResponse> {
  const response = await fetch(`${PIPELINE_URL}/api/scan/start-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bookTitle }),
  });

  if (!response.ok) {
    throw new Error("Failed to start session. Make sure the pipeline is running.");
  }

  return (await response.json()) as StartSessionResponse;
}

export async function getBookSession(bookSlug: string): Promise<BookSessionResponse> {
  const response = await fetch(`${PIPELINE_URL}/api/scan/book/${bookSlug}/session`);

  if (response.status === 404) {
    throw new Error("No active session found.");
  }

  if (!response.ok) {
    throw new Error("Failed to load session from the server.");
  }

  return (await response.json()) as BookSessionResponse;
}

export async function uploadScannedPage(options: {
  sessionId: string;
  bookSlug: string;
  pageIndex: number;
  imageUri: string;
  mimeType?: string;
}): Promise<UploadPageResponse> {
  const { sessionId, bookSlug, pageIndex, imageUri, mimeType } = options;
  const formData = new FormData();

  formData.append("sessionId", sessionId);
  formData.append("bookSlug", bookSlug);
  formData.append("pageIndex", String(pageIndex));

  const filename = `page-${pageIndex}.jpg`;
  formData.append("image", {
    uri: imageUri,
    name: filename,
    type: mimeType ?? (Platform.OS === "ios" ? "image/jpeg" : "image/jpg"),
  } as unknown as Blob);

  const response = await fetch(`${PIPELINE_URL}/api/scan/upload-page`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to upload page.");
  }

  return (await response.json()) as UploadPageResponse;
}
