'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Modal sheet behavior: esc closes; focus moves into the sheet, stays inside on tab, and
 * returns to where it was on close; the page behind doesn't scroll. Something inside that
 * wants esc for itself (an editor) stops the event from propagating.
 */
export function useSheet(dialog: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement;
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key !== 'Tab' || !dialog.current) return;
      const stops = [
        ...dialog.current.querySelectorAll<HTMLElement | SVGElement>('button, a[href], input, textarea, [tabindex="0"]'),
      ];
      const edge = e.shiftKey ? stops[0] : stops.at(-1);
      if (document.activeElement === edge || document.activeElement === dialog.current) {
        e.preventDefault();
        (e.shiftKey ? stops.at(-1) : stops[0])?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (before instanceof HTMLElement || before instanceof SVGElement) before.focus();
    };
  }, [dialog]);
}
