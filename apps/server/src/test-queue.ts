import 'dotenv/config';
import { QueueService } from './services/QueueService';

async function main() {
    console.log('Testing Queue System...');
    const queueService = new QueueService();

    // Add a test job
    await queueService.addScrapeJob('Clarin', 'https://www.clarin.com');

    console.log('Job added. Keeping process alive to wait for worker...');

    // Keep alive for 120s to allow worker to process (AI is slow)
    setTimeout(() => {
        console.log('Test finished.');
        process.exit(0);
    }, 120000);
}

main();
