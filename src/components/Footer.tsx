import React from "react";
import { AnimatePresence, motion, Variants } from "motion/react";

import BottomInput from "./BottomInput";
import { useWebSocket } from "@/context/WebSocketContext";
import useSplashHidden from "@/hooks/useSplashHidden";
import { cn } from "@/lib/utils";

const Footer = () => {
  const { sendMessage } = useWebSocket();

  const isSplashHidden = useSplashHidden();

  return (
    <AnimatePresence>
      {isSplashHidden && (
        <motion.footer variants={footerVariants} initial="hidden" animate="visible" className={cn("fixed bottom-0 inset-x-0 z-50", "optional-element")}>
          <BottomInput placeholder="Poszukaj albo zapytaj" onSubmit={sendMessage} />
        </motion.footer>
      )}
    </AnimatePresence>
  );
};

export default Footer;

const footerVariants: Variants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 2, delay: 4 } } };
