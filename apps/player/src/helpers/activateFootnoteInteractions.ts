import { highlightFootnote } from "@player/ui/highlightFootnote";

export const activateFootnoteInteractions = (element: HTMLElement) => {
  const linkNoteElements = element.querySelectorAll<HTMLAnchorElement>('a.link-note:not(.footnote-activated)');

  linkNoteElements.forEach((linkNoteEl) => {
    highlightFootnote(linkNoteEl);
  });
};
