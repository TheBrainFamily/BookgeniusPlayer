#!/usr/bin/env bun
/**
 * Convex Sync Daemon CLI
 *
 * A cross-platform tool that syncs Convex assets to a local folder in real-time.
 * Creates real files that work perfectly with CLI tools (grep, cat, etc).
 */

import { loadConfig } from "./config";
import { SyncDaemon } from "./sync";

console.log("═══════════════════════════════════════");
console.log("  Convex Sync Daemon");
console.log("  Real-time sync to local folder");
console.log("═══════════════════════════════════════");
console.log();

// Load configuration
const config = loadConfig();

console.log(`🔗 Convex URL: ${config.convexUrl}`);
console.log(`🔑 Admin key: ${config.adminKey ? "[configured]" : "[not set]"}`);
console.log(`📁 Sync dir: ${config.syncDir}`);
console.log(`⚡ Concurrency: ${config.concurrency}`);

if (config.reset) {
  console.log("🔄 Reset mode - will do full re-sync");
}

console.log();

// Create and start daemon
const daemon = new SyncDaemon(config);

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down...");
  daemon.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  daemon.stop();
  process.exit(0);
});

// Start
daemon.start().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
