import { useState } from 'react';
import { Copy, SlidersHorizontal } from 'lucide-react';
import { api } from '../lib/api';
import { EditorialModal } from './EditorialModal';

interface Preference { id: string; instruction: string; active: boolean; createdAt: string; user: { username: string } }
type Scope = 'USER' | 'GLOBAL';

export function AdminRewritePreferencesButton({ masterPrompt }: { masterPrompt: string }) {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<Preference[]>([]);
    const [scope, setScope] = useState<Scope>('USER');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const load = async () => {
        setLoading(true);
        setMessage('');
        try {
            const [preferences, config] = await Promise.all([api.get('/api/rewrite-preferences/all'), api.get('/api/rewrite-preferences/config')]);
            setItems(preferences.data);
            setScope(config.data.scope);
        } catch { setMessage('No se pudieron cargar los ajustes.'); }
        finally { setLoading(false); }
    };
    const changeScope = async (next: Scope) => {
        if (scope === next) return;
        setSaving(true);
        setMessage('');
        try {
            await api.put('/api/rewrite-preferences/config', { scope: next });
            setScope(next);
        } catch { setMessage('No se pudo guardar el alcance.'); }
        finally { setSaving(false); }
    };
    const toggle = async (item: Preference) => {
        setSaving(true);
        setMessage('');
        try {
            const updated = (await api.patch(`/api/rewrite-preferences/${item.id}`, { active: !item.active })).data as Preference;
            setItems(current => current.map(value => value.id === item.id ? { ...value, active: updated.active } : value));
        } catch { setMessage('No se pudo actualizar el ajuste.'); }
        finally { setSaving(false); }
    };
    const copy = async () => {
        if (!masterPrompt) { setMessage('No se encontró el prompt de reescritura.'); return; }
        const instructions = items.filter(item => item.active).map(item => `- ${item.instruction} (${item.user.username})`).join('\n');
        try {
            await navigator.clipboard.writeText(`PROMPT ACTUAL:\n${masterPrompt}\n\nAJUSTES CONFIRMADOS:\n${instructions}`);
            setMessage('Prompt y ajustes copiados. Revisá el resultado antes de reemplazar el prompt original.');
        } catch { setMessage('No se pudo copiar al portapapeles.'); }
    };
    return <>
        <button type="button" onClick={() => { setOpen(true); void load(); }} className="inline-flex items-center gap-2 border border-editorial-text/25 px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-wider transition-colors hover:bg-editorial-text hover:text-editorial-bg"><SlidersHorizontal size={15} /> Ajustes aprendidos <span className="text-editorial-text/40">↗</span></button>
        {open && <EditorialModal title="Ajustes aprendidos" eyebrow="Prompts IA · Reescritura" onClose={() => setOpen(false)} wide>
            <p className="text-sm leading-relaxed text-editorial-text/65">Elegí a quién se aplican los ajustes confirmados al generar nuevas reescrituras. El cambio se aplica a las próximas notas. Si se acumulan muchos, se priorizan los más recientes hasta compactarlos en el prompt original.</p>
            <fieldset disabled={saving || loading} className="grid gap-3 sm:grid-cols-2">
                <legend className="mb-2 text-[10px] font-bold uppercase tracking-widest text-editorial-text/50">Alcance de los ajustes</legend>
                {([['USER', 'Por usuario', 'Cada editor usa solo sus ajustes; el procesamiento automático no los aplica.'], ['GLOBAL', 'Para todos', 'Las próximas reescrituras, incluso las automáticas, usan los ajustes activos.']] as const).map(([value, label, detail]) => <label key={value} className={`cursor-pointer border p-4 transition-colors ${scope === value ? 'border-editorial-text bg-editorial-text/5' : 'border-editorial-text/15 hover:border-editorial-text/40'}`}>
                    <input type="radio" name="rewrite-preference-scope" value={value} checked={scope === value} onChange={() => void changeScope(value)} className="mr-2 accent-editorial-text" />
                    <span className="text-sm font-bold">{label}</span>
                    <span className="mt-1 block pl-5 text-xs leading-relaxed text-editorial-text/55">{detail}</span>
                </label>)}
            </fieldset>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-editorial-text/10 pt-5">
                <div><h3 className="font-serif text-xl font-bold italic">Indicaciones guardadas</h3><p className="text-xs text-editorial-text/55">Se pueden pausar antes de incorporarlas al prompt original.</p></div>
                <button type="button" disabled={!masterPrompt} onClick={() => void copy()} className="inline-flex items-center gap-2 bg-editorial-text px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-editorial-bg hover:opacity-85 disabled:opacity-40"><Copy size={14} /> Copiar para compactar</button>
            </div>
            {message && <p role="status" className="text-sm text-editorial-text/70">{message}</p>}
            {loading ? <p className="text-sm">Cargando...</p> : items.length === 0 ? <p className="border border-dashed border-editorial-text/20 p-5 text-sm text-editorial-text/60">Todavía no hay ajustes confirmados.</p> : <div className="max-h-[40vh] space-y-2 overflow-y-auto pr-1">{items.map(item => <article key={item.id} className="flex items-start justify-between gap-4 border border-editorial-text/12 bg-white/70 p-3">
                <div><p className={`text-sm leading-relaxed ${item.active ? '' : 'text-editorial-text/45 line-through'}`}>{item.instruction}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-editorial-text/45">{item.user.username} · {new Date(item.createdAt).toLocaleDateString('es-AR')}</p></div>
                <button type="button" disabled={saving} onClick={() => void toggle(item)} className="shrink-0 border border-editorial-text/20 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider hover:bg-editorial-text/5 disabled:opacity-40">{item.active ? 'Pausar' : 'Activar'}</button>
            </article>)}</div>}
        </EditorialModal>}
    </>;
}
