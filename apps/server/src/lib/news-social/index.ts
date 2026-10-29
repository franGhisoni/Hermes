import { MetaPublisher } from './meta';
import { renderCard } from './render';
import { stripHighlights } from './templates';
import { errorMessage } from './util';
import type { CardContent, CardTheme, MetaConfig, NetworkResult, SocialCopy, SocialNetwork } from './types';

export * from './types';
export { renderCard, FORMAT_SIZE } from './render';
export { defineTheme, themeFromEnv, BASE_THEME, CLASSIC_COLORS } from './themes';
export { MetaPublisher, MetaApiError } from './meta';
export {
    metaAppFromEnv, metaLoginUrl, newOAuthState, exchangeCode, listManagedPages, canPublishOnPage,
    encryptSecret, decryptSecret, tokenSecretFromEnv, type MetaApp, type ManagedPage,
} from './oauth';
export { parseHighlights, stripHighlights } from './templates';
export {
    buildSocialCopyPrompt, parseSocialCopy, fallbackSocialCopy, generateSocialCopy,
    CARD_PROMPT_SECTION, CARD_PROMPT_MARKER, type CopyBrand, type CopyInput,
} from './copy';

export interface PublishNewsInput {
    /** Texto e imagen de la placa. Si falta `headline` se usa `copy.card` o el título. */
    card: CardContent;
    copy: Pick<SocialCopy, 'facebook' | 'instagram'>;
    /** URL de la nota: se agrega al texto de Facebook y como comentario en Instagram. */
    link?: string;
    theme: CardTheme;
    meta: MetaConfig;
    networks?: SocialNetwork[];
    /** Comentar el link en el posteo de Instagram (ahí los links del texto no se pueden tocar). */
    instagramLinkComment?: boolean;
    /** Placa ya renderizada (ej. la que el editor vio en la vista previa). */
    image?: Buffer;
}

export interface PublishNewsResult {
    image: Buffer;
    facebook?: NetworkResult;
    instagram?: NetworkResult;
}

/** Busca la configuración de Meta en variables de entorno con un prefijo (META_PAGE_ID, META_PAGE_ACCESS_TOKEN…). */
export function metaConfigFromEnv(env: Record<string, string | undefined> = process.env, prefix = 'META_'): MetaConfig | null {
    const pageId = env[`${prefix}PAGE_ID`];
    const pageAccessToken = env[`${prefix}PAGE_ACCESS_TOKEN`];
    if (!pageId || !pageAccessToken) return null;
    return {
        pageId,
        pageAccessToken,
        igUserId: env[`${prefix}IG_USER_ID`] || undefined,
        graphVersion: env[`${prefix}GRAPH_VERSION`] || undefined,
    };
}

function withLink(text: string, link?: string): string {
    if (!link || text.includes(link)) return text;
    return `${text.trim()}\n\n🔗 ${link}`;
}

/**
 * Renderiza la placa y la publica en las redes pedidas. Cada red se intenta por
 * separado: si Instagram falla, lo de Facebook queda publicado y se informa.
 */
export async function publishNewsToSocial(input: PublishNewsInput): Promise<PublishNewsResult> {
    const networks = input.networks ?? (input.meta.igUserId ? ['facebook', 'instagram'] : ['facebook']);
    const image = input.image ?? await renderCard(input.card, input.theme);
    const meta = new MetaPublisher(input.meta);
    const result: PublishNewsResult = { image };

    if (networks.includes('facebook')) {
        try {
            const fb = await meta.publishFacebookPhoto(image, withLink(input.copy.facebook || stripHighlights(input.card.headline), input.link));
            result.facebook = { ok: true, id: fb.postId || fb.id, permalink: fb.permalink };
        } catch (err) {
            result.facebook = { ok: false, error: errorMessage(err) };
        }
    }

    if (networks.includes('instagram')) {
        try {
            const url = await meta.hostImageOnFacebook(image);
            const ig = await meta.publishInstagramImage(url, (input.copy.instagram || stripHighlights(input.card.headline)).slice(0, 2200));
            result.instagram = { ok: true, id: ig.id, permalink: ig.permalink };
            if (input.link && input.instagramLinkComment !== false) {
                await meta.commentOnInstagram(ig.id, `🔗 Nota completa: ${input.link}`).catch(err => {
                    console.warn('[news-social] No se pudo comentar el link en Instagram:', errorMessage(err));
                });
            }
        } catch (err) {
            result.instagram = { ok: false, error: errorMessage(err) };
        }
    }

    return result;
}
