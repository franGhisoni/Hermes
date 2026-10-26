import { errorMessage } from './util';
import type { SocialCopy } from './types';

export interface CopyBrand {
    /** "Política del Sur", "Impacto Castex". */
    brandName: string;
    /** Zona que cubre el medio, para que la IA elija bien localidades y hashtags. */
    region: string;
    /** Hashtags que van siempre ("#PoliticaDelSur"). */
    baseHashtags: string[];
}

export interface CopyInput {
    title: string;
    /** Texto o HTML de la nota (se recorta). */
    content: string;
    volanta?: string;
}

/** Marca para saber si un prompt guardado ya pide el texto de la placa. */
export const CARD_PROMPT_MARKER = '"placa_titulo"';

/**
 * Bloque de instrucciones que agrega el texto de la placa a cualquier prompt de
 * copys. Sirve para sumarlo a un prompt existente (el de Política del Sur vive
 * en la base y se puede editar).
 */
export const CARD_PROMPT_SECTION = `5. ${CARD_PROMPT_MARKER}: Titular para la PLACA (imagen) que acompaña el posteo. Máximo 12 palabras, sin punto final, sin emojis, sin hashtags. Tiene que entenderse solo, como un titular de portada. Encerrá entre asteriscos (*así*) de 2 a 5 palabras consecutivas que sean el dato más fuerte, para resaltarlas en color. Ejemplo: "Pareja delineó *el armado de LLA* en la Provincia".
6. "placa_volanta": Etiqueta corta para arriba del titular de la placa (1 a 3 palabras: tema, lugar o protagonista, ej. "PERONISMO", "ACTO EN LANÚS", "MALA PRAXIS").`;

export function buildSocialCopyPrompt(input: CopyInput, brand: CopyBrand, maxContentChars = 6000): string {
    const tags = brand.baseHashtags.join(' ');
    return `Sos un community manager y redactor de redes sociales experto en medios de noticias argentinos (estilo ${brand.brandName} / ${brand.region}).
A partir de la siguiente noticia, generá los textos (copys) optimizados para publicar en redes sociales y el texto de la placa.

Título original: ${input.title}
${input.volanta ? `Volanta: ${input.volanta}\n` : ''}Contenido:
${cleanText(input.content).slice(0, maxContentChars)}

REGLAS GENERALES INVIOLABLES:
- NUNCA termines los textos con puntos suspensivos ("...") ni dejes oraciones cortadas a la mitad. Todos los textos deben quedar cerrados, coherentes y completos.
- Los copys deben ser informativos y contar los hechos centrales de la nota (qué ocurrió, quiénes intervinieron, localidad o zona y consecuencias o situación actual).
- Evitá frases genéricas o teasers vacíos; dale valor informativo a la audiencia.
- Usá español rioplatense periodístico, dinámico y profesional.

Instrucciones:
1. "twitter": Texto para X (Twitter). Máximo 260 caracteres en total. Directo, con los datos clave en 1 o 2 oraciones completas, 1-2 emojis sobrios y 2 hashtags.
2. "instagram": Texto para Instagram.
   - Línea inicial: gancho en MAYÚSCULAS con un emoji sobrio al inicio (🚨, 📌, ⚖️, ⚠️).
   - Cuerpo: 2 o 3 párrafos cortos con lo principal de la noticia.
   - Cierre: "📲 Leé la nota completa ingresando al link de nuestra bio." y "¿Qué opinás? Te leemos en los comentarios 👇"
   - Bloque final de 5 a 8 hashtags (separado por una línea vacía), incluyendo ${tags}.
3. "facebook": Tono informativo, cercano y claro. 2 párrafos concisos, "👉 Leé la nota completa en nuestro sitio web." y una pregunta para abrir el debate. NO pongas el link: se agrega solo.
4. "hashtags": 5 a 8 hashtags separados por espacios, incluyendo ${tags}.
${CARD_PROMPT_SECTION}

Respondé ÚNICAMENTE un JSON estricto con esta estructura:
{
  "twitter": "...",
  "instagram": "...",
  "facebook": "...",
  "hashtags": "${tags} ...",
  "placa_titulo": "...",
  "placa_volanta": "..."
}`;
}

function cleanText(text: string): string {
    return (text || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Lee la respuesta de la IA (tolera ```json y campos faltantes). */
export function parseSocialCopy(raw: string): SocialCopy {
    const parsed = JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());
    const copy: SocialCopy = {
        twitter: parsed.twitter || '',
        instagram: parsed.instagram || '',
        facebook: parsed.facebook || '',
        hashtags: parsed.hashtags || '',
    };
    if (parsed.placa_titulo) {
        copy.card = { headline: String(parsed.placa_titulo).trim(), kicker: parsed.placa_volanta ? String(parsed.placa_volanta).trim() : undefined };
    }
    return copy;
}

/** Primeras oraciones completas que entran en `max` caracteres. */
function summarize(content: string, max: number): string {
    const sentences = (cleanText(content).match(/[^.!?]+[.!?]+/g) || []).map(s => s.trim());
    let out = '';
    for (const s of sentences) {
        const next = out ? `${out} ${s}` : s;
        if (next.length > max) break;
        out = next;
    }
    return out;
}

/** Copy sin IA: título + resumen + llamados. Sirve si la IA falla o no está configurada. */
export function fallbackSocialCopy(input: CopyInput, brand: CopyBrand): SocialCopy {
    const title = cleanText(input.title);
    const summary = summarize(input.content, 280) || `${title}.`;
    const hashtags = brand.baseHashtags.join(' ');
    return {
        instagram: `🚨 ${title.toLocaleUpperCase('es-AR')}\n\n${summary}\n\n📲 Leé la nota completa ingresando al link de nuestra bio.\n\n¿Qué opinás? Te leemos en los comentarios 👇\n\n${hashtags}`,
        facebook: `${title}\n\n${summary}\n\n👉 Leé la nota completa en nuestro sitio web.\n¿Qué opinás al respecto? Dejanos tu comentario 👇`,
        twitter: `🚨 ${title}\n\n${hashtags}`,
        hashtags,
        card: { headline: title, kicker: input.volanta || undefined },
    };
}

/**
 * Genera los copys con cualquier modelo: `llm` recibe el prompt y devuelve el
 * texto (JSON) de la respuesta. Si falla, devuelve el copy sin IA.
 */
export async function generateSocialCopy(
    llm: (prompt: string) => Promise<string>,
    input: CopyInput,
    brand: CopyBrand,
): Promise<SocialCopy> {
    try {
        const copy = parseSocialCopy(await llm(buildSocialCopyPrompt(input, brand)));
        if (!copy.facebook && !copy.instagram) throw new Error('respuesta vacía');
        return copy;
    } catch (err) {
        console.warn('[news-social] No se pudo generar el copy con IA, se usa el copy básico:', errorMessage(err));
        return fallbackSocialCopy(input, brand);
    }
}
