import { expect, describe, it } from "@jest/globals";
import fs from "fs";
import path from "path";
import { xmlToComplexHtml } from "./xmlToComplexHtml";
import { BOOK_SLUGS } from "@/consts";

const xmlString = fs.readFileSync(path.join(__dirname, "example.xml"), "utf8");

describe.skip("xmlToComplexHtml", () => {
  it("should convert xml to complex html with character spans", () => {
    const htmlString = xmlToComplexHtml(xmlString, BOOK_SLUGS.PHARAON);

    const expectedHtml = `
<section data-chapter="1">
  <h5 data-index="0" class="book-title">Bolesław Prus, Faraon</h5>
  <p data-index="1">
    Dopiero czwarty syn, <span class="character-mention" data-character="Książe Ramzes">Ramzes</span>, urodzony z królowej <span class="character-mention" data-character="Nikotris">Nikotris</span>, córki arcykapłana Amenhotepa był silny jak wół Api, odważny jak lew i mądry jak kapłani. Od dzieciństwa otaczał się wojskowymi i jeszcze będąc zwyczajnym księciem, mawiał:
  </p>
  <p data-index="2">
    <span class="character-talking" data-character="Książe Ramzes"></span> — Gdyby bogowie, zamiast młodszym synem królewskim, uczynili mnie faraonem, podbiłbym dziewięć narodów…
  </p>
  <p data-index="3">
    Książe <span class="character-mention" data-character="Książe Ramzes">Ramzes</span> spojrzał na <span class="character-mention" data-character="Sara">Sarę</span>, a jego wzrok złagodniał.
  </p>
  <p data-index="4">
    — Panie mój, twe słowa są jak światło w ciemności — wyszeptała.
  </p>
</section>
    `.trim();

    expect(htmlString.replace(/\s+/g, " ").trim()).toEqual(expectedHtml.replace(/\s+/g, " ").trim());
  });
});
