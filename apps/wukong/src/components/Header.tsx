import { useState } from "react";
import { Button } from "@wukong/components/ui/button";
import { Input } from "@wukong/components/ui/input";
import { Search, BookOpen, User, Info } from "lucide-react";
import AboutModal from "./AboutModal";
import SignInModal from "./SignInModal";

const Header = () => {
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center space-x-2">
            <BookOpen className="h-8 w-8 text-accent" />
            <span className="font-traditional text-xl font-bold text-accent">Wukong Chronicles</span>
          </div>

          <nav className="flex items-center space-x-4">
            <Button variant="mystical" size="sm" onClick={() => setIsAboutModalOpen(true)}>
              <Info className="h-4 w-4 mr-2" />
              About
            </Button>
            <Button variant="mystical" size="sm" onClick={() => setIsSignInModalOpen(true)}>
              <User className="h-4 w-4" />
              Sign In
            </Button>
          </nav>
        </div>
      </header>

      <AboutModal isOpen={isAboutModalOpen} onClose={() => setIsAboutModalOpen(false)} />

      <SignInModal isOpen={isSignInModalOpen} onClose={() => setIsSignInModalOpen(false)} />
    </>
  );
};

export default Header;
