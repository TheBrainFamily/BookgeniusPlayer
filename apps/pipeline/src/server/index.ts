import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { appRouter } from "./router";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

const app = express();
app.use(cors({ origin: [/^http:\/\/localhost:\d+$/], credentials: false }));

// Simple health
app.get("/health", (_req, res) => {
  res.send("ok");
});

// Upload endpoint via streaming PUT. Query param: name
// Example client: fetch('/upload?name=book.epub', { method: 'PUT', body: file })
app.put("/upload", (req, res) => {
  const name = (req.query.name as string) || `upload-${Date.now()}.epub`;
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  // Prevent path traversal
  const safeName = path.basename(name);
  const destPath = path.join(uploadsDir, `${Date.now()}-${safeName}`);
  const ws = fs.createWriteStream(destPath);
  req.pipe(ws);
  ws.on("finish", () => res.json({ path: destPath }));
  ws.on("error", (err) => {
    console.error("Upload error", err);
    res.status(500).json({ error: "Upload failed" });
  });
});

// tRPC handler mounted under /trpc
const handler = createHTTPHandler({ router: appRouter });

app.use("/trpc", cors({ origin: [/^http:\/\/localhost:\d+$/] }), (req, res) => handler(req, res));

app.get("/preview/:slug/:filename", (req, res) => {
  const { slug, filename } = req.params;
  const safeName = path.basename(filename);
  const safeSlug = path.basename(slug);
  const filePath = path.join(
    __dirname,
    "../../books-data",
    safeSlug,
    "output",
    "style-previews",
    safeName,
  );

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Preview not found" });
    return;
  }

  res.sendFile(filePath);
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

// Serve packaged downloads
const downloadsDir = path.join(__dirname, "../downloads");
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
app.use("/downloads", express.static(downloadsDir));

// Serve Standard Ebooks covers directly
app.get("/se-cover/:slug", (req, res) => {
  const safeSlug = path.basename(req.params.slug);
  const coverPath = path.join(
    __dirname,
    "../../standardebooks-data/books",
    safeSlug,
    "images",
    "cover.jpg",
  );

  if (!fs.existsSync(coverPath)) {
    res.status(404).send("Cover not found");
    return;
  }

  res.sendFile(coverPath);
});
