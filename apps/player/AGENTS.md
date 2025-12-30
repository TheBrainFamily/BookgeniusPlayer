# PLAYER AGENTS KNOWLEDGE BASE

## OVERVIEW

Immersive interactive book reader featuring virtualized scrolling, synchronized media (audio/video), and real-time AI character interaction.

## STRUCTURE

- `src/hooks/`: 30+ specialized hooks for media synchronization and state management
- `src/services/`: XML parsing, HTML normalization, and scroll coordination
- `src/logic/`: Core virtualization engine (`BookContentVirtualizer`, `BookIndex`)
- `src/stores/`: Zustand stores for modal orchestration and asset generation
- `src/context/`: Core providers for Convex data and reading location
- `src/components/modals/`: Feature-specific dialogs (characters, research, search)
- `src/text-editor-service/`: Local server for live-editing integration

## WHERE TO LOOK

- **Reading Progress**: `src/hooks/useReadingProgress.ts` and `src/state/LocationContext.tsx`
- **XML Processing**: `src/services/xmlToHtmlConverter.ts` and `src/services/live/`
- **Virtualization**: `src/logic/BookContentVirtualizer.ts` (DOM manipulation)
- **Audio Sync**: `src/hooks/useAudiobookTracks.ts` and `src/audiobook-player.ts`
- **Background Media**: `src/hooks/useBackgroundSongs.ts` and `useBackgroundVideo.ts`
- **Character Logic**: `src/hooks/useCharactersOnStage.ts` and `useCurrentSpeakers.ts`

## KEY PATTERNS

- **Virtualized Rendering**: `BookContentVirtualizer` maintains current chapter ± 1 in DOM with precise scroll compensation and spacer management.
- **Indexing Engine**: `BookIndex` parses stringified HTML into a searchable, clonable structure for efficient DOM injection.
- **Media Cues**: Cues are linked to paragraph positions (`data-index`) to trigger background changes as the user scrolls.
- **Inline Avatars**: Dynamic injection of character media shells into text via `hydrateInlineAvatarsInSection`.

## DATA FLOW

- **Loading**: `BookConvexContext` (Convex) -> `BookIndex.initializeWith()` -> `BookContentVirtualizer.ensureWindow()`.
- **Scrolling**: `ScrollCoordinator` -> `LocationContext` (update progress) -> `useCurrentMediaCues` (trigger media changes).
- **Live Edit**: `text-editor-service` -> `SSE` -> `BookConvexContext` -> `updateMountedChaptersInPlace()`.

## HOOKS REFERENCE

- **Media**: `useAudiobookTracks`, `useBackgroundSongs`, `useBackgroundVideo`, `useCurrentMediaCues`
- **State**: `useBookContent`, `useReadingProgress`, `useSavedLocation`, `useLocationRange`
- **Interaction**: `useCharactersOnStage`, `useCurrentSpeakers`, `useInlineAvatarSync`, `useCutScene`
- **Utility**: `useVisualViewport`, `useElementVisibility`, `useHighlight`, `useAppReady`
