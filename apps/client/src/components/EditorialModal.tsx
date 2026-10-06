import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

export function EditorialModal({ title, eyebrow, onClose, children, wide = false }: {
    title: string;
    eyebrow?: string;
    onClose: () => void;
    children: ReactNode;
    wide?: boolean;
}) {
    useEffect(() => {
        const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onEscape);
        return () => document.removeEventListener('keydown', onEscape);
    }, [onClose]);

    return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-editorial-text/65 px-4 py-8 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }} role="presentation">
        <section role="dialog" aria-modal="true" aria-label={title} className={`w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} max-h-full overflow-y-auto border border-editorial-text/20 bg-editorial-bg shadow-[0_28px_90px_rgba(12,12,30,.32)] font-sans text-editorial-text`}>
            <div className="flex items-start justify-between gap-6 border-b border-editorial-text/15 px-6 py-5 sm:px-8">
                <div>
                    {eyebrow && <p className="mb-1 text-[10px] font-bold uppercase tracking-[.22em] text-editorial-text/50">{eyebrow}</p>}
                    <h2 className="font-serif text-2xl font-black italic leading-tight sm:text-3xl">{title}</h2>
                </div>
                <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-full border border-editorial-text/15 p-2 text-editorial-text/60 transition-colors hover:border-editorial-text hover:text-editorial-text"><X size={17} /></button>
            </div>
            <div className="space-y-5 px-6 py-6 sm:px-8">{children}</div>
        </section>
    </div>, document.body);
}
