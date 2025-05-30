import React from "react";
import { CharacterModalRenderer } from "./modals/character";
import { SearchModalRenderer } from "./modals/search";
import { DeepResearchModalRenderer } from "./modals/deepResearch";
import { BookChapterModalRenderer } from "./modals/bookChapter";
import { BookMenuModalRenderer } from "./modals/bookMenu";
import { EditorModeModalRenderer } from "./modals/editorMode";

export const ModalRenderers: React.FC = () => {
  return (
    <>
      <CharacterModalRenderer />
      <SearchModalRenderer />
      <DeepResearchModalRenderer />
      <BookChapterModalRenderer />
      <BookMenuModalRenderer />
      <EditorModeModalRenderer />
    </>
  );
};
