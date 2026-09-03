import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Article } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConfigService } from './ConfigService';
import fs from 'fs';
import path from 'path';
import os from 'os';

puppeteer.use(StealthPlugin());

export interface VorknewsSection {
    id: string;
    name: string;
}

export const VORKNEWS_SECTIONS: VorknewsSection[] = [
    { id: "17", name: "Municipios > Avellaneda" },
    { id: "18", name: "Municipios > Lanús" },
    { id: "19", name: "Municipios > Lomas de Zamora" },
    { id: "20", name: "Municipios > Almirante Brown" },
    { id: "22", name: "Municipios > Echeverría" },
    { id: "82", name: "Municipios > Ezeiza" },
    { id: "23", name: "Municipios > San Vicente" },
    { id: "21", name: "Municipios > Presidente Perón" },
    { id: "3",  name: "Provincia" },
    { id: "4",  name: "Gremiales" },
    { id: "63", name: "Actualidad > Nación" },
    { id: "64", name: "Actualidad > Provincia" },
    { id: "65", name: "Actualidad > Mundo" },
    { id: "71", name: "Sociedad" },
    { id: "7",  name: "Policiales" },
    { id: "69", name: "Cultura y Espectáculos" },
    { id: "8",  name: "Opinión" },
    { id: "9",  name: "Pirincho" },
    { id: "12", name: "Deportes > Club Lanús" },
    { id: "13", name: "Deportes > Banfield" },
    { id: "14", name: "Deportes > Temperley" },
    { id: "15", name: "Deportes > Los Andes" },
    { id: "74", name: "Deportes > Brown de Adrogué" },
    { id: "76", name: "Deportes > Claypole" },
    { id: "77", name: "Deportes > Argentino de Quilmes" },
    { id: "78", name: "Deportes > Dock Sud" },
    { id: "79", name: "Deportes > Quilmes" },
    { id: "29", name: "Deportes > Otros" }
];

export interface VorknewsPublishOptions {
    mode?: 'DRAFT' | 'PUBLISHED';
    sectionId?: string;
    author?: string;
    volanta?: string;
    bajada?: string;
    tags?: string;
    title?: string;
    contentHtml?: string;
}

export interface VorknewsPublishResult {
    success: boolean;
    vorknewsId?: string;
    mode: 'DRAFT' | 'PUBLISHED';
    url?: string;
    error?: string;
}

export class VorknewsPublishService {
    private configService: ConfigService;
    private baseUrl = 'https://politicadelsur.com/vadmin/';

    constructor() {
        this.configService = new ConfigService();
    }

    public getSections(): VorknewsSection[] {
        return VORKNEWS_SECTIONS;
    }

    public resolveSectionId(sectionName?: string | null, location?: string | null): string {
        const query = `${sectionName || ''} ${location || ''}`.toLowerCase();

        if (query.includes('lanus') || query.includes('lanús')) return '18';
        if (query.includes('avellaneda')) return '17';
        if (query.includes('lomas')) return '19';
        if (query.includes('almirante brown') || query.includes('adrogue') || query.includes('adrogué') || query.includes('burzaco')) return '20';
        if (query.includes('echeverria') || query.includes('echeverría') || query.includes('monte grande')) return '22';
        if (query.includes('ezeiza')) return '82';
        if (query.includes('san vicente') || query.includes('alejandro korn')) return '23';
        if (query.includes('peron') || query.includes('perón') || query.includes('guernica')) return '21';
        if (query.includes('gremial') || query.includes('sindical') || query.includes('paritaria')) return '4';
        if (query.includes('policial') || query.includes('seguridad') || query.includes('crimen') || query.includes('deten')) return '7';
        if (query.includes('sociedad')) return '71';
        if (query.includes('cultura') || query.includes('espectaculo')) return '69';
        if (query.includes('provincia') || query.includes('bonaerense') || query.includes('kicillof')) return '3';
        if (query.includes('nacion') || query.includes('nación') || query.includes('milei') || query.includes('gobierno')) return '63';

        return '64'; // Fallback: Actualidad > Provincia
    }

