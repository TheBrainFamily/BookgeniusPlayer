import React from "react";
import { useState } from "react";
import { Book, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

// Sample chapter data - replace with your actual data
const chapters = [
  { id: 1, title: "The Beginning", page: 1 },
  { id: 2, title: "The Journey Begins", page: 15 },
  { id: 3, title: "Unexpected Challenges", page: 32 },
  { id: 4, title: "A New Friend", page: 48 },
  { id: 5, title: "The Discovery", page: 67 },
  { id: 6, title: "Facing Fears", page: 85 },
  { id: 7, title: "The Revelation", page: 103 },
  { id: 8, title: "Turning Point", page: 124 },
  { id: 9, title: "The Confrontation", page: 142 },
  { id: 10, title: "Resolution", page: 163 },
  { id: 11, title: "New Beginnings", page: 185 },
  { id: 12, title: "Epilogue", page: 201 },
];

export default function BookChaptersModal() {
  const [open, setOpen] = useState(false);

  const navigateToChapter = (chapterId: number, page: number) => {
    console.log(`Navigating to chapter ${chapterId}, page ${page}`);
    // Implement your navigation logic here
    // For example: router.push(`/book/chapter/${chapterId}`)
    setOpen(false);
  };

  return (
    <div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="rounded-full">
            <Book className="h-5 w-5" />
            <span className="sr-only">Open chapters</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[80vh] rounded-t-xl">
          <SheetHeader className="flex-row items-center justify-between border-b pb-4">
            <SheetTitle className="text-lg font-medium">Chapters</SheetTitle>
            <SheetClose asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </SheetClose>
          </SheetHeader>
          <ScrollArea className="h-full py-4">
            <div className="space-y-1">
              {chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  onClick={() => navigateToChapter(chapter.id, chapter.page)}
                  className="w-full rounded-md px-4 py-3 text-left transition-colors hover:bg-muted active:bg-muted/80"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-muted-foreground">{chapter.id}</span>
                      <span className="font-medium">{chapter.title}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">p. {chapter.page}</span>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
