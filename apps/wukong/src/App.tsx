import { Toaster } from "@wukong/components/ui/toaster";
import { Toaster as Sonner } from "@wukong/components/ui/sonner";
import { TooltipProvider } from "@wukong/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { lazy, Suspense } from "react";
import AuthComponentsWrapper from "@platform/pages/AuthComponentsWrapper";
import { IntegrationsProvider, useIntegrations } from "@platform/integrations";
import { RouteTransitionProvider } from "@platform/providers/RouteTransitionProvider";
import i18n from "@platform/i18n";

const queryClient = new QueryClient();

const LazyWrappedPlayerApp = lazy(() => import("@platform/WrappedPlayerApp"));

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
          <Toaster />
          <Sonner />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/sign-in" element={<AuthComponentsWrapper componentName="SignIn" useAuth={useAuth} fallbackComponent={NotFound} />} />
            <Route path="/sign-up" element={<AuthComponentsWrapper componentName="SignUp" useAuth={useAuth} fallbackComponent={NotFound} />} />
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
      <BrowserRouter>
        <IntegrationsProvider>
          <AppWithAuth />
        </IntegrationsProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);
export default App;
