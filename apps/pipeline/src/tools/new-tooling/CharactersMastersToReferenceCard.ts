import { generatePicturesForEntities } from "./generate-pictures-for-entities";

const xml = `
<Stary-podoficer display="Stary podoficer" summary="Uczestnik powstania węgierskiego."/>
<Oficerowie display="Oficerowie" summary="Oficerowie walczący podczas powstania węgierskiego u boku Rzeckiego i Katza."/>
<Czarni-od-dymu display="Oficerowie" summary="Oficerowie utrzymujący dyscyplinę w szeregach."/>
<Pol-obrotu-w-prawo-marsz display="Żołnierz" summary="Rozkaz wojskowy do przemarszu."/>
<Oficer-austriacki display="Oficer austriacki" summary="Oficer zasmucony widokiem wojennego okrucieństwa."/>
<Jeden-z-kolegow display="Żołnierz" summary="Kolega z powstania węgierskiego, zwracający uwagę na wątpliwy stan psychiczny Katza."/>
<Szapary display="Szapary" summary="Żywiołowy i gadatliwy Węgier, który z entuzjazmem mówi o ojczyźnie i dawnych bohaterach."/>
<Liptak display="Liptak" summary="Spokojny i praktyczny towarzysz drogi, myślący o codziennych potrzebach."/>
<Stein display="Stein" summary="Poważny i milczący uczestnik rozmowy, o postawie raczej zamyślonej niż pełnej emocji."/>
<Kossuth display="Kossuth" summary="Wspominany przez żołnierzy przywódca, symbol ich dawnej walki i nadziei."/>
<Chlop display="Chłop" summary="Mężczyzna budzący Rzeckiego ze snu."/>
<Nieznany-zydek display="Mężczyzna żydowskiego pochodzenia" summary="Mężczyzna, który pomaga Rzeckiemu, lecz przy okazji ujawnia kupiecką naturę, próbując odkupić od niego kosztowności."/>
<Chytry-furman display="Furman" summary="Furman wiozący Rzeckiego, który przy okazji, korzystając z jego dobroci, zgarnia po drodze do fury członków swojej rodziny."/>
<Drugi-wicek display="Wicek" summary="Chłopiec na posyłki w sklepie Minclów."/>
<Gruby-glos display="Mężczyzna o basowym głosie" summary="Jegomość krytykujący Wokulskiego."/>
<Ktos-trzeci display="Szepczący mężczyzna" summary="Jegomość uczestniczący w pogadance na temat Wokulskiego."/>
<Jegomosc-dychawiczny display="Mężczyzna dychawiczny" summary="Jegomość oddychający z trudem."/>
<Inny-glos display="Inny mężczyzna" summary=""/> 
<Ktos-milczacy display="Milczący mężczyzna" summary=""/> 
<William-collins display="Niewyraźny jegmość, nauczyciel języka angielskiego."/>
<Pracownik-cukierni display="Pracownik cukierni" summary=""/>
<Dziennikarz display="Dziennikarz" summary="Reporter mający opisać sklep w gazecie."/> 
<Gluchy-magnat display="Głuchy magnat" summary="" />
<kuzyn-hrabia display="Hrabia" summary="Wyniosły kuzyn Księcia."/>
<Mezczyzna-w-kacie display="Rozmówca" summary="" />
<Rozmowca-magnat display="Niezadowolony jegomość" summary=""/>
<Mezczyzna-kupiec display="Oponent z grupy kupców" summary="Mężczyzna siedzący przy stole kupców i przemysłowców, sceptycznie nastawiony do układów biznesowych z Żydami."/>
<Kropla-w-morzu display="Kupiec"/>
<Wygolony-mezczyzna display="Wygolony mężczyzna" summary=""/>
<szlachcic display="Nieprzejednany szlachcic" summary="Człowiek uparty i nieustępliwy w swoich przekonaniach, wierny tradycjom stanu szlacheckiego."/>
<Obdartus display="Obdarty człowiek" summary="Podejrzana osoba, wyłaniająca się z ciemności parku."/>
<Lokaj-faworyty display="Stary lokaj z siwymi wąsami" summary=""/>
<Czwarty-pan display="Jegomość" summary=""/>
<Wysoki-jegomosc display="Wysoki jegomość" summary=""/>
<Partner-barona display="Gracz" summary="Karciany partner barona"/>
<Kolejny-Zyd display="Żyd" summary=""/>
<Wozny display="Woźny" summary="Pracownik sądu, upominał kłócących się licytantów."/>
<Pan-cynader display="Pan Cynader" summary="Młody, ciemnowłosy, piękny mężczyzna. Razem z dżentelmentem z faworytami rozmawiają o interesach Łęckiego."/>
<Zyd-z-faworytami display="Dżentelmen z faworytami" summary="Łysy mężczyzna żydowskiego pochodzenia, komentujący interesy Rzeckiego."/>
<Czerstwy display="Siwy jegomość" summary="Mężczyzna zanoszący się z zamiarami kupna licytowanej kamienicy."/>
<Urzednik display="Urzędnik" summary=""/>
<Pani-rzezuchowska display="Pani Rzeżuchowska" summary="Pani z wyższych sfer, organizująca wystawne przyjęcia."/>
<Szwajcar-znajomy display="Szwajcar" summary="Znajomy Wokulskiego, który komentuje ruch w hotelu wywołany przyjazdem Molinariego."/>
<Pomocnik-szwajcara display="Pomocnik Szwajcara" summary=""/>
<Sluzacy-wasowskiej display="Służący Wąsowskiej" summary=""/>
<Znajomy-muzyk display="Muzyk" summary="Muzyk znający Wokulskiego, który obiecał mu zapoznanie z Molinarim."/>
<Nadkonduktor display="Nadkonduktor" summary=""/>`;

// need to iterate over xml and return an array of objects with display and summary

const characters = xml
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => {
    const tagMatch = line.match(/<([^ ]+)/);
    const displayMatch = line.match(/display="([^"]*)"/);
    const summaryMatch = line.match(/summary="([^"]*)"/);

    const name = tagMatch ? tagMatch[1] : "";
    const display = displayMatch ? displayMatch[1] : "";
    const summary = summaryMatch ? summaryMatch[1] : "";

    return { name, display, summary };
  });

const referenceCards = {
  characters: characters.map(({ name, display, summary }) => ({
    name,
    referenceCard: summary ? `${display}: ${summary}` : display,
  })),
};

console.log(referenceCards);

generatePicturesForEntities(referenceCards, { skipBookAnalysis: true });
