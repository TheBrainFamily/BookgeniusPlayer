import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { History, RotateCcw, TrendingUp } from "lucide-react";

import ModalUI from "@player/components/modals/ModalUI";
import { Button } from "../ui/button";
import { getPositionHistory, getCurrentPlatformAndBook, promotePosition, type ReadingPosition } from "@player/services/readingPositionApi";
import { processPositionHistory, formatTimestamp, type ProcessedSession } from "@player/helpers/processPositionHistory";
import { systemNavigateTo } from "@player/helpers/paragraphsNavigation";
import { initializeReadingPosition } from "@player/services/initializeReadingPosition";

interface PositionHistoryModalProps {
  onClose: () => void;
}

const PositionHistoryModal: React.FC<PositionHistoryModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<ProcessedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const { platformId, bookSlug } = getCurrentPlatformAndBook();
      const history = await getPositionHistory(platformId, bookSlug, 100);
      const processed = processPositionHistory(history);
      setSessions(processed);
    } catch (err) {
      console.error("Failed to load position history:", err);
      setError("Failed to load reading history");
    } finally {
      setLoading(false);
    }
  };

  const handleResetToPosition = async (position: ReadingPosition) => {
    try {
      // Call promote endpoint
      await promotePosition(position.id);

      // Refresh the latest position and update local
      await initializeReadingPosition();

      // Navigate to the position
      systemNavigateTo({ currentChapter: position.chapter, currentParagraph: position.paragraph }, { history: "push" });

      onClose();
    } catch (err) {
      console.error("Failed to reset to position:", err);
      // Avoid blocking alerts; log error only or set a non-blocking state if desired
      // setError("Failed to reset reading position");
    }
  };

  const formatProgress = (progress: number | null): string => {
    if (progress === null || progress === undefined) return "N/A";
    return `${Math.round(progress * 100)}%`;
  };

  if (loading) {
    return (
      <ModalUI title={t("position_history") || "Reading History"} onClose={onClose}>
        <div className="container max-h-[60vh] overflow-y-auto scrollbar-search text-white text-center py-8">Loading...</div>
      </ModalUI>
    );
  }

  if (error) {
    return (
      <ModalUI title={t("position_history") || "Reading History"} onClose={onClose}>
        <div className="container max-h-[60vh] overflow-y-auto scrollbar-search text-white text-center py-8">{error}</div>
      </ModalUI>
    );
  }

  if (sessions.length === 0) {
    return (
      <ModalUI title={t("position_history") || "Reading History"} onClose={onClose}>
        <div className="container max-h-[60vh] overflow-y-auto scrollbar-search text-white text-center py-8">No reading history available</div>
      </ModalUI>
    );
  }

  return (
    <ModalUI title={t("position_history") || "Reading History"} onClose={onClose}>
      <div className="container max-h-[60vh] overflow-y-auto scrollbar-search">
        {sessions.map((session, sessionIdx) => (
          <div key={sessionIdx} className="mb-6 last:mb-0">
            <div className="text-xs text-gray-400 mb-2 flex items-center gap-2">
              <History className="w-3 h-3" />
              <span>Session {sessions.length - sessionIdx}</span>
            </div>

            {/* Session Start */}
            <PositionEntry position={session.sessionStart} label="Started" onReset={handleResetToPosition} formatProgress={formatProgress} />

            {/* Significant Jumps */}
            {session.significantJumps.map((jump, jumpIdx) => (
              <PositionEntry key={jumpIdx} position={jump} label="Jump" onReset={handleResetToPosition} formatProgress={formatProgress} isJump />
            ))}

            {/* Session End (if different from start) */}
            {session.sessionEnd.id !== session.sessionStart.id && (
              <PositionEntry position={session.sessionEnd} label="Ended" onReset={handleResetToPosition} formatProgress={formatProgress} />
            )}
          </div>
        ))}
      </div>
    </ModalUI>
  );
};

interface PositionEntryProps {
  position: ReadingPosition;
  label: string;
  onReset: (position: ReadingPosition) => void;
  formatProgress: (progress: number | null) => string;
  isJump?: boolean;
}

const PositionEntry: React.FC<PositionEntryProps> = ({ position, label, onReset, formatProgress, isJump = false }) => {
  return (
    <div className={`mb-2 pl-4 ${isJump ? "border-l-2 border-yellow-500/50" : ""}`}>
      <Button
        variant="ghost"
        onPointerUp={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onReset(position);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onReset(position);
          }
        }}
        className="w-full h-auto !justify-between !items-start text-left px-3 py-2 hover:bg-white/10 cursor-pointer hover:text-white border-white/20 text-white"
      >
        <div className="flex flex-col gap-1 w-full">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {isJump && <TrendingUp className="w-3 h-3 text-yellow-500" />}
              <span className="text-xs text-gray-400">{label}</span>
            </div>
            <span className="text-xs text-gray-400">{formatTimestamp(position.createdAt)}</span>
          </div>
          <div className="flex items-center justify-between w-full">
            <span className="text-sm">
              Chapter {position.chapter}, Paragraph {position.paragraph}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{formatProgress(position.progress)}</span>
              <RotateCcw className="w-3 h-3 text-gray-400" />
            </div>
          </div>
        </div>
      </Button>
    </div>
  );
};

export default PositionHistoryModal;
