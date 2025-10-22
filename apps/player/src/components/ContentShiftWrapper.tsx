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
    elements.contentContainer.style.flex = "";
    elements.contentContainer.style.maxWidth = "";
    elements.bottomInputWrapper.style.maxWidth = "";
  };

  if (!isContentShiftedLeft) {
    resetPlayStyles();

    return () => {
      playRightNotesBlank.remove();
      playFooterRightNotesBlank.remove();
    };
  }

  if (isLargeScreen) {
    playRightNotesBlank.className = "xl:block xl:flex-1 max-w-[700px]";
    playRightNotesBlank.style.transition = "all 0.3s ease-out";
    playFooterRightNotesBlank.className = "xl:block xl:flex-1 max-w-[700px]";
    playFooterRightNotesBlank.style.transition = "all 0.3s ease-out";

    elements.contentContainer.style.flex = "0 0 auto";
    elements.contentContainer.style.maxWidth = "900px";
    elements.bottomInputWrapper.style.maxWidth = "800px";
  } else if (isMediumScreen) {
    playRightNotesBlank.className = "lg:block lg:flex-1 max-w-[600px]";
    playRightNotesBlank.style.transition = "all 0.3s ease-out";
    playFooterRightNotesBlank.className = "lg:block lg:flex-1 max-w-[600px]";
    playFooterRightNotesBlank.style.transition = "all 0.3s ease-out";

    elements.contentContainer.style.flex = "0 0 auto";
    elements.contentContainer.style.maxWidth = "800px";
    elements.bottomInputWrapper.style.maxWidth = "700px";
  } else {
    resetPlayStyles();
  }

  return () => {
    playRightNotesBlank.remove();
    playFooterRightNotesBlank.remove();
  };
};

const handleStandardFormat = (elements: DOMElements, isContentShiftedLeft: boolean, isLargeScreen: boolean, isMediumScreen: boolean, isMobileOrTabletDevice: boolean) => {
  const { leftNotes, leftNotesBlank, rightNotes, rightNotesBlank, contentContainer, bottomInputWrapper, bookContainer } = elements;

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
    leftNotesBlank.style.flex = "";
    leftNotesBlank.style.width = "";
    leftNotesBlank.style.maxWidth = "";
    leftNotesBlank.style.minWidth = "";
    rightNotes.style.display = "";
    rightNotes.style.flex = "";
    rightNotes.style.maxWidth = "";
    rightNotesBlank.style.maxWidth = "";
    rightNotesBlank.style.display = "";
    rightNotesBlank.style.flex = "";
  };

  // if (isMobileOrTabletDevice) {
  //   rightNotes.style.display = "none";
  //   rightNotesBlank.style.display = "none";
  //   contentContainer.style.maxWidth = "900px";
  //   bottomInputWrapper.style.maxWidth = "900px";
  //   bookContainer.style.paddingLeft = "0px";
  //   bookContainer.style.paddingRight = "0px";

  //   return;
  // }

  if (!isContentShiftedLeft) {
    resetStyles();
    return;
  }

  if (isLargeScreen) {
    leftNotes.style.flex = "0 0 200px";
    leftNotes.style.overflow = "visible";
    leftNotes.style.zIndex = "1";
    leftNotesBlank.style.flex = "0 0 200px";
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
    leftNotesBlank.style.flex = "0 0 auto";
    leftNotesBlank.style.width = "0px";
    leftNotesBlank.style.minWidth = "0px";
    leftNotesBlank.style.maxWidth = "";
    rightNotes.style.display = "block";
    rightNotes.style.flex = "1";
    rightNotes.style.maxWidth = "";
    rightNotesBlank.style.maxWidth = "";
    rightNotesBlank.style.display = "block";
    rightNotesBlank.style.flex = "1";
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
    if (elements) {
      applyTransitions(elements, isPlayFormat);

      if (isPlayFormat) {
        handlePlayFormat(elements, isContentShiftedLeft, isLargeScreen, isMediumScreen);
      } else {
        handleStandardFormat(elements, isContentShiftedLeft, isLargeScreen, isMediumScreen, isMobileOrTabletDevice);
      }
    }
  }, [isAppReady, isLargeScreen, isMediumScreen, isContentShiftedLeft, isPlayFormat, isMobileOrTabletDevice]);

  return null;
};
