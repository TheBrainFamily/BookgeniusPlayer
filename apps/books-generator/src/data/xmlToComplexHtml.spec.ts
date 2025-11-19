import { xmlToComplexHtml } from "./xmlToComplexHtml";
import fs from "fs";
import path from "path";

test("renders narrative paragraphs for non-play books", () => {
  const xml = `
<ebook>
  <BookMetadata>
    <Form>Novel</Form>
  </BookMetadata>
  <Chapter id="1">
    <p>Hello <em>world</em>.</p>
  </Chapter>
</ebook>`;

  const html = xmlToComplexHtml(xml, "novel-slug", "polish").htmlResult;

  expect(html).not.toContain("play-container");
  expect(html).toContain('<section><section data-chapter="1">');
  expect(html).toContain('<p data-index="0">');
  expect(html).toContain("Hello <em>world</em>.");
});

test("detects didaskalia paragraphs inside play chapters", () => {
  const xml = `
<ebook>
  <BookMetadata>
    <Form>Play</Form>
  </BookMetadata>
  <Chapter id="7">
    <p><em>Enter the chorus.</em></p>
    <p><Chorus talking="true"/>Sing, O muse.</p>
  </Chapter>
</ebook>`;

  const html = xmlToComplexHtml(xml, "play-slug", "english").htmlResult;

  expect(html).toContain('<div class="play-container">');
  expect(html).toContain('<div class="play-row didaskalia-row">');
  expect(html).toContain('data-is-didaskalia="true"');
  expect(html).toContain('<div class="character-text">');
});

test("alternates alignment when the speaking character changes", () => {
  const xml = `
<ebook>
  <BookMetadata>
    <Form>Play</Form>
  </BookMetadata>
  <Chapter id="3">
    <p><Theseus talking="true"/>First line.</p>
    <p><Hermia talking="true"/>Second line.</p>
  </Chapter>
</ebook>`;

  const html = xmlToComplexHtml(xml, "play-slug", "english").htmlResult;

  const rowAlignments = Array.from(html.matchAll(/<div class="play-row(?: didaskalia-row)?" data-text-alignment="(left|right)">/g)).map(([, align]) => align);

  expect(rowAlignments.slice(0, 2)).toEqual(["left", "right"]);
  expect(html).toContain("character-placeholder character-talking start-of-paragraph");
});

test("renders LineBreak tags inside em elements in both contexts", () => {
  const xml = `
<ebook>
  <BookMetadata>
    <Form>Novel</Form>
  </BookMetadata>
  <Chapter id="9">
    <p><span id="s1"><em>First<LineBreak/>Second</em></span></p>
    <p><em>Alpha<LineBreak/>Beta</em></p>
  </Chapter>
</ebook>`;

  const html = xmlToComplexHtml(xml, "novel-slug", "polish").htmlResult;
  const lineBreakSpan = '<span style="display:block; height:0; margin:0; padding:0; line-height:1.2em;"></span>';
  const occurrences = html.split(lineBreakSpan).length - 1;

  expect(occurrences).toBe(2);
});

test("keeps consecutive didaskalia paragraphs within one container", () => {
  const xml = `
<ebook>
  <BookMetadata>
    <Form>Play</Form>
  </BookMetadata>
  <Chapter id="4">
    <p><em>Stage direction one.</em></p>
    <p><em>Stage direction two.</em></p>
    <p><Hero talking="true"/>Hello there.</p>
  </Chapter>
</ebook>`;

  const html = xmlToComplexHtml(xml, "play-slug", "english").htmlResult;
  const didaskaliaRowMatches = html.match(/<div class="play-row didaskalia-row">/g) || [];
  expect(didaskaliaRowMatches.length).toBe(1);
  expect(html).toMatch(/Stage direction one\.<\/em>[\s\S]*Stage direction two\.<\/em>/);
});

