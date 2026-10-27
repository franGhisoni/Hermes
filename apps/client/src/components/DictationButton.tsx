import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

type TextField = HTMLInputElement | HTMLTextAreaElement;

interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface Recognition {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult: ((event: RecognitionEvent) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
}

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range', 'color', 'date', 'datetime-local', 'time', 'month', 'week', 'number', 'hidden', 'image', 'password']);

const isTextField = (el: Element | null): el is TextField => {
    if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
    if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(el.type) && !el.readOnly && !el.disabled;
    return false;
};

// React ignora `el.value = x`; hay que usar el setter nativo y disparar `input`.
function insertAtCursor(el: TextField, text: string) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (!setter) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const before = el.value.slice(0, start);
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const chunk = (needsSpace ? ' ' : '') + text;
    const next = before + chunk + el.value.slice(end);
    if (el.maxLength > 0 && next.length > el.maxLength) return;
    setter.call(el, next);
    const caret = start + chunk.length;
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(new Event('input', { bubbles: true }));
}

export function DictationButton() {
    const [listening, setListening] = useState(false);
    const [error, setError] = useState('');
    const targetRef = useRef<TextField | null>(null);
    const recognitionRef = useRef<Recognition | null>(null);

    const Ctor = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition
        ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

    useEffect(() => {
        const onFocusIn = (event: FocusEvent) => {
            if (isTextField(event.target as Element)) targetRef.current = event.target as TextField;
        };
        document.addEventListener('focusin', onFocusIn);
        return () => document.removeEventListener('focusin', onFocusIn);
    }, []);

    const stop = useCallback(() => {
        recognitionRef.current?.stop();
    }, []);

    useEffect(() => () => recognitionRef.current?.stop(), []);

    if (!Ctor) return null;

    const start = () => {
        const field = targetRef.current;
        if (!field || !field.isConnected) {
            setError('Hacé clic en un campo de texto y después en el micrófono.');
            window.setTimeout(() => setError(''), 3500);
            return;
        }
        setError('');
        const recognition = new Ctor();
        recognition.lang = 'es-AR';
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.onresult = event => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (!result.isFinal) continue;
                const text = result[0].transcript.trim();
                const current = targetRef.current;
                if (text && current?.isConnected) insertAtCursor(current, text);
            }
        };
        recognition.onerror = event => {
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setError('Permití el acceso al micrófono en el navegador.');
            else if (event.error !== 'no-speech' && event.error !== 'aborted') setError('No se pudo dictar. Probá de nuevo.');
        };
        recognition.onend = () => { setListening(false); recognitionRef.current = null; };
        recognitionRef.current = recognition;
        recognition.start();
        setListening(true);
        field.focus();
    };

    const label = listening ? 'Detener dictado' : 'Dictar en el campo de texto';

    return <div className="fixed bottom-6 left-6 z-[120] flex items-center gap-3 print:hidden">
        <button
            type="button"
            // evita que el clic le saque el foco al campo de texto
            onMouseDown={event => event.preventDefault()}
            onClick={listening ? stop : start}
            aria-label={label}
            aria-pressed={listening}
            title={label}
            className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-lg transition-colors ${listening ? 'animate-pulse border-red-700 bg-red-700 text-white' : 'border-editorial-text/20 bg-editorial-bg text-editorial-text hover:bg-editorial-text hover:text-editorial-bg'}`}
        >
            {listening ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        {(error || listening) && <span role="status" className="border border-editorial-text/15 bg-editorial-bg px-3 py-2 font-sans text-xs shadow-lg">{error || 'Escuchando… hablá y se escribe en el campo'}</span>}
    </div>;
}
