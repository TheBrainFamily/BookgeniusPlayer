/**
 * Element Visibility Manager
 *
 * Manages visibility of optional elements and progress indicator based on:
 * - Screen taps (toggle visibility)
 * - Scroll events (show progress indicator only)
 * - Inactivity timer (hide elements automatically)
 */

export class ElementVisibilityManager {
  private areElementsVisible: boolean = true;
  private inactivityTimer: number | null = null;
  private isInitialized: boolean = false;
  private scrollTimer: number | null = null;
  private isScrollMode: boolean = false;

  private readonly INACTIVITY_TIMEOUT = 8000;
  private readonly SCROLL_HIDE_DELAY = 3000;

  private applyTransition(elements: NodeListOf<HTMLElement>, duration: string = "0.3s"): void {
    elements.forEach((element) => {
      if (!element.style.transition || element.style.transition === "none") {
        element.style.transition = `opacity ${duration} ease-in-out`;
      }
    });
  }

  private showOptionalElements(): void {
    const optionalElements = document.querySelectorAll(".optional-element") as NodeListOf<HTMLElement>;
    this.applyTransition(optionalElements, "0.4s");

    optionalElements.forEach((element) => {
      element.style.opacity = "1";
      element.style.pointerEvents = "auto";
    });
  }

  private hideOptionalElements(): void {
    const optionalElements = document.querySelectorAll(".optional-element") as NodeListOf<HTMLElement>;
    this.applyTransition(optionalElements, "3s");

    optionalElements.forEach((element) => {
      element.style.opacity = "0";
      element.style.pointerEvents = "none";
    });
  }

  private showProgressIndicator(): void {
    const progressIndicator = document.querySelector(".progress-indicator") as HTMLElement;
    if (!progressIndicator) return;

    if (!progressIndicator.style.transition || progressIndicator.style.transition === "none") {
      progressIndicator.style.transition = "opacity 0.2s ease-in-out";
    }
    progressIndicator.style.opacity = "1";
    progressIndicator.style.pointerEvents = "auto";
  }

  private hideProgressIndicator(): void {
    const progressIndicator = document.querySelector(".progress-indicator") as HTMLElement;
    if (!progressIndicator) return;

    if (!progressIndicator.style.transition || progressIndicator.style.transition === "none") {
      progressIndicator.style.transition = "opacity 3s ease-in-out";
    }
    progressIndicator.style.opacity = "0";
    progressIndicator.style.pointerEvents = "none";
  }

  private showAllElements(): void {
    this.areElementsVisible = true;
    this.showOptionalElements();
    this.showProgressIndicator();
  }

  private resetInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }

    if (!this.areElementsVisible && !this.isScrollMode) {
      this.showAllElements();
    }

    this.inactivityTimer = window.setTimeout(() => {
      this.hideOptionalElements();
      this.hideProgressIndicator();
      this.areElementsVisible = false;
      this.isScrollMode = false;
    }, this.INACTIVITY_TIMEOUT);
  }

  private startInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }

    this.inactivityTimer = window.setTimeout(() => {
      this.hideOptionalElements();
      this.hideProgressIndicator();
      this.areElementsVisible = false;
      this.isScrollMode = false;
    }, this.INACTIVITY_TIMEOUT);
  }

  private handleScreenTap = (event: MouseEvent | TouchEvent): void => {
    // Ignore taps on interactive elements
    const target = event.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("input") ||
      target.closest("a") ||
      target.closest(".optional-element") ||
      target.closest(".progress-indicator") ||
      target.closest("[data-interactive]") ||
      target.closest(".modal-overlay") ||
      target.closest(".tooltip")
    ) {
      return;
    }

    if (this.areElementsVisible) {
      this.hideOptionalElements();
      this.isScrollMode = false;

      if (this.inactivityTimer) {
        clearTimeout(this.inactivityTimer);
        this.inactivityTimer = null;
      }

      this.hideProgressIndicator();
      this.areElementsVisible = false;
    } else {
      this.showAllElements();
      this.isScrollMode = false;
      this.resetInactivityTimer();
    }
  };

  private handleScroll = (): void => {
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
    }

    this.isScrollMode = true;
    this.hideOptionalElements();
    this.showProgressIndicator();

    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    this.scrollTimer = window.setTimeout(() => {
      this.isScrollMode = false;
      if (!this.areElementsVisible) {
        this.hideProgressIndicator();
      }
      this.startInactivityTimer();
    }, this.SCROLL_HIDE_DELAY);
  };

  public initialize(): void {
    if (this.isInitialized) {
      console.warn("Element visibility manager already initialized");
      return;
    }

    this.showAllElements();
    this.resetInactivityTimer();

    document.addEventListener("click", this.handleScreenTap, true);
    document.addEventListener("touchstart", this.handleScreenTap, true);

    const contentContainer = document.getElementById("content-container");
    if (contentContainer) {
      contentContainer.addEventListener("scroll", this.handleScroll, { passive: true });
      console.log("Element visibility manager initialized");
    } else {
      console.warn("Content container not found - scroll functionality will be limited");
    }

    this.isInitialized = true;
  }
}

const elementVisibilityManager = new ElementVisibilityManager();

export function initializeElementVisibilityManager(): void {
  elementVisibilityManager.initialize();
}
