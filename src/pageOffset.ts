let pageOffset: number | undefined;
export const getPageOffset = (): number => {
  if (!pageOffset) {
    const savedPageOffset = parseInt(localStorage.getItem("pageOffset") || "") || 0;
    if (!isNaN(savedPageOffset)) {
      setPageOffset(savedPageOffset);
    }
  }
  return pageOffset as number;
};
export const setPageOffset = (value: number) => {
  pageOffset = value;
  localStorage.setItem("pageOffset", `${pageOffset}`);
};