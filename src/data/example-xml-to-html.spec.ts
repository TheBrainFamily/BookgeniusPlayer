import { expect, describe, it } from "@jest/globals";
import fs from "fs";
import path from "path";
import { xmlToHtml } from "./xmlToHtml";

const xmlString = fs.readFileSync(path.join(__dirname, "example.xml"), "utf8");

describe("example-xml-to-html", () => {
  it("should convert xml to html", () => {
    const htmlString = xmlToHtml(xmlString);
    console.log(htmlString);
    expect(htmlString).toContain("W trzydziestym trzecim roku");
    expect(htmlString).toContain(`<h5 data-index="0" class="book-title">Bolesław Prus, Faraon</h5>`);
    const finalHtml = `
      <section data-chapter="1">
    <h5 data-index="0" class="book-title">Bolesław Prus, Faraon</h5>
    <p data-index="1">
      W trzydziestym trzecim roku szczęśliwego panowania Ramzesa XII Egipt święcił dwie uroczystości, które prawowiernych jego mieszkańców napełniły dumą i słodyczą.
    </p>

    <p data-index="2">
      — Gdyby bogowie, zamiast młodszym synem królewskim, uczynili mnie faraonem, podbiłbym dziewięć narodów…
    </p>

    <p data-index="3">
      Książe Ramzes spojrzał na Sarę, a jego wzrok złagodniał.
    </p>

    <p data-index="4">
      — Panie mój, twe słowa są jak światło w ciemności — wyszeptała.
    </p>
  </section>
    `;
    expect(htmlString.replace(/\s+/g, "")).toEqual(finalHtml.replace(/\s+/g, ""));
  });
});
