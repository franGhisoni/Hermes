import { NotificationLevel, NotificationSource, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface NotificationInput {
    level: NotificationLevel;
    source: NotificationSource;
    title: string;
    message: string;
    metadata?: Record<string, any>;
}

export class NotificationService {
    public async emit(input: NotificationInput) {
        try {
            await prisma.notification.create({
                data: {
                    level: input.level,
                    source: input.source,
                    title: input.title,
                    message: input.message,
                    metadata: input.metadata ?? undefined
                }
            });
        } catch (err) {
            console.error('[NotificationService] Failed to persist notification:', err);
        }
    }
}

export const notificationService = new NotificationService();
