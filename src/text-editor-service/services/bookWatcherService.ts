import { Response } from "express";
import * as chokidar from "chokidar";
import path from "path";
import { processBook } from "../../../scripts/processBook";

interface SSEClient {
  id: string;
  book: string;
  response: Response;
}

interface ParagraphSelection {
  bookId: string;
  chapterId: number;
  paragraphId: number;
  timestamp: number;
}

class BookWatcherService {
  private clients: Map<string, SSEClient> = new Map();
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private processingBooks: Set<string> = new Set();
  private lastParagraphSelection: ParagraphSelection | null = null;

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

    // Send last paragraph selection if available and matching book
    if (this.lastParagraphSelection && this.lastParagraphSelection.bookId === book) {
      try {
        const message = `data: ${JSON.stringify({ type: "paragraph-selected", ...this.lastParagraphSelection })}\n\n`;
        response.write(message);
        console.log(`[SSE] Sent last paragraph selection to client ${clientId}`);
      } catch (error) {
        console.error(`[SSE] Failed to send last paragraph selection to client ${clientId}:`, error);
        this.removeClient(clientId);
      }
    }
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
    const booksContentPath = path.join(process.cwd(), "public_books", book, "booksContent");
    console.log(`[File Watcher] Starting to watch: ${booksContentPath}`);

    // Check if directory exists before watching
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("fs");
      if (!fs.existsSync(booksContentPath)) {
        console.error(`[File Watcher] booksContent directory does not exist: ${booksContentPath}`);
        return;
      }
    } catch (error) {
      console.error(`[File Watcher] Error checking directory existence: ${booksContentPath}`, error);
      return;
    }

    const watcher = chokidar.watch(booksContentPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 },
      // Add more robust options
      usePolling: false,
      atomic: true,
    });

    watcher.on("change", async (changedPath) => {
      console.log(`[File Watcher] Detected change in ${changedPath}`);
      await this.handleBookChange(book);
    });

    watcher.on("add", async (addedPath) => {
      console.log(`[File Watcher] Detected new file: ${addedPath}`);
      await this.handleBookChange(book);
    });

    watcher.on("unlink", async (removedPath) => {
      console.log(`[File Watcher] Detected file removal: ${removedPath}`);
      await this.handleBookChange(book);
    });

    watcher.on("error", (error) => {
      console.error(`[File Watcher] Error watching ${book}:`, error);
      // Don't crash the watcher on error, just log it
    });

    watcher.on("ready", () => {
      console.log(`[File Watcher] Ready to watch: ${booksContentPath}`);
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

  broadcastParagraphSelection(selection: ParagraphSelection): void {
    // Store the last selection
    this.lastParagraphSelection = selection;

    // Send to all clients connected to this book
    const clients = Array.from(this.clients.values()).filter((c) => c.book === selection.bookId);
    const message = `data: ${JSON.stringify({ type: "paragraph-selected", ...selection })}\n\n`;

    clients.forEach((client) => {
      try {
        client.response.write(message);
      } catch (error) {
        console.error(`[SSE] Failed to send paragraph selection to client ${client.id}:`, error);
        this.removeClient(client.id);
      }
    });

    console.log(`[SSE] Broadcast paragraph selection to ${clients.length} clients for book ${selection.bookId}`);
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
