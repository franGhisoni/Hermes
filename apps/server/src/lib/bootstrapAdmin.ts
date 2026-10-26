import bcrypt from 'bcrypt';
import { prisma } from './prisma';

/**
 * Creates the first admin from ADMIN_USER / ADMIN_PASS so a fresh environment can log in.
 * An existing user with that name is never touched, so changing the password later in the app sticks.
 */
export async function bootstrapAdmin(): Promise<void> {
    const username = process.env.ADMIN_USER?.trim();
    const password = process.env.ADMIN_PASS;
    if (!username || !password) return;

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return;

    await prisma.user.create({
        data: { username, passwordHash: await bcrypt.hash(password, 10), role: 'ADMIN' }
    });
    console.log(`[bootstrapAdmin] Created admin user "${username}".`);
}
