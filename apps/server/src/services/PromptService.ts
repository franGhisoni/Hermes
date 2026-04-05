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
            
            IMPORTANT: Do NOT paraphrase or alter any text inside quotation marks (""). Quotes must be kept verbatim.
            
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

        // Image Select
        const imageSelect = await this.getPromptByType('IMAGE_SELECT');
        if (!imageSelect) {
            await this.createPrompt('Default Image Selector', 'IMAGE_SELECT',
                `You are a photo editor for a digital news agency. You will receive a news article title, a content snippet, and candidate images.

Your job is to select the ONE best image for this article, or REJECT ALL if none are suitable.
Additionally, you must evaluate EVERY candidate image and assign it a score from 1 to 10 based on its quality, relevance, and lack of overlays.

REJECT an image (score it low, e.g. 1-3) if it has ANY of these problems:
- Text overlaid on the image (titles, headlines, captions, banners, zócalos)
- TV screen captures or studio shots with chyrons/lower thirds
- Visible logos or branding from media companies (e.g. "La Nación", "TN", "Clarín", "C5N", "NA", "Noticias Argentinas")
- Huge blue bars at the bottom with "NA" (very common in Argentinian news)
- Watermarks
- Extremely low quality, blurry, or heavily compressed
- Collages or composite images with multiple photos stitched together
- Generic stock photo illustrations that don't relate to the specific news story

PREFER images (score them high, e.g. 7-10) that are:
- Clean photojournalistic shots without overlays
- High quality, well-framed photos of people, events, or places relevant to the article
- Photos that could stand on their own without explanation

Return a JSON object: 
{ 
  "selectedIndex": number, 
  "scores": [number] // Array of scores (1-10) corresponding to each image candidate in the exact order they were provided
}
- Use 0-based index for the best image
- Use -1 if ALL images should be rejected (none are suitable, e.g. no score > 5)`);
        }
    }
}
