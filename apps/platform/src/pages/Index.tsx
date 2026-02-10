import { useEffect, useState } from "react";
import Navigation from "@platform/components/Navigation";
import HeroSection from "@platform/components/HeroSection";
import HeroSectionClassic from "@platform/components/HeroSectionClassic";
import FeaturesSection from "@platform/components/FeaturesSection";
import ProductionsCarousel from "@platform/components/FeaturedBooks";
import FeaturedBooksClassic from "@platform/components/FeaturedBooksClassic";
import LibrarySection from "@platform/components/LibrarySection";
import Footer from "@platform/components/Footer";
import { useDevPerformanceMonitor } from "@platform/hooks/useDevPerformanceMonitor";
import BookCollection from "@platform/components/BookCollection";

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
      <Navigation searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <main className={`flex flex-col flex-1${!libraryLaunched ? " justify-center" : ""}`}>
        {!trimmedSearchQuery && (
          <>
            {libraryLaunched ? <HeroSection /> : <HeroSectionClassic />}
            {libraryLaunched ? <FeaturesSection /> : <FeaturedBooksClassic />}
          </>
        )}
        {libraryLaunched && <ProductionsCarousel />}
        {libraryLaunched && <LibrarySection searchQuery={trimmedSearchQuery} />}
        {!libraryLaunched && <BookCollection searchQuery={trimmedSearchQuery} />}
      </main>
      <Footer onSearchQuery={setSearchQuery} />
    </div>
  );
};

export default Index;
