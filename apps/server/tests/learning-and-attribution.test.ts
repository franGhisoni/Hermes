import test from 'node:test';
import assert from 'node:assert/strict';
import { focusEditedContent, getSavedDraft, parseEditorDraft, rewritePreferenceFilter } from '../src/services/LearningService';
import { appendAiAttribution, sourceDisplayName } from '../src/services/AiAttribution';

test('editorial changes can be compared from the editor without a stored AI snapshot', () => {
    const snapshot = { title: 'Título IA', volanta: 'LOCAL', bajada: 'Bajada IA', content: '<p>Texto IA.</p>', tags: 'política' };
    const edited = { rewrittenTitle: 'Título editado', rewrittenContent: '<p>Texto editado.</p>', editorialData: { seo: { ...snapshot, title: 'Título editado', content: '<p>Texto editado.</p>' } }, aiRewriteSnapshot: null };
    assert.deepEqual(parseEditorDraft(snapshot), snapshot);
    assert.deepEqual(parseEditorDraft(getSavedDraft(edited)), getSavedDraft(edited));
    assert.notDeepEqual(parseEditorDraft(snapshot), getSavedDraft(edited));
    assert.equal(parseEditorDraft({ ...snapshot, content: '' }), null);
    assert.equal(parseEditorDraft({ ...snapshot, tags: 4 }), null);
});

test('analysis includes an edit near the end of a long article', () => {
    const beginning = 'Introducción. '.repeat(700);
    const result = focusEditedContent(`${beginning}Párrafos cortos.`, `${beginning}Párrafos más extensos.`);
    assert.match(result.before, /Párrafos cortos/);
    assert.match(result.after, /Párrafos más extensos/);
    assert.ok(result.before.length < 1000);
});

test('rewrite preferences stay private unless the administrator selects global scope', () => {
    assert.deepEqual(rewritePreferenceFilter('USER', 'editor-a'), { userId: 'editor-a', active: true });
    assert.deepEqual(rewritePreferenceFilter('GLOBAL', 'editor-a'), { active: true });
    assert.deepEqual(rewritePreferenceFilter('unexpected', 'editor-a'), { userId: 'editor-a', active: true });
});

test('publication attribution uses the source name once and escapes it for HTML', () => {
    const content = '<p>Nota.</p>';
    const attributed = appendAiAttribution(content, 'Medio <Sur> & Norte');
    assert.match(attributed, /Escritura asistida por inteligencia artificial\. Fuente: Medio &lt;Sur&gt; &amp; Norte/);
    assert.equal(appendAiAttribution(attributed, 'Medio <Sur> & Norte'), attributed);
    assert.equal(sourceDisplayName('ElDiarioSur'), 'El Diario Sur');
});
