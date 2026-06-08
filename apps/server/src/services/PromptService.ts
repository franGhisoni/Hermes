import { PrismaClient, PromptConfig, PromptType } from '@prisma/client';

const prisma = new PrismaClient();

export class PromptService {

    async getPrompts() {
        return prisma.promptConfig.findMany();
    }

    async getPromptByType(type: PromptType) {
        return prisma.promptConfig.findFirst({
            where: { type }
        });
    }

    async updatePrompt(id: string, template: string) {
        return prisma.promptConfig.update({
            where: { id },
            data: { template }
        });
    }

    async createPrompt(name: string, type: PromptType, template: string) {
        return prisma.promptConfig.create({
            data: { name, type, template }
        });
    }

    async ensureDefaultPrompts() {
        // Rewrite
        const rewrite = await this.getPromptByType('REWRITE');
        if (!rewrite) {
            await this.createPrompt('Default Rewrite', 'REWRITE',
                `Sos un editor de noticias profesional. Reescribí el siguiente artículo para que sea único, atractivo y libre de plagio, conservando TODA la información factual.

ESTILO
- Neutral, profesional, estilo NYT en español rioplatense.
- Mantené aproximadamente la misma longitud que el original.

IDIOMA — REGLA INVIOLABLE
- La respuesta DEBE estar 100% en español. Ni una sola palabra ni un solo carácter en otro alfabeto.
- Prohibido cualquier carácter fuera del alfabeto latino + tildes/ñ/¿¡ (NO cirílico, NO griego, NO chino, NO árabe, NO emojis decorativos).
- Si tenés dudas sobre una palabra, escribila en español o eliminala.

CITAS
- NO parafrasees ni alteres nada que esté entre comillas ("..."). Las comillas se mantienen verbatim.
- Si una cita atribuye al medio fuente ("le dijo a Clarín", "según informó La Nación", "en diálogo con TN", etc.), reemplazá la atribución por una neutral: "nos comentó", "afirmó", "dijo el entrevistado", "según trascendió".

MEDIOS — NUNCA NOMBRAR LA FUENTE NI A LA COMPETENCIA
- Bajo ningún concepto menciones nombres de diarios o agencias: Clarín, La Nación, Infobae, TN, C5N, Ámbito, Cronista, Página/12, Noticias Argentinas, NA, Télam, Reuters, AP, AFP, EFE.
- Eliminá hashtags (#...) y arrobas (@usuario): son tags de redes o de medios.
- Si un párrafo entero es un tuit citado (formato típico: arroba + nombre + handle + fecha + texto), eliminá el párrafo completo. NO lo parafrasees: borralo.

DATELINES Y FIRMAS — LIMPIAR EL INICIO
- Si la nota empieza con un patrón tipo "Buenos Aires, 19 de abril (NA)." o "(Reuters)" o "(EFE)" o "BUENOS AIRES.-" eliminá esa apertura por completo.
- Si al inicio aparecen nombres sueltos en líneas separadas o seguidos por comas que no forman parte de la nota (firmas de redacción tipo "Rosana / Claudio / Jacqueline / Javier Blanco / Paola / Urias"), descartalos. Nunca los incorpores al texto.

CORCHETES — ELIMINAR SIEMPRE
- Cualquier texto entre corchetes [ ] que actúe como tag de autor, voz, sección o referencia interna ("[Patricia]", "[Continúa]", "[Lea también]", "[Foto]") debe eliminarse junto con los corchetes.
- Si una oración empieza con "[Nombre]" significa que ese nombre es el autor que habla; reformulá la oración manteniendo el contenido pero sin el tag.

MARCAS Y NOMBRES PROPIOS
- Si el TÍTULO original anonimiza una marca ("un importante hipermercado", "una conocida cadena", "una automotriz líder"), MANTENÉ esa anonimización en el cuerpo aunque el original la nombre más abajo. Reemplazá la marca por la misma fórmula genérica.
- Si el título original ya menciona la marca, podés conservarla.

SALIDA
- Devolvé un JSON estricto: { "title": "Nuevo título", "content": "Nuevo contenido" }
- Sin markdown, sin code fences, sin comentarios.

Título original: {{title}}
Contenido original:
{{content}}`);
        }

        // Interest
        const interest = await this.getPromptByType('INTEREST');
        if (!interest) {
            await this.createPrompt('Default Interest', 'INTEREST',
                `Rate the general public interest of this news article on a scale of 1 to 10.
            1 = Boring, niche, or local gossip.
            10 = Breaking global news, high impact, or viral potential.
            
            Title: {{title}}
            Content Snippet: {{content}}
            
            Return ONLY the number.`);
        }

        // Image Select
        const imageSelect = await this.getPromptByType('IMAGE_SELECT');
        if (!imageSelect) {
            await this.createPrompt('Default Image Selector', 'IMAGE_SELECT',
                `You are a photo editor for a digital news agency. You will receive a news article title, a content snippet, and candidate images.

Your job is to select the ONE best image for this article, or REJECT ALL if none are suitable.
Additionally, you must evaluate EVERY candidate image and assign it a score from 1 to 10 based on its quality, relevance, and lack of overlays.

REJECT an image (score it low, e.g. 1-3) if it has ANY of these problems:
- Text overlaid on the image (titles, headlines, captions, banners, zócalos)
- TV screen captures or studio shots with chyrons/lower thirds
- Visible logos or branding from media companies (e.g. "La Nación", "TN", "Clarín", "C5N", "NA", "Noticias Argentinas")
- Huge blue bars at the bottom with "NA" (very common in Argentinian news)
- Watermarks
- Extremely low quality, blurry, or heavily compressed
- Collages or composite images with multiple photos stitched together
- Generic stock photo illustrations that don't relate to the specific news story

PREFER images (score them high, e.g. 7-10) that are:
- Clean photojournalistic shots without overlays
- High quality, well-framed photos of people, events, or places relevant to the article
- Photos that could stand on their own without explanation

Return a JSON object: 
{ 
  "selectedIndex": number, 
  "scores": [number] // Array of scores (1-10) corresponding to each image candidate in the exact order they were provided
}
- Use 0-based index for the best image
- Use -1 if ALL images should be rejected (none are suitable, e.g. no score > 5)`);
        }
    }
}
