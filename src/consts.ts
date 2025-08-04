export type BOOK_SLUGS = string;

// This will be replaced by Vite's `define` feature in vite.config.mts
// We need to declare it globally for TypeScript to know about it during type checking
// in other files that might import CURRENT_BOOK before Vite's define kicks in for them.
// However, for this specific file, the cast is sufficient.
declare global {
  const __SELECTED_BOOK_SLUG__: BOOK_SLUGS;
}

// For backward compatibility, we'll keep CURRENT_BOOK but make it dynamic
// This will be replaced with dynamic loading
