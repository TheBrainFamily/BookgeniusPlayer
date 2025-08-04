import { Response } from "express";
import * as chokidar from "chokidar";
import path from "path";
import { processBook } from "../../../scripts/processBook";

interface SSEClient {
  id: string;
  book: string;
  response: Response;
}

class BookWatcherService {
  private clients: Map<string, SSEClient> = new Map();
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private processingBooks: Set<string> = new Set();

  constructor() {
    // Cleanup on exit
    process.on("SIGINT", () => {
      this.cleanup();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      this.cleanup();
      process.exit(0);
    });
  }

  addClient(clientId: string, book: string, response: Response): void {
    // Store client
    this.clients.set(clientId, { id: clientId, book, response });

    // Start watching book if not already watching
    if (!this.watchers.has(book)) {
      this.startWatching(book);
    }

    console.log(`[SSE] Client ${clientId} connected for book: ${book}`);
  }

  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      console.log(`[SSE] Client ${clientId} disconnected`);

      // Check if we should stop watching this book
      const hasOtherClients = Array.from(this.clients.values()).some((c) => c.book === client.book);
      if (!hasOtherClients && this.watchers.has(client.book)) {
        this.stopWatching(client.book);
      }
    }
  }

  private startWatching(book: string): void {
    const bookPath = path.join(process.cwd(), "public_books", book, "book.xml");
    console.log(`[File Watcher] Starting to watch: ${bookPath}`);

    const watcher = chokidar.watch(bookPath, { persistent: true, ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 } });

    watcher.on("change", () => {
      console.log(`[File Watcher] Detected change in ${book}/book.xml`);
      this.handleBookChange(book);
    });

    watcher.on("error", (error) => {
      console.error(`[File Watcher] Error watching ${book}:`, error);
    });

    this.watchers.set(book, watcher);
  }

  private stopWatching(book: string): void {
    const watcher = this.watchers.get(book);
    if (watcher) {
      watcher.close();
      this.watchers.delete(book);
      console.log(`[File Watcher] Stopped watching: ${book}`);
    }
  }

  private async handleBookChange(book: string): Promise<void> {
    // Prevent multiple simultaneous processing for the same book
    if (this.processingBooks.has(book)) {
      console.log(`[Book Processing] Already processing ${book}, skipping...`);
      return;
    }

    this.processingBooks.add(book);

    try {
      console.log(`[Book Processing] Starting to process ${book}...`);

      // Send processing started event
      this.sendEventToBookClients(book, { type: "processing-started", book, timestamp: new Date().toISOString() });

      // Process the book
      const bookPath = path.join(process.cwd(), "public_books", book);
      const result = await processBook(bookPath);

      if (result.success !== false) {
        console.log(`[Book Processing] Successfully processed ${book}`);

        // Send success event
        this.sendEventToBookClients(book, { type: "book-updated", book, timestamp: new Date().toISOString() });
      } else {
        console.error(`[Book Processing] Failed to process ${book}`);

        // Send error event
        this.sendEventToBookClients(book, { type: "processing-error", book, error: result.error?.message || "Unknown error", timestamp: new Date().toISOString() });
      }
    } catch (error) {
      console.error(`[Book Processing] Error processing ${book}:`, error);

      // Send error event
      this.sendEventToBookClients(book, { type: "processing-error", book, error: error instanceof Error ? error.message : "Unknown error", timestamp: new Date().toISOString() });
    } finally {
      this.processingBooks.delete(book);
    }
  }

  private sendEventToBookClients(book: string, data: { type: string; book: string; timestamp: string; error?: string }): void {
    const clients = Array.from(this.clients.values()).filter((c) => c.book === book);
    const message = `data: ${JSON.stringify(data)}\n\n`;

    clients.forEach((client) => {
      try {
        client.response.write(message);
      } catch (error) {
        console.error(`[SSE] Failed to send event to client ${client.id}:`, error);
        this.removeClient(client.id);
      }
    });

    console.log(`[SSE] Sent event to ${clients.length} clients for book ${book}:`, data.type);
  }

  private cleanup(): void {
    console.log("[Cleanup] Shutting down book watcher service...");

    // Close all watchers
    this.watchers.forEach((watcher, book) => {
      watcher.close();
      console.log(`[Cleanup] Closed watcher for ${book}`);
    });

    // Clear all clients
    this.clients.clear();

    console.log("[Cleanup] Book watcher service shut down");
  }
}

export const bookWatcherService = new BookWatcherService();
