import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "./FootnoteModal.css";

interface Props {
  open: boolean;
  html: string;
  onClose: () => void;
}
export const FootnoteModal: React.FC<Props> = ({ open, html, onClose }) => {
  if (!open) return null;

  return createPortal(
    <>
      <div className="note-modal-overlay" onClick={onClose} />
      <div className="note-modal">
        <button className="note-close" onClick={onClose}>
          <X size={24} />
        </button>
        <div className="note-modal-content" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </>,
    document.body,
  );
};
