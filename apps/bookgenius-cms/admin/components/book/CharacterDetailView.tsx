"use client";

/**
 * CharacterDetailView - Character editing with asset slots
 *
 * Shows character metadata and upload slots for:
 * - avatar (image)
 * - speaks (video)
 * - listens (video)
 *
 * Supports toggle between "Overview" (structured slots) and "Files" (raw folder contents).
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCharacterBundle } from "@/lib/hooks/useCharacterBundle";
import { queries } from "@/lib/queries";
import { MetadataEditor } from "../editors/MetadataEditor";
import {
  ArrowLeft,
  User,
  Image as ImageIcon,
  Video,
  Upload,
  Check,
  AlertCircle,
  Loader2,
  Pencil,
  FolderOpen,
  FileIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { getContentTypeCategory } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

type ViewMode = "overview" | "files";

interface CharacterDetailViewProps {
  characterPath: string;
  onBack: () => void;
  onUploadAsset: (basename: string) => void;
  optimisticAvatarUrl?: string;
}

interface AssetSlotProps {
  label: string;
  icon: React.ReactNode;
  asset: { url: string; versionId: string; contentType?: string } | undefined;
  onUpload: () => void;
  isImage?: boolean;
}

// =============================================================================
// Asset Slot Component
// =============================================================================

function AssetSlot({ label, icon, asset, onUpload, isImage = false }: AssetSlotProps) {
  const hasAsset = !!asset;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{label}</span>
        </div>
        {hasAsset ? (
          <Badge variant="success" className="text-xs">
            <Check className="h-3 w-3 mr-1" />
            Uploaded
          </Badge>
        ) : (
          <Badge variant="warning" className="text-xs">
            <AlertCircle className="h-3 w-3 mr-1" />
            Missing
          </Badge>
        )}
      </div>

      {/* Preview / Upload */}
      <div className="aspect-square bg-surface-1 flex items-center justify-center relative">
        {hasAsset ? (
          <>
            {isImage ? (
              <img src={asset.url} alt={label} className="w-full h-full object-cover" />
            ) : (
              <video
                src={asset.url}
                className="w-full h-full object-cover"
                muted
                loop
                autoPlay
                playsInline
              />
            )}
            {/* Overlay with replace button */}
            <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
              <Button variant="secondary" size="sm" onClick={onUpload}>
                <Upload className="h-4 w-4 mr-2" />
                Replace
              </Button>
            </div>
          </>
        ) : (
          <Button variant="outline" onClick={onUpload}>
            <Upload className="h-4 w-4 mr-2" />
            Upload {label}
          </Button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Files View Component (read-only list of files in folder)
// =============================================================================

function FilesView({ folderPath }: { folderPath: string }) {
  const { data: files, isLoading } = useQuery(queries.publishedFilesInFolder(folderPath));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
        <FolderOpen className="h-12 w-12 mb-2" />
        <p>No files in this folder</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {files.map((file) => {
        const category = getContentTypeCategory(file.contentType);
        const isImage = category === "image";
        const isVideo = category === "video";

        return (
          <div
            key={file.basename}
            className="border border-border rounded-lg overflow-hidden bg-card"
          >
            {/* Preview */}
            <div className="aspect-square bg-muted flex items-center justify-center">
              {isImage && file.url ? (
                <img src={file.url} alt={file.basename} className="w-full h-full object-cover" />
              ) : isVideo && file.url ? (
                <video
                  src={file.url}
                  className="w-full h-full object-cover"
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              ) : (
                <FileIcon className="h-12 w-12 text-muted-foreground" />
              )}
            </div>
            {/* Info */}
            <div className="p-2">
              <p className="text-sm font-medium truncate" title={file.basename}>
                {file.basename}
              </p>
              <p className="text-xs text-muted-foreground">{file.contentType}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Overview Content Component
// =============================================================================

interface OverviewContentProps {
  bundle: NonNullable<ReturnType<typeof useCharacterBundle>["bundle"]>;
  displayAvatar: { url: string; versionId: string; contentType?: string } | undefined;
  onUploadAsset: (basename: string) => void;
}

function OverviewContent({ bundle, displayAvatar, onUploadAsset }: OverviewContentProps) {
  const summary = bundle.metadata.summary;
  const isComplete = bundle.avatar && bundle.speaks && bundle.listens;

  return (
    <>
      {/* Summary */}
      {summary && (
        <div className="bg-muted/50 rounded-lg p-4">
          <p className="text-sm text-muted-foreground italic">"{summary}"</p>
        </div>
      )}

      {/* Asset Slots */}
      <div>
        <h2 className="text-lg font-medium mb-4">Character Assets</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <AssetSlot
            label="Avatar"
            icon={<ImageIcon className="h-4 w-4" />}
            asset={displayAvatar}
            onUpload={() => onUploadAsset("avatar-large.png")}
            isImage
          />
          <AssetSlot
            label="Speaks"
            icon={<Video className="h-4 w-4" />}
            asset={bundle.speaks}
            onUpload={() => onUploadAsset("speaks.mp4")}
          />
          <AssetSlot
            label="Listens"
            icon={<Video className="h-4 w-4" />}
            asset={bundle.listens}
            onUpload={() => onUploadAsset("listens.mp4")}
          />
        </div>
      </div>

      {/* Completeness Status */}
      <div className="bg-surface-1 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium">Bundle Status</span>
          <Badge variant={isComplete ? "success" : "warning"}>
            {isComplete ? "Complete" : "Incomplete"}
          </Badge>
        </div>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span className={bundle.avatar ? "text-success" : ""}>
            {bundle.avatar ? "✓" : "○"} Avatar
          </span>
          <span className={bundle.speaks ? "text-success" : ""}>
            {bundle.speaks ? "✓" : "○"} Speaks
          </span>
          <span className={bundle.listens ? "text-success" : ""}>
            {bundle.listens ? "✓" : "○"} Listens
          </span>
        </div>
      </div>
    </>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function CharacterDetailView({
  characterPath,
  onBack,
  onUploadAsset,
  optimisticAvatarUrl,
}: CharacterDetailViewProps) {
  const { bundle, isLoading, error } = useCharacterBundle(characterPath);
  const [showMetadataEditor, setShowMetadataEditor] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("overview");

  const displayAvatar = optimisticAvatarUrl
    ? { url: optimisticAvatarUrl, versionId: "optimistic", contentType: "image/png" }
    : bundle?.avatar;

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive">{error.message}</p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  // Not found
  if (!bundle) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
        <User className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Character not found</p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  const displayName = bundle.metadata.displayName || bundle.name;
  const showSidebar = showMetadataEditor && viewMode === "overview";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border bg-card">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold truncate">{displayName}</h1>
              <Badge variant="muted">Character</Badge>
            </div>
            <p className="text-sm text-muted-foreground truncate">{characterPath}</p>
          </div>
          {/* View Mode Toggle */}
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="overview" className="h-7 px-2">
                <User className="h-4 w-4 mr-1" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="files" className="h-7 px-2">
                <FolderOpen className="h-4 w-4 mr-1" />
                Files
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {viewMode === "overview" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMetadataEditor(!showMetadataEditor)}
            >
              <Pencil className="h-4 w-4 mr-2" />
              {showMetadataEditor ? "Hide" : "Edit"} Details
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Content */}
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {viewMode === "files" ? (
              <FilesView folderPath={characterPath} />
            ) : (
              <OverviewContent
                bundle={bundle}
                displayAvatar={displayAvatar}
                onUploadAsset={onUploadAsset}
              />
            )}
          </div>
        </ScrollArea>

        {/* Metadata Editor Sidebar */}
        {showSidebar && (
          <div className="w-80 border-l border-border bg-card shrink-0">
            <MetadataEditor
              folderPath={characterPath}
              onSaveComplete={() => {
                toast.success("Character details updated");
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
