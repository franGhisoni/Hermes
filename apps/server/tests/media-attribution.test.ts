import test from 'node:test';
import assert from 'node:assert/strict';
import { stripMediaAttributions } from '../src/services/MediaAttribution';
import { isPlaceholderContent } from '../src/services/ContentSafetyService';

test('speech attributed to the source outlet keeps the verb and drops the outlet', () => {
    assert.equal(stripMediaAttributions('<p>Asimismo, confirmó a La Nación el señor Bruno.</p>'), '<p>Asimismo, confirmó el señor Bruno.</p>');
    assert.equal(stripMediaAttributions('El ministro le dijo a Clarín que no habrá cambios.'), 'El ministro dijo que no habrá cambios.');
    assert.equal(stripMediaAttributions('"No vamos a ceder", sostuvo en diálogo con TN el gobernador.'), '"No vamos a ceder", sostuvo el gobernador.');
    assert.equal(stripMediaAttributions('El intendente, en diálogo con Infobae, anticipó la medida.'), 'El intendente anticipó la medida.');
});

test('"según" an outlet becomes a neutral attribution', () => {
    assert.equal(stripMediaAttributions('Según pudo saber La Nación, el acuerdo se firma hoy.'), 'Según trascendió, el acuerdo se firma hoy.');
    assert.equal(stripMediaAttributions('El acuerdo, según informó Ámbito, se firma hoy.'), 'El acuerdo, según trascendió, se firma hoy.');
    assert.equal(stripMediaAttributions('Fuentes consultadas por Infobae lo confirmaron.'), 'Fuentes lo confirmaron.');
});

test('agency tags and closing credit paragraphs are removed', () => {
    assert.equal(stripMediaAttributions('Buenos Aires (NA) El Senado aprobó la ley.'), 'Buenos Aires El Senado aprobó la ley.');
    assert.equal(stripMediaAttributions('<p>Texto de la nota.</p>\n<p><strong>Fuente:</strong> Noticias Argentinas</p>'), '<p>Texto de la nota.</p>');
    assert.equal(stripMediaAttributions('<p>Texto.</p><p>Con información de Infobae y TN.</p>'), '<p>Texto.</p>');
    assert.equal(stripMediaAttributions('Texto.\n\nFuente: Clarín'), 'Texto.');
});

test('ordinary text that only looks like an outlet is untouched', () => {
    const text = '<p>El Gobierno informó a la Nación que la naftera subió.</p><p>Fuentes cercanas al ministro aseguraron que habrá cambios.</p>';
    assert.equal(stripMediaAttributions(text), text);
    assert.equal(stripMediaAttributions('Dijo a la prensa que la UCR apoyará.'), 'Dijo a la prensa que la UCR apoyará.');
});

test('plain-text notes sent by mail are cleaned too', () => {
    const text = 'Bruno confirmó a La Nación su salida.\n\nEl anuncio, según informó Clarín, será hoy.\n\nFuente: Noticias Argentinas';
    assert.equal(stripMediaAttributions(text), 'Bruno confirmó su salida.\n\nEl anuncio, según trascendió, será hoy.');
});

test('breaking-news stubs count as placeholder content', () => {
    assert.equal(isPlaceholderContent('Noticia en desarrollo.-'), true);
    assert.equal(isPlaceholderContent('<p>Noticia en desarrollo</p>'), true);
    assert.equal(isPlaceholderContent('El dólar oficial cerró en $1560 en el Banco Nación. '.repeat(5)), false);
});
