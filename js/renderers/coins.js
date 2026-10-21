import { COMBAT_SPRITE_BASE, COIN_ANIMS } from '../stats/data/game/combat-sprites.js';

// organizeCoinTXT and the inventory money display use base-100 denominations.
export function fmtCoins(value) {
  if (!Number.isFinite(value)) return '<span class="note">Unavailable</span>';
  const amount = Math.abs(value);
  const digits = Math.floor(amount).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 0 });
  const highest = Math.min(29, Math.floor((digits.length - 1) / 2));
  const parts = [];
  for (let tier = highest; tier >= Math.max(0, highest - 2); tier--) {
    const end = digits.length - 2 * tier;
    const raw = digits.slice(tier === highest ? 0 : Math.max(0, end - 2), end);
    if (raw === '00' || raw === '0' && amount >= 1) continue;
    const count = amount < 1
      ? amount.toLocaleString('en-US', { maximumSignificantDigits: 3 })
      : BigInt(raw).toLocaleString('en-US');
    const sprite = COIN_ANIMS[String(tier + 1)];
    parts.push('<span class="coin-part"><span>' + count + '</span><span class="coin-icon" style="background-image:url('
      + COMBAT_SPRITE_BASE + sprite.file + ');background-size:' + sprite.across * 100 + '% ' + sprite.down * 100 + '%"></span></span>');
  }
  const exact = value.toLocaleString('en-US', { maximumSignificantDigits: 21 });
  return '<span class="coin-amount" role="img" aria-label="' + exact + ' copper" data-copper="' + value + '"><span aria-hidden="true">'
    + (value < 0 ? '-' : '') + parts.join('') + '</span></span>';
}
