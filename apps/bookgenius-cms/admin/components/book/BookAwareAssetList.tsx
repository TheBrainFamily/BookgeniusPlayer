"use client";

/**
 * BookAwareAssetList - Wrapper that detects book folder patterns
 *
 * This component sits between AdminPanel and AssetList, detecting
 * when we're viewing book-specific folders and rendering specialized views:
 *
 * - books/{book-slug}              → BookDashboard
 * - books/{book-slug}/characters   → CharacterGrid
 * - Other paths                    → Regular AssetList
 *
 * The BookProvider is added only when viewing book content.
 */

import { useMemo } from "react";
import { detectFolderType, parseBookPath } from "@/lib/utils/folderPatterns";
import { BookProvider } from "@/lib/contexts";
import { BookDashboard } from "./BookDashboard";
import { CharacterGrid } from "./CharacterGrid";
import { CharacterDetailView } from "./CharacterDetailView";
import { ChaptersView } from "./ChaptersView";
import { BackgroundCuesView } from "./BackgroundCuesView";
import { MusicCuesView } from "./MusicCuesView";
import { AssetList } from "../AssetList";

interface BookAwareAssetListProps {
  folderPath: string;
  onAssetSelect: (asset: { folderPath: string; basename: string }) => void;
  onFolderSelect: (path: string) => void;
  onUploadNew: () => void;
  onUploadAsset: (basename: string) => void;
  onCreateAsset: () => void;
  onCreateFolder: () => void;
  onShowSnippet: () => void;
  optimisticAvatars?: Record<string, string>;
}

export function BookAwareAssetList(props: BookAwareAssetListProps) {
  const { folderPath, onFolderSelect } = props;

  // Detect folder type from path
  const folderType = useMemo(() => detectFolderType(folderPath, undefined), [folderPath]);

  // Parse book path for context
  const bookInfo = useMemo(() => parseBookPath(folderPath), [folderPath]);

  // Render specialized view based on folder type
  switch (folderType) {
    case "book":
      // Book root folder - show dashboard
      return (
        <BookProvider bookPath={folderPath}>
          <BookDashboard onNavigate={onFolderSelect} />
        </BookProvider>
      );

    case "characters-container":
      // Characters folder - show character grid
      if (bookInfo) {
        return (
          <BookProvider bookPath={bookInfo.bookPath}>
            <CharacterGrid
              onCharacterSelect={(characterPath) => onFolderSelect(characterPath)}
              onCreateCharacter={props.onCreateFolder}
            />
          </BookProvider>
        );
      }
      // Fallback to regular list if we can't parse book path
      return <AssetList {...props} />;

    case "character":
      if (bookInfo) {
        const charactersPath = `${bookInfo.bookPath}/characters`;
        return (
          <CharacterDetailView
            characterPath={folderPath}
            onBack={() => onFolderSelect(charactersPath)}
            onUploadAsset={props.onUploadAsset}
            optimisticAvatarUrl={props.optimisticAvatars?.[folderPath]}
          />
        );
      }
      return <AssetList {...props} />;

    case "chapters-container":
      // Chapters folder - show chapter list with create dialog
      if (bookInfo) {
        return (
          <BookProvider bookPath={bookInfo.bookPath}>
            <ChaptersView onChapterSelect={(asset) => props.onAssetSelect(asset)} />
          </BookProvider>
        );
      }
      return <AssetList {...props} />;

    case "backgrounds-container":
      // Backgrounds folder - show cue sheet view with file toggle
      if (bookInfo) {
        return (
          <BookProvider bookPath={bookInfo.bookPath}>
            <BackgroundCuesView
              folderPath={folderPath}
              onAssetSelect={props.onAssetSelect}
              onFolderSelect={onFolderSelect}
              onUploadNew={props.onUploadNew}
              onUploadAsset={props.onUploadAsset}
              onCreateAsset={props.onCreateAsset}
              onCreateFolder={props.onCreateFolder}
              onShowSnippet={props.onShowSnippet}
            />
          </BookProvider>
        );
      }
      return <AssetList {...props} />;

    case "music-container":
      // Music folder - show cue sheet view with file toggle
      if (bookInfo) {
        return (
          <BookProvider bookPath={bookInfo.bookPath}>
            <MusicCuesView
              folderPath={folderPath}
              onAssetSelect={props.onAssetSelect}
              onFolderSelect={onFolderSelect}
              onUploadNew={props.onUploadNew}
              onUploadAsset={props.onUploadAsset}
              onCreateAsset={props.onCreateAsset}
              onCreateFolder={props.onCreateFolder}
              onShowSnippet={props.onShowSnippet}
            />
          </BookProvider>
        );
      }
      return <AssetList {...props} />;

    default:
      // Regular folder - use standard asset list
      return <AssetList {...props} />;
  }
}

// Re-export skeleton for consistency
export { AssetListSkeleton as BookAwareAssetListSkeleton } from "../AssetList";
