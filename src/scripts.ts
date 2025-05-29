document.querySelectorAll("#legacy p, #legacy span, #legacy li").forEach((el) => {
  el.innerHTML = el.innerHTML.replace(/(\s|^)([aiouwz]|na|do|od|za|po|we|ku|ze|co|że|bo|iż|ni|nad|pod|bez|dla|oraz|ale|lub|czy|ani)\s/gi, "$1$2\u00A0");
});

/**
 * Pre-React Splash Screen
 * This script runs before React loads to show an immediate loading screen
 */
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
  "Otwieranie bram do świata książek...",
  "Rozpalanie ognia wyobraźni...",
  "Szlifowanie literackich klejnotów...",
  "Nanoszenie ostatnich poprawek...",
  "Splatanie wątków opowieści...",
  "Przebudzanie uśpionych bohaterów...",
];

class SplashScreenManager {
  currentPhrase: string;
  phraseInterval: NodeJS.Timeout | null;
  previousPhrases: Set<string>;
  isExiting: boolean;

  constructor() {
    this.currentPhrase = "";
    this.phraseInterval = null;
    this.previousPhrases = new Set();
    this.isExiting = false;

    this.init();
  }

  init() {
    this.setupPhraseCycle();
    this.setupEventListeners();
  }

  getRandomPhrase() {
    // Always have at least 5 phrases available to choose from
    if (this.previousPhrases.size > loadingPhrases.length - 5) {
      this.previousPhrases.clear();
    }

    let phrase;
    let attempts = 0;
    const maxAttempts = 10; // Prevent infinite loop

    do {
      const randomIndex = Math.floor(Math.random() * loadingPhrases.length);
      phrase = loadingPhrases[randomIndex];
      attempts++;
    } while (this.previousPhrases.has(phrase) && attempts < maxAttempts && loadingPhrases.length > 1);

    // Track this phrase so we don't repeat it soon
    this.previousPhrases.add(phrase);
    return phrase;
  }

  updatePhrase() {
    const phraseElement = document.getElementById("loading-phrase");
    if (phraseElement) {
      // Fade out current phrase
      phraseElement.style.animation = "none";
      phraseElement.style.opacity = "0";
      phraseElement.style.transform = "translateY(-20px)";
      phraseElement.style.filter = "blur(3px)";

      setTimeout(() => {
        // Update text and fade in new phrase
        this.currentPhrase = this.getRandomPhrase();
        phraseElement.textContent = this.currentPhrase;
        phraseElement.style.animation = "textFadeIn 0.5s ease-out forwards";
      }, 200);
    }
  }

  setupPhraseCycle() {
    // Initial phrase
    this.updatePhrase();

    // Set up interval for phrase changes
    const PHRASE_DURATION_MS = 3000;
    this.phraseInterval = setInterval(() => {
      this.updatePhrase();
    }, PHRASE_DURATION_MS);
  }

  displayStartButton() {
    const startButton = document.getElementById("start-button");
    if (startButton) {
      startButton.classList.remove("disabled");
      startButton.classList.add("visible");
    }
  }

  setupEventListeners() {
    const startButton = document.getElementById("start-button");
    if (startButton) {
      startButton.addEventListener("click", () => this.handleStartClick());
    }

    window.addEventListener("appReady", () => {
      this.displayStartButton();
    });
  }

  async handleStartClick() {
    if (this.isExiting) return;
    this.isExiting = true;

    try {
      this.hideSplash();

      // Wait for animation to complete before dispatching events and playing audio
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("splashHidden"));
        if (window.playAudiobook) {
          window.playAudiobook(true);
        }
      }, 1000); // Match animation duration
    } catch (error) {
      console.error("Error during splash screen exit:", error);
      // Fallback: force exit even if there was an error
      this.hideSplash();

      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("splashHidden"));
        if (window.playAudiobook) {
          window.playAudiobook(true);
        }
      }, 100);
    }
  }

  hideSplash() {
    const splashElement = document.getElementById("splash-screen");
    if (splashElement) {
      splashElement.classList.add("splash-screen--hide");
    }

    if (this.phraseInterval) {
      clearInterval(this.phraseInterval);
      this.phraseInterval = null;
    }
  }
}

// Initialize splash screen when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  new SplashScreenManager();
});
