import { useEffect, useState } from "react";

/**
 * Generic debounce hook – returns `value` but only changes after
 * `delayMs` of silence.
 */
export function useDebounce<T>(value: T, delayMs = 100): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
