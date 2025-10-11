import React, { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Crown, BookOpen, Zap, Check, Lock, X } from "lucide-react";
import { useIntegrations } from "@platform/integrations";
import type { PaymentType } from "@platform/integrations";
import { useTranslation } from "react-i18next";

interface PaywallProps {
  bookSlug: string;
  bookTitle: string;
  onClose: () => void;
  openSignIn: () => void;
  isUserLoggedIn: boolean;
  handlePayment: (paymentType: PaymentType, bookSlug: string) => void;
  loading: string | null;
}

export const PaywallInner: React.FC<PaywallProps> = ({ bookSlug, bookTitle, onClose, openSignIn, isUserLoggedIn, handlePayment, loading }) => {
  const { t } = useTranslation();
  const handleSignIn = () => {
    console.log("[PAYWALL] handleSignIn");
    openSignIn();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="relative max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <Button variant="ghost" size="icon" className="absolute top-4 right-4 z-10 bg-white/10 hover:bg-white/20 text-white" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>

        <Card className="bg-card/95 backdrop-blur border-library-gold/20">
          <CardHeader className="text-center space-y-4">
            <div className="relative mx-auto w-16 h-16 bg-gradient-to-br from-library-gold to-library-walnut rounded-full flex items-center justify-center">
              <Lock className="h-8 w-8 text-white" />
              <span className="absolute -right-2 -bottom-2 bg-[#1E2A44] px-2 py-1 text-xs text-library-goldA uppercase rounded-md -skew-4 -rotate-4">Beta</span>
            </div>
            <CardTitle className="text-3xl font-bold">
              {t("continueReading")} <span className="text-library-gold">{bookTitle}</span>
            </CardTitle>
            {/*<p className="text-muted-foreground text-lg max-w-2xl mx-auto">You've reached the end of the free preview. Choose how you'd like to continue your literary journey.</p>*/}
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">{t("reachedFreePreview")}</p>
          </CardHeader>

          <CardContent className="space-y-8">
            {!isUserLoggedIn && (
              <div className="text-center space-y-4 p-6 bg-library-gold/10 rounded-lg border border-library-gold/20">
                <h3 className="text-xl font-semibold">{t("bestAccessAvailable")}</h3>
                <p className="text-muted-foreground">{t("youreInvited")}</p>
                <Button onClick={handleSignIn} className="bg-library-gold hover:bg-library-gold/90 text-library-mahogany">
                  {t("navigation.signIn")} / {t("navigation.signOut")}
                </Button>
              </div>
            )}

            {/*{!isUserLoggedIn && (*/}
            {/*  <div className="text-center space-y-4 p-6 bg-library-gold/10 rounded-lg border border-library-gold/20">*/}
            {/*    <h3 className="text-xl font-semibold">Sign In to Continue</h3>*/}
            {/*    <p className="text-muted-foreground">Create an account or sign in to purchase books and manage your library.</p>*/}
            {/*    <Button onClick={handleSignIn} className="bg-library-gold hover:bg-library-gold/90 text-library-mahogany">*/}
            {/*      Sign In / Sign Up*/}
            {/*    </Button>*/}
            {/*  </div>*/}
            {/*)}*/}

            {/*<div className="grid md:grid-cols-2 gap-6">*/}
            {/*  /!* One-time Purchase *!/*/}
            {/*  <Card className="border-2 hover:border-library-gold/50 transition-colors flex flex-col">*/}
            {/*    <CardHeader>*/}
            {/*      <div className="flex items-center justify-between">*/}
            {/*        <BookOpen className="h-8 w-8 text-library-gold" />*/}
            {/*        <Badge variant="outline" className="border-library-gold text-library-gold">*/}
            {/*          One-Time*/}
            {/*        </Badge>*/}
            {/*      </div>*/}
            {/*      <CardTitle className="text-xl">Purchase This Book</CardTitle>*/}
            {/*      <div className="text-3xl font-bold text-library-gold">$9.99</div>*/}
            {/*    </CardHeader>*/}
            {/*    <CardContent className="flex flex-col flex-grow space-y-4">*/}
            {/*      <ul className="space-y-2 flex-grow">*/}
            {/*        <li className="flex items-center gap-2">*/}
            {/*          <Check className="h-4 w-4 text-green-500" />*/}
            {/*          <span className="text-sm">Lifetime access to {bookTitle}</span>*/}
            {/*        </li>*/}
            {/*        <li className="flex items-center gap-2">*/}
            {/*          <Check className="h-4 w-4 text-green-500" />*/}
            {/*          <span className="text-sm">Full audio experience</span>*/}
            {/*        </li>*/}
            {/*        <li className="flex items-center gap-2">*/}
            {/*          <Check className="h-4 w-4 text-green-500" />*/}
            {/*          <span className="text-sm">All interactive features</span>*/}
            {/*        </li>*/}
            {/*        <li className="flex items-center gap-2">*/}
            {/*          <Check className="h-4 w-4 text-green-500" />*/}
            {/*          <span className="text-sm">Download for offline reading</span>*/}
            {/*        </li>*/}
            {/*      </ul>*/}
            {/*      <Button*/}
            {/*        className="w-full bg-library-walnut hover:bg-library-gold hover:text-library-mahogany mt-auto"*/}
            {/*        onClick={() => handlePayment("one_time", bookSlug)}*/}
            {/*        disabled={!isUserLoggedIn || loading === "one_time"}*/}
            {/*      >*/}
            {/*        {loading === "one_time" ? <Zap className="h-4 w-4 mr-2 animate-spin" /> : <BookOpen className="h-4 w-4 mr-2" />}*/}
            {/*        Purchase Book*/}
            {/*      </Button>*/}
            {/*    </CardContent>*/}
            {/*  </Card>*/}

            {/*  /!* Subscription *!/*/}
            {/*  <Card className="border-2 border-library-gold relative flex flex-col">*/}
            {/*    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">*/}
            {/*      <Badge className="bg-library-gold text-library-mahogany px-4 py-1">*/}
            {/*        <Crown className="h-3 w-3 mr-1" />*/}
            {/*        BEST VALUE*/}
            {/*      </Badge>*/}
            {/*    </div>*/}
            {/*    <CardHeader>*/}
            {/*      <div className="flex items-center justify-between">*/}
            {/*        <Crown className="h-8 w-8 text-library-gold" />*/}
            {/*        <Badge className="bg-library-gold text-library-mahogany">Premium</Badge>*/}
            {/*      </div>*/}
            {/*      <CardTitle className="text-xl">Premium Subscription</CardTitle>*/}
            {/*      <div className="text-3xl font-bold text-library-gold">*/}
            {/*        $19.99<span className="text-base font-normal text-muted-foreground">/month</span>*/}
            {/*      </div>*/}
            {/*    </CardHeader>*/}
            {/*    <CardContent className="flex flex-col flex-grow space-y-4">*/}
            {/*      <ul className="space-y-2 flex-grow">*/}
            {/*        <li className="flex items-center gap-2">*/}
            {/*          <Check className="h-4 w-4 text-green-500" />*/}
            {/*          <span className="text-sm">Access to entire library</span>*/}
            {/*        </li>*/}
            {/*        <li className="flex items-center gap-2">*/}
            {/*          <Check className="h-4 w-4 text-green-500" />*/}
            {/*          <span className="text-sm">New releases every month</span>*/}
            {/*        </li>*/}
            {/*        <li className="flex items-center gap-2">*/}
            {/*          <Check className="h-4 w-4 text-green-500" />*/}
            {/*          <span className="text-sm">Early access to beta content</span>*/}
            {/*        </li>*/}
            {/*        <li className="flex items-center gap-2">*/}
            {/*          <Check className="h-4 w-4 text-green-500" />*/}
            {/*          <span className="text-sm">Priority customer support</span>*/}
            {/*        </li>*/}
            {/*        <li className="flex items-center gap-2">*/}
            {/*          <Check className="h-4 w-4 text-green-500" />*/}
            {/*          <span className="text-sm">Cancel anytime</span>*/}
            {/*        </li>*/}
            {/*      </ul>*/}
            {/*      <Button*/}
            {/*        className="w-full bg-library-gold hover:bg-library-gold/90 text-library-mahogany mt-auto"*/}
            {/*        onClick={() => handlePayment("subscription", bookSlug)}*/}
            {/*        disabled={!isUserLoggedIn || loading === "subscription"}*/}
            {/*      >*/}
            {/*        {loading === "subscription" ? <Zap className="h-4 w-4 mr-2 animate-spin" /> : <Crown className="h-4 w-4 mr-2" />}*/}
            {/*        Subscribe Now*/}
            {/*      </Button>*/}
            {/*    </CardContent>*/}
            {/*  </Card>*/}
            {/*</div>*/}

            {/*<div className="text-center text-sm text-muted-foreground">*/}
            {/*  <p>Secure payments powered by Stripe. Cancel subscription anytime.</p>*/}
            {/*</div>*/}
          </CardContent>
          <CardFooter>
            <p className="text-xs text-gray-500 w-full text-center">{t("freeAccess")}</p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default function Paywall(props: { bookSlug: string; bookTitle: string; onClose: () => void }) {
  const { authMod, paymentsMod } = useIntegrations();
  const [loading, setLoading] = useState<string | null>(null);

  if (!authMod || !paymentsMod) return null;

  const { ready, isSignedIn, openSignIn, userId, email } = authMod.useAuth();
  const { startCheckout } = paymentsMod;

  const handlePayment = async (type: PaymentType, slug: string) => {
    if (!isSignedIn) {
      openSignIn();
      return;
    }

    setLoading(type);
    try {
      await startCheckout(type, slug, userId ? { id: userId, email } : undefined);
    } catch (error) {
      console.error("Payment error:", error);
      alert("Payment setup failed. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  return <PaywallInner {...props} openSignIn={openSignIn} isUserLoggedIn={ready && isSignedIn} handlePayment={handlePayment} loading={loading} />;
}