test("safety net", () => {
  const bookString = fs.readFileSync(path.join(__dirname, "./example.xml"), "utf8");
  const actualHtml = xmlToComplexHtml(bookString, "example", "pl").htmlResult;
  expect(actualHtml).toEqual(`<div class="play-container mixed-container">
      <section><section data-chapter="1">
    <h4 data-index="0">Chapter one</h4>
 <div class="play-row didaskalia-row">

  <div class="didaskalia-text">

    <p data-index="1" data-is-didaskalia="true">
      <em>Enter Francisco and Barnardo, two sentinels.</em>
    </p>
  </div>

 </div>

 <div class="play-row didaskalia-row">

  <div class="didaskalia-text">

    <p data-index="2" data-is-didaskalia="true">
      Dopiero czwarty syn, <span class="text-nowrap"><span class="character-highlighted" data-character="Ksiaze-Ramzes">Ramzes</span>,</span> urodzony z królowej <span class="text-nowrap"><span class="character-highlighted" data-character="Nikotris">Nikotris</span>,</span> córki arcykapłana Amenhotepa był silny jak wół Api, odważny jak lew i mądry jak kapłani. Od dzieciństwa otaczał się wojskowymi i jeszcze będąc zwyczajnym księciem, mawiał:
    </p>
  </div>

 </div>

 <div class="play-row" data-text-alignment="left">

  <div class="character-avatar"><span class="character-placeholder character-talking start-of-paragraph" data-character="Ksiaze-Ramzes" data-is-talking="true"></span></div>

  <div class="character-text">

    <p
  data-text-alignment="left"
  data-is-character="true"
  data-is-didaskalia="false"
>
      <strong>Książe Ramzes</strong>
    </p>
    <p
  data-index="3"
  data-text-alignment="left"
  data-is-character="false"
  data-is-didaskalia="false"
>
      — Gdyby bogowie, zamiast młodszym synem królewskim, uczynili mnie faraonem, podbiłbym dziewięć narodów…
    </p>
 </div>

 </div>

 <div class="play-row didaskalia-row">

  <div class="didaskalia-text">

    <p data-index="4" data-is-didaskalia="true">
      Książe <span class="character-highlighted" data-character="Ksiaze-Ramzes">Ramzes</span> spojrzał na <span class="text-nowrap"><span class="character-highlighted" data-character="Sara">Sarę</span>,</span> a jego wzrok złagodniał.
    </p>
  </div>

 </div>

 <div class="play-row" data-text-alignment="right">

  <div class="character-avatar"><span class="character-placeholder character-talking start-of-paragraph" data-character="Sara" data-is-talking="true"></span></div>

  <div class="character-text">

    <p
  data-text-alignment="right"
  data-is-character="true"
  data-is-didaskalia="false"
>
      <strong>Sara</strong>
    </p>
    <p
  data-index="5"
  data-text-alignment="right"
  data-is-character="false"
  data-is-didaskalia="false"
>
      — Panie mój, twe słowa są jak światło w ciemności — wyszeptała.
    </p>
 </div>

 </div>

 <div class="play-row didaskalia-row">

  <div class="didaskalia-text">

    <p data-index="6" data-is-didaskalia="true">
      <span id="ch3-p293-s1"><em>Enter Puck.</em></span>
    </p>
  </div>

 </div>

 <div class="play-row" data-text-alignment="left">

  <div class="character-avatar"><span class="character-placeholder character-talking start-of-paragraph" data-character="Puck" data-is-talking="true"></span></div>

  <div class="character-text">

    <p
  data-index="7"
  data-text-alignment="left"
  data-is-character="true"
  data-is-didaskalia="false"
>
      <span id="ch3-p294-s1"><strong>PUCK</strong></span>
    </p>
 </div>

 </div>

 <div class="play-row" data-text-alignment="right">

  <div class="character-avatar"><span class="character-placeholder character-talking start-of-paragraph" data-character="Narrator" data-is-talking="true"></span></div>

  <div class="character-text">

    <p
  data-text-alignment="right"
  data-is-character="true"
  data-is-didaskalia="false"
>
      <strong>Narrator</strong>
    </p>
    <p
  data-index="8"
  data-text-alignment="right"
  data-is-character="false"
  data-is-didaskalia="false"
>
      <span id="ch3-p295-s1">What's in that box?</span>
    </p>
    <p
  data-index="9"
  data-text-alignment="right"
  data-is-character="false"
  data-is-didaskalia="false"
>
      <span id="ch3-p295a-s1">Because it can't be me</span>
    </p>
 </div>

 </div>

 <div class="play-row" data-text-alignment="left">

  <div class="character-avatar"><span class="character-placeholder character-talking start-of-paragraph" data-character="Faraon" data-is-talking="true"></span></div>

  <div class="character-text">

    <p
  data-index="10"
  data-text-alignment="left"
  data-is-character="true"
  data-is-didaskalia="false"
>
      <span id="ch3-p296-s1"><strong>FARAON</strong></span>
    </p>
 </div>

 </div>

 <div class="play-row didaskalia-row">

  <div class="didaskalia-text">

    <p data-index="11" data-is-didaskalia="true">
      <span id="ch3-p297-s1">It's a box of gold.</span>
    </p>
  </div>

 </div>

 <div class="play-row didaskalia-row">

  <div class="didaskalia-text">

    <p data-index="12" data-is-didaskalia="true">
      <span id="ch3-p286-s1"><em>Exit Demetrius.</em></span>
    </p>
  </div>

 </div>

 <div class="play-row" data-text-alignment="right">

  <div class="character-avatar"><span class="character-placeholder character-talking start-of-paragraph" data-character="Sara" data-is-talking="true"></span></div>

  <div class="character-text">

    <p
  data-text-alignment="right"
  data-is-character="true"
  data-is-didaskalia="false"
>
      <strong>Sara</strong>
    </p>
    <p
  data-index="13"
  data-text-alignment="right"
  data-is-character="false"
  data-is-didaskalia="false"
>
      — To nie moze byc
    </p>
 </div>

 </div>

  </section></section>
    </div>`);
});

