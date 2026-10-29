import { Article } from '@prisma/client';
import { isLaNacionAccessWall } from './ContentSafetyService';

export interface ImpactoTarget {
    name: string;
    apiUrl: string | null;
    apiKey: string | null;
    apiMode: string;
    sectionMap: unknown;
}

export interface ImpactoResult {
    ok: boolean;
    id?: string;
    url?: string;
    error?: string;
}

const escapeHtml = (text: string) => text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const HTML_BLOCK = /<(p|h[2-6]|ul|ol|blockquote|div)[\s>]/i;

/**
 * Hermes stores either plain text with blank lines between paragraphs or, for SEO
 * rewrites, ready-made HTML. The CMS takes HTML, so only plain text is converted.
 */
export const contentToHtml = (content: string): string =>
    HTML_BLOCK.test(content) ? content.trim() : content.trim()
        .split(/\n\s*\n/)
        .map(paragraph => paragraph.trim())
        .filter(Boolean)
        .map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
        .join('\n');

/** Picks the CMS section slug for a Hermes section/category using the target's map. */
export const mapSection = (sectionMap: unknown, ...candidates: Array<string | null | undefined>): string | undefined => {
    const map = sectionMap && typeof sectionMap === 'object' && !Array.isArray(sectionMap)
        ? sectionMap as Record<string, unknown>
        : {};
    const normalized = new Map(Object.entries(map).map(([key, value]) => [key.trim().toLowerCase(), value]));
    for (const candidate of candidates) {
        if (!candidate) continue;
        const mapped = normalized.get(candidate.trim().toLowerCase());
        if (typeof mapped === 'string' && mapped.trim()) return mapped.trim();
    }
    return candidates.find(Boolean) || undefined;
};

/** A field of the SEO version the newsroom edits (editorialData.seo), if any. */
const seoText = (article: Article, key: string): string | undefined => {
    const value = (article.editorialData as any)?.seo?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

/** Trims to the CMS limits so a long copy never makes the whole note fail with a 422. */
const clip = (text: unknown, max: number): string | undefined =>
    typeof text === 'string' && text.trim() ? text.trim().slice(0, max) : undefined;

/**
 * The social copy edited in the newsroom (editorialData.social), in the shape the
 * CMS expects. The CMS posts it to Facebook/Instagram with the card when the note
 * is published; without it, the CMS writes its own copy.
 */
export const socialPayload = (article: Article): Record<string, unknown> | undefined => {
    const social = (article.editorialData as any)?.social;
    const facebook = clip(social?.facebook, 5000);
    const instagram = clip(social?.instagram, 2200);
    if (!facebook && !instagram) return undefined;
    const headline = clip(social?.card?.headline, 200);
    return {
        facebook,
        instagram,
        hashtags: clip(social?.hashtags, 500),
        placa: headline ? { titulo: headline, volanta: clip(social?.card?.kicker, 60) } : undefined,
    };
};

/** The CMS downgrades to draft (with a warning) if the key's account cannot publish. */
const STATUS_BY_MODE: Record<string, string> = { DRAFT: 'draft', IN_REVIEW: 'in_review', PUBLISHED: 'published' };

export class ImpactoApiService {
    public async publish(target: ImpactoTarget, article: Article, category?: string): Promise<ImpactoResult> {
        if (isLaNacionAccessWall(article)) {
            return { ok: false, error: 'Publicación bloqueada: promoción o muro de acceso de La Nación.' };
        }
        if (!target.apiUrl || !target.apiKey) {
            return { ok: false, error: `El medio ${target.name} no tiene URL o clave de API configuradas.` };
        }

        const title = article.rewrittenTitle || article.originalTitle;
        const content = article.rewrittenContent || article.originalContent;
        const section = mapSection(target.sectionMap, category, article.section);
        if (!section) {
            return { ok: false, error: 'La nota no tiene sección para enviar al CMS.' };
        }

        const imageUrl = this.absoluteImageUrl(article.featureImageUrl || article.originalImageUrl);
        const status = STATUS_BY_MODE[target.apiMode] ?? 'draft';
        const payload: Record<string, unknown> = {
            title,
            section,
            subtitle: seoText(article, 'bajada') || article.contentPreview || undefined,
            body: contentToHtml(content),
            status,
            // Retrying with the same ref never duplicates the note in the CMS.
            externalRef: article.id,
            redes: socialPayload(article),
        };
        if (imageUrl) {
            payload.imageUrl = imageUrl;
            // The CMS requires alt text to move a note with an image to review.
            payload.imageAlt = `Imagen de la nota: ${title}`.slice(0, 300);
        }

        const endpoint = `${target.apiUrl.replace(/\/+$/, '')}/api/v1/notas`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${target.apiKey}`,
                },
                body: JSON.stringify(payload),
            });
            const body: any = await response.json().catch(() => ({}));
            if (!response.ok) {
                const err = body?.error;
                const reason = (typeof err === 'string' ? err : err?.message) || response.statusText;
                console.error(`[ImpactoApi] HTTP ${response.status} publishing to ${target.name}: ${reason}`);
                return { ok: false, error: `HTTP ${response.status}: ${reason}` };
            }
            if (body?.warning) {
                console.warn(`[ImpactoApi] ${target.name} accepted article ${article.id} as ${body.status} with a warning: ${body.warning}`);
            }
            // 200 with duplicate:true means the CMS already had this externalRef: still a success.
            console.log(`[ImpactoApi] Article ${article.id} sent to ${target.name} as ${body?.status ?? status} (id ${body?.id}${body?.duplicate ? ', duplicate' : ''})`);
            return { ok: true, id: body?.id != null ? String(body.id) : undefined, url: body?.url };
        } catch (error: any) {
            const reason = error?.name === 'AbortError' ? 'timeout' : error?.message || String(error);
            console.error(`[ImpactoApi] Failed to publish to ${target.name}: ${reason}`);
            return { ok: false, error: reason };
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * The CMS only accepts absolute http(s) image URLs and hotlinks them. Images Hermes
     * generated are served from /api/images/:id, so they need HERMES_PUBLIC_URL to be reachable.
     */
    private absoluteImageUrl(imageUrl?: string | null): string | undefined {
        if (!imageUrl) return undefined;
        if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
        const base = process.env.HERMES_PUBLIC_URL?.trim().replace(/\/+$/, '');
        if (!base || !imageUrl.startsWith('/')) {
            console.warn(`[ImpactoApi] Image ${imageUrl} is not absolute and HERMES_PUBLIC_URL is not set: sending the note without image.`);
            return undefined;
        }
        return `${base}${imageUrl}`;
    }
}
