import { callFastGemini, callFastGeminiNoStream } from "./callFastGemini";
import "dotenv/config";

const PORT = process.env.PROMPT_SERVER_PORT || 3456;

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Health check endpoint
    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    // Streaming prompt endpoint (SSE)
    if (url.pathname === "/stream") {
      const prompt = url.searchParams.get("prompt");

      if (!prompt) {
        return Response.json({ error: "Missing 'prompt' query parameter" }, { status: 400 });
      }

      console.log(`[${new Date().toISOString()}] Streaming prompt: ${prompt}`);

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          try {
            await callFastGemini(prompt, (text, isFinal) => {
              const event = JSON.stringify({ text, done: isFinal });
              controller.enqueue(encoder.encode(`data: ${event}\n\n`));
            });

            controller.close();
            console.log(`[${new Date().toISOString()}] Stream completed`);
          } catch (error) {
            const errorEvent = JSON.stringify({ error: String(error), done: true });
            controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
            controller.close();
            console.error("Streaming error:", error);
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Main prompt endpoint
    if (url.pathname === "/prompt") {
      const prompt = url.searchParams.get("prompt");

      if (!prompt) {
        return Response.json({ error: "Missing 'prompt' query parameter" }, { status: 400 });
      }

      try {
        console.log(`[${new Date().toISOString()}] Received prompt: ${prompt}`);
        const response = await callFastGeminiNoStream(prompt);
        console.log(`[${new Date().toISOString()}] Response generated`);

        return Response.json({ response }, { headers: { "Access-Control-Allow-Origin": "*" } });
      } catch (error) {
        console.error("Error calling Gemini:", error);
        return Response.json(
          { error: "Failed to generate response", details: String(error) },
          { status: 500 },
        );
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
});

console.log(`Prompt server running at http://localhost:${server.port}`);
console.log(`Usage: GET /prompt?prompt=<your question>`);
console.log(`Stream: GET /stream?prompt=<your question> (SSE)`);
console.log(`Health: GET /health`);
