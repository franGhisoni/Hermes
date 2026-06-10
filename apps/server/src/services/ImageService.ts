import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from './ConfigService';
import { ImageSearchProvider } from './imageProviders/types';
import { SearxngProvider } from './imageProviders/SearxngProvider';

const prisma = new PrismaClient();

interface ImageSearchInput {
    title: string;
    content?: string;
    rewrittenTitle?: string;
    // Optional queries produced by an upstream LLM pass that has more context
    // than our regex extractors (and may have seen the reference image). These
    // run BEFORE the regex fallbacks so the best queries land first.
    smartQueries?: string[];
}

export interface SearchExecution {
    query: string;
    // URL of the search page the provider hit (for the admin trace). The
    // engine breakdown lives in the per-URL sourceEngine on each candidate.
    providerUrl: string;
    resultCount: number;
}

export interface SearchTrace {
    executions: SearchExecution[];
    // url -> underlying engine that first surfaced it (e.g. 'searxng-google',
    // 'searxng-bing'). Used by the admin trace panel.
    sourceByUrl: Record<string, string>;
}

export interface SearchResult {
    images: string[];
    trace: SearchTrace;
}

// Tokens in URLs that indicate non-content images (icons, UI elements, ads).
// Matched as whole words within the URL (split on non-alphanumeric chars), NOT
// as substrings — a plain `includes('logo')` used to false-positive on Spanish
// slugs like "urologo", "dialogo" or "psicologo", and `'ad-'` killed every
// "ciudad-"/"sociedad-" slug.
const BLOCKED_URL_TOKENS = [
    'logo', 'logos', 'favicon', 'banner', 'banners', 'icon', 'icons', 'avatar',
    'sprite', 'widget', 'badge', 'button', 'arrow', 'nav', 'menu',
    'ad', 'ads', 'pixel', 'tracker', 'beacon'
];

// Substring patterns that are unambiguous on their own (domains, paths).
const BLOCKED_URL_PATTERNS = [
    'google.com/images', 'gstatic.com/images/branding',
    // Noticias Argentinas always watermarks with blue "NA" bar
    'noticiasargentinas.com', 'noticias-argentinas.com.ar',
    // Stock photo sites: preview images almost always have visible watermarks
    'dreamstime.com', 'shutterstock.com', 'gettyimages.com', 'istockphoto.com',
    'alamy.com', '123rf.com', 'depositphotos.com', 'stock.adobe.com'
];

function isBlockedImageUrl(url: string): boolean {
    const lower = url.toLowerCase();
    if (BLOCKED_URL_PATTERNS.some(pattern => lower.includes(pattern))) return true;
    // Tokenize path + query on every non-alphanumeric character so "logo.png",
    // "/icons/", "ad-banner" match but "urologo.jpg" and "ciudad-de-bsas" don't.
    const tokens = lower.split(/[^a-z0-9]+/);
    return tokens.some(token => BLOCKED_URL_TOKENS.includes(token));
}

export class ImageService {
    private openai: OpenAI;
    private configService: ConfigService;
    private provider: ImageSearchProvider;

