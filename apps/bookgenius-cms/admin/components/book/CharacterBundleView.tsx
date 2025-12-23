"use client";

/**
 * CharacterBundleView - Card showing a character with their assets
 *
 * Displays:
 * - Avatar image (if available)
 * - Character name and summary
 * - Bundle completeness indicator
 * - Links to speaks/listens videos
 *
 * This component is Convex-free - it uses the useCharacterBundle hook.
 */

import { useCharacterBundle, getMissingAssets } from "@/lib/hooks";
import { isCharacterFolder, type CharacterFolderExtra } from "@/lib/types/book";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { User, Image as ImageIcon, Video, AlertCircle, CheckCircle2, Play, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CharacterBundleViewProps {
  characterPath: string;
  onClick?: () => void;
}

export function CharacterBundleView({ characterPath, onClick }: CharacterBundleViewProps) {
  const { bundle, isLoading } = useCharacterBundle(characterPath);

  if (isLoading) {
    return <CharacterBundleViewSkeleton />;
  }

  if (!bundle) {
    return (
      <div className="bg-card rounded-xl border border-border p-4 opacity-50">
        <p className="text-sm text-muted-foreground">Character not found</p>
      </div>
    );
  }

  // Extract typed metadata
  const extra = isCharacterFolder(bundle.extra) ? (bundle.extra as CharacterFolderExtra) : null;

  const displayName = extra?.displayName ?? bundle.name;
  const summary = extra?.summary;

  // Check bundle completeness
  const missing = getMissingAssets(bundle);
  const isComplete = missing.length === 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group bg-card rounded-xl border overflow-hidden text-left w-full",
        "hover:border-primary/50 hover:shadow-lg transition-all duration-200",
        isComplete ? "border-border" : "border-amber-500/50",
      )}
    >
      {/* Avatar */}
      <div className="aspect-square bg-muted relative">
        {bundle.avatar ? (
          <img src={bundle.avatar.url} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User className="h-16 w-16 text-muted-foreground" />
          </div>
        )}

        {/* Asset indicators overlay */}
        <div className="absolute bottom-2 right-2 flex gap-1">
          <AssetIndicator type="avatar" available={!!bundle.avatar} url={bundle.avatar?.url} />
          <AssetIndicator type="speaks" available={!!bundle.speaks} url={bundle.speaks?.url} />
          <AssetIndicator type="listens" available={!!bundle.listens} url={bundle.listens?.url} />
        </div>

        {/* Completeness badge */}
        {!isComplete && (
          <div className="absolute top-2 right-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/50">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Incomplete
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Missing: {missing.join(", ")}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="font-medium truncate group-hover:text-primary transition-colors">{displayName}</div>
        {summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{summary}</p>}
        <div className="flex items-center gap-1 mt-2">
          <Badge variant="secondary" className="text-xs">
            {bundle.slug}
          </Badge>
          {isComplete && (
            <Badge variant="outline" className="text-xs text-green-600 border-green-500/50">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Complete
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

// Asset indicator pill
function AssetIndicator({ type, available, url }: { type: "avatar" | "speaks" | "listens"; available: boolean; url?: string }) {
  const icons = { avatar: ImageIcon, speaks: Play, listens: Volume2 };
  const Icon = icons[type];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("w-6 h-6 rounded-full flex items-center justify-center", available ? "bg-green-500/20 text-green-600" : "bg-muted text-muted-foreground")}>
          <Icon className="h-3 w-3" />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          {type}: {available ? "Available" : "Missing"}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export function CharacterBundleViewSkeleton() {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="aspect-square bg-muted animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-5 w-3/4 rounded bg-muted animate-pulse" />
        <div className="h-3 w-full rounded bg-muted animate-pulse" />
        <div className="flex gap-1">
          <div className="h-5 w-16 rounded bg-muted animate-pulse" />
        </div>
      </div>
    </div>
  );
}
