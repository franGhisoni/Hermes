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

    async selectBestImage(title: string, content: string, imageUrls: string[], originalImageUrl?: string, minScore: number = 6): Promise<{ url: string | null, scores: number[] }> {
        if (!imageUrls || imageUrls.length === 0) return { url: null, scores: [] };
        // Single candidate still goes through AI — don't auto-approve without evaluation

        try {
            const config = await this.promptService.getPromptByType('IMAGE_SELECT');
            let promptTemplate = config?.template || `You are a photo editor for a digital news agency.

You will receive:
1. The article TITLE and a CONTENT EXCERPT — use these to identify the PROTAGONIST or SUBJECT of the story (a specific person, organization, location, event, or object).
2. A REFERENCE IMAGE pulled from the original publication (when available). This image is NOT a candidate. Treat it as ground-truth for what the protagonist looks like (face, setting, object). Candidates that visually match the reference are almost always the right pick.
3. A list of CANDIDATE IMAGES indexed 0..N.

YOUR JOB:
- Internally decide who/what the story is about before scoring (the title alone is rarely enough — read the excerpt).
- Score EVERY candidate from 0 to 10. Use the full range — be harsh.
- Return the index of the single best image, or -1 if no candidate scores above the threshold.

SCORING RUBRIC (anchor each candidate against this):
- 9-10: Clean photojournalistic shot of the exact protagonist/subject (matches reference if provided). Could run on the front page.
- 7-8: Same protagonist/subject but framing/quality is OK, not great. Or a clearly relevant scene from the event.
- 5-6: Related subject matter (same field/topic) but not the specific protagonist. Generic but acceptable.
- 3-4: Tangentially related — same general theme but clearly the wrong person/place/object.
- 1-2: Wrong subject entirely, or has serious quality issues (text overlays, TV chyrons, watermarks, logos, low quality).
- 0: Completely unrelated (a surfer for a politics story, a city skyline for a tractor story, etc.) or unusable junk.

HARD REJECTIONS (score 0-2 regardless of other qualities):
- Visible text overlays, captions, lower-thirds, "zócalos"
- TV screen captures with channel logos/chyrons
- Newsroom branding (La Nación, TN, Clarín, C5N, NA, Noticias Argentinas, etc.)
- Blue "NA" bar at the bottom (Noticias Argentinas watermark)
- Other watermarks, low quality, blurriness, collages
- Obvious AI-generated or stock illustrations not specific to the story

CRITICAL: If a candidate clearly shows the wrong subject (e.g. a surfer when the story is about a farmer, a different person than the reference), it must score 0-2. Do not be polite — incorrect subject = unusable.

Return a JSON object:
{
  "protagonist": string,  // one short sentence identifying who/what the story is about
  "selectedIndex": number,
  "scores": [number]      // Array of scores (0-10) corresponding to each candidate in the exact order provided
}
- Use 0-based index for the best image
- Use -1 if every candidate scores below the threshold`;

            // Build reference image block (shown before candidates, labeled as context only).
            // Reference uses "high" detail so we can actually recognize faces/locations.
            const referenceBlock: any[] = originalImageUrl ? [
                { type: "text", text: `--- REFERENCE IMAGE (ground truth for protagonist; NOT a candidate, do not select or score it) ---` },
                { type: "image_url", image_url: { url: originalImageUrl, detail: "high" } },
                { type: "text", text: `--- END REFERENCE ---\n\nNow score the following ${Math.min(imageUrls.length, 5)} candidates. Identify the protagonist first, then score each one against the protagonist and the reference.` }
            ] : [
                { type: "text", text: `No reference image available. Identify the protagonist from the title and excerpt, then score the following ${Math.min(imageUrls.length, 5)} candidates against it.` }
            ];

            const messages: any[] = [
                {
                    role: "system",
                    content: promptTemplate
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: `Article Title: ${title}\n\nContent Excerpt:\n${content.substring(0, 1200)}\n` },
                        ...referenceBlock,
                        ...imageUrls.slice(0, 5).flatMap((url, i) => ([
                            { type: "text", text: `--- Candidate Index: ${i} ---` },
                            { type: "image_url", image_url: { url: url, detail: "low" } }
                        ]))
                    ]
                }
            ];

            const completion = await this.openai.chat.completions.create({
                // Use the full vision model (not -mini) — the smaller one
                // routinely misidentified subjects (e.g. scoring a surfer
                // higher than the matching tractor photo). The extra cost
                // is worth it for editorial relevance.
                model: "gpt-4o",
                messages: messages,
                response_format: { type: "json_object" },
                max_tokens: 1000
            });

            const result = JSON.parse(completion.choices[0].message.content || '{}');
            const scores: number[] = result.scores || imageUrls.map(() => 0);

            if (result.protagonist) {
                console.log(`[AIService] 🎯 Protagonist identified: ${result.protagonist}`);
            }
            console.log(`[AIService] Scores: [${scores.join(', ')}]`);

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

            // Reject if no image scored at or above the configured minimum
            if (bestIndex === -1 || bestScore < minScore) {
                console.log(`[AIService] ❌ No suitable candidate (best score: ${bestScore}, min required: ${minScore}).`);
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
