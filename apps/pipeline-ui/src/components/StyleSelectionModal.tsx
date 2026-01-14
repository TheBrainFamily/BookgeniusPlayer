import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wand2, SkipForward } from "lucide-react";

interface StyleSelectionModalProps {
  onSubmit: (description: string | null) => void;
}

export function StyleSelectionModal({ onSubmit }: StyleSelectionModalProps) {
  const [description, setDescription] = useState("");

  const handleSubmit = () => {
    if (!description.trim()) return;
    onSubmit(description);
  };

  const handleSkip = () => {
    onSubmit(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
      <Card className="w-full max-w-lg border-primary/20 shadow-2xl bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/95">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            Customize Visual Style
          </CardTitle>
          <CardDescription>
            Describe the visual atmosphere for your book's illustrations. The AI will use this to
            generate backgrounds and characters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Dark gothic horror with muted colors, dramatic lighting, and Victorian architecture..."
              className="w-full min-h-[120px] p-3 rounded-md border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none text-sm placeholder:text-muted-foreground/70"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              If you skip, we'll automatically generate a style based on the book's content.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={handleSkip} className="gap-2">
              <SkipForward className="w-4 h-4" />
              Skip & Use Auto
            </Button>
            <Button onClick={handleSubmit} disabled={!description.trim()} className="gap-2">
              <Wand2 className="w-4 h-4" />
              Generate Style
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
