import React from "react";
import { CharacterModalRenderer } from "./modals/character/CharacterModalRenderer";
import { SearchModalRenderer } from "./modals/search/SearchModalRenderer";
import { DeepResearchModalRenderer } from "./modals/deepResearch/DeepResearchModalRenderer";
import { BookChapterModalRenderer } from "./modals/bookChapter/BookChapterModalRenderer";
import { BookMenuModalRenderer } from "./modals/bookMenu/BookMenuModalRenderer";
import { EditorModeModalRenderer } from "./modals/editorMode/EditorModeModalRenderer";
import { ApiKeyModalRenderer } from "./modals/apiKey/ApiKeyModalRenderer";
import { SentenceModalRenderer } from "./modals/sentence/SentenceModalRenderer";
import { QuizModalRenderer } from "./modals/quiz/QuizModalRenderer";

export const ModalRenderers: React.FC = () => {
  return (
    <>
      <CharacterModalRenderer />
      <SearchModalRenderer />
      <DeepResearchModalRenderer />
      <BookChapterModalRenderer />
      <BookMenuModalRenderer />
      <EditorModeModalRenderer />
      <ApiKeyModalRenderer />
      <SentenceModalRenderer />
      <QuizModalRenderer />
    </>
  );
};
