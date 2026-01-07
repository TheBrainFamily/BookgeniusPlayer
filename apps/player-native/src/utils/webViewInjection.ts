/**
 * Scripts to inject into the WebView for book rendering and position tracking.
 */

/**
 * CSS styles for the book content in WebView
 * Includes gradient overlay for readability over backgrounds
 */
export const BOOK_STYLES = `
<style>
  * {
    box-sizing: border-box;
    -webkit-tap-highlight-color: transparent;
  }

  html, body {
    margin: 0;
    padding: 0;
    background-color: transparent;
    color: #ffffff;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 18px;
    line-height: 1.8;
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
  }

  body {
    /* Gradient overlay for readability - dark in center, fading to transparent at edges */
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0) 0%,
      rgba(0, 0, 0, 0.75) 15%,
      rgba(0, 0, 0, 0.85) 35%,
      rgba(0, 0, 0, 0.85) 65%,
      rgba(0, 0, 0, 0.75) 85%,
      rgba(0, 0, 0, 0) 100%
    );
    background-attachment: fixed;
    padding: 20px;
    padding-top: 60px;
    padding-bottom: 120px;
  }

  #content-container {
    max-width: 680px;
    margin: 0 auto;
    padding: 0 16px;
  }

  section[data-chapter] {
    margin-bottom: 64px;
  }

  h2, h3, h4, h5, h6 {
    color: #ffffff;
    margin-top: 40px;
    margin-bottom: 20px;
    font-weight: 600;
    text-align: center;
  }

  h2 { font-size: 28px; }
  h3 { font-size: 24px; }
  h4 { font-size: 20px; }

  p {
    margin: 0 0 20px 0;
    text-align: justify;
    text-indent: 1.5em;
  }

  p:first-of-type {
    text-indent: 0;
  }

  /* Play format styles */
  .play-row {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    margin-bottom: 20px;
    gap: 12px;
  }

  .play-row[data-text-alignment="right"] {
    flex-direction: row-reverse;
  }

  .character-avatar {
    width: 48px;
    height: 48px;
    border-radius: 24px;
    background-color: rgba(255, 255, 255, 0.15);
    flex-shrink: 0;
    overflow: hidden;
    border: 2px solid rgba(255, 255, 255, 0.3);
  }

  .character-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .character-text {
    flex: 1;
    min-width: 0;
  }

  .character-text p {
    margin: 0;
    text-align: left;
    text-indent: 0;
  }

  .play-row[data-text-alignment="right"] .character-text p {
    text-align: right;
  }

  /* Speaker label styling for plays */
  .speaker-name {
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: 4px;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .didaskalia-row {
    justify-content: center;
  }

  .didaskalia-text {
    text-align: center;
    font-style: italic;
    color: rgba(255, 255, 255, 0.7);
  }

  .didaskalia-text p {
    text-align: center;
    text-indent: 0;
  }

  /* Active paragraph highlight */
  .active-paragraph {
    background-color: rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    margin-left: -12px;
    margin-right: -12px;
    padding-left: 12px;
    padding-right: 12px;
    padding-top: 4px;
    padding-bottom: 4px;
  }

  /* Figure/image styles */
  figure {
    margin: 32px 0;
    text-align: center;
  }

  figure img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
  }

  figcaption {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.6);
    margin-top: 12px;
    font-style: italic;
  }

  /* Speaker label hidden if using avatars */
  [data-speaker-label] {
    display: none;
  }

  /* Blockquote styling */
  blockquote {
    margin: 24px 0;
    padding-left: 20px;
    border-left: 3px solid rgba(255, 255, 255, 0.3);
    font-style: italic;
    color: rgba(255, 255, 255, 0.85);
  }

  /* Emphasis */
  em, i {
    font-style: italic;
  }

  strong, b {
    font-weight: 600;
  }

  /* Links */
  a {
    color: #60a5fa;
    text-decoration: none;
  }

  /* Chapter titles */
  .chapter-title {
    font-size: 32px;
    margin-top: 80px;
    margin-bottom: 40px;
  }

  /* Scene breaks */
  hr {
    border: none;
    height: 1px;
    background: linear-gradient(
      to right,
      transparent,
      rgba(255, 255, 255, 0.3) 20%,
      rgba(255, 255, 255, 0.3) 80%,
      transparent
    );
    margin: 40px 0;
  }
</style>
`;

/**
 * JavaScript to inject for tracking reading position via IntersectionObserver.
 * Sends position updates to React Native via postMessage.
 */
