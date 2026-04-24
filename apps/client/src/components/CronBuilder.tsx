import { useEffect, useState } from 'react';

interface CronPreset {
    label: string;
    value: string;
}

interface CronBuilderProps {
    value: string;
    onChange: (value: string) => void;
    presets?: CronPreset[];
    helperText?: string;
}

const DAYS = [
    { value: 1, label: 'L' },
    { value: 2, label: 'M' },
    { value: 3, label: 'X' },
    { value: 4, label: 'J' },
    { value: 5, label: 'V' },
    { value: 6, label: 'S' },
    { value: 0, label: 'D' },
];

const DAY_NAMES: Record<number, string> = {
    0: 'domingo',
    1: 'lunes',
    2: 'martes',
    3: 'miércoles',
    4: 'jueves',
    5: 'viernes',
    6: 'sábado',
};

function parseCron(cron: string) {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) {
        return { minute: '0', hours: '8', days: [1, 2, 3, 4, 5] };
    }

    return {
        minute: /^\d{1,2}$/.test(parts[0]) ? parts[0] : '0',
        hours: /^(\d{1,2})(,\d{1,2})*$/.test(parts[1]) ? parts[1] : '8',
        days: parseDaysOfWeek(parts[4]),
    };
}

function parseDaysOfWeek(field: string): number[] {
    if (field === '*') return DAYS.map(day => day.value);

    const values = new Set<number>();
    for (const part of field.split(',')) {
        if (/^\d$/.test(part)) {
            values.add(Number(part));
            continue;
        }

        const rangeMatch = part.match(/^(\d)-(\d)$/);
        if (!rangeMatch) continue;

        const start = Number(rangeMatch[1]);
        const end = Number(rangeMatch[2]);
        for (let day = start; day <= end; day++) {
            values.add(day === 7 ? 0 : day);
        }
    }

    const parsed = DAYS.map(day => day.value).filter(day => values.has(day));
    return parsed.length > 0 ? parsed : [1, 2, 3, 4, 5];
}

function normalizeHours(value: string): string {
    const hours = value
        .split(',')
        .map(part => parseInt(part.trim(), 10))
        .filter(hour => Number.isFinite(hour) && hour >= 0 && hour <= 23);

    return Array.from(new Set(hours)).sort((a, b) => a - b).join(',');
}

function buildCron(minute: string, hours: string, days: number[]) {
    const minuteNumber = parseInt(minute, 10);
    const normalizedMinute = Number.isFinite(minuteNumber)
        ? Math.min(59, Math.max(0, minuteNumber)).toString()
        : '0';

    const normalizedHours = normalizeHours(hours) || '8';
    const sortedDays = Array.from(new Set(days)).sort((a, b) => {
        const normalizedA = a === 0 ? 7 : a;
        const normalizedB = b === 0 ? 7 : b;
        return normalizedA - normalizedB;
    });

    const dayField = sortedDays.length === 7 ? '*' : sortedDays.join(',');
    return `${normalizedMinute} ${normalizedHours} * * ${dayField}`;
}

