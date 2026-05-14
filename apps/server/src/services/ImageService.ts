import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from './ConfigService';

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

// Patterns in URLs that indicate non-content images (icons, UI elements, ads)
const BLOCKED_URL_PATTERNS = [
    'logo', 'favicon', 'banner', 'icon', 'avatar', 'sprite',
    'widget', 'badge', 'button', 'arrow', 'nav-', 'menu-',
    'ad-', 'ads/', 'pixel', 'tracker', 'beacon',
    'google.com/images', 'gstatic.com/images/branding',
    // Noticias Argentinas always watermarks with blue "NA" bar
    'noticiasargentinas.com', 'noticias-argentinas.com.ar',
    // Stock photo sites: preview images almost always have visible watermarks
    'dreamstime.com', 'shutterstock.com', 'gettyimages.com', 'istockphoto.com',
    'alamy.com', '123rf.com', 'depositphotos.com', 'stock.adobe.com'
];

export class ImageService {
    private openai: OpenAI;
    private configService: ConfigService;

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
        this.configService = new ConfigService();
    }

    public async searchImages(input: string | ImageSearchInput): Promise<string[]> {
        const searchInput = typeof input === 'string' ? { title: input } : input;
        const fallbackQueries = this.buildSearchQueries(searchInput);
        const smart = (searchInput.smartQueries || []).map(q => q.trim()).filter(Boolean);
        // Smart queries first so any garbage padding from Bing on the regex
        // queries doesn't starve the better, LLM-curated ones (the per-query
        // cap in the loop below ensures every query contributes).
        const queries = this.uniqueStrings([...smart, ...fallbackQueries]).slice(0, 8);
        console.log(`[ImageService] Searching images with queries: ${queries.map(q => `"${q}"`).join(' | ')}`);

        let browser;
        try {
            const puppeteer = require('puppeteer');
            browser = await puppeteer.launch({
                headless: "new",
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--window-size=1280,800'
                ]
            });
            const page = await browser.newPage();

            await page.setViewport({ width: 1280, height: 800 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

            const queryTemplate = await this.configService.getImageSearchQueryTemplate();
            const urlTemplate = await this.configService.getImageSearchUrlTemplate();

            // Take a small slice from each query so every query — including the
            // late title-based fallbacks — contributes to the pool. Diversity
            // over volume; the AI scorer will rank them all.
            const PER_QUERY_CAP = 3;
            const images: string[] = [];
            for (const query of queries) {
                const results = await this.fetchBingResults(page, query, queryTemplate, urlTemplate);
                for (const imageUrl of results.slice(0, PER_QUERY_CAP)) {
                    if (!images.includes(imageUrl)) {
                        images.push(imageUrl);
                    }
                }
            }

            const filtered = images.filter((imgUrl: string) => {
                const lower = imgUrl.toLowerCase();
                return !BLOCKED_URL_PATTERNS.some(pattern => lower.includes(pattern));
            });

            // Validate every filtered candidate and return all that pass — the
            // scorer is the one that decides which to keep.
            const validated = await this.validateImageUrls(filtered);

            const finalResults = validated;
            console.log(`[ImageService] Found ${images.length} raw -> ${filtered.length} filtered -> ${finalResults.length} validated.`);
            return finalResults;

        } catch (error) {
            console.error('[ImageService] Search failed:', error);
            return [];
        } finally {
            if (browser) await browser.close();
        }
    }

    private async fetchBingResults(
        page: any,
        query: string,
        queryTemplate: string,
        urlTemplate: string
    ): Promise<string[]> {
        const enrichedQuery = (queryTemplate || '{{query}}').replace(/\{\{query\}\}/g, query).trim();
        const url = (urlTemplate || 'https://www.bing.com/images/search?q={{q}}')
            .replace(/\{\{q\}\}/g, encodeURIComponent(enrichedQuery))
            .replace(/\{\{query\}\}/g, encodeURIComponent(enrichedQuery));

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForSelector('a.iusc', { timeout: 8000 }).catch(() => null);
        console.log(`[ImageService] Image search loaded: "${enrichedQuery}"`);

        return page.evaluate(() => {
            const results: string[] = [];
            const anchors = document.querySelectorAll('a.iusc');

            anchors.forEach((a: any) => {
                try {
                    const m = a.getAttribute('m');
                    if (!m) return;

                    const parsed = JSON.parse(m);
                    const imageUrl = parsed.murl;
                    const width = Number(parsed.w || 0);
                    const height = Number(parsed.h || 0);

                    if (!imageUrl || !imageUrl.startsWith('http')) return;
                    if (width > 0 && width < 400) return;
                    if (height > 0 && height < 300) return;

                    results.push(imageUrl);
                } catch {
                    // ignore parse errors
                }
            });

            return [...new Set(results)];
        });
    }

    private buildSearchQueries(input: ImageSearchInput): string[] {
        const title = this.normalizeText(input.title);
        const rewrittenTitle = this.normalizeText(input.rewrittenTitle || '');
        const content = this.normalizeText((input.content || '').slice(0, 900));
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
        const leadQuery = this.buildLeadQuery(content);
        if (leadQuery) {
            queries.push(leadQuery);
        }

        return this.uniqueStrings(queries)
            .filter(query => query.length >= 4)
            .slice(0, 6);
    }

    private buildLeadQuery(content: string): string {
        if (!content) return '';

        const firstSentenceMatch = content.match(/^[^.!?\n]{20,300}[.!?\n]/);
        const lead = firstSentenceMatch ? firstSentenceMatch[0] : content.substring(0, 220);

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

        return words.slice(0, 8).join(' ');
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
        const results = await Promise.allSettled(
            urls.map(async (url) => {
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 3000);

                    const response = await fetch(url, {
                        method: 'HEAD',
                        signal: controller.signal,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                    clearTimeout(timeout);

                    if (!response.ok) return null;

                    const contentType = response.headers.get('content-type') || '';
                    if (!contentType.startsWith('image/')) return null;

                    return url;
                } catch {
                    return null;
                }
            })
        );

        return results
            .map(r => r.status === 'fulfilled' ? r.value : null)
            .filter((url): url is string => url !== null);
    }

    public async generateImage(prompt: string): Promise<string | null> {
        try {
            const response = await this.openai.images.generate({
                model: "gpt-image-2",
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
