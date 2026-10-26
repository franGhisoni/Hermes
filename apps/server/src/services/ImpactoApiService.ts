import { Article } from '@prisma/client';
import { prisma } from '../lib/prisma';
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

/** Hermes stores plain text with blank lines between paragraphs; the CMS takes HTML. */
export const contentToHtml = (content: string): string =>
    content.trim()
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
        const imageUrl = article.featureImageUrl || article.originalImageUrl;

        const payload: Record<string, unknown> = {
            titulo: title,
            bajada: article.contentPreview || undefined,
            cuerpo: contentToHtml(content),
            seccion: mapSection(target.sectionMap, category, article.section),
            estado: target.apiMode === 'IN_REVIEW' ? 'EN_REVISION' : 'BORRADOR',
            origen: 'HERMES',
            // Lets the CMS dedupe retries: same Hermes article, same note.
            referenciaExterna: article.id,
            fuenteUrl: article.originalUrl,
        };
        if (imageUrl) payload.imagen = await this.buildImage(imageUrl);

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
                const reason = body?.error || body?.mensaje || response.statusText;
                console.error(`[ImpactoApi] HTTP ${response.status} publishing to ${target.name}: ${reason}`);
                return { ok: false, error: `HTTP ${response.status}: ${reason}` };
            }
            console.log(`[ImpactoApi] Article ${article.id} sent to ${target.name} as ${payload.estado} (id ${body?.id})`);
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
     * External images go as a URL (the CMS hotlinks them). Images Hermes generated
     * live in our DB and are not reachable from outside, so their bytes go inline.
     */
    private async buildImage(imageUrl: string): Promise<Record<string, unknown>> {
        const internal = imageUrl.match(/^\/api\/images\/([^\/\?]+)/);
        if (!internal) return { url: imageUrl };
        const img = await prisma.generatedImage.findUnique({ where: { id: internal[1] } });
        if (!img) {
            console.error(`[ImpactoApi] Internal image not found: ${internal[1]}`);
            return {};
        }
        return { base64: Buffer.from(img.data).toString('base64'), mimeType: img.mimeType };
    }
}
