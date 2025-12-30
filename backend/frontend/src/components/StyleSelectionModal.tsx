import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Wand2, ArrowRight, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";

interface StyleSelectionModalProps {
  remainingTimeMs: number;
  onSubmit: (description: string | null) => void;
}

export function StyleSelectionModal({ remainingTimeMs, onSubmit }: StyleSelectionModalProps) {
  const [description, setDescription] = useState("");
  const [timeLeft, setTimeLeft] = useState(Math.max(0, Math.ceil(remainingTimeMs / 1000)));

  useEffect(() => {
    setTimeLeft(Math.max(0, Math.ceil(remainingTimeMs / 1000)));
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [remainingTimeMs]);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

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
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-primary" />
              Customize Visual Style
            </CardTitle>
            <div
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-colors",
                timeLeft < 30 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{formatTime(timeLeft)}</span>
            </div>
          </div>
          <CardDescription>Describe the visual atmosphere for your book's illustrations. The AI will use this to generate backgrounds and characters.</CardDescription>
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
            <p className="text-xs text-muted-foreground">If you skip or run out of time, we'll automatically generate a style based on the book's content.</p>
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
