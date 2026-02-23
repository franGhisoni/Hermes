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

    async selectBestImage(title: string, content: string, imageUrls: string[]): Promise<{ url: string | null, scores: number[] }> {
        if (!imageUrls || imageUrls.length === 0) return { url: null, scores: [] };
        if (imageUrls.length === 1) return { url: imageUrls[0], scores: [10] };

        try {
            const messages: any[] = [
                {
                    role: "system",
                    content: `You are a photo editor for a digital news agency. You will receive a news article title, a content snippet, and candidate images.

Your job is to select the ONE best image for this article, or REJECT ALL if none are suitable.
Additionally, you must evaluate EVERY candidate image and assign it a score from 1 to 10 based on its quality, relevance, and lack of overlays.

REJECT an image (score it low, e.g. 1-3) if it has ANY of these problems:
- Text overlaid on the image (titles, headlines, captions, banners, zócalos)
- TV screen captures or studio shots with chyrons/lower thirds
- Visible logos or branding from media companies (e.g. "La Nación", "TN", "Clarín", "C5N")
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
- Use -1 if ALL images should be rejected (none are suitable, e.g. no score > 5)`
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: `Article Title: ${title}\nContent Snippet: ${content.substring(0, 300)}\n\nSelect the best image from the following ${Math.min(imageUrls.length, 5)} candidates:` },
                        ...imageUrls.slice(0, 5).flatMap((url, i) => ([
                            { type: "text", text: `--- Candidate Index: ${i} ---` },
                            { type: "image_url", image_url: { url: url, detail: "low" } }
                        ]))
                    ]
                }
            ];

            const completion = await this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: messages,
                response_format: { type: "json_object" },
                max_tokens: 100
            });

            const result = JSON.parse(completion.choices[0].message.content || '{}');
            const index = result.selectedIndex;
            const scores = result.scores || imageUrls.map(() => 0);

            // -1 means all images rejected
            if (index === -1) {
                console.log('[AIService] ❌ AI rejected ALL image candidates.');
                return { url: null, scores };
            }

            if (typeof index === 'number' && index >= 0 && index < imageUrls.length) {
                return { url: imageUrls[index], scores };
            }
            return { url: imageUrls[0], scores }; // Fallback to first

        } catch (error) {
            console.error('[AIService] Image selection failed:', error);
            return { url: imageUrls[0], scores: imageUrls.map(() => 0) }; // Fallback
        }
    }
}