    public async publishArticle(
        article: Article,
        options: VorknewsPublishOptions = {}
    ): Promise<VorknewsPublishResult> {
        const username = process.env.VORKS_USER;
        const password = process.env.VORKS_PASSWORD;

        if (!username || !password) {
            throw new Error('VORKS_USER and VORKS_PASSWORD environment variables are required.');
        }

        const configuredMode = await this.configService.getVorknewsPublishMode();
        const mode = options.mode || configuredMode || 'DRAFT';
        const defaultAuthor = await this.configService.getVorknewsDefaultAuthor();
        const author = options.author || defaultAuthor || 'Juan Bautista Vega';

        const sectionId = options.sectionId
            || this.resolveSectionId(article.section, article.location)
            || await this.configService.getVorknewsDefaultSectionId();

        const title = (options.title || article.rewrittenTitle || article.originalTitle || '').trim();
        const rawContent = options.contentHtml || article.rewrittenContent || article.originalContent || '';
        const htmlContent = this.ensureHtmlFormatting(rawContent);

        const volanta = options.volanta || article.section || (article.location ? article.location.toUpperCase() : 'ACTUALIDAD');
        const bajada = options.bajada || this.extractBajada(rawContent);
        const tags = options.tags || this.buildTags(article);

        const imageUrl = article.featureImageUrl || article.originalImageUrl;
        let tempImagePath: string | null = null;

        if (imageUrl) {
            tempImagePath = await this.downloadImageToTemp(imageUrl);
        }

        console.log(`[VorknewsPublishService] Launching browser for article "${title}" (Mode: ${mode}, Section: ${sectionId})...`);

        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--window-size=1920,1080'
            ]
        });

        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });

            page.on('dialog', async dialog => {
                console.log('[VorknewsPublishService] Dialog intercepted:', dialog.type(), dialog.message());
                await dialog.accept().catch(() => {});
            });

            // Target form URL based on mode
            const formUrl = mode === 'DRAFT'
                ? 'https://politicadelsur.com/vadmin/?section=vorknews_noticias_borrador&sub=edit'
                : 'https://politicadelsur.com/vadmin/?section=vorknews_noticias&sub=edit';

            console.log(`[VorknewsPublishService] Navigating to: ${formUrl}`);
            await page.goto(formUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });

            // Handle login if redirected or form_login is present
            const loginForm = await page.$('#form_login');
            if (loginForm) {
                console.log('[VorknewsPublishService] Logging into Vorknews CMS...');
                await page.type('input[name="inputEmail"]', username, { delay: 10 });
                await page.type('input[name="inputPassword"]', password, { delay: 10 });
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }),
                    page.evaluate(() => {
                        const form = document.getElementById('form_login') as HTMLFormElement;
                        if (form) HTMLFormElement.prototype.submit.call(form);
                    })
                ]);
            }

            // Ensure we are on the edit page
            if (!page.url().includes('vorknews_noticias') || !page.url().includes('sub=edit')) {
                console.log(`[VorknewsPublishService] Navigating to edit page: ${formUrl}`);
                await page.goto(formUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
            }

            // Wait for core elements
            await page.waitForSelector('input[name="titulo"], select[name="id_seccion"]', { timeout: 15000 });

            console.log('[VorknewsPublishService] Filling form fields...');

            // 1. Select Section
            await page.select('select[name="id_seccion"]', sectionId).catch(err => {
                console.warn(`[VorknewsPublishService] Warning selecting section ${sectionId}:`, err.message);
            });

            // 2. Title
            await page.evaluate((val) => {
                const el = document.querySelector('input[name="titulo"]') as HTMLInputElement;
                if (el) {
                    el.value = val;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, title);

            // 3. Volanta
            if (volanta) {
                await page.evaluate((val) => {
                    const el = document.querySelector('input[name="volanta"]') as HTMLInputElement;
                    if (el) {
                        el.value = val;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, volanta);
            }

            // 4. Bajada
            if (bajada) {
                await page.evaluate((val) => {
                    const el = document.querySelector('textarea[name="bajada"]') as HTMLTextAreaElement;
                    if (el) {
                        el.value = val;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, bajada);
            }

            // 5. Tags
            if (tags) {
                await page.evaluate((val) => {
                    const el = document.querySelector('input[name="tags"]') as HTMLInputElement;
                    if (el) {
                        el.value = val;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, tags);
            }

            // 6. Autor
            if (author) {
                await page.evaluate((val) => {
                    const el = document.querySelector('input[name="autor"]') as HTMLInputElement;
                    if (el) {
                        el.value = val;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, author);
            }

            // 7. CKEditor Body ("Fuente HTML")
            console.log('[VorknewsPublishService] Setting HTML content in CKEditor via Fuente HTML...');
            await page.evaluate((html) => {
                // Set CKEditor instance data and sync underlying element
                if ((window as any).CKEDITOR && (window as any).CKEDITOR.instances['texto']) {
                    const editor = (window as any).CKEDITOR.instances['texto'];
                    editor.setData(html);
                    try { editor.updateElement(); } catch {}
                }

                // Populate underlying textarea and ensure it doesn't fail HTML5 validation
                const textarea = document.getElementById('texto') as HTMLTextAreaElement;
                if (textarea) {
                    textarea.value = html;
                    textarea.removeAttribute('required');
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, htmlContent);

            // Also click the "Fuente HTML" button to ensure CKEditor toggles into source mode and syncs
            try {
                const sourceBtn = await page.$('.cke_button__source, a[title="Fuente HTML"]');
                if (sourceBtn) {
                    await sourceBtn.click();
                    await new Promise(r => setTimeout(r, 200));

                    // Set value in cke_source textarea if visible
                    await page.evaluate((html) => {
                        const srcTextarea = document.querySelector('textarea.cke_source') as HTMLTextAreaElement;
                        if (srcTextarea) {
                            srcTextarea.value = html;
                            srcTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                            srcTextarea.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }, htmlContent);

                    // Toggle back to WYSIWYG
                    await sourceBtn.click();
                    await new Promise(r => setTimeout(r, 200));
                }
            } catch (err: any) {
                console.warn('[VorknewsPublishService] Note on source button click:', err.message);
            }

            // 8. Image Upload
            if (tempImagePath && fs.existsSync(tempImagePath)) {
                console.log(`[VorknewsPublishService] Uploading image from ${tempImagePath}...`);
                const fileInput = await page.$('#fileuploader_noticias input[type="file"]');
                if (fileInput) {
                    await fileInput.uploadFile(tempImagePath);
                    console.log('[VorknewsPublishService] Waiting for image upload completion...');

                    // Wait until #galeria_noticias contains thumbnail and submit button is enabled
                    await page.waitForFunction(() => {
                        const thumbnails = document.querySelectorAll('#galeria_noticias .thumbnail, #test-list_galeria_noticias .thumbnail');
                        const submitBtn = document.getElementById('submit') as HTMLButtonElement;
                        return thumbnails.length > 0 && (!submitBtn || !submitBtn.disabled);
                    }, { timeout: 20000 }).catch(e => {
                        console.warn('[VorknewsPublishService] Image upload wait warning:', e.message);
                    });
                } else {
                    console.warn('[VorknewsPublishService] File input not found inside #fileuploader_noticias.');
                }
            }

            // 9. Submit form natively and wait for navigation
            console.log(`[VorknewsPublishService] Submitting form (Mode: ${mode})...`);
            const currentUrl = page.url();

            await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(e => {
                    console.log('[VorknewsPublishService] Navigation wait notice:', e.message);
                }),
                page.evaluate(() => {
                    const submitBtn = document.getElementById('submit') as HTMLButtonElement;
                    const form = (submitBtn ? submitBtn.closest('form') : null)
                        || (document.querySelector('form[name="formulario"]') as HTMLFormElement)
                        || (document.querySelector('form[method="post"]') as HTMLFormElement);

                    if (form) {
                        HTMLFormElement.prototype.submit.call(form);
                    } else if (submitBtn) {
                        submitBtn.click();
                    }
                })
            ]);

            const finalUrl = page.url();
            console.log(`[VorknewsPublishService] Post-submit URL: ${finalUrl}`);

            // Extract Vorknews ID from URL or from first row in the redirected list
            let vorknewsId: string | undefined;
            const idMatch = finalUrl.match(/[?&]id=(\d+)/) || currentUrl.match(/[?&]id=(\d+)/);
            if (idMatch) {
                vorknewsId = idMatch[1];
            } else {
                vorknewsId = await page.evaluate(() => {
                    const firstLink = document.querySelector('table tbody tr a[href*="id="]') as HTMLAnchorElement;
                    if (firstLink) {
                        const m = firstLink.href.match(/[?&]id=(\d+)/);
                        return m ? m[1] : undefined;
                    }
                    return undefined;
                }).catch(() => undefined);
            }

            return {
                success: true,
                mode,
                vorknewsId,
                url: finalUrl
            };

        } catch (error: any) {
            console.error('[VorknewsPublishService] Error during publish:', error);
            return {
                success: false,
                mode,
                error: error.message || String(error)
            };
        } finally {
            if (tempImagePath && fs.existsSync(tempImagePath)) {
                try {
                    fs.unlinkSync(tempImagePath);
                } catch {}
            }
            await browser.close();
        }
    }

    private ensureHtmlFormatting(content: string): string {
        if (!content) return '';
        const trimmed = content.trim();
        // If content already contains HTML tags (<p>, <h2>, etc.), return as is
        if (/<(p|h2|h3|div|strong|blockquote)[^>]*>/i.test(trimmed)) {
            return trimmed;
        }

        // Otherwise convert double line breaks into <p>...</p>
        return trimmed
            .split(/\n\s*\n/)
            .map(para => para.trim())
            .filter(Boolean)
            .map(para => `<p>${para}</p>`)
            .join('\n');
    }

    private extractBajada(content: string): string {
        const clean = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (clean.length <= 250) return clean;
        const firstSentence = clean.split(/[.!?]\s+/)[0];
        if (firstSentence && firstSentence.length >= 40 && firstSentence.length <= 250) {
            return firstSentence + '.';
        }
        return clean.substring(0, 220).trim() + '...';
    }

    private buildTags(article: Article): string {
        const tags: string[] = [];
        if (article.section) tags.push(article.section);
        if (article.location) tags.push(article.location);
        tags.push('Política del Sur', 'Buenos Aires');
        return tags.join(', ');
    }

    private async downloadImageToTemp(imageUrl: string): Promise<string | null> {
        try {
            const internalMatch = imageUrl.match(/^\/api\/images\/([^\/\?]+)/);
            let buffer: Buffer | null = null;
            let ext = '.jpg';

            if (internalMatch) {
                const img = await prisma.generatedImage.findUnique({ where: { id: internalMatch[1] } });
                if (img) {
                    buffer = Buffer.from(img.data);
                    ext = img.mimeType === 'image/png' ? '.png' : '.jpg';
                }
            } else {
                const response = await fetch(imageUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                        'Referer': new URL(imageUrl).origin
                    }
                });

                if (response.ok) {
                    const ct = response.headers.get('content-type') || '';
                    ext = ct.includes('png') ? '.png' : ct.includes('webp') ? '.webp' : '.jpg';
                    const arrayBuffer = await response.arrayBuffer();
                    buffer = Buffer.from(arrayBuffer);
                }
            }

            if (!buffer || buffer.length === 0) return null;

            const tempFilename = `vorks_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
            const tempPath = path.join(os.tmpdir(), tempFilename);
            fs.writeFileSync(tempPath, buffer);
            return tempPath;
        } catch (err) {
            console.error(`[VorknewsPublishService] Failed to download image ${imageUrl}:`, err);
            return null;
        }
    }
}
