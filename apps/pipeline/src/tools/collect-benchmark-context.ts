import fs from "fs";
import path from "path";
import { generateTagName } from "../helpers/generateTagName";

type ReferenceCharacter = { name: string; referenceCard?: string; visualGuide?: string };

type ReferenceCardsOutput = { characters?: ReferenceCharacter[] };

type VisualGuideOutput = { characters?: Array<{ name: string; visualGuide?: string }> };

type RewriteManifestRow = {
  provider?: string;
  phase?: string;
  status?: string;
  errorClass?: string;
  errorMessage?: string;
  chapter?: number;
  chunkIndex?: number;
  attemptNumber?: number;
  selectedAsFinal?: boolean;
};

type CliOptions = {
  slug: string;
  referenceRun?: string;
  visualRun?: string;
  rewriteRun?: string;
  outDir?: string;
};

type RunSelection = { runId?: string; dir?: string };

type SelectedRuns = { reference: RunSelection; visual: RunSelection; rewrite: RunSelection };

type ReferenceData = {
  summary: unknown;
  manifest: unknown[];
  gptOutput: ReferenceCardsOutput | null;
  flashOutput: ReferenceCardsOutput | null;
  proOutput: ReferenceCardsOutput | null;
};

type VisualData = {
  scorecard: unknown;
  nameMapping: unknown;
  aOutput: VisualGuideOutput | null;
  cOutput: VisualGuideOutput | null;
};

type RewriteData = { summary: unknown; manifest: RewriteManifestRow[] };

type XmlCoverageStats = {
  referenceCardsTotal: number;
  xmlDetectedTotal: number;
  foundInXmlCount: number;
  foundInXmlPercent: number;
  missingFromXmlsCount: number;
  missingFromXmlsSlugs: string[];
  missingFromReferenceCardsCount: number;
  missingFromReferenceCardsPercent: number;
  missingFromReferenceCardsSlugs: string[];
};

type XmlCoverageReport = {
  rewrittenChapterFiles: number;
  xmlDetectedCharacterSlugs: number;
  providers: { gpt5ReferenceCards: XmlCoverageStats; geminiFlashReferenceCards: XmlCoverageStats };
};

function usageAndExit(): never {
  console.error(`
Usage:
  bun apps/pipeline/src/tools/collect-benchmark-context.ts --slug <book-slug> [options]

Options:
  --reference-run <run-id>   Use specific reference-cards benchmark run
  --visual-run <run-id>      Use specific visual-guide experiment run
  --rewrite-run <run-id>     Use specific rewrite benchmark run
  --out <abs-or-relative>    Output directory for context bundle
`);
  process.exit(1);
}

function parseArgs(argv: string[]): CliOptions {
  const args = [...argv];
  const opts: Partial<CliOptions> = {};

  while (args.length > 0) {
    const token = args.shift();
    if (!token) {
      continue;
    }
    if (token === "--slug") {
      opts.slug = args.shift();
      continue;
    }
    if (token === "--reference-run") {
      opts.referenceRun = args.shift();
      continue;
    }
    if (token === "--visual-run") {
      opts.visualRun = args.shift();
      continue;
    }
    if (token === "--rewrite-run") {
      opts.rewriteRun = args.shift();
      continue;
    }
    if (token === "--out") {
      opts.outDir = args.shift();
      continue;
    }
    usageAndExit();
  }

  if (!opts.slug) {
    usageAndExit();
  }

  return opts as CliOptions;
}

