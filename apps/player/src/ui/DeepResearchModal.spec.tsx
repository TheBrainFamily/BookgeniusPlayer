import { describe, it, expect } from "@jest/globals";
import { extractQuotes } from "./utils/extractQuotes"; // adjust the path!

const exampleMarkdown = `Oto fragmenty z tekstu, które mogą posłużyć do odpowiedzi na zadane pytania:

**Czy Sara miała okazję zdradzić Ramzesa?**

Tekst sugeruje, że Sara miała pewne kontakty z innymi mężczyznami poza Ramzesem, choć w większości sytuacji wydaje się być bardzo ostrożna lub przestraszona. Najbardziej bezpośrednią "okazją" była wizyta Fenicjanina Dagona, który wyraźnie próbował jej intymności:

*   Z rozdziału 9, opisującego pobyt Sary w willi:
    *   "Już dziesięć dni mieszkała w tym ustroniu Sara, z obawy i wstydu kryjąc się przed ludźmi, tak że ze służby folwarcznej prawie nikt jej nie widział."
    *   "Jednego dnia, w wigilię szabasu, przyszedł na folwark ojciec... Sara z płaczem rzuciła się do niego..."
    *   "Trzy dni temu — przerwała Sara — był u mnie Fenicjanin Dagon. Nie chciałam go widzieć, ale tak się napierał..."
    *   "Dał mi złoty pierścionek — wtrąciła Tafet."
    *   "Powiedział mi — mówiła Sara — że jest dzierżawcą u mego pana, darował mi dwie bransolety na nogi, zausznice z pereł i szkatułkę wonności z kraju Punt."
    *   "Za co on ci to darował? — zapytał ojciec."
    *   "Za nic. Tylko prosił, ażebym o nim dobrze myślała i niekiedy powiedziała mojemu panu, że Dagon jest najwierniejszym jego sługą."

*   Z rozdziału 13, opisującego wizytę Dagona u Sary:
    *   Dagon, zwracając się do Sary, mówi: "**Ja zaś takim żarem miłosnym płonę do ciebie, że gdybyś nie należała do najdostojniejszego pana naszego, dałbym za ciebie Gedeonowi (oby zdrów był!) dziesięć talentów i pojąłbym cię za prawą małżonkę. Taki jestem namiętny!...**"
    *   Następnie Dagon oferuje jej prezenty: "**weźmij, Saro, ten kielich szczerozłoty...**" i w końcu oferuje pieniądze za "poufałość": "**Ty zaś, Saro, wiedz o tym, że gdybyś kiedy dopuściła mnie do poufałości ze sobą, dałbym tobie dwa talenty, a twemu ojcu talent.**"
    *   Sara jednak odmawia: "**Nie wezmę kielicha — odparła — bo pan mój zabronił mi od kogokolwiek przyjmować darów.**" i w odpowiedzi na ofertę intymności: "**Nie mogę!... — szepnęła Sara, nie ukrywając wstrętu dla Dagona.**"
    *   Dagon ostatecznie chwali jej wierność Ramzesowi: "**Bardzo dobrze, Saro!... Ja tylko chciałem przekonać się, czy ty jesteś wierna naszemu panu. I widzę, że jesteś wierna...**"

… (rest of the markdown omitted for brevity) …
`;

describe("extractQuotes()", () => {
  it("returns a non-empty list of quotes", () => {
    const quotes = extractQuotes(exampleMarkdown);
    expect(quotes.length).toBeGreaterThan(10); // adjust threshold as you like
  });

  it("does not duplicate identical quotes", () => {
    const quotes = extractQuotes(exampleMarkdown);
    expect(new Set(quotes).size).toBe(quotes.length);
  });

  it("includes the long, bold Dagon confession sentence", () => {
    const quotes = extractQuotes(exampleMarkdown);
    expect(quotes).toEqual(
      expect.arrayContaining([
        "Ja zaś takim żarem miłosnym płonę do ciebie, że gdybyś nie należała do najdostojniejszego pana naszego, dałbym za ciebie Gedeonowi (oby zdrów był!) dziesięć talentów i pojąłbym cię za prawą małżonkę. Taki jestem namiętny!...",
      ]),
    );
  });

  it("strips markdown bullets and bold markers", () => {
    const quotes = extractQuotes(exampleMarkdown);
    quotes.forEach((q) => {
      expect(q.trim().startsWith("*")).toBe(false);
      expect(q.includes("**")).toBe(false);
    });
  });
});
