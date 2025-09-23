import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X } from "lucide-react";

interface CharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  image: string;
  title?: string;
  description: string;
}

const CharacterModal = ({ isOpen, onClose, name, image, title, description }: CharacterModalProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl bg-transparent border-none shadow-none p-0 [&>button]:hidden backdrop-blur-md">
        <div className="flex flex-col md:flex-row items-center">
          {/* Left Column - Avatar */}
          <div className="flex-shrink-0">
            <div className="w-48 h-48 md:w-64 md:h-64 rounded-full overflow-hidden border-4 border-accent/30 shadow-2xl">
              <img src={image} alt={name} className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Right Column - Content with Border Background */}
          <div className="flex-1 bg-background/95 backdrop-blur-sm border border-accent/20 rounded-lg p-6 ml-0 md:ml-8 mt-4 md:mt-0 relative">
            {/* Close Button */}
            <div className="absolute top-4 right-4">
              <button onClick={onClose} className="text-muted-foreground hover:text-accent transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* First Row - Name (centered vertically with close button) */}
            <div className="mb-4 pt-2 text-center">
              <h2 className="text-2xl font-traditional font-bold text-accent">{name}</h2>
            </div>

            {/* Second Row - Description */}
            <div>
              <p className="text-muted-foreground leading-relaxed text-lg text-center">{description}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CharacterModal;
