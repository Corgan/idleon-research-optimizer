import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as F from '../stats/systems/w5/fountain.js';
import { runSim } from '../fountain-sim-worker.js';
import { loadSaveData } from '../save/loader.js';
import { saveData } from '../state.js';

function levels() {
  return [Array(20).fill(0), Array(20).fill(0), Array(20).fill(0)];
}

function emptySave() {
  return {
    holesData: Array.from({ length: 35 }, () => []),
    olaData: [],
  };
}

{
  const uLvs = levels();
  const mLvs = levels();

  assert.equal(F.watersOwned(uLvs, mLvs), 1, 'Blue Water is available by default');
  assert.equal(F.upgradeAccessible(uLvs, 0, 9), true, 'Blue root upgrade is accessible');
  assert.equal(F.upgradeAccessible(uLvs, 1, 10), false, 'Yellow tree is initially inaccessible');

  uLvs[0][0] = 1;
  assert.equal(F.watersOwned(uLvs, mLvs), 2, 'Blue root unlocks Yellow Water');
  assert.equal(F.upgradeAccessible(uLvs, 1, 10), true, 'Yellow root upgrade becomes accessible');
  assert.equal(F.upgradeAccessible(uLvs, 2, 12), false, 'Green tree remains inaccessible');

  uLvs[1][0] = 1;
  assert.equal(F.watersOwned(uLvs, mLvs), 3, 'Yellow root unlocks Green Water');
  assert.equal(F.upgradeAccessible(uLvs, 2, 12), true, 'Green root upgrade becomes accessible');
}

{
  const save = emptySave();
  const uLvs = levels();
  const mLvs = levels();
  save.holesData[11][83] = '_';

  assert.deepEqual(F.activeCurrencyTypes(save, uLvs, mLvs), [0], 'An empty pool falls back to Bronze');
  assert.equal(F.royalChance(uLvs, mLvs), 0, 'Royal chance is gated by Royal Stacks');
  assert.equal(F.effectiveRoyalMulti(uLvs, mLvs), 1, 'Royal multiplier is gated by Royal Stacks');
  assert.equal(F.marblePerHr(save, uLvs, mLvs), 0, 'Marble rate is gated by Marble Filling');
  assert.equal(F.duckChance(save, uLvs, mLvs), 0, 'Duck chance is gated by Rubber Ducky');

  const rates = F.earnRatesPerHr(save, uLvs, mLvs);
  assert.ok(Number.isFinite(rates[0]) && rates[0] > 0, 'Locked-Royal Bronze rate stays finite');
  assert.deepEqual(rates.slice(1), Array(8).fill(0), 'Locked currencies have zero earn rate');
}

{
  const save = emptySave();
  const uLvs = levels();
  const mLvs = levels();
  uLvs[0][12] = 10;

  let rates = F.activeEarnRatesPerHr(save, uLvs, mLvs, 1, 1);
  assert.ok(rates[0] > 0 && rates[1] > 0, 'Desired does not focus generation before Turn and Push');

  uLvs[1][12] = 1;
  rates = F.activeEarnRatesPerHr(save, uLvs, mLvs, 1, 1);
  assert.equal(rates[0], 0, 'Focusing Silver removes Bronze from the generated pool');
  assert.ok(rates[1] > 0, 'Focusing Silver earns Silver');
}

{
  const save = emptySave();
  const uLvs = levels();
  const mLvs = levels();
  uLvs[1][8] = 1e6;
  uLvs[2][8] = 1e6;
  uLvs[2][10] = 1e6;
  uLvs[2][12] = 1e6;

  assert.equal(F.royalChance(uLvs, mLvs), 1, 'Royal chance is capped at 100%');
  assert.ok(F.effectiveRoyalMulti(uLvs, mLvs) > 1, 'Royal multiplier activates with Royal Stacks');
  assert.equal(F.luckyCoinBaseChance(uLvs, mLvs), 1, 'Lucky chance is capped at 100%');
  assert.equal(F.duckChance(save, uLvs, mLvs), 1, 'Duck chance is capped at 100%');
}

{
  const save = emptySave();
  const uLvs = levels();
  const mLvs = levels();
  uLvs[0][0] = 1;
  uLvs[0][8] = 10;
  const currencies = Array(9).fill(0);
  currencies[2] = 50000;

  const result = runSim({
    saveData: save,
    uLvs,
    mLvs,
    desired: 0,
    timeLimit: 0.01,
    marbleBarProgress: 0,
    currencies,
    marbles: 0,
  });

  assert.ok(result.uLvs[1][10] >= 1, 'Simulator can buy the first Marble Filling level from a zero marble-rate baseline');
}

{
  const save = emptySave();
  const uLvs = levels();
  const mLvs = levels();
  uLvs[0][0] = 1;
  uLvs[0][4] = 1;
  uLvs[0][8] = 10;
  uLvs[0][12] = 10;
  uLvs[0][19] = 10;
  const currencies = Array(9).fill(0);
  currencies[1] = 15;

  const result = runSim({
    saveData: save,
    uLvs,
    mLvs,
    desired: 0,
    timeLimit: 0.01,
    marbleBarProgress: 0,
    currencies,
    marbles: 0,
  });

  assert.ok(result.uLvs[0][6] >= 1, 'Simulator values a Gold-rate upgrade by its time saved on the Gold-cost Marble Filling target');
}

loadSaveData(JSON.parse(readFileSync(new URL('../../saves/it.json', import.meta.url), 'utf8')));
{
  const uLvs = F.upgLvs(saveData);
  const mLvs = F.marbleLvs(saveData);
  const currencies = Array.from({ length: 9 }, (_, type) => F.fountCurrencyAvail(saveData, type));
  const result = runSim({
    saveData,
    uLvs,
    mLvs,
    desired: F.desiredCurrency(saveData),
    timeLimit: 1,
    marbleBarProgress: F.marbleBarProgress(saveData),
    currencies,
    marbles: F.marbleCurrency(saveData),
  });

  assert.ok(result.clockSec >= 0 && result.clockSec <= 3600, 'Simulation clock stays within its limit');
  assert.ok(result.marbleBarProgress >= 0, 'Marble progress is nonnegative');
  assert.ok(result.marbleBarProgress < F.marbleBarFillTime(), 'Marble progress stays below one fill');
  assert.ok(result.currencies.every((value) => value >= 0), 'Simulation balances stay nonnegative');
  assert.ok(result.events.every((event) => event.type !== 'switch' || event.newDesired >= 0 || event.newFocus >= 0), 'Switch events change Desired or focus');
}

console.log('Fountain regression checks passed.');