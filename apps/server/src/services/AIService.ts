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

        let completion;
        try {
            completion = await this.openai.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "gpt-4o-mini",
                response_format: { type: "json_object" },
                max_tokens: 1500,
            });
        } catch (error) {
            console.error('[AIService] API error during rewriteContent:', error);
            return { title, content };
        }

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

        let completion;
        try {
            completion = await this.openai.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "gpt-4o-mini",
                max_tokens: 3,
            });
        } catch (error) {
            console.error('[AIService] API error during calculateInterestScore:', error);
            return 5;
        }

        const score = parseInt(completion.choices[0].message.content || '5');
        return isNaN(score) ? 5 : score;
    }

    async selectBestImage(title: string, content: string, imageUrls: string[], originalImageUrl?: string): Promise<{ url: string | null, scores: number[] }> {
        if (!imageUrls || imageUrls.length === 0) return { url: null, scores: [] };
        // Single candidate still goes through AI — don't auto-approve without evaluation

        try {
            const config = await this.promptService.getPromptByType('IMAGE_SELECT');
            let promptTemplate = config?.template || `You are a photo editor for a digital news agency. You will receive a news article title, a content snippet, and candidate images.

You may also receive a REFERENCE IMAGE extracted from the original news article. This image is NOT a candidate — do not select or score it. Use it only to understand the subject, protagonist, or visual context of the story (e.g., to recognize a person's face or a specific location).

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
- Photos showing the same person or location as the reference image (if provided)

Return a JSON object:
{
  "selectedIndex": number,
  "scores": [number] // Array of scores (1-10) corresponding to each image candidate in the exact order they were provided
}
- Use 0-based index for the best image
- Use -1 if ALL images should be rejected (none are suitable, e.g. no score > 5)`;

            // Build reference image block (shown before candidates, labeled as context only)
            const referenceBlock: any[] = originalImageUrl ? [
                { type: "text", text: `--- REFERENCE IMAGE (NOT a candidate — use to identify the protagonist/subject) ---` },
                { type: "image_url", image_url: { url: originalImageUrl, detail: "low" } },
                { type: "text", text: `--- END REFERENCE ---\n\nNow select the best from the following ${Math.min(imageUrls.length, 5)} candidates:` }
            ] : [
                { type: "text", text: `Select the best image from the following ${Math.min(imageUrls.length, 5)} candidates:` }
            ];

            const messages: any[] = [
                {
                    role: "system",
                    content: promptTemplate
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: `Article Title: ${title}\nContent Snippet: ${content.substring(0, 300)}\n` },
                        ...referenceBlock,
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
            const scores: number[] = result.scores || imageUrls.map(() => 0);

            // Pick the URL with the highest score — more reliable than trusting selectedIndex
            // since the AI sometimes returns an inconsistent selectedIndex vs scores array
            let bestIndex = -1;
            let bestScore = 0;
            scores.forEach((s, i) => {
                if (i < imageUrls.length && s > bestScore) {
                    bestScore = s;
                    bestIndex = i;
                }
            });

            // Reject if no image scored above 5
            if (bestIndex === -1 || bestScore <= 5) {
                console.log(`[AIService] ❌ No suitable candidate (best score: ${bestScore}).`);
                return { url: null, scores };
            }

            console.log(`[AIService] ✅ Best candidate: index ${bestIndex}, score ${bestScore}/10`);
            return { url: imageUrls[bestIndex], scores };

        } catch (error) {
            console.error('[AIService] Image selection failed:', error);
            return { url: null, scores: imageUrls.map(() => 0) }; // Let caller handle fallback
        }
    }
}
