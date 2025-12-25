import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useModalCoordinator } from "../modalCoordinator.store";

const MODAL_ID = "editor-mode-modal";

type EditorModalType = "edit-paragraph" | "add-character" | "remove-character" | "set-talking-character" | "edit-character-tag" | "wrap-with-character";

type CreateCharacterFn = (characterName: string, chapterNumber: number, paragraphIndex: number) => Promise<{ slug: string; displayName: string }>;

interface EditorModeModalState {
  isOpen: boolean;
  modalType: EditorModalType | null;
  onSubmit: ((characterSlug?: string) => Promise<void>) | null;
  onCreateCharacter: CreateCharacterFn | null;

  chapterNumber: number | null;
  paragraphIndex: number | null;
  currentSpeaker: string | null;
  currentCharacterSlug: string | null;
  currentTextContent: string | null;
  selectedText: string | null;
  occurrenceIndex: number | null;

  openModal: (modalType: EditorModalType, onSubmit: (characterSlug?: string) => Promise<void>) => void;
  openTalkingCharacterModal: (
    chapterNumber: number,
    paragraphIndex: number,
    currentSpeaker: string | null,
    onSubmit: (characterSlug?: string) => Promise<void>,
    onCreateCharacter: CreateCharacterFn,
  ) => void;
  openEditCharacterTagModal: (
    chapterNumber: number,
    paragraphIndex: number,
    characterSlug: string,
    textContent: string,
    onSubmit: (newCharacterSlug?: string) => Promise<void>,
    onCreateCharacter: CreateCharacterFn,
  ) => void;
  openWrapWithCharacterModal: (
    chapterNumber: number,
    paragraphIndex: number,
    selectedText: string,
    occurrenceIndex: number,
    onSubmit: (characterSlug?: string) => Promise<void>,
    onCreateCharacter: CreateCharacterFn,
  ) => void;
  closeModal: () => void;
}

export const useEditorModeModal = create<EditorModeModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      modalType: null,
      onSubmit: null,
      onCreateCharacter: null,
      chapterNumber: null,
      paragraphIndex: null,
      currentSpeaker: null,
      currentCharacterSlug: null,
      currentTextContent: null,
      selectedText: null,
      occurrenceIndex: null,

      openModal: (modalType, onSubmit) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({
            isOpen: true,
            modalType,
            onSubmit,
            onCreateCharacter: null,
            chapterNumber: null,
            paragraphIndex: null,
            currentSpeaker: null,
            currentCharacterSlug: null,
            currentTextContent: null,
            selectedText: null,
            occurrenceIndex: null,
          });
        }
      },

      openTalkingCharacterModal: (chapterNumber, paragraphIndex, currentSpeaker, onSubmit, onCreateCharacter) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({
            isOpen: true,
            modalType: "set-talking-character",
            chapterNumber,
            paragraphIndex,
            currentSpeaker,
            currentCharacterSlug: null,
            currentTextContent: null,
            selectedText: null,
            occurrenceIndex: null,
            onSubmit,
            onCreateCharacter,
          });
        }
      },

      openEditCharacterTagModal: (chapterNumber, paragraphIndex, characterSlug, textContent, onSubmit, onCreateCharacter) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({
            isOpen: true,
            modalType: "edit-character-tag",
            chapterNumber,
            paragraphIndex,
            currentSpeaker: null,
            currentCharacterSlug: characterSlug,
            currentTextContent: textContent,
            selectedText: null,
            occurrenceIndex: null,
            onSubmit,
            onCreateCharacter,
          });
        }
      },

      openWrapWithCharacterModal: (chapterNumber, paragraphIndex, selectedText, occurrenceIndex, onSubmit, onCreateCharacter) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({
            isOpen: true,
            modalType: "wrap-with-character",
            chapterNumber,
            paragraphIndex,
            currentSpeaker: null,
            currentCharacterSlug: null,
            currentTextContent: null,
            selectedText,
            occurrenceIndex,
            onSubmit,
            onCreateCharacter,
          });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({
          isOpen: false,
          modalType: null,
          onSubmit: null,
          onCreateCharacter: null,
          chapterNumber: null,
          paragraphIndex: null,
          currentSpeaker: null,
          currentCharacterSlug: null,
          currentTextContent: null,
          selectedText: null,
          occurrenceIndex: null,
        });
      },
    }),
    { name: "editor-mode-modal" },
  ),
);
