import React, { useState, useRef, useEffect } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { announce } from '../lib/a11y';

interface Option {
    id: string;
    label: string;
}

interface MultiSelectProps {
    label: string;
    options: Option[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    placeholder?: string;
}

export function MultiSelect({ label, options, selectedIds, onChange, placeholder = "Seleccionar..." }: MultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const selectedOptions = options.filter(opt => selectedIds.includes(opt.id));
    const availableOptions = options.filter(opt => !selectedIds.includes(opt.id));

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const addOption = (opt: Option) => {
        onChange([...selectedIds, opt.id]);
        announce(`${opt.label} agregado`);
        // The chosen option leaves the list, so the focus can't stay on it.
        triggerRef.current?.focus();
    };

    const removeOption = (e: React.MouseEvent, opt: Option) => {
        e.stopPropagation(); // Prevent opening the dropdown
        onChange(selectedIds.filter(val => val !== opt.id));
        announce(`${opt.label} quitado`);
        triggerRef.current?.focus();
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape' && isOpen) {
            e.stopPropagation();
            setIsOpen(false);
            triggerRef.current?.focus();
        }
    };

    return (
        <div className="relative font-sans text-sm w-full" ref={containerRef} onKeyDown={onKeyDown}>
            {/* The Select Box */}
            <div
                className="min-h-[42px] w-full border-b border-editorial-text/30 bg-white/50 py-1 px-2 flex flex-wrap gap-1.5 items-center cursor-pointer transition-colors hover:bg-white/70"
                onClick={() => setIsOpen(!isOpen)}
            >
                {selectedOptions.map(opt => (
                    <span
                        key={opt.id}
                        className="bg-black text-white px-2 py-0.5 rounded-sm flex items-center gap-1 hover:bg-gray-800 transition-colors"
                    >
                        {opt.label}
                        <button
                            type="button"
                            onClick={(e) => removeOption(e, opt)}
                            aria-label={`Quitar ${opt.label}`}
                            className="opacity-70 hover:opacity-100 hover:text-red-300"
                        >
                            <X size={12} />
                        </button>
                    </span>
                ))}
                <button
                    ref={triggerRef}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                    aria-expanded={isOpen}
                    aria-label={`${label}: ${selectedOptions.length === 0 ? 'nada seleccionado' : `${selectedOptions.length} seleccionados`}`}
                    className="ml-auto flex items-center gap-1 pr-1 text-gray-400"
                >
                    {selectedOptions.length === 0 && <span className="p-1">{placeholder}</span>}
                    <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {/* The Dropdown Menu */}
            {isOpen && (
                <div className="absolute top-full left-0 w-full mt-1 bg-white border border-editorial-text/20 shadow-xl z-50 max-h-60 overflow-y-auto">
                    {availableOptions.length === 0 ? (
                        <div className="p-3 text-gray-500 italic text-center">No hay más opciones disponibles</div>
                    ) : (
                        <ul aria-label={`Opciones de ${label}`}>
                            {availableOptions.map(opt => (
                                <li key={opt.id}>
                                    <button
                                        type="button"
                                        className="w-full text-left px-3 py-2 cursor-pointer hover:bg-editorial-text/5 hover:font-bold transition-all border-b border-gray-100"
                                        onClick={() => addOption(opt)}
                                    >
                                        {opt.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
