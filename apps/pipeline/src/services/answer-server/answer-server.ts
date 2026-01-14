import "./instrument";
import * as Sentry from "@sentry/node";
import { logger } from "../../logger";
import { callDeepResearchGemini } from "../../callFastGemini";
import "dotenv/config";
import { getParagraphsFromChapterWithText } from "../../tools/getParagraphsFromChapterWithText";
import { getChaptersUpToWithChapters } from "../../helpers/getChaptersUpToWithChapters";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { cerebras } from "@ai-sdk/cerebras";
import { generateObject, type GenerateObjectResult } from "ai";
import { HttpError } from "./error-handler";
import { SECRET_KEY } from "./secretKey";
import { enforce } from "./helpers/enforce";
import { google } from "@ai-sdk/google";
import { handleGenerateRealtimeToken } from "./get-realtime-token-route";
import {
  getBookData,
  prefetch as prefetchBook,
  invalidate as invalidateBook,
  getCacheStats,
  prefetchAllBooks,
  type BookEmbeddings,
  type DocumentWithEmbeddings,
  type Document,
} from "./embeddingManager";
import type { Filter } from "./helpers/filters";
import { shouldAllowDocument } from "./helpers/filters";

export interface MessagePayload {
  query: string;
  filter: Filter;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function findBestPassages(
  query: string,
  documents: DocumentWithEmbeddings[],
  filter?: Filter,
  maxResults: number = 10,
  similarityThreshold: number = 0.75,
): Promise<(DocumentWithEmbeddings & { score: number })[]> {
  const embeddingResponse = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: [query],
    config: { taskType: "RETRIEVAL_QUERY" },
  });
  const embeddingValues = embeddingResponse.embeddings?.[0]?.values as number[];
  const queryEmbedding = { values: embeddingValues };

  console.log("[findBestPassages] filter:", JSON.stringify(filter));
  console.log("[findBestPassages] total documents:", documents.length);

  const filteredDocuments = documents.filter((doc: Document) => shouldAllowDocument(doc, filter));
  console.log("[findBestPassages] after filter:", filteredDocuments.length);

  if (filteredDocuments.length === 0) {
    console.log("[findBestPassages] no documents passed filter, returning empty");
    return [];
  }

  const dotProducts = filteredDocuments.map((doc) =>
    doc.Embeddings.reduce((sum, val, idx) => sum + val * queryEmbedding.values[idx], 0),
  );

  const indexedScores = dotProducts.map((score, index) => [index, score] as [number, number]);
  indexedScores.sort((a, b) => b[1] - a[1]);

  console.log("[findBestPassages] indexedScores[0]:", indexedScores[0]);
  if (indexedScores.length === 0) {
    return [];
  }
  const highestScore = indexedScores[0][1];

  const results: (DocumentWithEmbeddings & { score: number })[] = [];

  for (const [index, score] of indexedScores) {
    if (score >= highestScore * similarityThreshold && results.length < maxResults) {
      results.push({ ...filteredDocuments[index], score });
    }
    if (results.length >= maxResults) {
      break;
    }
  }

  return results;
}

function getQuestionAndBookText(query: string) {
  const splitted = query.split("The user is looking at the following text:");
  const question = splitted[0].trim();
  const bookText = splitted[1]?.trim();
  return { question, bookText };
}

