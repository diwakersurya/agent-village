import { useCallback, useEffect, useRef } from 'react';

const SLACK = 24; // px from the bottom that still counts as "at the bottom"

/**
 * Follows the bottom of a scroller as content changes, unless the user scrolled up to read.
 * Attach `ref` + `onScroll` to the scroller; pass whatever changes when new content arrives as `dep`.
 */
export function useStickToBottom<T extends HTMLElement = HTMLDivElement>(dep: unknown) {
  const ref = useRef<T>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [dep]);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < SLACK;
  }, []);

  return { ref, onScroll };
}
