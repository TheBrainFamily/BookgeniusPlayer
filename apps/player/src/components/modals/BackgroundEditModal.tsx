import React, { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { type Id } from "@convex/_generated/dataModel";
import { motion, AnimatePresence } from "motion/react";
import { Upload, Loader2 } from "lucide-react";

import { useBookConvex } from "@player/context/BookConvexContext";
import { useBackgroundEditModal } from "@player/stores/modals/backgroundEditModal.store";
import {
  useBackgroundGenerationStore,
  createBackgroundKey,
} from "@player/stores/backgroundGeneration.store";

type BackgroundMediaType = "image" | "video";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];
const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v"];

const getMediaTypeFromBasename = (basename?: string | null): BackgroundMediaType | null => {
  if (!basename) return null;
  const ext = basename.toLowerCase().split(".").pop();
  if (!ext) return null;
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  return null;
};

const getMediaTypeFromContentType = (contentType?: string | null): BackgroundMediaType | null => {
  if (!contentType) return null;
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("image/")) return "image";
  return null;
};

const getMediaTypeFromFile = (file: File): BackgroundMediaType | null => {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  return getMediaTypeFromBasename(file.name);
};

const appendSuffixToBasename = (basename: string, suffix: string): string => {
  const dotIndex = basename.lastIndexOf(".");
  if (dotIndex === -1) return `${basename}-${suffix}`;
  return `${basename.slice(0, dotIndex)}-${suffix}${basename.slice(dotIndex)}`;
};

const ensureUniqueBasename = (basename: string, existing: Set<string>): string => {
  if (!existing.has(basename)) return basename;
  const timestamp = String(Date.now());
  let candidate = appendSuffixToBasename(basename, `replace-${timestamp}`);
  if (!existing.has(candidate)) return candidate;
  let counter = 1;
  while (existing.has(candidate) && counter < 20) {
    candidate = appendSuffixToBasename(basename, `replace-${timestamp}-${counter}`);
    counter += 1;
  }
  return candidate;
};

