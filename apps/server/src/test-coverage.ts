import { ClarinScraper } from './scrapers/ClarinScraper';
import { LaNacionScraper } from './scrapers/LaNacionScraper';
import { InfobaeScraper } from './scrapers/InfobaeScraper';

async function main() {
    // Pick one scraper to test deeply or test all with small limits
    // Test Infobae first
    const scraper = new InfobaeScraper();

    // We want to verify it visits sections.
    // Set limit to 10. Homepage usually gives 5. So it MUST go to sections to get 10.
    const LIMIT = 10;

    console.log(`Testing ${scraper.name} with limit ${LIMIT}...`);
    try {
        const articles = await scraper.scrape(LIMIT);
        console.log(`[${scraper.name}] Scraped ${articles.length} articles.`);

        // Count unique sources roughly
        const uniqueUrls = new Set(articles.map(a => a.url));
        console.log(`Unique URLs: ${uniqueUrls.size}`);

        articles.forEach((a, i) => {
            console.log(`${i + 1}. [${a.section || 'No Section'}] ${a.title.substring(0, 30)}... - ${a.url}`);
        });

        if (articles.length >= LIMIT) {
            console.log('SUCCESS: Reached limit.');
        } else {
            console.log('WARNING: Did not reach limit (might be due to network or not enough links).');
        }

    } catch (e) {
        console.error(e);
    }
}

main();
