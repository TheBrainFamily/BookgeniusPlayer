import React, { useCallback, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { trpc } from "../trpc";
import { StepLabels, type Step } from "~pipeline/src/shared/pipelineTypes";
import Editor from "@monaco-editor/react";
import {
  Upload,
  FileText,
  Play,
  Download,
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Search,
  Library,
  LayoutGrid,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

import { StyleSelectionModal } from "@/components/StyleSelectionModal";
import { StylePreviewComparison } from "@/components/StylePreviewComparison";
import { BookReadyModal } from "@/components/BookReadyModal";
type SourceMode = "upload" | "wolneLektury";

type WolneLekturySearchResult = {
  title: string;
  author: string;
  slug: string;
  coverThumb: string;
  hasAudio: boolean;
  epoch: string;
  genre: string;
  kind: string;
};

type UploadResult = { path: string };

type StepState = {
  step: Step;
  status: "pending" | "running" | "done" | "error";
  startedAt?: number;
  endedAt?: number;
  message?: string;
};

type StyleInfo = { backgroundStyle: string; periodStyle: string; avatarStyle: string };

type JobStatus = {
  jobId: string;
  slug: string;
  currentStep: Step;
  activeSteps?: Step[];
  steps: StepState[];
  logs?: string[];
  error?: string;
  downloadUrl?: string;
  styleSelection?: {
    status:
      | "not_started"
      | "awaiting_input"
      | "generating_auto_style"
      | "generating_user_style"
      | "generating_previews"
      | "awaiting_choice"
      | "complete"
      | "timed_out";
    remainingTimeMs: number;
    autoStyle: StyleInfo | null;
    userStyle: StyleInfo | null;
    previews: {
      autoPreviewPath: string | null;
      userPreviewPath: string | null;
      autoAvatarPath: string | null;
      userAvatarPath: string | null;
    } | null;
    selected: "auto" | "user" | null;
  };
};

// Import chapter parsing utilities
import { parseChapters, recompileXml, type ChapterInfo } from "../utils/xmlParser";

const serverURL = "http://localhost:4000";

const statusIcons = { pending: Circle, running: Loader2, done: CheckCircle2, error: AlertCircle };

// eslint-disable-next-line complexity
export default function App() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [_rich, setRich] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<WolneLekturySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDownloadingWL, setIsDownloadingWL] = useState(false);
  const [isDownloadingSE, setIsDownloadingSE] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [isStartingPipeline, setIsStartingPipeline] = useState(false);
  const [showBookReadyModal, setShowBookReadyModal] = useState(false);

  // Chapter management
  const [chapters, setChapters] = useState<ChapterInfo[]>([]);
  const [originalXml, setOriginalXml] = useState("");
  const [selectedChapterIdx, setSelectedChapterIdx] = useState<number>(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Current step tracking
  const currentStep = useMemo(() => {
    const step = (() => {
      if (isStartingPipeline || jobId) return "progress";
      if (isUploading || isDownloadingSE || (slug && chapters.length > 0)) return "editor";
      return "upload";
    })();
    console.log("[currentStep]", step, {
      isStartingPipeline,
      jobId,
      isUploading,
      isDownloadingSE,
      slug,
      chaptersLength: chapters.length,
    });
    return step;
  }, [isStartingPipeline, jobId, isUploading, isDownloadingSE, slug, chapters.length]);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }, []);

  const onSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }, []);

  const uploadFile = useCallback(async () => {
    if (!file) return;
    setIsUploading(true);
    try {
      const url = `${serverURL}/upload?name=${encodeURIComponent(file.name)}`;
      const res = await fetch(url, { method: "PUT", body: file });
      if (!res.ok) {
        alert("Upload failed");
        setIsUploading(false);
        return;
      }
      const data: UploadResult = await res.json();
      setUpload(data);
      let prep: { slug: string; rich: string } | null = null;
      if (file.name.toLowerCase().includes(".epub")) {
        prep = await trpc.prepareFromEpub.mutate({ epubPath: data.path });
      } else if (file.name.toLowerCase().includes(".fb2")) {
        prep = await trpc.prepareFromFb2.mutate({ fb2Path: data.path });
      }
      if (!prep) {
        setIsUploading(false);
        return;
      }
      setSlug(prep.slug);
      setRich(prep.rich);

      // Parse chapters
      const parsed = parseChapters(prep.rich);
      setOriginalXml(parsed.originalXml);
      setChapters(parsed.chapters);
      setSelectedChapterIdx(0);
    } finally {
      setIsUploading(false);
    }
  }, [file]);

  const toggleChapter = useCallback((idx: number) => {
    setChapters((prev) => prev.map((c, i) => (i === idx ? { ...c, selected: !c.selected } : c)));
  }, []);

  const selectAll = useCallback(() => {
    setChapters((prev) => prev.map((c) => ({ ...c, selected: true })));
  }, []);

  const deselectAll = useCallback(() => {
    setChapters((prev) => prev.map((c) => ({ ...c, selected: false })));
  }, []);

  const searchWolneLektury = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await trpc.searchWolneLektury.query({ query: searchQuery.trim() });
      setSearchResults(results);
    } catch (e) {
      console.error("Search failed:", e);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const downloadFromWolneLektury = useCallback(async (bookSlug: string) => {
    setIsDownloadingWL(true);
    try {
      const result = await trpc.downloadFromWolneLektury.mutate({ slug: bookSlug });
      setSlug(result.slug);
      setRich(result.rich);
      const parsed = parseChapters(result.rich);
      setOriginalXml(parsed.originalXml);
      setChapters(parsed.chapters);
      setSelectedChapterIdx(0);
    } catch (e) {
      console.error("Download failed:", e);
      alert(`Failed to download: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setIsDownloadingWL(false);
    }
  }, []);

  const downloadFromStandardEbooks = useCallback(async (bookSlug: string) => {
    console.log("[SE] downloadFromStandardEbooks called with:", bookSlug);
    setIsDownloadingSE(true);
    try {
      console.log("[SE] calling prepareFromStandardEbooks...");
      const result = await trpc.prepareFromStandardEbooks.mutate({ slug: bookSlug });
      console.log("[SE] result:", { slug: result.slug, richLength: result.rich?.length });
      setSlug(result.slug);
      setRich(result.rich);
      const parsed = parseChapters(result.rich);
      console.log("[SE] parsed chapters:", parsed.chapters.length);
      setOriginalXml(parsed.originalXml);
      setChapters(parsed.chapters);
      setSelectedChapterIdx(0);
      console.log("[SE] state updated, chapters:", parsed.chapters.length);
    } catch (e) {
      console.error("[SE] Download failed:", e);
      alert(`Failed to prepare: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      console.log("[SE] setting isDownloadingSE to false");
      setIsDownloadingSE(false);
    }
  }, []);

  React.useEffect(() => {
    const bookSlug = searchParams.get("book");
    const seBookSlug = searchParams.get("se-book");

    console.log(
      "[useEffect] bookSlug:",
      bookSlug,
      "seBookSlug:",
      seBookSlug,
      "slug:",
      slug,
      "isDownloadingWL:",
      isDownloadingWL,
      "isDownloadingSE:",
      isDownloadingSE,
    );

    if (bookSlug && !slug && !isDownloadingWL) {
      console.log("[useEffect] triggering downloadFromWolneLektury");
      setSearchParams({});
      downloadFromWolneLektury(bookSlug);
    } else if (seBookSlug && !slug && !isDownloadingSE) {
      console.log("[useEffect] triggering downloadFromStandardEbooks");
      setSearchParams({});
      downloadFromStandardEbooks(seBookSlug);
    }
  }, [
    searchParams,
    setSearchParams,
    slug,
    isDownloadingWL,
    isDownloadingSE,
    downloadFromWolneLektury,
    downloadFromStandardEbooks,
  ]);

  const startPipeline = useCallback(async () => {
    if (!slug) return;
    setIsStartingPipeline(true);
    // Recompile with renumbered chapters
    const compiledXml = recompileXml(originalXml, chapters);
    await trpc.saveRichXml.mutate({ slug, rich: compiledXml });
    const resp = await trpc.startPipeline.mutate({ slug });
    setJobId(resp.jobId);
    setPolling(true);
  }, [slug, originalXml, chapters]);

  const submitStyleDescription = useCallback(
    async (description: string | null) => {
      if (!jobId) return;
      await trpc.submitStyleDescription.mutate({ jobId, description });
      // Force immediate poll to update status
      const st = await trpc.getJobStatus.query({ jobId });
      setStatus(st as JobStatus);
    },
    [jobId],
  );

  const chooseStyle = useCallback(
    async (choice: "auto" | "user") => {
      if (!jobId) return;
      await trpc.chooseStyle.mutate({ jobId, choice });
      const st = await trpc.getJobStatus.query({ jobId });
      setStatus(st as JobStatus);
    },
    [jobId],
  );

  React.useEffect(() => {
    let timer: number | undefined;
    const tick = async () => {
      if (!jobId) return;
      const st = await trpc.getJobStatus.query({ jobId });
      setStatus(st as JobStatus);
      if (st.currentStep === "complete" || st.currentStep === "failed") {
        setPolling(false);
        return;
      }
      timer = window.setTimeout(tick, 1500);
    };
    if (polling && jobId) {
      tick();
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [polling, jobId]);

  // Show book ready modal when pipeline completes
  React.useEffect(() => {
    if (status?.currentStep === "complete" && !showBookReadyModal) {
      setShowBookReadyModal(true);
    }
  }, [status?.currentStep, showBookReadyModal]);

  const steps = status?.steps ?? [];
  const downloadHref = status?.downloadUrl ? `${serverURL}${status.downloadUrl}` : undefined;
  const completedSteps = steps.filter((s) => s.status === "done").length;
  const progressPercent = steps.length > 0 ? (completedSteps / steps.length) * 100 : 0;
  const selectedCount = chapters.filter((c) => c.selected).length;
  const currentChapter = chapters[selectedChapterIdx];

  const canAcceptStyleInput = ["generating_auto_style", "awaiting_input"].includes(
    status?.styleSelection?.status || "",
  );
  const showStyleComparison = status?.styleSelection?.status === "awaiting_choice";
  const isProcessingUserStyle = ["generating_user_style", "generating_previews"].includes(
    status?.styleSelection?.status || "",
  );

  return (
    <div className="min-h-screen bg-background">
      {canAcceptStyleInput && status?.styleSelection && (
        <StyleSelectionModal onSubmit={submitStyleDescription} />
      )}

      {showStyleComparison && status?.styleSelection && (
        <StylePreviewComparison
          slug={status.slug}
          previews={status.styleSelection.previews}
          autoStyle={status.styleSelection.autoStyle}
          userStyle={status.styleSelection.userStyle}
          onChoose={chooseStyle}
        />
      )}

      {showBookReadyModal && slug && (
        <BookReadyModal slug={slug} onClose={() => setShowBookReadyModal(false)} />
      )}

      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <BookOpen className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-display font-semibold text-gradient">
                  BookGenius Pipeline
                </h1>
                <p className="text-sm text-muted-foreground">
                  Transform your EPUB into an interactive experience
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/collections")}
              className="gap-2"
            >
              <LayoutGrid className="w-4 h-4" />
              Browse Collections
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-6xl">
        {currentStep === "upload" && (
          <Card className="animate-fade-in border-border/50 max-w-2xl mx-auto">
            <CardHeader>
              <div className="flex gap-2 mb-4">
                <Button
                  variant={sourceMode === "upload" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSourceMode("upload")}
                  className="gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Upload EPUB
                </Button>
                <Button
                  variant={sourceMode === "wolneLektury" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSourceMode("wolneLektury")}
                  className="gap-2"
                >
                  <Library className="w-4 h-4" />
                  Wolne Lektury
                </Button>
              </div>
              <CardTitle className="flex items-center gap-2 text-lg">
                {sourceMode === "upload" ? (
                  <>
                    <Upload className="w-5 h-5 text-primary" />
                    Upload EPUB
                  </>
                ) : (
                  <>
                    <Library className="w-5 h-5 text-primary" />
                    Wolne Lektury
                  </>
                )}
              </CardTitle>
              <CardDescription>
                {sourceMode === "upload"
                  ? "Drag and drop your EPUB file or click to browse"
                  : "Search and select a book from the Polish digital library"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sourceMode === "upload" ? (
                <>
                  <div
                    onDrop={onDrop}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    className={cn(
                      "relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200",
                      isDragging
                        ? "border-primary bg-primary/5 scale-[1.02]"
                        : "border-border hover:border-muted-foreground/50",
                      file && "border-success/50 bg-success/5",
                    )}
                  >
                    <input
                      type="file"
                      accept=".epub"
                      onChange={onSelect}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="space-y-3">
                      <div
                        className={cn(
                          "mx-auto w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                          file ? "bg-success/20" : "bg-muted",
                        )}
                      >
                        {file ? (
                          <CheckCircle2 className="w-6 h-6 text-success" />
                        ) : (
                          <FileText className="w-6 h-6 text-muted-foreground" />
                        )}
                      </div>
                      {file ? (
                        <div>
                          <p className="font-medium text-foreground">{file.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium text-foreground">Drop your EPUB here</p>
                          <p className="text-sm text-muted-foreground">or click to browse</p>
                        </div>
                      )}
                    </div>
                  </div>
                  {file && !upload && (
                    <div className="mt-4 flex justify-end">
                      <Button onClick={uploadFile}>
                        <Upload className="w-4 h-4" />
                        Upload & Prepare
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchWolneLektury()}
                      placeholder="Search by title or author..."
                      className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <Button
                      onClick={searchWolneLektury}
                      disabled={isSearching || !searchQuery.trim()}
                    >
                      {isSearching ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </Button>
                  </div>

                  {isDownloadingWL && (
                    <div className="flex items-center justify-center gap-3 p-8 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Downloading and preparing book...</span>
                    </div>
                  )}

                  {!isDownloadingWL && searchResults.length > 0 && (
                    <div className="max-h-96 overflow-auto space-y-2 scrollbar-thin">
                      {searchResults.map((book) => (
                        <div
                          key={book.slug}
                          onClick={() => downloadFromWolneLektury(book.slug)}
                          className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all"
                        >
                          {book.coverThumb ? (
                            <img
                              src={book.coverThumb}
                              alt={book.title}
                              className="w-12 h-16 object-cover rounded"
                            />
                          ) : (
                            <div className="w-12 h-16 bg-muted rounded flex items-center justify-center">
                              <BookOpen className="w-6 h-6 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">{book.title}</p>
                            <p className="text-sm text-muted-foreground truncate">{book.author}</p>
                            <div className="flex gap-1 mt-1">
                              {book.epoch && (
                                <Badge variant="muted" className="text-xs">
                                  {book.epoch}
                                </Badge>
                              )}
                              {book.genre && (
                                <Badge variant="muted" className="text-xs">
                                  {book.genre}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!isDownloadingWL &&
                    !isSearching &&
                    searchResults.length === 0 &&
                    searchQuery && (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>No books found. Try a different search term.</p>
                      </div>
                    )}

                  {!isDownloadingWL && !searchQuery && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Library className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>Search for Polish literature classics</p>
                      <p className="text-sm">Try "Lalka", "Pan Tadeusz", or "Sienkiewicz"</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Editor Section with Chapter Sidebar */}
        {currentStep === "editor" && (
          <div className="animate-fade-in flex gap-4">
            {/* Chapter Sidebar */}
            <div
              className={cn(
                "shrink-0 transition-all duration-200",
                sidebarCollapsed ? "w-12" : "w-72",
              )}
            >
              <Card className="border-border/50 h-[calc(100vh-180px)] flex flex-col">
                <CardHeader className="p-3 border-b border-border/50">
                  <div className="flex items-center justify-between">
                    {!sidebarCollapsed && (
                      <div className="flex-1">
                        <CardTitle className="text-sm font-medium">Chapters</CardTitle>
                        <CardDescription className="text-xs">
                          {isUploading ? (
                            <span className="animate-pulse">Loading chapters...</span>
                          ) : (
                            <>
                              {selectedCount} of {chapters.length} selected
                            </>
                          )}
                        </CardDescription>
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                      disabled={isUploading}
                    >
                      {sidebarCollapsed ? (
                        <ChevronRight className="w-4 h-4" />
                      ) : (
                        <ChevronLeft className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  {!sidebarCollapsed && !isUploading && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={selectAll}
                        className="text-xs h-7 px-2"
                      >
                        Select All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={deselectAll}
                        className="text-xs h-7 px-2"
                      >
                        Deselect All
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="flex-1 overflow-auto p-2 scrollbar-thin">
                  {isUploading ? (
                    // Skeleton loading state
                    <div className="space-y-2">
                      {[...Array(8)].map((_, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 p-2 animate-fade-in"
                          style={{ animationDelay: `${i * 0.05}s` }}
                        >
                          <div className="w-4 h-4 rounded bg-muted animate-pulse" />
                          <div className="w-6 h-4 rounded bg-muted animate-pulse" />
                          <div className="flex-1 h-4 rounded bg-muted animate-pulse" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    chapters.map((chapter, idx) => (
                      <div
                        key={chapter.originalIndex}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
                          selectedChapterIdx === idx && "bg-primary/10",
                          !chapter.selected && "opacity-50",
                        )}
                        onClick={() => setSelectedChapterIdx(idx)}
                      >
                        {!sidebarCollapsed && (
                          <input
                            type="checkbox"
                            checked={chapter.selected}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleChapter(idx);
                            }}
                            className="shrink-0 w-4 h-4 rounded border-border accent-primary"
                          />
                        )}
                        {sidebarCollapsed ? (
                          <span
                            className={cn(
                              "w-6 h-6 rounded text-xs flex items-center justify-center",
                              chapter.selected
                                ? "bg-primary/20 text-primary"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {idx + 1}
                          </span>
                        ) : (
                          <>
                            <span className="text-xs text-muted-foreground shrink-0 w-6">
                              {idx + 1}.
                            </span>
                            <span className="text-sm truncate flex-1">{chapter.title}</span>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Editor Panel */}
            <Card className="flex-1 border-border/50">
              <CardHeader className="p-4 border-b border-border/50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      {isUploading ? (
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      ) : (
                        <FileText className="w-5 h-5 text-primary" />
                      )}
                      {isUploading ? "Preparing Book..." : currentChapter?.title || "XML Editor"}
                    </CardTitle>
                    <CardDescription>
                      {isUploading ? (
                        <span className="animate-pulse">
                          Converting EPUB and extracting chapters...
                        </span>
                      ) : (
                        <>
                          <span className="font-mono text-primary">{slug}</span>
                          {currentChapter && (
                            <span className="ml-2">
                              — Chapter {selectedChapterIdx + 1} of {chapters.length}
                              {!currentChapter.selected && (
                                <Badge variant="muted" className="ml-2">
                                  Excluded
                                </Badge>
                              )}
                            </span>
                          )}
                        </>
                      )}
                    </CardDescription>
                  </div>
                  <Button
                    onClick={startPipeline}
                    disabled={selectedCount === 0 || isUploading}
                    className="gap-2"
                  >
                    <Play className="w-4 h-4" />
                    Start Pipeline ({selectedCount} chapters)
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="border-b border-border bg-[#1e1e1e]">
                  {isUploading ? (
                    // Skeleton for editor
                    <div className="h-[calc(100vh-280px)] p-4 space-y-3">
                      {[...Array(20)].map((_, i) => (
                        <div
                          key={i}
                          className="h-4 rounded bg-muted/30 animate-pulse"
                          style={{
                            width: `${Math.random() * 40 + 60}%`,
                            animationDelay: `${i * 0.03}s`,
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <Editor
                      height="calc(100vh - 280px)"
                      defaultLanguage="xml"
                      value={currentChapter?.content || ""}
                      theme="vs-dark"
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineNumbers: "on",
                        scrollBeyondLastLine: false,
                        padding: { top: 16, bottom: 16 },
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        wordWrap: "on",
                        wrappingStrategy: "advanced",
                      }}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Progress Section */}
        {currentStep === "progress" && (
          <Card className="animate-fade-in border-border/50 max-w-2xl mx-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {status?.currentStep === "complete" ? (
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    ) : (
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    )}
                    Pipeline Progress
                  </CardTitle>
                  <CardDescription>
                    {!status
                      ? "Starting pipeline..."
                      : status.currentStep === "complete"
                        ? "Processing complete!"
                        : status.currentStep === "failed"
                          ? "Pipeline failed"
                          : `Processing ${status.slug}...`}
                  </CardDescription>
                </div>
                <Badge
                  variant={
                    !status
                      ? "info"
                      : status.currentStep === "complete"
                        ? "success"
                        : status.currentStep === "failed"
                          ? "destructive"
                          : "info"
                  }
                >
                  {!status
                    ? "Starting"
                    : status.currentStep === "complete"
                      ? "Complete"
                      : status.currentStep === "failed"
                        ? "Failed"
                        : "In Progress"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="text-foreground font-medium">
                    {Math.round(progressPercent)}%
                  </span>
                </div>
                <Progress value={progressPercent} className="h-2" />
              </div>

              {/* Style Generation Loading Indicator */}
              {isProcessingUserStyle && (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 animate-fade-in mb-4">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      <Wand2 className="w-3 h-3 text-primary absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        AI Style Generation in Progress
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {status?.styleSelection?.status === "generating_user_style" &&
                          "Processing your style description..."}
                        {status?.styleSelection?.status === "generating_previews" &&
                          "Rendering preview images..."}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Steps List or Loading Skeleton */}
              <div className="space-y-2">
                {!status
                  ? // Skeleton while starting
                    [...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-3 rounded-lg animate-fade-in"
                        style={{ animationDelay: `${i * 0.05}s` }}
                      >
                        <div className="w-5 h-5 rounded-full bg-muted animate-pulse" />
                        <div className="flex-1 h-4 rounded bg-muted animate-pulse" />
                        <div className="w-16 h-5 rounded bg-muted animate-pulse" />
                      </div>
                    ))
                  : steps.map((s, idx) => {
                      const Icon = statusIcons[s.status];
                      return (
                        <div
                          key={s.step}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg transition-all",
                            s.status === "running" && "bg-info/5 animate-pulse-glow",
                            s.status === "done" && "bg-success/5",
                            s.status === "error" && "bg-destructive/5",
                            "animate-fade-in",
                            `stagger-${Math.min(idx + 1, 6)}`,
                          )}
                        >
                          <Icon
                            className={cn(
                              "w-5 h-5 shrink-0",
                              s.status === "pending" && "text-muted-foreground",
                              s.status === "running" && "text-info animate-spin",
                              s.status === "done" && "text-success",
                              s.status === "error" && "text-destructive",
                            )}
                          />
                          <span
                            className={cn(
                              "flex-1 text-sm font-medium",
                              s.status === "pending" && "text-muted-foreground",
                              s.status === "running" && "text-info",
                              s.status === "done" && "text-foreground",
                              s.status === "error" && "text-destructive",
                            )}
                          >
                            {StepLabels[s.step as Step]}
                          </span>
                          <Badge variant={s.status} className="text-xs">
                            {s.status}
                          </Badge>
                        </div>
                      );
                    })}
              </div>

              {/* Download Link */}
              {downloadHref && (
                <div className="animate-scale-in pt-2">
                  <a
                    href={downloadHref}
                    download
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-success text-success-foreground font-medium hover:brightness-110 transition-all shadow-glow-sm"
                  >
                    <Download className="w-4 h-4" />
                    Download Packaged Files
                  </a>
                </div>
              )}

              {/* Logs Section */}
              {status?.logs && status.logs.length > 0 && (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowLogs(!showLogs)}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    {showLogs ? "▼" : "▶"} Logs ({status.logs.length} entries)
                  </button>
                  {showLogs && (
                    <pre className="p-4 rounded-lg bg-[#0d1117] text-[#c9d1d9] text-xs font-mono overflow-auto max-h-60 scrollbar-thin animate-fade-in">
                      {status.logs.join("\n")}
                    </pre>
                  )}
                </div>
              )}

              {/* Error Display */}
              {status?.error && (
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 animate-fade-in">
                  <p className="text-sm text-destructive flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {status.error}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
