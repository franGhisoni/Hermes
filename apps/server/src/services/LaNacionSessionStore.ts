import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import Redis from 'ioredis';
import type { CookieParam } from 'puppeteer';

const SESSION_KEY = 'hermes:lanacion:subscriber-session:v1';

export class LaNacionSessionStore {
    private static client: Redis | undefined;

    private getClient(): Redis | undefined {
        if (!process.env.REDIS_URL && !process.env.REDIS_HOST) return undefined;
        if (!LaNacionSessionStore.client) {
            LaNacionSessionStore.client = process.env.REDIS_URL
                ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 5000, retryStrategy: () => null })
                : new Redis({
                    host: process.env.REDIS_HOST,
                    port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
                    password: process.env.REDIS_PASSWORD,
                    maxRetriesPerRequest: 1,
                    connectTimeout: 5000,
                    retryStrategy: () => null
                });
            LaNacionSessionStore.client.on('error', () => undefined);
        }
        return LaNacionSessionStore.client;
    }

    async load(password: string): Promise<CookieParam[] | null> {
        const client = this.getClient();
        if (!client) return null;
        try {
            const payload = await client.get(SESSION_KEY);
            if (!payload) return null;
            return JSON.parse(this.decrypt(payload, password)) as CookieParam[];
        } catch (error) {
            console.warn('[LaNacion] Could not restore the encrypted Redis session:', error instanceof Error ? error.message : String(error));
            return null;
        }
    }

    async save(password: string, cookies: CookieParam[]): Promise<void> {
        const client = this.getClient();
        if (!client) return;
        const authCookies = cookies.filter(cookie => ['token', 'access-token'].includes(cookie.name));
        if (!authCookies.length) return;
        const now = Math.floor(Date.now() / 1000);
        const expirations = authCookies.map(cookie => cookie.expires || now + 86400).filter(expires => expires > now);
        const ttl = Math.max(60, Math.min(...expirations) - now);
        try {
            await client.set(SESSION_KEY, this.encrypt(JSON.stringify(authCookies), password), 'EX', ttl);
        } catch (error) {
            console.warn('[LaNacion] Could not persist the encrypted Redis session:', error instanceof Error ? error.message : String(error));
        }
    }

    async clear(): Promise<void> {
        try { await this.getClient()?.del(SESSION_KEY); }
        catch { /* A Redis outage must not prevent a fresh login. */ }
    }

    private key(password: string): Buffer {
        return createHash('sha256').update(`hermes:lanacion:${password}`).digest();
    }

    private encrypt(plainText: string, password: string): string {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', this.key(password), iv);
        const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
        return [iv, cipher.getAuthTag(), encrypted].map(value => value.toString('base64url')).join('.');
    }

    private decrypt(payload: string, password: string): string {
        const [iv, tag, encrypted] = payload.split('.').map(value => Buffer.from(value, 'base64url'));
        if (!iv || !tag || !encrypted) throw new Error('invalid session payload');
        const decipher = createDecipheriv('aes-256-gcm', this.key(password), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    }
}
