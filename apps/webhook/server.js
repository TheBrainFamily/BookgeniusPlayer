// webhook/server.js
import express from "express";
import { execFile } from "child_process";
import { createClient } from "redis";
import fs from "fs";
import path from "path";

const app = express();
app.use(express.json());

// --- ENV ---
const API_TOKEN     = process.env.API_TOKEN;                 // x-api-key
const BASE_DOMAIN   = process.env.BASE_DOMAIN;               // np. bookg.aws.lucetius.pl
const IMAGE_PREFIX  = process.env.IMAGE_PREFIX || "lucetiuspl";
const TEMPLATE_DIR  = process.env.TEMPLATE_DIR || "/templates";
const DATA_DIR      = process.env.DATA_DIR || "/data";
const CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY;
const S3_ENDPOINT= process.env.S3_ENDPOINT || "";
const S3_ACCESS_KEY_ID= process.env.S3_ACCESS_KEY_ID || "";
const S3_SECRET_ACCESS_KEY= process.env.S3_SECRET_ACCESS_KEY || "";
const S3_BUCKET= process.env.S3_BUCKET || "";
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const P_START       = parseInt(process.env.PORT_RANGE_START || "6200", 10);
const P_END         = parseInt(process.env.PORT_RANGE_END   || "6999", 10);
const MAIN_PORTS    = { PLATFORM: 6000, PLAYER: 6001, API: 6002 }; // prod pod apexem

// --- REDIS ---
const redis = createClient({
  url: `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST || "redis"}:${process.env.REDIS_PORT || 6379}`
});
await redis.connect();

// --- Docker login (GHCR / Docker Hub) ---
  async function dockerLogin() {
      const cmds = [];
      if (process.env.GHCR_USER && process.env.GHCR_TOKEN) {
          cmds.push(`echo "${process.env.GHCR_TOKEN}" | docker login ghcr.io -u "${process.env.GHCR_USER}" --password-stdin`);
      }
      for (const c of cmds) await sh("sh", ["-lc", c]);
    }

await dockerLogin();

// --- utils ---
const auth = (req, res) => {
  const tok = req.get("x-api-key") || req.get("authorization");
  if (!API_TOKEN || !tok || !tok.includes(API_TOKEN)) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
};
const slug = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function sh(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve({ stdout, stderr });
    });
  });
}

async function usedDockerHostPorts() {
  const { stdout } = await sh("docker", ["ps", "--format", "{{.Ports}}"]);
  const set = new Set();
  stdout.split("\n").forEach(line => {
    // parsuje np. "127.0.0.1:6281->80/tcp, 127.0.0.1:6282->3000/tcp"
    const m = line.match(/(\d+)->\d+\/tcp/g);
    if (!m) return;
    m.forEach(seg => {
      const p = parseInt(seg.split("->")[0], 10);
      if (!isNaN(p)) set.add(p);
    });
  });
  return set;
}

async function allocPortBlock(n = 3) {
  const used = await usedDockerHostPorts();
  // Nie używamy MAIN_PORTS, ale jeśli leżą w zakresie, też będą widoczne jako użyte
  for (let base = P_START; base <= P_END - (n - 1); base++) {
    let ok = true;
    for (let i = 0; i < n; i++) {
      if (used.has(base + i)) { ok = false; break; }
    }
    if (ok) return base;
  }
  throw new Error("No free contiguous port block in range");
}

async function composePullUp(file, envf, project, workdir) {
  await sh("docker", ["compose", "-f", file, "--env-file", envf, "-p", project, "pull", "--quiet"], workdir);
  await sh("docker", ["compose", "-f", file, "--env-file", envf, "-p", project, "up", "-d", "--no-build"], workdir);
}

// --- ROUTES ---
app.post("/deploy", async (req, res) => {
  if (!auth(req, res)) return;
  try {
    const { branch, imageTag, assetContext, env = {} } = req.body;
    if (!branch) return res.status(400).json({ error: "branch required" });

    const s = slug(branch);
    const host = `${s}-branch.${BASE_DOMAIN}`;
    const project = `bookg-${s}`;

    const base = await allocPortBlock(3);
    const ports = { PLATFORM_HTTP: base, PLAYER_HTTP: base + 1, API_HTTP: base + 2 };

    const workdir = path.join(DATA_DIR, "branches", s);
    fs.mkdirSync(workdir, { recursive: true });

    const envLines = [
      `IMAGE_PREFIX=${IMAGE_PREFIX}`,
      `IMAGE_TAG=${imageTag || s}`,
      `PLATFORM_HTTP=${ports.PLATFORM_HTTP}`,
      `PLAYER_HTTP=${ports.PLAYER_HTTP}`,
      `API_HTTP=${ports.API_HTTP}`,
      `S3_ENDPOINT=${S3_ENDPOINT || ""}`,
      `S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID || ""}`,
      `S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY || ""}`,
      `S3_BUCKET=${S3_BUCKET || ""}`,
      `CLERK_SECRET_KEY=${CLERK_SECRET_KEY || ""}`,
      `CLERK_PUBLISHABLE_KEY=${CLERK_PUBLISHABLE_KEY || ""}`,
      `SNAPPLIFY_JWKS_URL=${env.SNAPPLIFY_JWKS_URL || "https://auth.snapplify.com/.well-known/jwks.json"}`,
      `SNAPPLIFY_ISSUER=${env.SNAPPLIFY_ISSUER || "https://snapplify.com"}`,
      `ASSET_CONTEXT=${assetContext || "staging"}`
    ].join("\n");
    fs.writeFileSync(path.join(workdir, ".env"), envLines);

    const file = path.join(TEMPLATE_DIR, "docker-compose.branch.yml");
    const envf = path.join(workdir, ".env");

    await composePullUp(file, envf, project, workdir);

    // Rejestracja 3 kluczy
    await redis.set(`${host}:platform`, `172.17.0.1:${ports.PLATFORM_HTTP}`);
    await redis.set(`${host}:player`,   `172.17.0.1:${ports.PLAYER_HTTP}`);
    await redis.set(`${host}:api`,      `172.17.0.1:${ports.API_HTTP}`);

    res.json({ ok: true, host, url: `https://${host}/`, ports, project });
  } catch (e) {
    console.error(e); res.status(500).json({ error: e.message });
  }
});

