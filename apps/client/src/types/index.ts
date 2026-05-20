export interface AiDecisionsTrace {
    imageProtagonist?: string | null;
    smartQueries?: string[];
    searchExecutions?: Array<{
        query: string;
        providerUrl: string;
        resultCount: number;
    }>;
    imageScoring?: Array<{
        url: string;
        score: number;
        reason: string;
        // 'searxng-google' / 'searxng-bing' / 'searxng-duckduckgo' / 'searxng-qwant'
        // (or 'dalle' / 'original' for fallbacks). Legacy values 'google' / 'bing'
        // may appear in older articles persisted before the SearXNG migration.
        sourceEngine?: string;
    }>;
    fallbackUsed?: 'dalle' | 'original' | null;
}

export interface Article {
    id: string;
    originalTitle: string;
    originalContent: string;
    originalUrl: string;
    originalImageUrl?: string;
    featureImageUrl?: string;
    imageCandidates?: string[];
    imageScores?: Record<string, number>;
    aiDecisions?: AiDecisionsTrace | null;
    rewrittenTitle?: string;
    rewrittenContent?: string;
    interestScore?: number;
    status: 'PENDING' | 'APPROVED' | 'PUBLISHED' | 'REJECTED';
    createdAt: string;
    source?: {
        name: string;
    };
    section?: string;
}

export interface Notification {
    id: string;
    level: 'INFO' | 'WARN' | 'ERROR';
    source: 'SCRAPER' | 'WORKFLOW' | 'PUBLISH' | 'SYSTEM';
    title: string;
    message: string;
    metadata?: Record<string, any> | null;
    readAt?: string | null;
    createdAt: string;
}

export interface ScrapeRun {
    id: string;
    source: string;
    sectionName?: string | null;
    path?: string | null;
    requestedLimit: number;
    scrapedCount: number;
    processedCount: number;
    status: 'RUNNING' | 'SUCCESS' | 'EMPTY' | 'ERROR';
    trigger: 'MANUAL' | 'SCHEDULED';
    startedAt: string;
    finishedAt?: string | null;
    durationMs?: number | null;
    errorMessage?: string | null;
}
