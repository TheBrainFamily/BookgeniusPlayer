import { Search, BookOpen, Settings, LogOut } from "lucide-react";
import { Button } from "@platform/components/ui/button";
import { Input } from "@platform/components/ui/input";
import { ClientOnly } from "vite-react-ssg";
import { useIntegrations } from "@platform/integrations";

interface NavigationProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

const Navigation = ({ searchQuery, onSearchChange }: NavigationProps) => {
  const { authMod } = useIntegrations();

  if (!authMod) return null;

  const { ready, isSignedIn, openSignIn, signOut } = authMod.useAuth();
  const UserWidget = authMod.useUserWidget?.();
  const SignInWidget = authMod.useSignInWidget?.();
  return (
    <nav className="relative z-10 bg-card/90 backdrop-blur-sm border-b border-border">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <BookOpen className="h-8 w-8 text-library-gold animate-candleflicker" />
            <h1 className="text-2xl font-bold text-foreground">
              Book<span className="text-library-gold">Genius</span>
            </h1>
          </div>

          {/* Search Bar */}
          <div className="hidden md:flex relative max-w-md flex-1 mx-8">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search visual novels, authors..."
              className="pl-10 bg-library-mahogany/50 border-library-walnut text-foreground placeholder:text-muted-foreground focus:border-library-gold"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          {/* Navigation Links */}
          <div className="flex items-center space-x-4">
            <ClientOnly>
              {() => {
                if (!ready) return null;

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
                        Sign Out
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
              placeholder="Search novels..."
              className="pl-10 bg-library-mahogany/50 border-library-walnut text-foreground placeholder:text-muted-foreground"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
