import { useEffect, useRef, useState } from "react";
import debounce from "lodash.debounce";
import { DebouncedFunc } from "lodash";

/**
 * React hook that returns a debounced version of `value`.
 * The update is postponed until `delayMs` ms have elapsed
 * without the value changing again.
 */
export function useDebounce<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value);

  /* keep one debounced setter instance */
  const debouncedSetter = useRef<DebouncedFunc<(v: T) => void> | null>(null);

  useEffect(() => {
    debouncedSetter.current = debounce((v: T) => setDebounced(v), delayMs, { leading: false, trailing: true });
    return () => {
      debouncedSetter.current?.cancel();
    };
  }, [delayMs]);

  /* feed the latest value to the debounced function */
  useEffect(() => {
    debouncedSetter.current?.(value);
  }, [value]);

  return debounced;
}
