import React, { useState } from "react";
import ModalUI from "@/components/modals/ModalUI";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useEditorModeModal } from "@/stores/modals/editorModeModal.store";
import { getCharactersData } from "@/genericBookDataGetters/getCharactersData";

interface EditorModeModalProps {
  onClose: () => void;
}

const EditorModeModal: React.FC<EditorModeModalProps> = ({ onClose }) => {
  const { modalType, onSubmit } = useEditorModeModal();
  const [selectedCharacter, setSelectedCharacter] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onSubmit) {
      await onSubmit(selectedCharacter);
      onClose();
    }
  };

  const renderContent = () => {
    if (!modalType) return null;

    switch (modalType) {
      case "edit-paragraph":
        return (
          <div className="space-y-4">
            <p className="text-center">Are you sure you want to edit this paragraph?</p>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/90 h-10 px-4 py-2 rounded-md cursor-pointer">
                Cancel
              </button>
              <button onClick={handleSubmit} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 rounded-md cursor-pointer">
                Edit
              </button>
            </div>
          </div>
        );
      case "remove-character":
        return (
          <div className="space-y-4">
            <p className="text-center">Are you sure you want to remove this character?</p>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/90 h-10 px-4 py-2 rounded-md cursor-pointer">
                Cancel
              </button>
              <button onClick={handleSubmit} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 rounded-md cursor-pointer">
                Remove
              </button>
            </div>
          </div>
        );
      case "add-character":
        return (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!selectedCharacter) {
                setError("Please select a character first");
                return;
              }
              await handleSubmit(e);
            }}
            className="space-y-4"
          >
            {error && <p className="text-destructive text-sm text-center">{error}</p>}
            <div>
              <Select onValueChange={setSelectedCharacter} value={selectedCharacter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Wybierz postać" />
                </SelectTrigger>
                <SelectContent className="max-h-45">
                  {getCharactersData().map((character) => (
                    <SelectItem key={character.slug} value={character.slug}>
                      {character.characterName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 rounded-md cursor-pointer">
              Add Character
            </button>
          </form>
        );
      default:
        return null;
    }
  };

  return (
    <ModalUI title="Editor Mode" onClose={onClose}>
      <div className="w-80">{renderContent()}</div>
    </ModalUI>
  );
};

export default EditorModeModal;
