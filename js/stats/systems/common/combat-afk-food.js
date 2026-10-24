// ===== NATIVE OFFLINE COMBAT FOOD PROCESSING =====
import { ITEMS } from '../../data/game/items.js';

const N = x => Number(x) || 0;

// AFKfoodsTimeRedux builds deadlines once, sorts at most 20 entries, and
// refills each processed slot only once. It does not repeatedly consume refills.
export function combatAfkFood(seconds, inputs, evaluate) {
  const order = inputs.foodSlots.order.slice(), qty = inputs.foodSlots.qty.slice();
  const storage = { ...inputs.foodStorage }, initialQty = qty.slice(), events = [], phases = [];
  const initial = evaluate(order, qty), deadlines = [];
  for (let slot = 0; slot < inputs.foodSlots.count; slot++) {
    const item = ITEMS[order[slot]];
    if (!item) continue;
    const trigger = N(item.Trigger);
    if (trigger === -1 || trigger === -2) {
      const consumption = Math.max(N(item.Cooldown) / 100 * ((100 - N(inputs.foodNotConsume)) / 100), 0.001);
      const time = 3600 / Math.max(initial.rawKillsPerHour, 1) * (1 / consumption) * N(qty[slot]);
      if (time > 0) deadlines.push({ time, slot, used: -1 });
    } else if (trigger > 0) {
      // The source resets this damage budget for each health slot.
      const damage = seconds * initial.monsterDamage * initial.incomingAttacksPerHour / 3600;
      if (damage > 0) {
        const cooldown = N(item.Cooldown);
        const healing = Math.min(N(item.Amount) * N(inputs.healthFoodEffect), initial.maxHP);
        const used = Math.min(Math.round(damage / healing), Math.min(seconds / Math.max(cooldown, 1), N(qty[slot])));
        const time = cooldown * N(qty[slot]);
        if (time > 0) deadlines.push({ time, slot, used });
      }
    }
  }
  deadlines.sort((a, b) => a.time - b.time || a.slot - b.slot);
  const consumed = deadlines.slice(0, 20);
  let coefficient = 0, previous = 0, current = initial;
  function accrue(end) {
    const rawSurviving = current.rawKillsPerHour * current.percent / 100;
    coefficient += (end - previous) / 3600 * rawSurviving;
    phases.push({ startSeconds: previous, endSeconds: end, rawKillsPerHour: current.rawKillsPerHour, survivability: current.percent });
    previous = end;
  }
  for (const row of consumed) {
    const { time, slot, used } = row, key = order[slot], before = N(qty[slot]);
    accrue(Math.min(seconds, time));
    if (seconds <= time) {
      qty[slot] = used === -1 ? Math.round((time - seconds) / time * before)
        : Math.round(Math.max(before - used, (time - seconds) / time * before));
      events.push({ slot, key, atSeconds: seconds, used: before - qty[slot], refilled: 0, remaining: qty[slot], removed: false });
      break;
    }
    let refilled = 0, removed = false;
    if (used === -1 || before <= used) {
      qty[slot] = 0;
      if (inputs.labFoodRefill && N(storage[key]) > 0) {
        refilled = Math.min(N(inputs.cFoodCap), N(storage[key]));
        qty[slot] = refilled; storage[key] -= refilled;
      } else { order[slot] = 'Blank'; removed = true; }
    } else qty[slot] = Math.round(before - used);
    events.push({ slot, key, atSeconds: time, used: before - (refilled ? 0 : qty[slot]), refilled, remaining: qty[slot], removed });
    current = evaluate(order, qty);
  }
  if (previous < seconds) accrue(seconds);
  const final = evaluate(order, qty);
  return {
    coefficient, initial, final, order, qty, storage, phases, events,
    consumed: initialQty.map((amount, slot) => ({ slot, key: inputs.foodSlots.order[slot], quantity: N(amount) - qty[slot] + events.filter(e => e.slot === slot).reduce((sum, e) => sum + e.refilled, 0) })).filter(row => row.quantity > 0),
  };
}
