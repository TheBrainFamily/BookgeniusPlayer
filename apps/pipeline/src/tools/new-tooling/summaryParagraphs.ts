export function buildParagraphsForSummary(paragraphs: { text: string; dataIndex: number }[]) {
  return paragraphs
    .map((paragraph) => `<p id="${paragraph.dataIndex}">${paragraph.text.trim()}</p>`)
    .join("\n");
}