function getRepoRoot(): string {
  return path.resolve(__dirname, "../..");
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function readNdjson<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

function listSubdirs(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function newestSubdir(dir: string): string | undefined {
  const candidates = listSubdirs(dir);
  if (candidates.length === 0) {
    return undefined;
  }

  const sorted = candidates.sort((a, b) => {
    const aMs = fs.statSync(path.join(dir, a)).mtimeMs;
    const bMs = fs.statSync(path.join(dir, b)).mtimeMs;
    return bMs - aMs;
  });
  return sorted[0];
}

function resolveRunDir(
  parentDir: string,
  requestedRunId?: string,
): { runId?: string; dir?: string } {
  if (requestedRunId) {
    const requestedPath = path.join(parentDir, requestedRunId);
    if (!fs.existsSync(requestedPath)) {
      throw new Error(`Requested run does not exist: ${requestedPath}`);
    }
    return { runId: requestedRunId, dir: requestedPath };
  }

  const latest = newestSubdir(parentDir);
  if (!latest) {
    return {};
  }
  return { runId: latest, dir: path.join(parentDir, latest) };
}

function normalizeName(name: string): string {
  return generateTagName(name.trim());
}

function toCharacterMap(
  characters: ReferenceCharacter[] | Array<{ name: string; visualGuide?: string }> | undefined,
): Map<string, ReferenceCharacter> {
  const map = new Map<string, ReferenceCharacter>();
  for (const character of characters || []) {
    const normalized = normalizeName(character.name);
    if (!map.has(normalized)) {
      map.set(normalized, character);
    }
  }
  return map;
}

function buildReferenceCardsComparisonMarkdown(params: {
  runId?: string;
  summary: unknown;
  manifest: unknown[];
  gpt?: ReferenceCardsOutput | null;
  flash?: ReferenceCardsOutput | null;
  pro?: ReferenceCardsOutput | null;
}): string {
  const { runId, summary, manifest, gpt, flash, pro } = params;
  const gptMap = toCharacterMap(gpt?.characters);
  const flashMap = toCharacterMap(flash?.characters);
  const proMap = toCharacterMap(pro?.characters);

  const allNames = Array.from(
    new Set([...gptMap.keys(), ...flashMap.keys(), ...proMap.keys()]),
  ).sort((a, b) => a.localeCompare(b));

  const lines: string[] = [];
  lines.push(`# Reference Cards Comparison`);
  lines.push(`Run: \`${runId || "not-found"}\``);
  lines.push("");
  lines.push(`## Summary JSON`);
  lines.push(`~~~json`);
  lines.push(JSON.stringify(summary ?? {}, null, 2));
  lines.push(`~~~`);
  lines.push("");
  lines.push(`## Manifest NDJSON Rows`);
  lines.push(`~~~json`);
  lines.push(JSON.stringify(manifest ?? [], null, 2));
  lines.push(`~~~`);
  lines.push("");
  lines.push(`## Per-Character Provider Snapshot`);
  lines.push("");

  for (const name of allNames) {
    const g = gptMap.get(name);
    const f = flashMap.get(name);
    const p = proMap.get(name);
    const providerSections = [
      buildProviderSection("gpt-5", g),
      buildProviderSection("gemini-flash", f),
      buildProviderSection("gemini-pro", p),
    ].filter(
      (section): section is { provider: string; fields: Array<{ key: string; value: string }> } =>
        Boolean(section),
    );

    lines.push(`### ${name}`);
    lines.push("~~~yaml");
    for (const section of providerSections) {
      if (section.fields.length === 0) {
        lines.push(`${section.provider}: {}`);
        continue;
      }
      lines.push(`${section.provider}:`);
      for (const field of section.fields) {
        lines.push(`  ${field.key}: ${JSON.stringify(field.value)}`);
      }
    }
    lines.push("~~~");
    lines.push("");
  }

  return lines.join("\n");
}

function buildProviderSection(
  provider: string,
  character: ReferenceCharacter | undefined,
): { provider: string; fields: Array<{ key: string; value: string }> } | null {
  if (!character) {
    return null;
  }
  const fields: Array<{ key: string; value: string }> = [];
  if (character.referenceCard && character.referenceCard.trim().length > 0) {
    fields.push({ key: "referenceCard", value: character.referenceCard });
  }
  if (character.visualGuide && character.visualGuide.trim().length > 0) {
    fields.push({ key: "visualGuide", value: character.visualGuide });
  }
  return { provider, fields };
}

function buildVisualGuideComparisonMarkdown(params: {
  runId?: string;
  scorecard: unknown;
  nameMapping: unknown;
  aOutput?: VisualGuideOutput | null;
  cOutput?: VisualGuideOutput | null;
}): string {
  const { runId, scorecard, nameMapping, aOutput, cOutput } = params;
  const aMap = toCharacterMap(aOutput?.characters);
  const cMap = toCharacterMap(cOutput?.characters);
  const allNames = Array.from(new Set([...aMap.keys(), ...cMap.keys()])).sort((a, b) =>
    a.localeCompare(b),
  );

  const lines: string[] = [];
  lines.push(`# Visual Guide A vs C Comparison`);
  lines.push(`Run: \`${runId || "not-found"}\``);
  lines.push("");
  lines.push(`## Scorecard JSON`);
  lines.push("~~~json");
  lines.push(JSON.stringify(scorecard ?? {}, null, 2));
  lines.push("~~~");
  lines.push("");
  lines.push(`## Name Mapping JSON`);
  lines.push("~~~json");
  lines.push(JSON.stringify(nameMapping ?? {}, null, 2));
  lines.push("~~~");
  lines.push("");
  lines.push(
    `## Per-Character Guide Snapshot (A old-prompt Gemini vs C reference-cards visualGuide)`,
  );
  lines.push("");

  for (const name of allNames) {
    const aGuide = aMap.get(name)?.visualGuide;
    const cGuide = cMap.get(name)?.visualGuide;
    const providerSections = [
      buildVisualProviderSection("A", aMap.has(name), aGuide),
      buildVisualProviderSection("C", cMap.has(name), cGuide),
    ].filter(
      (section): section is { provider: string; fields: Array<{ key: string; value: string }> } =>
        Boolean(section),
    );

    lines.push(`### ${name}`);
    lines.push("~~~yaml");
    for (const section of providerSections) {
      if (section.fields.length === 0) {
        lines.push(`${section.provider}: {}`);
        continue;
      }
      lines.push(`${section.provider}:`);
      for (const field of section.fields) {
        lines.push(`  ${field.key}: ${JSON.stringify(field.value)}`);
      }
    }
    lines.push("~~~");
    lines.push("");
  }

  return lines.join("\n");
}

function buildVisualProviderSection(
  provider: string,
  present: boolean,
  guide: string | undefined,
): { provider: string; fields: Array<{ key: string; value: string }> } | null {
  if (!present) {
    return null;
  }
  const fields: Array<{ key: string; value: string }> = [];
  if (guide && guide.trim().length > 0) {
    fields.push({ key: "visualGuide", value: guide });
  }
  return { provider, fields };
}

function buildRewriteReportMarkdown(params: {
  runId?: string;
  summary: unknown;
  manifest: RewriteManifestRow[];
}): string {
  const { runId, summary, manifest } = params;
  const failures = manifest.filter((row) => row.status === "failure");
  const geminiFailures = failures.filter((row) => row.provider === "gemini");
  const vertexFailures = failures.filter((row) => row.provider === "vertex");
  const gptFailures = failures.filter((row) => row.provider === "gpt-5");
  const grokFailures = failures.filter((row) => row.provider === "grok");

  const lines: string[] = [];
  lines.push(`# Rewrite Benchmark Report`);
  lines.push(`Run: \`${runId || "not-found"}\``);
  lines.push("");
  lines.push(`## Summary JSON`);
  lines.push("~~~json");
  lines.push(JSON.stringify(summary ?? {}, null, 2));
  lines.push("~~~");
  lines.push("");
  lines.push(`## Failure Breakdown`);
  lines.push(`- total_failures: ${failures.length}`);
  lines.push(`- gemini_failures: ${geminiFailures.length}`);
  lines.push(`- vertex_failures: ${vertexFailures.length}`);
  lines.push(`- gpt5_failures: ${gptFailures.length}`);
  lines.push(`- grok_failures: ${grokFailures.length}`);
  lines.push("");
  lines.push(`## Full Failure Rows`);
  lines.push("~~~json");
  lines.push(JSON.stringify(failures, null, 2));
  lines.push("~~~");
  lines.push("");
  lines.push(`## Full Manifest Rows`);
  lines.push("~~~json");
  lines.push(JSON.stringify(manifest, null, 2));
  lines.push("~~~");
  lines.push("");

  return lines.join("\n");
}

function buildChapterSummaryArtifactsSection(tempOutputDir: string): string {
  const promptRegex = /^prompt-summaries-with-paragraphs-(\d+)\.txt$/;
  const summaryRegex = /^summaries-with-paragraphs-(\d+)\.json$/;

  const files = fs.existsSync(tempOutputDir) ? fs.readdirSync(tempOutputDir) : [];
  const promptChapters = files
    .map((file) => file.match(promptRegex))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => Number.parseInt(match[1], 10))
    .sort((a, b) => a - b);
  const summaryChapters = files
    .map((file) => file.match(summaryRegex))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => Number.parseInt(match[1], 10))
    .sort((a, b) => a - b);

  const promptSet = new Set(promptChapters);
  const summarySet = new Set(summaryChapters);
  const promptsWithoutSummary = promptChapters.filter((ch) => !summarySet.has(ch));
  const summariesWithoutPrompt = summaryChapters.filter((ch) => !promptSet.has(ch));

  return [
    `## Chapter Summary Queue Artifacts`,
    `- prompts_count: ${promptChapters.length}`,
    `- summaries_count: ${summaryChapters.length}`,
    `- prompts_without_summary: ${promptsWithoutSummary.length > 0 ? promptsWithoutSummary.join(", ") : "<none>"}`,
    `- summaries_without_prompt: ${summariesWithoutPrompt.length > 0 ? summariesWithoutPrompt.join(", ") : "<none>"}`,
    `- note: current chapter-summary queue path does not emit a per-provider manifest; inspect pipeline logs for provider-call failures.`,
  ].join("\n");
}

