# BookGenius

An open-source interactive ebook reader platform with AI-powered content enhancement. Transform classic literature into immersive reading experiences with AI-generated narration, character voices, background music, and visual elements.

> **Early Pre-Release**: This project is in active development. Instructions for running locally and contributing will follow soon.

## Overview

BookGenius is a monorepo containing a complete ecosystem for creating and consuming enhanced ebooks. The platform takes public domain literature (primarily from Standard Ebooks) and enriches it with AI-generated audio, music, and visual elements to create a cinematic reading experience.

## Project Structure

```
bookgenius/
├── apps/
│   ├── player/           # Interactive ebook reader (React + Vite)
│   ├── platform/         # Book discovery & library frontend
│   ├── bookgenius-cms/   # Content management system (Next.js)
│   ├── pipeline/         # AI content generation pipeline
│   ├── player-native/    # Mobile app (React Native/Expo)
│   ├── convex-sync/      # Real-time asset sync daemon
│   └── ...
├── convex/               # Backend (Convex)
├── books/                # Book source files
└── compiled-books/       # Processed book assets
```

## Apps

### Player (`apps/player`)

The core interactive ebook reader. Features include:

- AI-generated text-to-speech narration with multiple character voices
- Dynamic background music that responds to story mood
- Character avatars and scene backgrounds
- Reading progress sync across devices
- Embeddable as a standalone library for third-party integration

### Platform (`apps/platform`)

The main user-facing application where readers can:

- Browse and discover books
- Manage their reading library
- Access their reading progress

### CMS (`apps/bookgenius-cms`)

Administrative interface for:

- Managing book metadata
- Editing AI-generated content
- Configuring character voices and music cues

### Pipeline (`apps/pipeline`)

Book processing and AI content generation:

- Import books from Standard Ebooks and other sources
- Generate TTS narration using ElevenLabs and other providers
- Create character avatars and backgrounds using AI image generation
- Process and optimize media assets

### Player Native (`apps/player-native`)

Mobile application built with React Native and Expo, bringing the reading experience to iOS and Android devices.

## Tech Stack

- **Runtime**: Bun
- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Backend**: Convex (real-time database)
- **Build**: Turborepo, Vite
- **AI Providers**: Anthropic, OpenAI, Google AI, ElevenLabs, Replicate

## License

MIT License - see [LICENSE](LICENSE) for details.
