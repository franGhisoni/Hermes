/** Marca para saber si un prompt de copys guardado ya pide el texto de la placa. */
export const CARD_PROMPT_MARKER = '"placa_titulo"';

/**
 * Pedido del texto de la placa (la imagen que el CMS publica en Facebook e
 * Instagram). Va en el prompt por defecto y se suma a los prompts guardados que no lo tienen.
 */
export const CARD_PROMPT_SECTION = `5. ${CARD_PROMPT_MARKER}: Titular para la PLACA (imagen) que acompaña el posteo. Máximo 12 palabras, sin punto final, sin emojis, sin hashtags. Tiene que entenderse solo, como un titular de portada. Encerrá entre asteriscos (*así*) de 2 a 5 palabras consecutivas que sean el dato más fuerte, para resaltarlas en color. Ejemplo: "El Concejo aprobó *el presupuesto 2027* tras seis horas".
6. "placa_volanta": Etiqueta corta para arriba del titular de la placa (1 a 3 palabras: tema, lugar o protagonista, ej. "POLÍTICA LOCAL", "SEGURIDAD", "DEPORTES").`;

export interface SocialCard {
    headline: string;
    kicker?: string;
}
