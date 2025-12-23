import { wrapPunctuationAdvanced } from "../../src/services/wrapPunctuation";

describe("wrapPunctuationAdvanced", () => {
  it("wraps punctuation that directly follows a highlighted character mid-sentence", () => {
    const input = [
      '<span id="ch10-p4-s5"><span class="character-highlighted" data-character="Fiebes">Fiebes</span>, a sheet-sniffer by temperament, worked all the hours the Fuhrer sent and was as happy, in <span class="character-highlighted" data-character="Max-Jaeger">Max Jaeger\'s</span> words, as a pig in horseshit.</span>',
    ].join("\n");

    const result = wrapPunctuationAdvanced(input);

    const expected = [
      '<span id="ch10-p4-s5"><span class="text-nowrap"><span class="character-highlighted" data-character="Fiebes">Fiebes</span>,</span> a sheet-sniffer by temperament, worked all the hours the Fuhrer sent and was as happy, in <span class="character-highlighted" data-character="Max-Jaeger">Max Jaeger\'s</span> words, as a pig in horseshit.</span>',
    ].join("\n");

    expect(result).toBe(expected);
  });

  it("wraps punctuation when a highlighted character closes the line", () => {
    const input = [
      '<span id="ch10-p2-s6">The others could hold no public office and stared reproachfully at <span class="character-highlighted" data-character="Fiebes">Fiebes</span>.</span>',
    ].join("\n");

    const result = wrapPunctuationAdvanced(input);

    const expected = [
      '<span id="ch10-p2-s6">The others could hold no public office and stared reproachfully at <span class="text-nowrap"><span class="character-highlighted" data-character="Fiebes">Fiebes</span>.</span></span>',
    ].join("\n");

    expect(result).toBe(expected);
  });

  it("does not modify lines without punctuation-wrapped highlights", () => {
    const input = ['<span id="ch10-p5-s1">But not today.</span>'].join("\n");

    const result = wrapPunctuationAdvanced(input);

    expect(result).toBe(input);
  });

  it("wraps punctuation when a non-breaking space follows the comma", () => {
    const input = [
      `<span id="ch2-p20-s1">'Here we see the final proof,' murmured <span class="character-highlighted" data-character="Xavier-March">March</span>,&nbsp;watching the crowd, 'that in the face of martial music, the German people are mad.'</span>`,
    ].join("\n");

    const result = wrapPunctuationAdvanced(input);

    const expected = [
      `<span id="ch2-p20-s1">'Here we see the final proof,' murmured <span class="text-nowrap"><span class="character-highlighted" data-character="Xavier-March">March</span>,</span>&nbsp;watching the crowd, 'that in the face of martial music, the German people are mad.'</span>`,
    ].join("\n");

    expect(result).toBe(expected);
  });

  it("wraps punctuation when a non-breaking space follows the dot", () => {
    const input = [
      `<span id="ch2-p20-s1">'Here we see the final proof,' murmured <span class="character-highlighted" data-character="Xavier-March">March</span>.&nbsp;Watching the crowd, 'that in the face of martial music, the German people are mad.'</span>`,
    ].join("\n");

    const result = wrapPunctuationAdvanced(input);

    const expected = [
      `<span id="ch2-p20-s1">'Here we see the final proof,' murmured <span class="text-nowrap"><span class="character-highlighted" data-character="Xavier-March">March</span>.</span>&nbsp;Watching the crowd, 'that in the face of martial music, the German people are mad.'</span>`,
    ].join("\n");

    expect(result).toBe(expected);
  });
});
