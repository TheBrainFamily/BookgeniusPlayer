const charFold: Record<string, string> = {
  ł: "l",
  Ł: "l",
  ą: "a",
  Ą: "a",
  ć: "c",
  Ć: "c",
  ę: "e",
  Ę: "e",
  ń: "n",
  Ń: "n",
  ó: "o",
  Ó: "o",
  ś: "s",
  Ś: "s",
  ź: "z",
  Ź: "z",
  ż: "z",
  Ż: "z",
};
const stripDiacritics = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[łŁ]/g, (m) => charFold[m]);

export const normalise = (s: string) =>
  stripDiacritics(
    s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " "), // keep letters, digits, spaces
  )
    .replace(/\s+/g, " ") // single-space collapse
    .trim();
