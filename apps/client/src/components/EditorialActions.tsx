import { useEffect, useRef, useState } from 'react';
import { ChevronDown, UserRound } from 'lucide-react';
import { FeedbackButton } from './FeedbackButton';
import { MyPreferencesButton } from './MyPreferencesButton';
import { useAuth } from '../contexts/AuthContext';

// Keep in sync with the w-56 class below.
const MENU_WIDTH = 224;

export function EditorialActions({ articleUrl }: { articleUrl?: string }) {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [alignLeft, setAlignLeft] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onEscape = (event: KeyboardEvent) => {
            // A modal opened from here handles its own Escape.
            if (event.key === 'Escape' && containerRef.current?.contains(document.activeElement)) setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onEscape);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onEscape);
        };
    }, [open]);

    if (user?.role === 'DEMO') return null;

    const toggle = () => {
        // Open to the left of the trigger unless that would run off the screen (e.g. wrapped mobile menu).
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) setAlignLeft(rect.right - MENU_WIDTH < 8);
        setOpen(current => !current);
    };

    // The items stay mounted while the menu is hidden so their modals (portaled to body) survive it closing.
    return <div ref={containerRef} className="relative">
        <button type="button" onClick={toggle} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded border border-editorial-text/15 px-2.5 py-2 font-sans text-[10px] font-bold uppercase tracking-wider text-editorial-text/75 transition-colors hover:border-editorial-text/50 hover:bg-editorial-text/5 hover:text-editorial-text">
            <UserRound size={14} />
            <span>Personal</span>
            <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <div role="group" aria-label="Ayuda y ajustes de escritura" onClick={() => setOpen(false)} className={`${open ? 'flex' : 'hidden'} absolute top-full ${alignLeft ? 'left-0' : 'right-0'} z-50 mt-2 w-56 flex-col gap-0.5 rounded border border-editorial-text/20 bg-editorial-bg p-1.5 shadow-xl`}>
            <MyPreferencesButton menuItem />
            <div className="my-1 border-t border-editorial-text/10" />
            <FeedbackButton kind="ERROR" articleUrl={articleUrl} menuItem />
            <FeedbackButton kind="SUGGESTION" menuItem />
        </div>
    </div>;
}