    constructor(opts?: { provider?: ImageSearchProvider }) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY env var is required');
        }
        this.openai = new OpenAI({ apiKey });
        this.configService = new ConfigService();
        this.provider = opts?.provider ?? new SearxngProvider();
    }

    public async searchImages(input: string | ImageSearchInput): Promise<SearchResult> {
        const searchInput = typeof input === 'string' ? { title: input } : input;
        const fallbackQueries = await this.buildSearchQueries(searchInput);
        const smart = (searchInput.smartQueries || []).map(q => q.trim()).filter(Boolean);
        // Cap the total queries at imageQueryMaxCount + smart ones (smart take priority).
        const queryCap = (await this.configService.getImageQueryMaxCount()) + smart.length;
        const queries = this.uniqueStrings([...smart, ...fallbackQueries]).slice(0, queryCap);
        console.log(`[ImageService] Searching images via ${this.provider.name} with queries: ${queries.map(q => `"${q}"`).join(' | ')}`);

        try {
            const perQueryCap = await this.configService.getImagePerQueryCap();
            const minWidth = await this.configService.getImageMinWidth();
            const minHeight = await this.configService.getImageMinHeight();
            const images: string[] = [];
            const executions: SearchExecution[] = [];
            const sourceByUrl: Record<string, string> = {};

            // Run all queries concurrently — the sequential version could take
            // queries × (2 variants × 15s) and blow past reverse-proxy timeouts
            // on the manual /search-images endpoint. Results are still merged
            // in the original query order, so ranking stays deterministic.
            const settled = await Promise.allSettled(
                queries.map(query => this.provider.search(query, { minWidth, minHeight }))
            );

            settled.forEach((outcome, i) => {
                const query = queries[i];
                if (outcome.status === 'rejected') {
                    console.error(`[ImageService] Query "${query}" failed:`, outcome.reason);
                    executions.push({ query, providerUrl: '', resultCount: 0 });
                    return;
                }
                const data = outcome.value;
                executions.push({
                    query,
                    providerUrl: data.url,
                    resultCount: data.results.length
                });

                // Take top N from this query and dedupe across queries.
                for (const imageUrl of data.results.slice(0, perQueryCap)) {
                    if (!images.includes(imageUrl)) {
                        images.push(imageUrl);
                        sourceByUrl[imageUrl] = data.engineByUrl[imageUrl] || this.provider.name;
                    }
                }
            });

            const filtered = images.filter((imgUrl: string) => !isBlockedImageUrl(imgUrl));

            // Validate every filtered candidate; the AI scorer ranks the rest.
            const validated = await this.validateImageUrls(filtered);
            console.log(`[ImageService] Found ${images.length} raw -> ${filtered.length} filtered -> ${validated.length} validated.`);
            return { images: validated, trace: { executions, sourceByUrl } };
        } catch (error) {
            console.error('[ImageService] Search failed:', error);
            return { images: [], trace: { executions: [], sourceByUrl: {} } };
        }
    }

    private async buildSearchQueries(input: ImageSearchInput): Promise<string[]> {
        const contentChars = await this.configService.getImageQueryContentChars();
        const minLength = await this.configService.getImageQueryMinLength();
        const maxCount = await this.configService.getImageQueryMaxCount();

        const title = this.normalizeText(input.title);
        const rewrittenTitle = this.normalizeText(input.rewrittenTitle || '');
        const content = this.normalizeText((input.content || '').slice(0, contentChars));
        const cleanedTitle = this.cleanTitleForSearch(title);
        const cleanedRewrittenTitle = this.cleanTitleForSearch(rewrittenTitle);

        const people = this.extractPeople(`${title}. ${content}`);
        const acronyms = this.extractAcronyms(`${title}. ${content}`);
        const phrases = this.extractCapitalizedPhrases(`${title}. ${content}`);

        const queries: string[] = [];

        if (people[0] && acronyms[0]) {
            queries.push(`${people[0]} ${acronyms[0]}`);
        }

        const focusedTerms = this.uniqueStrings([
            people[0],
            acronyms[0],
            phrases.find(term => term !== people[0] && !acronyms.includes(term)),
            phrases.find(term => term !== people[0] && term !== phrases[0] && !acronyms.includes(term))
        ]);

        if (focusedTerms.length >= 2) {
            queries.push(focusedTerms.slice(0, 3).join(' '));
        }

        if (cleanedTitle) {
            queries.push(cleanedTitle);
        }

        if (cleanedRewrittenTitle && cleanedRewrittenTitle !== cleanedTitle) {
            queries.push(cleanedRewrittenTitle);
        }

        // Fallback queries: raw titles, mimicking what an editor would paste manually
        // into a search engine. Useful when the smart extractors miss the point.
        if (title) {
            queries.push(title);
        }

        if (rewrittenTitle && rewrittenTitle !== title) {
            queries.push(rewrittenTitle);
        }

        // Lead-based query: first sentence of body, often introduces the actual
        // protagonist when the title is metaphorical or trait-driven.
        const leadQuery = await this.buildLeadQuery(content);
        if (leadQuery) {
            queries.push(leadQuery);
        }

        return this.uniqueStrings(queries)
            .filter(query => query.length >= minLength)
            .slice(0, maxCount);
    }

    private async buildLeadQuery(content: string): Promise<string> {
        if (!content) return '';

        const minChars = await this.configService.getImageLeadMinChars();
        const maxChars = await this.configService.getImageLeadMaxChars();
        const maxWords = await this.configService.getImageLeadMaxWords();

        const leadRegex = new RegExp(`^[^.!?\\n]{${minChars},${maxChars}}[.!?\\n]`);
        const firstSentenceMatch = content.match(leadRegex);
        const lead = firstSentenceMatch ? firstSentenceMatch[0] : content.substring(0, maxChars);

        const cleaned = lead
            .replace(/[^\w\sÁÉÍÓÚÜÑáéíóúüñ-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const stopwords = new Set([
            'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
            'de', 'del', 'al', 'a', 'en', 'con', 'por', 'para', 'sin', 'sobre',
            'que', 'qué', 'como', 'cómo', 'cuando', 'cuándo', 'donde', 'dónde',
            'es', 'son', 'fue', 'fueron', 'ser', 'estar', 'está', 'están',
            'y', 'o', 'u', 'pero', 'sino', 'aunque',
            'su', 'sus', 'mi', 'tu', 'lo', 'le', 'les', 'se',
            'este', 'esta', 'esto', 'ese', 'esa', 'eso'
        ]);

        const words = cleaned
            .split(' ')
            .filter(w => w.length > 2 && !stopwords.has(w.toLowerCase()));

        return words.slice(0, maxWords).join(' ');
    }

    private cleanTitleForSearch(title: string): string {
        if (!title) return '';

        let cleaned = title;
        if (cleaned.includes(':')) {
            cleaned = cleaned.split(':').slice(1).join(' ').trim();
        }

        cleaned = cleaned
            .replace(/["'“”‘’][^"'“”‘’]{2,80}["'“”‘’]/g, ' ')
            .replace(/\b(c[oó]mo|por qu[eé]|para qu[eé]|qu[eé]|cu[aá]l|cu[aá]les)\b/gi, ' ')
            .replace(/[^\w\sÁÉÍÓÚÜÑáéíóúüñ-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const words = cleaned.split(' ').filter(Boolean);
        return words.slice(0, 12).join(' ');
    }

    private extractPeople(text: string): string[] {
        const matches = text.match(/\b[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+){1,2}\b/g) || [];
        return this.uniqueStrings(matches).filter(term => {
            const lower = term.toLowerCase();
            return ![
                'estados unidos',
                'avocado toast room',
                'scientific reports',
                'fuente original',
                'borrador ia'
            ].includes(lower);
        });
    }

    private extractAcronyms(text: string): string[] {
        const matches = text.match(/\b[A-Z]{2,6}\b/g) || [];
        return this.uniqueStrings(matches).filter(term => !['IA'].includes(term));
    }

    private extractCapitalizedPhrases(text: string): string[] {
        const matches = text.match(/\b(?:[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+|[A-Z]{2,6})(?:\s+(?:[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+|[A-Z]{2,6})){0,2}\b/g) || [];
        return this.uniqueStrings(matches).filter(term => {
            const lower = term.toLowerCase();
            return lower.length > 3
                && !lower.startsWith('http')
                && !['fuente original', 'borrador ia'].includes(lower);
        });
    }

    private normalizeText(text: string): string {
        return text
            .replace(/\s+/g, ' ')
            .replace(/[\u0000-\u001F]/g, ' ')
            .trim();
    }

    private uniqueStrings(values: Array<string | undefined>): string[] {
        const seen = new Set<string>();
        const results: string[] = [];

        for (const value of values) {
            const normalized = (value || '').trim();
            if (!normalized) continue;

            const key = normalized.toLowerCase();
            if (seen.has(key)) continue;

            seen.add(key);
            results.push(normalized);
        }

        return results;
    }

    /**
     * Validate that image URLs are reachable and actually return image content.
     * Uses HEAD requests with a short timeout to avoid blocking the pipeline.
     */
    private async validateImageUrls(urls: string[]): Promise<string[]> {
        const fetchTimeoutMs = await this.configService.getImageFetchTimeoutMs();

        const probe = async (url: string, method: 'HEAD' | 'GET'): Promise<boolean> => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
            try {
                const response = await fetch(url, {
                    method,
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        // Ask for the first byte only so the GET fallback doesn't
                        // download whole images during validation.
                        ...(method === 'GET' ? { 'Range': 'bytes=0-0' } : {})
                    }
                });
                if (!response.ok) return false;
                const contentType = response.headers.get('content-type') || '';
                if (!contentType.startsWith('image/')) return false;
                if (method === 'GET') {
                    // Drain/cancel the body so the socket is released.
                    await response.body?.cancel().catch(() => undefined);
                }
                return true;
            } catch {
                return false;
            } finally {
                clearTimeout(timeout);
            }
        };

        const results = await Promise.allSettled(
            urls.map(async (url) => {
                // Many CDNs reject HEAD (405/403) but happily serve GET — retry
                // with a 1-byte ranged GET before discarding the candidate.
                if (await probe(url, 'HEAD')) return url;
                if (await probe(url, 'GET')) return url;
                return null;
            })
        );

        return results
            .map(r => r.status === 'fulfilled' ? r.value : null)
            .filter((url): url is string => url !== null);
    }

    public async generateImage(prompt: string): Promise<string | null> {
        try {
            const model = await this.configService.getImageGenerationModel();
            const response = await this.openai.images.generate({
                model,
                prompt: `Editorial news photograph for article: "${prompt}". Photorealistic, high quality, no text overlays, no watermarks, no logos.`,
                n: 1,
                size: "1024x1024",
                quality: "low",
            } as any);

            const b64 = response.data?.[0]?.b64_json;
            if (!b64) {
                console.error('[ImageService] Generation returned no b64 data');
                return null;
            }

            const record = await prisma.generatedImage.create({
                data: { data: Buffer.from(b64, 'base64') }
            });

            return `/api/images/${record.id}`;
        } catch (error) {
            console.error('[ImageService] Generation failed:', error);
            return null;
        }
    }
}
