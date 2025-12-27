import React, { useCallback, useState, useMemo } from 'react'
import { trpc } from '../trpc'
import { StepLabels, type Step } from '~shared/pipelineTypes'
import Editor from '@monaco-editor/react'
import { Upload, FileText, Play, Download, CheckCircle2, Circle, Loader2, AlertCircle, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

type UploadResult = { path: string }

type StepState = {
  step: Step
  status: 'pending' | 'running' | 'done' | 'error'
  startedAt?: number
  endedAt?: number
  message?: string
}

type JobStatus = {
  jobId: string
  slug: string
  currentStep: Step
  steps: StepState[]
  logs?: string[]
  error?: string
  downloadUrl?: string
}

type ChapterInfo = {
  originalIndex: number
  content: string
  title: string
  selected: boolean
}

const serverURL = 'http://localhost:4000'

const statusIcons = {
  pending: Circle,
  running: Loader2,
  done: CheckCircle2,
  error: AlertCircle,
}

// Parse chapters from rich XML
function parseChapters(xml: string): { preamble: string; chapters: ChapterInfo[]; postamble: string } {
  const sectionRegex = /<section\s+data-chapter="(\d+)"[^>]*>([\s\S]*?)<\/section>/g
  const chapters: ChapterInfo[] = []
  let match
  let lastIndex = 0
  let preamble = ''

  // Find the first section to get preamble
  const firstMatch = xml.match(/<section\s+data-chapter="/)
  if (firstMatch && firstMatch.index !== undefined) {
    preamble = xml.slice(0, firstMatch.index)
  }

  while ((match = sectionRegex.exec(xml)) !== null) {
    const originalIndex = parseInt(match[1], 10)
    const content = match[0]
    // Try to extract a title from the first heading or first line
    const titleMatch = content.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)
    let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : `Chapter ${originalIndex}`
    if (title.length > 50) title = title.slice(0, 47) + '...'

    chapters.push({
      originalIndex,
      content,
      title,
      selected: true,
    })
    lastIndex = match.index + match[0].length
  }

  // Get postamble (everything after last section)
  const postamble = xml.slice(lastIndex)

  return { preamble, chapters, postamble }
}

// Recompile chapters with renumbered indices
function recompileXml(preamble: string, chapters: ChapterInfo[], postamble: string): string {
  const selectedChapters = chapters.filter(c => c.selected)
  const reindexedChapters = selectedChapters.map((chapter, idx) => {
    // Replace the data-chapter attribute with new index
    return chapter.content.replace(
      /data-chapter="\d+"/,
      `data-chapter="${idx + 1}"`
    )
  })
  return preamble + reindexedChapters.join('\n') + postamble
}

export default function App() {
  const [file, setFile] = useState<File | null>(null)
  const [upload, setUpload] = useState<UploadResult | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<JobStatus | null>(null)
  const [polling, setPolling] = useState(false)
  const [slug, setSlug] = useState<string | null>(null)
  const [rich, setRich] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const [showLogs, setShowLogs] = useState(false)

  // Loading states
  const [isUploading, setIsUploading] = useState(false)
  const [isStartingPipeline, setIsStartingPipeline] = useState(false)

  // Chapter management
  const [chapters, setChapters] = useState<ChapterInfo[]>([])
  const [preamble, setPreamble] = useState('')
  const [postamble, setPostamble] = useState('')
  const [selectedChapterIdx, setSelectedChapterIdx] = useState<number>(0)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Current step tracking
  const currentStep = useMemo(() => {
    if (isStartingPipeline || jobId) return 'progress'
    if (isUploading || (slug && chapters.length > 0)) return 'editor'
    return 'upload'
  }, [isStartingPipeline, jobId, isUploading, slug, chapters.length])

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) setFile(f)
  }, [])

  const onSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }, [])

  const uploadFile = useCallback(async () => {
    if (!file) return
    setIsUploading(true)
    try {
      const url = `${serverURL}/upload?name=${encodeURIComponent(file.name)}`
      const res = await fetch(url, { method: 'PUT', body: file })
      if (!res.ok) {
        alert('Upload failed')
        setIsUploading(false)
        return
      }
      const data: UploadResult = await res.json()
      setUpload(data)
      const prep = await trpc.prepareFromEpub.mutate({ epubPath: data.path })
      setSlug(prep.slug)
      setRich(prep.rich)

      // Parse chapters
      const parsed = parseChapters(prep.rich)
      setPreamble(parsed.preamble)
      setChapters(parsed.chapters)
      setPostamble(parsed.postamble)
      setSelectedChapterIdx(0)
    } finally {
      setIsUploading(false)
    }
  }, [file])

  const toggleChapter = useCallback((idx: number) => {
    setChapters(prev => prev.map((c, i) =>
      i === idx ? { ...c, selected: !c.selected } : c
    ))
  }, [])

  const selectAll = useCallback(() => {
    setChapters(prev => prev.map(c => ({ ...c, selected: true })))
  }, [])

  const deselectAll = useCallback(() => {
    setChapters(prev => prev.map(c => ({ ...c, selected: false })))
  }, [])

  const startPipeline = useCallback(async () => {
    if (!slug) return
    setIsStartingPipeline(true)
    // Recompile with renumbered chapters
    const compiledXml = recompileXml(preamble, chapters, postamble)
    await trpc.saveRichXml.mutate({ slug, rich: compiledXml })
    const resp = await trpc.startPipeline.mutate({ slug })
    setJobId(resp.jobId)
    setPolling(true)
  }, [slug, preamble, chapters, postamble])

  React.useEffect(() => {
    let timer: number | undefined
    const tick = async () => {
      if (!jobId) return
      const st = await trpc.getJobStatus.query({ jobId })
      setStatus(st as JobStatus)
      if (st.currentStep === 'complete' || st.currentStep === 'failed') {
        setPolling(false)
        return
      }
      timer = window.setTimeout(tick, 1500)
    }
    if (polling && jobId) {
      tick()
    }
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [polling, jobId])

  const steps = status?.steps ?? []
  const downloadHref = status?.downloadUrl ? `${serverURL}${status.downloadUrl}` : undefined
  const completedSteps = steps.filter(s => s.status === 'done').length
  const progressPercent = steps.length > 0 ? (completedSteps / steps.length) * 100 : 0
  const selectedCount = chapters.filter(c => c.selected).length
  const currentChapter = chapters[selectedChapterIdx]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-semibold text-gradient">BookGenius Pipeline</h1>
              <p className="text-sm text-muted-foreground">Transform your EPUB into an interactive experience</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-6xl">
        {/* Upload Section */}
        {currentStep === 'upload' && (
          <Card className="animate-fade-in border-border/50 max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Upload className="w-5 h-5 text-primary" />
                Upload EPUB
              </CardTitle>
              <CardDescription>
                Drag and drop your EPUB file or click to browse
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onDrop={onDrop}
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                className={cn(
                  "relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200",
                  isDragging
                    ? "border-primary bg-primary/5 scale-[1.02]"
                    : "border-border hover:border-muted-foreground/50",
                  file && "border-success/50 bg-success/5"
                )}
              >
                <input
                  type="file"
                  accept=".epub"
                  onChange={onSelect}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="space-y-3">
                  <div className={cn(
                    "mx-auto w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                    file ? "bg-success/20" : "bg-muted"
                  )}>
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
            </CardContent>
          </Card>
        )}

        {/* Editor Section with Chapter Sidebar */}
        {currentStep === 'editor' && (
          <div className="animate-fade-in flex gap-4">
            {/* Chapter Sidebar */}
            <div className={cn(
              "shrink-0 transition-all duration-200",
              sidebarCollapsed ? "w-12" : "w-72"
            )}>
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
                            <>{selectedCount} of {chapters.length} selected</>
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
                      {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                    </Button>
                  </div>
                  {!sidebarCollapsed && !isUploading && (
                    <div className="flex gap-2 mt-2">
                      <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7 px-2">
                        Select All
                      </Button>
                      <Button variant="ghost" size="sm" onClick={deselectAll} className="text-xs h-7 px-2">
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
                        <div key={i} className="flex items-center gap-2 p-2 animate-fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
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
                          !chapter.selected && "opacity-50"
                        )}
                        onClick={() => setSelectedChapterIdx(idx)}
                      >
                        {!sidebarCollapsed && (
                          <input
                            type="checkbox"
                            checked={chapter.selected}
                            onChange={(e) => {
                              e.stopPropagation()
                              toggleChapter(idx)
                            }}
                            className="shrink-0 w-4 h-4 rounded border-border accent-primary"
                          />
                        )}
                        {sidebarCollapsed ? (
                          <span className={cn(
                            "w-6 h-6 rounded text-xs flex items-center justify-center",
                            chapter.selected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                          )}>
                            {idx + 1}
                          </span>
                        ) : (
                          <>
                            <span className="text-xs text-muted-foreground shrink-0 w-6">
                              {idx + 1}.
                            </span>
                            <span className="text-sm truncate flex-1">
                              {chapter.title}
                            </span>
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
                      {isUploading ? 'Preparing Book...' : (currentChapter?.title || 'XML Editor')}
                    </CardTitle>
                    <CardDescription>
                      {isUploading ? (
                        <span className="animate-pulse">Converting EPUB and extracting chapters...</span>
                      ) : (
                        <>
                          <span className="font-mono text-primary">{slug}</span>
                          {currentChapter && (
                            <span className="ml-2">
                              — Chapter {selectedChapterIdx + 1} of {chapters.length}
                              {!currentChapter.selected && (
                                <Badge variant="muted" className="ml-2">Excluded</Badge>
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
                            animationDelay: `${i * 0.03}s`
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <Editor
                      height="calc(100vh - 280px)"
                      defaultLanguage="xml"
                      value={currentChapter?.content || ''}
                      theme="vs-dark"
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        padding: { top: 16, bottom: 16 },
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        wordWrap: 'on',
                        wrappingStrategy: 'advanced',
                      }}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Progress Section */}
        {currentStep === 'progress' && (
          <Card className="animate-fade-in border-border/50 max-w-2xl mx-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {status?.currentStep === 'complete' ? (
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    ) : (
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    )}
                    Pipeline Progress
                  </CardTitle>
                  <CardDescription>
                    {!status
                      ? 'Starting pipeline...'
                      : status.currentStep === 'complete'
                      ? 'Processing complete!'
                      : status.currentStep === 'failed'
                      ? 'Pipeline failed'
                      : `Processing ${status.slug}...`}
                  </CardDescription>
                </div>
                <Badge variant={
                  !status ? 'info'
                  : status.currentStep === 'complete' ? 'success'
                  : status.currentStep === 'failed' ? 'destructive'
                  : 'info'
                }>
                  {!status ? 'Starting'
                   : status.currentStep === 'complete' ? 'Complete'
                   : status.currentStep === 'failed' ? 'Failed'
                   : 'In Progress'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="text-foreground font-medium">{Math.round(progressPercent)}%</span>
                </div>
                <Progress value={progressPercent} className="h-2" />
              </div>

              {/* Steps List or Loading Skeleton */}
              <div className="space-y-2">
                {!status ? (
                  // Skeleton while starting
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
                ) : (
                  steps.map((s, idx) => {
                    const Icon = statusIcons[s.status]
                    return (
                      <div
                        key={s.step}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg transition-all",
                          s.status === 'running' && "bg-info/5 animate-pulse-glow",
                          s.status === 'done' && "bg-success/5",
                          s.status === 'error' && "bg-destructive/5",
                          "animate-fade-in",
                          `stagger-${Math.min(idx + 1, 6)}`
                        )}
                      >
                        <Icon className={cn(
                          "w-5 h-5 shrink-0",
                          s.status === 'pending' && "text-muted-foreground",
                          s.status === 'running' && "text-info animate-spin",
                          s.status === 'done' && "text-success",
                          s.status === 'error' && "text-destructive"
                        )} />
                        <span className={cn(
                          "flex-1 text-sm font-medium",
                          s.status === 'pending' && "text-muted-foreground",
                          s.status === 'running' && "text-info",
                          s.status === 'done' && "text-foreground",
                          s.status === 'error' && "text-destructive"
                        )}>
                          {StepLabels[s.step as Step]}
                        </span>
                        <Badge variant={s.status} className="text-xs">
                          {s.status}
                        </Badge>
                      </div>
                    )
                  })
                )}
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
                    {showLogs ? '▼' : '▶'} Logs ({status.logs.length} entries)
                  </button>
                  {showLogs && (
                    <pre className="p-4 rounded-lg bg-[#0d1117] text-[#c9d1d9] text-xs font-mono overflow-auto max-h-60 scrollbar-thin animate-fade-in">
                      {status.logs.join('\n')}
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
  )
}
