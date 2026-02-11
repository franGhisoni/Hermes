import OpenAI from 'openai';
import { PromptService } from './PromptService';

export class AIService {
    private openai: OpenAI;
    private promptService: PromptService;

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
        this.promptService = new PromptService();
    }

    async generateEmbedding(text: string): Promise<number[]> {
        const response = await this.openai.embeddings.create({
            model: "text-embedding-3-small",
            input: text,
            encoding_format: "float",
        });
        return response.data[0].embedding;
    }

    async rewriteContent(title: string, content: string, style: string = 'neutral'): Promise<{ title: string; content: string }> {
        const config = await this.promptService.getPromptByType('REWRITE');
        let promptTemplate = config?.template || `
        You are an expert news editor. Rewrite the following news article to be unique, engaging, and plagiarism-free while retaining all factual information.
        Style: {{style}}
        Original Title: {{title}}
        Original Content: {{content}}
        Return the response in JSON format: { "title": "New Title", "content": "New Content" }
        `;

        const prompt = promptTemplate
            .replace('{{style}}', style)
            .replace('{{title}}', title)
            .replace('{{content}}', content.substring(0, 3000));

        const completion = await this.openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
        });

        const rawContent = completion.choices[0].message.content || '{}';
        let result: any = {};

        try {
            // Clean content: remove markdown code blocks if present
            const cleanContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
            result = JSON.parse(cleanContent);
        } catch (e) {
            console.error('[AIService] Failed to parse JSON response:', e);
            console.error('[AIService] Raw response:', rawContent);
            // Fallback: use regex to extract if possible, or return original
            return {
                title: title,
                content: content // unexpected failure fallback
            };
        }

        return {
            title: result.title || title,
            content: result.content || content
        };
    }

    async calculateInterestScore(title: string, content: string): Promise<number> {
        const config = await this.promptService.getPromptByType('INTEREST');
        let promptTemplate = config?.template || `
        Rate the general public interest of this news article on a scale of 1 to 10.
        Title: {{title}}
        Content Snippet: {{content}}
        Return ONLY the number.
        `;

        const prompt = promptTemplate
            .replace('{{title}}', title)
            .replace('{{content}}', content.substring(0, 500));

        const completion = await this.openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-4o-mini",
        });

        const score = parseInt(completion.choices[0].message.content || '5');
        return isNaN(score) ? 5 : score;
    }

    async selectBestImage(title: string, content: string, imageUrls: string[]): Promise<string | null> {
        if (!imageUrls || imageUrls.length === 0) return null;
        if (imageUrls.length === 1) return imageUrls[0];

        try {
            const messages: any[] = [
                {
                    role: "system",
                    content: `You are a photo editor for a news agency. You will be provided with a news article title and a list of candidate images. Your job is to select the ONE image that best represents the article, is high quality, and is most relevant. Return ONLY the index of the selected image (0-based) as a JSON object: { "selectedIndex": number }.`
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: `Article Title: ${title}\nContent Snippet: ${content.substring(0, 300)}\n\nSelect the best image from the following:` },
                        ...imageUrls.slice(0, 5).map(url => ({
                            type: "image_url",
                            image_url: { url: url }
                        }))
                    ]
                }
            ];

            const completion = await this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: messages,
                response_format: { type: "json_object" },
                max_tokens: 50
            });

            const result = JSON.parse(completion.choices[0].message.content || '{}');
            const index = result.selectedIndex;

            if (typeof index === 'number' && index >= 0 && index < imageUrls.length) {
                return imageUrls[index];
            }
            return imageUrls[0]; // Fallback to first

        } catch (error) {
            console.error('[AIService] Image selection failed:', error);
            return imageUrls[0]; // Fallback
        }
    }
}