function makePrompt(query: string, relevantPassage: string): string {
  const escaped = relevantPassage.replace(/['"\n]/g, " ");
  const { question, bookText } = getQuestionAndBookText(query);
  const prompt = `
You are a helpful and informative bot that answers questions using the provided Context and Current Passage the user is reading.

Respond in a concise, complete sentence, clearly and directly addressing the question. Only use information from the Context and the Current Passage.

<question>${question}</question>
<currentPassage>${bookText}</currentPassage>
<additionalContext>${escaped}</additionalContext>


If you dont have enough information to answer the question, return the {needMore: true, answer: ""} in the response.
If you have enough information to answer the question, return the {needMore: false, answer: "answer"} in the response.

Return a JSON object with keys in this exact order: needMore, answer.
Decide needMore first. If needMore is true, keep answer as an empty string.

`;
  console.log("prompt", prompt);
  return prompt;
}

const getEmbeedingQueriesForQuestion = async (question: string) => {
  const prompt = `
Given the user's question and context below, extract concise and specific key phrases or short queries that can be used to efficiently search through embeddings of the text. The queries should closely relate to the core intent and details needed to answer the question. Avoid overly general terms; focus on character names, actions, emotions, motives, and critical details.

Question with context:
"""
${question}
"""

Return the result as a JSON object with the following format:
{
  "queries": ["query1", "query2", ...]
}
`;

  const response = await generateObject({
    model: cerebras("llama-3.3-70b"),
    schema: z.object({ queries: z.array(z.string()) }),
    messages: [{ role: "user", content: `${prompt}` }],
  });

  return response.object.queries;
};

export const deepResearch = async (question: string, filter: Filter) => {
  const chapterTo = filter.chapterTo ?? 1;
  const xmlFiles = await getBookXmlFiles(filter.bookSlug.toLowerCase());
  if (!xmlFiles) {
    throw new Error(`Book text not found for book: ${filter.bookSlug}`);
  }
  const chaptersXmlString = xmlFiles.chapters;
  const chapters = getChaptersUpToWithChapters(1, chapterTo - 1, chaptersXmlString);
  const chaptersText = chapters.map((c) => `<chapter number="${c.number}">${c.content}</chapter>`);
  const bookText = xmlFiles.textWithParagraphs;
  const paragraphs = getParagraphsFromChapterWithText(chapterTo, bookText, true, true);
  console.log("paragraphs", paragraphs);
  const filteredParagraphs = paragraphs.filter(
    (p) => p.dataIndex <= (filter.paragraphTo as number),
  );
  console.log("filter", filter);
  const thingsToSendToResearch = [
    ...chaptersText,
    `<chapter number="${chapterTo}">${filteredParagraphs.map((p) => p.text).join("\n")}</chapter>`,
  ];
  const response = await callDeepResearchGemini(question, thingsToSendToResearch);
  return response;
};

async function getBookXmlFiles(
  bookName: string,
): Promise<{ chapters: string; textWithParagraphs: string }> {
  const bookData = await getBookData(bookName);
  return { chapters: bookData.chapters, textWithParagraphs: bookData.richXml };
}

async function getEmbeddings(bookName: string): Promise<BookEmbeddings> {
  const bookData = await getBookData(bookName);
  return bookData.embeddings;
}

const ALLOWED_ORIGINS = [
  /^http:\/\/localhost:5173$/,
  /^http:\/\/localhost:5174$/,
  /^http:\/\/localhost:8080$/,
  /^http:\/\/localhost:8081$/,
  /^https?:\/\/bookgenius\.(net|pl|eu)$/,
  /^https?:\/\/.*\.bookgenius\.(net|pl|eu)$/,
  /^https?:\/\/.*\.bookgeniusz\.pl$/,
  /^https?:\/\/bookgeniusz\.pl$/,
  /^https?:\/\/.*\.bookgenius\.snapplify\.(com)$/,
  /^https?:\/\/bookgenius\.snapplify\.(com)$/,
];

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true;
  return ALLOWED_ORIGINS.some((pattern) => pattern.test(origin));
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, x-dev-token, x-secret-pass, x-local-pass, x-user-email, x-viewer-host, host, cookie, cf-clearance, sentry-trace, baggage",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
  if (origin && isOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key) {
      cookies[key] = valueParts.join("=");
    }
  }
  return cookies;
}

function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function textResponse(
  text: string,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(text, { status, headers: extraHeaders });
}

function errorResponse(error: unknown, corsHeaders: Record<string, string>): Response {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Internal error";
  if (status === 500) {
    Sentry.captureException(error);
  }
  return new Response(message, { status, headers: corsHeaders });
}

const PORT = Number(process.env.PORT) || 30310;

export const startAnswerServer = () => {
  Bun.serve({
    port: PORT,
    // eslint-disable-next-line complexity
    async fetch(req) {
      const url = new URL(req.url);
      const origin = req.headers.get("origin");
      const corsHeaders = getCorsHeaders(origin);

      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      const secretHeader = req.headers.get("x-secret-pass");
      if (secretHeader !== SECRET_KEY && process.env.NODE_ENV !== "dev") {
        return new Response("Nice try! Unauthorized—proxied access only.", {
          status: 403,
          headers: corsHeaders,
        });
      }

      const cookies = parseCookies(req.headers.get("cookie"));

      try {
        if (url.pathname === "/ask/stream" && req.method === "GET") {
          return await handleAskStream(req, url, cookies, corsHeaders);
        }

        if (url.pathname === "/getParagraphsForSearch" && req.method === "GET") {
          return await handleGetParagraphsForSearch(req, url, cookies, corsHeaders);
        }

        if (url.pathname === "/deepResearch" && req.method === "GET") {
          return await handleDeepResearch(req, url, cookies, corsHeaders);
        }

        if (url.pathname === "/prefetch" && req.method === "POST") {
          const bookSlug = url.searchParams.get("bookSlug");
          if (bookSlug) {
            prefetchBook(bookSlug);
            return jsonResponse({ message: "Prefetch initiated", bookSlug }, 202, corsHeaders);
          }
          return jsonResponse({ error: "bookSlug query parameter required" }, 400, corsHeaders);
        }

        if (url.pathname === "/heartbeat" && req.method === "GET") {
          const bookSlug = url.searchParams.get("bookSlug");
          if (bookSlug) {
            getBookData(bookSlug.toLowerCase()).catch(() => {});
          }
          return textResponse("OK", 200, corsHeaders);
        }

        if (url.pathname === "/health/cache" && req.method === "GET") {
          return jsonResponse(getCacheStats(), 200, corsHeaders);
        }

        if (url.pathname === "/admin/invalidate" && req.method === "POST") {
          const adminSecret = req.headers.get("x-admin-secret");
          if (adminSecret !== process.env.ADMIN_SECRET && process.env.NODE_ENV !== "dev") {
            return new Response("Forbidden", { status: 403, headers: corsHeaders });
          }
          const bookSlug = url.searchParams.get("bookSlug");
          if (bookSlug) {
            const deleted = invalidateBook(bookSlug);
            return jsonResponse({ invalidated: deleted, bookSlug }, 200, corsHeaders);
          }
          return jsonResponse({ error: "bookSlug query parameter required" }, 400, corsHeaders);
        }

        if (url.pathname === "/generate-realtime-token" && req.method === "GET") {
          return await handleGenerateRealtimeToken(req, corsHeaders);
        }

        if (url.pathname === "/debug-sentry" && req.method === "GET") {
          throw new Error("My second Sentry error!");
        }

        return new Response("Not Found", { status: 404, headers: corsHeaders });
      } catch (error) {
        return errorResponse(error, corsHeaders);
      }
    },
  });

  logger.info(`Server running on port ${PORT}`);
};

