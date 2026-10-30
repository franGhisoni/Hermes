import assert from 'node:assert/strict';
import test from 'node:test';
import { ImageService } from '../src/services/ImageService';
import { AIService } from '../src/services/AIService';
import { imageAlt } from '../src/services/ImpactoApiService';

function fallback() {
    const service: any = Object.create(ImageService.prototype);
    service.configService = {
        getImageQueryContentChars: async () => 900,
        getImageQueryMinLength: async () => 4,
        getImageQueryMaxCount: async () => 3,
        getImageLeadMinChars: async () => 20,
        getImageLeadMaxChars: async () => 300,
        getImageLeadMaxWords: async () => 8
    };
    return service;
}

test('BlackRock remains in every fallback query for the reported article', async () => {
    const queries = await fallback().buildSearchQueries({
        title: 'BlackRock vuelve a mirar a América Latina: por qué la Argentina podría beneficiarse y cuál es la recomendación',
        content: 'La combinación que detectó BlackRock. La oportunidad para la Argentina.',
        rewrittenTitle: 'BlackRock: potencial para Argentina y recomendaciones clave'
    });
    assert.equal(queries.length, 3);
    assert.ok(queries[0].startsWith('BlackRock vuelve a mirar a América Latina'));
    assert.equal(queries[1], 'BlackRock potencial para Argentina y recomendaciones clave');
    assert.equal(queries[2], 'BlackRock');
});

test('preserves people, accented locations and mixed-case entities', async () => {
    for (const [title, subject] of [
        ['Javier Milei: visita a Córdoba', 'Javier Milei'],
        ['OpenAI presenta novedades en Argentina', 'OpenAI'],
        ['Cómo crece BlackRock en América Latina', 'BlackRock']
    ]) {
        const queries = await fallback().buildSearchQueries({ title });
        assert.ok(queries.length > 0);
        assert.ok(queries.every((query: string) => query.includes(subject)));
        assert.ok(queries.length <= 3);
    }
    assert.ok(fallback().cleanTitleForSearch('BlackRock: nuevas inversiones').includes('BlackRock'));
});

test('broken reference retries with text and unrelated model queries are rejected', async () => {
    const service: any = Object.create(AIService.prototype);
    service.configService = {
        getImageQueryGenContentChars: async () => 1500,
        getImageQueryModel: async () => 'mock',
        getImageQueryMaxTokens: async () => 500,
        getTextReasoningEffort: async () => 'low',
        getReasoningTokenHeadroom: async () => 0
    };
    let calls = 0;
    service.openai = { chat: { completions: { create: async (request: any) => {
        calls++;
        if (calls === 1) throw new Error('reference unavailable');
        assert.ok(request.messages[1].content.every((part: any) => part.type === 'text'));
        return { choices: [{ message: { content: JSON.stringify({
            protagonist: 'BlackRock',
            queries: ['América Latina Argentina', 'BlackRock oficinas', 'potencial para Argentina']
        }) } }] };
    } } } };
    const result = await service.generateImageSearchQueries({
        title: 'BlackRock: inversiones', content: 'BlackRock mira América Latina',
        originalImageUrl: 'https://example.invalid/broken.jpg'
    });
    assert.equal(calls, 2);
    assert.deepEqual(result.queries, ['BlackRock oficinas']);
});

test('image alt comes from the scoring trace and falls back when missing', () => {
    const article: any = { aiDecisions: { imageScoring: [{ url: 'https://x.test/a.jpg', alt: 'Fachada roja de la sede de la UCR' }] } };
    assert.equal(imageAlt(article, 'https://x.test/a.jpg', 'Nota'), 'Fachada roja de la sede de la UCR');
    assert.equal(imageAlt(article, 'https://x.test/otra.jpg', 'Nota'), 'Imagen de la nota: Nota');
    assert.equal(imageAlt({} as any, 'https://x.test/a.jpg', 'Nota'), 'Imagen de la nota: Nota');
});

test('scoring always asks for reasons and alts, even with a stored prompt', async () => {
    const service: any = Object.create(AIService.prototype);
    service.promptService = { getPromptByType: async () => ({ template: 'Only return scores.' }) };
    service.configService = {
        getImagePoolSize: async () => 30, getImageScoringModel: async () => 'mock',
        getImageScoringReasoningEffort: async () => 'low', getImageScoringMaxTokens: async () => 100,
        getImageScoringContentChars: async () => 100, getImageScoringMaxRetries: async () => 1,
        getReasoningTokenHeadroom: async () => 0
    };
    let request: any;
    service.openai = { chat: { completions: { create: async (r: any) => {
        request = r;
        return { choices: [{ message: { content: JSON.stringify({ scores: [8], reasonings: ['Bien'], alts: ['Una sede'] }) } }] };
    } } } };
    const result = await service.selectBestImage('T', 'C', ['https://x.test/a.jpg'], undefined, 4);
    assert.match(request.messages[0].content, /"reasonings"/);
    assert.match(request.messages[0].content, /"alts"/);
    assert.equal(request.max_tokens, 620);
    assert.deepEqual(result.alts, ['Una sede']);
});
