import {
  ArrowLeft,
  Play,
  Volume2,
  Star,
  Clock,
  Calendar,
  Globe,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { Button } from "@platform/components/ui/button";
import { Card, CardContent } from "@platform/components/ui/card";
import { Badge } from "@platform/components/ui/badge";
import { books } from "@platform/books";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { detectLanguageFromDomain } from "@/utils/languageDetection";

const BookExperience = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const book = books.find((b) => b.slug === slug);

  useEffect(() => {
    if (!book) {
      navigate("/");
    }
  }, [book, navigate]);

  if (!book) {
    return null;
  }

  const onBack = () => {
    navigate("/");
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-library-mahogany/5 to-background">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-library-walnut">
        <div className="container mx-auto px-4 py-4">
          <Button
            variant="ghost"
            onClick={onBack}
            className="text-library-gold hover:text-library-gold-glow hover:bg-library-walnut/20 mb-2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Collection
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
            {/* Left Column - Video */}
            <div className="space-y-6">
              <div className="relative rounded-xl overflow-hidden shadow-2xl group hover:shadow-library-gold/20 transition-all duration-300">
                <video
                  className="w-full h-auto"
                  autoPlay
                  loop
                  muted
                  playsInline
                  poster={book.poster}
                >
                  <source src={book.video} type="video/mp4" />
                </video>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                  <Play className="h-16 w-16 text-white/80 drop-shadow-lg" />
                </div>
                <Badge className="absolute top-4 right-4 bg-library-gold/90 text-library-mahogany">
                  {book.metadata[detectLanguageFromDomain()]?.genre}
                </Badge>
                {book.language === "pl" && (
                  <div className="absolute top-4 left-4">
                    <svg
                      width="32"
                      height="24"
                      viewBox="0 0 24 16"
                      className="shadow-md rounded"
                      aria-label="Polish language"
                    >
                      <rect width="24" height="8" fill="#ffffff" />
                      <rect y="8" width="24" height="8" fill="#dc143c" />
                    </svg>
                  </div>
                )}
              </div>

              <Button
                size="lg"
                className="w-full bg-library-walnut hover:bg-library-gold hover:text-library-mahogany transition-all duration-300 text-lg py-6"
                onClick={() => navigate(`/reader/?book=${book.slug}`)}
              >
                <Play className="mr-2 h-5 w-5" />
                Start Reading Experience
              </Button>
            </div>

            {/* Right Column - Book Info */}
            <div className="space-y-6">
              <div>
                <h1 className="text-4xl lg:text-5xl font-serif text-foreground mb-3">
                  {book.title}
                </h1>
                <p className="text-2xl text-library-gold font-medium mb-6">{book.author}</p>

                <div className="flex flex-wrap gap-3 mb-6">
                  <div className="flex items-center gap-1">
                    <Star className="h-5 w-5 text-library-gold fill-current" />
                    <span className="text-lg font-semibold">{book.rating}</span>
                    <span className="text-muted-foreground">(Rated)</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-5 w-5" />
                    <span>{book.readTime}</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-5 w-5" />
                    <span>{book.year}</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Globe className="h-5 w-5" />
                    <span>{book.language === "pl" ? "Polish" : "English"}</span>
                  </div>
                </div>

                <p className="text-lg text-muted-foreground leading-relaxed mb-8">
                  {book.metadata[detectLanguageFromDomain()]?.description}
                </p>

                {/* Features */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-library-gold" />
                    Features
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {book.metadata[detectLanguageFromDomain()]?.features?.map((feature, index) => (
                      <Badge
                        key={index}
                        variant="outline"
                        className="border-library-walnut text-foreground px-3 py-1"
                      >
                        {feature}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* About Section */}
          <Card className="bg-card/80 backdrop-blur-sm border-library-walnut mb-12">
            <CardContent className="p-8">
              <h2 className="text-3xl font-serif text-foreground mb-6">About This Visual Novel</h2>
              <div className="prose prose-lg max-w-none text-muted-foreground">
                <p className="mb-4">
                  Experience "{book.title}" like never before in our revolutionary visual novel
                  format. This classic work by {book.author} has been transformed into an immersive
                  multimedia experience featuring professional voice acting, stunning visuals, and
                  an atmospheric soundtrack.
                </p>
                <p className="mb-4">
                  Originally published in {book.year}, this{" "}
                  {book.metadata[detectLanguageFromDomain()]?.genre?.toLowerCase()} masterpiece
                  continues to captivate readers worldwide. Our adaptation brings new life to the
                  story through carefully crafted animations and sound design that enhance the
                  narrative without compromising the original text's integrity.
                </p>
                <p>
                  Perfect for both first-time readers and longtime fans, this visual novel offers
                  approximately
                  {book.readTime} of engaging content with customizable reading speeds and audio
                  settings to suit your preferences.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Why Visual Novels Section */}
          <Card className="bg-card/80 backdrop-blur-sm border-library-walnut">
            <CardContent className="p-8">
              <h2 className="text-3xl font-serif text-foreground mb-8 text-center">
                Why Choose <span className="text-library-gold">Visual Novels</span>?
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="text-center space-y-3">
                  <div className="w-20 h-20 mx-auto bg-library-gold/10 rounded-full flex items-center justify-center">
                    <BookOpen className="h-10 w-10 text-library-gold" />
                  </div>
                  <h3 className="text-xl font-serif text-foreground">Immersive Reading</h3>
                  <p className="text-muted-foreground">
                    Combines the best of books and cinema for a uniquely engaging experience
                  </p>
                </div>

                <div className="text-center space-y-3">
                  <div className="w-20 h-20 mx-auto bg-library-gold/10 rounded-full flex items-center justify-center">
                    <Volume2 className="h-10 w-10 text-library-gold" />
                  </div>
                  <h3 className="text-xl font-serif text-foreground">Professional Audio</h3>
                  <p className="text-muted-foreground">
                    Voice acting and sound effects bring characters and scenes to life
                  </p>
                </div>

                <div className="text-center space-y-3">
                  <div className="w-20 h-20 mx-auto bg-library-gold/10 rounded-full flex items-center justify-center">
                    <Sparkles className="h-10 w-10 text-library-gold" />
                  </div>
                  <h3 className="text-xl font-serif text-foreground">Visual Enhancement</h3>
                  <p className="text-muted-foreground">
                    Stunning animations and artwork complement the narrative
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default BookExperience;
