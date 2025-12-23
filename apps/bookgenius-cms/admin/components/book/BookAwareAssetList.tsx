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
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/lib/queries";
import { detectFolderType, parseBookPath, type DetectedFolderType } from "@/lib/utils/folderPatterns";
import { BookProvider } from "@/lib/contexts";
import { BookDashboard } from "./BookDashboard";
import { CharacterGrid } from "./CharacterGrid";
import { CharacterDetailView } from "./CharacterDetailView";
import { ChaptersView } from "./ChaptersView";
import { AssetList, AssetListSkeleton } from "../AssetList";

interface BookAwareAssetListProps {
  folderPath: string;
  onAssetSelect: (asset: { folderPath: string; basename: string }) => void;
  onFolderSelect: (path: string) => void;
  onUploadNew: () => void;
  onUploadAsset: (basename: string) => void;
  onCreateAsset: () => void;
  onCreateFolder: () => void;
  onShowSnippet: () => void;
}

export function BookAwareAssetList(props: BookAwareAssetListProps) {
  const { folderPath, onFolderSelect } = props;

  // Get folder to access its extra field
  const { data: folder, isLoading: folderLoading } = useQuery({
    ...queries.folders(folderPath),
    select: (folders) => folders?.find((f) => f.path === folderPath),
    enabled: false, // We don't need this for type detection
  });

  // Detect folder type from path
  const folderType = useMemo(() => detectFolderType(folderPath, folder?.extra), [folderPath, folder?.extra]);

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
            <CharacterGrid onCharacterSelect={(characterPath) => onFolderSelect(characterPath)} onCreateCharacter={props.onCreateFolder} />
          </BookProvider>
        );
      }
      // Fallback to regular list if we can't parse book path
      return <AssetList {...props} />;

    case "character":
      // Individual character folder - show character detail with asset slots
      if (bookInfo) {
        // Get parent characters-container path for back navigation
        const charactersPath = `${bookInfo.bookPath}/characters`;
        return <CharacterDetailView characterPath={folderPath} onBack={() => onFolderSelect(charactersPath)} onUploadAsset={props.onUploadAsset} />;
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
    case "music-container":
      // These could have specialized views later
      // For now, use regular asset list
      return <AssetList {...props} />;

    default:
      // Regular folder - use standard asset list
      return <AssetList {...props} />;
  }
}

// Re-export skeleton for consistency
export { AssetListSkeleton as BookAwareAssetListSkeleton } from "../AssetList";
