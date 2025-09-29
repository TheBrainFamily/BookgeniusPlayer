import React, { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Lock, X } from "lucide-react";
import { useIntegrations } from "@platform/integrations";

type Props = { onClose: () => void };

const AuthRequiredModal: React.FC<Props> = ({ onClose }) => {
  const { authMod } = useIntegrations();

  if (!authMod) return null;

  const { ready, isSignedIn, openSignIn } = authMod.useAuth();

  useEffect(() => {
    if (ready && isSignedIn) onClose();
  }, [ready, isSignedIn, onClose]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="relative max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <Button variant="ghost" size="icon" className="absolute top-4 right-4 z-10 bg-white/10 hover:bg-white/20 text-white" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </Button>

        <Card className="bg-card/95 backdrop-blur border-library-gold/20">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-library-gold to-library-walnut rounded-full flex items-center justify-center">
              <Lock className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold">Sign In to Use Reader Assistant</CardTitle>
            <p className="text-muted-foreground text-base max-w-xl mx-auto">You need to be signed in to access the live AI assistant.</p>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="text-center space-y-3 p-6 bg-library-gold/10 rounded-lg border border-library-gold/20">
              <p className="text-muted-foreground">Create an account or sign in to continue.</p>
              <Button onClick={() => openSignIn()} className="bg-library-gold hover:bg-library-gold/90 text-library-mahogany" disabled={!ready}>
                Sign In / Sign Up
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AuthRequiredModal;