export const PAGE_OBSERVER_SCRIPT = `
<script>
(function() {
  'use strict';

  console.log('[PageObserver] Starting initialization...');

  const rootEl = document.getElementById('content-container');
  if (!rootEl) {
    console.warn('[PageObserver] No #content-container found');
    return;
  }

  const intersectingPages = new Set();
  let lastSentLocation = null;
  let rafId = null;

  function getParagraphInfo(element) {
    const chapterEl = element.closest('section[data-chapter]');
    const chapterStr = chapterEl ? chapterEl.dataset.chapter : null;
    const chapter = chapterStr !== null ? parseInt(chapterStr, 10) : null;

    const idxStr = element.dataset.index;
    let paragraph = null;

    if (idxStr !== null && idxStr !== undefined) {
      const idxNum = parseInt(idxStr, 10);
      paragraph = Number.isFinite(idxNum) ? idxNum : null;
    } else if (chapter !== null && /^H[3-6]$/.test(element.tagName)) {
      paragraph = 0;
    }

    return { chapter, paragraph };
  }

  function isParagraphKey(info) {
    if (!info) return false;
    return (
      typeof info.chapter === 'number' &&
      Number.isFinite(info.chapter) &&
      typeof info.paragraph === 'number' &&
      Number.isFinite(info.paragraph)
    );
  }

  function processIntersections() {
    rafId = null;

    if (intersectingPages.size === 0) {
      console.log('[PageObserver] No intersecting pages');
      return;
    }

    const sorted = Array.from(intersectingPages)
      .map(el => getParagraphInfo(el))
      .filter(isParagraphKey)
      .sort((a, b) => {
        if (a.chapter !== b.chapter) return a.chapter - b.chapter;
        return a.paragraph - b.paragraph;
      });

    if (sorted.length === 0) {
      console.log('[PageObserver] No valid paragraphs after filtering');
      return;
    }

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const middle = sorted[Math.floor(sorted.length / 2)];

    const location = {
      chapter: first.chapter,
      paragraph: first.paragraph,
      endChapter: last.chapter,
      endParagraph: last.paragraph,
      currentChapter: middle.chapter,
      currentParagraph: middle.paragraph,
      earliestVisibleParagraph: first.paragraph,
      latestVisibleParagraph: last.paragraph,
      earliestVisibleChapter: first.chapter,
      latestVisibleChapter: last.chapter,
    };

    // Dedupe: only send if changed
    const locStr = JSON.stringify(location);
    if (locStr === lastSentLocation) return;
    lastSentLocation = locStr;

    console.log('[PageObserver] Sending location:', location);

    // Send to React Native
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'LOCATION_UPDATE',
        location: location
      }));
    } else {
      console.warn('[PageObserver] ReactNativeWebView not available');
    }
  }

  function scheduleProcessing() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(processIntersections);
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          intersectingPages.add(entry.target);
        } else {
          intersectingPages.delete(entry.target);
        }
      });
      scheduleProcessing();
    },
    {
      root: null, // viewport
      rootMargin: '-10% 0px -30% 0px', // Focus zone in upper portion
      threshold: [0.1, 0.5, 0.9]
    }
  );

  // Observe all elements with data-index
  function observeAll() {
    const elements = document.querySelectorAll('[data-index]');
    console.log('[PageObserver] Found', elements.length, 'elements with data-index');
    elements.forEach(el => {
      observer.observe(el);
    });

    // Also observe chapter headings
    const headings = document.querySelectorAll('section[data-chapter] h2, section[data-chapter] h3');
    console.log('[PageObserver] Found', headings.length, 'chapter headings');
    headings.forEach(el => {
      observer.observe(el);
    });
  }

  // Initial observation after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeAll);
  } else {
    observeAll();
  }

  // Re-observe if new content is added
  const mutationObserver = new MutationObserver(() => {
    observeAll();
  });
  mutationObserver.observe(rootEl, { childList: true, subtree: true });

  // Also trigger initial check after a short delay
  setTimeout(() => {
    console.log('[PageObserver] Delayed initial check');
    scheduleProcessing();
  }, 500);

  console.log('[PageObserver] Initialized successfully');
})();
</script>
`;

/**
 * Script to handle scroll-to-paragraph commands from React Native.
 */
export const SCROLL_HANDLER_SCRIPT = `
<script>
(function() {
  'use strict';

  window.scrollToParagraph = function(chapter, paragraph) {
    console.log('[ScrollHandler] Scrolling to chapter', chapter, 'paragraph', paragraph);
    const selector = 'section[data-chapter="' + chapter + '"] [data-index="' + paragraph + '"]';
    const element = document.querySelector(selector);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    }
    console.warn('[ScrollHandler] Element not found:', selector);
    return false;
  };

  console.log('[ScrollHandler] Initialized');
})();
</script>
`;

