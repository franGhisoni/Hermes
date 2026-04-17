import OpenAI from 'openai';

// Patterns in URLs that indicate non-content images (icons, UI elements, ads)
const BLOCKED_URL_PATTERNS = [
    'logo', 'favicon', 'banner', 'icon', 'avatar', 'sprite',
    'widget', 'badge', 'button', 'arrow', 'nav-', 'menu-',
    'ad-', 'ads/', 'pixel', 'tracker', 'beacon',
    'google.com/images', 'gstatic.com/images/branding',
    // Noticias Argentinas always watermarks with blue "NA" bar
    'noticiasargentinas.com', 'noticias-argentinas.com.ar',
    // Stock photo sites — preview images always have visible watermarks
    'dreamstime.com', 'shutterstock.com', 'gettyimages.com', 'istockphoto.com',
    'alamy.com', '123rf.com', 'depositphotos.com', 'stock.adobe.com'
];

export class ImageService {
    private openai: OpenAI;

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    async findOrGenerateImage(title: string): Promise<string[]> {
        console.log(`[ImageService] Finding image for: "${title}"`);

        const candidates: string[] = [];

        // 1. Try to search
        const foundImages = await this.searchImages(title);
        if (foundImages.length > 0) {
            console.log(`[ImageService] Found ${foundImages.length} images via search.`);
            candidates.push(...foundImages);
        }

        // 2. Always Generate one as fallback/option
        console.log(`[ImageService] Generating via DALL-E...`);
        const generated = await this.generateImage(title);
        if (generated) {
            candidates.push(generated);
        }

        return candidates;
    }

    public async searchImages(query: string): Promise<string[]> {
        console.log(`[ImageService] Searching images for: "${query}"`);
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

            // Set viewport to ensure images render
            await page.setViewport({ width: 1280, height: 800 });

            // Bing Images URL — enriched query biases toward news photojournalism,
            // filter params request large landscape images typical of editorial use
            const enrichedQuery = `${query} fotografía noticia`;
            const qft = '%2Bfilterui%3Aimagesize-large%2Bfilterui%3Aaspect-wide';
            const url = `https://www.bing.com/images/search?q=${encodeURIComponent(enrichedQuery)}&qft=${qft}`;

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

            console.log('[ImageService] Page loaded, extracting Bing images...');

            const images = await page.evaluate(() => {
                const results: string[] = [];
                const anchors = document.querySelectorAll('a.iusc');

                anchors.forEach((a: any) => {
                    try {
                        const m = a.getAttribute('m');
                        if (m) {
                            const parsed = JSON.parse(m);
                            if (parsed.murl && parsed.murl.startsWith('http')) {
                                results.push(parsed.murl);
                            }
                        }
                    } catch (e) {
                        // ignore parse errors
                    }
                });

                // Return unique results
                return [...new Set(results)];
            });

            // Apply URL pattern filtering (logos, favicons, UI elements, etc.)
            const filtered = images.filter((imgUrl: string) => {
                const lower = imgUrl.toLowerCase();
                return !BLOCKED_URL_PATTERNS.some(pattern => lower.includes(pattern));
            });

            // Validate URLs are actually reachable images (limit to top 6)
            const toValidate = filtered.slice(0, 8); // validate a few extra in case some fail
            const validated = await this.validateImageUrls(toValidate);

            const finalResults = validated.slice(0, 6);
            console.log(`[ImageService] Found ${images.length} raw → ${filtered.length} filtered → ${finalResults.length} validated.`);
            return finalResults;

        } catch (error) {
            console.error('[ImageService] Search failed:', error);
            return [];
        } finally {
            if (browser) await browser.close();
        }
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
                model: "dall-e-3",
                prompt: `A professional news editorial illustration for an article titled: "${prompt}". Style: Photorealistic or detailed editorial illustration, neutral, high quality.`,
                n: 1,
                size: "1024x1024",
            });

            return response.data?.[0]?.url || null;
        } catch (error) {
            console.error('[ImageService] Generation failed:', error);
            return null;
        }
    }
}
