import { PromptConfig, PromptType } from '@prisma/client';
import { prisma } from '../lib/prisma';

export class PromptService {

    async getPrompts() {
        return prisma.promptConfig.findMany();
    }

    async getPromptByType(type: PromptType) {
        return prisma.promptConfig.findFirst({
            where: { type }
        });
    }

    async getPromptByName(name: string) {
        return prisma.promptConfig.findFirst({
            where: { name }
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
- Bajo ningún concepto menciones nombres de diarios o agencias: Clarín, La Nación, Infobae, TN, C5N, Ámbito, Cronista, Página/12, MDZ, MDZ Online, Noticias Argentinas, NA, Télam, Reuters, AP, AFP, EFE.
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

        // Rewrite Vorknews (SEO HTML)
        const vorknewsRewrite = await this.getPromptByType('REWRITE_VORKNEWS');
        if (!vorknewsRewrite) {
            await this.createPrompt('Vorknews / Política del Sur (SEO HTML)', 'REWRITE_VORKNEWS',
                `Sos un redactor periodístico y especialista en SEO para el portal de noticias "Política del Sur" (portal líder del Gran Buenos Aires y la Provincia). Reescribí el siguiente artículo para que sea 100% original, atractivo, de alto impacto y optimizado para posicionamiento en motores de búsqueda (SEO), conservando toda la información factual.

ESTILO PERIODÍSTICO
- Neutral, dinámico, riguroso, en español rioplatense periodístico.
- Tono informativo adaptado a la audiencia del conurbano bonaerense y la provincia de Buenos Aires.

ESTRUCTURA SEO Y CÓDIGO HTML
- El contenido del cuerpo (campo "content") DEBE estar formateado en CÓDIGO FUENTE HTML listo para insertar directamente en el editor (modo "Fuente HTML").
- Usá etiquetas semánticas:
  * Párrafos claros encerrados en <p>...</p>.
  * Subtítulos informativos con <h2>...</h2> intercalados cada 2 o 3 párrafos, que contengan palabras clave relevantes de la noticia.
  * Resaltá nombres de figuras clave, datos duros, cifras y conceptos determinantes con <strong>...</strong> para facilitar la lectura rápida y mejorar el rastreo SEO.
  * Si hay declaraciones textuales extensas, usá <blockquote>...</blockquote>.
  * PROHIBIDO usar <h1> (el título ya actúa como H1).
  * PROHIBIDO usar formato Markdown (no uses **, ##, ni guiones de lista markdown; usá etiquetas HTML puras <p>, <h2>, <ul><li> si aplica).

CAMPOS REQUERIDOS EN EL JSON
- "title": Título atractivo, claro, optimizado para SEO (ideal entre 50 y 70 caracteres, con la entidad o hecho principal al inicio, sin comillas al empezar).
- "volanta": Sobretítulo / volanta breve en mayúsculas que ubique el tema o la localidad (ej: "CONURBANO BONAERENSE", "LANÚS", "LEGISLATURA BONAERENSE", "JUDICIALES", "GREMIALES").
- "bajada": Copete periodístico de 1 a 2 oraciones (texto plano sin etiquetas HTML) que amplíe el titular con los datos fundamentales de la noticia.
- "content": Cuerpo completo de la nota en HTML válido (<p>, <h2>, <strong>, etc.).
- "tags": Entre 4 y 6 palabras o frases clave separadas por comas (ej: "Lanús, Julián Álvarez, Conurbano bonaerense, Obras públicas").

REGLAS INVIOLABLES
- NUNCA menciones medios fuente ni competencia (Clarín, La Nación, Infobae, TN, C5N, Ámbito, Cronista, Página/12, MDZ, Télam, NA, Noticias Argentinas, Reuters, EFE, etc.).
- Eliminá firmas ajenas, fechas de cables de agencia y datelines de inicio ("Buenos Aires, 15 de marzo (NA)...").
- Citas textuales: mantené lo dicho entre comillas verbatim, cambiando atribuciones de medios ajenos por fórmulas neutrales ("afirmó", "expresó", "señaló").
- Prohibido cualquier carácter fuera del alfabeto latino + tildes/ñ/¿¡.
- Respuesta en formato JSON estricto sin code fences de markdown.

SALIDA (JSON ESTRICTO):
{
  "title": "Nuevo título optimizado",
  "volanta": "VOLANTA TEMÁTICA",
  "bajada": "Bajada o copete conciso sin HTML.",
  "content": "<p>Párrafo inicial con <strong>datos clave</strong>...</p><h2>Subtítulo descriptivo con keywords</h2><p>Segundo párrafo...</p>",
  "tags": "Etiqueta 1, Etiqueta 2, Etiqueta 3"
}

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

        // Social Media Copy
        const socialCopy = await this.getPromptByType('SOCIAL_COPY');
        if (!socialCopy) {
            await this.createPrompt('Copy para Redes Sociales (Política del Sur)', 'SOCIAL_COPY',
                `Sos un community manager y redactor de redes sociales experto en medios de noticias argentinos (estilo Política del Sur / Gran Buenos Aires).
A partir de la siguiente noticia, generá los textos (copys) optimizados para publicar en redes sociales.

Título original: {{title}}
Contenido:
{{content}}

Instrucciones:
1. "twitter": Texto para X (Twitter). Máximo 260 caracteres. Directo, impactante, con gancho o pregunta, 1-2 emojis sobrios y 2 hashtags clave.
2. "instagram": Texto para Instagram (feed / carrusel). Gancho inicial en mayúsculas/destacado, 2 o 3 párrafos cortos explicando lo principal, llamado a la acción ("Comentá qué opinás", "Leé la nota completa en el link de la bio"), y un bloque de hashtags al final.
3. "facebook": Texto para Facebook. Tono informativo y cercano, 2 párrafos breves, enlace al medio y llamado a debatir en comentarios.
4. "hashtags": String con 5 a 8 hashtags separados por espacios relevantes a la temática y localidad.

Responde ÚNICAMENTE un JSON estricto con esta estructura exacta:
{
  "twitter": "...",
  "instagram": "...",
  "facebook": "...",
  "hashtags": "#Politica #Lanus #..."
}`);
        }
    }
}
