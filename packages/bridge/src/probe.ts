/**
 * Uji cepat tanpa browser: jalankan provider langsung dari CLI.
 *   pnpm bridge:probe -- --fen "<fen>" --provider stockfish --movetime 1000
 */
import { ProviderRegistry } from './providers/registry.js';
import { fenProblem } from './san.js';

const args = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const fen = flag('fen', START_FEN)!;
const providerId = flag('provider', 'stockfish')!;
const movetimeMs = Number(flag('movetime', '1000'));
const multipv = Number(flag('multipv', '3'));

// Stockfish keluar kalau diberi FEN invalid, jadi saring di sini persis seperti server.
const badFen = fenProblem(fen);
if (badFen) {
  console.error(`FEN tidak valid: ${badFen}`);
  process.exit(1);
}

const registry = await ProviderRegistry.load(undefined, args.includes('--debug'));

console.log('\nProvider terdaftar:');
for (const p of registry.list()) {
  console.log(`  ${p.ready ? '[siap]' : '[off ]'} ${p.id.padEnd(12)} ${p.label}${p.problem ? ` — ${p.problem}` : ''}`);
}

const entry = registry.get(providerId);
if (!entry?.provider) {
  console.error(`\nProvider "${providerId}" tidak bisa dipakai: ${entry?.info.problem ?? 'tidak terdaftar'}`);
  await registry.disposeAll();
  process.exit(1);
}

console.log(`\nFEN      : ${fen}`);
console.log(`Analisis : ${providerId}, movetime ${movetimeMs}ms, multipv ${multipv}\n`);

let updates = 0;
const result = await entry.provider.analyze({ fen, movetimeMs, multipv }, () => void updates++);

for (const [i, s] of result.suggestions.entries()) {
  const score =
    s.mateIn !== undefined
      ? `mate ${s.mateIn}`
      : s.scoreCp !== undefined
        ? `${(s.scoreCp / 100).toFixed(2)}`
        : s.policy !== undefined
          ? `${(s.policy * 100).toFixed(1)}%`
          : '-';
  console.log(
    `  ${i + 1}. ${(s.san ?? s.uci).padEnd(8)} ${score.padStart(8)}   ${(s.pv ?? []).slice(0, 6).join(' ')}`,
  );
}
console.log(
  `\ndepth ${result.depth ?? '-'}, nps ${result.nps ?? '-'}, ${result.elapsedMs}ms, ${updates} update streaming`,
);

await registry.disposeAll();
process.exit(0);
