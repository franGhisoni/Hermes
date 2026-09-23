import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

interface Preference { id: string; instruction: string; active: boolean; createdAt: string }

export default function MyPreferences() {
    const [items, setItems] = useState<Preference[]>([]);
    const [error, setError] = useState('');
    const load = () => api.get('/api/rewrite-preferences').then(response => setItems(response.data)).catch(() => setError('No se pudieron cargar tus ajustes.'));
    useEffect(() => { void load(); }, []);

    const update = async (item: Preference, patch: Partial<Preference>) => {
        try {
            await api.patch(`/api/rewrite-preferences/${item.id}`, patch);
            await load();
        } catch (error: unknown) {
            const detail = (error as { response?: { data?: { error?: string } } }).response?.data?.error;
            alert(detail || 'No se pudo guardar.');
        }
    };

    return <main className="min-h-screen bg-editorial-bg text-editorial-text p-8 font-sans">
        <div className="max-w-3xl mx-auto space-y-6">
            <Link to="/" className="text-sm underline">← Volver al dashboard</Link>
            <h1 className="font-serif text-3xl font-bold">Mis ajustes de reescritura</h1>
            <p className="text-sm opacity-70">Estos ajustes se aplican a tus próximas reescrituras manuales. Podés editarlos o desactivarlos.</p>
            {error && <p role="alert">{error}</p>}
            {items.length === 0 && <p>Todavía no guardaste ajustes. Editá una nota y usá “Aprender de mis cambios”.</p>}
            {items.map(item => <div key={item.id} className="border p-4 bg-white space-y-3">
                <textarea key={item.instruction} defaultValue={item.instruction} maxLength={350} rows={3}
                    onBlur={event => { const value = event.target.value.trim(); if (value && value !== item.instruction) void update(item, { instruction: value }); }}
                    className="w-full border p-2" aria-label="Indicación de reescritura" />
                <div className="flex items-center justify-between text-xs">
                    <span>{new Date(item.createdAt).toLocaleDateString('es-AR')}</span>
                    <button type="button" onClick={() => update(item, { active: !item.active })} className="border px-3 py-1">{item.active ? 'Desactivar' : 'Activar'}</button>
                </div>
            </div>)}
        </div>
    </main>;
}
