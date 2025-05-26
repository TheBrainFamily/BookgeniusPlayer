import React from "react";
import ModalUI from "@/components/modals/ModalUI";
import { BookData } from "@/booksData/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

interface EditorModeModalProps {
  onClose: () => void;
  bookData: BookData;
}

const EditorModeModal: React.FC<EditorModeModalProps> = ({ onClose, bookData }) => {
  return (
    <ModalUI title="Editor Mode" onClose={onClose}>
      <div className="w-80 space-y-2">
        <div className="space-y-4">
          <Select>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Wybierz postać" />
            </SelectTrigger>
            <SelectContent className="max-h-45">
              {bookData.charactersData.map((character) => (
                <SelectItem key={character.slug} value={character.slug}>
                  {character.characterName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </ModalUI>
  );
};

export default EditorModeModal;
