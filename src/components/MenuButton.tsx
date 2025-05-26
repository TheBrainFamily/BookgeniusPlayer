import React from "react";
import { Book } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useModal } from "@/context/ModalContext";

const MenuButton = () => {
  const { openBookMenuModal } = useModal();

  return (
    <div className="fixed z-50 optional-element" style={{ top: "max(env(safe-area-inset-top, 0px), 1rem)", left: "1rem" }}>
      <Button size="icon" className="bg-white/20 backdrop-blur-md rounded-3xl p-[1.35rem] text-white" onClick={openBookMenuModal}>
        <Book className="h-5 w-5 " />
      </Button>
    </div>
  );
};

export default MenuButton;
