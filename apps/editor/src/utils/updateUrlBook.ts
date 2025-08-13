export const updateUrlBook = (bookName: string) => {
  const newUrl = new URL(window.location.href);
  newUrl.searchParams.set('book', bookName)
  window.history.pushState({}, '', newUrl.toString())
}