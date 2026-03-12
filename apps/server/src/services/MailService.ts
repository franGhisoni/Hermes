import { Resend } from 'resend';
import { Article } from '@prisma/client';

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
                // Fetch the image manually since Resend requires a buffer for attachments
                const response = await fetch(imageUrl);
                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    const ext = imageUrl.match(/\.(jpg|jpeg|png|webp|gif)/i)?.[0] || '.jpg';
                    const filename = `featured-image${ext}`;
                    attachments.push({
                        filename: filename,
                        content: buffer
                    });
                    console.log(`[MailService] Successfully attached image as ${filename} (${buffer.length} bytes)`);
                } else {
                    console.error(`Status ${response.status} when fetching image for attachment: ${imageUrl}`);
                }
            } catch (err) {
                console.error(`Failed to download image from ${imageUrl} for Resend attachment`, err);
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