async function handleAskStream(
  req: Request,
  url: URL,
  cookies: Record<string, string>,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const question = url.searchParams.get("question") || "";
  const filterStr = url.searchParams.get("filter");
  const filter = filterStr ? JSON.parse(filterStr) : undefined;
  const userId = req.headers.get("x-user-email") || undefined;

  const isLoggedIn = Boolean(userId);
  const clearance = cookies["cf_clearance"] || "none";

  const enforceResult = await enforce("ask", req, { userId, isLoggedIn, clearance }, 1);
  if (!enforceResult.allowed) {
    const headers = { ...corsHeaders };
    enforceResult.response.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return new Response(enforceResult.response.body, {
      status: enforceResult.response.status,
      headers,
    });
  }

  if (question.trim().length > 2500 * 4) {
    throw new HttpError(400, "Question too long");
  }

  logger.info("filter", filter);

  let embeddings: BookEmbeddings | undefined;
  try {
    embeddings = await getEmbeddings(filter.bookSlug.toLowerCase());
  } catch (e) {
    logger.error("Error getting embeddings", e);
    const sseHeaders = {
      ...corsHeaders,
      ...enforceResult.headers,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    };
    return new Response(
      `event: error\ndata: ${JSON.stringify({ message: "Error getting embeddings" })}\n\n`,
      { status: 200, headers: sseHeaders },
    );
  }

  const sseHeaders = {
    ...corsHeaders,
    ...enforceResult.headers,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  };

  const abortSignal = req.signal;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let aborted = false;

      const cleanup = () => {
        aborted = true;
        clearInterval(keepAlive);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      abortSignal.addEventListener("abort", cleanup, { once: true });

      const send = (event: string, data: unknown) => {
        if (aborted) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* stream closed */
        }
      };

      const keepAlive = setInterval(() => {
        if (aborted) return;
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          cleanup();
        }
      }, 15000);

      try {
        if (aborted) return;

        console.time("getEmbeedingQueriesForQuestion");
        const queries = await getEmbeedingQueriesForQuestion(question);
        console.timeEnd("getEmbeedingQueriesForQuestion");
        console.log("queries", queries);

        if (aborted) return;

        console.time("findBestPassages");
        const allBestPassages = await Promise.all(
          queries.map((q) => findBestPassages(q, Array.from(embeddings!.values()).flat(), filter)),
        );
        console.timeEnd("findBestPassages");
        const bestPassages = allBestPassages.flat();

        if (aborted) return;

        const uniquePassagesMap = new Map<string, (typeof bestPassages)[0]>();
        for (const passage of bestPassages) {
          const key = `${passage.chapter}:${passage.paragraphNumber}`;
          if (!uniquePassagesMap.has(key)) uniquePassagesMap.set(key, passage);
        }
        const passages = Array.from(uniquePassagesMap.values())
          .map((p) => ({
            text: `<summaryWithText fromChapter="${p.chapter}">${p.text}</summaryWithText>`,
            score: p.score,
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 20);

        const prompt = `${makePrompt(question, passages.map((p) => p.text).join("\n"))}\n\nReturn a JSON object with keys in this exact order: needMore, answer.\nDecide needMore first. If needMore is true, keep answer as an empty string.`;

        let result: GenerateObjectResult<{ needMore: boolean; answer: string }> | undefined;
        try {
          result = await generateObject({
            model: google("gemini-3-flash-preview"),
            schema: z.object({ needMore: z.boolean(), answer: z.string() }),
            prompt,
            providerOptions: { google: { thinkingLevel: "minimal" } },
            experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
            abortSignal,
          });
        } catch (e) {
          if (aborted || (e as Error).name === "AbortError") return;
          console.error("error", e);
          send("error", { message: (e as Error).message });
          return;
        }

        if (aborted) return;

        console.log("result from gemini-3-flash-preview", result);
        const { object } = result;
        console.log("object from gemini-3-flash-preview", object);

        if (object.needMore) {
          send("meta", { needMore: object.needMore });
          send("done", { needMore: true });
        } else {
          send("meta", { needMore: object.needMore });
          send("chunk", { delta: object.answer });
          send("done", { delta: object.answer });
        }
      } catch (error) {
        if (!aborted) {
          send("error", { message: (error as Error).message });
        }
      } finally {
        abortSignal.removeEventListener("abort", cleanup);
        cleanup();
      }
    },
  });

  return new Response(stream, { status: 200, headers: sseHeaders });
}