// eslint-disable-next-line complexity
const BackgroundEditModal: React.FC = () => {
  const { book } = useBookConvex();
  const { isOpen, cueId, fileBasename, chapter, paragraph, currentBackgroundUrl, closeModal } =
    useBackgroundEditModal();
  const { startGeneration } = useBackgroundGenerationStore();

  const startBackgroundEdit = useAction(api.backgroundEditing.startBackgroundEdit);
  const startUpload = useMutation(api.generateUploadUrl.startUpload);
  const finishUpload = useMutation(api.generateUploadUrl.finishUpload);
  const updateFile = useMutation(api.backgroundCues.updateFile);
  const updateFileForBasename = useMutation(api.backgroundCues.updateFileForBasename);

  const [instructions, setInstructions] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"replace" | "edit">("replace");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [replaceScope, setReplaceScope] = useState<"all" | "single" | null>(null);

  const bookPath = book?.path ?? "";
  const backgroundCues = useQuery(api.backgroundCues.listByBook, bookPath ? { bookPath } : "skip");
  const backgroundFiles = useQuery(api.backgroundCues.listFiles, bookPath ? { bookPath } : "skip");

  const existingBasenames = useMemo(
    () => new Set((backgroundFiles ?? []).map((file) => file.basename)),
    [backgroundFiles],
  );

  const currentFileInfo = useMemo(
    () => (backgroundFiles ?? []).find((file) => file.basename === fileBasename),
    [backgroundFiles, fileBasename],
  );

  const currentType = useMemo(
    () =>
      getMediaTypeFromBasename(fileBasename) ??
      getMediaTypeFromContentType(currentFileInfo?.contentType),
    [fileBasename, currentFileInfo?.contentType],
  );

  const isCurrentVideo = currentType === "video";
  const isCurrentImage = currentType === "image";

  const reuseCount = useMemo(() => {
    if (!backgroundCues || !fileBasename) return 0;
    return backgroundCues.filter((cue) => cue.fileBasename === fileBasename).length;
  }, [backgroundCues, fileBasename]);

  const isReused = reuseCount > 1;
  const scopeRequired = isReused;
  const showAiEdit = isCurrentImage;
  const effectiveTab = showAiEdit ? activeTab : "replace";
  const isBusy = isSubmitting || isUploading;
  const modalReady = isOpen && !!cueId && !!fileBasename && chapter !== null && paragraph !== null;

  const handleSubmit = async () => {
    if (!book?.path || !instructions.trim()) {
      console.error("[BackgroundEditModal] Cannot submit: missing book path or instructions", {
        bookPath: book?.path,
        instructions,
      });
      return;
    }

    setIsSubmitting(true);
    if (!chapter || !paragraph) {
      console.error("[BackgroundEditModal] Cannot submit: missing chapter or paragraph", {
        chapter,
        paragraph,
      });
      return;
    }
    if (!fileBasename) {
      console.error("[BackgroundEditModal] Cannot submit: missing file basename", { fileBasename });
      return;
    }
    const key = createBackgroundKey(chapter, paragraph);
    startGeneration(key, { chapter, paragraph, prompt: instructions.trim(), type: "edit" });
    closeModal();

    try {
      await startBackgroundEdit({
        bookPath: book.path,
        cueId: cueId as Id<"backgroundCues">,
        fileBasename,
        instructions: instructions.trim(),
      });
    } catch (err) {
      console.error("[BackgroundEditModal] Failed to start background edit:", err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileChosen = (file: File) => {
    const fileType = getMediaTypeFromFile(file);
    if (!fileType) {
      setUploadError("Please drop an image or video file");
      return;
    }
    setUploadedFile(file);
    setUploadError(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileChosen(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileChosen(file);
    }
  };

  // eslint-disable-next-line complexity
  const handleUpload = async () => {
    if (!book?.path || !uploadedFile) {
      console.error("[BackgroundEditModal] Cannot upload: missing book path or file", {
        bookPath: book?.path,
        file: uploadedFile?.name,
      });
      return;
    }

    if (scopeRequired && !replaceScope) {
      setUploadError("Select whether to replace in all places or only this cue.");
      return;
    }

    const uploadedType = getMediaTypeFromFile(uploadedFile);
    const sameType = !!uploadedType && !!currentType && uploadedType === currentType;

    let uploadBasename = fileBasename;
    let updateSingleCue = false;
    let updateAllCues = false;

    if (!isReused) {
      if (sameType) {
        uploadBasename = fileBasename;
      } else {
        uploadBasename = ensureUniqueBasename(uploadedFile.name, existingBasenames);
        updateSingleCue = true;
      }
    } else if (replaceScope === "all") {
      if (sameType) {
        uploadBasename = fileBasename;
      } else {
        uploadBasename = ensureUniqueBasename(uploadedFile.name, existingBasenames);
        updateAllCues = true;
      }
    } else {
      uploadBasename = ensureUniqueBasename(uploadedFile.name, existingBasenames);
      updateSingleCue = true;
    }

    setIsUploading(true);
    setUploadError(null);

    if (!uploadBasename) {
      console.error("[BackgroundEditModal] Cannot upload: missing upload basename", {
        uploadBasename,
      });
      return;
    }

    try {
      const folderPath = `${book.path}/backgrounds`;
      const { intentId, uploadUrl, backend } = await startUpload({
        folderPath,
        basename: uploadBasename,
      });

      const res = await fetch(uploadUrl, {
        method: backend === "r2" ? "PUT" : "POST",
        headers: { "Content-Type": uploadedFile.type },
        body: uploadedFile,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`Upload failed: ${res.status} ${errorText}`);
      }

      const uploadResponse = backend === "convex" ? await res.json() : undefined;
      if (!fileBasename) {
        console.error("[BackgroundEditModal] Cannot finish upload: missing upload basename", {
          uploadBasename,
        });
        return;
      }
      await finishUpload({
        intentId,
        uploadResponse,
        size: uploadedFile.size,
        contentType: uploadedFile.type,
        folderPath,
        basename: uploadBasename,
      });

      if (updateAllCues) {
        await updateFileForBasename({
          bookPath: book.path,
          oldBasename: fileBasename,
          newBasename: uploadBasename,
        });
      } else if (updateSingleCue) {
        await updateFile({
          bookPath: book.path,
          id: cueId as Id<"backgroundCues">,
          fileBasename: uploadBasename,
        });
      }

      closeModal();
    } catch (err) {
      console.error("[BackgroundEditModal] Upload failed:", err);
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const uploadDisabled = isUploading || !uploadedFile || (scopeRequired && !replaceScope);

  if (!modalReady) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-zinc-900 rounded-2xl border border-zinc-700 p-8 w-full h-full max-w-6xl max-h-[90vh] shadow-2xl flex flex-col"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-semibold text-white">Edit Background</h2>
              <p className="text-zinc-400 text-sm mt-1">
                Chapter {chapter}, Paragraph {paragraph}
              </p>
            </div>
            <button
              onClick={closeModal}
              disabled={isBusy}
              className="text-zinc-400 hover:text-white transition-colors p-2"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="flex-1 min-h-0 mb-6 rounded-xl overflow-hidden border border-zinc-700">
            {currentBackgroundUrl ? (
              isCurrentVideo ? (
                <video
                  src={currentBackgroundUrl}
                  controls
                  className="w-full h-full object-contain bg-black"
                />
              ) : (
                <img
                  src={currentBackgroundUrl}
                  alt={fileBasename}
                  className="w-full h-full object-contain bg-black"
                />
              )
            ) : (
              <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-400">
                No preview available
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setActiveTab("replace")}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                effectiveTab === "replace"
                  ? "bg-purple-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              Replace File
            </button>
            {showAiEdit && (
              <button
                onClick={() => setActiveTab("edit")}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  effectiveTab === "edit"
                    ? "bg-purple-600 text-white"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                AI Edit
              </button>
            )}
          </div>

          {effectiveTab === "replace" ? (
            <div className="flex flex-col gap-4">
              {uploadError && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-lg px-3 py-2 text-red-300 text-sm">
                  {uploadError}
                </div>
              )}

              {isReused && (
                <div className="flex flex-col gap-2">
                  <div className="text-xs text-zinc-400">Used in {reuseCount} places</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setReplaceScope("all")}
                      className={`h-9 px-3 rounded-lg border text-sm transition-colors ${
                        replaceScope === "all"
                          ? "border-purple-500 bg-purple-500/10 text-purple-200"
                          : "border-zinc-600 text-zinc-300 hover:border-zinc-500"
                      }`}
                    >
                      Replace in {reuseCount} places
                    </button>
                    <button
                      onClick={() => setReplaceScope("single")}
                      className={`h-9 px-3 rounded-lg border text-sm transition-colors ${
                        replaceScope === "single"
                          ? "border-purple-500 bg-purple-500/10 text-purple-200"
                          : "border-zinc-600 text-zinc-300 hover:border-zinc-500"
                      }`}
                    >
                      Only this cue
                    </button>
                  </div>
                </div>
              )}

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  isDragging
                    ? "border-purple-500 bg-purple-500/10"
                    : uploadedFile
                      ? "border-green-500 bg-green-500/10"
                      : "border-zinc-600 hover:border-zinc-500"
                }`}
              >
                <Upload
                  size={32}
                  className={`mx-auto mb-2 ${uploadedFile ? "text-green-400" : "text-zinc-400"}`}
                />
                <div
                  className={`text-sm mb-2 ${uploadedFile ? "text-green-300" : "text-zinc-400"}`}
                >
                  {uploadedFile ? uploadedFile.name : "Drag and drop an image or video file here"}
                </div>
                {uploadedFile && (
                  <div className="text-zinc-500 text-xs mb-2">
                    {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                )}
                <label className="cursor-pointer text-purple-400 hover:text-purple-300 text-sm">
                  or click to browse
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  disabled={isBusy}
                  className="flex-1 bg-zinc-700 text-white hover:bg-zinc-600 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploadDisabled}
                  className="flex-1 bg-purple-600 text-white hover:bg-purple-500 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isUploading && <Loader2 size={18} className="animate-spin" />}
                  {isUploading ? "Uploading..." : "Replace Background"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs text-zinc-400 mb-2 block">
                Describe how you want to modify this background:
              </label>
              <div className="flex gap-6 items-center">
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g., Make it nighttime with stars, add fog..."
                  className="flex-1 h-20 bg-zinc-800 border border-zinc-600 rounded-lg px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none"
                  disabled={isSubmitting}
                />
                <div className="flex gap-3">
                  <button
                    onClick={closeModal}
                    disabled={isBusy}
                    className="bg-zinc-700 text-white hover:bg-zinc-600 h-12 px-6 rounded-lg cursor-pointer disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !instructions.trim()}
                    className="bg-purple-600 text-white hover:bg-purple-500 h-12 px-8 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium whitespace-nowrap"
                  >
                    {isSubmitting ? "Starting..." : "Edit Background"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default BackgroundEditModal;
