export function returnDemoChapterNumbers(metadataContent: string): number[] {
  let demoChapters = [];
  // Check for DemoChapters in metadata
  const demoChaptersMatch = metadataContent.match(/<DemoChapters>([^<]+)<\/DemoChapters>/);
  if (demoChaptersMatch) {
    demoChapters = demoChaptersMatch[1].split(",").map((num) => parseInt(num.trim()));
  } else {
    // Default: 1 chapter for normal books, 2 for plays
    const formMatch = metadataContent.match(/<Form>([^<]+)<\/Form>/);
    const isPlay = formMatch && formMatch[1].toLowerCase() === "play";
    demoChapters = isPlay ? [1, 2] : [1];
  }
  return demoChapters;
}