function extractVisualGuides(
  output: VisualGuideOutput | ReferenceCardsOutput | null | undefined,
): Array<{ name: string; visualGuide?: string }> {
  return (output?.characters || []).map((character) => ({
    name: character.name,
    visualGuide: character.visualGuide,
  }));
}

function appendVisualGuideSection(
  lines: string[],
  title: string,
  guides: Array<{ name: string; visualGuide?: string }>,
): void {
  lines.push(`## ${title}`);
  lines.push("");
  for (const guide of guides) {
    lines.push(`### ${guide.name}`);
    lines.push(
      guide.visualGuide && guide.visualGuide.trim().length > 0 ? guide.visualGuide : "<empty>",
    );
    lines.push("");
  }
}

function buildRawVisualGuidesMarkdown(params: {
  visualA: VisualGuideOutput | null;
  referenceGpt: ReferenceCardsOutput | null;
  referenceFlash: ReferenceCardsOutput | null;
}): string {
  const lines: string[] = [];
  appendVisualGuideSection(lines, "legacyVisualGuidesA", extractVisualGuides(params.visualA));
  appendVisualGuideSection(
    lines,
    "referenceCardsGpt5VisualGuides",
    extractVisualGuides(params.referenceGpt),
  );
  appendVisualGuideSection(
    lines,
    "referenceCardsGeminiFlashVisualGuides",
    extractVisualGuides(params.referenceFlash),
  );
  return lines.join("\n");
}

