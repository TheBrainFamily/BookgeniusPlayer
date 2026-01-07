import React, { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { type Id } from "@convex/_generated/dataModel";
import { Upload, Loader2 } from "lucide-react";

import { useBookConvex } from "@player/context/BookConvexContext";
import { useMusicEditModal } from "@player/stores/modals/musicEditModal.store";
import ModalUI from "./ModalUI";

const MusicEditModal: React.FC = () => {
  const { book } = useBookConvex();
  const { isOpen, cueId, fileBasename, currentMusicUrl, title, artist, closeModal } =
    useMusicEditModal();

  const startUpload = useMutation(api.generateUploadUrl.startUpload);
  const finishUpload = useMutation(api.generateUploadUrl.finishUpload);
  const updateFile = useMutation(api.musicCues.updateFile);

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !cueId || !fileBasename) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("audio/")) {
      console.log("[MusicEditModal] File dropped:", file.name, file.type, file.size);
      setUploadedFile(file);
      setError(null);
    } else {
      setError("Please drop an audio file (MP3, WAV, etc.)");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("audio/")) {
      console.log("[MusicEditModal] File selected:", file.name, file.type, file.size);
      setUploadedFile(file);
      setError(null);
    } else if (file) {
      setError("Please select an audio file (MP3, WAV, etc.)");
    }
  };

  const handleSubmit = async () => {
    if (!book?.path || !uploadedFile) {
      console.error("[MusicEditModal] Cannot submit: missing book path or file", {
        bookPath: book?.path,
        file: uploadedFile?.name,
      });
      return;
    }

    console.log("[MusicEditModal] Starting upload for cue replacement", {
      cueId,
      bookPath: book.path,
      fileName: uploadedFile.name,
      fileSize: uploadedFile.size,
      fileType: uploadedFile.type,
    });

    setIsUploading(true);
    setError(null);

    try {
      const folderPath = `${book.path}/music`;
      const basename = uploadedFile.name;

      console.log("[MusicEditModal] Calling startUpload", { folderPath, basename });
      const { intentId, uploadUrl, backend } = await startUpload({
        folderPath,
        basename,
        publish: true,
      });
      console.log("[MusicEditModal] Got upload URL", { intentId, backend });

      console.log("[MusicEditModal] Uploading file to", backend);
      const res = await fetch(uploadUrl, {
        method: backend === "r2" ? "PUT" : "POST",
        headers: { "Content-Type": uploadedFile.type },
        body: uploadedFile,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`Upload failed: ${res.status} ${errorText}`);
      }
      console.log("[MusicEditModal] File uploaded successfully");

      const uploadResponse = backend === "convex" ? await res.json() : undefined;
      console.log("[MusicEditModal] Calling finishUpload", { intentId });
      await finishUpload({
        intentId,
        uploadResponse,
        size: uploadedFile.size,
        contentType: uploadedFile.type,
        folderPath,
        basename,
      });
      console.log("[MusicEditModal] Upload finished");

      console.log("[MusicEditModal] Updating cue to new file", { cueId, fileBasename: basename });
      await updateFile({ id: cueId as Id<"musicCues">, fileBasename: basename });
      console.log("[MusicEditModal] Cue updated successfully");

      console.log("[MusicEditModal] SUCCESS: Music replaced successfully");
      closeModal();
    } catch (err) {
      console.error("[MusicEditModal] ERROR during upload:", err);
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <ModalUI title="Edit Music" onClose={closeModal}>
      <div className="w-96 flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2">
          <div className="text-white font-medium">{title || fileBasename}</div>
          {artist && <div className="text-zinc-400 text-sm">{artist}</div>}
          {currentMusicUrl && <audio src={currentMusicUrl} controls className="w-full mt-2" />}
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg px-3 py-2 text-red-300 text-sm">
            {error}
          </div>
        )}

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
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
          <div className={`text-sm mb-2 ${uploadedFile ? "text-green-300" : "text-zinc-400"}`}>
            {uploadedFile ? uploadedFile.name : "Drag and drop an MP3 file here"}
          </div>
          {uploadedFile && (
            <div className="text-zinc-500 text-xs mb-2">
              {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
            </div>
          )}
          <label className="cursor-pointer text-purple-400 hover:text-purple-300 text-sm">
            or click to browse
            <input type="file" accept="audio/*" onChange={handleFileSelect} className="hidden" />
          </label>
        </div>

        <button
          onClick={handleSubmit}
          disabled={isUploading || !uploadedFile}
          className="w-full bg-purple-600 text-white hover:bg-purple-500 h-11 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isUploading && <Loader2 size={18} className="animate-spin" />}
          {isUploading ? "Uploading..." : "Replace Music"}
        </button>

        <button
          onClick={closeModal}
          disabled={isUploading}
          className="w-full bg-zinc-700 text-white hover:bg-zinc-600 h-10 px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </ModalUI>
  );
};

export default MusicEditModal;
