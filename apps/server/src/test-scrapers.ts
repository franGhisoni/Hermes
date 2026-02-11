import { ClarinScraper } from './scrapers/ClarinScraper';
import { LaNacionScraper } from './scrapers/LaNacionScraper';
import { InfobaeScraper } from './scrapers/InfobaeScraper';
import { TNScraper } from './scrapers/TNScraper';
import { NAScraper } from './scrapers/NAScraper';

async function main() {
    console.log('Testing Multi-Source Scrapers (Direct Mode) - La Nacion Debug...');

    const sections = [
        { source: 'Clarin', url: 'https://www.clarin.com/politica', Scraper: ClarinScraper },
        { source: 'LaNacion', url: 'https://www.lanacion.com.ar/politica', Scraper: LaNacionScraper },
        { source: 'Infobae', url: 'https://www.infobae.com/politica/', Scraper: InfobaeScraper },
        // { source: 'TN', url: 'https://tn.com.ar/politica/', Scraper: TNScraper },
        // { source: 'NA', url: 'https://noticiasargentinas.com/politica', Scraper: NAScraper }
    ];

    for (const section of sections) {
        console.log(`\n--- Testing ${section.source} ---`);
        try {
            const scraper = new section.Scraper();
            // Override baseUrl for section testing
            scraper.baseUrl = section.url;

            console.log(`Navigating to ${section.url}...`);
            const articles = await scraper.scrape();

            console.log(`[${section.source}] Scraped ${articles.length} articles.`);
            articles.forEach((a, i) => {
                console.log(`  ${i + 1}. ${a.title.substring(0, 50)}... (${a.url})`);
            });
        } catch (error) {
            console.error(`[${section.source}] Failed:`, error);
        }
    }
}

main();
