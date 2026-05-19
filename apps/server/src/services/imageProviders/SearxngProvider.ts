import { ImageSearchOptions, ImageSearchProvider, ProviderSearchResult } from './types';

interface SearxngImageResult {
    url?: string;
    img_src?: string;
    thumbnail_src?: string;
    engine?: string;
    width?: number;
    height?: number;
}

interface SearxngResponse {
    results?: SearxngImageResult[];
    unresponsive_engines?: unknown[];
}

interface SearxngSearchVariant {
    label: string;
    language?: string;
    engines?: string;
}

/**
 * Image search backed by a self-hosted SearXNG instance.
 *
 * SearXNG aggregates Google / Bing / DDG / Yandex / Qwant internally with
 * proper anti-bot handling and exposes a clean JSON API — which replaces the
 * old puppeteer-based scrapers that Google and Bing kept blocking.
 *
 * The container is expected to live at SEARXNG_URL. Locally that resolves to
 * http://localhost:8888 (mapped from docker-compose); inside the docker
 * network the default `http://searxng:8080` works.
 */
export class SearxngProvider implements ImageSearchProvider {
    public readonly name = 'searxng';
    private readonly baseUrl: string;
    private readonly publicBaseUrl: string;
    private readonly timeoutMs: number;

    constructor(opts?: { baseUrl?: string; publicBaseUrl?: string; timeoutMs?: number }) {
        const fromEnv = process.env.SEARXNG_URL?.trim();
        const publicFromEnv = process.env.SEARXNG_PUBLIC_URL?.trim();
        this.baseUrl = (opts?.baseUrl || fromEnv || 'http://localhost:8888').replace(/\/+$/, '');
        this.publicBaseUrl = (opts?.publicBaseUrl || publicFromEnv || this.baseUrl).replace(/\/+$/, '');
        this.timeoutMs = opts?.timeoutMs ?? 15000;
    }

    async search(query: string, options: ImageSearchOptions = {}): Promise<ProviderSearchResult> {
        const primary = await this.searchVariant(query, options, {
            label: 'default',
            language: 'es-AR'
        });

        // SearXNG sometimes falls back to Bing-only results when Google Images
        // is rate-limited or unhappy with the locale. Those Bing-only batches
        // are the source of the recurring unrelated anime/wallpaper/China
        // candidates. Before accepting that degraded response, retry a broader
        // search using only the engines that have produced usable editorial
        // images for Hermes.
        if (primary.results.length >= 10 && this.hasPreferredEngine(primary.engineByUrl)) {
            return primary;
        }

        const preferredBroad = await this.searchVariant(query, options, {
            label: 'preferred-broad',
            language: 'all',
            engines: 'google images,duckduckgo images'
        });

        if (preferredBroad.results.length > 0) {
            console.warn(`[SearxngProvider] "${query}" used preferred-broad retry (${primary.results.length} default -> ${preferredBroad.results.length} preferred results).`);
            return preferredBroad;
        }

        return primary;
    }

    private async searchVariant(query: string, options: ImageSearchOptions, variant: SearxngSearchVariant): Promise<ProviderSearchResult> {
        const params = new URLSearchParams({
            q: query,
            format: 'json',
            categories: 'images',
            // Argentina geo + Spanish locale: matches what we used to pass to
            // Google/Bing directly. SafeSearch is enforced via settings.yml.
            safesearch: '2'
        });
        if (variant.language) params.set('language', variant.language);
        if (variant.engines) params.set('engines', variant.engines);

        const apiUrl = `${this.baseUrl}/search?${params.toString()}`;
        // Public-facing URL the editor can open from the trace panel.
        const browserParams = new URLSearchParams(params);
        browserParams.delete('format');
        const browserUrl = `${this.publicBaseUrl}/search?${browserParams.toString()}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const response = await fetch(apiUrl, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Hermes/1.0 (+image-search)'
                }
            });

            if (!response.ok) {
                console.warn(`[SearxngProvider] HTTP ${response.status} for "${query}"`);
                return { url: browserUrl, results: [], engineByUrl: {} };
            }

            const data = (await response.json()) as SearxngResponse;
            const items = data.results || [];
            if (data.unresponsive_engines && data.unresponsive_engines.length > 0) {
                console.warn(`[SearxngProvider] "${query}" ${variant.label} unresponsive engines: ${JSON.stringify(data.unresponsive_engines)}`);
            }

            const seen = new Set<string>();
            const results: string[] = [];
            const engineByUrl: Record<string, string> = {};

            for (const item of items) {
                const imageUrl = item.img_src || item.url;
                if (!imageUrl || !imageUrl.startsWith('http')) continue;
                if (options.minWidth && item.width && item.width < options.minWidth) continue;
                if (options.minHeight && item.height && item.height < options.minHeight) continue;
                if (seen.has(imageUrl)) continue;
                seen.add(imageUrl);

                results.push(imageUrl);
                const engine = this.normalizeEngineName(item.engine);
                engineByUrl[imageUrl] = `searxng-${engine}`;
            }

            console.log(`[SearxngProvider] "${query}" ${variant.label} -> ${results.length} results`);
            return { url: browserUrl, results, engineByUrl };
        } catch (error: any) {
            const msg = error?.name === 'AbortError' ? `timeout after ${this.timeoutMs}ms` : (error?.message || String(error));
            console.error(`[SearxngProvider] search failed for "${query}" ${variant.label}: ${msg}`);
            return { url: browserUrl, results: [], engineByUrl: {} };
        } finally {
            clearTimeout(timer);
        }
    }

    private hasPreferredEngine(engineByUrl: Record<string, string>): boolean {
        return Object.values(engineByUrl).some(engine =>
            engine === 'searxng-google'
            || engine === 'searxng-duckduckgo'
            || engine === 'searxng-google images'
            || engine === 'searxng-duckduckgo images'
        );
    }

    private normalizeEngineName(engine?: string): string {
        return (engine || 'unknown')
            .toLowerCase()
            .replace(/\s+images?$/i, '')
            .replace(/\s+/g, '-');
    }
}
