import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDomEdits } from '../electron/core/preview/html-preview-edits';
import { validateDomEdits } from '../shared/preview/preview-dom-edits';
import {
  validateAnnotations,
  annotationContext,
  botPins,
  markRefs,
  nextPinNumber,
  pinNumber,
  unsentPins,
} from '../shared/preview/preview-annotations';
const patch = (html: string, after: string, path = ['html:1', 'body:1', 'h1:1']) => ({
  before: { tag: 'h1', path, html },
  after,
});
test('HTML writeback patches one verified source subtree and preserves unrelated bytes', () => {
  const source =
    '<!doctype html>\r\n<html><head><script>const x="< >";</script></head><body>\r\n  <h1 class=title>Old &amp; new</h1>\r\n  <!--keep--> <p data-a=\'x>y\'>Unchanged</p>\r\n</body></html>';
  const after = '<h1 class="title" style="color: red;">Changed</h1>';
  assert.equal(
    applyDomEdits(source, [patch('<h1 class="title">Old &amp; new</h1>', after)]),
    source.replace('<h1 class=title>Old &amp; new</h1>', after),
  );
});
test('sequential edits and raw HTML replacements keep their verified order', () => {
  const source = '<main><h1>First</h1><h1>Second</h1></main>',
    path = ['html:1', 'body:1', 'main:1', 'h1:2'];
  assert.equal(
    applyDomEdits(source, [
      patch('<h1>Second</h1>', '<h1 data-id="2">Second</h1>', path),
      patch('<h1 data-id="2">Second</h1>', '<h2>Replaced</h2><p>Added</p>', path),
    ]),
    '<main><h1>First</h1><h2>Replaced</h2><p>Added</p></main>',
  );
});
test('ambiguous, stale, moved and shadow nodes cannot overwrite a different source element', () => {
  assert.throws(() => applyDomEdits('<h1>A</h1><h1>A</h1>', [patch('<h1>A</h1>', '<h1>X</h1>', [])]));
  assert.throws(() => applyDomEdits('<h1>Changed externally</h1>', [patch('<h1>A</h1>', '<h1>X</h1>')]));
  assert.throws(() =>
    applyDomEdits('<main><h1>A</h1></main>', [
      patch('<h1>A</h1>', '<h1>X</h1>', ['html:1', 'body:1', 'aside:1', 'h1:1']),
    ]),
  );
  assert.throws(() => applyDomEdits('<h1>A</h1>', [patch('<h1>A</h1>', '<h1>X</h1>', ['::shadow', 'h1:1'])]));
});
test('implied table sections and void element source ranges are handled without touching adjacent elements', () => {
  assert.equal(
    applyDomEdits('<table><tr><td>A</td></tr></table>', [
      {
        before: { tag: 'td', path: ['html:1', 'body:1', 'table:1', 'tbody:1', 'tr:1', 'td:1'], html: '<td>A</td>' },
        after: '<td>B</td>',
      },
    ]),
    '<table><tr><td>B</td></tr></table>',
  );
  assert.equal(
    applyDomEdits('<img alt="x>y" src="a.png"><p>keep</p>', [
      {
        before: { tag: 'img', path: ['html:1', 'body:1', 'img:1'], html: '<img alt="x&gt;y" src="a.png">' },
        after: '<img alt="new" src="a.png">',
      },
    ]),
    '<img alt="new" src="a.png"><p>keep</p>',
  );
});
test('annotation and edit inputs have finite bounds and preserve annotation text and target metadata', () => {
  const annotations = validateAnnotations([
    { id: 'a', type: 'rect', x: 0.2, y: 0.3, w: 0.4, h: 0.1, color: '#3975c6', text: 'More space', page: 2 },
  ]);
  assert.match(annotationContext(annotations, { en: true }), /^#1 region\n {3}Request: More space\n {3}Locate: page 2/);
  const targeted = validateAnnotations([
    {
      id: 'b',
      type: 'element',
      x: 0.1,
      y: 0.1,
      color: '#3975c6',
      designId: 'hero-title',
      selector: 'h1',
      text: 'Smaller type',
    },
  ]);
  assert.match(annotationContext(targeted), /data-design-id=hero-title/);
  assert.throws(() => validateAnnotations([{ ...annotations[0], x: Infinity }]));
  assert.throws(() => validateAnnotations(Array(101).fill(annotations[0])));
  assert.throws(() => validateDomEdits([{ before: { tag: 'h1', path: [], html: 'x' }, after: 4 }]));
});

test('browser-implied head and body wrappers do not prevent saving source descendants', () => {
  const source =
    '<!doctype html><html lang="zh"><meta charset="UTF-8"><title>Demo</title><main><h1>Original</h1></main></html>';
  assert.equal(
    applyDomEdits(source, [patch('<h1>Original</h1>', '<h1>Updated</h1>', ['html:1', 'body:1', 'main:1', 'h1:1'])]),
    source.replace('<h1>Original</h1>', '<h1>Updated</h1>'),
  );
  assert.equal(
    applyDomEdits(source, [
      {
        before: { tag: 'title', path: ['html:1', 'head:1', 'title:1'], html: '<title>Demo</title>' },
        after: '<title>Saved</title>',
      },
    ]),
    source.replace('<title>Demo</title>', '<title>Saved</title>'),
  );
});

test('explicit document sections remain part of the source identity', () => {
  const source = '<html><head><title>Demo</title></head><body><main><h1>Original</h1></main></body></html>';
  assert.throws(() =>
    applyDomEdits(source, [patch('<h1>Original</h1>', '<h1>Updated</h1>', ['html:1', 'head:1', 'main:1', 'h1:1'])]),
  );
  assert.throws(() =>
    applyDomEdits(source, [
      {
        before: { tag: 'title', path: ['html:1', 'body:1', 'title:1'], html: '<title>Demo</title>' },
        after: '<title>Saved</title>',
      },
    ]),
  );
});

test('annotation context retains the selected content and stable CSS-pixel coordinate basis', () => {
  const input = {
    id: 'region',
    type: 'rect' as const,
    x: 0.1,
    y: 0.2,
    w: 0.3,
    h: 0.4,
    color: '#3975c6',
    sourceWidth: 1440,
    sourceHeight: 8000,
    elementLabel: 'h2.section-title',
    elementText: 'Selected section heading',
    text: 'Increase spacing',
  };
  const [mark] = validateAnnotations([input]);
  assert.deepEqual(mark, input);
  const context = annotationContext([mark], { en: true });
  assert.match(context, /source 1440×8000 CSS px/);
  assert.match(context, /^#1 region h2\.section-title "Selected section heading"/);
  assert.match(context, /Request: Increase spacing/);
  assert.match(annotationContext([mark]), /要求：Increase spacing/);
  assert.throws(() => validateAnnotations([{ ...input, sourceHeight: Infinity }]), {
    code: 'preview.annotation_canvas_invalid',
  });
  assert.throws(() => validateAnnotations([{ ...input, sourceWidth: 0 }]), {
    code: 'preview.annotation_canvas_invalid',
  });
  assert.throws(() => validateAnnotations([{ ...input, elementText: 'x'.repeat(1001) }]), {
    code: 'preview.annotation_text_too_long',
  });
  assert.throws(() => validateAnnotations([input, input]), { code: 'preview.annotation_invalid' });
});

test('arrow annotation context identifies the actual endpoint', () => {
  const text = annotationContext(
    [{ id: 'arrow', type: 'arrow', x: 0.8, y: 0.9, end: { x: 0.1, y: 0.2 }, color: '#3975c6' }],
    { en: true },
  );
  assert.match(text, /end \[0\.1000, 0\.2000\]/);
});

test('pins keep their numbers, carry the reply state, and list close-ups and Bot notes', () => {
  const marks = validateAnnotations([
    { id: 'a', type: 'rect', x: 0.1, y: 0.1, w: 0, h: 0, color: '#29282c', n: 4, status: 'sent', text: 'Bigger' },
    { id: 'b', type: 'element', x: 0, y: 0, color: '#8b6bea', author: 'bot', botNote: 'Which colour?', text: 'Blue' },
  ]);
  assert.deepEqual(
    marks.map((mark, index) => pinNumber(mark, index)),
    [4, 2],
  );
  assert.equal(nextPinNumber(marks), 5);
  assert.deepEqual(
    unsentPins(marks).map((mark) => mark.id),
    ['b'],
  );
  const text = annotationContext(marks, { en: true, closeUps: new Map([['a', 'preview-1234abcd-4.png']]) });
  assert.match(text, /^#4 point\n {3}Request: Bigger\n/);
  assert.match(text, /Close-up: preview-1234abcd-4\.png/);
  assert.match(text, /#2 element\n {3}Your note: Which colour\?\n {3}Reply: Blue/);
  assert.throws(() => validateAnnotations([{ ...marks[0], status: 'lost' }]), { code: 'preview.annotation_invalid' });
  assert.deepEqual(
    markRefs(marks).map((ref) => [ref.n, ref.title]),
    [
      [4, '位置'],
      [2, 'Bot 的说明'],
    ],
  );
});

test('a Bot places pins by selector or by a region, each with a note', () => {
  const [byElement, byRegion] = botPins([
    { selector: '.hero h1', note: 'Keep this headline?' },
    { box: [0.5, 0.5, 0.8, 0.2], page: 2, note: 'Too tight' },
  ]);
  assert.equal(byElement.type, 'element');
  assert.equal(byElement.selector, '.hero h1');
  assert.equal(byElement.author, 'bot');
  assert.equal(byRegion.type, 'rect');
  assert.equal(byRegion.w, 0.5);
  assert.equal(byRegion.page, 2);
  assert.equal(validateAnnotations([byElement, byRegion]).length, 2);
  assert.throws(() => botPins([{ selector: 'h1' }]), { code: 'preview.mark_invalid' });
  assert.throws(() => botPins([{ note: 'Where?' }]), { code: 'preview.mark_invalid' });
  assert.throws(() => botPins([{ box: [0, 0, 2, 1], note: 'x' }]), { code: 'preview.mark_invalid' });
  assert.throws(() => botPins([]), { code: 'preview.mark_invalid' });
});
