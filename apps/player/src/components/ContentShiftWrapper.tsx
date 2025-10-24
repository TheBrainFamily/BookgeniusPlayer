import React, { useEffect } from "react";

import { useContentShift } from "@player/stores/contentShift.store";
import { useBookForm } from "@player/hooks/useBookForm";
import { useScreenSize } from "@player/hooks/useScreenSize";
import { isMobileOrTablet } from "@player/utils/isMobileOrTablet";
import { useIsAppReady } from "@player/hooks/useIsAppReady";

interface DOMElements {
  bookContainer: HTMLElement;
  contentContainer: HTMLElement;
  leftNotes: HTMLElement;
  leftNotesBlank: HTMLElement;
  rightNotes: HTMLElement;
  rightNotesBlank: HTMLElement;
  bottomInputWrapper: HTMLElement;
  footer: HTMLElement;
}

const getDOMElements = (): DOMElements | null => {
  const bookContainer = document.getElementById("book-container");
  const contentContainer = document.getElementById("content-container");
  const bottomInputWrapper = document.getElementById("bottom-input-wrapper");
  const footer = document.querySelector("footer") as HTMLElement;

  if (!bookContainer || !contentContainer || !bottomInputWrapper || !footer) {
    return null;
  }

  return {
    bookContainer,
    contentContainer,
    leftNotes: document.getElementById("left-notes") || undefined,
    leftNotesBlank: document.getElementById("left-notes-blank") || undefined,
    rightNotes: document.getElementById("right-notes") || undefined,
    rightNotesBlank: document.getElementById("right-notes-blank") || undefined,
    bottomInputWrapper,
    footer,
  };
};

const createOrGetBlankElement = (parent: HTMLElement, id: string): HTMLElement => {
  let element = parent.querySelector(`#${id}`) as HTMLElement | null;
  if (!element) {
    element = document.createElement("div");
    element.id = id;
    element.className = "hidden";
    parent.appendChild(element);
  }

  return element;
};

const applyTransitions = (elements: DOMElements, isPlayFormat: boolean) => {
  const duration = isPlayFormat ? "0.3s" : "0.2s";

  elements.bookContainer.style.transition = `${isPlayFormat ? "transform" : "all"} ${duration} ease-out`;
  elements.footer.style.transition = `${isPlayFormat ? "transform" : "all"} ${duration} ease-out`;
  elements.contentContainer.style.transition = isPlayFormat ? "max-width 0.3s ease-out, flex 0.3s ease-out" : `all ${duration} ease-out`;
  elements.bottomInputWrapper.style.transition = isPlayFormat ? "max-width 0.3s ease-out" : `all ${duration} ease-out`;

  if (!isPlayFormat && elements.leftNotes && elements.leftNotesBlank && elements.rightNotes && elements.rightNotesBlank) {
    elements.leftNotes.style.transition = `all ${duration} ease-out`;
    elements.leftNotesBlank.style.transition = `all ${duration} ease-out`;
    elements.rightNotes.style.transition = `all ${duration} ease-out`;
    elements.rightNotesBlank.style.transition = `all ${duration} ease-out`;
  }
};

const handlePlayFormat = (elements: DOMElements, isContentShiftedLeft: boolean, isLargeScreen: boolean, isMediumScreen: boolean) => {
  const playRightNotesBlank = createOrGetBlankElement(elements.bookContainer, "play-right-notes-blank");
  const playFooterRightNotesBlank = createOrGetBlankElement(elements.footer, "play-footer-right-notes-blank");

  const resetPlayStyles = () => {
    playRightNotesBlank.className = "hidden";
    playFooterRightNotesBlank.className = "hidden";
    elements.bottomInputWrapper.style.flex = "";
    elements.bottomInputWrapper.style.margin = "";
    elements.contentContainer.style.flex = "";
    elements.contentContainer.style.margin = "";
  };

  if (!isContentShiftedLeft) {
    resetPlayStyles();

    return () => {
      playRightNotesBlank.remove();
      playFooterRightNotesBlank.remove();
    };
  }

  if (isLargeScreen) {
    playRightNotesBlank.className = "xl:block xl:flex-1 max-w-[500px] ml-2";
    playRightNotesBlank.style.transition = "all 0.3s ease-out";
    playFooterRightNotesBlank.className = "xl:block xl:flex-1 max-w-[500px] ml-2";
    playFooterRightNotesBlank.style.transition = "all 0.3s ease-out";

    elements.bottomInputWrapper.style.flex = "0 0 900px";
    elements.bottomInputWrapper.style.margin = "0 0.5rem";
    elements.contentContainer.style.flex = "0 0 900px";
    elements.contentContainer.style.margin = "0 0.5rem";
  } else if (isMediumScreen) {
    playRightNotesBlank.className = "lg:block lg:flex-1 max-w-[500px]";
    playRightNotesBlank.style.transition = "all 0.3s ease-out";
    playFooterRightNotesBlank.className = "lg:block lg:flex-1 max-w-[500px]";
    playFooterRightNotesBlank.style.transition = "all 0.3s ease-out";

    elements.bottomInputWrapper.style.flex = "0 0 800px";
    elements.bottomInputWrapper.style.margin = "0 0.5rem";
    elements.contentContainer.style.flex = "0 0 800px";
    elements.contentContainer.style.margin = "0 0.5rem";
  } else {
    resetPlayStyles();
  }

  return () => {
    playRightNotesBlank.remove();
    playFooterRightNotesBlank.remove();
  };
};

