#!/usr/bin/env node
// Runner de la suite de tests de BassCoach
import { Suite } from './harness.mjs';

const modules = [
  './theory.test.js',
  './yin.test.js',
  './tracker.test.js',
  './session.test.js',
  './transcribe.test.js',
  './midi.test.js',
  './worklet.test.js',
];

console.log('\n🎸 BassCoach · Suite de tests\n' + '='.repeat(46));
const suites = [];
for (const m of modules) {
  const mod = await import(m);
  const s = mod.run();
  suites.push(s);
  const status = s.failed === 0 ? '✓' : '✗';
  console.log(`${status} ${s.name} — ${s.passed} ok, ${s.failed} fallos`);
}

const total = suites.reduce((a, s) => ({ p: a.p + s.passed, f: a.f + s.failed }), { p: 0, f: 0 });
console.log('='.repeat(46));
console.log(`Total: ${total.p} pruebas ok, ${total.f} fallos\n`);
if (total.f > 0) {
  suites.flatMap((s) => s.failures).forEach((f) => console.error('  ✗ ' + f));
  process.exit(1);
}
