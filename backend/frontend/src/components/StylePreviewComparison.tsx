import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Sparkles, User, Palette, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface StyleInfo {
  backgroundStyle: string;
  periodStyle: string;
  avatarStyle: string;
}

interface StylePreviewComparisonProps {
  slug: string;
  previews: { autoPreviewPath: string | null; userPreviewPath: string | null } | null;
  autoStyle: StyleInfo | null;
  userStyle: StyleInfo | null;
  remainingTimeMs: number;
  onChoose: (choice: "auto" | "user") => void;
}

export function StylePreviewComparison({ slug, previews, autoStyle, userStyle, remainingTimeMs, onChoose }: StylePreviewComparisonProps) {
  const [timeLeft, setTimeLeft] = useState(Math.max(0, Math.ceil(remainingTimeMs / 1000)));

  useEffect(() => {
    setTimeLeft(Math.max(0, Math.ceil(remainingTimeMs / 1000)));
  }, [remainingTimeMs]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  if (!previews) return null;

  const serverURL = "http://localhost:4000";

  const getPreviewUrl = (previewPath: string | null, styleType: "auto" | "user") => {
    if (!previewPath) return null;
    return `${serverURL}/preview/${slug}/${styleType}-preview-chapter-1.webp`;
  };

  const autoImageUrl = getPreviewUrl(previews.autoPreviewPath, "auto");
  const userImageUrl = getPreviewUrl(previews.userPreviewPath, "user");

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeString = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  const isLowTime = timeLeft <= 30;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in p-4 overflow-y-auto">
      <div className="w-full max-w-5xl space-y-6 my-auto">
        <div className="text-center space-y-2 text-white">
          <h2 className="text-3xl font-bold font-display tracking-tight">Choose Your Visual Style</h2>
          <p className="text-white/70 max-w-xl mx-auto">We've generated two options for your book. Select the one that best matches your vision.</p>
          {timeLeft > 0 && (
            <div
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mt-2",
                isLowTime ? "bg-red-500/20 text-red-300" : "bg-white/10 text-white/80",
              )}
            >
              <Clock className={cn("w-4 h-4", isLowTime && "animate-pulse")} />
              <span>
                Auto-select {userStyle ? "your custom style" : "in"}: {timeString}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {/* Auto Style Option */}
          <div className="group relative">
            <div className="absolute -inset-0.5 bg-gradient-to-b from-primary/20 to-transparent rounded-2xl opacity-50 blur group-hover:opacity-100 transition duration-500"></div>
            <Card className="relative h-full flex flex-col border-primary/20 overflow-hidden bg-card/90 backdrop-blur hover:border-primary/50 transition-all duration-300 transform hover:-translate-y-1">
              <div className="aspect-video w-full overflow-hidden bg-muted relative">
                {autoImageUrl ? (
                  <img src={autoImageUrl} alt="AI Generated Preview" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-secondary/20">No preview available</div>
                )}
                <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 border border-white/10">
                  <Sparkles className="w-3 h-3 text-primary" />
                  AI Generated
                </div>
              </div>

              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Content-Based Style</CardTitle>
                <CardDescription className="line-clamp-2">Automatically derived from the book's text and era</CardDescription>
              </CardHeader>

              <CardContent className="flex-1 space-y-4">
                {autoStyle && (
                  <div className="space-y-3 text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg border border-border/50">
                    <div className="flex gap-2 items-start">
                      <Palette className="w-4 h-4 shrink-0 mt-0.5 opacity-70" />
                      <span className="line-clamp-2">{autoStyle.backgroundStyle}</span>
                    </div>
                    <div className="flex gap-2 items-start">
                      <User className="w-4 h-4 shrink-0 mt-0.5 opacity-70" />
                      <span className="line-clamp-2">{autoStyle.avatarStyle}</span>
                    </div>
                  </div>
                )}

                <div className="pt-2 mt-auto">
                  <Button onClick={() => onChoose("auto")} className="w-full gap-2" size="lg" variant="outline">
                    <CheckCircle2 className="w-4 h-4" />
                    Select This Style
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* User Style Option */}
          {userStyle && userImageUrl ? (
            <div className="group relative">
              <div className="absolute -inset-0.5 bg-gradient-to-b from-purple-500/20 to-transparent rounded-2xl opacity-50 blur group-hover:opacity-100 transition duration-500"></div>
              <Card className="relative h-full flex flex-col border-purple-500/20 overflow-hidden bg-card/90 backdrop-blur hover:border-purple-500/50 transition-all duration-300 transform hover:-translate-y-1">
                <div className="aspect-video w-full overflow-hidden bg-muted relative">
                  <img src={userImageUrl} alt="Your Custom Style" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  <div className="absolute top-3 left-3 bg-purple-900/60 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 border border-white/10">
                    <User className="w-3 h-3 text-purple-300" />
                    Your Custom Style
                  </div>
                </div>

                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Customized Style</CardTitle>
                  <CardDescription className="line-clamp-2">Based on your description and preferences</CardDescription>
                </CardHeader>

                <CardContent className="flex-1 space-y-4">
                  <div className="space-y-3 text-sm text-muted-foreground bg-purple-500/5 p-3 rounded-lg border border-purple-500/10">
                    <div className="flex gap-2 items-start">
                      <Palette className="w-4 h-4 shrink-0 mt-0.5 text-purple-400" />
                      <span className="line-clamp-2">{userStyle.backgroundStyle}</span>
                    </div>
                    <div className="flex gap-2 items-start">
                      <User className="w-4 h-4 shrink-0 mt-0.5 text-purple-400" />
                      <span className="line-clamp-2">{userStyle.avatarStyle}</span>
                    </div>
                  </div>

                  <div className="pt-2 mt-auto">
                    <Button onClick={() => onChoose("user")} className="w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white" size="lg">
                      <CheckCircle2 className="w-4 h-4" />
                      Select This Style
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            // Fallback if no user style (e.g. skipped but somehow we are here, or just one option)
            <div className="flex items-center justify-center p-8 text-center text-muted-foreground border-2 border-dashed border-border/30 rounded-2xl">
              <div className="space-y-2">
                <p>No custom style provided.</p>
                <Button variant="ghost" onClick={() => onChoose("auto")}>
                  Proceed with Auto Style
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
