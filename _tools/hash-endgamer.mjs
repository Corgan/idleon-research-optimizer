import { createHash } from 'node:crypto';

const names = process.argv.slice(2);
if (!names.length || names.some(name => !name.trim())) {
  console.error('Usage: node _tools\\hash-endgamer.mjs "CharacterName" ["AnotherName"]');
  process.exitCode = 1;
} else {
  for (const name of names) {
    const hash = createHash('sha256').update(name.trim().toLowerCase()).digest('hex');
    console.log(`  '${hash}',`);
  }
}
