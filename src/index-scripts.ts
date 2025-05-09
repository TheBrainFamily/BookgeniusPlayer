const loadingPhraseElement = document.getElementById("loading-phrase");

const loadingPhrases = [
  "Kreowanie wirtualnej biblioteki...",
  "Przywoływanie fikcyjnych postaci...",
  "Warzenie literackich eliksirów...",
  "Odkurzanie starożytnych ksiąg...",
  "Stawianie ostatnich kropek...",
  "Przewracanie cyfrowych stron...",
  "Łączenie wyobraźni z rzeczywistością...",
  "Odszyfrowywanie intencji autora...",
  "Układanie słów w idealnym porządku...",
  "Uwalnianie narracyjnej magii...",
];

let phrasesCount = 0;
let intervalId = null;
let phrase = "";

function getRandomPhrase() {
  do {
    phrase = loadingPhrases[Math.floor(Math.random() * loadingPhrases.length)];
  } while (phrase === loadingPhraseElement.textContent);

  return phrase;
}

function updatePhrase() {
  loadingPhraseElement.classList.add("loading-phrase--show");
  loadingPhraseElement.textContent = getRandomPhrase();

  const timeoutId = setTimeout(() => {
    loadingPhraseElement.classList.remove("loading-phrase--show");
  }, 2000);

  phrasesCount++;

  if (phrasesCount >= 10) {
    clearInterval(intervalId);
    clearTimeout(timeoutId);
  }
}

updatePhrase();
intervalId = setInterval(updatePhrase, 2500);

document.querySelectorAll("#legacy p, #legacy span, #legacy li").forEach((el) => {
  el.innerHTML = el.innerHTML.replace(/(\s|^)([aiouwz]|na|do|od|za|po|we|ku|ze|co|że|bo|iż|ni|nad|pod|bez|dla|oraz|ale|lub|czy|ani)\s/gi, "$1$2\u00A0");
});
