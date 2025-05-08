import React from "react";
import { useModal } from "../context/ModalContext";


const openDetailsModal = (name: string, isVideo: boolean, mediaSrc: string, summaryHTML: string) => {
    const { openModal } = useModal();
    openModal(  
      <div className="flex flex-row lg:flex-col gap-4 max-w-full lg:max-w-120 max-h-full">
        <div className="rounded-full overflow-hidden max-h-[90vh] max-w-[90vh] lg:max-h-120 lg:max-w-120 border-4 border-[var(--entity-highlight-border-light)]">
          {isVideo ? <video src={mediaSrc} autoPlay loop muted playsInline /> : <img src={mediaSrc} alt={name} />}
        </div>
        <div className="flex flex-col self-center p-4 rounded-lg bg-[var(--entity-highlight-bg-light)] border-2 border-[var(--entity-highlight-border-light)]">
        <h4 className="editable-text italic font-bold text-center">{name}</h4>
        <p className="text-center">
          {summaryHTML}
        </p>
      </div>
      </div>
    );
  };

export const CharacterHighlighter = (name: string, isVideo: boolean, mediaSrc: string, summaryHTML: string) => {
  return <span className="border-1 border-dashed border-gray rounded-md p-2 bg-floral-white" onClick={() => openDetailsModal(name, isVideo, mediaSrc, summaryHTML)}>{name}</span>;
};
