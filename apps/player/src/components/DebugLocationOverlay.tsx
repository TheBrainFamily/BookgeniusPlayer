import { useLocation } from "@player/state/LocationContext";
import { useEffect, useState } from "react";
import { getMountedChapters } from "@player/logic/BookContentVirtualizer";

/**
 * Floating debug overlay showing current location and chapter info.
 * Toggle visibility with: localStorage.setItem('debug_overlay', 'true')
 */
export function DebugLocationOverlay() {
  const { location } = useLocation();
  const [isVisible, setIsVisible] = useState(false);
  const [mountedChapters, setMountedChapters] = useState<number[]>([]);
  const [scrollTop, setScrollTop] = useState(0);
  const [spacerHeight, setSpacerHeight] = useState(0);

  useEffect(() => {
    // Check localStorage for visibility
    const checkVisibility = () => {
      setIsVisible(localStorage.getItem("debug_overlay") === "true");
    };

    checkVisibility();

    // Listen for storage changes
    window.addEventListener("storage", checkVisibility);

    // Also poll in case it's set in the same tab
    const interval = setInterval(checkVisibility, 1000);

    return () => {
      window.removeEventListener("storage", checkVisibility);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const updateInfo = () => {
      setMountedChapters(getMountedChapters());

      const container = document.getElementById("content-container");
      if (container) {
        setScrollTop(Math.round(container.scrollTop));
      }

      const spacer = document.getElementById("virtual-top-spacer");
      if (spacer) {
        setSpacerHeight(parseFloat(spacer.style.height) || 0);
      }
    };

    updateInfo();

    // Update on scroll
    const container = document.getElementById("content-container");
    if (container) {
      container.addEventListener("scroll", updateInfo, { passive: true });
    }

    // Update periodically for mounted chapters
    const interval = setInterval(updateInfo, 500);

    return () => {
      if (container) {
        container.removeEventListener("scroll", updateInfo);
      }
      clearInterval(interval);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "10px",
        left: "10px",
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        color: "#00ff00",
        padding: "10px 14px",
        borderRadius: "8px",
        fontFamily: "monospace",
        fontSize: "12px",
        zIndex: 99999,
        lineHeight: 1.6,
        minWidth: "200px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
        border: "1px solid #333",
      }}
    >
      <div
        style={{
          fontWeight: "bold",
          marginBottom: "6px",
          color: "#fff",
          borderBottom: "1px solid #444",
          paddingBottom: "4px",
        }}
      >
        Debug Info
      </div>
      <div>
        <span style={{ color: "#888" }}>Chapter:</span>{" "}
        <span style={{ color: "#ff0" }}>{location.currentChapter}</span>
      </div>
      <div>
        <span style={{ color: "#888" }}>Paragraph:</span>{" "}
        <span style={{ color: "#ff0" }}>{location.currentParagraph}</span>
      </div>
      <div style={{ marginTop: "4px", paddingTop: "4px", borderTop: "1px solid #333" }}>
        <span style={{ color: "#888" }}>Range:</span>{" "}
        <span style={{ color: "#0ff" }}>
          {location.chapter}:{location.paragraph} → {location.endChapter}:{location.endParagraph}
        </span>
      </div>
      <div style={{ marginTop: "4px", paddingTop: "4px", borderTop: "1px solid #333" }}>
        <span style={{ color: "#888" }}>Mounted:</span>{" "}
        <span style={{ color: "#f0f" }}>[{mountedChapters.join(", ")}]</span>
      </div>
      <div>
        <span style={{ color: "#888" }}>Spacer:</span>{" "}
        <span style={{ color: "#f80" }}>{spacerHeight}px</span>
      </div>
      <div>
        <span style={{ color: "#888" }}>Scroll:</span>{" "}
        <span style={{ color: "#8f8" }}>{scrollTop}px</span>
      </div>
    </div>
  );
}