function formatHour(hour: number, minute: string) {
    return `${hour.toString().padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

function describeDays(days: number[]) {
    const normalized = Array.from(new Set(days)).sort((a, b) => {
        const normalizedA = a === 0 ? 7 : a;
        const normalizedB = b === 0 ? 7 : b;
        return normalizedA - normalizedB;
    });

    const weekdays = [1, 2, 3, 4, 5];
    const allDays = [1, 2, 3, 4, 5, 6, 0];

    if (normalized.length === allDays.length && allDays.every((day, index) => day === normalized[index])) {
        return 'Todos los días';
    }

    if (normalized.length === weekdays.length && weekdays.every((day, index) => day === normalized[index])) {
        return 'Lunes a viernes';
    }

    if (normalized.length === 2 && normalized.includes(6) && normalized.includes(0)) {
        return 'Sábados y domingos';
    }

    const names = normalized.map(day => DAY_NAMES[day]);
    if (names.length === 1) return names[0].charAt(0).toUpperCase() + names[0].slice(1);
    if (names.length === 2) return `${names[0]} y ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

function describeCron(cron: string) {
    const parsed = parseCron(cron);
    const normalizedHours = normalizeHours(parsed.hours)
        .split(',')
        .map(value => parseInt(value, 10))
        .filter(hour => Number.isFinite(hour));

    const scheduleText = normalizedHours.length > 0
        ? normalizedHours.map(hour => formatHour(hour, parsed.minute)).join(', ')
        : formatHour(8, parsed.minute);

    return `${describeDays(parsed.days)} a las ${scheduleText}.`;
}

export function CronBuilder({ value, onChange, presets = [], helperText }: CronBuilderProps) {
    const [minute, setMinute] = useState('0');
    const [hours, setHours] = useState('8');
    const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);

    useEffect(() => {
        const parsed = parseCron(value);
        setMinute(parsed.minute);
        setHours(parsed.hours);
        setDays(parsed.days);
    }, [value]);

    const updateCron = (nextMinute: string, nextHours: string, nextDays: number[]) => {
        onChange(buildCron(nextMinute, nextHours, nextDays));
    };

    const toggleDay = (dayValue: number) => {
        const nextDays = days.includes(dayValue)
            ? days.filter(day => day !== dayValue)
            : [...days, dayValue];

        if (nextDays.length === 0) return;

        setDays(nextDays);
        updateCron(minute, hours, nextDays);
    };

    const applyPreset = (presetValue: string) => {
        onChange(presetValue);
    };

    return (
        <div className="space-y-3">
            {presets.length > 0 && (
                <select
                    value={presets.some(preset => preset.value === value) ? value : ''}
                    onChange={(e) => {
                        if (e.target.value) applyPreset(e.target.value);
                    }}
                    className="w-full border-b border-editorial-text/30 py-2 focus:outline-none focus:border-editorial-text bg-transparent cursor-pointer text-sm"
                >
                    <option value="">Preset rapido</option>
                    {presets.map(preset => (
                        <option key={preset.value} value={preset.value}>{preset.label}</option>
                    ))}
                </select>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-text/50 mb-1">Horas</label>
                    <input
                        type="text"
                        value={hours}
                        onChange={(e) => {
                            setHours(e.target.value);
                            updateCron(minute, e.target.value, days);
                        }}
                        className="w-full border-b border-editorial-text/30 py-2 focus:outline-none focus:border-editorial-text bg-transparent font-mono text-sm"
                        placeholder="8,12,15"
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-text/50 mb-1">Minuto</label>
                    <input
                        type="number"
                        min={0}
                        max={59}
                        value={minute}
                        onChange={(e) => {
                            setMinute(e.target.value);
                            updateCron(e.target.value, hours, days);
                        }}
                        className="w-full border-b border-editorial-text/30 py-2 focus:outline-none focus:border-editorial-text bg-transparent font-mono text-sm"
                    />
                </div>
            </div>

            <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-text/50 mb-2">Dias</label>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            const nextDays = [1, 2, 3, 4, 5];
                            setDays(nextDays);
                            updateCron(minute, hours, nextDays);
                        }}
                        className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest border border-editorial-text/20 hover:bg-editorial-text/5"
                    >
                        Lun-Vie
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            const nextDays = DAYS.map(day => day.value);
                            setDays(nextDays);
                            updateCron(minute, hours, nextDays);
                        }}
                        className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest border border-editorial-text/20 hover:bg-editorial-text/5"
                    >
                        Todos
                    </button>
                    {DAYS.map(day => (
                        <button
                            key={day.value}
                            type="button"
                            onClick={() => toggleDay(day.value)}
                            className={`w-9 h-9 text-xs font-bold border transition-colors ${days.includes(day.value)
                                ? 'bg-editorial-text text-editorial-bg border-editorial-text'
                                : 'border-editorial-text/20 hover:bg-editorial-text/5'
                                }`}
                        >
                            {day.label}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-text/50 mb-1">Cron</label>
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full border-b border-editorial-text/30 py-2 focus:outline-none focus:border-editorial-text bg-transparent font-mono text-sm"
                    placeholder="0 8,12,15 * * 1,2,3,4,5"
                />
            </div>

            <div className="text-[10px] text-editorial-text/40 italic">
                {helperText || 'Ejemplo: 0 8,12,15 * * 1,2,3,4,5 corre de lunes a viernes a las 8:00, 12:00 y 15:00.'}
            </div>

            <div className="text-xs font-sans text-editorial-text/60">
                {describeCron(value)}
            </div>
        </div>
    );
}
