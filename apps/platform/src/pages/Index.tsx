import Navigation from "@platform/components/Navigation";
import HeroSection from "@platform/components/HeroSection";
import BookCollection from "@platform/components/BookCollection";
import Footer from "@platform/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <HeroSection />
      <BookCollection />
      <Footer />
    </div>
  );
};

export default Index;
