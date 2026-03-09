import nodemailer from 'nodemailer';
import { Article } from '@prisma/client';
import dns from 'dns';

// Fix for Node >= 17 IPv6 ENETUNREACH issue
// This prevents nodemailer from attempting to connect via IPv6 if the host lacks a route.
dns.setDefaultResultOrder('ipv4first');

export class MailService {
    private transporter: nodemailer.Transporter;

    constructor() {
        // Use environment variables in production, but we provide a default ethereal test account
        // for local developmental testing if none are provided. Ethereal catches all emails for dev.
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.ethereal.email',
            port: parseInt(process.env.SMTP_PORT || '587'),
            auth: {
                user: process.env.SMTP_USER || 'allie.robel@ethereal.email',
                pass: process.env.SMTP_PASS || 'T9Q3J3m1vZv8zvFjP2'
            },
            // Force IPv4 to prevent ENETUNREACH timeouts in Railway/Cloud environments
            family: 4
        } as any);
    }

    public async sendArticleToTarget(targetEmail: string, article: Article, category?: string) {
        const title = article.rewrittenTitle || article.originalTitle;
        const content = article.rewrittenContent || article.originalContent;
        const imageUrl = article.featureImageUrl || article.originalImageUrl;

        // Postie reads category from the SUBJECT line, not the body
        // Format: [Category] Title — Postie strips the category prefix automatically
        const subject = category ? `[${category}] ${title}` : title;

        // No inline <img> tag — Postie will insert the attached image as featured image
        const htmlBody = `
            <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 800px; margin: 0 auto; color: #333;">
                <div style="line-height: 1.8; font-size: 16px; white-space: pre-wrap;">${content}</div>
                <hr style="margin: 30px 0; border: 0; border-top: 1px solid #eee;" />
                <p style="font-size: 11px; color: #999; text-align: center;">Publicado via Hermes Plataforma Automática de Noticias</p>
            </div>
        `;

        // Attach image as file so Postie recognizes it as featured image
        const attachments: any[] = [];
        if (imageUrl) {
            // Extract extension from URL, default to .jpg
            const ext = imageUrl.match(/\.(jpg|jpeg|png|webp|gif)/i)?.[0] || '.jpg';
            attachments.push({
                filename: `featured-image${ext}`,
                path: imageUrl // nodemailer downloads from URL automatically
            });
        }

        try {
            const info = await this.transporter.sendMail({
                from: '"Hermes Publisher" <noreply@hermes.local>',
                to: targetEmail,
                subject: subject,
                html: htmlBody,
                attachments,
            });
            console.log(`Article published to ${targetEmail}${category ? ` [${category}]` : ''}. Preview URL: ${nodemailer.getTestMessageUrl(info) || 'N/A'}`);
            return true;
        } catch (error) {
            console.error(`Failed to publish article to ${targetEmail}`, error);
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
                <p style="font-size: 11px; color: #999; text-align: center; margin-top: 40px;">Enviado por Hermes Plataforma Automática de Noticias</p>
            </div>
        `;

        try {
            const info = await this.transporter.sendMail({
                from: '"Hermes Auto-Publisher" <noreply@hermes.local>',
                to: targetEmail,
                subject: `Nuevas noticias de ${sourceName} - ${dateStr}`,
                html: htmlBody,
            });
            console.log(`Email sent to ${targetEmail}. Preview URL: ${nodemailer.getTestMessageUrl(info) || 'N/A'}`);
            return true;
        } catch (error) {
            console.error(`Failed to send email to ${targetEmail}`, error);
            return false;
        }
    }
}
