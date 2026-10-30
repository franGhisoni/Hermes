import test from 'node:test';
import assert from 'node:assert/strict';
import { Minuto1Scraper } from '../src/scrapers/Minuto1Scraper';
import { LaPoliticaOnlineScraper } from '../src/scrapers/LaPoliticaOnlineScraper';
import { ElDestapeScraper } from '../src/scrapers/ElDestapeScraper';
import { DiarioLaPampaScraper } from '../src/scrapers/DiarioLaPampaScraper';
import { resolveSectionUrl } from '../src/scrapers/BaseScraper';

const normalize = (scraper: any, href: string) => scraper.normalizeArticleUrl(href);

test('las secciones se resuelven con o sin barra inicial', () => {
    const base = 'https://www.eldiariodelapampa.com.ar';
    assert.equal(resolveSectionUrl(base, 'la-pampa'), `${base}/la-pampa`);
    assert.equal(resolveSectionUrl(base, '/culturales'), `${base}/culturales`);
    assert.equal(resolveSectionUrl(base, 'https://otro.com/seccion'), 'https://otro.com/seccion');
});

test('Minuto Uno reconoce notas (-n123) y descarta secciones y temas', () => {
    const s = new Minuto1Scraper();
    assert.equal(normalize(s, '/politica/una-nota-n6338110?utm=1'), 'https://www.minutouno.com/politica/una-nota-n6338110');
    assert.equal(normalize(s, '/politica'), null);
    assert.equal(normalize(s, '/gobierno-a5128252'), null);
    assert.equal(normalize(s, 'https://otrositio.com/politica/una-nota-n1'), null);
});

test('La Política Online acepta notas y columnas, no secciones ni herramientas', () => {
    const s = new LaPoliticaOnlineScraper();
    assert.ok(normalize(s, '/politica/milei-rechaza-el-plan-platita-que-le-piden/'));
    assert.ok(normalize(s, '/ignacio-fidanza/ignacio-fidanza-torquemada-manaos/'));
    assert.equal(normalize(s, '/politica/'), null);
    assert.equal(normalize(s, '/tools/redirect.php'), null);
    assert.equal(normalize(s, '/files/image/265/265535/foto-de-una-nota-larga.jpg'), null);
});

test('El Destape reconoce el timestamp y descarta las coberturas en vivo', () => {
    const s = new ElDestapeScraper();
    assert.ok(normalize(s, '/politica/noche-de-furia-en-el-gobierno-20261026174826'));
    assert.equal(normalize(s, '/politica/javier-milei-vivo-ultimas-noticias-minuto-minuto-202610266738'), null);
    assert.equal(normalize(s, '/tag/brasil'), null);
});

test('El Diario de La Pampa reconoce /seccion/id/slug y lee fechas dd-mm-aaaa', () => {
    const s: any = new DiarioLaPampaScraper();
    assert.ok(normalize(s, '/la-pampa/82238/condenado-por-robar'));
    assert.equal(normalize(s, '/la-pampa'), null);
    assert.equal(s.parseDate('26-10-2026')?.toISOString(), '2026-10-26T15:00:00.000Z');
    assert.equal(s.parseDate('2026-10-26T10:00:00-03:00')?.toISOString(), '2026-10-26T13:00:00.000Z');
});

test('scrape arma la nota a partir del listado y la página (fetch simulado)', async t => {
    const today = new Date().toISOString();
    const listing = '<a href="/politica/una-nota-de-hoy-n1">Una nota</a><a href="/politica">Política</a>';
    const article = `<html><head>
        <script type="application/ld+json">{"@type":"NewsArticle","headline":"Una nota de hoy","datePublished":"${today}","image":"https://media.example/foto.jpg"}</script>
        </head><body><section class="body-content"><p>Primer párrafo de la nota.</p><p>Leé también: otra nota</p><p>Segundo párrafo.</p></section></body></html>`;
    t.mock.method(globalThis, 'fetch', async (url: string) =>
        new Response(url.endsWith('-n1') ? article : listing, { status: 200 }));

    const scraper: any = new Minuto1Scraper();
    scraper.loadScrapeSettings = async () => {};
    scraper.baseUrl = 'https://www.minutouno.com/politica';
    const articles = await scraper.scrape(3);

    assert.equal(articles.length, 1);
    assert.equal(articles[0].title, 'Una nota de hoy');
    assert.equal(articles[0].section, 'Politica');
    assert.equal(articles[0].content, 'Primer párrafo de la nota.\n\nSegundo párrafo.');
    assert.equal(articles[0].imageUrl, 'https://media.example/foto.jpg');
});
