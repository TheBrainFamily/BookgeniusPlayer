// server/ask-sse.ts (or inline into your existing file)
import type { Request, Response } from "express";

export function initSSE(req: Request, res: Response) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // If you use compression middleware, disable it for this route.

  // Flush headers early so the client starts receiving immediately
  if ("flushHeaders" in res && typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  // Keep-alive to stop proxies from closing idle connections
  const keepAlive = setInterval(() => {
    res.write(`: keep-alive\n\n`);
  }, 15000);

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const close = () => {
    clearInterval(keepAlive);
    res.end();
  };

  req.on("close", close);
  return { send, close };
}
