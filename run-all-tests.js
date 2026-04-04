const { execSync } = require('child_process');
const { writeFileSync } = require('fs');

const tests = ['test-analysis', 'test-optimizers', 'test-phase0', 'test-save-loader', 'test-formulas', 'test-minehead', 'test-regression'];
const results = [];

for (const t of tests) {
  try {
    const r = execSync(`node js/tests/${t}.js`, { encoding: 'utf8', timeout: 60000 });
    const lines = r.trim().split('\n').filter(l => l.trim());
    const last = lines[lines.length - 1]?.trim() || 'OK (no output)';
    results.push(`${t}: ${last}`);
  } catch (e) {
    const stderr = (e.stderr || '').trim().slice(0, 300);
    const stdout = (e.stdout || '').trim().split('\n').slice(-3).join(' | ');
    results.push(`${t}: FAIL - ${stderr || stdout}`);
  }
}

writeFileSync('test-results.txt', results.join('\n') + '\n', 'utf8');
console.log(results.join('\n'));
