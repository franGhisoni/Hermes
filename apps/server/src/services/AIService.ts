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

    /**
     * Generate Bing-friendly image search queries by giving gpt-4o the article
     * context AND the original published image. The vision pass lets the model
     * identify who/what is actually in the photo (often more specific than the
     * title) and produce queries that target a DIFFERENT photo of the same
     * subject — exactly what republishing requires.
     */
    async generateImageSearchQueries(input: {
        title: string;
        content: string;
        rewrittenTitle?: string;
        originalImageUrl?: string;
    }): Promise<string[]> {
        try {
            const systemPrompt = `You generate image search queries for a Spanish-language news editor in Argentina.

You receive:
- An article TITLE and CONTENT EXCERPT.
- Optionally, a REFERENCE IMAGE that the original publication used. Use it to confirm who or what the article is really about (a face, a logo, a location).

Your output: 3 to 5 short Bing image-search queries, in Spanish, that would find PHOTOJOURNALISTIC images of the same protagonist/subject — but NOT the same photo as the reference (this is for republishing; reusing the source photo is forbidden).

RULES:
- Name the protagonist explicitly: full names of people, names of organizations, city/region for places, brand name for products.
- Use noun phrases. No quotes, no boolean operators, no \`site:\` filters. 3-8 words each.
- If the title is a pun, joke, or wordplay (e.g. "Soy urólogo, no ufólogo"), DO NOT search the pun. Search the program, host, channel, or event named in the body.
- If the article is about a generic concept (e.g. honey exports), name the concrete actors (Mercosur, Unión Europea, exportadores apícolas) instead of just the concept.
- Include at least one query that targets the most likely public-record photo (e.g. "Adorni Casa Rosada", "Tim Cook keynote 2024", "Vorterix Y qué Migue Granados").
- Avoid generic stock-photo terms unless the article is genuinely abstract.

Return strictly:
{ "protagonist": string, "queries": [string, string, ...] }`;

            const userContent: any[] = [
                { type: "text", text: `Título: ${input.title}\n\nExtracto:\n${(input.content || '').substring(0, 1500)}\n${input.rewrittenTitle ? `\nTítulo reescrito: ${input.rewrittenTitle}` : ''}` }
            ];

            if (input.originalImageUrl) {
                userContent.push(
                    { type: "text", text: `\n--- Imagen de referencia de la publicación original (NO es candidata, sólo para reconocer al protagonista) ---` },
                    { type: "image_url", image_url: { url: input.originalImageUrl, detail: "high" } }
                );
            }

            const completion = await this.openai.chat.completions.create({
                model: "gpt-4o",
                response_format: { type: "json_object" },
                max_tokens: 500,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userContent }
                ]
            });

            const result = JSON.parse(completion.choices[0].message.content || '{}');
            const queries: string[] = Array.isArray(result.queries) ? result.queries : [];
            const cleaned = queries
                .filter((q: any) => typeof q === 'string')
                .map(q => q.trim())
                .filter(q => q.length >= 3 && q.length <= 120);

            if (result.protagonist) {
                console.log(`[AIService] 🎯 Smart query protagonist: ${result.protagonist}`);
            }
            if (cleaned.length > 0) {
                console.log(`[AIService] Smart queries: ${cleaned.map(q => `"${q}"`).join(' | ')}`);
            } else {
                console.log(`[AIService] No smart queries returned, falling back to regex extraction.`);
            }
            return cleaned;
        } catch (error) {
            console.error('[AIService] Smart query generation failed, falling back:', error);
            return [];
        }
    }

    async selectBestImage(title: string, content: string, imageUrls: string[], originalImageUrl?: string, minScore: number = 6): Promise<{ url: string | null, scores: number[] }> {
        if (!imageUrls || imageUrls.length === 0) return { url: null, scores: [] };
        // Single candidate still goes through AI — don't auto-approve without evaluation

        try {
            const config = await this.promptService.getPromptByType('IMAGE_SELECT');
            let promptTemplate = config?.template || `You are a photo editor for a digital news agency, picking the lead image for a REPUBLICATION of someone else's article.

You will receive:
1. The article TITLE and a CONTENT EXCERPT — use these to identify the PROTAGONIST or SUBJECT of the story (a specific person, organization, location, event, or object).
2. A REFERENCE IMAGE pulled from the original publication (when available). This is the image the source already used. We CANNOT republish with the same photo — we need a DIFFERENT photo of the same subject. Treat the reference as ground-truth for what the protagonist looks like, NOT as a candidate or a target to match exactly.
3. A list of CANDIDATE IMAGES indexed 0..N.

YOUR JOB:
- Internally decide who/what the story is about before scoring (the title alone is rarely enough — read the excerpt).
- Score EVERY candidate from 0 to 10. Use the full range — be harsh.
- Return the index of the single best image, or -1 if no candidate scores above the threshold.

SCORING RUBRIC (anchor each candidate against this):
- 9-10: Clean photojournalistic shot of the exact protagonist/subject, DIFFERENT photo from the reference (different framing, different moment, different angle). Could run on the front page.
- 7-8: Same protagonist/subject (different photo), but framing/quality is OK, not great. Or a clearly relevant scene from the same event.
- 5-6: Related subject matter (same field/topic) but not the specific protagonist. Generic but acceptable.
- 3-4: Tangentially related — same general theme but clearly the wrong person/place/object.
- 1-2: Wrong subject entirely, OR same exact photograph as the reference (republished verbatim is not allowed), OR has serious quality issues (text overlays, TV chyrons, watermarks, logos, low quality).
- 0: Completely unrelated (a surfer for a politics story, a city skyline for a tractor story, etc.) or unusable junk.

HARD REJECTIONS (score 0-2 regardless of other qualities):
- Visually identical to the reference image: same photograph, same crop, same moment — even if hosted on a different URL or at a different resolution. This is the most important rejection: we are republishing and cannot reuse the source's photo.
- Visible text overlays, captions, lower-thirds, "zócalos"
- TV screen captures with channel logos/chyrons
- Newsroom branding (La Nación, TN, Clarín, C5N, NA, Noticias Argentinas, etc.)
- Blue "NA" bar at the bottom (Noticias Argentinas watermark)
- Other watermarks, low quality, blurriness, collages
- Obvious AI-generated or stock illustrations not specific to the story

CRITICAL:
- If a candidate clearly shows the wrong subject (e.g. a surfer when the story is about a farmer, a different person than the reference), it must score 0-2. Do not be polite — incorrect subject = unusable.
- If a candidate is the SAME photograph as the reference, score 1 and do not select it. Prefer a slightly weaker but visually distinct candidate over a perfect duplicate.

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
