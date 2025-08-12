export const updateUrlView = (view: string) => {
  const newUrl = new URL(window.location.href);
  newUrl.searchParams.set('view', view);
  window.history.pushState({}, '', newUrl.toString());
};

export const getCurrentViewFromUrl = (): string => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('view') || 'editor';
};

export const navigateToChangesView = () => {
  updateUrlView('changes');
  // Trigger a custom event to notify the app of the view change
  window.dispatchEvent(new Event('viewchange'));
};

export const navigateToEditorView = () => {
  updateUrlView('editor');
  // Trigger a custom event to notify the app of the view change
  window.dispatchEvent(new Event('viewchange'));
};