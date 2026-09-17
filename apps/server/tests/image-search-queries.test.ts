import assert from 'node:assert/strict';
import test from 'node:test';
import { ImageService } from '../src/services/ImageService';
import { AIService } from '../src/services/AIService';

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
    assert.deepEqual(queries, ['BlackRock', 'BlackRock América Latina', 'BlackRock Argentina']);
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
        getImageQueryMaxTokens: async () => 500
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
