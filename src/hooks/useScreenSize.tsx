import { useState, useEffect } from 'react';

export function useIsBelowScreenSize(breakpoint = 680) {
  const [isBelow, setIsBelow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsBelow(e.matches);

    setIsBelow(mq.matches);
    mq.addEventListener('change', handler as EventListener);

    return () => {
      mq.removeEventListener('change', handler as EventListener);
    };
  }, [breakpoint]);

  return isBelow;
}
