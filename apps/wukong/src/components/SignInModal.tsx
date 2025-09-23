import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X } from "lucide-react";

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SignInModal = ({ isOpen, onClose }: SignInModalProps) => {
  return (
    <>
      {/* Custom backdrop with blur - only show when modal is open */}
      {isOpen && <div className="fixed inset-0 bg-black/20 backdrop-blur-md z-50" onClick={onClose} />}

      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md bg-transparent border-none shadow-none p-0 [&>button]:hidden z-50">
          <div className="bg-background/95 backdrop-blur-sm border border-accent/20 rounded-lg p-8 relative">
            {/* Close Button */}
            <div className="absolute top-4 right-4">
              <button onClick={onClose} className="text-muted-foreground hover:text-accent transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Content */}
            <div className="text-center space-y-6">
              <h2 className="text-2xl font-traditional font-bold text-accent">Coming soon...</h2>

              <p className="text-lg text-muted-foreground">Enjoy first season for free</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SignInModal;
