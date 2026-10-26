import { CHAR_WIDTH, FONT_NAME, HEADLINE_WEIGHT } from './fonts';
import type { CardContent, CardTemplate, CardTheme, FontFamily } from './types';

/** Nodo que entiende satori (el mismo formato que un elemento de React). */
export interface Node {
    type: string;
    props: Record<string, unknown>;
}

type Child = Node | string | null | undefined | false;

export function h(type: string, style: Record<string, unknown>, ...children: Child[]): Node {
    const kids = children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false);
    // satori rompe con propiedades de estilo en undefined.
    const clean = Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined));
    return { type, props: { style: clean, children: kids.length === 1 ? kids[0] : kids } };
}

function img(src: string, style: Record<string, unknown>, width?: number, height?: number): Node {
    return { type: 'img', props: { src, width, height, style } };
}

export interface TemplateContext {
    width: number;
    height: number;
    theme: CardTheme;
    content: CardContent;
    /** Foto recortada (cover) al tamaño pedido, como data URI. Null si no hay foto. */
    photo(width: number, height: number): Promise<string | null>;
    logo: { src: string; width: number; height: number } | null;
}

// ── Titular con palabras resaltadas ───────────────────────────────────────────

interface Word { text: string; highlight: boolean }

/** "PAREJA *EL ARMADO* DE LLA" → palabras con su marca de resaltado. */
export function parseHighlights(text: string): Word[] {
    const words: Word[] = [];
    text.split('*').forEach((segment, i) => {
        for (const w of segment.split(/\s+/).filter(Boolean)) {
            words.push({ text: w, highlight: i % 2 === 1 });
        }
    });
    return words;
}

export function stripHighlights(text: string): string {
    return text.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

interface HeadlineOptions {
    family: FontFamily;
    uppercase: boolean;
    color: string;
    accent: string;
    width: number;
    maxHeight: number;
    align: 'center' | 'left';
    lineHeight?: number;
    minSize?: number;
    maxSize?: number;
    shadow?: boolean;
}

function countLines(words: Word[], size: number, charWidth: number, width: number): number {
    const space = size * 0.3;
    let lines = 1;
    let current = 0;
    for (const w of words) {
        const ww = w.text.length * charWidth * size;
        if (current === 0) current = ww;
        else if (current + space + ww <= width) current += space + ww;
        else { lines++; current = ww; }
    }
    return lines;
}

/** El tamaño más grande con el que el titular entra en la caja. */
export function fitSize(words: Word[], o: HeadlineOptions): number {
    const lineHeight = o.lineHeight ?? 1.08;
    const charWidth = CHAR_WIDTH[o.family][o.uppercase ? 'upper' : 'mixed'];
    const min = o.minSize ?? 34;
    for (let size = o.maxSize ?? 120; size > min; size -= 2) {
        const lines = countLines(words, size, charWidth, o.width);
        if (lines * size * lineHeight <= o.maxHeight) return size;
    }
    return min;
}

export function headline(text: string, o: HeadlineOptions): Node {
    const words = parseHighlights(o.uppercase ? text.toLocaleUpperCase('es-AR') : text);
    const size = fitSize(words, o);
    const lineHeight = o.lineHeight ?? 1.08;
    return h('div', {
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: o.align === 'center' ? 'center' : 'flex-start',
        columnGap: Math.round(size * 0.26),
        width: o.width,
        fontFamily: FONT_NAME[o.family],
        fontWeight: HEADLINE_WEIGHT[o.family],
        fontSize: size,
        lineHeight,
        color: o.color,
        textShadow: o.shadow ? '0 2px 12px rgba(0,0,0,0.55)' : undefined,
    }, ...words.map(w => h('span', { color: w.highlight ? o.accent : o.color }, w.text)));
}

// ── Piezas comunes ─────────────────────────────────────────────────────────────

function logoNode(ctx: TemplateContext, color: string, size = 34): Node {
    if (ctx.logo) return img(ctx.logo.src, {}, ctx.logo.width, ctx.logo.height);
    const { theme } = ctx;
    return h('div', {
        display: 'flex',
        alignItems: 'center',
        fontFamily: FONT_NAME.montserrat,
        fontWeight: 800,
        fontSize: size,
        letterSpacing: 1,
        color,
        textTransform: 'uppercase',
    },
    theme.brandName,
    h('span', { color: theme.colors.accent, marginLeft: 8, fontSize: size * 1.15 }, '›'));
}

function kickerPill(ctx: TemplateContext, size = 26): Node | null {
    const { kicker } = ctx.content;
    if (!kicker) return null;
    const c = ctx.theme.colors;
    return h('div', {
        display: 'flex',
        padding: `${Math.round(size * 0.45)}px ${Math.round(size * 0.9)}px`,
        backgroundColor: c.kickerBackground,
        color: c.kickerText,
        borderRight: `5px solid ${c.accent}`,
        borderBottom: `5px solid ${c.accent}`,
        borderRadius: 8,
        fontFamily: FONT_NAME.montserrat,
        fontWeight: 700,
        fontSize: size,
        letterSpacing: 3,
        textTransform: 'uppercase',
    }, kicker);
}

function footerNode(ctx: TemplateContext, color: string): Node | null {
    if (!ctx.theme.footer) return null;
    return h('div', {
        display: 'flex',
        fontFamily: FONT_NAME.montserrat,
        fontWeight: 500,
        fontSize: 22,
        letterSpacing: 2,
        color,
        opacity: 0.85,
    }, ctx.theme.footer);
}

function photoBox(src: string | null, width: number, height: number, fallback: string): Node {
    return src
        ? img(src, { position: 'absolute', top: 0, left: 0, objectFit: 'cover' }, width, height)
        : h('div', { position: 'absolute', top: 0, left: 0, width, height, backgroundColor: fallback, display: 'flex' });
}

const upper = (theme: CardTheme, fallback: boolean) => theme.uppercaseHeadline ?? fallback;

// ── Templates ──────────────────────────────────────────────────────────────────

/** Foto arriba, volanta en el borde y titular sobre una banda de color (estilo Política del Sur). */
async function banda(ctx: TemplateContext): Promise<Node> {
    const { width: W, height: H, theme } = ctx;
    const c = theme.colors;
    const photoH = Math.round(H * (H > W * 1.5 ? 0.58 : 0.6));
    const padX = 60;
    const kicker = kickerPill(ctx);

    return h('div', { display: 'flex', flexDirection: 'column', width: W, height: H, backgroundColor: c.primary },
        h('div', { display: 'flex', position: 'relative', width: W, height: photoH },
            photoBox(await ctx.photo(W, photoH), W, photoH, c.background),
            h('div', {
                position: 'absolute', top: 0, left: 0, width: W, height: 220, display: 'flex',
                backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0))',
            }),
            h('div', { position: 'absolute', top: 44, left: 48, display: 'flex' }, logoNode(ctx, '#ffffff')),
            kicker ? h('div', { position: 'absolute', bottom: -30, left: 0, width: W, display: 'flex', justifyContent: 'center' }, kicker) : null,
        ),
        h('div', {
            display: 'flex', flexDirection: 'column', flexGrow: 1, alignItems: 'center', justifyContent: 'center',
            padding: `${kicker ? 56 : 40}px ${padX}px 36px`,
        },
        headline(ctx.content.headline, {
            family: theme.fonts.headline, uppercase: upper(theme, true), color: c.text, accent: c.accent,
            width: W - padX * 2, maxHeight: H - photoH - (kicker ? 150 : 120), align: 'center', maxSize: 92,
        }),
        theme.footer ? h('div', { display: 'flex', marginTop: 22 }, footerNode(ctx, c.text)) : null,
        ),
        h('div', { display: 'flex', width: W, height: 12, backgroundColor: c.accent }),
    );
}

