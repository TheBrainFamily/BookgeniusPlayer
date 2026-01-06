import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { motion, AnimatePresence } from "motion/react";

import { useBookConvex } from "@player/context/BookConvexContext";
import { useNoteEditModal } from "@player/stores/modals/noteEditModal.store";
import { invalidateFootnoteCache, updateFootnoteCache } from "@player/ui/highlightFootnote";

function removeNoteElementFromDOM(noteNumber: string): void {
  const noteLinks = document.querySelectorAll<HTMLAnchorElement>(`a[data-note="${noteNumber}"]`);
  noteLinks.forEach((link) => {
    link.parentNode?.removeChild(link);
  });
}

const NoteEditModal: React.FC = () => {
  const { book } = useBookConvex();
  const { isOpen, noteId, bookPath, closeModal, content: initialContent } = useNoteEditModal();

  const effectiveBookPath = bookPath || book?.path;

  const noteData = useQuery(
    api.notes.getFullNoteByNoteId,
    isOpen && effectiveBookPath && noteId ? { bookPath: effectiveBookPath, noteId } : "skip",
  );

  const updateNote = useMutation(api.notes.update);
  const deleteNote = useMutation(api.notes.remove);
  const removeNoteFromChapter = useAction(api.paragraphEditor.removeNoteFromChapter);

  const [editedContent, setEditedContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const contentToUse = noteData?.content || initialContent || "";
      const plainText = contentToUse.replace(/<[^>]*>/g, "");
      setEditedContent(plainText);
    }
  }, [isOpen, noteData, initialContent]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!noteData?._id || !noteId) return;

    setIsSubmitting(true);
    try {
      const htmlContent = `<p>${editedContent}</p>`;
      await updateNote({ id: noteData._id, content: htmlContent });
      updateFootnoteCache(noteId, htmlContent);
      closeModal();
    } catch (error) {
      console.error("Failed to update note:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!noteData?._id || !noteId || !effectiveBookPath || noteData.chapter === undefined) return;

    const noteNumber = noteId.replace(/^fn/, "");

    setIsSubmitting(true);
    try {
      await removeNoteFromChapter({
        bookPath: effectiveBookPath,
        chapterNumber: noteData.chapter,
        noteNumber,
      });
      await deleteNote({ id: noteData._id });
      removeNoteElementFromDOM(noteNumber);
      invalidateFootnoteCache(noteId);
      closeModal();
    } catch (error) {
      console.error("Failed to delete note:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = !noteData && !initialContent;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-zinc-900 rounded-2xl border border-zinc-700 p-6 w-full max-w-2xl shadow-2xl flex flex-col"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-white">Edit Note</h2>
              <p className="text-zinc-400 text-sm mt-1">{noteId}</p>
            </div>
            <button
              onClick={closeModal}
              disabled={isSubmitting}
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

          <div className="flex-1 mb-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-40 text-zinc-400">
                Loading note...
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="text-xs text-zinc-400">Note Content</label>
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  disabled={isSubmitting || !noteData}
                  className="w-full h-40 bg-zinc-800 border border-zinc-600 rounded-lg px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none"
                  placeholder="Enter note content..."
                />
              </div>
            )}
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={handleDelete}
              disabled={isSubmitting || !noteData}
              className="bg-red-900/30 text-red-400 hover:bg-red-900/50 hover:text-red-300 border border-red-900/50 h-10 px-4 rounded-lg cursor-pointer disabled:opacity-50 transition-colors text-sm font-medium"
            >
              Delete Note
            </button>

            <div className="flex gap-3">
              <button
                onClick={closeModal}
                disabled={isSubmitting}
                className="bg-zinc-700 text-white hover:bg-zinc-600 h-10 px-6 rounded-lg cursor-pointer disabled:opacity-50 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSubmitting || !noteData}
                className="bg-purple-600 text-white hover:bg-purple-500 h-10 px-6 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
              >
                {isSubmitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default NoteEditModal;
