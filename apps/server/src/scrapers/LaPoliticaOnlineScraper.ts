import { FetchNewsScraper } from './FetchNewsScraper';

// Paths under the site root that are not articles.
const NON_ARTICLE_ROOTS = new Set([
    'tools', 'newsletters-ar', 'mexico', 'paraguay', 'files', 'tag', 'tags', 'autor', 'autores', 'buscar'
]);

export class LaPoliticaOnlineScraper extends FetchNewsScraper {
    name = 'LaPoliticaOnline';
    baseUrl = 'https://www.lapoliticaonline.com';
    protected readonly origin = 'https://www.lapoliticaonline.com';
    protected readonly bodySelector = '#vsmcontent';

    // /politica/titulo-de-la-nota/ and, for columns, /nombre-del-autor/titulo-de-la-nota/
    protected isArticlePath(pathname: string): boolean {
        const match = pathname.match(/^\/([a-z0-9-]+)\/([a-z0-9-]+)\/?$/);
        if (!match || NON_ARTICLE_ROOTS.has(match[1])) return false;
        // Section pages have a single segment; a note slug is a whole headline.
        return match[2].split('-').length >= 4;
    }
}
