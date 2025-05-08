import React, { createContext, useContext, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalContextType {
  openModal: (content: ReactNode) => void;
  closeModal: () => void;
  modalContent: ReactNode | null;
  isModalOpen: boolean;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState<ReactNode | null>(null);

  const openModal = (content: ReactNode) => {
    setModalContent(content);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setModalContent(null);
    setIsModalOpen(false);
  };

  return (
    <ModalContext.Provider value={{ openModal, closeModal, modalContent, isModalOpen }}>
      {children}
      {isModalOpen && modalContent &&
        createPortal(
          <div className="modal-overlay active bg-black items-center justify-center" onClick={closeModal}>
            <div className="bg-transparent flex h-full items-center justify-center">
              {/* You might want a generic close button here or handle it within the modalContent */}
              {/* <button onClick={closeModal} className="modal-close" style={{ position: 'absolute', top: '10px', right: '10px' }}>&times;</button> */}
              {modalContent}
            </div>
          </div>,
          document.body
        )}
    </ModalContext.Provider>
  );
};

export const useModal = (): ModalContextType => {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};
