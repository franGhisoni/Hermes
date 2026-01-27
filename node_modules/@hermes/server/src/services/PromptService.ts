import { PrismaClient, PromptConfig, PromptType } from '@prisma/client';

const prisma = new PrismaClient();

export class PromptService {

    async getPrompts() {
        return prisma.promptConfig.findMany();
    }

    async getPromptByType(type: PromptType) {
        return prisma.promptConfig.findFirst({
            where: { type }
        });
    }

    async updatePrompt(id: string, template: string) {
        return prisma.promptConfig.update({
            where: { id },
            data: { template }
        });
    }

    async createPrompt(name: string, type: PromptType, template: string) {
        return prisma.promptConfig.create({
            data: { name, type, template }
        });
    }

    async ensureDefaultPrompts() {
        // Rewrite
        const rewrite = await this.getPromptByType('REWRITE');
        if (!rewrite) {
            await this.createPrompt('Default Rewrite', 'REWRITE',
                `You are an expert news editor. Rewrite the following news article to be unique, engaging, and plagiarism-free while retaining all factual information.
            
            Style: Neutral, Professional (NYT Style).
            Language: Spanish.
            
            Original Title: {{title}}
            Original Content:
            {{content}}
            
            Return the response in JSON format: { "title": "New Title", "content": "New Content" }`);
        }

        // Interest
        const interest = await this.getPromptByType('INTEREST');
        if (!interest) {
            await this.createPrompt('Default Interest', 'INTEREST',
                `Rate the general public interest of this news article on a scale of 1 to 10.
            1 = Boring, niche, or local gossip.
            10 = Breaking global news, high impact, or viral potential.
            
            Title: {{title}}
            Content Snippet: {{content}}
            
            Return ONLY the number.`);
        }
    }
}
