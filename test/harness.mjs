// Harness mínimo de tests (sin dependencias)
export class Suite {
  constructor(name) {
    this.name = name;
    this.passed = 0;
    this.failed = 0;
    this.failures = [];
  }
  assert(cond, msg) {
    if (cond) { this.passed++; }
    else { this.failed++; this.failures.push(msg); console.error(`  ✗ ${msg}`); }
  }
  approx(actual, expected, tol, msg) {
    const ok = Math.abs(actual - expected) <= tol;
    this.assert(ok, `${msg} — esperado ≈${expected}±${tol}, obtenido ${actual}`);
    return ok;
  }
  eq(actual, expected, msg) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    this.assert(ok, `${msg} — esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)}`);
    return ok;
  }
  section(title) { console.log(`  · ${title}`); }
}

export function fmtPct(p) { return `${Math.round(p * 100)}%`; }
