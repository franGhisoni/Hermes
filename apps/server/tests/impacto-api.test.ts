import test from 'node:test';
import assert from 'node:assert/strict';
import { ImpactoApiService, contentToHtml, mapSection } from '../src/services/ImpactoApiService';

const article: any = {
    id: 'art-1',
    section: 'Política',
    originalTitle: 'Original',
    originalContent: 'Texto original',
    originalUrl: 'https://example.com/nota',
    originalImageUrl: null,
    rewrittenTitle: 'Título reescrito',
    rewrittenContent: 'Primer párrafo <b>.\n\nSegundo párrafo.',
    contentPreview: 'Bajada de la nota',
    featureImageUrl: 'https://cdn.example.com/foto.jpg',
};

const target = {
    name: 'Impacto Castex',
    apiUrl: 'https://cms.example.com/',
    apiKey: 'secret-key',
    apiMode: 'IN_REVIEW',
    sectionMap: { 'política': 'politica-nacional' },
};

test('contentToHtml escapa el texto y arma párrafos', () => {
    assert.equal(contentToHtml('Uno <b>\n\nDos\nlínea'), '<p>Uno &lt;b&gt;</p>\n<p>Dos<br>línea</p>');
});

test('mapSection usa el mapa sin distinguir mayúsculas y cae al nombre original', () => {
    assert.equal(mapSection({ Política: 'politica' }, 'política'), 'politica');
    assert.equal(mapSection({ Política: 'politica' }, undefined, 'Deportes'), 'Deportes');
    assert.equal(mapSection(null, undefined, null), undefined);
});

test('publish envía la nota a /api/v1/notas con la clave y el estado configurado', async t => {
    const calls: any[] = [];
    t.mock.method(globalThis, 'fetch', async (url: string, init: any) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ id: 42, url: 'https://impactocastex.com/politica/42' }), { status: 201 });
    });

    const result = await new ImpactoApiService().publish(target, article, 'Política');

    assert.deepEqual(result, { ok: true, id: '42', url: 'https://impactocastex.com/politica/42' });
    assert.equal(calls[0].url, 'https://cms.example.com/api/v1/notas');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer secret-key');
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.titulo, 'Título reescrito');
    assert.equal(body.bajada, 'Bajada de la nota');
    assert.equal(body.seccion, 'politica-nacional');
    assert.equal(body.estado, 'EN_REVISION');
    assert.equal(body.origen, 'HERMES');
    assert.equal(body.referenciaExterna, 'art-1');
    assert.deepEqual(body.imagen, { url: 'https://cdn.example.com/foto.jpg' });
});

test('publish informa el error cuando el CMS rechaza la nota', async t => {
    t.mock.method(globalThis, 'fetch', async () =>
        new Response(JSON.stringify({ error: 'Clave inválida' }), { status: 401, statusText: 'Unauthorized' }));

    const result = await new ImpactoApiService().publish(target, article);

    assert.equal(result.ok, false);
    assert.match(result.error || '', /401.*Clave inválida/);
});

test('publish no llama a la red si falta la clave', async t => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('{}'));

    const result = await new ImpactoApiService().publish({ ...target, apiKey: null }, article);

    assert.equal(result.ok, false);
    assert.equal(fetchMock.mock.callCount(), 0);
});
