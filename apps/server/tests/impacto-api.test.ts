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
    assert.equal(body.title, 'Título reescrito');
    assert.equal(body.subtitle, 'Bajada de la nota');
    assert.equal(body.section, 'politica-nacional');
    assert.equal(body.status, 'in_review');
    assert.equal(body.externalRef, 'art-1');
    assert.equal(body.imageUrl, 'https://cdn.example.com/foto.jpg');
    assert.match(body.imageAlt, /Título reescrito/);
});

test('publish informa el error cuando el CMS rechaza la nota', async t => {
    t.mock.method(globalThis, 'fetch', async () =>
        new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Clave inválida' } }), { status: 401, statusText: 'Unauthorized' }));

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

test('publish trata un externalRef repetido (200 duplicate) como éxito', async t => {
    t.mock.method(globalThis, 'fetch', async () =>
        new Response(JSON.stringify({ id: 42, status: 'DRAFT', duplicate: true, url: 'https://x/42' }), { status: 200 }));

    const result = await new ImpactoApiService().publish(target, article);

    assert.equal(result.ok, true);
});

test('publish resuelve imágenes internas con HERMES_PUBLIC_URL y las omite sin ella', async t => {
    const bodies: any[] = [];
    t.mock.method(globalThis, 'fetch', async (_url: string, init: any) => {
        bodies.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ id: 1 }), { status: 201 });
    });
    const internal = { ...article, featureImageUrl: '/api/images/abc' };
    const previous = process.env.HERMES_PUBLIC_URL;
    try {
        process.env.HERMES_PUBLIC_URL = 'https://hermes.example.com/';
        await new ImpactoApiService().publish(target, internal);
        delete process.env.HERMES_PUBLIC_URL;
        await new ImpactoApiService().publish(target, internal);
    } finally {
        if (previous === undefined) delete process.env.HERMES_PUBLIC_URL; else process.env.HERMES_PUBLIC_URL = previous;
    }
    assert.equal(bodies[0].imageUrl, 'https://hermes.example.com/api/images/abc');
    assert.equal(bodies[1].imageUrl, undefined);
    assert.equal(bodies[1].imageAlt, undefined);
});

test('publish con apiMode PUBLISHED pide status published y registra el aviso del CMS', async t => {
    const bodies: any[] = [];
    t.mock.method(globalThis, 'fetch', async (_url: string, init: any) => {
        bodies.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ id: 7, status: 'DRAFT', warning: 'La cuenta no puede publicar' }), { status: 201 });
    });

    const result = await new ImpactoApiService().publish({ ...target, apiMode: 'PUBLISHED' }, article);

    assert.equal(bodies[0].status, 'published');
    assert.equal(result.ok, true);
});

test('contentToHtml deja pasar el HTML de la reescritura SEO', () => {
    const html = '<p>Primer <strong>párrafo</strong>.</p><h2>Subtítulo</h2><p>Otro.</p>';
    assert.equal(contentToHtml(`  ${html}\n`), html);
});
