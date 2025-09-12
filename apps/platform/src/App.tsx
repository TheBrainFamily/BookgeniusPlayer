import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@platform/components/ui/toaster";
import { Toaster as Sonner } from "@platform/components/ui/sonner";
import { TooltipProvider } from "@platform/components/ui/tooltip";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import AuthComponentsWrapper from "./pages/AuthComponentsWrapper";
import { RouteTransitionProvider } from "./providers/RouteTransitionProvider";
import { UniversalRouter } from "./UniversalRouter";
import { IntegrationsProvider, useIntegrations } from "@platform/integrations";
import GenreExploration from "./components/GenreExploration";
import BookExperience from "./components/BookExperience";
import PaymentSuccess from "./components/PaymentSuccess";
import AuthCallback from "@platform/pages/AuthCallback.tsx";
import { I18nextProvider } from "react-i18next";
import i18n from "@platform/i18n";

const queryClient = new QueryClient();

const LazyWrappedPlayerApp = lazy(() => import("./WrappedPlayerApp"));

const AppWithAuth = () => {
  const { authMod, ready } = useIntegrations();

  if (!ready || !authMod) {
    // Show nothing while modules are loading
    return null;
  }

  const { AuthProvider, useAuth } = authMod;

  return (
    <AuthProvider>
      <I18nextProvider i18n={i18n}>
        <RouteTransitionProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/experience/:slug" element={<BookExperience />} />
            <Route path="/GenreExploration" element={<GenreExploration />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route
              path="/sign-in"
              element={ <AuthComponentsWrapper componentName="SignIn" useAuth={useAuth} fallbackComponent={NotFound} /> }
            />
            <Route
              path="/sign-up"
              element={ <AuthComponentsWrapper componentName="SignUp" useAuth={useAuth} fallbackComponent={NotFound} /> }
            />
            <Route
              path="/reader/"
              element={
                <Suspense fallback={null}>
                  <LazyWrappedPlayerApp />
                </Suspense>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </RouteTransitionProvider>
      </I18nextProvider>
    </AuthProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <UniversalRouter>
        <IntegrationsProvider>
          <AppWithAuth />
        </IntegrationsProvider>
      </UniversalRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
