import { BlockedPersonAction, EditorialRuleMatchType } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface EditorialEvaluation {
    originalScore: number;
    effectiveScore: number;
    style: string;
    matchedRules: Array<{ id: string; name: string; matchType: EditorialRuleMatchType }>;
    matchedPeople: Array<{
        id: string;
        name: string;
        action: BlockedPersonAction;
        scoreWhenMatched: number;
        matchedTerm: string;
    }>;
    publicationBlocked: boolean;
    publicationBlockReason: string | null;
}

export interface EditorialArticleContext {
    title: string;
    content: string;
    section?: string | null;
    location?: string | null;
    score: number;
}

export function buildEditorialData(evaluation: EditorialEvaluation) {
    return {
        originalScore: evaluation.originalScore,
        matchedRules: evaluation.matchedRules,
        matchedPeople: evaluation.matchedPeople.map(person => ({
            id: person.id,
            name: person.name,
            action: person.action,
            matchedTerm: person.matchedTerm
        })),
        style: evaluation.style,
        publicationBlocked: evaluation.publicationBlocked,
        evaluatedAt: new Date().toISOString()
    };
}

/**
 * Resolves the tenant's editorial policy before an article is saved or sent.
 * Rules use typed dimensions today, while LOCATION is already part of the
 * contract so a future location detector can feed the same evaluator.
 */
export class EditorialService {
    async evaluate(context: EditorialArticleContext): Promise<EditorialEvaluation> {
        const [rules, people] = await Promise.all([
            prisma.editorialRule.findMany({
                where: { active: true },
                orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]
            }),
            prisma.blockedPerson.findMany({
                where: { active: true },
                orderBy: { name: 'asc' }
            })
        ]);

        const matchedRules = rules
            .filter(rule => this.matchesRule(rule, context))
            .map(rule => ({ id: rule.id, name: rule.name, matchType: rule.matchType }));

        const haystack = this.normalizeForMatching(`${context.title}\n${context.content}`);
        const matchedPeople = people.flatMap(person => {
            const terms = [person.name, ...person.aliases];
            const matchedTerm = terms.find(term => this.containsTerm(haystack, term));
            if (!matchedTerm) return [];
            return [{
                id: person.id,
                name: person.name,
                action: person.action,
                scoreWhenMatched: person.scoreWhenMatched,
                matchedTerm
            }];
        });

        const scoreCaps = matchedPeople
            .filter(person => person.action === 'LOWER_SCORE')
            .map(person => Math.min(10, Math.max(1, person.scoreWhenMatched)));
        const effectiveScore = scoreCaps.length > 0
            ? Math.min(context.score, ...scoreCaps)
            : context.score;
        const blockingPeople = matchedPeople.filter(person => person.action === 'BLOCK_PUBLICATION');
        const publicationBlocked = blockingPeople.length > 0;

        return {
            originalScore: context.score,
            effectiveScore,
            style: this.buildStyle(matchedRules, rules),
            matchedRules,
            matchedPeople,
            publicationBlocked,
            publicationBlockReason: publicationBlocked
                ? `Persona configurada para no publicar: ${blockingPeople.map(person => person.name).join(', ')}.`
                : null
        };
    }

    private matchesRule(rule: {
        matchType: EditorialRuleMatchType;
        section: string | null;
        minScore: number | null;
        maxScore: number | null;
        location: string | null;
    }, context: EditorialArticleContext): boolean {
        switch (rule.matchType) {
            case 'GLOBAL':
                return true;
            case 'SECTION':
                return Boolean(rule.section && this.sameValue(rule.section, context.section));
            case 'SCORE_RANGE':
                return (rule.minScore == null || context.score >= rule.minScore)
                    && (rule.maxScore == null || context.score <= rule.maxScore);
            case 'LOCATION':
                return Boolean(rule.location && this.sameValue(rule.location, context.location));
            default:
                return false;
        }
    }

    private buildStyle(
        matchedRules: Array<{ id: string; name: string; matchType: EditorialRuleMatchType }>,
        allRules: Array<{ id: string; name: string; styleInstruction: string }>
    ): string {
        if (matchedRules.length === 0) return 'neutral';
        const instructions = matchedRules
            .map(match => allRules.find(rule => rule.id === match.id)?.styleInstruction.trim())
            .filter((instruction): instruction is string => Boolean(instruction));
        return instructions.length > 0
            ? instructions.map((instruction, index) => `Regla editorial ${index + 1}:\n${instruction}`).join('\n\n')
            : 'neutral';
    }

    private sameValue(left: string, right?: string | null): boolean {
        return Boolean(right && this.normalizeForMatching(left) === this.normalizeForMatching(right));
    }

    private containsTerm(haystack: string, term: string): boolean {
        const normalized = this.normalizeForMatching(term);
        if (normalized.length < 3) return false;
        return ` ${haystack} `.includes(` ${normalized} `);
    }

    private normalizeForMatching(value: string): string {
        return value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim()
        ;
    }
}
