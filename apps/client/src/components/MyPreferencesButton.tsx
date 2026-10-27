import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { api } from '../lib/api';
import { EditorialModal } from './EditorialModal';

interface Preference { id: string; instruction: string; active: boolean; createdAt: string }

function PreferenceRow({ item, onUpdate }: { item: Preference; onUpdate: (item: Preference, patch: Partial<Preference>) => Promise<void> }) {
    const [instruction, setInstruction] = useState(item.instruction);
    const [saving, setSaving] = useState(false);
    const save = async (patch: Partial<Preference>) => {
        setSaving(true);
        try { await onUpdate(item, patch); } finally { setSaving(false); }
    };
    return <article className="border border-editorial-text/15 bg-white/70 p-4">
        <div className="mb-3 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-wider text-editorial-text/45">
            <span>{new Date(item.createdAt).toLocaleDateString('es-AR')}</span>
            <span className={item.active ? 'text-emerald-700' : 'text-editorial-text/40'}>{item.active ? 'Activo' : 'Pausado'}</span>
        </div>
        <textarea value={instruction} onChange={event => setInstruction(event.target.value)} maxLength={350} rows={3} aria-label="Ajuste de reescritura" className="w-full resize-y border border-editorial-text/15 bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-editorial-text" />
        <div className="mt-3 flex items-center justify-end gap-4">
            <button type="button" disabled={saving} onClick={() => void save({ active: !item.active })} className="text-xs font-bold uppercase tracking-wider text-editorial-text/55 hover:text-editorial-text disabled:opacity-40">{item.active ? 'Pausar' : 'Activar'}</button>
            <button type="button" disabled={saving || !instruction.trim() || instruction.trim() === item.instruction} onClick={() => void save({ instruction: instruction.trim() })} className="border border-editorial-text/30 px-3 py-1.5 text-xs font-bold uppercase tracking-wider hover:bg-editorial-text hover:text-editorial-bg disabled:opacity-40">Guardar texto</button>
        </div>
    </article>;
}

export function MyPreferencesButton() {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<Preference[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const load = async () => {
        setLoading(true);
        setError('');
        try { setItems((await api.get('/api/rewrite-preferences')).data); }
        catch { setError('No se pudieron cargar tus ajustes.'); }
        finally { setLoading(false); }
    };
    const update = async (item: Preference, patch: Partial<Preference>) => {
        try {
            const updated = (await api.patch(`/api/rewrite-preferences/${item.id}`, patch)).data as Preference;
            setItems(current => current.map(value => value.id === item.id ? updated : value));
            setError('');
        } catch (error: unknown) {
            const detail = (error as { response?: { data?: { error?: string } } }).response?.data?.error;
            setError(detail || 'No se pudo guardar el ajuste.');
        }
    };
    return <>
        <button type="button" onClick={() => { setOpen(true); void load(); }} aria-label="Mis ajustes de escritura" title="Mis ajustes de escritura" className="inline-flex items-center gap-1.5 rounded border border-editorial-text/15 px-2.5 py-2 font-sans text-[10px] font-bold uppercase tracking-wider text-editorial-text/75 transition-colors hover:border-editorial-text/50 hover:bg-editorial-text/5 hover:text-editorial-text"><SlidersHorizontal size={14} /><span className="hidden xl:inline">Mis ajustes</span></button>
        {open && <EditorialModal title="Mis ajustes de escritura" eyebrow="Aprendizaje" onClose={() => setOpen(false)} wide>
            <p className="text-sm leading-relaxed text-editorial-text/65">Revisá las indicaciones que guardaste con “Aprender de mis cambios”. Podés editarlas o pausarlas.</p>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            {loading ? <p className="text-sm text-editorial-text/60">Cargando ajustes...</p> : items.length === 0 ? <p className="border border-dashed border-editorial-text/20 p-6 text-sm text-editorial-text/60">Todavía no guardaste ajustes. Editá una nota y usá “Aprender de mis cambios”.</p> : <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">{items.map(item => <PreferenceRow key={item.id} item={item} onUpdate={update} />)}</div>}
        </EditorialModal>}
    </>;
}
