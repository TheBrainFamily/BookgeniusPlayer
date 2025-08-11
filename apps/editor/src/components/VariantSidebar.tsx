import { useAppStore } from "../stores/appStore";

export const VariantSidebar = () => {
  const { selectedSpanId, setSelectedSpanId, showVariants } = useAppStore();

  // Don't render if showVariants is false or no span is selected
  if (!showVariants || !selectedSpanId) {
    return null;
  }

  return (
    <div className="variant-sidebar">
      <div className="variant-sidebar-header">
        <h3>Variant Details</h3>
        <button 
          className="variant-sidebar-close"
          onClick={() => setSelectedSpanId(null)}
          aria-label="Close sidebar"
        >
          ×
        </button>
      </div>
      <div className="variant-sidebar-content">
        <p>Selected Span ID:</p>
        <code>{selectedSpanId}</code>
      </div>
    </div>
  );
};