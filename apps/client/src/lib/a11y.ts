import { useEffect, useRef } from 'react';

let liveRegion: HTMLElement | null = null;

/** Tells screen readers about a change that happens away from the focus. */
export function announce(message: string) {
    if (!liveRegion) {
        liveRegion = document.createElement('div');
        liveRegion.setAttribute('role', 'status');
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.className = 'sr-only';
        document.body.appendChild(liveRegion);
    }
    const region = liveRegion;
    // Clearing first makes the same message be read again when it repeats.
    region.textContent = '';
    window.setTimeout(() => { region.textContent = message; }, 100);
}

/** Names the screen and, after a navigation left the focus on nothing, moves it to the h1. */
export function usePageTitle(title: string) {
    useEffect(() => {
        document.title = `${title} · Hermes`;
        if (document.activeElement && document.activeElement !== document.body) return;
        const heading = document.querySelector<HTMLElement>('h1');
        if (!heading) return;
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
    }, [title]);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Modal behavior: takes the focus, keeps Tab inside, closes with Escape and gives the focus back. */
export function useDialog<T extends HTMLElement>(onClose: () => void) {
    const ref = useRef<T>(null);
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        const previous = document.activeElement as HTMLElement | null;
        if (!dialog.contains(document.activeElement)) {
            dialog.tabIndex = -1;
            dialog.focus();
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onCloseRef.current();
                return;
            }
            if (event.key !== 'Tab') return;
            const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
            if (items.length === 0) {
                event.preventDefault();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement;
            if (event.shiftKey && (active === first || active === dialog)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            previous?.focus?.();
        };
    }, []);

    return ref;
}
