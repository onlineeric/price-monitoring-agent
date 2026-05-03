"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * `isAtBottom` is treated as true while the user's last scroll position is
 * within this many pixels of the actual scroll-bottom. Generous enough to
 * survive a single streamed chunk pushing content past the viewport before
 * the auto-scroll effect runs.
 */
const NEAR_BOTTOM_THRESHOLD_PX = 80;

/**
 * Auto-scroll-with-user-pause hook for the chat thread.
 *
 * `isAtBottom` is updated from scroll events only — not from layout/resize.
 * That distinction is what makes the streaming case work: when a text-delta
 * lands and grows the thread height, the sentinel briefly sits below the
 * viewport, but no scroll event has fired yet, so `isAtBottom` is still
 * `true` and the consumer's effect can call `scrollIntoView` to follow the
 * new content. The programmatic scroll then fires a `scroll` event that
 * keeps `isAtBottom` true at the new bottom.
 *
 * The earlier `IntersectionObserver` implementation flipped `isAtBottom` to
 * `false` on every transient layout shift during streaming, leaving the
 * thread frozen above the latest content until the user manually scrolled
 * back down.
 */
export function useAutoScrollToBottom<
  Container extends HTMLElement = HTMLDivElement,
  Sentinel extends HTMLElement = HTMLDivElement,
>() {
  const scrollContainerRef = useRef<Container | null>(null);
  const sentinelRef = useRef<Sentinel | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const measure = () => {
      const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
      setIsAtBottom(distance <= NEAR_BOTTOM_THRESHOLD_PX);
    };

    container.addEventListener("scroll", measure, { passive: true });
    measure();

    return () => container.removeEventListener("scroll", measure);
  }, []);

  const jumpToLatest = useCallback(() => {
    sentinelRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  return { scrollContainerRef, sentinelRef, isAtBottom, jumpToLatest };
}
