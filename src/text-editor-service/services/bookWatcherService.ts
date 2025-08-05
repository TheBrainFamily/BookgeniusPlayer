import { Response } from "express";
import * as chokidar from "chokidar";
import path from "path";
import { spawn } from "child_process";
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

    // Check if file exists before watching
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("fs");
      if (!fs.existsSync(bookPath)) {
        console.error(`[File Watcher] Book file does not exist: ${bookPath}`);
        return;
      }
    } catch (error) {
      console.error(`[File Watcher] Error checking file existence: ${bookPath}`, error);
      return;
    }

    const watcher = chokidar.watch(bookPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 },
      // Add more robust options
      usePolling: false,
      atomic: true,
    });

    watcher.on("change", () => {
      console.log(`[File Watcher] Detected change in ${book}/book.xml`);
      this.handleBookChange(book);
    });

    watcher.on("error", (error) => {
      console.error(`[File Watcher] Error watching ${book}:`, error);
      // Don't crash the watcher on error, just log it
    });

    watcher.on("ready", () => {
      console.log(`[File Watcher] Ready to watch: ${bookPath}`);
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

  public async triggerExternalApp(chapterNumber: number, paragraphNumber: number, bookName?: string): Promise<void> {
    try {
      // Send SSE event to all connected clients
      const eventData = {
        type: "external-app-trigger",
        chapterNumber,
        paragraphNumber,
        bookName: bookName || "Romeo-And-Juliet-Small", // Default fallback
        port: 5174,
        timestamp: new Date().toISOString(),
      };

      // Send to all clients (not book-specific since this is a global editor action)
      const allClients = Array.from(this.clients.values());
      const message = `data: ${JSON.stringify(eventData)}\n\n`;

      allClients.forEach((client) => {
        try {
          client.response.write(message);
        } catch (error) {
          console.error(`[SSE] Failed to send external app trigger to client ${client.id}:`, error);
          this.removeClient(client.id);
        }
      });

      console.log(`[SSE] Sent external app trigger to ${allClients.length} clients - Chapter: ${chapterNumber}, Paragraph: ${paragraphNumber}`);

      // Wait a moment for the browser to open and connect, then send the event again
      setTimeout(() => {
        console.log(`[SSE] Sending delayed external app trigger - Chapter: ${chapterNumber}, Paragraph: ${paragraphNumber}`);
        const delayedClients = Array.from(this.clients.values());
        delayedClients.forEach((client) => {
          try {
            client.response.write(message);
            console.log(`[SSE] Sent delayed event to client ${client.id}`);
          } catch (error) {
            console.error(`[SSE] Failed to send delayed event to client ${client.id}:`, error);
          }
        });
      }, 2000); // Wait 2 seconds

      // Trigger the external application on port 5174
      await this.openExternalApp();
    } catch (error) {
      console.error("[External App] Failed to trigger external app:", error);
    }
  }

  private async openExternalApp(): Promise<void> {
    try {
      const editorUrl = "http://localhost:5174";

      console.log(`[External App] Attempting to focus existing tab or open new one: ${editorUrl}`);

      if (process.platform === "darwin") {
        // Use AppleScript to find and focus existing tab, or open new one
        const appleScript = `
tell application "System Events"
    set foundTab to false
    
    -- Check Chrome first
    if application "Google Chrome" is running then
        tell application "Google Chrome"
            repeat with w in windows
                set tabIndex to 1
                repeat with t in tabs of w
                    if URL of t contains "localhost:5174" then
                        set active tab index of w to tabIndex
                        set index of w to 1
                        activate
                        set foundTab to true
                        exit repeat
                    end if
                    set tabIndex to tabIndex + 1
                end repeat
                if foundTab then exit repeat
            end repeat
        end tell
    end if
    
    -- Check Safari if not found in Chrome
    if not foundTab and application "Safari" is running then
        tell application "Safari"
            repeat with w in windows
                set tabIndex to 1
                repeat with t in tabs of w
                    if URL of t contains "localhost:5174" then
                        set current tab of w to t
                        set index of w to 1
                        activate
                        set foundTab to true
                        exit repeat
                    end if
                    set tabIndex to tabIndex + 1
                end repeat
                if foundTab then exit repeat
            end repeat
        end tell
    end if
    
    -- If no existing tab found, open new one
    if not foundTab then
        do shell script "open '${editorUrl}'"
    end if
    
    return foundTab
end tell`;

        return new Promise((resolve) => {
          const child = spawn("osascript", ["-e", appleScript], { stdio: ["ignore", "pipe", "pipe"] });

          let output = "";
          let error = "";

          child.stdout?.on("data", (data) => {
            output += data.toString();
          });

          child.stderr?.on("data", (data) => {
            error += data.toString();
          });

          child.on("close", (code) => {
            if (code === 0) {
              const foundExisting = output.trim() === "true";
              if (foundExisting) {
                console.log("[External App] Successfully focused existing tab");
              } else {
                console.log("[External App] No existing tab found, opened new one");
              }
            } else {
              console.error("[External App] AppleScript failed:", error);
              console.log("[External App] Falling back to simple open");
              this.fallbackOpen(editorUrl);
            }
            resolve();
          });

          child.on("error", (err) => {
            console.error("[External App] Failed to run AppleScript:", err);
            console.log("[External App] Falling back to simple open");
            this.fallbackOpen(editorUrl);
            resolve();
          });
        });
      } else {
        // For non-macOS, just use simple open
        console.log("[External App] Non-macOS platform, using simple open");
        this.fallbackOpen(editorUrl);
      }
    } catch (error) {
      console.error("[External App] Error opening external application:", error);
      console.log("[External App] Please manually open: http://localhost:5174");
    }
  }

  private fallbackOpen(url: string): void {
    let command: string;
    let args: string[];

    console.log(`[External App] Platform: ${process.platform}`);

    switch (process.platform) {
      case "darwin": // macOS
        command = "open";
        args = [url];
        break;
      case "win32": // Windows
        command = "start";
        args = ["", url];
        break;
      default: // Linux and others
        command = "xdg-open";
        args = [url];
        break;
    }

    console.log(`[External App] Executing: ${command} ${args.join(" ")}`);

    const child = spawn(command, args, { detached: true, stdio: ["ignore", "pipe", "pipe"] });

    child.stdout?.on("data", (data) => {
      console.log(`[External App] Command output: ${data}`);
    });

    child.stderr?.on("data", (data) => {
      console.error(`[External App] Command error: ${data}`);
    });

    child.on("error", (error) => {
      console.error("[External App] Failed to spawn command:", error);
      console.log("[External App] Please manually open: http://localhost:5174");
    });

    child.on("exit", (code) => {
      console.log(`[External App] Command exited with code: ${code}`);
    });

    child.unref();
    console.log("[External App] Command spawned successfully");
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
