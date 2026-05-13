import { Resend } from 'resend';
import { Article, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class MailService {
    private resend: Resend;
    private fromEmail: string;

    constructor() {
        // Usa tu API key de Resend. Si no existe, usamos una de prueba local que fallará amablemente.
        this.resend = new Resend(process.env.RESEND_API_KEY || 're_test_123');
        // Resend requiere enviar desde un dominio verificado o usar onboarding@resend.dev para testing
        this.fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    }

    public async sendArticleToTarget(targetEmail: string, article: Article, category?: string) {
        const title = article.rewrittenTitle || article.originalTitle;
        const content = article.rewrittenContent || article.originalContent;
        const imageUrl = article.featureImageUrl || article.originalImageUrl;

        // Postie reads category from the SUBJECT line, not the body
        // Format: [Category] Title — Postie strips the category prefix automatically
        const subject = category ? `[${category}] ${title}` : title;

        const formattedContent = content.trim().replace(/\n\s*\n/g, '<br><br>');

        // No inline <img> tag — Postie will insert the attached image as featured image
        const htmlBody = `status: publish<br><br>
<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 800px; margin: 0 auto; color: #333; font-size: 18px; line-height: 1.8;">
    ${formattedContent}
</div>`;

        // Attach image as file so Postie recognizes it as featured image
        const attachments: any[] = [];
        if (imageUrl) {
            console.log(`[MailService] Attempting to attach image: ${imageUrl}`);
            try {
                const internalMatch = imageUrl.match(/^\/api\/images\/([^\/\?]+)/);
                if (internalMatch) {
                    // Internally-generated image — read bytes from DB directly
                    const img = await prisma.generatedImage.findUnique({ where: { id: internalMatch[1] } });
                    if (img) {
                        const ext = img.mimeType === 'image/jpeg' ? '.jpg' : '.png';
                        attachments.push({
                            filename: `featured-image${ext}`,
                            content: Buffer.from(img.data)
                        });
                        console.log(`[MailService] Attached internal image ${internalMatch[1]} (${img.data.length} bytes)`);
                    } else {
                        console.error(`[MailService] Internal image not found: ${internalMatch[1]}`);
                    }
                } else {
                    // External URL — fetch the image. Many CDNs (Bing thumbs,
                    // Getty, big newsrooms) block bare Node fetches and return
                    // 403 silently, so we send a real browser UA + Accept.
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 10000);
                    let response: Response;
                    try {
                        response = await fetch(imageUrl, {
                            signal: controller.signal,
                            redirect: 'follow',
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                                'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
                                'Referer': new URL(imageUrl).origin
                            }
                        });
                    } finally {
                        clearTimeout(timeout);
                    }

                    if (response.ok) {
                        const contentType = response.headers.get('content-type') || '';
                        if (!contentType.startsWith('image/')) {
                            console.error(`[MailService] Non-image content-type "${contentType}" from ${imageUrl} — skipping attachment.`);
                        } else {
                            const arrayBuffer = await response.arrayBuffer();
                            const buffer = Buffer.from(arrayBuffer);
                            const extFromCT = contentType.includes('jpeg') ? '.jpg'
                                : contentType.includes('png') ? '.png'
                                : contentType.includes('webp') ? '.webp'
                                : contentType.includes('gif') ? '.gif'
                                : null;
                            const ext = extFromCT
                                || imageUrl.match(/\.(jpg|jpeg|png|webp|gif)/i)?.[0]
                                || '.jpg';
                            const filename = `featured-image${ext}`;
                            attachments.push({ filename, content: buffer });
                            console.log(`[MailService] Attached image as ${filename} (${buffer.length} bytes, ${contentType}) from ${imageUrl}`);
                        }
                    } else {
                        console.error(`[MailService] HTTP ${response.status} ${response.statusText} when fetching image: ${imageUrl}`);
                    }
                }
            } catch (err: any) {
                const reason = err?.name === 'AbortError' ? 'timeout after 10s'
                    : err?.message || String(err);
                console.error(`[MailService] Failed to prepare image attachment from ${imageUrl} — ${reason}`);
            }
        } else {
            console.log(`[MailService] No image URL provided for article: ${title}`);
        }

        try {
            console.log(`[MailService] Sending email to ${targetEmail} with ${attachments.length} attachments...`);
            const data = await this.resend.emails.send({
                from: this.fromEmail,
                to: targetEmail,
                subject: subject,
                html: htmlBody,
                attachments: attachments.length > 0 ? attachments : undefined,
            });

            if (data.error) {
                console.error(`Resend API Error when publishing to ${targetEmail}`, data.error);
                return false;
            }

            console.log(`Article published to ${targetEmail}${category ? ` [${category}]` : ''} via Resend. ID: ${data.data?.id}`);
            return true;
        } catch (error) {
            console.error(`Failed to publish article to ${targetEmail} via Resend`, error);
            return false;
        }
    }

    public async sendScrapedArticles(targetEmail: string, sourceName: string, articles: Article[]) {
        const dateStr = new Date().toLocaleDateString();

        let htmlBody = `
            <div style="font-family: Arial, sans-serif; max-w-4xl max-width: 800px; margin: 0 auto; color: #333;">
                <h1 style="border-bottom: 2px solid #000; padding-bottom: 10px;">Hermes Reporte: ${sourceName} (${dateStr})</h1>
                <p>Nuevas noticias procesadas automáticamente por la plataforma Hermes.</p>
                <hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;" />
        `;

        for (const article of articles) {
            htmlBody += `
                <div style="margin-bottom: 30px; padding: 15px; background: #f9f9f9; border-left: 4px solid #333;">
                    <h2 style="margin-top: 0;">${article.rewrittenTitle || article.originalTitle}</h2>
                    <p style="white-space: pre-wrap; line-height: 1.6;">${article.rewrittenContent || article.originalContent}</p>
                    <p style="font-size: 12px; color: #999;">Fuente: <a href="${article.originalUrl}" style="color: #666;">Enlace Original</a> | Status: ${article.status}</p>
                </div>
            `;
        }

        htmlBody += `
                
            </div>
        `;

        try {
            const data = await this.resend.emails.send({
                from: this.fromEmail,
                to: targetEmail,
                subject: `Nuevas noticias de ${sourceName} - ${dateStr}`,
                html: htmlBody,
            });

            if (data.error) {
                console.error(`Resend API Error when sending report to ${targetEmail}`, data.error);
                return false;
            }

            console.log(`Email report sent to ${targetEmail} via Resend. ID: ${data.data?.id}`);
            return true;
        } catch (error) {
            console.error(`Failed to send email report to ${targetEmail} via Resend`, error);
            return false;
        }
    }
}
