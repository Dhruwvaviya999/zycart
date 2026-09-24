'use client';

import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react';

/** How far the mouse travels before a press is a drag rather than a click. */
const DRAG_THRESHOLD_PX = 6;

/** How far a drag has to go before it commits to the next card in its direction. */
const COMMIT_PX = 40;

/** Fallback for browsers without `scrollend`: long enough for a smooth scroll to land. */
const SETTLE_MS = 600;

type Drag = { pointerId: number; x: number; travelled: number; moved: boolean };

/**
 * Lets a mouse drag a horizontal scroll container.
 *
 * Touch and trackpads already scroll it natively; a mouse can only use the
 * wheel or the arrows, which is not what a row of cards invites. This covers
 * that one gap and leaves every other input to the browser, so it only ever
 * acts on `pointerType === 'mouse'`.
 *
 * A press stays a click until it travels past a threshold, so the cards remain
 * links. Once it is a drag, snapping is switched off — with it on, every
 * `scrollLeft` write is pulled back to the nearest card — and on release the
 * rail is carried onto a card and snapping is handed back once it has landed.
 * The click that follows the release is swallowed, so letting go over a card
 * does not open it.
 */
export function useDragScroll(ref: RefObject<HTMLElement | null>) {
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);

  const settle = useCallback((rail: HTMLElement, travelled: number) => {
    const cards = Array.from(rail.children) as HTMLElement[];
    const first = cards[0];
    if (!first) return;

    // Each card's snapped position. The container's inline padding equals its
    // scroll padding, so the first card rests at 0 and the rest follow it.
    const max = rail.scrollWidth - rail.clientWidth;
    const stops = cards.map((card) => Math.min(card.offsetLeft - first.offsetLeft, max));
    const at = rail.scrollLeft;

    let target: number;
    if (travelled >= COMMIT_PX) {
      target = stops.find((stop) => stop >= at) ?? max;
    } else if (travelled <= -COMMIT_PX) {
      target = stops.findLast((stop) => stop <= at) ?? 0;
    } else {
      target = stops.reduce((best, stop) => (Math.abs(stop - at) < Math.abs(best - at) ? stop : best));
    }

    const restore = () => {
      window.clearTimeout(timer);
      rail.removeEventListener('scrollend', restore);
      // A new drag may have started while this one was landing.
      if (drag.current?.moved) return;
      rail.style.scrollSnapType = '';
      rail.style.scrollBehavior = '';
    };
    const timer = window.setTimeout(restore, SETTLE_MS);
    rail.addEventListener('scrollend', restore);
    rail.scrollTo({ left: target, behavior: 'smooth' });
  }, []);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const rail = ref.current;
      if (!rail || event.pointerType !== 'mouse' || event.button !== 0) return;

      suppressClick.current = false;
      drag.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        travelled: 0,
        moved: false,
      };
    },
    [ref],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const state = drag.current;
      const rail = ref.current;
      if (!state || !rail || event.pointerId !== state.pointerId) return;

      const dx = event.clientX - state.x;

      if (!state.moved) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        state.moved = true;
        // Captured only now, not on press: a captured pointer's click lands on
        // the rail instead of the card, which would break an ordinary click.
        rail.setPointerCapture(event.pointerId);
        rail.style.scrollSnapType = 'none';
        rail.style.scrollBehavior = 'auto';
        setDragging(true);
      }

      // Applied as a step from the last event, not as an offset from where the
      // drag began, so a rail that repositions itself mid-drag (a looping one
      // recentring) carries on from wherever it now is.
      state.x = event.clientX;
      state.travelled -= dx;
      rail.scrollLeft -= dx;
    },
    [ref],
  );

  const onPointerEnd = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const state = drag.current;
      const rail = ref.current;
      if (!state || event.pointerId !== state.pointerId) return;

      drag.current = null;
      if (!state.moved || !rail) return;

      setDragging(false);
      suppressClick.current = true;
      // The click, if one comes, is dispatched straight after the release;
      // anything later is a fresh click and must go through.
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);

      settle(rail, state.travelled);
    },
    [ref, settle],
  );

  const onClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  /** Links and images are natively draggable, which would steal the gesture. */
  const onDragStart = useCallback((event: DragEvent<HTMLElement>) => event.preventDefault(), []);

  return {
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onClickCapture,
      onDragStart,
    },
  };
}
