import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { X } from 'lucide-react';

interface SectionOverride {
    id?: string;
    sectionId: string;
    source: string;
    path: string | null;
    scrapeLimit: number | null;
    enabled: boolean;
}

interface Section {
    id: string;
    name: string;
    path: string;
    scrapeLimit: number | null;
    overrides?: SectionOverride[];
}

interface Props {
    section: Section;
    sources: string[];
    globalLimit: number;
    onClose: () => void;
    onSaved: () => void; // refresh parent
}

// Per-source row state — mirrors a SectionOverride plus a "dirty" flag and a
// "useOverride" flag so the user can toggle whether the row exists at all.
interface RowState {
    source: string;
    useOverride: boolean;
    path: string;
    scrapeLimit: string;
    enabled: boolean;
    dirty: boolean;
}

export function SectionOverridesModal({ section, sources, globalLimit, onClose, onSaved }: Props) {
    const [rows, setRows] = useState<RowState[]>([]);
    const [saving, setSaving] = useState<string | null>(null);

    useEffect(() => {
        const initial = sources.map(src => {
            const ov = section.overrides?.find(o => o.source === src);
            return {
                source: src,
                useOverride: !!ov,
                path: ov?.path ?? '',
                scrapeLimit: ov?.scrapeLimit != null ? String(ov.scrapeLimit) : '',
                enabled: ov ? ov.enabled : true,
                dirty: false
            };
        });
        setRows(initial);
    }, [section.id, sources.join('|')]);

    const update = (source: string, patch: Partial<RowState>) => {
        setRows(rs => rs.map(r => r.source === source ? { ...r, ...patch, dirty: true } : r));
    };

    const saveRow = async (row: RowState) => {
        setSaving(row.source);
        try {
            if (!row.useOverride) {
                // Remove the override entirely.
                await api.delete(`/api/config/sections/${section.id}/overrides/${row.source}`);
            } else {
                await api.put(`/api/config/sections/${section.id}/overrides/${row.source}`, {
                    path: row.path.trim() || null,
                    scrapeLimit: row.scrapeLimit.trim() === '' ? null : parseInt(row.scrapeLimit, 10),
                    enabled: row.enabled
                });
            }
            setRows(rs => rs.map(r => r.source === row.source ? { ...r, dirty: false } : r));
            onSaved();
        } catch (err: any) {
            alert('Error: ' + (err.response?.data?.error || 'No se pudo guardar'));
        } finally {
            setSaving(null);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-editorial-bg max-w-2xl w-full max-h-[85vh] overflow-y-auto rounded shadow-2xl border border-editorial-text/20"
                onClick={e => e.stopPropagation()}
            >
                <div className="sticky top-0 bg-editorial-bg border-b border-editorial-text/10 px-6 py-4 flex justify-between items-start">
                    <div>
                        <div className="text-[10px] uppercase tracking-widest font-sans opacity-60">Sección</div>
                        <h2 className="text-xl font-bold font-serif">{section.name}</h2>
                        <div className="text-xs font-mono opacity-60 mt-1">
                            Defecto: <span className="bg-black/5 px-1.5 py-0.5 rounded">{section.path}</span>
                            <span className="ml-2">Límite: {section.scrapeLimit ?? `global (${globalLimit})`}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-editorial-text/50 hover:text-editorial-text">
                        <X size={18} />
                    </button>
                </div>

                <div className="px-6 py-4">
                    <p className="text-xs opacity-60 italic mb-4">
                        Por defecto, cada medio usa la ruta y el límite globales de la sección.
                        Activá un override para personalizar o desactivar la sección para un medio puntual.
                    </p>

                    <div className="flex flex-col gap-2">
                        {rows.map(row => (
                            <div
                                key={row.source}
                                className={`border px-3 py-3 rounded transition-colors ${
                                    row.useOverride ? 'border-editorial-text/30 bg-editorial-text/[0.02]' : 'border-editorial-text/10'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <span className="font-sans font-bold text-sm">{row.source}</span>
                                        {!row.useOverride && (
                                            <span className="text-[10px] uppercase tracking-widest font-sans opacity-50 italic">usa defaults</span>
                                        )}
                                    </div>
                                    <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-sans cursor-pointer">
                                        <span className="opacity-60">Override</span>
                                        <input
                                            type="checkbox"
                                            checked={row.useOverride}
                                            onChange={e => update(row.source, { useOverride: e.target.checked })}
                                            className="cursor-pointer"
                                        />
                                    </label>
                                </div>

                                {row.useOverride && (
                                    <div className="grid grid-cols-12 gap-2 items-end mt-3">
                                        <div className="col-span-6">
                                            <label className="text-[9px] uppercase tracking-widest font-sans opacity-60 block mb-1">Ruta</label>
                                            <input
                                                type="text"
                                                value={row.path}
                                                onChange={e => update(row.source, { path: e.target.value })}
                                                placeholder={section.path}
                                                className="w-full border border-editorial-text/20 px-2 py-1 text-xs font-mono focus:outline-none focus:border-editorial-text bg-white"
                                            />
                                        </div>
                                        <div className="col-span-3">
                                            <label className="text-[9px] uppercase tracking-widest font-sans opacity-60 block mb-1">Límite</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="100"
                                                value={row.scrapeLimit}
                                                onChange={e => update(row.source, { scrapeLimit: e.target.value })}
                                                placeholder={String(section.scrapeLimit ?? globalLimit)}
                                                className="w-full border border-editorial-text/20 px-2 py-1 text-xs font-mono focus:outline-none focus:border-editorial-text bg-white"
                                            />
                                        </div>
                                        <div className="col-span-3 flex items-center justify-center pb-1">
                                            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-sans cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={row.enabled}
                                                    onChange={e => update(row.source, { enabled: e.target.checked })}
                                                    className="cursor-pointer"
                                                />
                                                <span className={row.enabled ? '' : 'opacity-60'}>Activa</span>
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {row.dirty && (
                                    <div className="flex justify-end mt-3">
                                        <button
                                            onClick={() => saveRow(row)}
                                            disabled={saving === row.source}
                                            className="bg-editorial-text text-editorial-bg px-3 py-1 font-bold uppercase tracking-widest text-[10px] hover:bg-black transition-colors disabled:opacity-50"
                                        >
                                            {saving === row.source ? 'Guardando…' : 'Guardar'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
