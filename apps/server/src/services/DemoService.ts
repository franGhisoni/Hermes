const demoDate = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

export const DEMO_TARGETS = [
    { id: 'demo-target-nyt', name: 'The New York Times', email: 'demo@nyt.hermes.example', createdAt: demoDate(240), updatedAt: demoDate(24) },
    { id: 'demo-target-forbes', name: 'Forbes', email: 'demo@forbes.hermes.example', createdAt: demoDate(220), updatedAt: demoDate(24) },
    { id: 'demo-target-wapo', name: 'The Washington Post', email: 'demo@washpost.hermes.example', createdAt: demoDate(180), updatedAt: demoDate(18) },
    { id: 'demo-target-bloomberg', name: 'Bloomberg', email: 'demo@bloomberg.hermes.example', createdAt: demoDate(140), updatedAt: demoDate(12) }
];

const DEMO_SOURCES = [
    { id: 'demo-source-nyt', name: 'The New York Times', url: 'https://www.nytimes.com', active: true },
    { id: 'demo-source-forbes', name: 'Forbes', url: 'https://www.forbes.com', active: true },
    { id: 'demo-source-wapo', name: 'The Washington Post', url: 'https://www.washingtonpost.com', active: true },
    { id: 'demo-source-bloomberg', name: 'Bloomberg', url: 'https://www.bloomberg.com', active: true }
];

const DEMO_SECTIONS = [
    { id: 'demo-section-politics', name: 'Politics', path: '/politics', filterCategoryId: 'demo-category-politics', filterCategory: { id: 'demo-category-politics', name: 'Politics' }, overrides: [] },
    { id: 'demo-section-business', name: 'Business', path: '/business', filterCategoryId: 'demo-category-business', filterCategory: { id: 'demo-category-business', name: 'Business' }, overrides: [] },
    { id: 'demo-section-technology', name: 'Technology', path: '/technology', filterCategoryId: 'demo-category-technology', filterCategory: { id: 'demo-category-technology', name: 'Technology' }, overrides: [] },
    { id: 'demo-section-world', name: 'World', path: '/world', filterCategoryId: 'demo-category-world', filterCategory: { id: 'demo-category-world', name: 'World' }, overrides: [] },
    { id: 'demo-section-culture', name: 'Culture', path: '/culture', filterCategoryId: 'demo-category-culture', filterCategory: { id: 'demo-category-culture', name: 'Culture' }, overrides: [] }
];

export const DEMO_FILTER_CATEGORIES = DEMO_SECTIONS.map(section => ({
    id: section.filterCategoryId!,
    name: section.name,
    sections: [section]
}));

