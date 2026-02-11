import OpenAI from 'openai';

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

            // Google Images URL
            // tbm=isch means Google Images
            // gl=ar for Argentina context
            const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&gl=ar`;

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

            console.log('[ImageService] Page loaded, scrolling...');

            // Scroll to trigger lazy loading
            await page.evaluate(async () => {
                await new Promise<void>((resolve) => {
                    let totalHeight = 0;
                    const distance = 100;
                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;
                        if (totalHeight >= scrollHeight || totalHeight > 2000) { // Limit scroll
                            clearInterval(timer);
                            resolve();
                        }
                    }, 100);
                });
            });

            // Wait a bit for images to populate
            await new Promise(r => setTimeout(r, 2000));

            const images = await page.evaluate(() => {
                const results: string[] = [];
                const imgs = document.querySelectorAll('img');
                console.log(`Found ${imgs.length} total img tags`);

                imgs.forEach((img: any) => {
                    const src = img.src || img.getAttribute('data-src');
                    // Relaxed filter: Allow base64 for thumbnails if needed, but prefer http
                    // Google thumbnails are often base64 or weird encrypted blobs
                    if (src && (src.startsWith('http') || src.startsWith('data:image'))) {
                        // Re-enabled size filter
                        if (img.width > 50 && img.height > 50) {
                            if (!src.includes('favicon') && !src.includes('google.com/images')) {
                                results.push(src);
                            }
                        }
                    }
                });

                // Return unique top 10
                return [...new Set(results)].slice(0, 10);
            });

            console.log(`[ImageService] Found ${images.length} images.`);
            return images;

        } catch (error) {
            console.error('[ImageService] Search failed:', error);
            return [];
        } finally {
            if (browser) await browser.close();
        }
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
