#!/usr/bin/env tsx
import path from "path";
import { processBook } from "./processBook";

const bookPath = path.join(__dirname, "..", "public_books", "Romeo-And-Juliet-Small");
const destDir = path.join(__dirname, "..", "public", "books");

console.log("Testing demo book generation...");

processBook(bookPath, destDir, true).then((result) => {
  if (result.success) {
    console.log("✅ Demo book processed successfully");
  } else {
    console.error("❌ Demo processing failed:", result.error);
  }
});
