import { LocalNewsScraper, LOCAL_NEWS_CONFIGS } from './LocalNewsScraper';

export class ElDiarioSurScraper extends LocalNewsScraper {
    constructor() { super(LOCAL_NEWS_CONFIGS.ElDiarioSur); }
}

export class LaUnionScraper extends LocalNewsScraper {
    constructor() { super(LOCAL_NEWS_CONFIGS.LaUnion); }
}

export class DiarioConurbanoScraper extends LocalNewsScraper {
    constructor() { super(LOCAL_NEWS_CONFIGS.DiarioConurbano); }
}

export class ElTermometroWebScraper extends LocalNewsScraper {
    constructor() { super(LOCAL_NEWS_CONFIGS.ElTermometroWeb); }
}

export class AvellanedaHoyScraper extends LocalNewsScraper {
    constructor() { super(LOCAL_NEWS_CONFIGS.AvellanedaHoy); }
}

export class LaTeclaInfoScraper extends LocalNewsScraper {
    constructor() { super(LOCAL_NEWS_CONFIGS.LaTeclaInfo); }
}

export class InfocieloScraper extends LocalNewsScraper {
    constructor() { super(LOCAL_NEWS_CONFIGS.Infocielo); }
}

export class LaPoliticaOnlineScraper extends LocalNewsScraper {
    constructor() { super(LOCAL_NEWS_CONFIGS.LaPoliticaOnline); }
}

export class LetraPScraper extends LocalNewsScraper {
    constructor() { super(LOCAL_NEWS_CONFIGS.LetraP); }
}

export class LaDefensaScraper extends LocalNewsScraper {
    constructor() { super(LOCAL_NEWS_CONFIGS.LaDefensa); }
}
