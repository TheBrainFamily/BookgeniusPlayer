export function formatSummaryHTML(summary: string = ""): string {
  return summary.replace(/\n\n/g, "<br/>").replace(/\n/g, "<br/>").replace(/•/g, "");
}
