import React, { createContext, useContext, useEffect, useState } from "react";
import type { AuthModule } from "./auth/types";
import type { PaymentsModule } from "./payments/types";

interface IntegrationsContextType {
  authMod: AuthModule | null;
  paymentsMod: PaymentsModule | null;
  ready: boolean;
}

const IntegrationsContext = createContext<IntegrationsContextType>({ authMod: null, paymentsMod: null, ready: false });

export const useIntegrations = () => useContext(IntegrationsContext);

export const IntegrationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authMod, setAuthMod] = useState<AuthModule | null>(null);
  const [paymentsMod, setPaymentsMod] = useState<PaymentsModule | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loadModules = async () => {
      const AUTH = import.meta.env.VITE_AUTH_PROVIDER ?? "default";
      const PAY = import.meta.env.VITE_PAYMENTS_PROVIDER ?? "default";

      try {
        const [authModule, paymentsModule] = await Promise.all([
          AUTH === "clerk" ? import("./auth/clerk") : import("./auth/default"),
          PAY === "supabase" ? import("./payments/supabase") : import("./payments/default"),
        ]);

        setAuthMod(authModule.default);
        setPaymentsMod(paymentsModule.default);
        setReady(true);
      } catch (error) {
        console.error("Failed to load integrations:", error);
        // Load defaults as fallback
        const [defaultAuth, defaultPayments] = await Promise.all([import("./auth/default"), import("./payments/default")]);
        setAuthMod(defaultAuth.default);
        setPaymentsMod(defaultPayments.default);
        setReady(true);
      }
    };

    // Only load on client side
    if (!import.meta.env.SSR) {
      loadModules();
    } else {
      // For SSR, we'll use defaults
      import("./auth/default").then((m) => {
        setAuthMod(m.default);
        import("./payments/default").then((p) => {
          setPaymentsMod(p.default);
          setReady(true);
        });
      });
    }
  }, []);

  return <IntegrationsContext.Provider value={{ authMod, paymentsMod, ready }}>{children}</IntegrationsContext.Provider>;
};