/**
 * Script to populate character avatars from data passed by React Native.
 */
export const AVATAR_INJECTION_SCRIPT = `
<script>
(function() {
  'use strict';

  // Character avatar URLs will be injected here
  window.characterAvatars = {};

  window.setCharacterAvatars = function(avatars) {
    console.log('[AvatarInjection] Received avatars:', Object.keys(avatars).length);
    window.characterAvatars = avatars;
    populateAvatars();
  };

  function populateAvatars() {
    const avatars = window.characterAvatars;
    if (!avatars || Object.keys(avatars).length === 0) {
      console.log('[AvatarInjection] No avatars to populate');
      return;
    }

    let populated = 0;

    // Find all character-avatar containers with data-speaker
    document.querySelectorAll('.character-avatar[data-speaker]').forEach(function(container) {
      const speakers = container.getAttribute('data-speaker');
      if (!speakers) return;

      const firstSpeaker = speakers.split(/\\s+/)[0];
      if (!firstSpeaker) return;

      // Check if we have an avatar URL for this character
      const avatarUrl = avatars[firstSpeaker] || avatars[firstSpeaker.toLowerCase()];
      if (!avatarUrl) return;

      // Check if avatar already populated
      if (container.querySelector('img')) return;

      // Create and append the avatar image
      const img = document.createElement('img');
      img.src = avatarUrl;
      img.alt = firstSpeaker;
      img.onerror = function() {
        this.style.display = 'none';
      };
      container.appendChild(img);
      populated++;
    });

    // Also populate character-placeholder elements (inline avatars)
    document.querySelectorAll('.character-placeholder[data-character]').forEach(function(placeholder) {
      const characterSlug = placeholder.getAttribute('data-character');
      if (!characterSlug) return;

      const avatarUrl = avatars[characterSlug] || avatars[characterSlug.toLowerCase()];
      if (!avatarUrl) return;

      // Check if avatar already populated
      if (placeholder.querySelector('img')) return;

      // Create and append the avatar image
      const img = document.createElement('img');
      img.src = avatarUrl;
      img.alt = characterSlug;
      img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 50%;';
      img.onerror = function() {
        this.style.display = 'none';
      };
      placeholder.appendChild(img);
      populated++;
    });

    console.log('[AvatarInjection] Populated', populated, 'avatars');
  }

  // Re-populate when new content is added (e.g., chapter transitions)
  const observer = new MutationObserver(function() {
    populateAvatars();
  });

  const container = document.getElementById('content-container');
  if (container) {
    observer.observe(container, { childList: true, subtree: true });
  }

  // Initial population
  populateAvatars();

  console.log('[AvatarInjection] Initialized');
})();
</script>
`;

/**
 * Debug script to log HTML structure
 */
export const DEBUG_SCRIPT = `
<script>
(function() {
  'use strict';

  // Log structure on load
  setTimeout(function() {
    const chapters = document.querySelectorAll('section[data-chapter]');
    console.log('[Debug] Found', chapters.length, 'chapters');

    chapters.forEach(function(chapter) {
      const chapterNum = chapter.dataset.chapter;
      const paragraphs = chapter.querySelectorAll('[data-index]');
      const avatars = chapter.querySelectorAll('.character-avatar');
      console.log('[Debug] Chapter', chapterNum, ':', paragraphs.length, 'paragraphs,', avatars.length, 'avatar containers');
    });
  }, 1000);
})();
</script>
`;

/**
 * Character avatar data structure
 */
export interface CharacterAvatarMap {
  [slug: string]: string; // slug -> avatar URL
}

/**
 * Build the full HTML document for the WebView
 */
export function buildWebViewHtml(bookHtml: string, characterAvatars?: CharacterAvatarMap): string {
  // Build initial avatar data injection
  const avatarDataScript =
    characterAvatars && Object.keys(characterAvatars).length > 0
      ? `<script>window.characterAvatars = ${JSON.stringify(characterAvatars)};</script>`
      : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  ${BOOK_STYLES}
</head>
<body>
  <div id="content-container">
    ${bookHtml}
  </div>
  ${avatarDataScript}
  ${PAGE_OBSERVER_SCRIPT}
  ${SCROLL_HANDLER_SCRIPT}
  ${AVATAR_INJECTION_SCRIPT}
  ${DEBUG_SCRIPT}
</body>
</html>
`;
}