const handleStandardFormat = (elements: DOMElements, isContentShiftedLeft: boolean, isLargeScreen: boolean, isMediumScreen: boolean, isMobileOrTablet: boolean) => {
  const { leftNotes, leftNotesBlank, rightNotes, rightNotesBlank } = elements;

  if (!leftNotes || !leftNotesBlank || !rightNotes || !rightNotesBlank) {
    return;
  }

  const resetStyles = () => {
    leftNotes.style.flex = "";
    leftNotes.style.overflow = "";
    leftNotes.style.zIndex = "";
    leftNotes.style.width = "";
    leftNotes.style.maxWidth = "";
    leftNotes.style.minWidth = "";
    leftNotes.style.marginRight = "";
    leftNotesBlank.style.flex = "";
    leftNotesBlank.style.width = "";
    leftNotesBlank.style.maxWidth = "";
    leftNotesBlank.style.minWidth = "";
    leftNotesBlank.style.marginRight = "";
    rightNotes.style.display = "";
    rightNotes.style.flex = "";
    rightNotes.style.maxWidth = "";
    rightNotes.style.marginRight = "";
    rightNotesBlank.style.maxWidth = "";
    rightNotesBlank.style.display = "";
    rightNotesBlank.style.flex = "";
    rightNotesBlank.style.marginRight = "";
  };

  if (!isContentShiftedLeft) {
    resetStyles();
    return;
  }

  if (isMobileOrTablet) {
    if (!isLargeScreen && !isMediumScreen) {
      resetStyles();
      return;
    }

    leftNotes.style.flex = "0";
    leftNotes.style.overflow = "";
    leftNotes.style.marginRight = "";
    leftNotesBlank.style.flex = "0";
    leftNotesBlank.style.marginRight = "";
    rightNotes.style.flex = "1";
    rightNotes.style.display = "block";
    rightNotes.style.marginRight = "";
    rightNotesBlank.style.flex = "1";
    rightNotesBlank.style.display = "block";
    rightNotesBlank.style.marginRight = "";
    return;
  }

  if (isLargeScreen) {
    leftNotes.style.flex = "0 0 200px";
    leftNotes.style.overflow = "visible";
    leftNotes.style.zIndex = "1";
    leftNotes.style.marginRight = "";
    leftNotesBlank.style.flex = "0 0 200px";
    leftNotesBlank.style.marginRight = "";
    rightNotes.style.maxWidth = "600px";
    rightNotesBlank.style.maxWidth = "600px";
    rightNotesBlank.style.display = "";
    rightNotesBlank.style.flex = "";
  } else if (isMediumScreen) {
    leftNotes.style.transition = "";
    leftNotesBlank.style.transition = "";
    leftNotes.style.flex = "0 0 auto";
    leftNotes.style.width = "0px";
    leftNotes.style.minWidth = "0px";
    leftNotes.style.overflow = "hidden";
    leftNotes.style.zIndex = "";
    leftNotes.style.maxWidth = "";
    leftNotes.style.marginRight = "0px";
    leftNotesBlank.style.flex = "0 0 auto";
    leftNotesBlank.style.width = "0px";
    leftNotesBlank.style.minWidth = "0px";
    leftNotesBlank.style.maxWidth = "";
    leftNotesBlank.style.marginRight = "0px";
    rightNotes.style.display = "block";
    rightNotes.style.flex = "1";
    rightNotes.style.maxWidth = "";
    rightNotes.style.marginRight = "0.5rem";
    rightNotesBlank.style.maxWidth = "";
    rightNotesBlank.style.display = "block";
    rightNotesBlank.style.flex = "1";
    rightNotesBlank.style.marginRight = "0.5rem";
  } else {
    resetStyles();
  }
};

export const ContentShiftWrapper: React.FC = () => {
  const { isContentShiftedLeft } = useContentShift();
  const { isLargeScreen, isMediumScreen } = useScreenSize();
  const { isPlayFormat } = useBookForm();
  const isMobileOrTabletDevice = isMobileOrTablet();
  const isAppReady = useIsAppReady();

  useEffect(() => {
    if (!isAppReady) return;

    const elements = getDOMElements();
    if (!elements) return;

    applyTransitions(elements, isPlayFormat);

    if (isPlayFormat) {
      return handlePlayFormat(elements, isContentShiftedLeft, isLargeScreen, isMediumScreen);
    }

    handleStandardFormat(elements, isContentShiftedLeft, isLargeScreen, isMediumScreen, isMobileOrTabletDevice);
  }, [isAppReady, isLargeScreen, isMediumScreen, isContentShiftedLeft, isPlayFormat, isMobileOrTabletDevice]);

  useEffect(() => {
    if (!isAppReady) return;

    const playerScope = document.getElementById("player-scope");
    if (!playerScope) return;

    if (isMobileOrTabletDevice && !isPlayFormat) {
      playerScope.classList.add("mobileOrTablet");
    } else {
      playerScope.classList.remove("mobileOrTablet");
    }

    return () => {
      playerScope.classList.remove("mobileOrTablet");
    };
  }, [isAppReady, isMobileOrTabletDevice, isPlayFormat]);

  return null;
};
