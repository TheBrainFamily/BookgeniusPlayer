import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";

interface CodeSnippetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderPath: string;
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Code copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <Highlight theme={themes.nightOwl} code={code} language="tsx">
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className="p-4 rounded-lg border border-border overflow-x-auto text-sm"
            style={{ ...style, margin: 0 }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                <span className="inline-block w-8 text-right mr-4 select-none opacity-50 text-xs">
                  {i + 1}
                </span>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export function CodeSnippetDialog({ open, onOpenChange, folderPath }: CodeSnippetDialogProps) {
  const querySnippet = `import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

function MyComponent() {
  const assets = useQuery(api.cli.listPublishedFilesInFolder, {
    folderPath: "${folderPath}",
  });

  if (!assets) return <div>Loading...</div>;

  return (
    <div>
      {assets.map((asset) => (
        <div key={asset.basename}>
          <p>{asset.basename}</p>
          <p>{asset.url}</p>
        </div>
      ))}
    </div>
  );
}`;

  const imageGallerySnippet = `import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

function ImageGallery() {
  const files = useQuery(api.cli.listPublishedFilesInFolder, {
    folderPath: "${folderPath}",
  });

  const images = files?.filter((f) =>
    f.contentType?.startsWith("image/")
  );

  if (!images) return <div>Loading...</div>;

  return (
    <div className="grid grid-cols-3 gap-4">
      {images.map((img) => (
        <img
          key={img.basename}
          src={img.url}
          alt={img.basename}
          className="w-full h-auto rounded"
        />
      ))}
    </div>
  );
}`;

  const audioPlayerSnippet = `import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

function AudioPlayer() {
  const files = useQuery(api.cli.listPublishedFilesInFolder, {
    folderPath: "${folderPath}",
  });

  const audioFiles = files?.filter((f) =>
    f.contentType?.startsWith("audio/")
  );

  if (!audioFiles) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      {audioFiles.map((track) => (
        <div key={track.basename} className="flex items-center gap-4">
          <span>{track.basename}</span>
          <audio controls src={track.url} />
        </div>
      ))}
    </div>
  );
}`;

  const versionUrlSnippet = `import { getVersionUrl } from "./assetUrl";

// Get URL for a specific version
const url = getVersionUrl({
  versionId: "abc123...",  // The version ID
  basename: "my-file.png", // Optional filename
});

// Use in an image tag
<img src={url} alt="My image" />

// Or audio/video
<audio controls src={url} />
<video controls src={url} />`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Frontend Code Snippets</DialogTitle>
          <DialogDescription>
            Copy these snippets to use assets from{" "}
            <code className="text-primary">{folderPath || "(root)"}</code> in your frontend
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="basic">Basic Query</TabsTrigger>
            <TabsTrigger value="images">Image Gallery</TabsTrigger>
            <TabsTrigger value="audio">Audio Player</TabsTrigger>
            <TabsTrigger value="version">Version URL</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto py-4">
            <TabsContent value="basic" className="mt-0">
              <p className="text-sm text-muted-foreground mb-3">
                List all published files in this folder:
              </p>
              <CodeBlock code={querySnippet} />
            </TabsContent>

            <TabsContent value="images" className="mt-0">
              <p className="text-sm text-muted-foreground mb-3">
                Display images from this folder in a grid:
              </p>
              <CodeBlock code={imageGallerySnippet} />
            </TabsContent>

            <TabsContent value="audio" className="mt-0">
              <p className="text-sm text-muted-foreground mb-3">
                Play audio files from this folder:
              </p>
              <CodeBlock code={audioPlayerSnippet} />
            </TabsContent>

            <TabsContent value="version" className="mt-0">
              <p className="text-sm text-muted-foreground mb-3">
                Get a URL for a specific version (from version history):
              </p>
              <CodeBlock code={versionUrlSnippet} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
