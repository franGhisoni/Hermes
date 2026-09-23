import test from 'node:test';
import assert from 'node:assert/strict';
import { getAiDraft, getSavedDraft } from '../src/services/LearningService';
import { appendAiAttribution, sourceDisplayName } from '../src/services/AiAttribution';

test('editorial changes are compared with the untouched AI draft', () => {
    const snapshot = { title: 'Título IA', volanta: 'LOCAL', bajada: 'Bajada IA', content: '<p>Texto IA.</p>', tags: 'política' };
    const edited = { rewrittenTitle: 'Título editado', rewrittenContent: '<p>Texto editado.</p>', editorialData: { seo: { ...snapshot, title: 'Título editado', content: '<p>Texto editado.</p>' } } };
    assert.deepEqual(getAiDraft(snapshot), snapshot);
    assert.equal(getSavedDraft(edited).content, '<p>Texto editado.</p>');
    assert.notDeepEqual(getAiDraft(snapshot), getSavedDraft(edited));
    assert.equal(getAiDraft(null), null);
});

test('publication attribution uses the source name once and escapes it for HTML', () => {
    const content = '<p>Nota.</p>';
    const attributed = appendAiAttribution(content, 'Medio <Sur> & Norte');
    assert.match(attributed, /Escritura asistida por inteligencia artificial\. Fuente: Medio &lt;Sur&gt; &amp; Norte/);
    assert.equal(appendAiAttribution(attributed, 'Medio <Sur> & Norte'), attributed);
    assert.equal(sourceDisplayName('ElDiarioSur'), 'El Diario Sur');
});
