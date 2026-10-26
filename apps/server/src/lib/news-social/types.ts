/**
 * news-social: placas periodísticas + publicación en Facebook e Instagram.
 *
 * Módulo autocontenido (solo depende de `sharp`, `satori` y las fuentes de
 * `@fontsource/*`). Vive copiado en Hermes y en Impacto Castex: si lo cambiás en
 * uno, copiá la carpeta entera al otro (ver README.md).
 */

export type CardTemplate = 'banda' | 'degradado' | 'panel' | 'clasico';
export type CardFormat = 'square' | 'portrait' | 'story';
export type FontFamily = 'montserrat' | 'anton' | 'playfair';

export interface CardTheme {
    /** Nombre del medio: se usa como logo de texto si no hay `logoUrl`. */
    brandName: string;
    /** Logo (PNG/SVG/WebP con fondo transparente). Si falla la descarga se usa `brandName`. */
    logoUrl?: string;
    /** Alto del logo en px sobre una placa de 1080 de ancho. */
    logoHeight?: number;
    template: CardTemplate;
    format: CardFormat;
    colors: {
        /** Color institucional: banda del titular, chevrons. */
        primary: string;
        /** Resaltado de palabras (*así*) y detalles. */
        accent: string;
        /** Texto sobre la banda / panel. */
        text: string;
        /** Fondo del panel inferior o del papel en `clasico`. */
        background: string;
        /** Fondo de la volanta. */
        kickerBackground: string;
        kickerText: string;
    };
    fonts: {
        headline: FontFamily;
        body: FontFamily;
    };
    /** Titular en mayúsculas (estilo placa de noticiero). Por defecto true salvo en `clasico`. */
    uppercaseHeadline?: boolean;
    /** Foto en blanco y negro (queda muy bien con `clasico`). */
    grayscalePhoto?: boolean;
    /** Texto chico abajo de todo, ej. "politicadelsur.com.ar". */
    footer?: string;
}

/** Lo que va escrito en la placa. */
export interface CardContent {
    /**
     * Titular corto de la placa. Las palabras entre asteriscos se pintan con el
     * color de acento: "PAREJA DELINEÓ *EL ARMADO* DE LLA".
     */
    headline: string;
    /** Volanta / etiqueta chica arriba del titular ("PERONISMO", "ACTO EN LANÚS"). */
    kicker?: string;
    /** Foto principal (URL pública) o los bytes ya descargados. */
    imageUrl?: string;
    image?: Buffer;
    /** Fecha para el template `clasico` (por defecto hoy). */
    date?: Date;
}

export interface SocialCopy {
    facebook: string;
    instagram: string;
    twitter?: string;
    hashtags?: string;
    /** Texto para la placa, generado junto con el copy. */
    card?: { headline: string; kicker?: string };
}

export interface MetaConfig {
    pageId: string;
    /** Token de página de larga duración con pages_manage_posts e instagram_content_publish. */
    pageAccessToken: string;
    /** Id de la cuenta de Instagram Business vinculada a la página. */
    igUserId?: string;
    graphVersion?: string;
}

export type SocialNetwork = 'facebook' | 'instagram';

export interface NetworkResult {
    ok: boolean;
    id?: string;
    permalink?: string;
    error?: string;
}
