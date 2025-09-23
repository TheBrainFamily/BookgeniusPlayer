import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X } from "lucide-react";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AboutModal = ({ isOpen, onClose }: AboutModalProps) => {
  return (
    <>
      {/* Custom backdrop with blur - only show when modal is open */}
      {isOpen && <div className="fixed inset-0 bg-black/20 backdrop-blur-md z-50" onClick={onClose} />}

      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl bg-transparent border-none shadow-none p-0 [&>button]:hidden z-50">
          <div className="bg-background/95 backdrop-blur-sm border border-accent/20 rounded-lg p-8 relative">
            {/* Close Button */}
            <div className="absolute top-4 right-4">
              <button onClick={onClose} className="text-muted-foreground hover:text-accent transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Header */}
            <div className="mb-8 pt-2">
              <h2 className="text-3xl font-traditional font-bold text-accent text-center mb-4">About Wukong Chronicles</h2>
            </div>

            {/* Content */}
            <div className="space-y-6 text-lg text-muted-foreground leading-relaxed">
              <div>
                <h3 className="text-xl font-traditional font-semibold text-foreground mb-3">The Legend Reimagined</h3>
                <p>
                  Wukong Chronicles brings the timeless Chinese epic "Journey to the West" to life through stunning visual storytelling. Experience the legendary tale of Sun
                  Wukong, the Monkey King, as he embarks on an extraordinary journey filled with magic, adventure, and spiritual discovery.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-traditional font-semibold text-foreground mb-3">Visual Novel Experience</h3>
                <p>
                  Our visual novel format combines traditional Chinese music with modern compositions, perfectly timed to reflect the mood as action unfolds and scenery changes.
                  Animated avatars bring each character to life, creating an immersive new generation book experience that bridges ancient storytelling with contemporary
                  engagement.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-traditional font-semibold text-foreground mb-3">Cultural Heritage</h3>
                <p>
                  Wukong Chronicles honors "Journey to the West," one of China's Four Great Classical Novels, written by Wu Cheng'en in the 16th century. The story draws
                  inspiration from the historical pilgrimage of Buddhist monk Xuanzang to India in the 7th century to retrieve sacred scriptures. This legendary tale, rich with
                  mythology, demons, spirits, and divine adventures, has profoundly influenced Chinese culture and inspired countless adaptations worldwide, including modern anime
                  and manga series, movies and games.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-traditional font-semibold text-foreground mb-3">Intelligent Research & Discovery</h3>
                <p>
                  Explore deeper with our spoiler-free search that considers your reading progress, ensuring discoveries remain unspoiled. Ask our AI assistant about characters,
                  locations, or cultural elements using voice or text - it provides comprehensive context from the entire known universe of Journey to the West, enriching your
                  understanding without revealing future plot points.
                </p>
              </div>

              <div className="pt-4 border-t border-border/50">
                <p className="text-center text-accent font-traditional">"The journey of a thousand miles begins with a single step" - Lao Tzu</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AboutModal;
