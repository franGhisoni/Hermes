import { FetchNewsScraper } from './FetchNewsScraper';

export class ElDestapeScraper extends FetchNewsScraper {
    name = 'ElDestape';
    baseUrl = 'https://www.eldestapeweb.com';
    protected readonly origin = 'https://www.eldestapeweb.com';
    protected readonly bodySelector = 'div.cuerpo';

    // /politica/titulo-de-la-nota-20261026174826 (the slug ends with a timestamp)
    protected isArticlePath(pathname: string): boolean {
        return /^\/[a-z0-9-]+\/[^/]+-\d{10,}\/?$/.test(pathname);
    }
}
