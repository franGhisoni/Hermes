import { prisma } from '../lib/prisma';
import { socialConnectService } from './SocialConnectService';
import {
    defineTheme, publishNewsToSocial, renderCard, stripHighlights, themeFromEnv,
    type CardContent, type CardFormat, type CardTemplate, type CardTheme, type NetworkResult, type SocialNetwork,
} from '../lib/news-social';

/**
 * Tema de Política del Sur. Se puede pisar sin tocar código con SOCIAL_CARD_THEME
 * (JSON parcial, ej. {"template":"degradado","colors":{"accent":"#ff7a00"}}).
 */
const PDS_THEME = defineTheme({
    brandName: 'Política del Sur',
    template: 'banda',
    format: 'portrait',
    footer: 'politicadelsur.com',
    colors: {
        primary: '#0e4aa3',
        accent: '#f47b20',
        text: '#ffffff',
        background: '#0b1f3f',
        kickerBackground: '#111111',
        kickerText: '#ffffff',
    },
});

export interface CardOverrides {
    headline?: string;
    kicker?: string;
    template?: CardTemplate;
    format?: CardFormat;
}

export interface SocialPublishOptions extends CardOverrides {
    networks?: SocialNetwork[];
    facebook?: string;
    instagram?: string;
    /** Id de la nota en Vorknews, para armar el link con SOCIAL_LINK_TEMPLATE. */
    vorknewsId?: string;
}

export class SocialPublishService {
    theme(overrides: CardOverrides = {}): CardTheme {
        const base = themeFromEnv(PDS_THEME, process.env.SOCIAL_CARD_THEME);
        const theme = { ...base, logoUrl: base.logoUrl || process.env.SOCIAL_LOGO_URL || undefined };
        if (overrides.template && overrides.template !== theme.template) {
            return themeFromEnv(theme, JSON.stringify({ template: overrides.template, format: overrides.format ?? theme.format }));
        }
        return overrides.format ? { ...theme, format: overrides.format } : theme;
    }

    async isConfigured(): Promise<boolean> {
        return (await socialConnectService.metaConfig()) !== null;
    }

    async hasInstagram(): Promise<boolean> {
        return Boolean((await socialConnectService.metaConfig())?.igUserId);
    }

    async autoPublishEnabled(): Promise<boolean> {
        return process.env.SOCIAL_AUTO_PUBLISH === 'true' && await this.isConfigured();
    }

    private async loadArticle(articleId: string) {
        const article = await prisma.article.findUnique({ where: { id: articleId } });
        if (!article) throw new Error('Artículo no encontrado');
        return article;
    }

    /** Las imágenes generadas por Hermes viven en la base (/api/images/:id). */
    private async imageBytes(url: string | null | undefined): Promise<Pick<CardContent, 'image' | 'imageUrl'>> {
        if (!url) return {};
        const internal = url.match(/^\/api\/images\/([^/?]+)/);
        if (internal) {
            const img = await prisma.generatedImage.findUnique({ where: { id: internal[1] } });
            return img ? { image: Buffer.from(img.data) } : {};
        }
        return { imageUrl: url };
    }

    async cardContent(articleId: string, overrides: CardOverrides = {}): Promise<CardContent> {
        const article: any = await this.loadArticle(articleId);
        const editorial = article.editorialData || {};
        const title = editorial.seo?.title || article.rewrittenTitle || article.originalTitle;
        return {
            headline: overrides.headline || editorial.social?.card?.headline || title,
            kicker: overrides.kicker ?? editorial.social?.card?.kicker ?? (editorial.seo?.volanta || undefined),
            ...(await this.imageBytes(article.featureImageUrl || article.originalImageUrl)),
        };
    }

    async preview(articleId: string, overrides: CardOverrides = {}): Promise<Buffer> {
        return renderCard(await this.cardContent(articleId, overrides), this.theme(overrides));
    }

    private link(vorknewsId?: string): string | undefined {
        const template = process.env.SOCIAL_LINK_TEMPLATE;
        if (!template || !vorknewsId) return undefined;
        return template.replace('{vorknewsId}', vorknewsId);
    }

    async publish(articleId: string, options: SocialPublishOptions = {}): Promise<{ facebook?: NetworkResult; instagram?: NetworkResult }> {
        const meta = await socialConnectService.metaConfig();
        if (!meta) throw new Error('Las redes no están conectadas: conectá la página en Configuración → Redes');

        const article: any = await this.loadArticle(articleId);
        const editorial = article.editorialData || {};
        const card = await this.cardContent(articleId, options);
        const title = stripHighlights(card.headline);

        const result = await publishNewsToSocial({
            card,
            theme: this.theme(options),
            meta,
            networks: options.networks,
            link: this.link(options.vorknewsId || editorial.vorknewsId),
            copy: {
                facebook: options.facebook || editorial.social?.facebook || title,
                instagram: options.instagram || editorial.social?.instagram || title,
            },
        });

        const fresh: any = await this.loadArticle(articleId);
        await prisma.article.update({
            where: { id: articleId },
            data: {
                editorialData: {
                    ...(fresh.editorialData || {}),
                    socialPublish: {
                        at: new Date().toISOString(),
                        facebook: result.facebook ?? null,
                        instagram: result.instagram ?? null,
                    },
                },
            },
        });

        return { facebook: result.facebook, instagram: result.instagram };
    }
}

export const socialPublishService = new SocialPublishService();
