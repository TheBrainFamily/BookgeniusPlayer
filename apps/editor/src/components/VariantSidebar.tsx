import { useAppStore } from "../stores/appStore";
import { useBooksStore } from "../stores/booksStore.ts";
import type { Variant } from "../types.ts";
import { useEffect, useState, useRef } from "react";
import Editor from "@monaco-editor/react";

export const VariantSidebar = () => {
  const { selectedSpanId, selectedSpanText, setSelectedSpan, showVariants } = useAppStore();
  const { variants } = useBooksStore();

  const [selectedVariant, setSelectedVariant] = useState<Variant | undefined>();
  const [width, setWidth] = useState(700);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  useEffect(() => {
    setSelectedVariant(variants.find((variant) => variant.id === selectedSpanId));
  }, [selectedSpanId, variants]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;

      const newWidth = window.innerWidth - e.clientX;
      const maxWidth = window.innerWidth * 0.5; // 50% max width
      const minWidth = 400;

      setWidth(Math.min(Math.max(newWidth, minWidth), maxWidth));
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []); // Empty dependency array to set up listeners only once

  if (!showVariants || !selectedSpanId) {
    return null;
  }

  const convertVariantToXml = () => {
    if (!selectedVariant) {
      const originalText = selectedSpanText || "This is an example of the <em>original</em> sentence...";
      return `<Variants id="${selectedSpanId}">
<span score="70">${originalText}</span>
</Variants>`;
    }

    const { id, simplifications } = selectedVariant;

    const spans = simplifications
      .map(({ score, sentences }) => {
        return `  <span score="${score}">${sentences[0]}</span>`;
      })
      .join("\n");

    return `<Variants id="${id}">
${spans}
</Variants>`;
  };

  const handleChange = (content: string | undefined) => {
    if (!content) return;
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div className="variant-sidebar" ref={sidebarRef} style={{ width: `${width}px` }}>
      <div className="variant-sidebar-resize-handle" onMouseDown={handleResizeStart} />
      <div className="variant-sidebar-header">
        <h3>Variant Details</h3>
        <button className="variant-sidebar-close" onClick={() => setSelectedSpan(null)} aria-label="Close sidebar">
          ×
        </button>
      </div>
      <div className="variant-sidebar-content">
        <div style={{ flexShrink: 0 }}>
          <p>You are editing variants for original sentence:</p>
          <code>{selectedSpanText}</code>
        </div>
        <div style={{ flex: 1, minHeight: 0, marginTop: "20px" }}>
          <Editor
            height="100%"
            defaultLanguage="xml"
            value={convertVariantToXml()}
            onChange={handleChange}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: "on",
              automaticLayout: true,
              scrollBeyondLastLine: false,
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              overviewRulerBorder: false,
              scrollbar: { vertical: "auto", horizontal: "auto" },
            }}
          />
        </div>
      </div>
    </div>
  );
};
