"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Auto-scroll-with-user-pause hook for the chat thread.
 *
 * Implementation per `specs/005-chat-page-ui/research.md` §3:
 * - A sentinel `<div>` is rendered at the bottom of the thread.
 * - An `IntersectionObserver` watches the sentinel. While it intersects
 *   the scroll container, we are "at bottom" and auto-scroll on new content.
 * - When the user scrolls up, the sentinel leaves the viewport, `isAtBottom`
 *   flips to `false`, auto-scroll pauses, and the consumer surfaces a
 *   "Jump to latest" button that calls `jumpToLatest()`.
 */
export function useAutoScrollToBottom<
  Container extends HTMLElement = HTMLDivElement,
  Sentinel extends HTMLElement = HTMLDivElement,
>() {
  const scrollContainerRef = useRef<Container | null>(null);
  const sentinelRef = useRef<Sentinel | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setIsAtBottom(entry.isIntersecting);
        }
      },
      { root: container, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const jumpToLatest = useCallback(() => {
    sentinelRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  return { scrollContainerRef, sentinelRef, isAtBottom, jumpToLatest };
}
