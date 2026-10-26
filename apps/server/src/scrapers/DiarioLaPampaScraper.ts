import { FetchNewsScraper } from './FetchNewsScraper';

export class DiarioLaPampaScraper extends FetchNewsScraper {
    name = 'DiarioLaPampa';
    baseUrl = 'https://www.eldiariodelapampa.com.ar';
    protected readonly origin = 'https://www.eldiariodelapampa.com.ar';
    protected readonly bodySelector = 'div.texto';

    // /la-pampa/82238/titulo-de-la-nota
    protected isArticlePath(pathname: string): boolean {
        return /^\/[a-z0-9-]+\/\d+\/[^/]+\/?$/i.test(pathname);
    }

    // The site publishes dates as dd-mm-yyyy, with no time.
    protected parseDate(raw: string): Date | null {
        const match = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
        if (!match) return super.parseDate(raw);
        const [, day, month, year] = match;
        const date = new Date(`${year}-${month}-${day}T12:00:00-03:00`);
        return isNaN(date.getTime()) ? null : date;
    }
}
