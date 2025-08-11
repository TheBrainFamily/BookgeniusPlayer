export const getCurrentChapterFromUrl = (): string => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('chapter')?.replace('.xml', '') || '';
}