/** Foto a sangre con degradado y titular abajo a la izquierda (estilo envica). */
async function degradado(ctx: TemplateContext): Promise<Node> {
    const { width: W, height: H, theme, content } = ctx;
    const c = theme.colors;
    const padX = 60;

    return h('div', { display: 'flex', position: 'relative', width: W, height: H, backgroundColor: '#000' },
        photoBox(await ctx.photo(W, H), W, H, c.background),
        h('div', {
            position: 'absolute', top: 0, left: 0, width: W, height: H, display: 'flex',
            backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.82) 66%, rgba(0,0,0,0.96) 100%)',
        }),
        h('div', { position: 'absolute', top: 44, left: 48, display: 'flex' }, logoNode(ctx, '#ffffff')),
        h('div', {
            position: 'absolute', left: padX, bottom: 64, width: W - padX * 2,
            display: 'flex', flexDirection: 'column',
        },
        h('div', { display: 'flex', width: 120, height: 8, backgroundColor: c.accent, marginBottom: 26 }),
        content.kicker ? h('div', {
            display: 'flex', fontFamily: FONT_NAME.montserrat, fontWeight: 700, fontSize: 28, letterSpacing: 3,
            color: c.accent, textTransform: 'uppercase', marginBottom: 18,
        }, content.kicker) : null,
        headline(content.headline, {
            family: theme.fonts.headline, uppercase: upper(theme, false), color: '#ffffff', accent: c.accent,
            width: W - padX * 2, maxHeight: H * 0.36, align: 'left', maxSize: 96, lineHeight: 1.12, shadow: true,
        }),
        theme.footer ? h('div', { display: 'flex', marginTop: 26 }, footerNode(ctx, '#ffffff')) : null,
        ),
    );
}

