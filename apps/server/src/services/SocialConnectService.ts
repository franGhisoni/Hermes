import type { Request } from 'express';
import { prisma } from '../lib/prisma';
import {
    canPublishOnPage, decryptSecret, encryptSecret, exchangeCode, listManagedPages, metaAppFromEnv,
    metaConfigFromEnv, metaLoginUrl, newOAuthState, tokenSecretFromEnv,
    type ManagedPage, type MetaConfig,
} from '../lib/news-social';

const PENDING_TTL_MS = 15 * 60 * 1000;

interface PendingConnect {
    userId: string;
    /** A dónde volver en el panel cuando Facebook responde. */
    returnTo: string;
    redirectUri: string;
    /** Token de usuario cifrado, cuando la persona ya autorizó y falta elegir la página. */
    sealedUserToken?: string;
    expiresAt: number;
}

export interface PublicPage {
    id: string;
    name: string;
    pictureUrl?: string;
    instagram: { id: string; username?: string } | null;
    canPublish: boolean;
}

/**
 * "Conectar con Facebook" desde el panel. El ida y vuelta vive en memoria
 * (15 minutos): si el servidor se reinicia en el medio, se vuelve a conectar.
 */
export class SocialConnectService {
    private pending = new Map<string, PendingConnect>();

    missingConfig(): string | null {
        if (!metaAppFromEnv()) return 'META_APP_ID, META_APP_SECRET y META_LOGIN_CONFIG_ID';
        if (!tokenSecretFromEnv()) return 'SOCIAL_TOKEN_SECRET';
        return null;
    }

    /** La URL pública de este servidor para la vuelta de Facebook (registrala en la app de Meta). */
    redirectUri(req: Request): string {
        if (process.env.SOCIAL_OAUTH_REDIRECT_URI) return process.env.SOCIAL_OAUTH_REDIRECT_URI;
        const proto = (req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
        return `${proto}://${req.get('x-forwarded-host') || req.get('host')}/oauth/meta/callback`;
    }

    private sweep() {
        const now = Date.now();
        for (const [state, p] of this.pending) if (p.expiresAt < now) this.pending.delete(state);
    }

    start(req: Request, userId: string, returnTo: string): string {
        this.sweep();
        const app = metaAppFromEnv();
        if (!app) throw new Error('La app de Meta no está configurada en el servidor');
        const state = newOAuthState();
        const redirectUri = this.redirectUri(req);
        this.pending.set(state, { userId, returnTo, redirectUri, expiresAt: Date.now() + PENDING_TTL_MS });
        return metaLoginUrl(app, redirectUri, state);
    }

    /** Vuelta de Facebook. Devuelve a dónde redirigir el navegador. */
    async callback(query: Record<string, unknown>): Promise<string> {
        const state = typeof query.state === 'string' ? query.state : '';
        const entry = this.pending.get(state);
        if (!entry || entry.expiresAt < Date.now()) return '/?redes=vencido';
        const back = (params: string) => `${entry.returnTo}${entry.returnTo.includes('?') ? '&' : '?'}${params}`;

        if (query.error || typeof query.code !== 'string') {
            this.pending.delete(state);
            return back('redes=cancelado');
        }
        try {
            const userToken = await exchangeCode(metaAppFromEnv()!, entry.redirectUri, query.code);
            entry.sealedUserToken = encryptSecret(userToken, tokenSecretFromEnv()!);
            entry.expiresAt = Date.now() + PENDING_TTL_MS;
            return back(`redes=elegir&estado=${encodeURIComponent(state)}`);
        } catch (err) {
            console.error('[SocialConnect] Falló el intercambio del código de Facebook:', err);
            this.pending.delete(state);
            return back('redes=facebook');
        }
    }

    private async pendingPages(state: string, userId: string): Promise<ManagedPage[]> {
        const entry = this.pending.get(state);
        if (!entry?.sealedUserToken || entry.expiresAt < Date.now() || entry.userId !== userId) {
            throw new Error('La autorización de Facebook venció. Volvé a conectar.');
        }
        return listManagedPages(metaAppFromEnv()!, decryptSecret(entry.sealedUserToken, tokenSecretFromEnv()!));
    }

    async listPages(state: string, userId: string): Promise<PublicPage[]> {
        const pages = await this.pendingPages(state, userId);
        return pages.map(p => ({ id: p.id, name: p.name, pictureUrl: p.pictureUrl, instagram: p.instagram, canPublish: canPublishOnPage(p) }));
    }

    async select(state: string, userId: string, username: string, pageId: string) {
        const page = (await this.pendingPages(state, userId)).find(p => p.id === pageId);
        if (!page) throw new Error('Esa página no está entre las que autorizaste.');
        if (!canPublishOnPage(page)) throw new Error('En esa página no tenés permiso para publicar.');

        const data = {
            pageName: page.name,
            pagePictureUrl: page.pictureUrl ?? null,
            igUserId: page.instagram?.id ?? null,
            igUsername: page.instagram?.username ?? null,
            pageToken: encryptSecret(page.pageAccessToken, tokenSecretFromEnv()!),
            connectedBy: username,
        };
        // Una sola página conectada: la nueva reemplaza a la anterior.
        await prisma.$transaction([
            prisma.socialAccount.deleteMany({ where: { pageId: { not: page.id } } }),
            prisma.socialAccount.upsert({ where: { pageId: page.id }, create: { pageId: page.id, ...data }, update: data }),
        ]);
        this.pending.delete(state);
        return this.status();
    }

    async disconnect() {
        await prisma.socialAccount.deleteMany();
    }

    async status() {
        const account = await prisma.socialAccount.findFirst({ orderBy: { updatedAt: 'desc' } });
        return {
            missingConfig: this.missingConfig(),
            account: account && {
                pageId: account.pageId,
                pageName: account.pageName,
                pagePictureUrl: account.pagePictureUrl,
                igUsername: account.igUsername,
                connectedBy: account.connectedBy,
                connectedAt: account.updatedAt,
            },
            usingEnv: !account && metaConfigFromEnv() !== null,
        };
    }

    /** La página conectada desde el panel; si no hay, la de las variables META_*. */
    async metaConfig(): Promise<MetaConfig | null> {
        const account = await prisma.socialAccount.findFirst({ orderBy: { updatedAt: 'desc' } });
        const secret = tokenSecretFromEnv();
        if (account && secret) {
            try {
                return {
                    pageId: account.pageId,
                    pageAccessToken: decryptSecret(account.pageToken, secret),
                    igUserId: account.igUserId ?? undefined,
                    graphVersion: process.env.META_GRAPH_VERSION || undefined,
                };
            } catch {
                console.error('[SocialConnect] No se pudo descifrar el token guardado: ¿cambió SOCIAL_TOKEN_SECRET o META_APP_SECRET? Hay que volver a conectar.');
            }
        }
        return metaConfigFromEnv();
    }
}

export const socialConnectService = new SocialConnectService();
