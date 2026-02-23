export interface Article {
    id: string;
    originalTitle: string;
    originalContent: string;
    originalUrl: string;
    originalImageUrl?: string;
    featureImageUrl?: string;
    imageCandidates?: string[];
    imageScores?: Record<string, number>;
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
