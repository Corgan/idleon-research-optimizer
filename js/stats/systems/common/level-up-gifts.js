// ===== LEVEL-UP GIFTS (COMMON) =====

export function levelUpGiftItem(roll, { level, skillLevel = level, skillIndex = 0, giftCount, stampA23, stampC9 }) {
  if (level > 30 && roll < .0003) return 'EquipmentHats21';
  if ((skillLevel < 20 && roll < .35) || roll < .32) return 'PremiumGem';
  if (roll < .36) return 'ExpBalloon1';
  if (roll < .4037) return giftCount < 100
    ? roll < .39 ? 'Timecandy1' : roll < .4 ? 'Timecandy2' : roll < .403 ? 'Timecandy3'
      : roll < .4035 ? 'Timecandy4' : 'Timecandy5'
    : 'PremiumGem';
  if (roll < .411 && skillIndex === 4) return 'Line6';
  if (roll < .6) return 'EquipmentStatues';
  if (roll < .605 && stampA23 === 0) return 'StampA23';
  if (roll < .615 && giftCount < 100) return 'StoneZ1';
  if (roll < .75) return 'FoodPotYe' + Math.min(Math.ceil(level / 33), 3);
  if (roll < .753 && stampC9 === 0) return 'StampC9';
  return 'Quest25';
}

export function levelUpGiftDistribution(inputs) {
  const { chance, level, skillLevel = level, skillIndex = 0, giftCount, stampA23, stampC9 } = inputs;
  if ([chance, level, skillLevel, skillIndex, giftCount, stampA23, stampC9]
    .some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      || !Number.isInteger(skillIndex) || skillIndex > 20 || level < 1)
    throw new Error('Level-up gift chance, levels, session counter and stamp levels must be available nonnegative numbers.');
  const triggerChance = Math.min(1, chance), items = new Map();
  const cuts = [0, .0003, .32, .35, .36, .39, .4, .403, .4035, .4037, .411, .6, .605, .615, .75, .753, 1];
  for (let index = 1; index < cuts.length; index++) {
    const key = levelUpGiftItem((cuts[index - 1] + cuts[index]) / 2, inputs);
    const probability = triggerChance * (cuts[index] - cuts[index - 1]);
    if (key === 'EquipmentStatues') {
      for (let statue = 1; statue <= 8; statue++) {
        const item = key + statue;
        items.set(item, (items.get(item) || 0) + probability / 8);
      }
    } else items.set(key, (items.get(key) || 0) + probability);
  }
  return { triggerChance, noGiftChance: 1 - triggerChance,
    items: Array.from(items, ([key, probability]) => ({ key, probability })) };
}
