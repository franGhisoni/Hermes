import type { MetaConfig } from './types';

const DEFAULT_GRAPH_VERSION = 'v21.0';
const IG_POLL_INTERVAL_MS = 3_000;
const IG_POLL_ATTEMPTS = 20;

export class MetaApiError extends Error {
    constructor(message: string, readonly code?: number, readonly subcode?: number) {
        super(message);
        this.name = 'MetaApiError';
    }
}

interface GraphError {
    message?: string;
    error_user_msg?: string;
    code?: number;
    error_subcode?: number;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Cliente mínimo de la Graph API para publicar en una página de Facebook y en
 * la cuenta de Instagram Business vinculada. No guarda estado.
 */
export class MetaPublisher {
    private readonly base: string;

    constructor(private readonly config: MetaConfig) {
        this.base = `https://graph.facebook.com/${config.graphVersion || DEFAULT_GRAPH_VERSION}`;
    }

    private async call<T>(path: string, init: { method?: string; params?: Record<string, string>; body?: FormData; token?: string } = {}): Promise<T> {
        const url = new URL(`${this.base}/${path}`);
        const params = { access_token: init.token ?? this.config.pageAccessToken, ...init.params };
        let body = init.body;
        if (init.method === 'POST' && !body) {
            body = new FormData();
            for (const [k, v] of Object.entries(params)) body.append(k, v);
        } else {
            for (const [k, v] of Object.entries(params)) {
                if (body) body.append(k, v);
                else url.searchParams.set(k, v);
            }
        }
        const res = await fetch(url, { method: init.method || 'GET', body, signal: AbortSignal.timeout(60_000) });
        const json = (await res.json().catch(() => ({}))) as T & { error?: GraphError };
        if (!res.ok || json.error) {
            const e: GraphError = json.error || {};
            throw new MetaApiError(e.error_user_msg || e.message || `Graph API respondió ${res.status}`, e.code, e.error_subcode);
        }
        return json as T;
    }

    private photoForm(image: Buffer, fields: Record<string, string>): FormData {
        const form = new FormData();
        form.append('source', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), 'placa.jpg');
        for (const [k, v] of Object.entries(fields)) form.append(k, v);
        return form;
    }

    /** Publica la placa como foto en la página, con el copy como texto. */
    async publishFacebookPhoto(image: Buffer, message: string): Promise<{ id: string; postId?: string; permalink?: string }> {
        const res = await this.call<{ id: string; post_id?: string }>(`${this.config.pageId}/photos`, {
            method: 'POST',
            body: this.photoForm(image, { message, published: 'true' }),
        });
        const postId = res.post_id;
        let permalink: string | undefined;
        if (postId) {
            permalink = await this.call<{ permalink_url?: string }>(postId, { params: { fields: 'permalink_url' } })
                .then(r => r.permalink_url)
                .catch(() => undefined);
        }
        return { id: res.id, postId, permalink };
    }

    async commentOnFacebook(objectId: string, message: string): Promise<string> {
        const res = await this.call<{ id: string }>(`${objectId}/comments`, { method: 'POST', params: { message } });
        return res.id;
    }

    /**
     * Instagram solo acepta imágenes por URL pública. En vez de alojar la placa
     * nosotros, se sube a la página como foto NO publicada (no aparece en el
     * muro) y se usa la URL del CDN de Facebook.
     */
    async hostImageOnFacebook(image: Buffer): Promise<string> {
        const res = await this.call<{ id: string }>(`${this.config.pageId}/photos`, {
            method: 'POST',
            body: this.photoForm(image, { published: 'false', temporary: 'true' }),
        });
        const photo = await this.call<{ images?: { source: string; width: number }[] }>(res.id, { params: { fields: 'images' } });
        const largest = photo.images?.sort((a, b) => b.width - a.width)[0];
        if (!largest) throw new MetaApiError('Facebook no devolvió la URL de la imagen subida');
        return largest.source;
    }

    /** Crea el contenedor, espera a que Instagram lo procese y lo publica. */
    async publishInstagramImage(imageUrl: string, caption: string): Promise<{ id: string; permalink?: string }> {
        const igUserId = this.config.igUserId;
        if (!igUserId) throw new MetaApiError('Falta el id de la cuenta de Instagram (igUserId)');
        const token = this.config.igAccessToken;

        const container = await this.call<{ id: string }>(`${igUserId}/media`, {
            method: 'POST',
            params: { image_url: imageUrl, caption },
            token,
        });

        for (let i = 0; i < IG_POLL_ATTEMPTS; i++) {
            const { status_code } = await this.call<{ status_code?: string }>(container.id, { params: { fields: 'status_code' }, token });
            if (status_code === 'FINISHED') break;
            if (status_code === 'ERROR' || status_code === 'EXPIRED') {
                throw new MetaApiError(`Instagram rechazó la imagen (${status_code})`);
            }
            if (i === IG_POLL_ATTEMPTS - 1) throw new MetaApiError('Instagram tardó demasiado en procesar la imagen');
            await sleep(IG_POLL_INTERVAL_MS);
        }

        const published = await this.call<{ id: string }>(`${igUserId}/media_publish`, {
            method: 'POST',
            params: { creation_id: container.id },
            token,
        });
        const permalink = await this.call<{ permalink?: string }>(published.id, { params: { fields: 'permalink' }, token })
            .then(r => r.permalink)
            .catch(() => undefined);
        return { id: published.id, permalink };
    }

    async commentOnInstagram(mediaId: string, message: string): Promise<string> {
        const res = await this.call<{ id: string }>(`${mediaId}/comments`, { method: 'POST', params: { message }, token: this.config.igAccessToken });
        return res.id;
    }
}
