export function spelunkReplaySample(frames, seconds) {
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (frames[mid].seconds <= seconds) lo = mid;
    else hi = mid - 1;
  }
  const frame = frames[lo], next = frames[lo + 1];
  if (!next || next.depth !== frame.depth || next.seconds <= frame.seconds)
    return { frame, index: lo };
  const mix = Math.max(0, Math.min(1, (seconds - frame.seconds) / (next.seconds - frame.seconds)));
  const targets = new Map(next.rocks.map(rock => [rock.slot, rock]));
  return { index: lo, frame: { ...frame, rocks: frame.rocks.map(rock => {
    const target = targets.get(rock.slot);
    if (!target || target.type !== rock.type || target.boss !== rock.boss || target.hitAt !== rock.hitAt) return rock;
    const out = { ...rock };
    for (const key of ['x', 'y', 'w', 'h']) out[key] += (target[key] - rock[key]) * mix;
    if (rock.alpha != null && target.alpha != null) out.alpha += (target.alpha - rock.alpha) * mix;
    return out;
  }) } };
}

export function spelunkReplayTile(frame, slot, seconds = frame.seconds) {
  const x = 441 + 36 * (slot % 12) - 36 * Math.floor(slot / 12);
  const y = 20 + 18 * (slot % 12) + 18 * Math.floor(slot / 12);
  const animation = frame.floorAnimation;
  if (!animation) return { x, y: y - 12, alpha: 1 };
  const stagger = Math.ceil(4 * slot / 10);
  // Floor-generation callbacks admit their newly scheduled timers in the same 10 ms pass.
  const riseAt = animation.enteredAt + Math.max(animation.samePass ? 0 : 1, stagger - Number(animation.samePass));
  const progress = start => Math.max(0, Math.min(1, (seconds * 100 - start) / 30));
  const rise = progress(riseAt);
  const leaveAt = animation.leavingAt == null ? null : animation.leavingAt + Math.max(1, stagger);
  const leave = leaveAt == null ? 0 : progress(leaveAt);
  return { x, y: y - 12 * rise * (2 - rise) - 16 * leave * (2 - leave),
    alpha: leaveAt != null && seconds * 100 >= leaveAt ? 1 - leave : rise };
}

function _eventIndex(events, seconds, inclusive) {
  let lo = 0, hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].seconds < seconds || inclusive && events[mid].seconds === seconds) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
export function spelunkReplayDrop(event, seconds, leavingAt = null) {
  const age = seconds - event.seconds;
  if (age < 0 || age >= event.fadeSeconds) return null;
  const departureAge = leavingAt == null ? null : leavingAt - event.seconds;
  if (departureAge != null && age >= departureAge + .3) return null;
  const move = Math.min(1, age / event.moveSeconds);
  const progress = Math.min(1, age / .75), grow = progress - 1;
  const fadeAge = departureAge == null ? age : Math.min(age, departureAge);
  return { x: event.x + event.dx * move * (2 - move), y: event.y + event.dy * move * (2 - move),
    alpha: (1 - (fadeAge / event.fadeSeconds) ** 2)
      * (departureAge == null ? 1 : Math.max(0, 1 - Math.max(0, age - departureAge) / .3)),
    scale: progress === 0 ? 0 : progress === 1 ? 1 : grow * grow * (2.70158 * grow + 1.70158) + 1 };
}
export function spelunkReplayEvents(events, seconds, window = .45) {
  return events.slice(_eventIndex(events, seconds - window, false), _eventIndex(events, seconds, true));
}
export function spelunkReplayActionTime(events, seconds, direction) {
  let index = direction > 0 ? _eventIndex(events, seconds + 1e-8, true)
    : _eventIndex(events, seconds - 1e-8, false) - 1;
  for (; index >= 0 && index < events.length; index += direction) {
    if (['dig', 'elixir', 'switch', 'descend', 'hit', 'miss', 'drop'].includes(events[index].type)) return events[index].seconds;
  }
  return null;
}

export function createSpelunkPlayback(frames) {
  if (!frames.length) throw new Error('This expedition has no recorded replay.');
  const start = frames[0].seconds, end = frames.at(-1).seconds;
  let seconds = start, running = false, previous = null;
  return {
    get seconds() { return seconds; },
    get running() { return running; },
    seek(time) { seconds = Math.max(start, Math.min(end, time)); previous = null; },
    play() { if (seconds >= end) seconds = start; running = end > start; previous = null; },
    pause() { running = false; previous = null; },
    advance(now, speed) {
      if (!running) return;
      if (previous != null) seconds = Math.min(end, seconds + Math.max(0, now - previous) / 1000 * speed);
      previous = now;
      if (seconds >= end) running = false;
    },
  };
}
