export const updateUrlChapter = (chapter: string) => {
  const chapterFile = chapter.endsWith('.xml') ? chapter : `${chapter}.xml`;
  const newUrl = new URL(window.location.href);
  newUrl.searchParams.set('chapter', chapterFile)
  window.history.pushState({}, '', newUrl.toString())
}