import test from 'node:test';
import assert from 'node:assert/strict';
import { isLaNacionAccessWall } from '../src/services/ContentSafetyService';
import { LaNacionScraper } from '../src/scrapers/LaNacionScraper';
import { ArticleService } from '../src/services/ArticleService';
import { MailService } from '../src/services/MailService';
import { prisma } from '../src/lib/prisma';

const url = 'https://www.lanacion.com.ar/economia/nota-periodistica-nid17092026/';
const headline = 'Una empresa argentina anunció inversiones y nuevos empleos';
const body = 'La compañía confirmó inversiones destinadas a ampliar su producción en tres provincias. El proyecto incluye nuevas instalaciones y la contratación de trabajadores durante el próximo año. Las autoridades explicaron el alcance del programa y detallaron las etapas previstas para su ejecución.';

test('bloquea las cuatro promociones de la captura, también después de reescribirlas', () => {
    for (const title of ['Oportunidades Exclusivas', 'Alcanza el máximo de notas gratuitas', 'Acceso ilimitado a contenidos exclusivos', 'Beneficios exclusivos para los suscriptores']) {
        assert.equal(isLaNacionAccessWall({ originalUrl: url, rewrittenTitle: title,
            rewrittenContent: 'VENTAJAS 1 credencial de acceso a Club Premium. Acceso ilimitado. Escuchar y resumir artículos mediante inteligencia artificial.' }), true);
    }
});

test('no confunde noticias sobre otros servicios de suscripción con el muro de La Nación', () => {
    assert.equal(isLaNacionAccessWall({ url, title: 'Netflix perdió suscriptores', content: body }), false);
    assert.equal(isLaNacionAccessWall({ url: 'https://www.otromedio.com/nota', content: 'credencial de Club Premium' }), false);
});

test('bloquea el HTML original confirmado en el servidor antes de la reescritura', () => {
    assert.equal(isLaNacionAccessWall({ url, title: 'Llegaste al límite de notas gratis',
        content: 'BENEFICIOS 1 credencial de Club LA NACION Premium 1 acceso sin límites a lanacion.com App LA NACION Escuchar y resumir contenido de LN con IA Guardar y comentar notas' }), true);
});

async function extract(overrides: Record<string, unknown> = {}, premiumAccess = true) {
    const scraper = new LaNacionScraper();
    const internal = scraper as any;
    internal.loggedIn = true;
    internal.verifyPremiumAccess = async () => premiumAccess;
    internal.extractPublishedDate = async () => new Date();
    internal.isFromToday = () => true;
    let calls = 0;
    const page = { goto: async () => null, waitForSelector: async () => null,
        evaluate: async () => ++calls === 1 ? [url] : {
            title: headline, structuredHeadline: headline, canonicalUrl: url,
            paragraphs: [body, body], structuredBody: body, isPaywalled: false, accessWall: false,
            ...overrides
        } };
    const articles = await internal.performScrape(page, 'https://www.lanacion.com.ar/economia/');
    return { articles, diagnostics: scraper.getDiagnostics() };
}

test('rechaza un muro con título desconocido aunque tenga JSON-LD con la nota original', async () => {
    const result = await extract({ title: 'Tu experiencia está a un paso' });
    assert.equal(result.articles.length, 0);
    assert.equal(result.diagnostics.skippedByContent, 1);
});

test('rechaza promociones cuyo título y metadata coinciden', async () => {
    const result = await extract({ title: 'Oportunidades Exclusivas', structuredHeadline: 'Oportunidades Exclusivas',
        paragraphs: ['1 credencial de acceso a Club Premium. Acceso ilimitado a la página web.'] });
    assert.equal(result.articles.length, 0);
});

test('rechaza redirects y contenido embebido sin cuerpo periodístico visible', async () => {
    assert.equal((await extract({ canonicalUrl: 'https://www.lanacion.com.ar/suscripciones/' })).articles.length, 0);
    assert.equal((await extract({ paragraphs: [] })).articles.length, 0);
});

test('acepta una noticia con identidad y cuerpo comprobados', async () => {
    assert.equal((await extract()).articles.length, 1);
});

test('detiene La Nación completa si la sonda Premium falla', async () => {
    await assert.rejects(() => extract({}, false), /La Nación detenida/);
});

test('la última barrera de envío rechaza un registro viejo reescrito sin llamar al proveedor de correo', async () => {
    const sender = Object.create(MailService.prototype) as MailService;
    await assert.rejects(() => sender.sendArticleToTarget('editor@example.com', {
        originalUrl: url, originalTitle: 'Una pieza anterior', originalContent: '',
        rewrittenTitle: 'Beneficios exclusivos', rewrittenContent: '1 credencial para el Club Premium. Acceso ilimitado.'
    } as any), /Publicación bloqueada/);
});

test('el guardado rechaza promociones reescritas antes de tocar la base', async () => {
    await assert.rejects(() => new ArticleService().saveArticle({
        sourceId: 'ln', originalUrl: url, originalTitle: 'Una pieza anterior', originalContent: '', embedding: [],
        rewrittenTitle: 'Beneficios exclusivos', rewrittenContent: '1 credencial para el Club Premium. Acceso ilimitado.'
    }), /Guardado bloqueado/);
});

test('cuarentena conserva los originales, rechaza sólo la cola pendiente y excluye IDs del listado y conteo', async () => {
    const originalFindMany = prisma.article.findMany;
    const originalUpdateMany = prisma.article.updateMany;
    const originalCount = prisma.article.count;
    const updates: any[] = [];
    const listQueries: any[] = [];
    (ArticleService as any).safetySweep = undefined;
    let query = 0;
    try {
        (prisma.article as any).findMany = async (input: any) => {
            if (++query === 1) return [
                { id: 'wall', originalUrl: url, originalTitle: 'Oportunidades Exclusivas', originalContent: 'Credencial para Club Premium con acceso ilimitado.' },
                { id: 'news', originalUrl: url, originalTitle: headline, originalContent: body }
            ];
            listQueries.push(input);
            return [];
        };
        (prisma.article as any).updateMany = async (input: any) => { updates.push(input); return { count: 1 }; };
        (prisma.article as any).count = async (input: any) => { listQueries.push(input); return 0; };
        const service = new ArticleService();
        assert.deepEqual(await service.quarantineLaNacionAccessWalls(), ['wall']);
        assert.deepEqual(updates[0], { where: { id: { in: ['wall'] }, status: { in: ['PENDING', 'APPROVED'] } }, data: { status: 'REJECTED' } });
        await service.getArticles({ page: 1, limit: 50 });
        assert.equal(listQueries.length, 2);
        for (const input of listQueries) assert.deepEqual(input.where.NOT, { id: { in: ['wall'] } });
    } finally {
        prisma.article.findMany = originalFindMany;
        prisma.article.updateMany = originalUpdateMany;
        prisma.article.count = originalCount;
        (ArticleService as any).safetySweep = undefined;
    }
});
