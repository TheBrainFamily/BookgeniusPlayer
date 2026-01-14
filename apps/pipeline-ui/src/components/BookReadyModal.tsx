import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ExternalLink, X } from "lucide-react";

interface BookReadyModalProps {
  slug: string;
  onClose: () => void;
}

export function BookReadyModal({ slug, onClose }: BookReadyModalProps) {
  const readerUrl = `https://convexcms.branches.bookgeniusz.pl/reader?book=${slug}`;

  const handleOpenReader = () => {
    window.open(readerUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
      <Card className="w-full max-w-md border-success/30 shadow-2xl bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/95">
        <CardHeader className="pb-4 relative">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1 rounded-md hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center animate-scale-in">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <CardTitle className="text-2xl">Your Book is Ready!</CardTitle>
          </div>
          <CardDescription className="text-center pt-2">
            Your book has been successfully processed and is now available to read.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleOpenReader} className="w-full gap-2" size="lg">
            <ExternalLink className="w-4 h-4" />
            Open in Reader
          </Button>
          <p className="text-xs text-center text-muted-foreground">Opens in a new tab</p>
        </CardContent>
      </Card>
    </div>
  );
}
