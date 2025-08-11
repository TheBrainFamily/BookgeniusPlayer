import Navigation from "@/components/Navigation";
import HeroSection from "@/components/HeroSection";
import BookCollection from "@/components/BookCollection";
import Footer from "@/components/Footer";

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
