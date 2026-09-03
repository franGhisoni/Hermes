import { Plus, Trash2 } from 'lucide-react';

export interface PublicationOverrideDraft {
    id?: string;
    targetId: string;
    section: string;
    limit: number | string;
}

interface NamedOption {
    id: string;
    name: string;
}

interface Props {
    defaultLimit: string;
    onDefaultLimitChange: (value: string) => void;
    overrides: PublicationOverrideDraft[];
    onOverridesChange: (overrides: PublicationOverrideDraft[]) => void;
    targets: NamedOption[];
    selectedTargetIds: string[];
    sections: NamedOption[];
}

export function WorkflowPublicationLimits({
    defaultLimit,
    onDefaultLimitChange,
    overrides,
    onOverridesChange,
    targets,
    selectedTargetIds,
    sections
}: Props) {
    const selectedTargets = targets.filter(target => selectedTargetIds.includes(target.id));

    const pairTaken = (targetId: string, section: string, exceptIndex = -1) =>
        overrides.some((row, index) => index !== exceptIndex && row.targetId === targetId && row.section === section);

    const addOverride = () => {
        for (const target of selectedTargets) {
            for (const section of sections) {
                if (!pairTaken(target.id, section.name)) {
                    onOverridesChange([
                        ...overrides,
                        {
                            id: `draft-${Date.now()}-${overrides.length}`,
                            targetId: target.id,
                            section: section.name,
                            limit: defaultLimit || '1'
                        }
                    ]);
                    return;
                }
            }
        }
    };

    const updateOverride = (index: number, patch: Partial<PublicationOverrideDraft>) => {
        onOverridesChange(overrides.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
    };

    const removeOverride = (index: number) => {
        onOverridesChange(overrides.filter((_, rowIndex) => rowIndex !== index));
    };

    const hasAvailablePair = selectedTargets.some(target =>
        sections.some(section => !pairTaken(target.id, section.name))
    );

    return (
        <div className="md:col-span-2 lg:col-span-4 border border-editorial-text/15 p-4 bg-editorial-text/[0.02]">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="max-w-2xl">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-60 block mb-1">
                        Cantidad de notas por defecto
                    </label>
                    <p className="text-[11px] opacity-60 leading-snug">
                        Se aplica a todos los medios. Agregá un override solamente cuando una combinación de medio y sección necesite otra cantidad.
                    </p>
                </div>
                <input
                    type="number"
                    min="1"
                    max="100"
                    value={defaultLimit}
                    onChange={event => onDefaultLimitChange(event.target.value)}
                    className="w-28 border border-editorial-text/20 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-editorial-text"
                    aria-label="Cantidad de notas por defecto"
                />
            </div>

            <div className="flex items-center justify-between gap-3 mt-5 mb-2">
                <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest">Overrides por medio y sección</h3>
                    <p className="text-[10px] opacity-50 mt-0.5">Cada combinación puede configurarse una sola vez.</p>
                </div>
                <button
                    type="button"
                    onClick={addOverride}
                    disabled={!hasAvailablePair}
                    className="inline-flex items-center gap-1.5 border border-editorial-text/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-editorial-text/5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <Plus size={12} /> Agregar override
                </button>
            </div>

            {overrides.length === 0 ? (
                <div className="border border-dashed border-editorial-text/15 py-5 text-center text-[11px] opacity-50 italic">
                    Sin overrides: todas las publicaciones usan el valor por defecto.
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {overrides.map((row, index) => (
                        <div key={row.id || `${row.targetId}-${row.section}-${index}`} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_110px_32px] gap-2 items-end border border-editorial-text/10 bg-white/60 p-3">
                            <div>
                                <label className="text-[9px] uppercase tracking-widest opacity-60 block mb-1">Medio</label>
                                <select
                                    value={row.targetId}
                                    onChange={event => updateOverride(index, { targetId: event.target.value })}
                                    className="w-full border border-editorial-text/20 bg-white px-2 py-1.5 text-xs focus:outline-none focus:border-editorial-text"
                                >
                                    {selectedTargets.map(target => (
                                        <option
                                            key={target.id}
                                            value={target.id}
                                            disabled={pairTaken(target.id, row.section, index)}
                                        >
                                            {target.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[9px] uppercase tracking-widest opacity-60 block mb-1">Sección</label>
                                <select
                                    value={row.section}
                                    onChange={event => updateOverride(index, { section: event.target.value })}
                                    className="w-full border border-editorial-text/20 bg-white px-2 py-1.5 text-xs focus:outline-none focus:border-editorial-text"
                                >
                                    {sections.map(section => (
                                        <option
                                            key={section.id}
                                            value={section.name}
                                            disabled={pairTaken(row.targetId, section.name, index)}
                                        >
                                            {section.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[9px] uppercase tracking-widest opacity-60 block mb-1">Cantidad</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={row.limit}
                                    onChange={event => updateOverride(index, { limit: event.target.value })}
                                    className="w-full border border-editorial-text/20 bg-white px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-editorial-text"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => removeOverride(index)}
                                className="h-8 w-8 inline-flex items-center justify-center text-editorial-text/40 hover:text-red-600 transition-colors"
                                title="Eliminar override"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {(selectedTargets.length === 0 || sections.length === 0) && (
                <p className="text-[10px] text-amber-700 mt-3">
                    Para agregar overrides necesitás seleccionar al menos un medio y tener secciones configuradas.
                </p>
            )}
        </div>
    );
}
