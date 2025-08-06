import { Request, Response } from "express";
import { bookWatcherService } from "../services/bookWatcherService";

export class SSEController {
  bookUpdates = (req: Request, res: Response): void => {
    // Get book from query parameter
    const book = req.query.book as string;

    if (!book) {
      res.status(400).json({ error: "Book parameter is required" });
      return;
    }

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Disable response timeout
    res.setTimeout(0);

    // Generate unique client ID
    const clientId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: "connected", book, clientId })}\n\n`);

    // Add client to watcher service
    bookWatcherService.addClient(clientId, book, res);

    // Handle client disconnect
    req.on("close", () => {
      bookWatcherService.removeClient(clientId);
    });

    // Keep connection alive with periodic pings
    const pingInterval = setInterval(() => {
      try {
        res.write(":ping\n\n");
      } catch {
        clearInterval(pingInterval);
        bookWatcherService.removeClient(clientId);
      }
    }, 30000); // Ping every 30 seconds

    // Clean up ping interval on disconnect
    req.on("close", () => {
      clearInterval(pingInterval);
    });
  };
}
