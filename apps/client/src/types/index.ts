export interface AiDecisionsTrace {
    imageProtagonist?: string | null;
    smartQueries?: string[];
    searchExecutions?: Array<{
        query: string;
        google?: { url: string; resultCount: number };
        bing?: { url: string; resultCount: number };
    }>;
    imageScoring?: Array<{
        url: string;
        score: number;
        reason: string;
        sourceEngine?: 'google' | 'bing' | 'dalle' | 'original' | string;
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
