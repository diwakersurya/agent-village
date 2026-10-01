import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

const FOCUSABLE = 'button:not([disabled]),[href],textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal overlay behaviour: while `open`, focus moves inside (to `initial`, else the container) and Tab stays inside;
 * on close, focus goes back where it was. Esc closes from anywhere inside — even a textarea, which the global
 * keyboard handler ignores — and doesn't fall through to it (so one Esc doesn't also deselect / leave walk mode).
 * Spread `props` on the dialog element.
 */
export function useDialog<T extends HTMLElement>(open: boolean, onClose: () => void, initial?: RefObject<HTMLElement | null>) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const target = initial?.current && !(initial.current as HTMLButtonElement).disabled ? initial.current : ref.current;
    target?.focus({ preventScroll: true });
    return () => { if (prev?.isConnected && prev !== document.body) prev.focus({ preventScroll: true }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus once per opening
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<T>) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab' || !ref.current) return;
    const els = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return { ref, props: { ref, onKeyDown, tabIndex: -1, role: 'dialog' as const, 'aria-modal': true as const } };
}
