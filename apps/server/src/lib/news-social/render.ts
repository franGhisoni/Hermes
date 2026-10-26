import satori from 'satori';
import sharp from 'sharp';
import { loadFonts } from './fonts';
import { TEMPLATES, type TemplateContext } from './templates';
import { errorMessage } from './util';
import type { CardContent, CardFormat, CardTheme } from './types';

export const FORMAT_SIZE: Record<CardFormat, { width: number; height: number }> = {
    square: { width: 1080, height: 1080 },
    // 4:5: lo más alto que acepta el feed de Instagram y se ve bien en Facebook.
    portrait: { width: 1080, height: 1350 },
    story: { width: 1080, height: 1920 },
};

const FETCH_TIMEOUT_MS = 15_000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

async function download(url: string): Promise<Buffer> {
    const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*',
        },
    });
    if (!res.ok) throw new Error(`No se pudo descargar la imagen (${res.status}): ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_IMAGE_BYTES) throw new Error('La imagen pesa más de 20 MB');
    return buf;
}

const dataUri = (buf: Buffer, mime: string) => `data:${mime};base64,${buf.toString('base64')}`;

export interface RenderOptions {
    /** Pisa el formato del tema (útil para sacar la versión historia). */
    format?: CardFormat;
}

/**
 * Arma la placa y devuelve un JPEG listo para subir a Facebook o Instagram.
 * Si la foto no se puede bajar, la placa sale igual con un fondo liso.
 */
export async function renderCard(content: CardContent, theme: CardTheme, options: RenderOptions = {}): Promise<Buffer> {
    const { width, height } = FORMAT_SIZE[options.format ?? theme.format];

    let source: Buffer | null = content.image ?? null;
    if (!source && content.imageUrl) {
        source = await download(content.imageUrl).catch(err => {
            console.warn('[news-social] Foto no disponible, la placa sale sin foto:', errorMessage(err));
            return null;
        });
    }

    let logo: TemplateContext['logo'] = null;
    if (theme.logoUrl) {
        try {
            const raw = await download(theme.logoUrl);
            const { data, info } = await sharp(raw, { density: 300 })
                .resize({ height: theme.logoHeight ?? 64 })
                .png()
                .toBuffer({ resolveWithObject: true });
            logo = { src: dataUri(data, 'image/png'), width: info.width, height: info.height };
        } catch (err) {
            console.warn('[news-social] Logo no disponible, se usa el nombre del medio:', errorMessage(err));
        }
    }

    const ctx: TemplateContext = {
        width,
        height,
        theme,
        content,
        logo,
        async photo(w, h) {
            if (!source) return null;
            try {
                let pipeline = sharp(source, { limitInputPixels: 80_000_000 })
                    .rotate()
                    .resize(Math.round(w), Math.round(h), { fit: 'cover', position: sharp.strategy.attention });
                if (theme.grayscalePhoto) pipeline = pipeline.grayscale();
                return dataUri(await pipeline.jpeg({ quality: 88 }).toBuffer(), 'image/jpeg');
            } catch (err) {
                console.warn('[news-social] La foto no se pudo procesar:', errorMessage(err));
                return null;
            }
        },
    };

    const tree = await TEMPLATES[theme.template](ctx);
    // satori acepta elementos de React; nuestros nodos tienen la misma forma.
    const svg = await satori(tree as unknown as Parameters<typeof satori>[0], { width, height, fonts: await loadFonts() });
    return sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer();
}
