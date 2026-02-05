import React, { useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@player/components/ui/dialog";
import { cn } from "@player/lib/utils";

interface ImageZoomModalProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

type PointerPosition = { x: number; y: number };

const MIN_SCALE = 1;
const MAX_SCALE = 5;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getDistance = (a: PointerPosition, b: PointerPosition) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
};

const getMidpoint = (a: PointerPosition, b: PointerPosition) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

const ImageZoomModal: React.FC<ImageZoomModalProps> = ({ src, alt, onClose }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const baseSizeRef = useRef<{ width: number; height: number } | null>(null);
  const pointersRef = useRef<Map<number, PointerPosition>>(new Map());
  const lastPanRef = useRef<PointerPosition | null>(null);
  const pinchRef = useRef<{
    startDistance: number;
    startScale: number;
    startX: number;
    startY: number;
    startMid: PointerPosition;
  } | null>(null);
  const transformRef = useRef({ scale: 1, x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  const applyTransform = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const img = imgRef.current;
      if (!img) return;
      const { scale, x, y } = transformRef.current;
      img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    });
  }, []);

  const clampTranslate = useCallback(() => {
    const container = containerRef.current;
    const base = baseSizeRef.current;
    if (!container || !base) return;

    const rect = container.getBoundingClientRect();
    const { scale } = transformRef.current;

    if (scale <= 1) {
      transformRef.current.x = 0;
      transformRef.current.y = 0;
      return;
    }

    const maxOffsetX = Math.max(0, (base.width * scale - rect.width) / 2);
    const maxOffsetY = Math.max(0, (base.height * scale - rect.height) / 2);

    transformRef.current.x = clamp(transformRef.current.x, -maxOffsetX, maxOffsetX);
    transformRef.current.y = clamp(transformRef.current.y, -maxOffsetY, maxOffsetY);
  }, []);

  const resetTransform = useCallback(() => {
    transformRef.current = { scale: 1, x: 0, y: 0 };
    if (imgRef.current) {
      imgRef.current.style.transform = "translate(0px, 0px) scale(1)";
    }
  }, []);

  const handleImageLoad = useCallback(() => {
    resetTransform();
    if (imgRef.current) {
      const rect = imgRef.current.getBoundingClientRect();
      baseSizeRef.current = { width: rect.width, height: rect.height };
    }
  }, [resetTransform]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;

    container.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 1) {
      lastPanRef.current = { x: event.clientX, y: event.clientY };
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const [p1, p2] = Array.from(pointersRef.current.values());
      pinchRef.current = {
        startDistance: getDistance(p1, p2),
        startScale: transformRef.current.scale,
        startX: transformRef.current.x,
        startY: transformRef.current.y,
        startMid: getMidpoint(p1, p2),
      };
      lastPanRef.current = null;
    }
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(event.pointerId)) return;

      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointersRef.current.size === 1) {
        if (transformRef.current.scale <= 1) return;
        const last = lastPanRef.current;
        if (!last) return;
        const dx = event.clientX - last.x;
        const dy = event.clientY - last.y;
        transformRef.current.x += dx;
        transformRef.current.y += dy;
        lastPanRef.current = { x: event.clientX, y: event.clientY };
        clampTranslate();
        applyTransform();
        return;
      }

      if (pointersRef.current.size >= 2 && pinchRef.current) {
        const [p1, p2] = Array.from(pointersRef.current.values());
        const dist = getDistance(p1, p2);
        const nextScale = clamp(
          pinchRef.current.startScale * (dist / pinchRef.current.startDistance),
          MIN_SCALE,
          MAX_SCALE,
        );
        const mid = getMidpoint(p1, p2);
        const dx = mid.x - pinchRef.current.startMid.x;
        const dy = mid.y - pinchRef.current.startMid.y;
        transformRef.current.scale = nextScale;
        transformRef.current.x = pinchRef.current.startX + dx;
        transformRef.current.y = pinchRef.current.startY + dy;
        clampTranslate();
        applyTransform();
      }
    },
    [applyTransform, clampTranslate],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(event.pointerId)) return;
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size < 2) {
        pinchRef.current = null;
      }
      if (pointersRef.current.size === 1) {
        const [remaining] = Array.from(pointersRef.current.values());
        lastPanRef.current = remaining ?? null;
      } else {
        lastPanRef.current = null;
      }

      if (transformRef.current.scale <= 1) {
        transformRef.current = { scale: 1, x: 0, y: 0 };
        applyTransform();
      }
    },
    [applyTransform],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { scale, x, y } = transformRef.current;
      const nextScale = clamp(scale * (1 - event.deltaY * 0.0015), MIN_SCALE, MAX_SCALE);
      if (nextScale === scale) return;

      const rect = container.getBoundingClientRect();
      const pointer = {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      };
      const scaleRatio = nextScale / scale;
      transformRef.current.scale = nextScale;
      transformRef.current.x = x + (1 - scaleRatio) * pointer.x;
      transformRef.current.y = y + (1 - scaleRatio) * pointer.y;

      clampTranslate();
      applyTransform();
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [applyTransform, clampTranslate]);

  useEffect(() => {
    resetTransform();
  }, [src, resetTransform]);

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()} modal>
      <DialogTitle className="sr-only">{alt || "Image"}</DialogTitle>
      <DialogContent
        overlayProps={{ useCustomAnimation: true, className: "bg-black" }}
        className={cn(
          "fixed inset-0 left-0 top-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none max-h-none",
          "bg-transparent border-none shadow-none p-0",
        )}
        style={{ top: 0, left: 0, maxHeight: "none", height: "var(--vvh, 100dvh)" }}
        onPointerDown={(e) => {
          // Prevent dragging the dialog itself
          e.preventDefault();
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          aria-label="Close image"
        >
          <X size={20} />
        </button>

        <div
          ref={containerRef}
          className="relative z-10 flex h-full w-full items-center justify-center touch-none overscroll-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <img
            ref={imgRef}
            src={src}
            alt={alt || "Figure"}
            draggable={false}
            onLoad={handleImageLoad}
            className={cn(
              "select-none will-change-transform object-contain",
              "max-h-[calc(var(--vvh,100dvh)-32px)] max-w-[calc(100vw-32px)]",
              src.toLowerCase().includes(".svg") && "bg-white rounded",
            )}
            style={{ transform: "translate(0px, 0px) scale(1)", transformOrigin: "center" }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImageZoomModal;
