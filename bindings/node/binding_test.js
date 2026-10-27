import assert from 'node:assert';
import { test } from 'node:test';
import Parser from 'tree-sitter';

test('can load grammar', async () => {
  const parser = new Parser();
  await assert.doesNotReject(async () => {
    const { default: language } = await import('./index.js');
    parser.setLanguage(language);
  });
});

test('exports node type metadata', async () => {
  const { default: language } = await import('./index.js');
  assert(Array.isArray(language.nodeTypeInfo));
  assert(language.nodeTypeInfo.some((node) => node.type === 'document'));
});

test('exports the angular_html language name', async () => {
  const { default: language } = await import('./index.js');
  assert.equal(language.name, 'angular_html');
});

test('exports the query files', async () => {
  const { default: language } = await import('./index.js');
  assert.match(language.HIGHLIGHTS_QUERY, /@keyword/);
  assert.match(language.INJECTIONS_QUERY, /injection\.language/);
});

test('parses control flow and bindings without error', async () => {
  const { default: language } = await import('./index.js');
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(
    '@for (item of items; track item.id) { <li [class.on]="item.on">{{ item.name | uppercase }}</li> }',
  );
  assert.equal(tree.rootNode.hasError, false);
});
