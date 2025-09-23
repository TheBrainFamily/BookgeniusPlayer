import { useState } from "react";
import { Button } from "@wukong/components/ui/button";
import { Input } from "@wukong/components/ui/input";
import { Search, BookOpen, User, Info, LogOut } from "lucide-react";
import AboutModal from "./AboutModal";
import SignInModal from "./SignInModal";
import { useIntegrations } from "@platform/integrations";

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
            <LoginComponent />
          </nav>
        </div>
      </header>

      <AboutModal isOpen={isAboutModalOpen} onClose={() => setIsAboutModalOpen(false)} />

      <SignInModal isOpen={isSignInModalOpen} onClose={() => setIsSignInModalOpen(false)} />
    </>
  );
};

const LoginComponent = () => {
  const { authMod } = useIntegrations();
  if (!authMod) return null;

  const { ready: authReady, isSignedIn, openSignIn, signOut } = authMod.useAuth();
  const UserWidget = authMod.useUserWidget?.();
  const SignInWidget = authMod.useSignInWidget?.();

  if (!authReady) return null;

  if (isSignedIn) {
    if (UserWidget) {
      return (
        <>
          <UserWidget />
          {/* <Button variant="ghost" size="icon" className="text-foreground hover:text-library-gold hover:bg-library-walnut/50">
                          <Settings className="h-5 w-5" />
                        </Button> */}
        </>
      );
    } else {
      return (
        <Button onClick={() => signOut && signOut()} variant="mystical">
          "Sign out"
          <LogOut className="h-5 w-5" />
        </Button>
      );
    }
  } else if (SignInWidget) {
    return <SignInWidget onClick={openSignIn} />;
  }
};

export default Header;
