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

function getRandomPhrase() {
  return loadingPhrases[Math.floor(Math.random() * loadingPhrases.length)];
}

loadingPhraseElement.textContent = getRandomPhrase();

let phrasesCount = 0;
let phraseInterval = null;

function updatePhrase() {
  loadingPhraseElement.classList.add("phrase-transition");

  setTimeout(() => {
    loadingPhraseElement.textContent = getRandomPhrase();
  }, 300);

  setTimeout(() => {
    loadingPhraseElement.classList.remove("phrase-transition");
  }, 600);

  phrasesCount++;

  if (phrasesCount >= 3) {
    clearInterval(phraseInterval);
  }
}

phraseInterval = setInterval(updatePhrase, 3000);

document.querySelectorAll("#legacy p, #legacy span, #legacy li").forEach((el) => {
  el.innerHTML = el.innerHTML.replace(/(\s|^)([aiouwz]|na|do|od|za|po|we|ku|ze|co|że|bo|iż|ni|nad|pod|bez|dla|oraz|ale|lub|czy|ani)\s/gi, "$1$2\u00A0");
});
