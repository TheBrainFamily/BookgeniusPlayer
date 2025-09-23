import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X, Mail, Phone, MapPin } from "lucide-react";

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ContactModal = ({ isOpen, onClose }: ContactModalProps) => {
  return (
    <>
      {/* Custom backdrop with blur - only show when modal is open */}
      {isOpen && <div className="fixed inset-0 bg-black/20 backdrop-blur-md z-50" onClick={onClose} />}

      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl bg-transparent border-none shadow-none p-0 [&>button]:hidden z-50">
          <div className="bg-background/95 backdrop-blur-sm border border-accent/20 rounded-lg p-8 relative">
            {/* Close Button */}
            <div className="absolute top-4 right-4">
              <button onClick={onClose} className="text-muted-foreground hover:text-accent transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Header */}
            <div className="mb-8 pt-2">
              <h2 className="text-3xl font-traditional font-bold text-accent text-center mb-4">Contact</h2>
            </div>

            {/* Contact Information */}
            <div className="space-y-6">
              <div className="flex items-center space-x-4 text-lg text-muted-foreground">
                <Mail className="h-6 w-6 text-accent flex-shrink-0" />
                <span>support@bookgenius.net</span>
              </div>

              <div className="flex items-center space-x-4 text-lg text-muted-foreground">
                <MapPin className="h-6 w-6 text-accent flex-shrink-0" />
                <span>Digital Realm</span>
              </div>
            </div>

            {/* Footer note */}
            <div className="pt-6 mt-8 border-t border-border/50">
              <p className="text-center text-sm text-muted-foreground">We'll be adding more contact options soon. For now, reach out to us via email!</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ContactModal;
