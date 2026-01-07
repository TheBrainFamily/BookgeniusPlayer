import React from "react";
import { CharacterModalRenderer } from "./modals/character/CharacterModalRenderer";
import { SearchModalRenderer } from "./modals/search/SearchModalRenderer";
import { BookChapterModalRenderer } from "./modals/bookChapter/BookChapterModalRenderer";
import { BookMenuModalRenderer } from "./modals/bookMenu/BookMenuModalRenderer";
import { EditorModeModalRenderer } from "./modals/editorMode/EditorModeModalRenderer";
import { ApiKeyModalRenderer } from "./modals/apiKey/ApiKeyModalRenderer";
import { DeepResearchModalRenderer } from "@player/features/modals/deepResearch/DeepResearchModalRenderer";
import { PositionHistoryModalRenderer } from "./modals/positionHistory/PositionHistoryModalRenderer";
import { FootnoteModalRenderer } from "./modals/footnote/FootnoteModalRenderer";
import { AvatarEditModalRenderer } from "./modals/avatarEdit/AvatarEditModalRenderer";
import { BackgroundEditModalRenderer } from "./modals/backgroundEdit/BackgroundEditModalRenderer";
import { BackgroundAddModalRenderer } from "./modals/backgroundAdd/BackgroundAddModalRenderer";
import { MusicEditModalRenderer } from "./modals/musicEdit/MusicEditModalRenderer";
import { MusicAddModalRenderer } from "./modals/musicAdd/MusicAddModalRenderer";
import { NoteEditModalRenderer } from "./modals/noteEdit/NoteEditModalRenderer";
import { GraphicsSettingsModalRenderer } from "./modals/graphicsSettings/GraphicsSettingsModalRenderer";

export const ModalRenderers: React.FC = () => {
  return (
    <>
      <CharacterModalRenderer />
      <SearchModalRenderer />
      <DeepResearchModalRenderer />
      <BookChapterModalRenderer />
      <BookMenuModalRenderer />
      <PositionHistoryModalRenderer />
      <EditorModeModalRenderer />
      <ApiKeyModalRenderer />
      <FootnoteModalRenderer />
      <AvatarEditModalRenderer />
      <BackgroundEditModalRenderer />
      <BackgroundAddModalRenderer />
      <MusicEditModalRenderer />
      <MusicAddModalRenderer />
      <NoteEditModalRenderer />
      <GraphicsSettingsModalRenderer />
    </>
  );
};
