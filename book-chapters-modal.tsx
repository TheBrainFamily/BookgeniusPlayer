import { useState } from "react"
import { Book, Moon, X, List, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

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
]

type ModalType = null | "chapters" | "page"

export default function BookChaptersModal() {
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const [nightMode, setNightMode] = useState(false)
  const [pageNumber, setPageNumber] = useState("")

  const navigateToChapter = (chapterId: number, page: number) => {
    console.log(`Navigating to chapter ${chapterId}, page ${page}`)
    // Implement your navigation logic here
    // For example: router.push(`/book/chapter/${chapterId}`)
    setActiveModal(null)
    setOverlayOpen(false)
  }

  const navigateToPage = () => {
    const page = Number.parseInt(pageNumber)
    if (!isNaN(page) && page > 0) {
      console.log(`Navigating to page ${page}`)
      // Implement your navigation logic here
      // For example: router.push(`/book/page/${page}`)
      setActiveModal(null)
      setOverlayOpen(false)
      setPageNumber("")
    }
  }

  const toggleNightMode = () => {
    setNightMode(!nightMode)
    // Implement your night mode logic here
    document.body.classList.toggle("dark")
    setOverlayOpen(false)
  }

  return (
    <>
      {/* Fixed button in top right corner */}
      <div className="fixed top-4 right-4 z-50">
        <Button variant="outline" size="icon" className="rounded-full" onClick={() => setOverlayOpen(true)}>
          <Book className="h-5 w-5" />
          <span className="sr-only">Book options</span>
        </Button>
      </div>

      {/* Overlay with options */}
      {overlayOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center"
          onClick={() => setOverlayOpen(false)}
        >
          <div className="bg-background rounded-lg p-4 w-64 space-y-2" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" className="w-full justify-start text-left" onClick={toggleNightMode}>
              <Moon className="mr-2 h-4 w-4" />
              Night Mode {nightMode ? "(On)" : "(Off)"}
            </Button>

            <Button
              variant="ghost"
              className="w-full justify-start text-left"
              onClick={() => {
                setActiveModal("chapters")
                setOverlayOpen(false)
              }}
            >
              <List className="mr-2 h-4 w-4" />
              Open Chapter
            </Button>

            <Button
              variant="ghost"
              className="w-full justify-start text-left"
              onClick={() => {
                setActiveModal("page")
                setOverlayOpen(false)
              }}
            >
              <FileText className="mr-2 h-4 w-4" />
              Go to Page
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2"
              onClick={() => setOverlayOpen(false)}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </div>
      )}

      {/* Chapters Modal */}
      <Sheet
        open={activeModal === "chapters"}
        onOpenChange={(open) => {
          if (!open) setActiveModal(null)
        }}
      >
        <SheetContent side="bottom" className="h-[80vh] rounded-t-xl">
          <SheetHeader className="border-b pb-4">
            <SheetTitle className="text-lg font-medium">Chapters</SheetTitle>
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

      {/* Go to Page Modal */}
      <Sheet
        open={activeModal === "page"}
        onOpenChange={(open) => {
          if (!open) setActiveModal(null)
        }}
      >
        <SheetContent side="bottom" className="rounded-t-xl">
          <SheetHeader className="border-b pb-4">
            <SheetTitle className="text-lg font-medium">Go to Page</SheetTitle>
          </SheetHeader>
          <div className="py-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="page-number">Page Number</Label>
              <Input
                id="page-number"
                type="number"
                min="1"
                placeholder="Enter page number"
                value={pageNumber}
                onChange={(e) => setPageNumber(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              onClick={navigateToPage}
              disabled={!pageNumber || isNaN(Number.parseInt(pageNumber)) || Number.parseInt(pageNumber) < 1}
            >
              Go to Page
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

