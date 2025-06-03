import React from "react";
import { Book } from "lucide-react";
import { motion, Variants } from "motion/react";

import { useBookMenuModal } from "@/stores/modals/bookMenuModal.store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { OptionalElement } from "@/components/OptionalElement";

const MenuButton = () => {
  const { openModal } = useBookMenuModal();
  const { t } = useTranslation();

  return (
    <OptionalElement>
      <div className={cn("bg-black/70 textured-bg rounded-3xl border shadow-xl text-white border-white/30 px-1 flex items-center")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.button onClick={openModal} className="p-2 my-1 hover:text-white rounded-full cursor-pointer flex" whileHover="hover" whileTap="tap" variants={buttonVariants}>
              <Book className="w-4 h-4 lg:w-5 lg:h-5" />
            </motion.button>
          </TooltipTrigger>
          <TooltipContent>{t("book_menu_button_tooltip")}</TooltipContent>
        </Tooltip>
      </div>
    </OptionalElement>
  );
};

export default MenuButton;

const buttonVariants: Variants = { hover: { backgroundColor: "rgba(255,255,255,0.2)", boxShadow: "0px 0px 8px rgba(255,255,255,0.5)" }, tap: { scale: 0.9 } };
