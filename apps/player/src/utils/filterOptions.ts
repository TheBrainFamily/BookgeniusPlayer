export type SearchFilter = "all" | "mentioned" | "talking";

export const FILTER_OPTIONS: Array<{ id: SearchFilter; translationKey: string; defaultLabel: string }> = [
  { id: "all", translationKey: "search_filter_all", defaultLabel: "All" },
  { id: "mentioned", translationKey: "search_filter_mentioned", defaultLabel: "Mentioned" },
  { id: "talking", translationKey: "search_filter_talking", defaultLabel: "Talking" },
];

export const FILTER_VALUE_MAP: Record<SearchFilter, string | null> = { all: null, mentioned: "Mentioned", talking: "Talking" };
