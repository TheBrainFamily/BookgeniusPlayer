# Player - Book Reader

Immersive interactive book reader with virtualized scrolling, synchronized media, and real-time AI character interaction.

## Structure

| Directory       | Purpose                                                       |
| --------------- | ------------------------------------------------------------- |
| `src/hooks/`    | 30+ hooks for media sync and state                            |
| `src/services/` | XML parsing, scroll coordination                              |
| `src/logic/`    | Virtualization engine (`BookContentVirtualizer`, `BookIndex`) |
| `src/stores/`   | Zustand stores for modals and assets                          |
| `src/context/`  | Core providers (Convex, location)                             |

## Key Locations

| Feature          | File                                               |
| ---------------- | -------------------------------------------------- |
| Reading progress | `useReadingProgress.ts`, `LocationContext.tsx`     |
| XML processing   | `xmlToHtmlConverter.ts`, `services/live/`          |
| Virtualization   | `BookContentVirtualizer.ts`                        |
| Audio sync       | `useAudiobookTracks.ts`, `audiobook-player.ts`     |
| Background media | `useBackgroundSongs.ts`, `useBackgroundVideo.ts`   |
| Character logic  | `useCharactersOnStage.ts`, `useCurrentSpeakers.ts` |

## Data Flow

1. **Loading**: `BookConvexContext` → `BookIndex.initializeWith()` → `BookContentVirtualizer.ensureWindow()`
2. **Scrolling**: `ScrollCoordinator` → `LocationContext` → `useCurrentMediaCues`

## Key Patterns

- **Virtualized Rendering**: Only current chapter ± 1 in DOM with scroll compensation
- **Media Cues**: Linked to paragraph `data-index` for scroll-triggered changes
- **Inline Avatars**: Dynamic injection via `hydrateInlineAvatarsInSection`
