import { startTransition, useState } from "react";
import Header from "@wukong/components/Header";
import Hero from "@wukong/components/Hero";
import EpisodeCard from "@wukong/components/EpisodeCard";
import CharacterAvatar from "@wukong/components/CharacterAvatar";
import AboutModal from "@wukong/components/AboutModal";
import ContactModal from "@wukong/components/ContactModal";
import { Button } from "@wukong/components/ui/button";
import { useRouteTransition } from "@platform/providers/RouteTransitionProvider";
import { useNavigate } from "react-router-dom";

// Import assets
import episode1 from "@wukong/assets/episode-1.png";
import episode2 from "@wukong/assets/episode-2.png";
import episode3 from "@wukong/assets/episode-3.png";
import episode4 from "@wukong/assets/episode-4.png";
import wukongAvatar from "@wukong/assets/wukong-avatar.png";
import tangAvatar from "@wukong/assets/tang-avatar.png";
import pigAvatar from "@wukong/assets/pig-avatar.png";

const WukongLanding = () => {
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const featuredEpisodes = [
    {
      title: "The Stone Monkey Awakens",
      description:
        "Witness the legendary birth of Sun Wukong from the mystical stone on Flower Fruit Mountain. Experience his first steps into a world of magic and destiny as he discovers his extraordinary powers.",
      thumbnail: episode1,
      duration: "120 min",
      rating: 4.9,
      year: "2025",
      tags: ["Origin", "Mystical"],
      featured: true,
    },
    {
      title: "A Place in Heavens",
      description: "The Great White Star leads Wukong to the Heavenly Palace where he discovers his destiny among the celestial realm.",
      thumbnail: episode2,
      duration: "65 min",
      rating: 4.8,
      year: "2025",
      tags: ["Heaven"],
      comingSoon: true,
    },
    {
      title: "The Furnace of Heaven",
      description:
        "The celestial realm exhausts all methods to contain the defiant Monkey King, culminating in a legendary confrontation that tests the very limits of power and wisdom.",
      thumbnail: episode3,
      duration: "85 min",
      rating: 4.9,
      year: "2025",
      tags: ["Legendary", "Epic"],
      comingSoon: true,
    },
    {
      title: "And More to Come...",
      description:
        "The epic journey continues with more legendary tales from the Journey to the West. New episodes featuring stunning animation and immersive storytelling coming soon.",
      thumbnail: episode4,
      duration: "TBA",
      rating: 0,
      year: "2025",
      tags: ["Coming Soon"],
      comingSoon: true,
      placeholder: true,
    },
  ];

  const allEpisodes = [
    {
      title: "Journey Begins",
      description:
        "Witness the legendary birth of Sun Wukong from the mystical stone on Flower Fruit Mountain. Experience his first steps into a world of magic and destiny as he discovers his extraordinary powers.",
      thumbnail: episode1,
      duration: "120 min",
      rating: 4.7,
      year: "2025",
      tags: ["Origin", "Mystical"],
    },
    {
      title: "A Place in Heavens",
      description: "The Great White Star leads Wukong to the Heavenly Palace where he discovers his destiny among the celestial realm.",
      thumbnail: episode2,
      duration: "TBA",
      rating: 4.8,
      year: "Oct 2025",
      tags: ["Heaven"],
      comingSoon: true,
    },
    {
      title: "The Furnace of Heaven",
      description:
        "The celestial realm exhausts all methods to contain the defiant Monkey King, culminating in a legendary confrontation that tests the very limits of power and wisdom.",
      thumbnail: episode3,
      duration: "TBA",
      rating: 4.9,
      year: "Nov 2025",
      tags: ["Legendary", "Epic"],
      comingSoon: true,
    },
    {
      title: "And More to Come...",
      description:
        "The epic journey continues with more legendary tales from the Journey to the West. New episodes featuring stunning animation and immersive storytelling coming soon.",
      thumbnail: episode4,
      duration: "TBA",
      rating: 0,
      year: "2025/2026",
      tags: ["Coming Soon"],
      comingSoon: true,
      placeholder: true,
    },
  ];

  const characters = [
    {
      name: "Sun Wukong",
      image: wukongAvatar,
      title: "The Monkey King",
      description:
        "A clever and powerful monkey born from stone, known for his mischievous spirit and extraordinary abilities. The legendary hero at the heart of the Journey to the West.",
    },
    {
      name: "Tang Sanzang",
      image: tangAvatar,
      title: "Buddhist Monk",
      description:
        "A handsome, dignified Buddhist monk from the Tang Dynasty, also known as Xuanzang or Tripitaka. He is a learned scholar of Buddhist scriptures with a noble appearance and spiritual wisdom.",
    },
    {
      name: "Zhu Bajie",
      image: pigAvatar,
      title: "The Pig Spirit",
      description:
        "A pig-headed humanoid character, also known as Pigsy or Zhu Wuneng. Despite his unusual appearance with a long snout and large ears, he has a kind heart and can be loyal, though he sometimes shows traits of being lazy, gluttonous, and boastful.",
    },
  ];
  const navigate = useNavigate();

  const { startTransition, setNavigatedFromPlatform } = useRouteTransition();

  const handleBookClick = () => {
    const book = {
      title: "Wukong",
      slug: "Wukong",
      metadata: {
        en: {
          phrases: [
            "Waking up the Monkey",
            "Calling the Dragon King",
            "Furnishing the Furnace of Heaven",
            "Training the monkeys...",
            "Traveling through the sky...",
            "Encountering demons...",
            "Discovering treasures...",
            "Learning new skills...",
          ],
        },
      },
      author: "Sun Wukong",
    };
    const title = book?.title ?? "BookGenius";
    const phrases = book?.metadata.en.phrases;
    const author = book?.author;

    // Indicate user came from platform for proper loader behavior
    setNavigatedFromPlatform(true);
    // Start the transition overlay with book-specific meta
    startTransition({ title, phrases, author, showStartButton: false, onStartClick: undefined });

    // Let the overlay paint before route switch for a smooth fade
    requestAnimationFrame(() => {
      navigate(`/reader?book=${book.slug}`, { state: { meta: { title, phrases, author } } });
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Hero />

      {/* Historical Lineage */}
      <section className="py-16 px-4 bg-gradient-to-r from-accent/5 via-background to-accent/5">
        <div className="container mx-auto text-center">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-traditional font-semibold text-foreground mb-6">A Journey Through Time</h2>
            <div className="bg-card/50 backdrop-blur-sm rounded-xl p-8 border border-border/30 shadow-lg">
              <div className="flex flex-col md:flex-row items-center justify-center space-y-4 md:space-y-0 md:space-x-8">
                <div className="text-center">
                  <div className="text-lg font-semibold text-foreground">Xuanzang</div>
                  <div className="text-sm text-muted-foreground">596-664 AD</div>
                  <div className="text-xs text-accent/80 mt-1">Historical Journey</div>
                </div>
                <div className="text-2xl text-accent font-bold">→</div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-foreground">Wu Cheng</div>
                  <div className="text-sm text-muted-foreground">1592 AD</div>
                  <div className="text-xs text-accent/80 mt-1">Literary Masterpiece</div>
                </div>
                <div className="text-2xl text-accent font-bold">→</div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-accent">BookGenius</div>
                  <div className="text-sm text-muted-foreground">2025 AD</div>
                  <div className="text-xs text-accent/80 mt-1">Digital Renaissance</div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-6 max-w-2xl mx-auto">
                From the ancient Buddhist monk's real pilgrimage to Wu Cheng's immortal literary work, now reimagined for the digital age through stunning animation and immersive
                storytelling.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Episodes */}
      <section className="py-20 px-4" id="featured-episodes">
        <div className="container mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-traditional font-bold text-foreground">
              Featured <span className="text-accent">Masterpieces</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Step into the world of visual novels with a stylish modern design and atmospheric soundtracks — where every story becomes a unique experience that brings reading back
              to life. Discover the remastered 7th-century Chinese legend of Wukong, reimagined for a new generation.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
            {featuredEpisodes.map((episode, index) => (
              <EpisodeCard key={index} {...episode} onClick={index === 0 ? handleBookClick : undefined} />
            ))}
          </div>
        </div>
      </section>

      {/* Characters Section */}
      <section className="py-20 px-4 bg-card/30">
        <div className="container mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-traditional font-bold text-foreground">
              Meet the <span className="text-accent">Legends</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Journey alongside iconic characters brought to life through stunning animation and masterful storytelling in the epic Journey to the West.
            </p>
          </div>

          <div className="flex justify-center space-x-12 md:space-x-20">
            {characters.map((character, index) => (
              <CharacterAvatar key={index} {...character} size="lg" />
            ))}
          </div>
        </div>
      </section>

      {/* All Episodes Collection */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-traditional font-bold text-foreground">
              Our <span className="text-accent">Collection</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Each visual episode is a complete production featuring professional voice acting, animated scenes, and immersive soundtracks that bring literature to life.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-12">
            {allEpisodes.map((episode, index) => (
              <EpisodeCard key={index} {...episode} onClick={index === 0 ? handleBookClick : undefined} />
            ))}
          </div>

          {/* <div className="text-center">
            <Button variant="golden" size="lg" className="text-lg px-8 py-4 h-auto">
              View Complete Collection
            </Button>
          </div> */}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-4 bg-card/50 border-t border-border/50">
        <div className="container mx-auto text-center space-y-6">
          <h3 className="text-2xl font-traditional font-semibold text-accent">Wukong Chronicles</h3>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Experience the timeless tale of the Monkey King through stunning animation, immersive audio, and masterful storytelling that honors the legendary Journey to the West.
          </p>

          <div className="flex justify-center space-x-8 text-sm text-muted-foreground">
            <button onClick={() => setIsAboutModalOpen(true)} className="hover:text-accent transition-colors cursor-pointer">
              About
            </button>
            <button onClick={() => setIsContactModalOpen(true)} className="hover:text-accent transition-colors cursor-pointer">
              Contact
            </button>
          </div>
          <div className="pt-8 border-t border-border/30">
            <p className="text-sm text-muted-foreground">© 2025 Wukong Chronicles. Bringing legendary tales to life.</p>
          </div>
        </div>
      </footer>

      <AboutModal isOpen={isAboutModalOpen} onClose={() => setIsAboutModalOpen(false)} />

      <ContactModal isOpen={isContactModalOpen} onClose={() => setIsContactModalOpen(false)} />
    </div>
  );
};

export default WukongLanding;
