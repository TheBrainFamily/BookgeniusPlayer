import { useEffect, useState } from "react";
import Navigation from "@platform/components/Navigation";
import HeroSection from "@platform/components/HeroSection";
import BookCollection from "@platform/components/BookCollection";
import Footer from "@platform/components/Footer";

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <main className="flex-1">
        {!searchQuery && <HeroSection />}
        <BookCollection searchQuery={searchQuery} />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
