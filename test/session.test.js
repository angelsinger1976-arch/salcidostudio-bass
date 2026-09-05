import { Suite } from './harness.mjs';
import { PracticeSession } from '../src/lib/practice/PracticeSession.js';

export function run() {
  const s = new Suite('PracticeSession · Motor de avance (estilo Rocksmith)');

  s.section('Avanza solo con la nota correcta');
  {
    const notes = [{ midi: 28 }, { midi: 33 }, { midi: 38 }]; // E1 A1 D2
    const sess = new PracticeSession(notes, { centsTolerance: 25, holdMs: 0 });
    sess.start();
    s.eq(sess.index, 0, 'Índice inicial 0');

    // Toca una nota equivocada (G1 = 31)
    let r = sess.check({ midi: 31, cents: 0, onset: true }, 100);
    s.assert(!r.ok, 'G1 no valida el objetivo E1');
    s.eq(sess.index, 0, 'No avanza con nota errónea');

    // Toca la correcta
    r = sess.check({ midi: 28, cents: 0, onset: true }, 200);
    s.assert(r.ok, 'E1 correcta');
    r = sess.check({ midi: 28, cents: 3, onset: false }, 260); // sostiene
    s.assert(r.advanced, 'Avanza tras sostener');
    s.eq(sess.index, 1, 'Índice pasa a 1 (A1)');
  }

  s.section('Tolerancia en cents (±25)');
  {
    const sess = new PracticeSession([{ midi: 33 }], { centsTolerance: 25, holdMs: 0 });
    sess.start();
    let r = sess.check({ midi: 33, cents: 18, onset: true }, 100);
    r = sess.check({ midi: 33, cents: 18, onset: false }, 200);
    s.assert(r.advanced, '+18 cents aceptado (dentro de tolerancia)');
  }
  {
    const sess = new PracticeSession([{ midi: 33 }], { centsTolerance: 25, holdMs: 0 });
    sess.start();
    let r = sess.check({ midi: 33, cents: 40, onset: true }, 100);
    r = sess.check({ midi: 33, cents: 40, onset: false }, 200);
    s.assert(!r.advanced, '+40 cents rechazado (fuera de tolerancia)');
  }

  s.section('Octava laxa por defecto (misma clase de nota)');
  {
    const sess = new PracticeSession([{ midi: 28 }], { centsTolerance: 25, holdMs: 0 }); // E1
    sess.start();
    let r = sess.check({ midi: 40, cents: 0, onset: true }, 100); // E2 en otra cuerda
    r = sess.check({ midi: 40, cents: 0, onset: false }, 200);
    s.assert(r.advanced, 'E2 (octava arriba) valida objetivo E1 en modo laxo');
  }
  {
    const sess = new PracticeSession([{ midi: 28 }], { centsTolerance: 25, holdMs: 0, octaveStrict: true });
    sess.start();
    let r = sess.check({ midi: 40, cents: 0, onset: true }, 100);
    r = sess.check({ midi: 40, cents: 0, onset: false }, 200);
    s.assert(!r.advanced, 'Modo estricto de octava rechaza E2 para E1');
  }

  s.section('Estadísticas y finalización');
  {
    const notes = [{ midi: 28 }, { midi: 28 }, { midi: 33 }];
    const sess = new PracticeSession(notes, { centsTolerance: 25, holdMs: 0 });
    let completed = false;
    sess.onComplete = () => { completed = true; };
    sess.start();
    sess.check({ midi: 28, cents: 0, onset: true }, 100);
    sess.check({ midi: 28, cents: 0, onset: false }, 160);
    sess.check({ midi: 28, cents: 0, onset: true }, 300);
    sess.check({ midi: 28, cents: 0, onset: false }, 360);
    sess.check({ midi: 33, cents: 0, onset: true }, 500);
    sess.check({ midi: 33, cents: 0, onset: false }, 560);
    s.assert(completed, 'Dispara onComplete al terminar');
    s.eq(sess.state, 'done', 'Estado final done');
    s.eq(sess.stats.hits, 3, '3 aciertos registrados');
    s.eq(sess.stats.bestStreak, 3, 'Racha máxima 3');
  }

  s.section('Racha se corta con errores');
  {
    const notes = [{ midi: 28 }, { midi: 33 }];
    const sess = new PracticeSession(notes, { centsTolerance: 25, holdMs: 0 });
    sess.start();
    sess.check({ midi: 31, cents: 0, onset: true }, 100); // error
    sess.check({ midi: 28, cents: 0, onset: true }, 200);
    sess.check({ midi: 28, cents: 0, onset: false }, 260);
    s.eq(sess.stats.wrong, 1, '1 error contado');
    s.eq(sess.stats.streak, 1, 'Racha reiniciada a 1 tras error');
  }

  return s;
}
