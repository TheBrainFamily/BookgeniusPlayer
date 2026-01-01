#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { createGraphicalStyleFromCover } from "./new-tooling/create-graphical-style";

interface SEMetadata {
  slug: string;
  title: string;
  author: string;
  description: string;
  longDescription: string;
  wordCount: number;
  subjects: string[];
  coverArtist?: string;
}

async function main() {
  const slug = process.argv[2] || "james-joyce_dubliners";

  const bookDir = path.resolve(__dirname, `../../standardebooks-data/books/${slug}`);
  const metadataPath = path.join(bookDir, "metadata.json");
  const coverPath = path.join(bookDir, "images/cover.jpg");

  if (!fs.existsSync(metadataPath)) {
    console.error(`Book not found: ${slug}`);
    console.error(`Expected metadata at: ${metadataPath}`);
    process.exit(1);
  }

  const metadata: SEMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

  console.log("=".repeat(60));
  console.log("STANDARD EBOOKS STYLE GENERATION TEST");
  console.log("=".repeat(60));
  console.log(`Book: ${metadata.title}`);
  console.log(`Author: ${metadata.author}`);
  console.log(`Cover Artist: ${metadata.coverArtist || "Unknown"}`);
  console.log("=".repeat(60));

  if (!fs.existsSync(coverPath)) {
    console.error(`Cover image not found at: ${coverPath}`);
    process.exit(1);
  }

  const coverImageBuffer = fs.readFileSync(coverPath);
  const coverImageBase64 = coverImageBuffer.toString("base64");

  const textDir = path.join(bookDir, "text");
  let bookText = "";
  if (fs.existsSync(textDir)) {
    const textFiles = fs
      .readdirSync(textDir)
      .filter((f) => f.endsWith(".xhtml"))
      .slice(0, 3);
    for (const file of textFiles) {
      const content = fs.readFileSync(path.join(textDir, file), "utf-8");
      bookText += content.replace(/<[^>]+>/g, " ").substring(0, 3000) + "\n\n";
      if (bookText.length > 5000) break;
    }
  }

  console.log("\nGenerating style from cover image...\n");

  const style = await createGraphicalStyleFromCover(
    `${metadata.title} by ${metadata.author}`,
    bookText || metadata.longDescription || metadata.description,
    coverImageBase64,
    metadata.coverArtist,
    "image/jpeg",
  );

  console.log("GENERATED STYLE:");
  console.log("=".repeat(60));
  console.log(JSON.stringify(style, null, 2));
  console.log("=".repeat(60));

  const outputPath = path.join(bookDir, "graphicalStyle.json");
  fs.writeFileSync(outputPath, JSON.stringify(style, null, 2));
  console.log(`\nSaved to: ${outputPath}`);
}

main().catch(console.error);
