import assert from 'node:assert/strict';
import test from 'node:test';
import { isRelevantImageResult, SearxngProvider } from '../src/services/imageProviders/SearxngProvider';

test('keeps results that mention a query term, ignoring accents and case', () => {
    assert.ok(isRelevantImageResult('Nieves Álvarez desfile', { title: 'NIEVES ALVAREZ en Madrid' }));
    assert.ok(isRelevantImageResult('Rottweiler con familia', { img_src: 'https://x.test/rottweiler-1.jpg' }));
});

test('drops results unrelated to the query', () => {
    assert.equal(isRelevantImageResult('Rottweiler entrenamiento', {
        title: 'Casita de jengibre', content: 'Navidad', img_src: 'https://x.test/gingerbread.jpg'
    }), false);
});

test('queries without usable terms do not filter anything', () => {
    assert.ok(isRelevantImageResult('La AFA', { title: 'cualquier cosa' }));
});

test('a batch of unrelated images retries through Bing and keeps only relevant results', async (t) => {
    const urls: string[] = [];
    t.mock.method(globalThis, 'fetch', async (url: string) => {
        urls.push(url);
        const results = url.includes('engines=')
            ? [{ img_src: 'https://x.test/rottweiler.jpg', title: 'Rottweiler', engine: 'bing images' }]
            : [{ img_src: 'https://x.test/anime.jpg', title: 'Anime', engine: 'bing images' }];
        return new Response(JSON.stringify({ results }));
    });

    const result = await new SearxngProvider({ baseUrl: 'http://searxng.test' }).search('Rottweiler familia');

    assert.equal(urls.length, 2);
    assert.ok(urls[1].includes('bing+images'));
    assert.deepEqual(result.results, ['https://x.test/rottweiler.jpg']);
});
