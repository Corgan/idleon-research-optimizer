// ===== SAILING PILE SIMULATION (W5) =====
// Monte Carlo for fresh boat departures, near-full processing, and final opening payouts.
// Eligible same-tier matches stop the scan on success or failure.
// Same-island chests with strictly higher tier and stored value replace deterministically.

function _num(value) { return Number(value) || 0; }

function _quantile(sorted, probability) {
  if (!sorted.length) return 0;
  var position = Math.max(0, Math.min(sorted.length - 1, (sorted.length - 1) * probability));
  var lower = Math.floor(position);
  var upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function _summary(values) {
  values.sort(function(a, b) { return a - b; });
  var total = 0;
  for (var i = 0; i < values.length; i++) total += values[i];
  return { mean: values.length ? total / values.length : 0, p10: _quantile(values, 0.1),
    median: _quantile(values, 0.5), p90: _quantile(values, 0.9) };
}

function _openedValue(chest, payoutsByTier) {
  return chest.value * (_num(payoutsByTier[chest.tier]) || 1);
}

function _sampleTier(probabilities, random) {
  var roll = random();
  var cumulative = 0;
  for (var tier = 0; tier < probabilities.length; tier++) {
    cumulative += Math.max(0, _num(probabilities[tier]));
    if (roll < cumulative) return tier;
  }
  return Math.max(0, probabilities.length - 1);
}

function _incomingChest(route, config, random) {
  var tier = _sampleTier(route.tierProbabilities || [], random);
  return { value: _num(route.lootValue) * _num(config.lootMultipliers[tier]),
    islandIdx: Math.max(0, Math.round(_num(route.islandIdx))),
    artifactMultiplier: _num(route.artifactMultiplier) * _num(config.artifactMultipliers[tier]),
    tier: tier };
}

function _processNearFull(pile, incoming, config, random) {
  for (var index = 0; index < pile.length; index++) {
    var existing = pile[index];
    if (incoming.islandIdx === existing.islandIdx && incoming.tier === existing.tier
        && incoming.value >= existing.value) {
      var upgradeChance = _num(config.upgradeChances[incoming.tier]);
      if (upgradeChance > 0 && random() < upgradeChance) {
        incoming.value *= 1.85;
        incoming.artifactMultiplier *= 1.4;
        incoming.tier += 1;
        pile[index] = incoming;
        return 'upgrade';
      }
      return 'overflowDiscard';
    }
    if (incoming.islandIdx === existing.islandIdx && incoming.tier > existing.tier
        && incoming.value > existing.value) {
      pile[index] = incoming;
      return 'replacement';
    }
  }
  return 'overflowDiscard';
}

function _eventsForTrial(routes, hours) {
  var events = [];
  for (var routeIndex = 0; routeIndex < routes.length; routeIndex++) {
    var route = routes[routeIndex];
    var rate = Math.max(0, _num(route.tripsPerHour));
    if (rate <= 0) continue;
    var period = 1 / rate;
    for (var at = period; at <= hours + 1e-12; at += period) {
      events.push({ at: at, routeIndex: routeIndex, boatIdx: Math.round(_num(route.boatIdx)) });
    }
  }
  events.sort(function(a, b) { return a.at - b.at || a.boatIdx - b.boatIdx; });
  return events;
}

function _emptySlot() {
  return { occupied: 0, value: 0, artifact: 0, payouts: 0, opened: 0,
    currencies: { gold: 0, primary: 0, rare: 0 }, tierCounts: [0, 0, 0, 0, 0, 0] };
}

function _emptyTier() {
  return { count: 0, value: 0, opened: 0 };
}

function _currencyPick(shares, random) {
  var gold = Math.max(0, _num(shares.gold));
  var primary = Math.max(0, _num(shares.primary));
  var roll = random();
  if (roll < gold) return 'gold';
  if (roll < gold + primary) return 'primary';
  return 'rare';
}

export function runSailingPileSimulation(config, onProgress) {
  config = config || {};
  var routes = config.routes || [];
  var trials = Math.max(1, Math.round(_num(config.trials)));
  var hours = Math.max(0, _num(config.hours));
  var capacity = Math.max(0, Math.round(_num(config.capacity)));
  var minimumTier = Math.max(0, Math.min(5, Math.round(_num(config.minimumTier))));
  var payoutsByTier = config.payoutsByTier || [1, 2, 3, 4, 5, 5];
  var targetCount = _num(config.unendingTalent) > 0 ? Math.max(0, capacity - 1) : capacity;
  var slotSums = new Array(capacity);
  for (var slotIndex = 0; slotIndex < capacity; slotIndex++) slotSums[slotIndex] = _emptySlot();
  var tierSums = new Array(6);
  for (var tierIndex = 0; tierIndex < 6; tierIndex++) tierSums[tierIndex] = _emptyTier();
  var eventSums = { generated: 0, accepted: 0, upgrades: 0, replacements: 0,
    filterDiscards: 0, overflowDiscards: 0, blocked: 0 };
  var trialPileValues = [];
  var trialActiveValues = [];
  var trialCounts = [];
  var trialCurrencyValues = { gold: [], primary: [], rare: [] };
  var trialCurrencyPayouts = { gold: [], primary: [], rare: [] };
  var batch = Math.max(1, Math.round(_num(config.progressBatch)) || 50);

  for (var trial = 0; trial < trials; trial++) {
    var random = Math.random;
    var pile = [];
    var events = _eventsForTrial(routes, hours);
    var activeValue = 0;
    var trialEvents = { generated: 0, accepted: 0, upgrades: 0, replacements: 0,
      filterDiscards: 0, overflowDiscards: 0, blocked: 0 };

    for (var eventIndex = 0; eventIndex < events.length; eventIndex++) {
      var route = routes[events[eventIndex].routeIndex];
      var incoming = _incomingChest(route, config, random);
      trialEvents.generated++;
      activeValue += _openedValue(incoming, payoutsByTier);
      if (pile.length >= capacity) {
        trialEvents.blocked++;
      } else if (_num(config.unendingTalent) > 0 && pile.length === targetCount) {
        var outcome = _processNearFull(pile, incoming, config, random);
        if (outcome === 'upgrade') trialEvents.upgrades++;
        else if (outcome === 'replacement') trialEvents.replacements++;
        else trialEvents.overflowDiscards++;
      } else if (incoming.tier >= minimumTier) {
        pile.push(incoming);
        trialEvents.accepted++;
      } else {
        trialEvents.filterDiscards++;
      }
    }

    var pileValue = 0;
    var currencyValues = { gold: 0, primary: 0, rare: 0 };
    var currencyPayouts = { gold: 0, primary: 0, rare: 0 };
    for (var pileIndex = 0; pileIndex < pile.length; pileIndex++) {
      var chest = pile[pileIndex];
      var payouts = Math.max(1, Math.round(_num(payoutsByTier[chest.tier])));
      var opened = chest.value * payouts;
      var slot = slotSums[pileIndex];
      var tierSummary = tierSums[chest.tier];
      slot.occupied++;
      slot.value += chest.value;
      slot.artifact += chest.artifactMultiplier;
      slot.payouts += payouts;
      slot.opened += opened;
      slot.tierCounts[chest.tier]++;
      tierSummary.count++;
      tierSummary.value += chest.value;
      tierSummary.opened += opened;
      pileValue += opened;
      for (var payout = 0; payout < payouts; payout++) {
        var currency = _currencyPick(config.currencyShares || { gold: 1, primary: 0, rare: 0 }, random);
        currencyPayouts[currency]++;
        currencyValues[currency] += chest.value;
        slot.currencies[currency] += chest.value;
      }
    }

    trialPileValues.push(pileValue);
    trialActiveValues.push(activeValue);
    trialCounts.push(pile.length);
    for (var currencyKey of ['gold', 'primary', 'rare']) {
      trialCurrencyValues[currencyKey].push(currencyValues[currencyKey]);
      trialCurrencyPayouts[currencyKey].push(currencyPayouts[currencyKey]);
    }
    for (var eventKey in eventSums) eventSums[eventKey] += trialEvents[eventKey];
    if (onProgress && ((trial + 1) % batch === 0 || trial + 1 === trials)) onProgress(trial + 1, trials);
  }

  var slots = slotSums.map(function(slot, index) {
    var occupied = slot.occupied;
    var mostLikelyTier = -1;
    var mostLikelyCount = -1;
    for (var tier = 0; tier < slot.tierCounts.length; tier++) {
      if (slot.tierCounts[tier] > mostLikelyCount) {
        mostLikelyCount = slot.tierCounts[tier];
        mostLikelyTier = tier;
      }
    }
    return { index: index, occupancy: occupied / trials,
      averageTier: occupied ? slot.tierCounts.reduce(function(sum, count, tier) { return sum + count * tier; }, 0) / occupied : 0,
      mostLikelyTier: occupied ? mostLikelyTier : -1,
      tierDistribution: slot.tierCounts.map(function(count) { return occupied ? count / occupied : 0; }),
      averageValuePerPayout: occupied ? slot.value / occupied : 0,
      averageArtifactMultiplier: occupied ? slot.artifact / occupied : 0,
      averagePayouts: occupied ? slot.payouts / occupied : 0,
      averageOpenedValue: occupied ? slot.opened / occupied : 0,
      averageCurrencyValue: { gold: slot.currencies.gold / trials,
        primary: slot.currencies.primary / trials, rare: slot.currencies.rare / trials } };
  });
  var tiers = tierSums.map(function(tier, index) {
    return { tier: index, averageCount: tier.count / trials,
      averageValuePerPayout: tier.count ? tier.value / tier.count : 0,
      averageOpenedValue: tier.count ? tier.opened / tier.count : 0,
      openedValueContribution: tier.opened / trials };
  });
  var currencies = {};
  for (var key of ['gold', 'primary', 'rare']) {
    currencies[key] = { value: _summary(trialCurrencyValues[key]),
      payouts: _summary(trialCurrencyPayouts[key]) };
  }
  var pileValueSummary = _summary(trialPileValues);
  var activeValueSummary = _summary(trialActiveValues);
    return { config: { hours: hours, trials: trials, capacity: capacity, targetCount: targetCount,
      minimumTier: minimumTier },
    events: Object.fromEntries(Object.entries(eventSums).map(function(entry) { return [entry[0], entry[1] / trials]; })),
    pile: { count: _summary(trialCounts), value: pileValueSummary,
      averageValuePerChest: pileValueSummary.mean / Math.max(1, _summary(trialCounts).mean) },
    activeCollectionValue: activeValueSummary,
    retainedFraction: activeValueSummary.mean > 0 ? pileValueSummary.mean / activeValueSummary.mean : 0,
    slots: slots, tiers: tiers, currencies: currencies };
}