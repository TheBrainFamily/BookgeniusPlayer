import React from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";

import ModalUI from "./ModalUI";

interface FootnoteModalProps {
  html: string;
  onClose: () => void;
}

export const FootnoteModal: React.FC<FootnoteModalProps> = ({ html, onClose }) => {
  return (
    <ModalUI onClose={onClose} size="md" showCloseButton={false}>
      <motion.div className="px-4 pb-2 pt-1 relative" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
        <button
          type="button"
          onClick={onClose}
          className="absolute top-0 right-0 p-1 rounded-md text-white/70 hover:text-white transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X size={18} />
        </button>
        <div className="text-white/90 leading-relaxed footnote-content pr-6" dangerouslySetInnerHTML={{ __html: html }} />
      </motion.div>
    </ModalUI>
  );
};

export default FootnoteModal;
