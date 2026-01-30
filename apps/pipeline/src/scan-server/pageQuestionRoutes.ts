import { Router, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { google } from "@ai-sdk/google";
import { streamText } from "ai";
import { HarmCategory, HarmBlockThreshold } from "@google/genai";
import { initSSE } from "../services/answer-server/ask-sse";

const SCANNED_BOOKS_DIR = path.join(__dirname, "../../scanned-books");

// Extend Express Request to include multer file
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Session cache for follow-up conversations
interface PageQuestionSession {
  sessionId: string;
  bookSlug: string;
  chapterNumber: number;
  chapterSummary: string;
  imageBase64: string;
  mimeType: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  createdAt: number;
  lastActivityAt: number;
}

const sessionCache = new Map<string, PageQuestionSession>();

// Clean up expired sessions every 5 minutes
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [id, session] of sessionCache) {
      if (now - session.lastActivityAt > SESSION_TTL_MS) {
        sessionCache.delete(id);
        console.log(`[PageQuestion] Cleaned up expired session ${id}`);
      }
    }
  },
  5 * 60 * 1000,
);

const router = Router();

// Configure multer for multipart uploads
const upload = multer({ storage: multer.memoryStorage() });

// Safety settings for Gemini
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

/**
 * Load chapter summary from the analysis files
 * Finds the first session folder and reads analysis-chapter-X.json
 */
async function loadChapterSummary(bookSlug: string, chapterNumber: number): Promise<string> {
  try {
    const bookDir = path.join(SCANNED_BOOKS_DIR, bookSlug);

    // Find the first session folder
    const entries = await fs.readdir(bookDir);
    const sessionDir = entries.find((e) => e.startsWith("session-"));

    if (!sessionDir) {
      console.log(`[PageQuestion] No session found for ${bookSlug}`);
      return "";
    }

    // Read the analysis file for this chapter
    const analysisPath = path.join(bookDir, sessionDir, `analysis-chapter-${chapterNumber}.json`);
    const content = await fs.readFile(analysisPath, "utf-8");
    const analysis = JSON.parse(content) as {
      summary?: string;
      characters?: Array<{
        name: string;
        slug: string;
        referenceCard: string;
        chapterAction: string;
        mentioned: boolean;
        speaking: boolean;
      }>;
    };

    const summary = `
    ${analysis.summary}
    ${analysis.characters?.map((character) => `- ${character.name}: ${character.referenceCard} (${character.chapterAction})`).join("\n")}
    `;
    console.log(`[PageQuestion] Loaded summary for ${bookSlug} chapter ${chapterNumber}`);
    return summary;
  } catch (error) {
    console.log(`[PageQuestion] Could not load chapter summary: ${error}`);
    return "";
  }
}

/**
 * Build the system prompt for page question analysis
 */
function buildPageQuestionPrompt(chapterSummary: string, chapterNumber: number): string {
  return `You are a helpful reading companion. A reader is looking at a page from a book and needs help understanding it.

CHAPTER CONTEXT (Chapter ${chapterNumber}):
${chapterSummary || "No chapter summary available."}

CRITICAL RULES:
1. The reader is currently in the MIDDLE of chapter ${chapterNumber}. The summary above covers the ENTIRE chapter.
2. NEVER reveal plot points, character fates, or events that the reader hasn't reached yet.
3. Focus only on what a reader at this point in the chapter would reasonably know.

YOUR TASK:
Look at the book page image. The reader may be pointing at or highlighting specific text.

PRIORITIES (in order):
1. If pointing at text in a FOREIGN LANGUAGE (Latin, French, etc.) - translate it and explain its significance
2. If pointing at an ARCHAIC or RARE ENGLISH WORD - define it in modern terms
3. If pointing at a COMPLEX SENTENCE or LITERARY DEVICE - explain its meaning
4. Otherwise - explain "what's happening here" in the story context

Be concise but helpful. Use 2-4 sentences for simple explanations, more for complex passages.
Reference characters and events the reader has already encountered when helpful.
Examples of things TO NOT SAY:
Don't say "I can help with that" - user already knows you can help.
Don't say "Here's what's happening on this page" - user knows the context.`;
}