async function handleGetParagraphsForSearch(
  req: Request,
  url: URL,
  cookies: Record<string, string>,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const searchQuery = url.searchParams.get("searchQuery") || "";
  const userId = req.headers.get("x-user-email") || undefined;
  console.log("userId", userId);
  const isLoggedIn = Boolean(userId);
  const clearance = cookies["cf_clearance"] || "none";

  const enforceResult = await enforce("search", req, { userId, isLoggedIn, clearance }, 1);
  if (!enforceResult.allowed) {
    const headers = { ...corsHeaders };
    enforceResult.response.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return new Response(enforceResult.response.body, {
      status: enforceResult.response.status,
      headers,
    });
  }

  if (searchQuery.trim().length > 2500) {
    throw new HttpError(400, "Search query too long");
  }

  const filterStr = url.searchParams.get("filter");
  const filter = filterStr ? JSON.parse(filterStr) : undefined;

  let embeddings: BookEmbeddings;
  try {
    embeddings = await getEmbeddings(filter.bookSlug.toLowerCase());
  } catch (e) {
    logger.error("Error getting embeddings", e);
    throw new HttpError(500, "Error getting embeddings");
  }

  const bestPassages = await findBestPassages(
    searchQuery,
    Array.from(embeddings.values()).flat(),
    filter,
  );
  const flatBestPassages = bestPassages.flat();

  const uniquePassagesMap = new Map<string, (typeof flatBestPassages)[0]>();
  for (const passage of flatBestPassages) {
    const key = `${passage.chapter}:${passage.paragraphNumber}`;
    if (!uniquePassagesMap.has(key)) {
      uniquePassagesMap.set(key, passage);
    }
  }

  const passagesWithoutEmbeddings = Array.from(uniquePassagesMap.values()).map(
    ({ Embeddings: _embeddings, ...rest }) => rest,
  );

  return jsonResponse(passagesWithoutEmbeddings, 200, { ...corsHeaders, ...enforceResult.headers });
}

async function handleDeepResearch(
  req: Request,
  url: URL,
  cookies: Record<string, string>,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const question = url.searchParams.get("question") || "";
  const userId = req.headers.get("x-user-email") || undefined;
  const isLoggedIn = Boolean(userId);
  const clearance = cookies["cf_clearance"] || "none";

  const enforceResult = await enforce("deep", req, { userId, isLoggedIn, clearance }, 1);
  if (!enforceResult.allowed) {
    const headers = { ...corsHeaders };
    enforceResult.response.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return new Response(enforceResult.response.body, {
      status: enforceResult.response.status,
      headers,
    });
  }

  const filterStr = url.searchParams.get("filter");
  if (!filterStr) {
    throw new HttpError(400, "Filter is required");
  }

  if (question.trim().length > 2500 * 4) {
    throw new HttpError(400, "Question too long");
  }

  const filter: Filter = JSON.parse(filterStr);
  const localPass = req.headers.get("x-local-pass");
  if (
    filter.chapterTo >= 4 &&
    !isLoggedIn &&
    process.env.NODE_ENV !== "dev" &&
    localPass !== SECRET_KEY
  ) {
    throw new HttpError(400, "Please log in to continue.");
  }

  try {
    const answer = await deepResearch(question, filter);
    return textResponse(answer, 200, { ...corsHeaders, ...enforceResult.headers });
  } catch (e) {
    console.error("e", e);
    logger.error("Error in deepResearch", e);
    throw new HttpError(500, "Error in deepResearch");
  }
}

async function main() {
  startAnswerServer();
  await prefetchAllBooks();
}

if (import.meta.main) {
  main();
}