test("injects label when talking is inside span wrapper in Mixed", () => {
  const xml = `
<ebook>
  <CharactersMaster>
    <Xavier-March display="Xavier March" />
  </CharactersMaster>
  <BookMetadata>
    <Form>Mixed</Form>
  </BookMetadata>
  <Chapter id="1">
    <p><span id="ch1-p12-s1"><Xavier-March talking="true"/>Tour name, Unterwachtmeister?' <Xavier-March>March</Xavier-March> had a soft voice.</span> <span id="ch1-p12-s2">Without taking his eyes off the body, he addressed the Orpo man who had saluted.</span></p>
  </Chapter>
</ebook>`;

  const html = xmlToComplexHtml(xml, "mixed-slug", "english").htmlResult;

  // Should include a character label line injected before the content paragraph
  expect(html).toMatch(/data-is-character="true"[\s\S]*<strong>Xavier March<\/strong>/);
});

test("uses only the first talking when a paragraph has two talkings in Mixed", () => {
  const xml = `
<ebook>
  <CharactersMaster>
    <August-Eisler display="August Eisler" />
    <Eck display="Eck" />
  </CharactersMaster>
  <BookMetadata>
    <Form>Mixed</Form>
  </BookMetadata>
  <Chapter id="5">
    <p><span id="ch5-p138-s1"><August-Eisler talking="true"/>'Possible,' admitted <August-Eisler>Eisler</August-Eisler>.</span> <span id="ch5-p138-s2"><Eck>Eck</Eck> handed him a scalpel.</span> <span id="ch5-p138-s3"><August-Eisler talking="true"/>'I won't know until I've completed a full examination of the internal organs.'</span></p>
  </Chapter>
</ebook>`;

  const html = xmlToComplexHtml(xml, "mixed-slug", "english").htmlResult;

  // Should open only one character row (one avatar), not two
  const avatarOccurrences = (html.match(/class=\"character-avatar\"/g) || []).length;
  expect(avatarOccurrences).toBe(1);
  // Only the label/avatar placeholder should be present, not a second one in content
  const talkingPlaceholders = (html.match(/character-placeholder character-talking/g) || []).length;
  expect(talkingPlaceholders).toBe(1);
});
