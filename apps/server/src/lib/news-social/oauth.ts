import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * "Conectar con Facebook": el cliente inicia sesión con Facebook Login for
 * Business, elige su página y nos quedamos con el token de esa página (no
 * vence mientras no cambie la contraseña ni quite el permiso).
 */

export interface MetaApp {
    appId: string;
    appSecret: string;
    /** Configuración de Facebook Login for Business (define permisos y tipo de token). */
    configId: string;
    graphVersion?: string;
}

export interface ManagedPage {
    id: string;
    name: string;
    pictureUrl?: string;
    /** Lo que la persona puede hacer en la página (CREATE_CONTENT, MANAGE…). */
    tasks: string[];
    instagram: { id: string; username?: string } | null;
    pageAccessToken: string;
}

const DEFAULT_GRAPH_VERSION = 'v21.0';

export function metaAppFromEnv(env: Record<string, string | undefined> = process.env, prefix = 'META_'): MetaApp | null {
    const appId = env[`${prefix}APP_ID`];
    const appSecret = env[`${prefix}APP_SECRET`];
    const configId = env[`${prefix}LOGIN_CONFIG_ID`];
    if (!appId || !appSecret || !configId) return null;
    return { appId, appSecret, configId, graphVersion: env[`${prefix}GRAPH_VERSION`] || undefined };
}

export const newOAuthState = () => randomBytes(24).toString('base64url');

/** Dirección a la que se manda a la persona para que autorice. */
export function metaLoginUrl(app: MetaApp, redirectUri: string, state: string): string {
    const url = new URL(`https://www.facebook.com/${app.graphVersion || DEFAULT_GRAPH_VERSION}/dialog/oauth`);
    url.searchParams.set('client_id', app.appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('config_id', app.configId);
    url.searchParams.set('response_type', 'code');
    // Login for Business: sin esto, algunas configuraciones ignoran response_type=code.
    url.searchParams.set('override_default_response_type', 'true');
    url.searchParams.set('state', state);
    return url.toString();
}

async function graphGet<T>(app: MetaApp, path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`https://graph.facebook.com/${app.graphVersion || DEFAULT_GRAPH_VERSION}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok || json.error) throw new Error(json.error?.message || `Facebook respondió ${res.status}`);
    return json;
}

/**
 * Cambia el código de la vuelta del login por un token de usuario de larga
 * duración (~60 días). Con ese token se piden los de las páginas, que no vencen.
 */
export async function exchangeCode(app: MetaApp, redirectUri: string, code: string): Promise<string> {
    const short = await graphGet<{ access_token: string }>(app, 'oauth/access_token', {
        client_id: app.appId,
        client_secret: app.appSecret,
        redirect_uri: redirectUri,
        code,
    });
    const long = await graphGet<{ access_token: string }>(app, 'oauth/access_token', {
        grant_type: 'fb_exchange_token',
        client_id: app.appId,
        client_secret: app.appSecret,
        fb_exchange_token: short.access_token,
    });
    return long.access_token;
}

/** Páginas que autorizó la persona, con su Instagram vinculado si tiene. */
export async function listManagedPages(app: MetaApp, userToken: string): Promise<ManagedPage[]> {
    const res = await graphGet<{ data: {
        id: string; name: string; access_token?: string; tasks?: string[];
        picture?: { data?: { url?: string } };
        instagram_business_account?: { id: string; username?: string };
    }[] }>(app, 'me/accounts', {
        access_token: userToken,
        fields: 'id,name,access_token,tasks,picture{url},instagram_business_account{id,username}',
        limit: '100',
    });
    return res.data
        .filter(p => p.access_token)
        .map(p => ({
            id: p.id,
            name: p.name,
            pictureUrl: p.picture?.data?.url,
            tasks: p.tasks ?? [],
            instagram: p.instagram_business_account ?? null,
            pageAccessToken: p.access_token!,
        }));
}

export const canPublishOnPage = (page: Pick<ManagedPage, 'tasks'>) =>
    page.tasks.some(t => t === 'CREATE_CONTENT' || t === 'MANAGE');

// ── Tokens guardados cifrados ────────────────────────────────────────────────

const keyFrom = (secret: string) => createHash('sha256').update(secret).digest();

/** AES-256-GCM. El resultado es "v1.iv.tag.datos" en base64url. */
export function encryptSecret(plain: string, secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), data].map(p => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

export function decryptSecret(sealed: string, secret: string): string {
    const [version, iv, tag, data] = sealed.split('.');
    if (version !== 'v1' || !iv || !tag || !data) throw new Error('Token guardado con un formato desconocido');
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

/** Clave para cifrar tokens: SOCIAL_TOKEN_SECRET, o el secreto de la app si no está. */
export function tokenSecretFromEnv(env: Record<string, string | undefined> = process.env): string | null {
    return env.SOCIAL_TOKEN_SECRET || env.META_APP_SECRET || null;
}
