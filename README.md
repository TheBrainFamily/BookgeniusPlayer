# BookGenius Frontend



## Overview

BookGenius is an innovative multi-book interactive reading platform that transforms classic literature into immersive multimedia experiences. The application features synchronized audiobooks, character avatars, background music, animations, and real-time AI-powered research capabilities.

## Live demo:

https://bookgenius.net/

![CleanShot 2025-06-05 at 14 50 17@2x](https://github.com/user-attachments/assets/bf4392d6-2faa-4902-a2f2-b678c30fbac0)
![CleanShot 2025-06-05 at 14 47 07@2x](https://github.com/user-attachments/assets/61fea04b-e64c-4530-91a7-d2ac18fde3c1)

**Key Features:**

- Multi-book support
- Character avatars with speaking animations
- Dynamic background videos and music
- Real-time AI research and character analysis
- Progressive Web App (PWA) capabilities
- Cross-platform responsive design

## Quick Start

### Running the Application

```bash
# Install dependencies
pnpm install

# Be sure that in public_books/$BOOK_SLUG you have a book.xml file

pnpm start public_books/$BOOK_SLUG (eg. pnpm start public_books/Snow_Queen)

```

### Editor Mode (Development)

For content editing and development:

```bash
# Run frontend with editor mode
VITE_BOOK=Krolowa-Sniegu VITE_EDITOR=true pnpm dev

# Run text editor service (separate terminal)
tsx src/text-editor-service/server.ts
```

**Requirements for Editor Mode:**

- Cursor installed (free-plan is enough)
- Node.js with TypeScript support

## Architecture Overview

### Core Technologies

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: TailwindCSS + Radix UI components
- **Audio**: Web Audio API with custom crossfading
- **PWA**: Workbox service worker with offline caching
- **State**: Zustand stores + React Context
- **Build**: Multi-book dynamic build system

### Project Structure

```
src/
├── App.tsx                    # Main application component
├── main.ts                    # Legacy initialization (vanilla JS)
├── index.tsx                  # React app entry point
├── consts.ts                  # Book slugs and current book config
├── types.d.ts                 # Global TypeScript definitions
│
├── components/                # React UI components
│   ├── Header.tsx            # Navigation and controls
│   ├── Footer.tsx            # Bottom player controls
│   ├── AudioPlayer.tsx       # Audio controls widget
│   ├── ChapterLoaderDirect.tsx # Chapter content renderer
│   ├── CharacterNotesPanel.tsx # Character info sidebar
│   └── modals/               # Modal dialog components
│
├── hooks/                    # Custom React hooks
│   ├── useBackgroundSongs.ts # Background music management
│   ├── useAudiobookTracks.ts # Audiobook synchronization
│   ├── useCutScene.ts        # Video cutscene handling
│   └── usePageObserver.ts    # Paragraph visibility tracking
│
├── context/                  # React Context providers
│   ├── LocationContext.tsx   # Reading position state
│   ├── BookThemeContext.tsx  # Theme management
│   ├── RealtimeContext.tsx   # AI communication
│   └── WebSocketContext.tsx  # Real-time connections
│
├── stores/                   # Zustand state stores
│   └── modals/              # Modal state management
│
├── audio-crossfader.ts      # Advanced audio mixing engine
├── audiobook-player.ts      # Audiobook playback system
├── BookChapterRenderer.tsx  # Chapter content orchestrator
│
├── booksData/               # Book content and metadata
│   ├── getBookData.ts       # Dynamic book data loader
│   ├── types.ts             # Book data interfaces
│   └── books/               # Individual book data files
│
├── features/                # Feature-specific modules
│   └── ModalRenderers.tsx   # Modal coordination
│
├── ui/                      # Legacy UI utilities
│   ├── pageInit.ts          # Page initialization
│   ├── pageObserver.ts      # Intersection observers
│   └── paragraphHighlighting.ts # Text highlighting
│
└── utils/                   # Utility functions
    ├── isMobileOrTablet.ts  # Device detection
    └── searchParagraphsFromServer.ts # Search functionality
```

## Core Systems

### 1. Multi-Book Architecture

The application supports multiple books through a sophisticated build-time configuration system:

**Book Configuration (`vite.config.mts`):**

- Environment variable `VITE_BOOK` selects active book
- Dynamic chunk removal for unused books
- Book-specific asset copying and PWA manifests
- Runtime book data replacement via custom Vite plugin

**Supported Books:**

- `Pharaon` - Ancient Egyptian epic
- `1984` - Orwell's dystopian classic
- `Conrad-Tajny-Agent` - Conrad's spy thriller
- `Krolowa-Sniegu` - The Snow Queen fairy tale

### 2. Audio System Architecture

#### Audio Crossfader (`audio-crossfader.ts`)

**Purpose**: Advanced audio mixing for background music

- Seamless crossfading between tracks with configurable fade durations
- Pre-emptive track transitions before current track ends
- Section-based playlist management with automatic progression
- Master volume, balance, and mute controls
- localStorage persistence for user preferences

**Key Features:**

- Web Audio API with gain nodes for precise control
- Separate background music and audiobook channels
- Automatic track loading and buffering
- Transition point detection and scheduling

#### Audiobook Player (`audiobook-player.ts`)

**Purpose**: Synchronized narration with text highlighting

- Event-driven callbacks for word/paragraph highlighting
- Automatic stopping when background music takes priority
- Timed event system for precise synchronization
- Integration with main audio crossfader system

### 3. Content Rendering System

#### BookChapterRenderer (`BookChapterRenderer.tsx`)

**Purpose**: Dynamic chapter loading and rendering

- Renders current chapter ± 1 for smooth scrolling
- Integrates with location context for navigation
- Triggers paragraph observers for interaction tracking
- Handles system navigation vs user navigation

#### ChapterLoaderDirect (`components/ChapterLoaderDirect.tsx`)

**Purpose**: Individual chapter content loading

- Loads XML book data and renders to HTML
- Injects character avatars and interactive elements
- Handles paragraph highlighting and click events
- Manages loading states with styled placeholders

### 4. State Management

#### Location Context (`state/LocationContext.tsx`)

**Purpose**: Reading position and navigation state

- Tracks current chapter and paragraph
- Distinguishes between user and system navigation
- Provides navigation helpers and state updates
- Integrates with URL routing and deep linking

#### Modal Stores (`stores/modals/`)

**Purpose**: Modal dialog state management using Zustand

- Character details modal with AI-generated content
- Search modal with full-text book search
- Chapter navigation modal
- Deep research modal for AI analysis

### 5. Character System

#### Character Integration

**Features:**

- XML-embedded character definitions in book content
- Click-to-reveal character information panels
- AI-generated character analysis and summaries
- Character avatar images and speaking animations
- Persistent character notes and relationship tracking

#### Character Notes Panel (`components/CharacterNotesPanel.tsx`)

**Purpose**: Sidebar for character information and notes

- Displays active characters for current chapter
- User-generated notes and bookmarks
- Character relationship visualization
- Integration with AI character analysis

### 6. Progressive Web App (PWA)

#### Service Worker (`sw.ts`)

**Purpose**: Offline caching and performance optimization

- Workbox-based precaching strategy
- Large file support (30MB+ audio/video files)
- Background sync for user-generated content
- Update notifications and cache management

#### PWA Features:

- Installable app with custom icons
- Offline reading capability
- Background audio playback
- Platform-specific optimizations (iOS/Android)

### 7. Real-time Features

#### WebSocket Integration (`context/WebSocketContext.tsx`)

**Purpose**: Real-time communication for collaborative features

- Live reading session sharing
- Real-time character discussions
- Synchronized reading positions across devices
- Multi-user annotation and note sharing

#### AI Integration (`context/RealtimeContext.tsx`)

**Purpose**: OpenAI Realtime API integration

- Voice-based character interactions
- Real-time text analysis and research
- Dynamic content generation
- Conversation with book characters

## Audiobook Integration

### Preparing Audiobook Content

1. **Download DAISY files** - Standard audiobook format with synchronized text
2. **Convert SMIL to audiobook items**:
   ```bash
   bun src/convertSmilToAudiobookItems.ts
   ```
3. **Verify chapter/paragraph alignment** - Ensure audio segments match book XML structure
4. **Create AudiobookTracksDefined file** in `public_books/{BOOK_SLUG}/audiobook_data/`
5. **Import and configure** in `getAudiobookTracksForBook.ts` with unique identifier
6. **Optional: Map paragraph timing** - Adjust for audio intros or timing differences

### Audio File Structure

```
public_books/{BOOK_NAME}/
├── audiobook_data/
│   └── AudiobookTracksDefined.ts
├── *.mp3              # Audio segments
├── *-paragraph-*.mp3  # Paragraph-level audio
└── chapter_*.mp4      # Chapter background audio
```

## Development Workflow

### Code Quality

```bash
pnpm run lint          # ESLint with Prettier
pnpm run typecheck     # TypeScript checking
pnpm test             # Jest unit tests
```

### Asset Management

- Book content: `src/booksData/books/`
- Audio files: `public_books/{BOOK_NAME}/`
- Character images: `public_books/{BOOK_NAME}/`
- Background videos: `public_books/{BOOK_NAME}/`

## Key Refactoring Opportunities

### 1. **Legacy Code Migration** (High Priority)

**Location**: `src/main.ts`, `src/ui/`
**Issue**: Mixed vanilla JS with React, causing state synchronization issues
**Solution**: Migrate remaining vanilla JS to React hooks and components

### 2. **Audio System Consolidation** (High Priority)

**Location**: `audio-crossfader.ts` + `audiobook-player.ts`
**Issue**: Two separate audio systems with overlapping responsibilities
**Solution**: Merge into unified audio engine with cleaner separation of concerns

### 3. **Book Data Loading** (Medium Priority)

**Location**: `src/booksData/`
**Issue**: Large XML files loaded synchronously, blocking rendering
**Solution**: Implement lazy loading, streaming, and caching strategies

### 4. **State Management Consistency** (Medium Priority)

**Location**: Multiple state systems (Context + Zustand + localStorage)
**Issue**: Fragmented state leading to synchronization bugs
**Solution**: Standardize on single state management approach

### 5. **Component Organization** (Low Priority)

**Location**: `src/components/`
**Issue**: Growing component library without clear organization
**Solution**: Group by feature domain rather than component type

### 6. **Testing Coverage** (Low Priority)

**Location**: Limited test files
**Issue**: Complex audio/video features lack comprehensive testing
**Solution**: Add integration tests for core user flows

## Configuration Files

- `vite.config.mts` - Build configuration with book selection
- `tailwind.config.js` - TailwindCSS styling configuration
- `tsconfig.json` - TypeScript compiler settings
- `components.json` - Radix UI component configuration
- `package.json` - Dependencies and scripts

## Asset Structure

```
public_books/
├── Pharaon/           # Ancient Egyptian book assets
├── 1984/              # Orwell's 1984 assets
├── Conrad-Tajny-Agent/ # Conrad spy thriller assets
└── Krolowa-Sniegu/    # Snow Queen fairy tale assets

Each book directory contains:
├── *.mp3              # Audiobook segments
├── *.mp4              # Character videos and backgrounds
├── *.png              # Character avatars and images
└── chapter_*.mp4      # Chapter background videos
```

## Performance Considerations

### Audio Optimization

- Crossfading prevents audio dropouts during transitions
- Pre-loading of next tracks for seamless playback
- Separate gain nodes for independent volume control
- Memory management for large audio files

### Video Optimization

- Background videos use optimized encoding (H.264/AV1)
- Adaptive bitrate based on device capabilities
- Lazy loading of video assets outside viewport
- CSS-based animations for better performance

### Text Rendering

- Virtual scrolling for large chapters
- Intersection observers for efficient paragraph tracking
- Debounced scroll handlers to prevent performance issues
- Optimized highlighting algorithms for real-time sync

## Security Considerations

- Content Security Policy (CSP) headers for XSS protection
- Sanitized user input in search and notes features
- Secure WebSocket connections for real-time features
- Rate limiting on AI API endpoints
- Local storage encryption for sensitive user data

## Browser Compatibility

**Minimum Requirements:**

- Chrome/Edge 90+ (Web Audio API, Service Workers)
- Firefox 88+ (AudioContext, PWA features)
- Safari 14+ (iOS/macOS audio playback)
- Mobile: iOS 14+, Android 10+ (PWA installation)

**Progressive Enhancement:**

- Graceful degradation without Web Audio API
- Fallback text highlighting without audio sync
- Basic reading experience without JavaScript
- Offline content access via service worker

---

This README provides a comprehensive overview of the BookGenius frontend architecture. For specific implementation details, refer to individual file documentation and inline comments throughout the codebase.
