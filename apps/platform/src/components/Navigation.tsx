import { ClientOnly } from "vite-react-ssg";
import { Search, BookOpen, LogOut, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@platform/components/ui/button";
import { Input } from "@platform/components/ui/input";
import { useIntegrations } from "@platform/integrations";

interface NavigationProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

const Navigation = ({ searchQuery, onSearchChange }: NavigationProps) => {
  const { authMod } = useIntegrations();
  const { t } = useTranslation();

  if (!authMod) return null;

  const { ready: authReady, isSignedIn, openSignIn, signOut } = authMod.useAuth();
  console.log("Navigation: authReady", authReady);
  const UserWidget = authMod.useUserWidget?.();
  const SignInWidget = authMod.useSignInWidget?.();

  return (
    <nav className="sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <a href="#" className="flex items-center space-x-3">
            <BookOpen className="h-8 w-8 text-library-gold animate-candleflicker" />
            <h1 className="text-2xl font-bold text-foreground relative">
              {t("hero.bookGenius").split(/(?=[A-Z])/)[0]}
              <span className="text-library-gold">
                {t("hero.bookGenius").split(/(?=[A-Z])/)[1]}
              </span>
              <span className="absolute -right-6 -bottom-2 bg-[#1E2A44] px-2 py-1 text-xs text-library-goldA uppercase rounded-md -skew-4 -rotate-4">
                Beta
              </span>
            </h1>
          </a>

          {/* Search Bar */}
          <div className="hidden md:flex relative max-w-md flex-1 mx-8">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("navigation.search")}
              className="pl-10 pr-10 bg-library-mahogany/50 border-library-walnut text-foreground placeholder:text-muted-foreground focus:border-library-gold"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchQuery && (
              <Button
                variant="ghost"
                onClick={() => onSearchChange("")}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Navigation Links */}
          <div className="flex items-center space-x-4">
            <ClientOnly>
              {() => {
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
                      <Button onClick={() => signOut && signOut()} variant="secondary">
                        {t("navigation.signOut", "Sign Out")}
                        <LogOut className="h-5 w-5" />
                      </Button>
                    );
                  }
                } else if (SignInWidget) {
                  return <SignInWidget onClick={openSignIn} />;
                }
              }}
            </ClientOnly>
          </div>
        </div>

        {/* Mobile Search */}
        <div className="md:hidden mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("navigation.searchMobile", "Search novels...")}
              className="pl-10 pr-10 bg-library-mahogany/50 border-library-walnut text-foreground placeholder:text-muted-foreground"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchQuery && (
              <Button
                variant="ghost"
                onClick={() => onSearchChange("")}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
