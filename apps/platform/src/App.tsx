import { Toaster } from "@platform/components/ui/toaster";
import { Toaster as Sonner } from "@platform/components/ui/sonner";
import { TooltipProvider } from "@platform/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { ClerkProvider } from "@clerk/react-router";
import { RouteTransitionProvider } from "./providers/RouteTransitionProvider";
import { WrappedApp } from "./WrappedApp";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Add your Clerk Publishable Key to the .env file");
}

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
          <RouteTransitionProvider defaultMinDurationMs={50}>
            <Routes>
              <Route path="/" element={<Index />} />
              {/* <Route path="/reader/:slug" element={<ReaderPage />} /> */}
              <Route path="/reader/" element={<WrappedApp />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </RouteTransitionProvider>
        </ClerkProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
