import { goToInitialLocationFromHash } from "@/helpers/paragraphsNavigation";

export async function initPage() {
  setTimeout(() => {
    goToInitialLocationFromHash();
  }, 100);
}
