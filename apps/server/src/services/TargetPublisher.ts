import { Article, Target } from '@prisma/client';
import { MailService } from './MailService';
import { ImpactoApiService } from './ImpactoApiService';
import { ConfigService } from './ConfigService';
import { prisma } from '../lib/prisma';
import { appendAiAttribution, sourceDisplayName } from './AiAttribution';

/** Sends an article to a target, whatever its type. Returns true when it was accepted. */
export class TargetPublisher {
    private impactoApi = new ImpactoApiService();
    private configService = new ConfigService();

    constructor(private mailService: MailService) {}

    public async publish(target: Target, article: Article, category?: string): Promise<boolean> {
        const outgoing = await this.withAiAttribution(article);
        if (target.type === 'IMPACTO_API') {
            return (await this.impactoApi.publish(target, outgoing, category)).ok;
        }
        if (!target.email) {
            console.error(`[TargetPublisher] Target ${target.name} has no email configured.`);
            return false;
        }
        return this.mailService.sendArticleToTarget(target.email, outgoing, category);
    }

    /** What to store as the publication's destination address. */
    public static destinationLabel(target: Target): string {
        return target.type === 'IMPACTO_API' ? (target.apiUrl || '') : (target.email || '');
    }

    /** Adds the "written with AI" footer naming the source when the setting is on. */
    private async withAiAttribution(article: Article): Promise<Article> {
        if (await this.configService.getSetting('ai_attribution', 'false') !== 'true') return article;
        const content = article.rewrittenContent || article.originalContent;
        const source = await prisma.source.findUnique({ where: { id: article.sourceId }, select: { name: true } });
        return { ...article, rewrittenContent: appendAiAttribution(content, sourceDisplayName(source?.name || 'Medio original')) };
    }
}
