export const getCurrentBookFromUrl = (): string => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('book') || '';
}