import React from "react";
import { useTranslation } from "react-i18next";
import { Monitor, Moon, Zap, Sun, Layers, Wind, Timer } from "lucide-react";

import ModalUI from "@player/components/modals/ModalUI";
import { Label } from "@player/components/ui/label";
import { Slider } from "@player/components/ui/slider";
import { cn } from "@player/lib/utils";
import { useGraphicsSettings, type GraphicsQualityLevel, type AnimationSpeed } from "@player/stores/graphicsSettings.store";

interface GraphicsSettingsModalProps {
  onClose: () => void;
}

const QUALITY_OPTIONS: { value: GraphicsQualityLevel; icon: React.ElementType; labelKey: string; descKey: string }[] = [
  { value: "full", icon: Monitor, labelKey: "graphics_full", descKey: "graphics_full_desc" },
  { value: "reduced", icon: Moon, labelKey: "graphics_reduced", descKey: "graphics_reduced_desc" },
  { value: "minimal", icon: Zap, labelKey: "graphics_minimal", descKey: "graphics_minimal_desc" },
  { value: "bright", icon: Sun, labelKey: "graphics_bright", descKey: "graphics_bright_desc" },
];

const SPEED_OPTIONS: { value: AnimationSpeed; labelKey: string }[] = [
  { value: 1, labelKey: "speed_normal" },
  { value: 2, labelKey: "speed_slow" },
  { value: 0, labelKey: "speed_stop" },
];

const GraphicsSettingsModal: React.FC<GraphicsSettingsModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const { qualityLevel, backgroundBlur, animationSpeed, setQualityLevel, setBackgroundBlur, setAnimationSpeed } = useGraphicsSettings();

  return (
    <ModalUI title={t("graphics_settings", "Graphics")} onClose={onClose}>
      <div className="container max-h-[60vh] overflow-y-auto px-1 space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-white" />
            <Label className="text-sm font-medium text-white">{t("quality_level", "Quality Level")}</Label>
          </div>
          <div className="space-y-2">
            {QUALITY_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = qualityLevel === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setQualityLevel(option.value)}
                  className={cn(
                    "w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left",
                    isSelected ? "bg-white/20 border-white/40" : "bg-black/30 border-white/10 hover:bg-white/10 hover:border-white/20",
                  )}
                >
                  <Icon className={cn("h-5 w-5 mt-0.5 flex-shrink-0", isSelected ? "text-blue-400" : "text-white/60")} />
                  <div className="flex-1 min-w-0">
                    <div className={cn("font-medium", isSelected ? "text-white" : "text-white/90")}>
                      {t(option.labelKey, option.value === "full" ? "Full" : option.value === "reduced" ? "Reduced" : option.value === "minimal" ? "Minimal" : "Bright")}
                    </div>
                    <div className="text-xs text-white/60 mt-0.5">
                      {t(
                        option.descKey,
                        option.value === "full"
                          ? "Animated backgrounds, full avatars"
                          : option.value === "reduced"
                            ? "Dark mode, optimized for reading"
                            : option.value === "minimal"
                              ? "Dark mode, simplified avatars"
                              : "Light mode, optimized for reading",
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className={cn("p-4 rounded-lg bg-black/50 border border-white/20 transition-all duration-300 w-full", qualityLevel !== "full" && "opacity-50")}>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Wind className="h-4 w-4 text-white" />
              <Label className="text-sm font-medium text-white">
                {t("background_blur", "Background Blur")}: <span className="text-blue-300">{backgroundBlur}px</span>
              </Label>
            </div>
            <Slider
              disabled={qualityLevel !== "full"}
              variant="secondary"
              min={0}
              max={20}
              step={1}
              value={[backgroundBlur]}
              onValueChange={(value) => setBackgroundBlur(value[0])}
              aria-label={t("background_blur", "Background Blur")}
              className="[&_[role=slider]]:bg-white [&_[role=slider]]:border-white/50"
            />
            <div className="flex justify-between text-xs text-gray-300">
              <span>{t("none", "None")}</span>
              <span>{t("maximum", "Maximum")}</span>
            </div>
          </div>
        </div>

        <div className={cn("p-4 rounded-lg bg-black/50 border border-white/20 transition-all duration-300 w-full", qualityLevel !== "full" && "opacity-50")}>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-white" />
              <Label className="text-sm font-medium text-white">{t("animation_speed", "Animation Speed")}</Label>
            </div>
            <div className="flex gap-2">
              {SPEED_OPTIONS.map((option) => {
                const isSelected = animationSpeed === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={qualityLevel !== "full"}
                    onClick={() => setAnimationSpeed(option.value)}
                    className={cn(
                      "flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all",
                      isSelected ? "bg-white/20 border-white/40 text-white" : "bg-black/30 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20",
                      qualityLevel !== "full" && "cursor-not-allowed",
                    )}
                  >
                    {t(option.labelKey, option.value === 1 ? "Normal" : option.value === 2 ? "Slow" : "Stop")}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </ModalUI>
  );
};

export default GraphicsSettingsModal;
