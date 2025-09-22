import { bookDataLoader } from "@player/services/bookDataLoader";

// Function to determine if we're running locally or in production
function isDevelopment(): boolean {
  if (typeof window === "undefined") return true; // SSR case defaults to dev
  const hostname = window.location.hostname;
  return hostname.includes("localhost") || hostname.includes("127.0.0.1") || hostname.includes("192.168.");
}

// Base URLs that adapt to the environment
export const DEV_SERVER_URL = `https://${bookDataLoader
  .getCurrentBook()
  ?.replace(/[^a-zA-Z0-9]/g, "")
  .toLowerCase()}.bookgenius.net/`;
const DEV_WS_URL = "ws://192.168.1.26:3000";

// export const ANSWERS_SERVER_URL = "http://localhost:30310";
export const ANSWERS_SERVER_URL = `https://questions.bookgenius.net`;
// In production, use relative URLs that will point to the same domain

// export const QUESTIONS_SERVER_URL = isDevelopment() ? `${DEV_SERVER_URL}/api` : ANSWER_SERVER_URL;

export const QUESTIONS_SERVER_WS_URL = isDevelopment() ? DEV_WS_URL : `ws${window.location.protocol === "https:" ? "s" : ""}://${window.location.host}/ws`;