const demoImage = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=82`;

const DEMO_ARTICLES = [
    {
        id: 'demo-article-1',
        originalTitle: 'The next era of intelligent newsrooms is already taking shape',
        rewrittenTitle: 'How intelligent newsrooms are changing the way stories are made',
        originalContent: 'A fictional demonstration article about the evolving relationship between journalists, data and automation in modern newsrooms.',
        rewrittenContent: 'Las redacciones más innovadoras están combinando criterio editorial, datos y automatización para trabajar con mayor velocidad sin perder profundidad. Esta nota ficticia muestra cómo Hermes puede acompañar cada etapa del proceso.',
        originalUrl: 'https://www.nytimes.com/demo/hermes-intelligent-newsrooms',
        originalImageUrl: demoImage('photo-1504711434969-e33886168f5c'),
        featureImageUrl: demoImage('photo-1504711434969-e33886168f5c'),
        interestScore: 9,
        status: 'APPROVED' as const,
        createdAt: demoDate(2),
        source: { name: 'The New York Times' },
        section: 'Technology'
    },
    {
        id: 'demo-article-2',
        originalTitle: 'Why the next decade of business will be built around trust',
        rewrittenTitle: 'La confianza se convierte en el activo central de las empresas',
        originalContent: 'A fictional business analysis prepared for the Hermes product demonstration.',
        rewrittenContent: 'Las compañías que puedan explicar sus decisiones, demostrar sus resultados y sostener conversaciones transparentes tendrán una ventaja creciente. La confianza ya no es solo reputación: también es infraestructura.',
        originalUrl: 'https://www.forbes.com/demo/hermes-trust-economy',
        originalImageUrl: demoImage('photo-1556761175-b413da4baf72'),
        featureImageUrl: demoImage('photo-1556761175-b413da4baf72'),
        interestScore: 8,
        status: 'PENDING' as const,
        createdAt: demoDate(5),
        source: { name: 'Forbes' },
        section: 'Business'
    },
    {
        id: 'demo-article-3',
        originalTitle: 'Cities rethink public space as more people work across borders',
        rewrittenTitle: 'Las ciudades rediseñan sus espacios para una vida más flexible',
        originalContent: 'A fictional international report created exclusively as safe demo content.',
        rewrittenContent: 'Desde Nueva York hasta Washington, los gobiernos locales están revisando cómo se usan las calles, los edificios y los servicios públicos. El cambio combina nuevas rutinas laborales con una búsqueda renovada de comunidad.',
        originalUrl: 'https://www.washingtonpost.com/demo/hermes-cities',
        originalImageUrl: demoImage('photo-1444723121867-7a241cacace9'),
        featureImageUrl: demoImage('photo-1444723121867-7a241cacace9'),
        interestScore: 7,
        status: 'PUBLISHED' as const,
        createdAt: demoDate(9),
        source: { name: 'The Washington Post' },
        section: 'World'
    },
    {
        id: 'demo-article-4',
        originalTitle: 'Markets watch a new generation of climate technologies',
        rewrittenTitle: 'La tecnología climática atrae nuevas inversiones',
        originalContent: 'A fictional market brief for demonstrating scoring, rewriting and image review.',
        rewrittenContent: 'La inversión en tecnología climática atraviesa una etapa de maduración. Los proyectos que combinan impacto medible, costos previsibles y capacidad de escala empiezan a diferenciarse con claridad.',
        originalUrl: 'https://www.bloomberg.com/demo/hermes-climate-tech',
        originalImageUrl: demoImage('photo-1497435334941-8c899ee9e8e9'),
        featureImageUrl: demoImage('photo-1497435334941-8c899ee9e8e9'),
        interestScore: 8,
        status: 'APPROVED' as const,
        createdAt: demoDate(13),
        source: { name: 'Bloomberg' },
        section: 'Business'
    },
    {
        id: 'demo-article-5',
        originalTitle: 'The museums building a more open digital future',
        rewrittenTitle: 'Los museos exploran una nueva relación con sus audiencias',
        originalContent: 'A fictional culture story that contains no client or production data.',
        rewrittenContent: 'Las instituciones culturales están probando formatos digitales, experiencias híbridas y nuevas formas de participación. El objetivo no es reemplazar la visita presencial, sino extenderla antes y después de cada exposición.',
        originalUrl: 'https://www.nytimes.com/demo/hermes-museums',
        originalImageUrl: demoImage('photo-1564399579883-451a5d44ec08'),
        featureImageUrl: demoImage('photo-1564399579883-451a5d44ec08'),
        interestScore: 6,
        status: 'PENDING' as const,
        createdAt: demoDate(18),
        source: { name: 'The New York Times' },
        section: 'Culture'
    },
    {
        id: 'demo-article-6',
        originalTitle: 'What the newest generation of tools means for creative work',
        rewrittenTitle: 'Las nuevas herramientas amplían las posibilidades del trabajo creativo',
        originalContent: 'A fictional technology article used only within the Hermes demonstration environment.',
        rewrittenContent: 'Las herramientas de asistencia creativa están cambiando la forma de investigar, ordenar ideas y preparar borradores. La decisión editorial sigue siendo humana, pero el trabajo previo puede ser más rápido y consistente.',
        originalUrl: 'https://www.forbes.com/demo/hermes-creative-tools',
        originalImageUrl: demoImage('photo-1516321318423-f06f85e504b3'),
        featureImageUrl: demoImage('photo-1516321318423-f06f85e504b3'),
        interestScore: 9,
        status: 'PUBLISHED' as const,
        createdAt: demoDate(26),
        source: { name: 'Forbes' },
        section: 'Technology'
    }
];

const DEMO_WORKFLOWS = [
    {
        id: 'demo-workflow-morning',
        name: 'Morning Brief — National Edition',
        section: '',
        sources: ['The New York Times', 'The Washington Post'],
        minScore: 7,
        targetCategory: 'Top Stories',
        cron: '0 8 * * 1-5',
        isActive: true,
        allowRepublish: true,
        articleWindowHours: 24,
        targets: [DEMO_TARGETS[0], DEMO_TARGETS[2]],
        runs: [{ id: 'demo-run-1', startedAt: demoDate(3), status: 'SUCCESS', targetsTotal: 2, targetsCovered: 2, targetsSkipped: 0, articlesUnique: 2, articlesRefilled: 0, summary: '2 publicaciones procesadas', errorMessage: null }]
    },
    {
        id: 'demo-workflow-business',
        name: 'Business & Markets Digest',
        section: 'Business',
        sources: ['Forbes', 'Bloomberg'],
        minScore: 8,
        targetCategory: 'Business',
        cron: '0 12 * * 1-5',
        isActive: true,
        allowRepublish: false,
        articleWindowHours: 12,
        targets: [DEMO_TARGETS[1], DEMO_TARGETS[3]],
        runs: [{ id: 'demo-run-2', startedAt: demoDate(8), status: 'PARTIAL', targetsTotal: 2, targetsCovered: 1, targetsSkipped: 1, articlesUnique: 1, articlesRefilled: 0, summary: '1 publicación procesada · 1 pendiente', errorMessage: null }]
    }
];

export function getDemoSources() {
    return DEMO_SOURCES;
}

export function getDemoSections() {
    return DEMO_SECTIONS;
}

export function getDemoFilterCategories() {
    return DEMO_FILTER_CATEGORIES;
}

export function getDemoTargets() {
    return DEMO_TARGETS;
}

export function getDemoWorkflows() {
    return DEMO_WORKFLOWS;
}

export function getDemoWorkflowRuns() {
    return DEMO_WORKFLOWS.flatMap(workflow => workflow.runs.map(run => ({ ...run, workflow: { id: workflow.id, name: workflow.name } })));
}

export function getDemoScrapeSchedules() {
    return [
        { id: 'demo-schedule-nyt', source: 'The New York Times', cron: '0 */2 * * *', isActive: true, createdAt: demoDate(300), updatedAt: demoDate(20) },
        { id: 'demo-schedule-forbes', source: 'Forbes', cron: '0 */4 * * *', isActive: true, createdAt: demoDate(280), updatedAt: demoDate(20) },
        { id: 'demo-schedule-wapo', source: 'The Washington Post', cron: '0 8,18 * * *', isActive: true, createdAt: demoDate(260), updatedAt: demoDate(20) }
    ];
}

export function getDemoNotifications() {
    return {
        items: [
            { id: 'demo-notification-1', level: 'INFO', source: 'WORKFLOW', title: 'Briefing listo', message: 'El flujo de demostración procesó 2 artículos correctamente.', metadata: null, readAt: null, createdAt: demoDate(3) },
            { id: 'demo-notification-2', level: 'INFO', source: 'SCRAPER', title: 'Fuentes actualizadas', message: 'Se revisaron 4 fuentes editoriales de demostración.', metadata: null, readAt: demoDate(2), createdAt: demoDate(5) }
        ],
        unreadCount: 1
    };
}

export function getDemoArticles(params: {
    page: number;
    limit: number;
    source?: string;
    section?: string;
    category?: string;
    status?: string;
    search?: string;
    sortBy?: 'date' | 'score';
    sortOrder?: 'desc' | 'asc';
}) {
    const search = params.search?.trim().toLowerCase();
    const filtered = DEMO_ARTICLES.filter(article => {
        if (params.source && params.source !== 'all' && article.source.name !== params.source) return false;
        if (params.status && params.status !== 'all' && article.status !== params.status) return false;
        if (params.section && params.section !== 'all' && article.section.toLowerCase() !== params.section.toLowerCase()) return false;
        if (params.category && params.category !== 'all') {
            const category = DEMO_FILTER_CATEGORIES.find(item => item.id === params.category);
            if (category && article.section !== category.name) return false;
        }
        if (search) {
            const haystack = [article.originalTitle, article.rewrittenTitle, article.originalContent, article.rewrittenContent, article.source.name, article.section].join(' ').toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    }).sort((a, b) => {
        const left = params.sortBy === 'score' ? a.interestScore : Date.parse(a.createdAt);
        const right = params.sortBy === 'score' ? b.interestScore : Date.parse(b.createdAt);
        return params.sortOrder === 'asc' ? left - right : right - left;
    });

    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, params.limit || 48);
    const total = filtered.length;
    const items = filtered.slice((page - 1) * limit, page * limit);
    return { items, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export function getDemoArticleById(id: string) {
    return DEMO_ARTICLES.find(article => article.id === id) || null;
}
