/**
 * Revisa el token de un usuario del sistema de Meta y, si se pide, publica una
 * placa de prueba. El token se pega sin que se vea en pantalla y no se guarda.
 *
 *   npx tsx scripts/meta-check.ts               → lista páginas e Instagram y arma las variables
 *   npx tsx scripts/meta-check.ts --publicar ID → además publica una prueba en esa página
 *   --mostrar-tokens                            → imprime los tokens de página para Railway
 *   --si                                        → publica sin preguntar (para correrlo sin terminal)
 */
import { createInterface } from 'node:readline';
import { MetaPublisher, defineTheme, renderCard } from '../src/lib/news-social';

const GRAPH = 'https://graph.facebook.com/v21.0';

interface Page {
    id: string;
    name: string;
    access_token?: string;
    tasks?: string[];
    instagram_business_account?: { id: string; username?: string };
}

function askHidden(question: string): Promise<string> {
    return new Promise(resolve => {
        const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        // Oculta lo que se escribe: solo se muestra la pregunta.
        (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
            if (s.includes(question)) process.stdout.write(s);
        };
        rl.question(question, answer => {
            rl.close();
            process.stdout.write('\n');
            resolve(answer.trim());
        });
    });
}

function ask(question: string): Promise<string> {
    return new Promise(resolve => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
    });
}

async function graph<T>(path: string, token: string): Promise<T> {
    const url = new URL(`${GRAPH}/${path}`);
    url.searchParams.set('access_token', token);
    const res = await fetch(url);
    const json = await res.json() as T & { error?: { message: string } };
    if (json.error) throw new Error(json.error.message);
    return json;
}

async function main() {
    const publishIndex = process.argv.indexOf('--publicar');
    const publishPageId = publishIndex > -1 ? process.argv[publishIndex + 1] : undefined;

    const token = process.env.META_SYSTEM_TOKEN || process.env.IDENTIFICADOR_META || await askHidden('Pegá el token del usuario del sistema (no se ve al escribir): ');
    if (!token) throw new Error('No se ingresó ningún token.');

    const me = await graph<{ id: string; name: string }>('me?fields=id,name', token);
    console.log(`\n✔ Token válido: ${me.name} (${me.id})`);

    const { data: pages } = await graph<{ data: Page[] }>(
        'me/accounts?fields=id,name,access_token,tasks,instagram_business_account{id,username}&limit=100',
        token,
    );
    if (pages.length === 0) {
        console.log('\n✖ El usuario del sistema no tiene páginas asignadas. Asignalas en Business Suite → Usuarios del sistema.');
        return;
    }

    console.log(`\nPáginas que puede usar (${pages.length}):`);
    for (const p of pages) {
        const ig = p.instagram_business_account;
        console.log(`\n• ${p.name}`);
        console.log(`  META_PAGE_ID=${p.id}`);
        console.log(ig ? `  META_IG_USER_ID=${ig.id}   (@${ig.username ?? '?'})` : '  Instagram: no hay una cuenta profesional vinculada a esta página');
        console.log(`  Permisos en la página: ${(p.tasks ?? []).join(', ') || '—'}`);
    }

    if (process.argv.includes('--mostrar-tokens')) {
        console.log('\nPara cargar en Railway (META_PAGE_ACCESS_TOKEN es el token de la página, no vence):');
        console.log('No lo compartas ni lo pegues en chats.\n');
        for (const p of pages) {
            console.log(`# ${p.name}`);
            console.log(`META_PAGE_ID=${p.id}`);
            console.log(`META_PAGE_ACCESS_TOKEN=${p.access_token}`);
            if (p.instagram_business_account) console.log(`META_IG_USER_ID=${p.instagram_business_account.id}`);
            console.log('');
        }
    } else {
        console.log('\nPara ver los tokens de página (para Railway), corré de nuevo con --mostrar-tokens.');
    }

    if (!publishPageId) return;
    const page = pages.find(p => p.id === publishPageId);
    if (!page?.access_token) throw new Error(`La página ${publishPageId} no está entre las asignadas.`);

    const networks = page.instagram_business_account ? 'Facebook e Instagram' : 'Facebook';
    const ok = process.argv.includes('--si') ? 's' : await ask(`¿Publicar una placa de prueba en "${page.name}" (${networks})? Queda visible para tus seguidores. [s/N] `);
    if (ok.toLowerCase() !== 's') { console.log('Cancelado.'); return; }

    const image = await renderCard(
        { headline: 'Prueba de publicación *automática* de Sodium', kicker: 'Prueba' },
        defineTheme({ brandName: 'Sodium', template: 'banda', footer: 'sodium.ghisoni.com.ar' }),
    );
    const meta = new MetaPublisher({ pageId: page.id, pageAccessToken: page.access_token, igUserId: page.instagram_business_account?.id });

    const fb = await meta.publishFacebookPhoto(image, 'Prueba de publicación automática. Se puede borrar.');
    console.log(`\n✔ Facebook: ${fb.permalink ?? fb.postId ?? fb.id}`);

    if (page.instagram_business_account) {
        const url = await meta.hostImageOnFacebook(image);
        const ig = await meta.publishInstagramImage(url, 'Prueba de publicación automática. Se puede borrar.');
        console.log(`✔ Instagram: ${ig.permalink ?? ig.id}`);
    }
}

main().catch(err => {
    console.error(`\n✖ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
});
