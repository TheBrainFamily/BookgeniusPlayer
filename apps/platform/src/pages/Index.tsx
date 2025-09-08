import { useEffect, useState } from "react";
import Navigation from "@platform/components/Navigation";
import HeroSection from "@platform/components/HeroSection";
import BookCollection from "@platform/components/BookCollection";
import Footer from "@platform/components/Footer";
import FeaturedBooks from "@platform/components/FeaturedBooks";

const Index = () => {
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
      <main className="flex flex-col flex-1 justify-center">
        {!trimmedSearchQuery && (
          <>
            <HeroSection />
            <FeaturedBooks />
          </>
        )}
        <BookCollection searchQuery={trimmedSearchQuery} />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
