import { highlightFootnote } from "@player/ui/highlightFootnote";

export const activateFootnoteInteractions = (element: HTMLElement) => {
  const linkNoteElements = element.querySelectorAll<HTMLAnchorElement>(
    "a[data-note]:not(.footnote-activated)",
  );

  linkNoteElements.forEach((linkNoteEl) => {
    linkNoteEl.classList.add("link-note");
    highlightFootnote(linkNoteEl);
  });
};