/**
 * POST /api/page-question/start
 * Multipart form: bookSlug, chapterNumber, image (file)
 * Returns: SSE stream with session, chunk, done, error events
 */
router.post("/start", upload.single("image"), async (req: MulterRequest, res: Response) => {
  const { send, close } = initSSE(req, res);

  try {
    const { bookSlug, chapterNumber: chapterNumberStr } = req.body as {
      bookSlug: string;
      chapterNumber: string;
    };

    const chapterNumber = parseInt(chapterNumberStr, 10);

    if (!bookSlug || isNaN(chapterNumber)) {
      send("error", { message: "bookSlug and chapterNumber are required" });
      close();
      return;
    }

    const file = req.file;
    if (!file) {
      send("error", { message: "image file is required" });
      close();
      return;
    }

    // Create session
    const sessionId = randomUUID();
    const imageBase64 = file.buffer.toString("base64");
    const mimeType = file.mimetype || "image/jpeg";

    // Load chapter summary from scanned book analysis
    const chapterSummary = await loadChapterSummary(bookSlug, chapterNumber);

    // Store session for follow-ups
    const session: PageQuestionSession = {
      sessionId,
      bookSlug,
      chapterNumber,
      chapterSummary,
      imageBase64,
      mimeType,
      messages: [],
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    sessionCache.set(sessionId, session);

    // Send session ID first
    send("session", { sessionId });

    const startTime = Date.now();
    console.log(
      `[PageQuestion] ${new Date().toISOString()} - Question received for ${bookSlug} chapter ${chapterNumber}`,
    );

    // Build prompt and stream response
    const systemPrompt = buildPageQuestionPrompt(chapterSummary, chapterNumber);
    console.log(`[PageQuestion] System prompt:\n${systemPrompt.substring(0, 500)}...`);

    const { textStream } = streamText({
      model: google("gemini-3-flash-preview"),
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: `data:${mimeType};base64,${imageBase64}` },
            { type: "text", text: systemPrompt },
          ],
        },
      ],
      providerOptions: { google: { safetySettings } },
    });

    let fullResponse = "";
    for await (const chunk of textStream) {
      fullResponse += chunk;
      send("chunk", { delta: chunk });
    }

    // Store assistant response in session for follow-ups
    session.messages.push({ role: "assistant", content: fullResponse });
    session.lastActivityAt = Date.now();

    send("done", { fullResponse });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
      `[PageQuestion] ${new Date().toISOString()} - Response complete in ${duration}s (${fullResponse.length} chars)`,
    );
    console.log(`[PageQuestion] Response:\n${fullResponse}`);
  } catch (error) {
    console.error("[PageQuestion] start error:", error);
    send("error", { message: error instanceof Error ? error.message : "Unknown error" });
  } finally {
    close();
  }
});

/**
 * POST /api/page-question/follow-up
 * Body: { sessionId, message }
 * Returns: SSE stream with chunk, done, error events
 */
