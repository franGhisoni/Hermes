import { ClarinScraper } from './scrapers/ClarinScraper';

async function main() {
    console.log('Starting Test Scrape...');
    const scraper = new ClarinScraper();
    try {
        const articles = await scraper.scrape();
        console.log('Scrape Result:', JSON.stringify(articles, null, 2));
    } catch (err) {
        console.error('Scrape Failed', err);
    }
}

main();
