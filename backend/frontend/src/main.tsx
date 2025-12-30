import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./ui/App";
import { CollectionsPage } from "./pages/CollectionsPage";
import "./index.css";

const queryClient = new QueryClient();

function Layout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route
            path="/collections"
            element={
              <Layout>
                <main className="py-8">
                  <CollectionsPage />
                </main>
              </Layout>
            }
          />
          <Route
            path="/collections/:slug"
            element={
              <Layout>
                <main className="py-8 px-4 md:px-8 xl:px-48">
                  <CollectionsPage />
                </main>
              </Layout>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
