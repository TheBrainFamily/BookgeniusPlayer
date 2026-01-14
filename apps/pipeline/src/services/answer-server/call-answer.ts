import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(__dirname, "../../../../.env") });

const BASE_URL = "https://questions.bookgenius.net";

async function main() {
  const args = process.argv.slice(2);
  const llmMode = args.includes("--llm");
  const jsonArgs = args.filter((a) => a !== "--llm");

  if (jsonArgs.length === 0) {
    console.log(`Usage: bun ./call-answer.ts '<json>' [--llm]
Example: bun ./call-answer.ts '{"searchQuery": "who is the main character", "filter": {"chapterFrom":0,"chapterTo":4,"paragraphTo":6,"bookSlug":"1766867074631-dolega-mostowicz-prokurator-alicja-horn"}}'
--llm: Trim text to first 10 chars for LLM-friendly output`);
    process.exit(1);
  }

  const input = JSON.parse(jsonArgs[0]);
  const { searchQuery, filter } = input;

  if (!searchQuery || !filter) {
    console.error("Missing searchQuery or filter in input");
    process.exit(1);
  }

  const secretPass = process.env.ANSWERS_SECRET_PASS;
  if (!secretPass) {
    console.error("ANSWERS_SECRET_PASS not found in environment");
    process.exit(1);
  }

  const params = new URLSearchParams({ searchQuery, filter: JSON.stringify(filter) });

  const url = `${BASE_URL}/getParagraphsForSearch?${params}`;
  console.log("Calling:", url);
  console.log("Filter:", JSON.stringify(filter, null, 2));

  const response = await fetch(url, {
    method: "GET",
    headers: { "x-secret-pass": secretPass, "x-local-pass": secretPass },
  });

  if (!response.ok) {
    console.error("Error:", response.status, response.statusText);
    const text = await response.text();
    console.error("Body:", text);
    process.exit(1);
  }

  const data = await response.json();
  console.log("\nResults:", data.length);

  if (llmMode) {
    const trimmed = data.map((item: { text?: string; [key: string]: unknown }) => ({
      ...item,
      text: item.text ? item.text.slice(0, 10) + "..." : item.text,
    }));
    console.log(JSON.stringify(trimmed, null, 2));
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

main().catch(console.error);
