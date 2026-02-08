import { useEffect, useState } from "react";
import Navigation from "@platform/components/Navigation";
import HeroSection from "@platform/components/HeroSection";
import FeaturesSection from "@platform/components/FeaturesSection";
import ProductionsCarousel from "@platform/components/FeaturedBooks";
import LibrarySection from "@platform/components/LibrarySection";
import Footer from "@platform/components/Footer";
import { useDevPerformanceMonitor } from "@platform/hooks/useDevPerformanceMonitor";

const libraryLaunched = !!import.meta.env.VITE_LIBRARY_LAUNCHED;

const Index = () => {
  useDevPerformanceMonitor("home");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    // idle prefetch, client-only
    const prefetch = () => import("../player/PlayerRoot").catch(() => {});
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(prefetch, { timeout: 800 });
    } else {
      setTimeout(prefetch, 500);
    }
  }, []);

  const trimmedSearchQuery = searchQuery.trim();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation
        searchQuery={libraryLaunched ? searchQuery : ""}
        onSearchChange={libraryLaunched ? setSearchQuery : undefined}
      />
      <main className="flex flex-col flex-1">
        {!trimmedSearchQuery && (
          <>
            <HeroSection />
            <FeaturesSection />
          </>
        )}
        <ProductionsCarousel />
        {libraryLaunched && <LibrarySection searchQuery={trimmedSearchQuery} />}
      </main>
      <Footer onSearchQuery={libraryLaunched ? setSearchQuery : undefined} />
    </div>
  );
};

export default Index;