app.post("/teardown", async (req, res) => {
  if (!auth(req, res)) return;
  try {
    const { branch, imageTag } = req.body;
    if (!branch) return res.status(400).json({ error: "branch required" });
    if (branch.toLowerCase() === "main") return res.status(400).json({ error: "main branch is protected" });

    const s = slug(branch);
    const host = `${s}-branch.${BASE_DOMAIN}`;
    const project = `bookg-${s}`;
    const workdir = path.join(DATA_DIR, "branches", s);
    const file = path.join(TEMPLATE_DIR, "docker-compose.branch.yml");
    const envf = path.join(workdir, ".env");

    await sh("docker", ["compose", "-f", file, "--env-file", envf, "-p", project, "down", "-v", "--remove-orphans"], workdir).catch(() => {});
    await redis.del(`${host}:platform`, `${host}:player`, `${host}:api`);
    try { fs.rmSync(workdir, { recursive: true, force: true }); } catch {}

    // (opcjonalnie) usuń obrazy taga
    const tag = imageTag || s;
    for (const n of ["player", "platform", "core-api"]) {
      await sh("docker", ["rmi", "-f", `${IMAGE_PREFIX}/${n}:${tag}`]).catch(() => {});
    }

    res.json({ ok: true, host, project });
  } catch (e) {
    console.error(e); res.status(500).json({ error: e.message });
  }
});

app.post("/deploy-main", async (req, res) => {
  if (!auth(req, res)) return;
  try {
    const { imageTag = "main", assetContext, env = {} } = req.body;
    const s = "main";
    const host = BASE_DOMAIN;           // apex
    const project = `bookg-${s}`;

    const workdir = path.join(DATA_DIR, "branches", s);
    fs.mkdirSync(workdir, { recursive: true });

    const envLines = [
      `IMAGE_PREFIX=${IMAGE_PREFIX}`,
      `IMAGE_TAG=${imageTag}`,
      `PLATFORM_HTTP=${MAIN_PORTS.PLATFORM}`,
      `PLAYER_HTTP=${MAIN_PORTS.PLAYER}`,
      `API_HTTP=${MAIN_PORTS.API}`,
      `S3_ENDPOINT=${S3_ENDPOINT || ""}`,
      `S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID || ""}`,
      `S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY || ""}`,
      `S3_BUCKET=${S3_BUCKET || ""}`,
      `CLERK_SECRET_KEY=${CLERK_SECRET_KEY || ""}`,
      `CLERK_PUBLISHABLE_KEY=${CLERK_PUBLISHABLE_KEY || ""}`,
      `SNAPPLIFY_JWKS_URL=${env.SNAPPLIFY_JWKS_URL || "https://auth.snapplify.com/.well-known/jwks.json"}`,
      `SNAPPLIFY_ISSUER=${env.SNAPPLIFY_ISSUER || "https://snapplify.com"}`,
      `ASSET_CONTEXT=${assetContext || "prod"}`
    ].join("\n");
    fs.writeFileSync(path.join(workdir, ".env"), envLines);

    const file = path.join(TEMPLATE_DIR, "docker-compose.branch.yml");
    const envf = path.join(workdir, ".env");
    await composePullUp(file, envf, project, workdir);

    await redis.set(`${host}:platform`, `172.17.0.1:${MAIN_PORTS.PLATFORM}`);
    await redis.set(`${host}:player`,   `172.17.0.1:${MAIN_PORTS.PLAYER}`);
    await redis.set(`${host}:api`,      `172.17.0.1:${MAIN_PORTS.API}`);

    res.json({ ok: true, host, url: `https://${host}/`, ports: MAIN_PORTS, project });
  } catch (e) {
    console.error(e); res.status(500).json({ error: e.message });
  }
});

app.listen(3001, () => console.log("Webhook up on :3001"));
