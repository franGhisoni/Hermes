import { Client } from 'pg';
import 'dotenv/config';

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    console.log('Testing connection to:', process.env.DATABASE_URL);
    try {
        await client.connect();
        console.log('Connected successfully!');
        const res = await client.query('SELECT NOW()');
        console.log('Result:', res.rows[0]);
        await client.end();
    } catch (err: any) {
        console.error('Connection error:', err.message);
        console.error('Code:', err.code);
        console.error('Detail:', err.detail);
    }
}

main();
