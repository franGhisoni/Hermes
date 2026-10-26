import { Article, Target } from '@prisma/client';
import { MailService } from './MailService';
import { ImpactoApiService } from './ImpactoApiService';

/** Sends an article to a target, whatever its type. Returns true when it was accepted. */
export class TargetPublisher {
    private impactoApi = new ImpactoApiService();

    constructor(private mailService: MailService) {}

    public async publish(target: Target, article: Article, category?: string): Promise<boolean> {
        if (target.type === 'IMPACTO_API') {
            return (await this.impactoApi.publish(target, article, category)).ok;
        }
        if (!target.email) {
            console.error(`[TargetPublisher] Target ${target.name} has no email configured.`);
            return false;
        }
        return this.mailService.sendArticleToTarget(target.email, article, category);
    }

    /** What to store as the publication's destination address. */
    public static destinationLabel(target: Target): string {
        return target.type === 'IMPACTO_API' ? (target.apiUrl || '') : (target.email || '');
    }
}