router.post("/follow-up", async (req: Request, res: Response) => {
  const { send, close } = initSSE(req, res);

  try {
    const { sessionId, message } = req.body as { sessionId: string; message: string };

    if (!sessionId || !message) {
      send("error", { message: "sessionId and message are required" });
      close();
      return;
    }

    const session = sessionCache.get(sessionId);
    if (!session) {
      send("error", { message: "Session not found or expired" });
      close();
      return;
    }

    console.log(
      `[PageQuestion] Follow-up for session ${sessionId}: "${message.substring(0, 50)}..."`,
    );

    // Add user message to history
    session.messages.push({ role: "user", content: message });
    session.lastActivityAt = Date.now();

    // Build conversation with image (for Gemini implicit caching)
    const systemPrompt = buildPageQuestionPrompt(session.chapterSummary, session.chapterNumber);

    // Construct messages: image+system first, then conversation history
    const messages: Array<{
      role: "user" | "assistant";
      content: string | Array<{ type: string; text?: string; image?: string }>;
    }> = [
      {
        role: "user",
        content: [
          { type: "image", image: `data:${session.mimeType};base64,${session.imageBase64}` },
          { type: "text", text: systemPrompt },
        ],
      },
      // Add previous conversation turns
      ...session.messages.map((msg) => ({ role: msg.role, content: msg.content })),
    ];

    const { textStream } = streamText({
      model: google("gemini-3-flash-preview"),
      // @ts-expect-error - content types are compatible at runtime
      messages,
      providerOptions: { google: { safetySettings } },
    });

    let fullResponse = "";
    for await (const chunk of textStream) {
      fullResponse += chunk;
      send("chunk", { delta: chunk });
    }

    // Store assistant response
    session.messages.push({ role: "assistant", content: fullResponse });

    send("done", { fullResponse });
    console.log(
      `[PageQuestion] Session ${sessionId} follow-up complete (${fullResponse.length} chars)`,
    );
  } catch (error) {
    console.error("[PageQuestion] follow-up error:", error);
    send("error", { message: error instanceof Error ? error.message : "Unknown error" });
  } finally {
    close();
  }
});

/**
 * POST /api/page-question/upload
 * Step 1: Upload image and create session (no streaming)
 * Returns sessionId immediately, then iOS calls GET /stream/:sessionId
 */
