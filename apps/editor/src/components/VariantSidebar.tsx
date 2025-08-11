import { useAppStore } from "../stores/appStore";
import { useBooksStore } from "../stores/booksStore.ts";
import type { Variant } from "../types.ts";
import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";

export const VariantSidebar = () => {
  const { selectedSpanId, selectedSpanText, setSelectedSpan, showVariants } = useAppStore();
  const { variants } = useBooksStore();

  const [selectedVariant, setSelectedVariant] = useState<Variant | undefined>();

  useEffect(() => {
    setSelectedVariant(variants.find((variant) => variant.id === selectedSpanId));
  }, [selectedSpanId, variants]);

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

    console.log("40: content BANG!", content);
  };

  return (
    <div className="variant-sidebar">
      <div className="variant-sidebar-header">
        <h3>Variant Details</h3>
        <button className="variant-sidebar-close" onClick={() => setSelectedSpan(null)} aria-label="Close sidebar">
          ×
        </button>
      </div>
      <div className="variant-sidebar-content">
        <p>You are editing variants for original sentence:</p>
        <code>{selectedSpanText}</code>
        <Editor
          height="100%"
          defaultLanguage="xml"
          value={convertVariantToXml()}
          onChange={handleChange}
          options={{ minimap: { enabled: false }, fontSize: 14, wordWrap: "on", automaticLayout: true }}
        />
      </div>
    </div>
  );
};
