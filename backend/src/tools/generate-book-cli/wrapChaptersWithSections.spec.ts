import { describe, it, expect } from "vitest";

import { wrapChaptersWithSections } from "./wrapChaptersWithSections";
const exampleToWrap = `
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:wl="http://wolnelektury.pl/functions" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:l="http://www.w3.org/1999/xlink">
  <body>
    <section>
      <p>
        <strong>I. Czarodziejskie zwierciadło</strong>
      </p>
      <p>Żył sobie niegdyś bardzo złośliwy czarodziej.</p>
      <p>A niegodziwych pyłków ciągle jeszcze pełno</p>
      <p>
        <strong>II. Sąsiedzi</strong>
      </p>
      <p>W pewnym bardzo starym mieście, w bardzo wysokim domu na poddaszu mieszkało dwoje dzieci, każde u swoich rodziców — był to Kaj i Gerda.</p>
      <p>Na wiosnę rodzice Kaja i Gerdy ustawiali na brzegu dachu długie skrzynie</p>
      <p>Ślicznie tu było w lecie.</p>
</section>
</body>
</FictionBook>
`;

const exampleWrapped = `
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:wl="http://wolnelektury.pl/functions" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:l="http://www.w3.org/1999/xlink">
  <body>
    <section>
      <section>
        <title>
          <p>I. Czarodziejskie zwierciadło</p>
        </title>
      <p>Żył sobie niegdyś bardzo złośliwy czarodziej.</p>
        <p>A niegodziwych pyłków ciągle jeszcze pełno</p>
      </section>
    <section>
      <title>
        <p>II. Sąsiedzi</p>
      </title>
      <p>W pewnym bardzo starym mieście, w bardzo wysokim domu na poddaszu mieszkało dwoje dzieci, każde u swoich rodziców — był to Kaj i Gerda.</p>
      <p>Na wiosnę rodzice Kaja i Gerdy ustawiali na brzegu dachu długie skrzynie</p>
      <p>Ślicznie tu było w lecie.</p>
      </section>
    </section>
  </body>
</FictionBook>
`;

/**
 * Helper for tests: squashes whitespace between tags so that pretty‑printed
 * and minified XML compare equal with `toBe()`.
 */
function minifyXml(xml: string): string {
  return xml.replace(/>\s+</g, "><").trim();
}

describe("wrapChaptersWithSections", () => {
  it("should wrap chapters with sections", () => {
    const result = wrapChaptersWithSections(exampleToWrap);
    expect(minifyXml(result)).toBe(minifyXml(exampleWrapped));
  });
});
