const ATTRIBUTION_PREFIX = 'Escritura asistida por inteligencia artificial. Fuente:';

export function sourceDisplayName(sourceName: string): string {
    const names: Record<string, string> = {
        ElDiarioSur: 'El Diario Sur', AvellanedaHoy: 'Avellaneda Hoy', LaUnion: 'La Unión',
        LaNacion: 'La Nación', LaPoliticaOnline: 'La Política Online', LetraP: 'Letra P',
        DiarioConurbano: 'Diario Conurbano', ElTermometroWeb: 'El Termómetro Web',
        LaTeclaInfo: 'La Tecla', Infocielo: 'Infocielo', LaDefensa: 'La Defensa de Lanús',
        Clarin: 'Clarín', Ambito: 'Ámbito', Cronista: 'El Cronista', Pagina12: 'Página/12'
    };
    return names[sourceName] || sourceName.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function appendAiAttribution(contentHtml: string, sourceName: string): string {
    if (contentHtml.includes(ATTRIBUTION_PREFIX)) return contentHtml;
    const escapedSource = sourceName.replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]!);
    return `${contentHtml.trim()}\n<p>${ATTRIBUTION_PREFIX} ${escapedSource}</p>`;
}