function extractXmlAttributeValues(xml: string, attribute: string): string[] {
  const regex = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "gi");
  const values: string[] = [];
  let match: RegExpExecArray | null = regex.exec(xml);
  while (match) {
    values.push(match[1]);
    match = regex.exec(xml);
  }
  return values;
}

function splitSlugTokens(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function listRewrittenChapterFiles(tempOutputDir: string): string[] {
  const chapterFilePattern = /^rewritten-paragraphs-for-chapter-\d+\.xml$/;
  if (!fs.existsSync(tempOutputDir)) {
    return [];
  }
  return fs
    .readdirSync(tempOutputDir)
    .filter((fileName) => chapterFilePattern.test(fileName))
    .sort((a, b) => {
      const chapterA = Number.parseInt(a.replace(/\D/g, ""), 10);
      const chapterB = Number.parseInt(b.replace(/\D/g, ""), 10);
      return chapterA - chapterB;
    });
}

function collectXmlDetectedSlugs(tempOutputDir: string): {
  rewrittenChapterFiles: string[];
  slugs: string[];
} {
  const rewrittenChapterFiles = listRewrittenChapterFiles(tempOutputDir);
  const slugs = new Set<string>();

  for (const fileName of rewrittenChapterFiles) {
    const xmlPath = path.join(tempOutputDir, fileName);
    const xml = fs.readFileSync(xmlPath, "utf8");

    const dataCValues = extractXmlAttributeValues(xml, "data-c");
    for (const value of dataCValues) {
      for (const token of splitSlugTokens(value)) {
        const normalized = normalizeName(token);
        if (normalized.length > 0) {
          slugs.add(normalized);
        }
      }
    }

    const dataSpeakerValues = extractXmlAttributeValues(xml, "data-speaker");
    for (const value of dataSpeakerValues) {
      for (const token of splitSlugTokens(value)) {
        const normalized = normalizeName(token);
        if (normalized.length > 0) {
          slugs.add(normalized);
        }
      }
    }
  }

  return { rewrittenChapterFiles, slugs: Array.from(slugs).sort((a, b) => a.localeCompare(b)) };
}

function collectProviderCharacterSlugs(output: ReferenceCardsOutput | null | undefined): string[] {
  const unique = new Set<string>();
  for (const character of output?.characters || []) {
    const normalized = normalizeName(character.name);
    if (normalized.length > 0) {
      unique.add(normalized);
    }
  }
  return Array.from(unique).sort((a, b) => a.localeCompare(b));
}

function computeCoverageStats(providerSlugs: string[], xmlSlugSet: Set<string>): XmlCoverageStats {
  const xmlSlugs = Array.from(xmlSlugSet).sort((a, b) => a.localeCompare(b));
  const providerSlugSet = new Set(providerSlugs);

  const foundInXml = providerSlugs.filter((slug) => xmlSlugSet.has(slug));
  const missingFromXmls = providerSlugs.filter((slug) => !xmlSlugSet.has(slug));
  const missingFromReferenceCards = xmlSlugs.filter((slug) => !providerSlugSet.has(slug));

  const referenceCardsTotal = providerSlugs.length;
  const xmlDetectedTotal = xmlSlugs.length;
  const foundInXmlCount = foundInXml.length;
  const missingFromXmlsCount = missingFromXmls.length;
  const missingFromReferenceCardsCount = missingFromReferenceCards.length;
  const foundInXmlPercent =
    referenceCardsTotal === 0
      ? 0
      : Number(((foundInXmlCount / referenceCardsTotal) * 100).toFixed(2));
  const missingFromReferenceCardsPercent =
    xmlDetectedTotal === 0
      ? 0
      : Number(((missingFromReferenceCardsCount / xmlDetectedTotal) * 100).toFixed(2));

  return {
    referenceCardsTotal,
    xmlDetectedTotal,
    foundInXmlCount,
    foundInXmlPercent,
    missingFromXmlsCount,
    missingFromXmlsSlugs: missingFromXmls,
    missingFromReferenceCardsCount,
    missingFromReferenceCardsPercent,
    missingFromReferenceCardsSlugs: missingFromReferenceCards,
  };
}

function buildXmlCoverageReport(params: {
  tempOutputDir: string;
  referenceGpt: ReferenceCardsOutput | null;
  referenceFlash: ReferenceCardsOutput | null;
}): XmlCoverageReport {
  const xmlDetected = collectXmlDetectedSlugs(params.tempOutputDir);
  const xmlSlugSet = new Set(xmlDetected.slugs);
  const gptSlugs = collectProviderCharacterSlugs(params.referenceGpt);
  const flashSlugs = collectProviderCharacterSlugs(params.referenceFlash);

  return {
    rewrittenChapterFiles: xmlDetected.rewrittenChapterFiles.length,
    xmlDetectedCharacterSlugs: xmlDetected.slugs.length,
    providers: {
      gpt5ReferenceCards: computeCoverageStats(gptSlugs, xmlSlugSet),
      geminiFlashReferenceCards: computeCoverageStats(flashSlugs, xmlSlugSet),
    },
  };
}

function buildXmlCoverageMarkdown(report: XmlCoverageReport): string {
  return [
    `# XML Character Coverage`,
    ``,
    `- rewritten_chapter_files: ${report.rewrittenChapterFiles}`,
    `- xml_detected_character_slugs: ${report.xmlDetectedCharacterSlugs}`,
    ``,
    `## gpt5ReferenceCards`,
    `- referenceCardsTotal: ${report.providers.gpt5ReferenceCards.referenceCardsTotal}`,
    `- xmlDetectedTotal: ${report.providers.gpt5ReferenceCards.xmlDetectedTotal}`,
    `- foundInXmlCount: ${report.providers.gpt5ReferenceCards.foundInXmlCount}`,
    `- foundInXmlPercent: ${report.providers.gpt5ReferenceCards.foundInXmlPercent}`,
    `- missingFromXmlsCount: ${report.providers.gpt5ReferenceCards.missingFromXmlsCount}`,
    `- missingFromXmlsSlugs: ${report.providers.gpt5ReferenceCards.missingFromXmlsSlugs.length > 0 ? report.providers.gpt5ReferenceCards.missingFromXmlsSlugs.join(", ") : "<none>"}`,
    `- missingFromReferenceCardsCount: ${report.providers.gpt5ReferenceCards.missingFromReferenceCardsCount}`,
    `- missingFromReferenceCardsPercent: ${report.providers.gpt5ReferenceCards.missingFromReferenceCardsPercent}`,
    `- missingFromReferenceCardsSlugs: ${report.providers.gpt5ReferenceCards.missingFromReferenceCardsSlugs.length > 0 ? report.providers.gpt5ReferenceCards.missingFromReferenceCardsSlugs.join(", ") : "<none>"}`,
    ``,
    `## geminiFlashReferenceCards`,
    `- referenceCardsTotal: ${report.providers.geminiFlashReferenceCards.referenceCardsTotal}`,
    `- xmlDetectedTotal: ${report.providers.geminiFlashReferenceCards.xmlDetectedTotal}`,
    `- foundInXmlCount: ${report.providers.geminiFlashReferenceCards.foundInXmlCount}`,
    `- foundInXmlPercent: ${report.providers.geminiFlashReferenceCards.foundInXmlPercent}`,
    `- missingFromXmlsCount: ${report.providers.geminiFlashReferenceCards.missingFromXmlsCount}`,
    `- missingFromXmlsSlugs: ${report.providers.geminiFlashReferenceCards.missingFromXmlsSlugs.length > 0 ? report.providers.geminiFlashReferenceCards.missingFromXmlsSlugs.join(", ") : "<none>"}`,
    `- missingFromReferenceCardsCount: ${report.providers.geminiFlashReferenceCards.missingFromReferenceCardsCount}`,
    `- missingFromReferenceCardsPercent: ${report.providers.geminiFlashReferenceCards.missingFromReferenceCardsPercent}`,
    `- missingFromReferenceCardsSlugs: ${report.providers.geminiFlashReferenceCards.missingFromReferenceCardsSlugs.length > 0 ? report.providers.geminiFlashReferenceCards.missingFromReferenceCardsSlugs.join(", ") : "<none>"}`,
    ``,
  ].join("\n");
}

function writeText(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function safeCopyDir(sourceDir: string | undefined, targetDir: string): void {
  if (!sourceDir || !fs.existsSync(sourceDir)) {
    return;
  }
  ensureDir(path.dirname(targetDir));
  fs.cpSync(sourceDir, targetDir, { recursive: true });
}

function timestampForDir(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function resolveOutputDir(repoRoot: string, tempOutputDir: string, outDirOption?: string): string {
  const outDir =
    outDirOption && outDirOption.length > 0
      ? path.isAbsolute(outDirOption)
        ? outDirOption
        : path.join(repoRoot, outDirOption)
      : path.join(tempOutputDir, "benchmark-context", timestampForDir());
  ensureDir(outDir);
  return outDir;
}

function resolveSelectedRuns(tempOutputDir: string, options: CliOptions): SelectedRuns {
  const referenceParent = path.join(tempOutputDir, "reference-cards-benchmarks");
  const visualParent = path.join(tempOutputDir, "visual-guide-experiments");
  const rewriteParent = path.join(tempOutputDir, "rewrite-benchmarks");

  return {
    reference: resolveRunDir(referenceParent, options.referenceRun),
    visual: resolveRunDir(visualParent, options.visualRun),
    rewrite: resolveRunDir(rewriteParent, options.rewriteRun),
  };
}

function copyRawArtifacts(outDir: string, runs: SelectedRuns): void {
  const rawDir = path.join(outDir, "raw");
  safeCopyDir(
    runs.reference.dir,
    path.join(rawDir, "reference-cards-benchmarks", runs.reference.runId || "missing"),
  );
  safeCopyDir(
    runs.visual.dir,
    path.join(rawDir, "visual-guide-experiments", runs.visual.runId || "missing"),
  );
  safeCopyDir(
    runs.rewrite.dir,
    path.join(rawDir, "rewrite-benchmarks", runs.rewrite.runId || "missing"),
  );
}

function loadReferenceData(runDir?: string): ReferenceData {
  const file = (relativePath: string): string => (runDir ? path.join(runDir, relativePath) : "");
  return {
    summary: readJsonFile<unknown>(file("summary.json")),
    manifest: readNdjson<unknown>(file("manifest.ndjson")),
    gptOutput: readJsonFile<ReferenceCardsOutput>(file(path.join("outputs", "gpt-5.json"))),
    flashOutput: readJsonFile<ReferenceCardsOutput>(
      file(path.join("outputs", "gemini-flash.json")),
    ),
    proOutput: readJsonFile<ReferenceCardsOutput>(file(path.join("outputs", "gemini-pro.json"))),
  };
}

function loadVisualData(runDir?: string): VisualData {
  const file = (relativePath: string): string => (runDir ? path.join(runDir, relativePath) : "");
  return {
    scorecard: readJsonFile<unknown>(file("scorecard.json")),
    nameMapping: readJsonFile<unknown>(file("name-mapping.json")),
    aOutput: readJsonFile<VisualGuideOutput>(file("a-output.json")),
    cOutput: readJsonFile<VisualGuideOutput>(file("c-output.json")),
  };
}

function loadRewriteData(runDir?: string): RewriteData {
  const file = (relativePath: string): string => (runDir ? path.join(runDir, relativePath) : "");
  return {
    summary: readJsonFile<unknown>(file("summary.json")),
    manifest: readNdjson<RewriteManifestRow>(file("manifest.ndjson")),
  };
}

function buildIndexMarkdown(params: {
  slug: string;
  outDir: string;
  referenceRunId?: string;
  visualRunId?: string;
  rewriteRunId?: string;
  chapterSection: string;
}): string {
  return [
    `# Pipeline Benchmark Context Bundle`,
    ``,
    `book_slug: \`${params.slug}\``,
    `generated_at: \`${new Date().toISOString()}\``,
    `output_dir: \`${params.outDir}\``,
    ``,
    `selected_reference_cards_run: \`${params.referenceRunId || "not-found"}\``,
    `selected_visual_guide_run: \`${params.visualRunId || "not-found"}\``,
    `selected_rewrite_run: \`${params.rewriteRunId || "not-found"}\``,
    ``,
    `## Files`,
    `- \`reference-cards-comparison.md\``,
    `- \`visual-guide-comparison.md\``,
    `- \`rewrite-report.md\``,
    `- \`raw-visual-guides-comparison.md\` (legacy A vs reference-cards GPT-5 vs Gemini Flash)`,
    `- \`xml-character-coverage.md\``,
    `- \`xml-character-coverage.json\``,
    `- \`ai-context-full.md\` (single paste-friendly file)`,
    ``,
    params.chapterSection,
    ``,
  ].join("\n");
}

function writeBundleFiles(params: {
  outDir: string;
  slug: string;
  referenceRunId?: string;
  visualRunId?: string;
  rewriteRunId?: string;
  referenceMd: string;
  visualMd: string;
  rewriteMd: string;
  chapterSection: string;
  rawVisualGuidesMd: string;
  xmlCoverageMd: string;
  xmlCoverageReport: XmlCoverageReport;
}): void {
  const indexMd = buildIndexMarkdown({
    slug: params.slug,
    outDir: params.outDir,
    referenceRunId: params.referenceRunId,
    visualRunId: params.visualRunId,
    rewriteRunId: params.rewriteRunId,
    chapterSection: params.chapterSection,
  });

  const fullMd = [
    indexMd,
    `---`,
    params.referenceMd,
    `---`,
    params.visualMd,
    `---`,
    params.rewriteMd,
    `---`,
    params.xmlCoverageMd,
  ].join("\n\n");

  writeText(path.join(params.outDir, "README.md"), indexMd);
  writeText(path.join(params.outDir, "reference-cards-comparison.md"), params.referenceMd);
  writeText(path.join(params.outDir, "visual-guide-comparison.md"), params.visualMd);
  writeText(path.join(params.outDir, "rewrite-report.md"), params.rewriteMd);
  writeText(path.join(params.outDir, "raw-visual-guides-comparison.md"), params.rawVisualGuidesMd);
  writeText(path.join(params.outDir, "xml-character-coverage.md"), params.xmlCoverageMd);
  writeText(
    path.join(params.outDir, "xml-character-coverage.json"),
    JSON.stringify(params.xmlCoverageReport, null, 2),
  );
  writeText(path.join(params.outDir, "ai-context-full.md"), fullMd);

  const machineBundle = {
    bookSlug: params.slug,
    generatedAt: new Date().toISOString(),
    selectedRuns: {
      referenceCards: params.referenceRunId || null,
      visualGuide: params.visualRunId || null,
      rewrite: params.rewriteRunId || null,
    },
    chapterSummaryArtifacts: params.chapterSection,
  };
  writeText(path.join(params.outDir, "bundle.json"), JSON.stringify(machineBundle, null, 2));
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = getRepoRoot();
  const bookDir = path.join(repoRoot, "books-data", options.slug);
  const tempOutputDir = path.join(bookDir, "temporary-output");

  if (!fs.existsSync(tempOutputDir)) {
    throw new Error(`temporary-output does not exist: ${tempOutputDir}`);
  }

  const selectedRuns = resolveSelectedRuns(tempOutputDir, options);
  const outDir = resolveOutputDir(repoRoot, tempOutputDir, options.outDir);
  copyRawArtifacts(outDir, selectedRuns);

  const referenceData = loadReferenceData(selectedRuns.reference.dir);
  const visualData = loadVisualData(selectedRuns.visual.dir);
  const rewriteData = loadRewriteData(selectedRuns.rewrite.dir);

  const referenceMd = buildReferenceCardsComparisonMarkdown({
    runId: selectedRuns.reference.runId,
    summary: referenceData.summary,
    manifest: referenceData.manifest,
    gpt: referenceData.gptOutput,
    flash: referenceData.flashOutput,
    pro: referenceData.proOutput,
  });

  const visualMd = buildVisualGuideComparisonMarkdown({
    runId: selectedRuns.visual.runId,
    scorecard: visualData.scorecard,
    nameMapping: visualData.nameMapping,
    aOutput: visualData.aOutput,
    cOutput: visualData.cOutput,
  });

  const rewriteMd = buildRewriteReportMarkdown({
    runId: selectedRuns.rewrite.runId,
    summary: rewriteData.summary,
    manifest: rewriteData.manifest,
  });
  const xmlCoverageReport = buildXmlCoverageReport({
    tempOutputDir,
    referenceGpt: referenceData.gptOutput,
    referenceFlash: referenceData.flashOutput,
  });
  const xmlCoverageMd = buildXmlCoverageMarkdown(xmlCoverageReport);

  const chapterSection = buildChapterSummaryArtifactsSection(tempOutputDir);
  const rawVisualGuidesMd = buildRawVisualGuidesMarkdown({
    visualA: visualData.aOutput,
    referenceGpt: referenceData.gptOutput,
    referenceFlash: referenceData.flashOutput,
  });
  writeBundleFiles({
    outDir,
    slug: options.slug,
    referenceRunId: selectedRuns.reference.runId,
    visualRunId: selectedRuns.visual.runId,
    rewriteRunId: selectedRuns.rewrite.runId,
    referenceMd,
    visualMd,
    rewriteMd,
    chapterSection,
    rawVisualGuidesMd,
    xmlCoverageMd,
    xmlCoverageReport,
  });

  console.log(`Context bundle ready: ${outDir}`);
  console.log(`Paste-ready file: ${path.join(outDir, "ai-context-full.md")}`);
}

main();