router.post("/upload", upload.single("image"), async (req: MulterRequest, res: Response) => {
  try {
    const { bookSlug, chapterNumber: chapterNumberStr } = req.body as {
      bookSlug: string;
      chapterNumber: string;
    };

    const chapterNumber = parseInt(chapterNumberStr, 10);

    if (!bookSlug || isNaN(chapterNumber)) {
      res.status(400).json({ error: "bookSlug and chapterNumber are required" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "image file is required" });
      return;
    }

    const sessionId = randomUUID();
    const imageBase64 = file.buffer.toString("base64");
    const mimeType = file.mimetype || "image/jpeg";

    const chapterSummary = await loadChapterSummary(bookSlug, chapterNumber);

    const session: PageQuestionSession = {
      sessionId,
      bookSlug,
      chapterNumber,
      chapterSummary,
      imageBase64,
      mimeType,
      messages: [],
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    sessionCache.set(sessionId, session);

    console.log(
      `[PageQuestion] Session ${sessionId} created for ${bookSlug} chapter ${chapterNumber}`,
    );

    res.json({ sessionId });
  } catch (error) {
    console.error("[PageQuestion] upload error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/**
 * GET /api/page-question/stream/:sessionId
 * Step 2: Stream the AI response via SSE (works with iOS)
 */
router.get("/stream/:sessionId", async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  const session = sessionCache.get(sessionId as string);
  if (!session) {
    res.status(404).json({ error: "Session not found or expired" });
    return;
  }

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const startTime = Date.now();
    console.log(`[PageQuestion] Streaming for session ${sessionId}`);

    const systemPrompt = buildPageQuestionPrompt(session.chapterSummary, session.chapterNumber);

    const { textStream } = streamText({
      model: google("gemini-3-flash-preview"),
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: `data:${session.mimeType};base64,${session.imageBase64}` },
            { type: "text", text: systemPrompt },
          ],
        },
      ],
      providerOptions: { google: { safetySettings } },
    });

    let fullResponse = "";
    for await (const chunk of textStream) {
      fullResponse += chunk;
      send("chunk", { delta: chunk });
    }

    session.messages.push({ role: "assistant", content: fullResponse });
    session.lastActivityAt = Date.now();

    send("done", { fullResponse });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[PageQuestion] Stream complete in ${duration}s (${fullResponse.length} chars)`);
  } catch (error) {
    console.error("[PageQuestion] stream error:", error);
    send("error", { message: error instanceof Error ? error.message : "Unknown error" });
  } finally {
    res.end();
  }
});

/**
 * GET /api/page-question/stream-follow-up/:sessionId
 * Stream follow-up response via SSE
 * Query param: message
 */
router.get("/stream-follow-up/:sessionId", async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const message = req.query.message as string;

  if (!message) {
    res.status(400).json({ error: "message query param is required" });
    return;
  }

  const session = sessionCache.get(sessionId as string);
  if (!session) {
    res.status(404).json({ error: "Session not found or expired" });
    return;
  }

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    console.log(`[PageQuestion] Follow-up stream for session ${sessionId}`);

    session.messages.push({ role: "user", content: message });
    session.lastActivityAt = Date.now();

    const systemPrompt = buildPageQuestionPrompt(session.chapterSummary, session.chapterNumber);

    const messages: Array<{
      role: "user" | "assistant";
      content: string | Array<{ type: string; text?: string; image?: string }>;
    }> = [
      {
        role: "user",
        content: [
          { type: "image", image: `data:${session.mimeType};base64,${session.imageBase64}` },
          { type: "text", text: systemPrompt },
        ],
      },
      ...session.messages.map((msg) => ({ role: msg.role, content: msg.content })),
    ];

    const { textStream } = streamText({
      model: google("gemini-3-flash-preview"),
      // @ts-expect-error - content types are compatible at runtime
      messages,
      providerOptions: { google: { safetySettings } },
    });

    let fullResponse = "";
    for await (const chunk of textStream) {
      fullResponse += chunk;
      send("chunk", { delta: chunk });
    }

    session.messages.push({ role: "assistant", content: fullResponse });

    send("done", { fullResponse });
    console.log(`[PageQuestion] Follow-up stream complete (${fullResponse.length} chars)`);
  } catch (error) {
    console.error("[PageQuestion] follow-up stream error:", error);
    send("error", { message: error instanceof Error ? error.message : "Unknown error" });
  } finally {
    res.end();
  }
});

/**
 * POST /api/page-question/test-sse
 * Minimal SSE test endpoint
 */
router.post("/test-sse", (req: Request, res: Response) => {
  console.log("[TestSSE] Request received");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Send first event immediately
  console.log("[TestSSE] Sending immediate event");
  res.write(`event: start\ndata: {"text":"Started!"}\n\n`);

  // Send more events with delays
  let count = 0;
  const interval = setInterval(() => {
    count++;
    console.log(`[TestSSE] Sending event ${count}`);
    res.write(`event: chunk\ndata: {"text":"Hello ${count}"}\n\n`);

    if (count >= 3) {
      clearInterval(interval);
      res.write(`event: done\ndata: {"text":"Complete!"}\n\n`);
      console.log("[TestSSE] Done");
      res.end();
    }
  }, 500);

  req.on("close", () => {
    clearInterval(interval);
    console.log("[TestSSE] Client disconnected");
  });
});

/**
 * GET /api/page-question/test-sse-get
 * GET version of SSE test
 */
router.get("/test-sse-get", (req: Request, res: Response) => {
  console.log("[TestSSE-GET] Request received");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  console.log("[TestSSE-GET] Sending immediate event");
  res.write(`event: start\ndata: {"text":"Started!"}\n\n`);

  let count = 0;
  const interval = setInterval(() => {
    count++;
    console.log(`[TestSSE-GET] Sending event ${count}`);
    res.write(`event: chunk\ndata: {"text":"Hello ${count}"}\n\n`);

    if (count >= 3) {
      clearInterval(interval);
      res.write(`event: done\ndata: {"text":"Complete!"}\n\n`);
      console.log("[TestSSE-GET] Done");
      res.end();
    }
  }, 500);

  req.on("close", () => {
    clearInterval(interval);
    console.log("[TestSSE-GET] Client disconnected");
  });
});

export default router;
