const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'feedback-test-secret';
const { prisma } = require('../dist/lib/prisma');
const { requireAuth, requireReadOnly } = require('../dist/middlewares/auth');
const router = require('../dist/routes/FeedbackRouter').default;

test('feedback API validates reports and enforces current user permissions', async t => {
    const reports = [];
    const originals = {
        findUnique: prisma.user.findUnique,
        findArticle: prisma.article.findUnique,
        create: prisma.feedbackReport.create,
        findMany: prisma.feedbackReport.findMany,
        updateMany: prisma.feedbackReport.updateMany,
    };
    const publication = { targetId: 'target-1', targetName: 'Medio original', targetEmail: 'notas@example.com', category: 'Política', sentAt: new Date('2026-10-06T12:00:00Z') };
    prisma.article.findUnique = async ({ where }) => {
        if (where.originalUrl === 'https://example.com/publicada') return { id: 'article-1', status: 'PUBLISHED', publications: [publication] };
        if (where.originalUrl === 'https://example.com/pendiente') return { id: 'article-2', status: 'PENDING', publications: [] };
        if (where.originalUrl === 'https://example.com/antigua') return { id: 'article-3', status: 'PUBLISHED', publications: [] };
        return null;
    };
    prisma.user.findUnique = async ({ where }) => ({ id: where.id, username: where.id, role: where.id.toUpperCase() });
    prisma.feedbackReport.create = async ({ data }) => {
        const report = { ...data, id: String(reports.length + 1), status: 'OPEN' };
        reports.push(report);
        return report;
    };
    prisma.feedbackReport.findMany = async () => reports;
    prisma.feedbackReport.updateMany = async ({ where, data }) => {
        const report = reports.find(item => item.id === where.id);
        if (report) Object.assign(report, data);
        return { count: report ? 1 : 0 };
    };
    const app = express();
    app.use(express.json());
    app.use('/api', requireAuth, requireReadOnly, router);
    const server = await new Promise(resolve => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        prisma.user.findUnique = originals.findUnique;
        prisma.article.findUnique = originals.findArticle;
        Object.assign(prisma.feedbackReport, { create: originals.create, findMany: originals.findMany, updateMany: originals.updateMany });
        await prisma.$disconnect();
    });
    const request = (role, method = 'GET', path = '/feedback', body) => fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${jwt.sign({ id: role, role: 'ADMIN' }, process.env.JWT_SECRET)}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    await t.test('anonymous users cannot access reports', async () => {
        assert.equal((await request(null)).status, 401);
    });
    await t.test('error report stores the authenticated author and normalized description', async () => {
        const response = await request('editor', 'POST', '/feedback', { kind: 'ERROR', message: ' Error de imagen ', articleUrl: 'https://example.com/nota', userId: 'admin' });
        assert.equal(response.status, 201);
        const report = await response.json();
        assert.equal(report.userId, 'editor');
        assert.equal(report.message, 'Error de imagen');
    });
    await t.test('suggestions do not require a note link', async () => {
        assert.equal((await request('editor', 'POST', '/feedback', { kind: 'SUGGESTION', message: 'Mejorar filtros' })).status, 201);
    });
    await t.test('invalid payloads are rejected without creating tickets', async () => {
        const before = reports.length;
        for (const body of [
            { kind: 'ERROR', message: 'Falla sin enlace' },
            { kind: 'ERROR', message: 'Falla', articleUrl: 'javascript:alert(1)' },
            { kind: 'SUGGESTION', message: ' ' },
            { kind: 'OTHER', message: 'Falla' },
            { kind: 'SUGGESTION', message: 'x'.repeat(2001) },
        ]) assert.equal((await request('editor', 'POST', '/feedback', body)).status, 400);
        assert.equal(reports.length, before);
    });
    await t.test('editor and demo cannot manage tickets even with an admin claim in their token', async () => {
        for (const role of ['editor', 'demo']) {
            assert.equal((await request(role)).status, 403);
            assert.equal((await request(role, 'PATCH', '/feedback/1', { status: 'RESOLVED' })).status, 403);
        }
        assert.equal((await request('demo', 'POST', '/feedback', { kind: 'SUGGESTION', message: 'Falla' })).status, 403);
    });
    await t.test('admin can list, resolve and reopen tickets', async () => {
        const response = await request('admin');
        assert.equal(response.status, 200);
        assert.equal((await response.json()).length, 2);
        for (const status of ['RESOLVED', 'OPEN']) {
            assert.equal((await request('admin', 'PATCH', '/feedback/1', { status })).status, 200);
            assert.equal(reports[0].status, status);
        }
        assert.equal((await request('admin', 'PATCH', '/feedback/1', { status: 'INVALID' })).status, 400);
        assert.equal((await request('admin', 'PATCH', '/feedback/missing', { status: 'RESOLVED' })).status, 404);
    });
    await t.test('ticket saves destination history from the server and retains its snapshot', async () => {
        const response = await request('editor', 'POST', '/feedback', {
            kind: 'ERROR', message: 'Imagen incorrecta', articleUrl: 'https://example.com/publicada',
            publicationContext: { destinations: [{ targetName: 'Inventado' }] },
        });
        assert.equal(response.status, 201);
        const ticket = await response.json();
        assert.equal(ticket.publicationContext.wasPublished, true);
        assert.deepEqual(ticket.publicationContext.destinations, [{ ...publication, sentAt: publication.sentAt.toISOString() }]);
        publication.targetName = 'Medio renombrado';
        const list = await (await request('admin')).json();
        assert.equal(list.find(report => report.id === ticket.id).publicationContext.destinations[0].targetName, 'Medio original');
    });
    await t.test('pending, legacy and unknown notes preserve distinct publication states', async () => {
        for (const [url, expected] of [['pendiente', false], ['antigua', true], ['desconocida', undefined]]) {
            const response = await request('editor', 'POST', '/feedback', { kind: 'ERROR', message: 'Falla', articleUrl: `https://example.com/${url}` });
            assert.equal(response.status, 201);
            const ticket = await response.json();
            assert.equal(ticket.publicationContext?.wasPublished, expected);
            if (ticket.publicationContext) assert.deepEqual(ticket.publicationContext.destinations, []);
        }
    });
});
