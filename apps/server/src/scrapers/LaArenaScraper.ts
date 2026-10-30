import { FetchNewsScraper } from './FetchNewsScraper';

export class LaArenaScraper extends FetchNewsScraper {
    name = 'LaArena';
    baseUrl = 'https://www.laarena.com.ar';
    protected readonly origin = 'https://www.laarena.com.ar';
    protected readonly bodySelector = 'div.articulo__cuerpo';

    // /la-pampa/titulo-de-la-nota-202610300200 (ends in the publication timestamp)
    protected isArticlePath(pathname: string): boolean {
        return /^\/[a-z0-9-]+\/[^/]+-20\d{7,}\/?$/i.test(pathname);
    }

    // Notes without a photo share this blank white image.
    protected isPlaceholderImage(url: string): boolean {
        return url.includes('/102021/1633634144804.');
    }
}
