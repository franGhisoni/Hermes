import type { CardTheme } from './types';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export const BASE_THEME: CardTheme = {
    brandName: 'Noticias',
    template: 'banda',
    format: 'portrait',
    colors: {
        primary: '#0b3a8c',
        accent: '#f26a21',
        text: '#ffffff',
        background: '#0d1726',
        kickerBackground: '#111111',
        kickerText: '#ffffff',
    },
    fonts: { headline: 'montserrat', body: 'montserrat' },
};

/** Paleta de diario impreso para el template `clasico`. */
export const CLASSIC_COLORS: CardTheme['colors'] = {
    primary: '#d9d2c3',
    accent: '#a4161a',
    text: '#141414',
    background: '#f4efe4',
    kickerBackground: '#141414',
    kickerText: '#f4efe4',
};

/**
 * Arma un tema completo a partir de cambios parciales. Si se pide `clasico` sin
 * colores propios, usa la paleta de papel y la serif.
 */
export function defineTheme(overrides: DeepPartial<CardTheme> & { brandName: string }): CardTheme {
    const classic = overrides.template === 'clasico';
    return {
        ...BASE_THEME,
        ...overrides,
        colors: { ...(classic ? CLASSIC_COLORS : BASE_THEME.colors), ...overrides.colors } as CardTheme['colors'],
        fonts: { ...BASE_THEME.fonts, ...(classic ? { headline: 'playfair' as const } : {}), ...overrides.fonts } as CardTheme['fonts'],
    } as CardTheme;
}

/**
 * Lee un tema desde una variable de entorno con JSON (ej. SOCIAL_CARD_THEME) y
 * lo combina con el tema por defecto del medio. JSON inválido → se ignora.
 */
export function themeFromEnv(defaults: CardTheme, json: string | undefined): CardTheme {
    if (!json) return defaults;
    try {
        const parsed = JSON.parse(json);
        // Pasarse a `clasico` sin colores propios toma la paleta de papel, no la del medio.
        const switchingToClassic = parsed.template === 'clasico' && defaults.template !== 'clasico';
        return defineTheme({
            ...defaults,
            ...parsed,
            colors: switchingToClassic ? parsed.colors : { ...defaults.colors, ...parsed.colors },
            fonts: switchingToClassic ? parsed.fonts : { ...defaults.fonts, ...parsed.fonts },
        });
    } catch {
        console.warn('[news-social] El JSON del tema es inválido; se usa el tema por defecto.');
        return defaults;
    }
}
