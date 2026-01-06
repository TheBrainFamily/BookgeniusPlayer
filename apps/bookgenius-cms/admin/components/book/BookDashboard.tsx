"use client";

/**
 * BookDashboard - Overview of a book's content
 *
 * Shows:
 * - Book metadata (title, author, language, visual style)
 * - Stats (character count, chapter count, etc.)
 * - Quick links to sections
 *
 * This component is Convex-free - it uses the BookProvider context.
 */

import { useBook, useBookStats } from "@/lib/contexts";
import { isBookFolder, type BookFolderExtra } from "@/lib/types/book";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BookOpen,
  Users,
  FileText,
  Film,
  Music,
  ArrowRight,
  Sparkles,
  Globe,
  Loader2,
} from "lucide-react";

interface BookDashboardProps {
  onNavigate: (path: string) => void;
}

export function BookDashboard({ onNavigate }: BookDashboardProps) {
  const { bookPath, metadata, isLoading } = useBook();
  const { stats } = useBookStats();

  if (isLoading) {
    return <BookDashboardSkeleton />;
  }

  if (!metadata) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Book not found</p>
      </div>
    );
  }

  // Extract typed metadata
  const extra = isBookFolder(metadata.extra) ? (metadata.extra as BookFolderExtra) : null;

  const sections = [
    {
      id: "characters",
      label: "Characters",
      icon: Users,
      count: stats?.characterCount ?? 0,
      path: `${bookPath}/characters`,
      description: "Character avatars and animations",
    },
    {
      id: "chapters",
      label: "Chapters",
      icon: FileText,
      count: stats?.chapterCount ?? 0,
      path: `${bookPath}/chapters`,
      description: "Story content and dialogue",
    },
    {
      id: "backgrounds",
      label: "Backgrounds",
      icon: Film,
      count: stats?.backgroundCount ?? 0,
      path: `${bookPath}/backgrounds`,
      description: "Scene backgrounds and videos",
    },
    {
      id: "music",
      label: "Music",
      icon: Music,
      count: stats?.musicCount ?? 0,
      path: `${bookPath}/music`,
      description: "Background music and sound",
    },
  ];

  return (
    <ScrollArea className="flex-1">
      <div className="p-6 max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold">{extra?.title ?? metadata.name}</h1>
              {extra?.author && <p className="text-muted-foreground">by {extra.author}</p>}
              <div className="flex flex-wrap gap-2 mt-2">
                {extra?.language && (
                  <Badge variant="secondary" className="gap-1">
                    <Globe className="h-3 w-3" />
                    {extra.language}
                  </Badge>
                )}
                {extra?.form && <Badge variant="outline">{extra.form}</Badge>}
              </div>
            </div>
          </div>

          {/* Visual Style */}
          {extra?.visualStyle && (
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-sm font-medium mb-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Visual Style
              </div>
              <p className="text-sm text-muted-foreground">{extra.visualStyle}</p>
            </div>
          )}
        </div>

        {/* Section Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => onNavigate(section.path)}
              className="group bg-card rounded-xl border border-border p-4 text-left hover:border-primary/50 hover:shadow-lg transition-all duration-200"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                  <section.icon className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{section.label}</h3>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
                  <Badge variant="secondary" className="mt-2">
                    {section.count} {section.count === 1 ? "item" : "items"}
                  </Badge>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="pt-4 border-t border-border">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate(`${bookPath}/characters`)}
            >
              <Users className="h-4 w-4 mr-2" />
              Add Character
            </Button>
            <Button variant="outline" size="sm" onClick={() => onNavigate(`${bookPath}/chapters`)}>
              <FileText className="h-4 w-4 mr-2" />
              Upload Chapter
            </Button>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

export function BookDashboardSkeleton() {
  return (
    <div className="flex-1 p-6 max-w-4xl mx-auto">
      <div className="space-y-8">
        {/* Header skeleton */}
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-xl bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-7 w-48 rounded bg-muted animate-pulse" />
            <div className="h-5 w-32 rounded bg-muted animate-pulse" />
            <div className="flex gap-2 mt-2">
              <div className="h-5 w-20 rounded bg-muted animate-pulse" />
              <div className="h-5 w-16 rounded bg-muted animate-pulse" />
            </div>
          </div>
        </div>

        {/* Cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-muted animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-24 rounded bg-muted animate-pulse" />
                  <div className="h-4 w-36 rounded bg-muted animate-pulse" />
                  <div className="h-5 w-16 rounded bg-muted animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
