// Book viewer state
import { getPageOffset } from "@/src/pageOffset";
import { pagesContent } from "@/src/book";
import { romanNumeralPages } from "@/src/consts";

let _currentPageIndex = 0;
export const getCurrentPage = () => {
  console.log("getCurrentPage", _currentPageIndex);
  return _currentPageIndex;
};
export const setCurrentPage = (page: number) => {
  _currentPageIndex = page;
}; // Jump to a specific page
// Navigation functions updated for scrolling
export async function goToPreviousPage() {
  if (getCurrentPage() > 0) {
    setCurrentPage(getCurrentPage() - 1);
    const targetPage = document.getElementById(`page-${getCurrentPage()}`);
    if (targetPage) {
      targetPage.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

export async function goToNextPage() {
  if (getCurrentPage() < pagesContent.length - 1) {
    setCurrentPage(getCurrentPage() + 1);
    const targetPage = document.getElementById(`page-${getCurrentPage()}`);
    if (targetPage) {
      targetPage.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

export async function goToPage(pageNumber: string | number) {
  const pageNumberString = pageNumber.toString();
  // Adjust for front matter (page 1 in the UI is actually index romanNumeralPages in the array)
  let targetIndex = parseInt(pageNumberString) - getPageOffset() + romanNumeralPages - 1;

  // Ensure page number is valid
  if (isNaN(targetIndex) || targetIndex < 0) {
    targetIndex = 0;
  } else if (targetIndex >= pagesContent.length) {
    targetIndex = pagesContent.length - 1;
  }

  // Set to the page
  setCurrentPage(targetIndex);
  const targetPage = document.getElementById(`page-${getCurrentPage()}`);
  if (targetPage) {
    targetPage.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
