import { useEffect, useRef, RefObject } from 'react';

interface UseScrollRestoreOptions {
  scrollPosition: number;
  setScrollPosition: (position: number) => void;
  debounceMs?: number;
}

export function useScrollRestore<T extends HTMLElement>(
  options: UseScrollRestoreOptions
): RefObject<T | null> {
  const { scrollPosition, setScrollPosition, debounceMs = 100 } = options;
  const ref = useRef<T | null>(null);
  const hasRestored = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Restore scroll position on mount
  useEffect(() => {
    if (ref.current && scrollPosition > 0 && !hasRestored.current) {
      // Small delay to ensure content is rendered
      requestAnimationFrame(() => {
        if (ref.current) {
          ref.current.scrollTop = scrollPosition;
          hasRestored.current = true;
        }
      });
    }
  }, [scrollPosition]);

  // Save scroll position on scroll
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleScroll = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        if (ref.current) {
          setScrollPosition(ref.current.scrollTop);
        }
      }, debounceMs);
    };

    element.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      element.removeEventListener('scroll', handleScroll);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [setScrollPosition, debounceMs]);

  return ref;
}
