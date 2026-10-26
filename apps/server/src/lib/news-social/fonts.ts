import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { FontFamily } from './types';

type Weight = 400 | 500 | 600 | 700 | 800 | 900;

interface SatoriFont {
    name: string;
    data: Buffer;
    weight: Weight;
    style: 'normal';
}

const FILES: Record<FontFamily, { pkg: string; prefix: string; weights: Weight[] }> = {
    montserrat: { pkg: '@fontsource/montserrat', prefix: 'montserrat-latin', weights: [500, 700, 800] },
    anton: { pkg: '@fontsource/anton', prefix: 'anton-latin', weights: [400] },
    playfair: { pkg: '@fontsource/playfair-display', prefix: 'playfair-display-latin', weights: [400, 700, 900] },
};

/** Nombre de familia que se usa en los estilos de las placas. */
export const FONT_NAME: Record<FontFamily, string> = {
    montserrat: 'Montserrat',
    anton: 'Anton',
    playfair: 'Playfair Display',
};

/** Peso "fuerte" de cada familia para titulares. */
export const HEADLINE_WEIGHT: Record<FontFamily, Weight> = {
    montserrat: 800,
    anton: 400,
    playfair: 900,
};

/**
 * Ancho promedio de un carácter en "em" (para elegir el tamaño del titular sin
 * medir). Es una estimación conservadora: mejor que sobre un poco de aire a que
 * el titular se corte.
 */
export const CHAR_WIDTH: Record<FontFamily, { upper: number; mixed: number }> = {
    montserrat: { upper: 0.74, mixed: 0.6 },
    anton: { upper: 0.47, mixed: 0.42 },
    playfair: { upper: 0.7, mixed: 0.52 },
};

// Se resuelve desde la raíz del proyecto para que funcione igual compilado con
// tsc (Hermes), con ts-node y empaquetado por Next (Impacto Castex).
const requireFromRoot = createRequire(path.join(process.cwd(), 'package.json'));

let cache: Promise<SatoriFont[]> | null = null;

export function loadFonts(): Promise<SatoriFont[]> {
    if (!cache) {
        cache = (async () => {
            const fonts: SatoriFont[] = [];
            for (const [family, spec] of Object.entries(FILES) as [FontFamily, typeof FILES[FontFamily]][]) {
                const dir = path.dirname(requireFromRoot.resolve(`${spec.pkg}/package.json`));
                for (const weight of spec.weights) {
                    const data = await readFile(path.join(dir, 'files', `${spec.prefix}-${weight}-normal.woff`));
                    fonts.push({ name: FONT_NAME[family], data, weight, style: 'normal' });
                }
            }
            return fonts;
        })();
        cache.catch(() => { cache = null; });
    }
    return cache;
}
