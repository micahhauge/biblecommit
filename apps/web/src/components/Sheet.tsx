'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Sheet.module.css';

/**
 * A titled dialog: a bottom sheet on mobile, centered on desktop. Closes on esc, the close
 * button, or the scrim. Focus moves in, stays in while tabbing, and goes back on close; the
 * page behind doesn't scroll.
 */
export function Sheet({ title, onClose, children }: { title: ReactNode; onClose(): void; children: ReactNode }) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const before = document.activeElement;
    dialog.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key !== 'Tab' || !dialog.current) return;
      const stops = [...dialog.current.querySelectorAll<HTMLElement | SVGElement>('button, [tabindex="0"]')];
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
  }, []);

  // Above everything, including the tab bar: <main> is its own stacking context.
  return createPortal(
    <>
      <div className={styles.scrim} data-testid="scrim" onClick={onClose} />
      <div ref={dialog} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className={styles.grab} aria-hidden="true" />
        <button type="button" className={styles.close} onClick={onClose}>
          close
        </button>
        <h3 id={titleId}>{title}</h3>
        {children}
      </div>
    </>,
    document.body,
  );
}
