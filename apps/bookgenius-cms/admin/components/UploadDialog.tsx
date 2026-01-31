import { useState, useRef, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { extractBookPath } from "@/lib/pathUtils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Upload, FileUp, X } from "lucide-react";
import { cn, formatBytes, logError } from "@/lib/utils";

// Detect asset type from folder path
type AssetType = "background" | "music" | "generic";

function detectAssetType(folderPath: string): AssetType {
  if (folderPath.includes("/backgrounds")) return "background";
  if (folderPath.includes("/music")) return "music";
  return "generic";
}

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderPath: string;
  existingBasename?: string;
  onUploadComplete?: (folderPath: string, basename: string, file: File) => void;
}

export function UploadDialog({
  open,
  onOpenChange,
  folderPath,
  existingBasename,
  onUploadComplete,
}: UploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [basename, setBasename] = useState(existingBasename || "");
  const [label, setLabel] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Metadata fields for backgrounds/music
  const [chapter, setChapter] = useState("");
  const [paragraph, setParagraph] = useState("");
  const [backgroundColor, setBackgroundColor] = useState("#000000");
  const [textColor, setTextColor] = useState("#ffffff");

  // Detect asset type for showing appropriate fields
  const assetType = useMemo(() => detectAssetType(folderPath), [folderPath]);

  const startUpload = useMutation(api.generateUploadUrl.startUpload);
  const finishUpload = useMutation(api.generateUploadUrl.finishUpload);
  const createBackgroundCue = useMutation(api.backgroundCues.create);
  const createMusicCue = useMutation(api.musicCues.create);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    if (!existingBasename && !basename) {
      setBasename(selectedFile.name);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file");
      return;
    }

    const finalBasename = existingBasename || basename.trim();
    if (!finalBasename) {
      toast.error("Please enter a filename");
      return;
    }

    setIsUploading(true);
    try {
      // 1. Start upload to get intentId, uploadUrl, and backend type
      const { intentId, uploadUrl, backend } = await startUpload({
        folderPath,
        basename: finalBasename,
        label: label.trim() || undefined,
      });

      // 2. Upload file - method differs by backend (R2 uses PUT, Convex uses POST)
      let res: Response;
      try {
        res = await fetch(uploadUrl, {
          method: backend === "r2" ? "PUT" : "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
      } catch (fetchError) {
        // CORS errors show as generic "Failed to fetch" - make it clearer
        logError("Upload fetch failed:", fetchError);
        throw new Error(
          backend === "r2"
            ? "Upload to R2 failed - check CORS configuration on your R2 bucket"
            : "Upload failed - network error",
        );
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`Upload failed: ${res.status} ${errorText}`);
      }

      // 3. Parse response - Convex returns JSON with storageId, R2 returns empty
      const uploadResponse = backend === "convex" ? await res.json() : undefined;

      // 4. Finish the upload with file metadata (include folderPath/basename for post-upload hooks)
      await finishUpload({
        intentId,
        uploadResponse,
        size: file.size,
        contentType: file.type,
        folderPath,
        basename: finalBasename,
      });

      const chapterNum = parseInt(chapter);
      const paragraphNum = parseInt(paragraph);
      const hasCueTarget = !isNaN(chapterNum) && !isNaN(paragraphNum);
      const bookPath = extractBookPath(folderPath);

      if (hasCueTarget && bookPath && assetType === "background") {
        await createBackgroundCue({
          bookPath,
          fileBasename: finalBasename,
          chapter: chapterNum,
          paragraph: paragraphNum,
          backgroundColor,
          textColor,
        });
      }

      if (hasCueTarget && bookPath && assetType === "music") {
        await createMusicCue({
          bookPath,
          fileBasename: finalBasename,
          chapter: chapterNum,
          paragraph: paragraphNum,
        });
      }

      toast.success("File uploaded");

      onUploadComplete?.(folderPath, finalBasename, file);

      setFile(null);
      setBasename("");
      setLabel("");
      setChapter("");
      setParagraph("");
      setBackgroundColor("#000000");
      setTextColor("#ffffff");
      onOpenChange(false);
    } catch (error: unknown) {
      logError("Upload failed:", error);
      const message = error instanceof Error ? error.message : "Failed to upload file";
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existingBasename ? "Upload New Version" : "Upload Asset"}</DialogTitle>
          <DialogDescription>
            {existingBasename ? (
              <>
                Upload a new version of <code className="text-primary">{existingBasename}</code>
              </>
            ) : (
              <>
                Upload a file to <code className="text-primary">{folderPath || "(root)"}</code>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Drop Zone */}
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer",
              dragOver
                ? "border-primary bg-primary/5"
                : file
                  ? "border-success bg-success/5"
                  : "border-border hover:border-primary/50",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const selectedFile = e.target.files?.[0];
                if (selectedFile) {
                  handleFileSelect(selectedFile);
                }
              }}
            />
            {file ? (
              <div className="flex items-center gap-3">
                <FileUp className="h-8 w-8 text-success" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(file.size)} · {file.type || "Unknown type"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="text-center">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Drop a file here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">Any file type supported</p>
              </div>
            )}
          </div>

          {/* Basename (only if not uploading new version) */}
          {!existingBasename && (
            <div className="space-y-2">
              <Label htmlFor="basename">Filename</Label>
              <Input
                id="basename"
                placeholder="my-file.png"
                value={basename}
                onChange={(e) => setBasename(e.target.value)}
              />
            </div>
          )}

          {/* Label */}
          <div className="space-y-2">
            <Label htmlFor="label">Version Label (optional)</Label>
            <Input
              id="label"
              placeholder="Initial upload, Fixed typo, etc."
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          {/* Background/Music Metadata Fields */}
          {(assetType === "background" || assetType === "music") && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="chapter">Chapter (optional)</Label>
                  <Input
                    id="chapter"
                    type="number"
                    min="0"
                    placeholder=""
                    value={chapter}
                    onChange={(e) => setChapter(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paragraph">Paragraph (optional)</Label>
                  <Input
                    id="paragraph"
                    type="number"
                    min="0"
                    placeholder=""
                    value={paragraph}
                    onChange={(e) => setParagraph(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty to upload without creating a cue. You can add cues later from the Cues
                view.
              </p>
            </>
          )}

          {/* Background-specific color fields (only when creating a cue)
              TODO: Colors should be stored on file metadata, not per-cue.
              Currently if someone replaces a dark video with a bright one,
              existing cues keep the old colors. Move colors to asset metadata
              and have cues inherit from their file. */}
          {assetType === "background" && chapter && paragraph && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="backgroundColor">Background Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="backgroundColor"
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="w-12 h-9 p-1 cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="flex-1 font-mono text-xs"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="textColor">Text Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="textColor"
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="w-12 h-9 p-1 cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="flex-1 font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={isUploading || !file}>
            {isUploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isUploading ? "Uploading..." : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
