import { useEditorMode } from "@/hooks/useEditorMode";

export function useBookContent(containerId: string) {
  const container = document.getElementById(containerId);
  const isEditorMode = import.meta.env.VITE_EDITOR === "true";

  useEditorMode(isEditorMode ? container : null);
}
