#!/usr/bin/env bun
/**
 * Install/uninstall launchd agent for auto-start on macOS
 *
 * The daemon reads config from .env files, so we just need to set
 * WorkingDirectory to the project root.
 */

import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";

const LABEL = "pro.lgandecki.convex-sync";
const PLIST_DIR = join(homedir(), "Library/LaunchAgents");
const PLIST_PATH = join(PLIST_DIR, `${LABEL}.plist`);
const LOG_DIR = join(homedir(), "Library/Logs/ConvexSync");

function getPlist(binPath: string, workingDir: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${binPath}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${workingDir}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/stderr.log</string>
</dict>
</plist>`;
}

function findProjectRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, ".env")) || existsSync(join(dir, "package.json"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function install() {
  const args = process.argv.slice(2);

  // Handle uninstall
  if (args.includes("uninstall") || args.includes("--uninstall")) {
    uninstall();
    return;
  }

  // Handle help
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
convex-sync install - Install as a background daemon

USAGE:
  bun run install-daemon           Install and start daemon
  bun run install-daemon uninstall Uninstall daemon

The daemon reads config from .env files in the project directory.
Make sure CONVEX_URL and CONVEX_ADMIN_KEY are set in your .env file.
`);
    return;
  }

  const projectRoot = findProjectRoot();

  // Check that .env exists with required vars
  const envPath = join(projectRoot, ".env");
  if (!existsSync(envPath)) {
    console.error("❌ No .env file found in project root");
    console.error(`   Expected at: ${envPath}`);
    process.exit(1);
  }

  const envContent = readFileSync(envPath, "utf-8");
  if (!envContent.includes("CONVEX_ADMIN_KEY")) {
    console.error("❌ CONVEX_ADMIN_KEY not found in .env file");
    process.exit(1);
  }

  // Determine binary path
  const scriptDir = import.meta.dir;
  const cliScript = join(scriptDir, "cli.ts");

  // Use bun to run the script
  const bunPath = process.execPath;
  const binPath = `${bunPath} ${cliScript}`;

  console.log(`📁 Project root: ${projectRoot}`);
  console.log(`📦 Using: ${binPath}`);

  // Create directories
  mkdirSync(PLIST_DIR, { recursive: true });
  mkdirSync(LOG_DIR, { recursive: true });

  // Write plist
  const plist = getPlist(binPath, projectRoot);
  writeFileSync(PLIST_PATH, plist);
  console.log(`✅ Created ${PLIST_PATH}`);

  // Load the agent
  const result = Bun.spawnSync(["launchctl", "load", PLIST_PATH]);
  if (result.exitCode === 0) {
    console.log("✅ Daemon installed and started!");
    console.log();
    console.log("View logs:");
    console.log(`  tail -f ~/Library/Logs/ConvexSync/stdout.log`);
    console.log();
    console.log("Control:");
    console.log(`  launchctl unload ~/Library/LaunchAgents/${LABEL}.plist  # Stop`);
    console.log(`  launchctl load ~/Library/LaunchAgents/${LABEL}.plist    # Start`);
  } else {
    console.error("❌ Failed to load daemon");
    console.error(new TextDecoder().decode(result.stderr));
  }
}

function uninstall() {
  if (!existsSync(PLIST_PATH)) {
    console.log("Daemon not installed");
    return;
  }

  // Unload the agent
  Bun.spawnSync(["launchctl", "unload", PLIST_PATH]);

  // Remove plist
  unlinkSync(PLIST_PATH);
  console.log("✅ Daemon uninstalled");
}

// Run
install();
