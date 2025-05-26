import React from "react";
import { Book } from "lucide-react";
import { motion, Variants } from "motion/react";

import { useModal } from "@/context/ModalContext";

const MenuButton = () => {
  const { openBookMenuModal } = useModal();

  return (
    <div className="bg-black/40 backdrop-blur-md rounded-3xl border shadow-xl text-white border-white/30 px-1 flex items-center">
      <motion.button onClick={openBookMenuModal} className="p-2 my-1 hover:text-white rounded-full cursor-pointer flex" whileHover="hover" whileTap="tap" variants={buttonVariants}>
        <Book className="h-5 w-5 " />
      </motion.button>
    </div>
  );
};

export default MenuButton;

const buttonVariants: Variants = { hover: { backgroundColor: "rgba(255,255,255,0.2)", boxShadow: "0px 0px 8px rgba(255,255,255,0.5)" }, tap: { scale: 0.9 } };
