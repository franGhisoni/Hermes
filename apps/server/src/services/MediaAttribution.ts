// The rewrite prompts forbid naming the source outlet, but the model does not
// always obey and a failed rewrite falls back to the scraped text. This is the
// last pass before a note leaves Hermes: it removes "le dijo a Clarín",
// "según informó La Nación", "(NA)", "Fuente: Infobae" and the like.

const OUTLETS = [
    'Clar[ií]n', 'La Naci[oó]n', 'Infobae', 'TN', 'Todo Noticias', 'C5N', '[ÁA]mbito(?: Financiero)?',
    '(?:El )?Cronista(?: Comercial)?', 'P[aá]gina\\s?/?\\s?12', 'MDZ(?: Online)?', 'Minuto ?Uno', 'Minuto1',
    'La Pol[ií]tica Online', 'LPO', 'El Destape', 'El Diario de La Pampa', 'Noticias Argentinas', 'NA',
    'T[eé]lam', 'Reuters', 'AFP', 'EFE', 'Perfil', 'Letra P', 'Infocielo', 'La Tecla', 'El Diario Sur',
    'Avellaneda Hoy', 'Diario Conurbano', 'El Term[oó]metro(?: Web)?', 'La Defensa(?: de Lan[uú]s)?',
    'InfoRegi[oó]n', 'Lomas Conectado', 'LN\\+', 'A24', 'Radio Mitre', 'Cadena 3', 'Diario Popular', 'Cr[oó]nica',
];
const OUTLET = `(?:(?:el |los |la |diario |portal |sitio |medio |agencia |canal |(?:la )?radio )*(?:${OUTLETS.join('|')}))`;
// Case-sensitive on purpose: "la Nación" (the state) or "na" inside a word
// must not match. Outlets also match only as whole words.
const B = '(?<![\\p{L}\\d])';
const E = '(?![\\p{L}\\d])';

const SPEECH = '(?:dijo|dice|cont[oó]|confirm[oó]|asegur[oó]|afirm[oó]|explic[oó]|revel[oó]|indic[oó]|precis[oó]|detall[oó]|admiti[oó]|reconoci[oó]|anticip[oó]|sostuvo|se[ñn]al[oó]|coment[oó]|manifest[oó]|expres[oó]|declar[oó]|advirti[oó]|aclar[oó]|agreg[oó]|remarc[oó]|consider[oó]|relat[oó]|confi[oó]|asever[oó]|insisti[oó]|destac[oó]|apunt[oó]|plante[oó]|subray[oó])';

const rules: Array<[RegExp, string]> = [
    // "le confirmó a La Nación" / "dijo en diálogo con TN" -> "confirmó" / "dijo"
    [new RegExp(`${B}(le|les)\\s+(${SPEECH})\\s+a\\s+${OUTLET}${E}`, 'gu'), '$2'],
    [new RegExp(`${B}(${SPEECH})(?:\\s+(?:esta semana|este (?:lunes|martes|miércoles|jueves|viernes|sábado|domingo)|hoy))?\\s+(?:en (?:diálogo|dialogo|declaraciones|una entrevista|entrevista|conversación|conversacion)\\s+(?:con|a)|ante|a)\\s+${OUTLET}${E}`, 'gu'), '$1'],
    // ", en diálogo con Clarín," / "En declaraciones a Radio Mitre, ..."
    [new RegExp(`,?\\s*${B}[Ee]n (?:diálogo|dialogo|declaraciones|una entrevista|entrevista|conversación|conversacion|charla)\\s+(?:exclusiva\\s+)?(?:con|a)\\s+${OUTLET}${E}\\s*,?`, 'gu'), ' '],
    // "según informó La Nación" / "según pudo saber Clarín" / "según publicó Infobae"
    [new RegExp(`${B}([Ss])eg[uú]n (?:inform[oó]|public[oó]|revel[oó]|consign[oó]|indic[oó]|pudo (?:saber|confirmar|reconstruir)|supo|averigu[oó]|reconstruy[oó]|detall[oó]|difundi[oó])\\s+${OUTLET}${E}`, 'gu'), '$1egún trascendió'],
    [new RegExp(`${B}([Ss])eg[uú]n\\s+${OUTLET}${E}`, 'gu'), '$1egún trascendió'],
    // "consultado por La Nación," / "ante la consulta de Clarín,"
    [new RegExp(`,?\\s*${B}(?:[Cc]onsultad[oa]s? por|[Aa]nte (?:la )?consulta de|a pedido de)\\s+${OUTLET}${E}\\s*,?`, 'gu'), ' '],
    // "como adelantó Clarín," / "tal como informó La Nación,"
    [new RegExp(`,?\\s*${B}(?:[Tt]al )?(?:[Cc]omo) (?:lo )?(?:adelant[oó]|inform[oó]|public[oó]|revel[oó]|anticip[oó]|consign[oó])\\s+${OUTLET}${E}\\s*,?`, 'gu'), ' '],
    // "fuentes consultadas por Infobae" -> "fuentes consultadas"
    [new RegExp(`(consultad[oa]s?|citad[oa]s?|accedi[oó])\\s+(?:por|a)\\s+${OUTLET}${E}`, 'gu'), '$1'],
    // Agency tags such as "(NA)", "(EFE)", "(Télam)"
    [new RegExp(`\\s*\\((?:${OUTLETS.join('|')})\\)`, 'gu'), ''],
];

// Whole paragraphs at the end that only credit the source.
const CREDIT_PARAGRAPH = new RegExp(
    `<p[^>]*>\\s*(?:<(?:strong|em|b|i)>\\s*)*(?:Fuentes?\\s*:|Con informaci[oó]n de\\b|Informaci[oó]n de\\b|V[ií]a\\s*:|Nota publicada (?:originalmente )?en\\b|Publicad[oa] (?:originalmente )?en\\b)[^<]*(?:<\\/(?:strong|em|b|i)>[^<]*)*<\\/p>\\s*$`,
    'iu'
);
const CREDIT_LINE = /\n\s*(?:Fuentes?\s*:|Con informaci[oó]n de\b|Informaci[oó]n de\b|V[ií]a\s*:)[^\n]*\s*$/iu;

/** Removes mentions of the outlet the note was taken from. Safe on HTML and plain text. */
export function stripMediaAttributions(text: string): string {
    if (!text) return text;
    let result = text;
    for (const [pattern, replacement] of rules) result = result.replace(pattern, replacement);
    let previous: string;
    do {
        previous = result;
        result = result.replace(CREDIT_PARAGRAPH, '').replace(CREDIT_LINE, '');
    } while (result !== previous);
    return result
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\s+([,.;:])/g, '$1')
        .replace(/,\s*,/g, ',')
        .replace(/(<p[^>]*>)\s+/g, '$1')
        .replace(/,(\s*<\/p>)/g, '.$1')
        .trim();
}
