import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@platform/components/ui/toaster";
import { Toaster as Sonner } from "@platform/components/ui/sonner";
import { TooltipProvider } from "@platform/components/ui/tooltip";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { RouteTransitionProvider } from "./providers/RouteTransitionProvider";
import { UniversalRouter } from "./UniversalRouter";
import { IntegrationsProvider, useIntegrations } from "@platform/integrations";
import GenreExploration from "./components/GenreExploration";
import BookExperience from "./components/BookExperience";
import PaymentSuccess from "./components/PaymentSuccess";
import AuthCallback from "@platform/pages/AuthCallback.tsx";

const queryClient = new QueryClient();

const LazyWrappedPlayerApp = lazy(() => import("./WrappedPlayerApp"));

const AppWithAuth = () => {
  const { authMod, ready } = useIntegrations();

  if (!ready || !authMod) {
    // Show nothing while modules are loading
    return null;
  }

  const { AuthProvider } = authMod;

  return (
    <AuthProvider>
      <RouteTransitionProvider defaultMinDurationMs={50}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/experience/:slug" element={<BookExperience />} />
          <Route path="/GenreExploration" element={<GenreExploration />} />
          <Route path="/payment-success" element={<PaymentSuccess />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
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
