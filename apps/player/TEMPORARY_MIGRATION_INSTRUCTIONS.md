# Dynamic Book Loading Setup Instructions

## Quick Start

1. **Compile book data for runtime loading:**

   ```bash
   npm run compile-book-data Romeo-And-Juliet-Small
   ```

2. **Start the development server:**

   ```bash
   npm run dev
   ```

3. **Access the book:**
   - Default: http://localhost:5173/ (loads Romeo-And-Juliet-Small)
   - With URL param: http://localhost:5173/?book=Romeo-And-Juliet-Small

## Changes Made

### 1. Generic Vite Configuration

- Removed dependency on `VITE_BOOK_DIR` environment variable
- Made vite.config.mts generic with hardcoded defaults for HTML template
- Removed book-specific build-time transformations

### 2. Runtime Book Loading

- Created `bookDataLoader` service that loads book data from compiled JS files
- Book selection via URL parameter: `?book=BookSlug`
- All data getters now use async/await pattern with caching

### 3. Dynamic Asset URLs

- Created `assetUrls.ts` utility for dynamic asset path generation
- Updated audio/video references to use dynamic book paths
- Assets should be placed in `/public/[book-slug]/assets/`

### 4. File Structure

```
public/
  Romeo-And-Juliet-Small/
    assets/          # Book assets (videos, images, audio)
    compiled/        # Compiled JS files from TypeScript
      bookData.js
      getAllVariants.js
      ... etc
```

## Adding a New Book

1. Place book data TypeScript files in `/public/[book-slug]/`
2. Place assets in `/public/[book-slug]/assets/`
3. Run `npm run compile-book-data [book-slug]`
4. Access via `http://localhost:5173/?book=[book-slug]`

## Future Improvements

- Generate book-specific HTML files for different domains
- Move to server-side data loading instead of compiled JS files
- Add proper error handling for missing books
- Implement book switching without page reload
