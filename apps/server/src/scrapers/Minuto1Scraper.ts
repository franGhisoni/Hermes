import { FetchNewsScraper } from './FetchNewsScraper';

export class Minuto1Scraper extends FetchNewsScraper {
    name = 'Minuto1';
    baseUrl = 'https://www.minutouno.com';
    protected readonly origin = 'https://www.minutouno.com';
    protected readonly bodySelector = 'section.body-content';

    // /politica/titulo-de-la-nota-n6338110
    protected isArticlePath(pathname: string): boolean {
        return /^\/[a-z0-9-]+\/[^/]+-n\d+\/?$/.test(pathname);
    }
}
