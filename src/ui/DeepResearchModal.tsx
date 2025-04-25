import React from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { DeepResearchWithText, LLMAnswerViewer } from "./MarkdownComponent"; // Assuming this is the correct path

interface DeepResearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  passedText?: string;
}

const text = `Oto fragmenty z tekstu, które mogą posłużyć do odpowiedzi na zadane pytania:

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

Inne fragmenty wspominają o kontaktach z innymi ludźmi, ale nie sugerują możliwości zdrady:
*   W rozdziale 9 i 10 Sara ma ze sobą krewną Tafet i Murzyna Samuela (którego Ramzes później uwalnia i zastępuje go inny krewny, Samuel, syn Ezdreasza).
*   W rozdziale 9 Sara wspomina, że "Raz wyszłam do ogrodu w dzień... Zobaczyli mnie jacyś ludzie i zaczęli mówić między sobą: „Patrzcie, to ta Żydówka następcy tronu, przez którą opóźnia się przybór!..."".
*   W rozdziale 9 Sara opowiada ojcu o wizycie "dwóch kobiet... Ta starsza wyglądała na kapłankę". Te kobiety tylko się jej przypatrzyły i skomentowały jej urodę.
*   W rozdziale 10 willę atakuje tłum, ale Sara jest w środku i bronią jej Ramzesowi słudzy oraz tajemniczy kapłan (Herhor).

Z tekstu wynika, że Sara miała *okazję* do kontaktów z innymi mężczyznami (Dagon), i jeden z nich (Dagon) próbował ją uwieść. Jednakże, tekst wyraźnie zaznacza, że Sara odrzuciła jego propozycje i prezenty, okazując mu wstręt.

**Czy dziecko jest na pewno jego?**

Tekst kilkukrotnie wspomina o ciąży Sary i za każdym razem jest ona przedstawiana jako ciąża z dzieckiem Ramzesa, bez żadnych wątpliwości co do jego ojcostwa.

*   W rozdziale 16, Herhor rozmawia z królową Nikotris o Sarze:
    *   Herhor mówi: "**Że zaś Sara jest brzemienna...**"
    *   Nikotris pyta ze zdziwieniem: "**Czy tak?... Skąd wiesz?...**"
    *   Herhor odpowiada: "**O czym nie wie ani jego dostojność następca, ani nawet Sara?... My wszystko musimy wiedzieć. Ten zresztą sekret nie był trudny do zdobycia. Przy Sarze bowiem znajduje się jej krewna, Tafet, kobieta niezrównanej gadatliwości.**"
    *   Herhor kontynuuje, mówiąc o planach co do dziecka: "**Będzie to przecież dziecko książęce.**" i później "**A jeżeli syn, wówczas zostanie Żydem...**"

*   W rozdziale 18, królowa Nikotris rozmawia z Ramzesem:
    *   Nikotris: "**Czy chcesz wziąć ze sobą tę dziewczynę w podróż?... Pamiętaj, że hałas i ruch, jaki cię będzie otaczał, jej i dziecku może zaszkodzić.**"
    *   Ramzes pyta ze zdziwieniem: "**Czy mówisz o Sarze? — spytał zdziwiony Ramzes. — Ona brzemienna?... Nic mi o tym nie wspomniała...**"
    *   Nikotris radzi mu, jak potraktować Sarę ze względu na ciążę i przyszłość dziecka: "**Może wstydzi się, może sama nie wie... W każdym razie podróż...**"
    *   Ramzes wyraża swoją dumę z przyszłego ojcostwa i plany co do dziecka: "**Naturalnie — odparł Ramzes. — Mój pierwszy syn, choć nie będzie posiadał praw książęcych, musi być tak postawiony, abym ja go się nie wstydził ani on nie miał żalu do mnie.**"

*   W rozdziale 24, Tutmozis przynosi Ramzesowi wieści od Sary:
    *   Mówiąc o horoskopie dziecka: "**Lecz kapłani postawili jego przyszłemu dziecku tak dobry horoskop, że książę był zachwycony. Twierdzili na pewno, że dziecko będzie synem bardzo obdarowanym od bogów i jeżeli ojciec będzie go kochał, osięgnie w życiu wielkie zaszczyty.**"

*   W rozdziale 25, Dagon i Hiram dyskutują o planach, a Dagon wspomina o Sarze:
    *   Dagon mówi: "**Żeby nam tylko nie przeszkodziła ta Sara, Żydówka... Ona spodziewa się dziecka, do którego książę już dziś jest przywiązany. Gdyby zaś urodził jej się syn, poszłyby w kąt wszystkie.**"

W żadnym z tych fragmentów nie ma sugestii, że ojcem dziecka mógłby być ktoś inny niż Ramzes. Ramzes, królowa Nikotris, Herhor i nawet Fenicjanie (Dagon i Hiram) uważają Ramzesa za ojca oczekiwanego dziecka. Prawdopodobnie Tafet, która pierwsza poinformowała Herhora o ciąży, również wskazała Ramzesa jako ojca.

Podsumowując, choć Dagon próbował, Sara wyraźnie odrzuciła jego zaloty. Tekst nie daje żadnych podstaw do wątpienia w ojcostwo Ramzesa nad dzieckiem Sary.`;

export const DeepResearchModal: React.FC<DeepResearchModalProps> = ({ isOpen, onClose, passedText }) => {
  if (!isOpen) {
    return null;
  }

  const modalRoot = document.getElementById("deep-research-root");

  if (!modalRoot) {
    console.error("The element #deep-research-root was not found in the DOM.");
    return null; // Or render an error message
  }

  return ReactDOM.createPortal(
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[9]" // High z-index, below the modal content
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div
        className="fixed inset-0 z-[99] flex items-center justify-center p-4" // Highest z-index
        role="dialog"
        aria-modal="true"
        aria-labelledby="deep-research-title"
      >
        <div className="bg-background text-foreground rounded-lg shadow-xl w-full max-w-4xl h-[90vh] max-h-[800px] flex flex-col relative overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 id="deep-research-title" className="text-lg font-semibold">
              Deep Research
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Close deep research modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            <LLMAnswerViewer answerMarkdown={passedText || text} />
            {/* <LLMAnswerViewer answerMarkdown={'"Masz moją wdzięczność i przekonasz się, że jest coś warta"'} /> */}
          </div>
        </div>
      </div>
    </>,
    modalRoot,
  );
};
