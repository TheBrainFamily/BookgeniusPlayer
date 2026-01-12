import {
  Image,
  Music,
  Video,
  FileText,
  FileJson,
  Package,
  MoreVertical,
  Eye,
  Upload,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getContentTypeCategory, formatBytes } from "@/lib/utils";

export interface AssetData {
  _id: string;
  folderPath: string;
  basename: string;
  versionCounter: number;
  publishedVersionId?: string;
  updatedAt: number;
  extra?: unknown;
}

interface AssetCardProps {
  asset: AssetData;
  publishedInfo?: { contentType?: string; size?: number; url?: string } | null;
  onClick: () => void;
  onUpload?: () => void;
  onRename?: () => void;
}

const typeIcons = {
  image: Image,
  audio: Music,
  video: Video,
  text: FileText,
  json: FileJson,
  other: Package,
};

const typeColors = {
  image: "bg-info/20 text-info",
  audio: "bg-warning/20 text-warning",
  video: "bg-destructive/20 text-destructive",
  text: "bg-success/20 text-success",
  json: "bg-primary/20 text-primary",
  other: "bg-accent text-accent-foreground",
};

function getAssetStatus(asset: AssetData): { label: string; variant: "published" | "muted" } {
  if (asset.versionCounter === 0) {
    return { label: "Empty", variant: "muted" };
  }
  if (asset.publishedVersionId) {
    return { label: "Published", variant: "published" };
  }
  return { label: "Unknown", variant: "muted" };
}

export function AssetCard({ asset, publishedInfo, onClick, onUpload, onRename }: AssetCardProps) {
  const contentType = publishedInfo?.contentType;
  const category = getContentTypeCategory(contentType);
  const Icon = typeIcons[category];
  const status = getAssetStatus(asset);

  // For image preview
  const isImage = category === "image" && publishedInfo?.url;

  return (
    <div
      className="group relative bg-card rounded-xl border border-border overflow-hidden transition-all duration-200 hover:border-primary/50 hover:shadow-soft cursor-pointer animate-fade-in"
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-surface-2 relative overflow-hidden">
        {isImage ? (
          <img
            src={publishedInfo.url}
            alt={asset.basename}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon className="h-12 w-12 text-muted-foreground/50" />
          </div>
        )}
        {/* Type badge overlay */}
        <div className="absolute top-2 left-2">
          <div
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium backdrop-blur-sm",
              typeColors[category],
            )}
          >
            <Icon className="h-3 w-3" />
            <span className="capitalize">{category}</span>
          </div>
        </div>
        {/* Actions overlay */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="glass" size="icon-sm" className="h-7 w-7">
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

      {/* Info */}
      <div className="p-3">
        <h3 className="font-medium text-sm text-foreground truncate mb-2">{asset.basename}</h3>
        <div className="flex flex-wrap gap-1 items-center">
          <Badge variant={status.variant} className="text-[10px]">
            {status.label}
          </Badge>
          {publishedInfo?.size && (
            <Badge variant="muted" className="text-[10px]">
              {formatBytes(publishedInfo.size)}
            </Badge>
          )}
          <Badge variant="muted" className="text-[10px]">
            v{asset.versionCounter}
          </Badge>
        </div>
      </div>
    </div>
  );
}
