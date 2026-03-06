import React, { useState, useRef, useEffect } from 'react';
import { X, ChevronDown } from 'lucide-react';

interface Option {
    id: string;
    label: string;
}

interface MultiSelectProps {
    options: Option[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    placeholder?: string;
}

export function MultiSelect({ options, selectedIds, onChange, placeholder = "Seleccionar..." }: MultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

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

    const toggleOption = (id: string) => {
        if (selectedIds.includes(id)) {
            onChange(selectedIds.filter(val => val !== id));
        } else {
            onChange([...selectedIds, id]);
        }
    };

    const removeOption = (e: React.MouseEvent, id: string) => {
        e.stopPropagation(); // Prevent opening the dropdown
        onChange(selectedIds.filter(val => val !== id));
    };

    return (
        <div className="relative font-sans text-sm w-full" ref={containerRef}>
            {/* The Select Box */}
            <div
                className="min-h-[42px] w-full border-b border-editorial-text/30 bg-white/50 py-1 px-2 flex flex-wrap gap-1.5 items-center cursor-pointer transition-colors hover:bg-white/70"
                onClick={() => setIsOpen(!isOpen)}
            >
                {selectedOptions.length === 0 ? (
                    <span className="text-gray-400 p-1">{placeholder}</span>
                ) : (
                    selectedOptions.map(opt => (
                        <span
                            key={opt.id}
                            className="bg-black text-white px-2 py-0.5 rounded-sm flex items-center gap-1 hover:bg-gray-800 transition-colors"
                        >
                            {opt.label}
                            <button
                                onClick={(e) => removeOption(e, opt.id)}
                                className="opacity-70 hover:opacity-100 hover:text-red-300"
                            >
                                <X size={12} />
                            </button>
                        </span>
                    ))
                )}
                <div className="ml-auto opacity-50 pr-1">
                    <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </div>

            {/* The Dropdown Menu */}
            {isOpen && (
                <div className="absolute top-full left-0 w-full mt-1 bg-white border border-editorial-text/20 shadow-xl z-50 max-h-60 overflow-y-auto">
                    {availableOptions.length === 0 ? (
                        <div className="p-3 text-gray-500 italic text-center">No hay más opciones disponibles</div>
                    ) : (
                        availableOptions.map(opt => (
                            <div
                                key={opt.id}
                                className="px-3 py-2 cursor-pointer hover:bg-editorial-text/5 hover:font-bold transition-all border-b border-gray-100 last:border-0"
                                onClick={() => toggleOption(opt.id)}
                            >
                                {opt.label}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
