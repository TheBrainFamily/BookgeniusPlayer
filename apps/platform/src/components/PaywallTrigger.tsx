import React, { useState } from "react";
import { useIntegrations } from "@platform/integrations";
import Paywall from "./Paywall";
import { ClientOnly } from "vite-react-ssg";

interface PaywallTriggerProps {
  bookSlug: string;
  bookTitle: string;
  children: (props: {
    hasAccess: boolean;
    checkAccess: () => void;
    showPaywall: () => void;
  }) => React.ReactNode;
}

const PaywallTriggerInner: React.FC<PaywallTriggerProps> = ({ bookSlug, bookTitle, children }) => {
  const { authMod, paymentsMod } = useIntegrations();
  const [hasAccess, setHasAccess] = useState(false);
  const [showingPaywall, setShowingPaywall] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!authMod || !paymentsMod) {
    return (
      <>{children({ hasAccess: false, checkAccess: async () => false, showPaywall: () => {} })}</>
    );
  }

  const { userId } = authMod.useAuth();
  const { checkAccess } = paymentsMod;

  const checkAccessHandler = async () => {
    if (!userId) return false;

    setLoading(true);
    try {
      const accessGranted = await checkAccess(bookSlug, { id: userId });
      setHasAccess(accessGranted);
      return accessGranted;
    } catch (error) {
      console.error("Access check error:", error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const showPaywall = () => {
    setShowingPaywall(true);
  };

  return (
    <>
      {children({ hasAccess, checkAccess: checkAccessHandler, showPaywall })}

      {showingPaywall && (
        <Paywall
          bookSlug={bookSlug}
          bookTitle={bookTitle}
          onClose={() => setShowingPaywall(false)}
        />
      )}
    </>
  );
};

const PaywallTrigger: React.FC<PaywallTriggerProps> = ({ bookSlug, bookTitle, children }) => {
  const { authMod } = useIntegrations();
  const ready = authMod?.useAuth()?.ready ?? false;

  // Render nothing that touches auth until the provider is ready
  return (
    <ClientOnly>
      {() =>
        ready ? (
          <PaywallTriggerInner bookSlug={bookSlug} bookTitle={bookTitle}>
            {children}
          </PaywallTriggerInner>
        ) : (
          // Provide safe no-op callbacks until auth is ready
          <>
            {children({ hasAccess: false, checkAccess: async () => false, showPaywall: () => {} })}
          </>
        )
      }
    </ClientOnly>
  );
};

export default PaywallTrigger;
