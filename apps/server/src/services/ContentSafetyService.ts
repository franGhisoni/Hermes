/**
 * Last-resort safety gate for publisher interstitials that are returned as
 * HTTP 200 pages and otherwise look like articles.  This is intentionally
 * independent from a scraper: queued legacy rows and manual publishing must
 * be protected too.
 */
export function isLaNacionAccessWall(article: {
    originalUrl?: string | null;
    url?: string | null;
    originalTitle?: string | null;
    title?: string | null;
    originalContent?: string | null;
    content?: string | null;
    rewrittenTitle?: string | null;
    rewrittenContent?: string | null;
}): boolean {
    const url = article.originalUrl || article.url || '';
    if (!/(^|\.)lanacion\.com\.ar(?:\/|$)/i.test(safeHostname(url))) return false;

    const text = [
        article.originalTitle,
        article.title,
        article.originalContent,
        article.content,
        article.rewrittenTitle,
        article.rewrittenContent
    ]
        .filter((value): value is string => typeof value === 'string')
        .join(' ')
        .replace(/<[^>]*>/g, ' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .toLowerCase();

    return [
        /alcan(?:ce|za) el limite de articulos(?: gratuitos)?/,
        /limite de articulos gratuitos/,
        /(?:cantidad limitada|numero restringido) de articulos/,
        /oportunidades de suscripcion/,
        /disfruta de beneficios exclusivos/,
        /credencial de club premium/,
        /suscribite para seguir leyendo/,
        /contenido exclusivo para suscriptores/
    ].some(pattern => pattern.test(text))
        || /(?:limite|maximo) de (?:notas|articulos) (?:gratuit[oa]s|gratis)/.test(text)
        || (/club (?:la nacion )?premium/.test(text) && /credencial|acceso ilimitado|resumir|guardar y comentar/.test(text));
}

function safeHostname(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}
