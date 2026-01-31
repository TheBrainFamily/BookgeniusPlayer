import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@convex/_generated/api";
import { queries } from "@/lib/queries";
import { MetadataEditor } from "./editors/MetadataEditor";
import { formatDistanceToNow } from "date-fns";
import {
  X,
  Copy,
  Download,
  Upload,
  CheckCircle,
  Clock,
  Archive,
  Image,
  Music,
  Video,
  FileText,
  FileJson,
  Package,
  ExternalLink,
  RotateCcw,
  Settings,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, getContentTypeCategory, formatBytes } from "@/lib/utils";
import { getVersionUrl } from "@/lib/assetUrl";
import { toast } from "sonner";

interface AssetDetailProps {
  folderPath: string;
  basename: string;
  selectedVersionId: string | null;
  onVersionSelect: (versionId: string | null) => void;
  onClose: () => void;
  onUploadNew: () => void;
}

const typeIcons = {
  image: Image,
  audio: Music,
  video: Video,
  text: FileText,
  json: FileJson,
  other: Package,
};

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copied to clipboard`);
}

async function downloadFile(url: string, filename: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Download failed");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(objectUrl);
  } catch {
    // Fallback: open in new tab
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// eslint-disable-next-line complexity -- TODO: refactor to reduce complexity
export function AssetDetail({
  folderPath,
  basename,
  selectedVersionId,
  onVersionSelect,
  onClose,
  onUploadNew,
}: AssetDetailProps) {
  const [metadataExpanded, setMetadataExpanded] = useState(false);

  // Non-suspense queries so SSR renders instantly with loading state
  const {
    data: asset,
    isLoading: assetLoading,
    refetch: refetchAsset,
  } = useQuery(queries.asset(folderPath, basename));
  const {
    data: versions,
    isLoading: versionsLoading,
    refetch: refetchVersions,
  } = useQuery(queries.assetVersions(folderPath, basename));
  const { data: publishedFile } = useQuery(queries.publishedFile(folderPath, basename));

  const restoreVersion = useMutation(api.cli.restoreVersion);

  // Check if this asset has editable metadata based on folder path
  const hasEditableMetadata =
    folderPath.endsWith("/chapters") ||
    folderPath.endsWith("/chapters-source") ||
    folderPath.endsWith("/chapters-html");

  // Auto-select published version when no version is selected in URL
  // Must be called before any conditional returns (Rules of Hooks)
  useEffect(() => {
    if (asset?.publishedVersionId && !selectedVersionId) {
      onVersionSelect(asset.publishedVersionId);
    }
  }, [asset?.publishedVersionId, selectedVersionId, onVersionSelect]);

  // Get the selected version data - compute before early return
  const selectedVersion = versions?.find((v: { _id: string }) => v._id === selectedVersionId);
  const previewUrl = selectedVersion?.storageId
    ? getVersionUrl({ versionId: selectedVersion._id, basename })
    : publishedFile?.url;
  const previewContentType = selectedVersion?.contentType || publishedFile?.contentType;
  const category = getContentTypeCategory(previewContentType);
  const Icon = typeIcons[category];

  const isLoading = assetLoading || versionsLoading;

  if (isLoading || !asset || !versions) {
    return <AssetDetailSkeleton />;
  }

  const handleRestoreVersion = async (versionId: string, versionNumber: number) => {
    try {
      const result = await restoreVersion({ versionId });
      onVersionSelect(result.versionId);
      toast.success(`Restored version ${versionNumber} as version ${result.version}`);
    } catch {
      toast.error("Failed to restore version");
    }
  };

  // With suspense, asset is always defined (null means not found)
  if (!asset) {
    return (
      <div className="h-full bg-card border-l border-border flex flex-col items-center justify-center p-8">
        <p className="text-muted-foreground">Asset not found</p>
        <Button variant="outline" onClick={onClose} className="mt-4">
          Close
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="h-full bg-card border-l border-border flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-foreground truncate">{basename}</h2>
            <p className="text-xs text-muted-foreground font-mono truncate">
              {folderPath || "(root)"}/{basename}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {/* Preview */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-foreground">Preview</h3>
                {selectedVersion && (
                  <Badge variant={selectedVersion.state} className="text-xs">
                    v{selectedVersion.version} ({selectedVersion.state})
                  </Badge>
                )}
              </div>
              <div className="rounded-lg overflow-hidden border border-border bg-surface-2">
                {category === "image" && previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={basename}
                    className="w-full h-auto max-h-64 object-contain"
                  />
                ) : category === "audio" && previewUrl ? (
                  <div className="p-4">
                    <audio controls className="w-full" src={previewUrl} key={previewUrl} />
                  </div>
                ) : category === "video" && previewUrl ? (
                  <video controls className="w-full max-h-64" src={previewUrl} key={previewUrl} />
                ) : (
                  <div className="aspect-video flex items-center justify-center">
                    <Icon className="h-16 w-16 text-muted-foreground/30" />
                  </div>
                )}
              </div>
            </div>

            {/* Info */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <Badge variant={category} className="capitalize">
                    {publishedFile?.contentType || "Unknown"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Size</span>
                  <span>{publishedFile?.size ? formatBytes(publishedFile.size) : "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Versions</span>
                  <span>{asset.versionCounter}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  {publishedFile ? (
                    <Badge variant="published">Published</Badge>
                  ) : (
                    <Badge variant="muted">No versions</Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Metadata Section (for music, background assets) */}
            {hasEditableMetadata && (
              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setMetadataExpanded(!metadataExpanded)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Edit Metadata</span>
                  </div>
                  {metadataExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {metadataExpanded && (
                  <div className="border-t border-border">
                    <MetadataEditor
                      folderPath={folderPath}
                      basename={basename}
                      onSaveComplete={() => {
                        refetchVersions();
                        refetchAsset();
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={onUploadNew}>
                <Upload className="h-4 w-4 mr-2" />
                Upload New
              </Button>
              {publishedFile?.url && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(publishedFile.url!, "Published URL")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy Published URL</TooltipContent>
                </Tooltip>
              )}
              {publishedFile?.url && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => downloadFile(publishedFile.url!, basename)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download</TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Version History */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">Version History</h3>
              {versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No versions yet. Upload a file to create the first version.
                </p>
              ) : (
                <div className="space-y-2">
                  {[...versions].reverse().map((version) => {
                    const versionUrl =
                      version.storageId && getVersionUrl({ versionId: version._id, basename });
                    const isSelected = selectedVersionId === version._id;

                    return (
                      <button
                        key={version._id}
                        onClick={() => onVersionSelect(version._id)}
                        className={cn(
                          "w-full text-left p-3 rounded-lg border transition-all",
                          isSelected
                            ? "ring-2 ring-primary ring-offset-1"
                            : "hover:border-primary/50",
                          version.state === "published"
                            ? "border-success/30 bg-success/5"
                            : "border-border bg-surface-1",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {version.state === "published" ? (
                              <CheckCircle className="h-4 w-4 text-success" />
                            ) : (
                              <Archive className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="font-medium text-sm">Version {version.version}</span>
                            <Badge variant={version.state} className="text-[10px]">
                              {version.state}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            {versionUrl && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="h-6 w-6"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyToClipboard(versionUrl, `Version ${version.version} URL`);
                                    }}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Copy Version URL</TooltipContent>
                              </Tooltip>
                            )}
                            {versionUrl && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="h-6 w-6"
                                    onClick={(e) => e.stopPropagation()}
                                    asChild
                                  >
                                    <a href={versionUrl} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Open in New Tab</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground space-y-1">
                          {version.label && <p className="italic">"{version.label}"</p>}
                          <div className="flex items-center gap-3">
                            {version.size && <span>{formatBytes(version.size)}</span>}
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(version.createdAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                        </div>
                        {version.state === "archived" && version.storageId && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 w-full"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRestoreVersion(version._id, version.version);
                            }}
                          >
                            <RotateCcw className="h-3 w-3 mr-2" />
                            Restore This Version
                          </Button>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}

// Skeleton shown during direct navigation (before data loads)
export function AssetDetailSkeleton() {
  return (
    <div className="h-full bg-card border-l border-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-5 w-32 rounded bg-muted animate-pulse" />
          <div className="h-3 w-48 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-8 w-8 rounded bg-muted animate-pulse" />
      </div>
      {/* Content */}
      <div className="flex-1 p-4 space-y-6">
        {/* Preview */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="h-4 w-16 rounded bg-muted animate-pulse" />
            <div className="h-5 w-24 rounded bg-muted animate-pulse" />
          </div>
          <div className="aspect-video rounded-lg bg-muted animate-pulse" />
        </div>
        {/* Details */}
        <div>
          <div className="h-4 w-16 rounded bg-muted animate-pulse mb-3" />
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                <div className="h-4 w-24 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        </div>
        {/* Actions */}
        <div className="flex gap-2">
          <div className="h-9 flex-1 rounded bg-muted animate-pulse" />
          <div className="h-9 w-9 rounded bg-muted animate-pulse" />
          <div className="h-9 w-9 rounded bg-muted animate-pulse" />
        </div>
        {/* Version History */}
        <div>
          <div className="h-4 w-28 rounded bg-muted animate-pulse mb-3" />
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-3 rounded-lg border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-4 w-4 rounded bg-muted animate-pulse" />
                  <div className="h-4 w-20 rounded bg-muted animate-pulse" />
                  <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-3 w-12 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
