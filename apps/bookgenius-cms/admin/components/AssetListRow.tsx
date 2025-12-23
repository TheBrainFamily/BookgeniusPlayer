import { formatDistanceToNow } from "date-fns";
import { Image, Music, Video, FileText, FileJson, Package, MoreVertical, Eye, Upload, Pencil, CheckCircle, AlertCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getContentTypeCategory, formatBytes } from "@/lib/utils";
import type { AssetData } from "./AssetCard";

interface AssetListRowProps {
  asset: AssetData;
  publishedInfo?: { contentType?: string; size?: number; url?: string } | null;
  onClick: () => void;
  onUpload?: () => void;
  onRename?: () => void;
}

const typeIcons = { image: Image, audio: Music, video: Video, text: FileText, json: FileJson, other: Package };

function getAssetStatus(asset: AssetData): { label: string; icon: typeof CheckCircle; color: string } {
  if (asset.versionCounter === 0) {
    return { label: "Empty", icon: Circle, color: "text-muted-foreground" };
  }
  if (asset.publishedVersionId && !asset.draftVersionId) {
    return { label: "Published", icon: CheckCircle, color: "text-success" };
  }
  if (asset.publishedVersionId && asset.draftVersionId) {
    return { label: "Draft", icon: AlertCircle, color: "text-warning" };
  }
  if (asset.draftVersionId) {
    return { label: "Draft only", icon: AlertCircle, color: "text-warning" };
  }
  return { label: "Unknown", icon: Circle, color: "text-muted-foreground" };
}

export function AssetListRow({ asset, publishedInfo, onClick, onUpload, onRename }: AssetListRowProps) {
  const contentType = publishedInfo?.contentType;
  const category = getContentTypeCategory(contentType);
  const Icon = typeIcons[category];
  const status = getAssetStatus(asset);
  const StatusIcon = status.icon;

  // For image preview
  const isImage = category === "image" && publishedInfo?.url;

  return (
    <div className="group flex items-center gap-4 px-4 py-3 border-b border-border hover:bg-accent/50 cursor-pointer transition-colors animate-fade-in" onClick={onClick}>
      {/* Thumbnail */}
      <div className="w-12 h-12 rounded-lg bg-surface-2 flex items-center justify-center overflow-hidden shrink-0">
        {isImage ? <img src={publishedInfo.url} alt={asset.basename} className="w-full h-full object-cover" /> : <Icon className="h-6 w-6 text-muted-foreground/50" />}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-sm text-foreground truncate">{asset.basename}</h3>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant={category as any} className="text-[10px] capitalize">
            {category}
          </Badge>
        </div>
      </div>

      {/* Size */}
      <div className="hidden md:block text-xs text-muted-foreground w-20 text-right">{publishedInfo?.size ? formatBytes(publishedInfo.size) : "-"}</div>

      {/* Status */}
      <div className="hidden sm:flex items-center gap-2 w-28">
        <StatusIcon className={cn("h-4 w-4", status.color)} />
        <span className="text-xs text-muted-foreground">{status.label}</span>
      </div>

      {/* Version */}
      <div className="hidden lg:block text-xs text-muted-foreground w-12 text-center">v{asset.versionCounter}</div>

      {/* Updated */}
      <div className="hidden lg:block text-xs text-muted-foreground w-32 text-right">{formatDistanceToNow(new Date(asset.updatedAt), { addSuffix: true })}</div>

      {/* Actions */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon-sm">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
            >
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </DropdownMenuItem>
            {onRename && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onRename();
                }}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Rename
              </DropdownMenuItem>
            )}
            {onUpload && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onUpload();
                }}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload New Version
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
