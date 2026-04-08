'use client';

import { useEffect, useRef } from 'react';
import { useLeadsStore } from '@/stores';

interface LeadsPageClientProps {
  children: React.ReactNode;
}

export function LeadsPageClient({ children }: LeadsPageClientProps) {
  const { scrollPosition, setScrollPosition } = useLeadsStore();
  const hasRestored = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Restore scroll position on mount
  useEffect(() => {
    if (scrollPosition > 0 && !hasRestored.current) {
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollPosition);
        hasRestored.current = true;
      });
    }
  }, [scrollPosition]);

  // Save scroll position on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setScrollPosition(window.scrollY);
      }, 100);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [setScrollPosition]);

  return <>{children}</>;
}