/** Foto arriba, filete de color y panel oscuro con marca y titular (estilo infobae). */
async function panel(ctx: TemplateContext): Promise<Node> {
    const { width: W, height: H, theme, content } = ctx;
    const c = theme.colors;
    const photoH = Math.round(H * 0.56);
    const padX = 56;

    return h('div', { display: 'flex', flexDirection: 'column', width: W, height: H, backgroundColor: c.background },
        h('div', { display: 'flex', position: 'relative', width: W, height: photoH },
            photoBox(await ctx.photo(W, photoH), W, photoH, c.primary),
        ),
        h('div', { display: 'flex', width: W, height: 10, backgroundColor: c.accent }),
        h('div', {
            display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center',
            padding: `36px ${padX}px 44px`,
        },
        h('div', { display: 'flex', alignItems: 'center', marginBottom: 26 },
            logoNode(ctx, c.accent, 32),
            content.kicker ? h('div', {
                display: 'flex', marginLeft: 22, paddingLeft: 22, borderLeft: `3px solid ${c.accent}`,
                fontFamily: FONT_NAME.montserrat, fontWeight: 600, fontSize: 24, letterSpacing: 3,
                color: c.text, textTransform: 'uppercase',
            }, content.kicker) : null,
        ),
        headline(content.headline, {
            family: theme.fonts.headline, uppercase: upper(theme, true), color: c.text, accent: c.accent,
            width: W - padX * 2, maxHeight: H - photoH - 210, align: 'left', maxSize: 84,
        }),
        ),
    );
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function newspaperDate(d: Date): string {
    // Sin Intl a propósito: algunos contenedores traen Node sin ICU completo.
    const ar = new Date(d.getTime() - 3 * 3600 * 1000);
    return `${DAYS[ar.getUTCDay()]} ${ar.getUTCDate()} de ${MONTHS[ar.getUTCMonth()]} de ${ar.getUTCFullYear()}`;
}

/** Portada de diario: cabezal con filetes, foto enmarcada y titular serif. */
async function clasico(ctx: TemplateContext): Promise<Node> {
    const { width: W, height: H, theme, content } = ctx;
    const c = theme.colors;
    const padX = 56;
    const innerW = W - padX * 2;
    const photoH = Math.round(H * (H > W * 1.5 ? 0.42 : H > W ? 0.43 : 0.4));
    const rule = (weight: number, mt = 0) => h('div', { display: 'flex', width: innerW, height: weight, backgroundColor: c.text, marginTop: mt });

    return h('div', {
        display: 'flex', flexDirection: 'column', alignItems: 'center', width: W, height: H,
        backgroundColor: c.background, padding: `46px ${padX}px 40px`,
    },
    ctx.logo
        ? img(ctx.logo.src, {}, ctx.logo.width, ctx.logo.height)
        : h('div', {
            display: 'flex', fontFamily: FONT_NAME.playfair, fontWeight: 900, fontSize: theme.brandName.length > 16 ? 62 : 78,
            color: c.text, letterSpacing: -1, lineHeight: 1,
        }, theme.brandName),
    rule(4, 22),
    rule(1, 5),
    h('div', {
        display: 'flex', justifyContent: 'space-between', width: innerW, padding: '10px 4px',
        fontFamily: FONT_NAME.montserrat, fontWeight: 500, fontSize: 19, letterSpacing: 3,
        color: c.text, textTransform: 'uppercase',
    },
    h('span', {}, newspaperDate(content.date ?? new Date())),
    h('span', {}, theme.footer || 'Edición digital'),
    ),
    rule(1),
    h('div', { display: 'flex', position: 'relative', width: innerW, height: photoH, marginTop: 28, border: `2px solid ${c.text}` },
        photoBox(await ctx.photo(innerW - 4, photoH - 4), innerW - 4, photoH - 4, c.primary),
    ),
    h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexGrow: 1, width: innerW, marginTop: 26 },
        content.kicker ? h('div', {
            display: 'flex', alignItems: 'center', marginBottom: 18,
            fontFamily: FONT_NAME.montserrat, fontWeight: 700, fontSize: 24, letterSpacing: 4,
            color: c.accent, textTransform: 'uppercase',
        },
        h('div', { display: 'flex', width: 50, height: 2, backgroundColor: c.accent, marginRight: 18 }),
        content.kicker,
        h('div', { display: 'flex', width: 50, height: 2, backgroundColor: c.accent, marginLeft: 18 }),
        ) : null,
        headline(content.headline, {
            family: theme.fonts.headline, uppercase: upper(theme, false), color: c.text, accent: c.accent,
            width: innerW, maxHeight: H - photoH - 380, align: 'center', maxSize: 88, lineHeight: 1.1,
        }),
    ),
    rule(1, 16),
    );
}

export const TEMPLATES: Record<CardTemplate, (ctx: TemplateContext) => Promise<Node>> = {
    banda,
    degradado,
    panel,
    clasico,
};
