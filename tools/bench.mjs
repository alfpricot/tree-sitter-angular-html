#!/usr/bin/env node
// Parse-throughput benchmark for the external scanner and the generated
// parser. Runs each corpus through the Node binding a number of times and
// reports the time per parse and the throughput, so a scanner change can be
// compared before and after:
//
//   node tools/bench.mjs            # default: 200 iterations per corpus
//   node tools/bench.mjs 1000       # more iterations, steadier numbers
//
// The corpora cover the scanner's different paths: element and attribute
// scanning, text runs with entities, raw text inside <script>, nesting (which
// decides how much scanner state is serialized per token), and the test
// fixtures as they are. Run it twice per revision and compare; differences
// below ~1% are noise on a busy machine.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Parser from 'tree-sitter';
import language from '../bindings/node/index.js';

const repo = fileURLToPath(new URL('..', import.meta.url));
const fixtureDir = join(repo, 'test/fixtures');
const fixtures = readdirSync(fixtureDir)
  .filter((f) => f.endsWith('.html'))
  .map((f) => readFileSync(join(fixtureDir, f), 'utf8'));

const repeat = (text, times) => text.repeat(times);

const corpora = [
  ['fixtures', fixtures.join('\n')],
  ['text-heavy', repeat('<div>Lorem ipsum &amp; dolor sit amet. </div>\n', 400)],
  [
    'script-heavy',
    '<script>\n' + repeat('function f(a, b) { return a + b; }\n', 600) + '</script>\n',
  ],
  [
    'nested-heavy',
    repeat(
      '<section><div><ul><li><span>{{ item.name | uppercase }}</span></li></ul></div></section>\n',
      300,
    ),
  ],
  [
    'binding-heavy',
    repeat('<img src="{{ a.b }}" alt="text" (click)="do($event)" [hidden]="flag">\n', 500),
  ],
];

const iterations = Number(process.argv[2] ?? 200);
const parser = new Parser();
parser.setLanguage(language);

for (const [name, source] of corpora) {
  for (let i = 0; i < 10; i++) parser.parse(source); // warm-up
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) parser.parse(source);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  const parsed = (source.length * iterations) / 1024 / 1024;
  const mbPerS = (parsed / (ms / 1000)).toFixed(1);
  console.log(
    `${name.padEnd(14)} ${(ms / iterations).toFixed(3).padStart(8)} ms/parse  ${mbPerS.padStart(6)} MB/s`,
  );
}
