import assert from 'node:assert/strict';
import { createSpelunkPlayback, spelunkReplaySample, spelunkReplayTile, spelunkReplayDrop, spelunkReplayEvents, spelunkReplayActionTime } from '../ui/spelunk-replay.js';

const rock = { slot: 1, type: 0, boss: false, x: 10, y: 20, w: 30, h: 40, hp: 100 };
const frames = [
  { seconds: 0, depth: 1, tool: null, rocks: [rock] },
  { seconds: .1, depth: 1, tool: 4, rocks: [{ ...rock, x: 30, hp: 20 }] },
  { seconds: 2, depth: 2, rocks: [{ ...rock, x: 500 }] },
  { seconds: 2, depth: 2, rocks: [] },
];
const clock = createSpelunkPlayback(frames);
clock.play(); clock.advance(0, 1); clock.advance(50, 1);
assert.equal(clock.seconds, .05);
clock.pause(); clock.advance(1000, 1);
assert.equal(clock.seconds, .05);
clock.play(); clock.advance(2000, 1); clock.advance(2020, 2);
assert.equal(clock.seconds, .09, 'resume retains fractional progress and excludes paused wall time');
clock.advance(2030, .5);
assert.equal(clock.seconds, .095, 'speed changes do not reset playback');
clock.seek(1.5); clock.advance(3000, 1);
assert.equal(clock.seconds, 1.5, 'seeking resets the wall-clock anchor');
clock.advance(4000, 1);
assert.equal(clock.seconds, 2);
assert.equal(clock.running, false);
clock.play();
assert.equal(clock.seconds, 0, 'playing at the end restarts');
clock.seek(-10); assert.equal(clock.seconds, 0);
clock.seek(10); assert.equal(clock.seconds, 2);

const sample = spelunkReplaySample(frames, .05);
assert.equal(sample.index, 0);
assert.equal(sample.frame.rocks[0].x, 20, 'compatible transforms interpolate');
assert.equal(sample.frame.rocks[0].hp, 100, 'gameplay values remain discrete');
assert.equal(sample.frame.tool, null, 'adaptive tool selection cannot appear before its recorded choice');
assert.equal(spelunkReplaySample(frames, .1).frame.tool, 4, 'tool choice changes on its captured frame');
assert.equal(spelunkReplaySample(frames, .01).frame.tool, null, 'backward seeking removes later tool selection');
assert.equal(rock.x, 10, 'drawing never mutates recorded frames');
assert.equal(spelunkReplaySample(frames, 1.5).frame.rocks[0].x, 30, 'never interpolate across floors');
assert.equal(spelunkReplaySample(frames, 2).index, 3, 'duplicate terminal timestamps resolve to the final state');
const replaced = [{ ...frames[0] }, { ...frames[1], rocks: [{ ...rock, type: 2, x: 90 }] }];
assert.equal(spelunkReplaySample(replaced, .05).frame.rocks[0].x, 10, 'never interpolate replaced rocks');
const hitRestart = [{ ...frames[0], rocks: [{ ...rock, hitAt: null }] },
  { ...frames[1], rocks: [{ ...rock, w: 60, hitAt: 10 }] }];
assert.equal(spelunkReplaySample(hitRestart, .09).frame.rocks[0].w, 30, 'hit animation cannot start before its recorded action');
const fading = [{ ...frames[0], rocks: [{ ...rock, alpha: 1 }] },
  { ...frames[1], rocks: [{ ...rock, alpha: 0 }] }];
assert.equal(spelunkReplaySample(fading, .05).frame.rocks[0].alpha, .5, 'object opacity fades between recorded transforms');
const floor = { seconds: 0, floorAnimation: { enteredAt: 0, samePass: false, leavingAt: null } };
const slot = 40, baseY = 20 + 18 * (slot % 12) + 18 * Math.floor(slot / 12);
assert.deepEqual(spelunkReplayTile(floor, slot, .15), { x: 477, y: baseY, alpha: 0 },
  'tiles stay invisible until their physical-slot appearance timer');
const rising = spelunkReplayTile(floor, slot, .31);
assert.ok(Math.abs(rising.y - (baseY - 9)) < 1e-10);
assert.ok(Math.abs(rising.alpha - .5) < 1e-10, 'tiles rise with QuadOut and fade in linearly over 300 ms');
const leaving = { seconds: 1, floorAnimation: { ...floor.floorAnimation, leavingAt: 100 } };
const fadingTile = spelunkReplayTile(leaving, slot, 1.31);
assert.ok(Math.abs(fadingTile.y - (baseY - 24)) < 1e-10);
assert.ok(Math.abs(fadingTile.alpha - .5) < 1e-10, 'departure raises settled tiles another 16 pixels while fading');
assert.equal(spelunkReplayTile(leaving, slot, 1.9).alpha, 0, 'old floor stays hidden until replacement');
const nextFloor = { seconds: 2, floorAnimation: { enteredAt: 200, samePass: true, leavingAt: null } };
assert.equal(spelunkReplayTile(nextFloor, slot, 2.15).alpha, 0, 'nested generation starts the stagger timer in the current pass');
assert.ok(spelunkReplayTile(nextFloor, slot, 2.16).alpha > 0);
assert.deepEqual(spelunkReplayTile({ seconds: 0 }, slot), { x: 477, y: baseY - 12, alpha: 1 },
  'older recordings retain their settled tile positions');
assert.deepEqual(spelunkReplayTile(floor, slot, .15), { x: 477, y: baseY, alpha: 0 },
  'backward seeking restores the original floor animation');
const events = [
  { type: 'dig', seconds: .02 }, { type: 'hit', seconds: .02 },
  { type: 'miss', seconds: .03 }, { type: 'hit', seconds: .04, source: 'shadow' },
  { type: 'elixir', seconds: .04 }, { type: 'descend', seconds: 4 },
];
assert.deepEqual(spelunkReplayEvents(events, .04), events.slice(0, 5),
  'same-tick actions and later passive hits cannot overwrite one another');
assert.deepEqual(spelunkReplayEvents(events, .025), events.slice(0, 2), 'seeking backward removes future hits');
assert.deepEqual(spelunkReplayEvents(events, 4.5), [], 'old actions expire');
assert.equal(spelunkReplayActionTime(events, .02, 1), .03);
assert.equal(spelunkReplayActionTime(events, .04, -1), .03);
assert.equal(spelunkReplayActionTime(events, 0, -1), null);
assert.equal(spelunkReplayActionTime(events, 4, 1), null);
assert.deepEqual(spelunkReplayEvents([], 2), []);
const drop = { type: 'drop', seconds: 1, x: 100, y: 200, dx: -16, dy: 8, moveSeconds: .8, fadeSeconds: 2.5 };
assert.equal(spelunkReplayDrop(drop, .9), null, 'future drops stay hidden when seeking backwards');
assert.equal(spelunkReplayDrop(drop, 3.5), null, 'drop expires at its captured fade duration');
assert.ok(Math.abs(spelunkReplayDrop(drop, 1).scale) < 1e-10);
assert.equal(spelunkReplayDrop(drop, 1.4).x, 88, 'native QuadOut drop motion');
assert.ok(spelunkReplayDrop(drop, 1.5).scale > 1, 'native BackOut drop growth overshoots');
assert.deepEqual(spelunkReplayDrop(drop, 3), { x: 84, y: 208, alpha: 1 - (2 / 2.5) ** 2, scale: 1 });
assert.equal(spelunkReplayDrop(drop, 1.8, 1.5), null, 'descending fades existing drops out in 300 ms');
assert.ok(Math.abs(spelunkReplayDrop(drop, 1.65, 1.5).alpha - (1 - (.5 / 2.5) ** 2) / 2) < 1e-12);
assert.deepEqual(spelunkReplayEvents([drop, { ...drop, reward: 1 }], 1, 2.8).length, 2, 'same-tick drops stay separate');
assert.equal(spelunkReplayActionTime([drop], 0, 1), 1, 'drop ticks can be inspected with action stepping');
assert.throws(() => createSpelunkPlayback([]), /no recorded replay/);
console.log('Spelunking fractional playback, seek, speed, terminal frames and visual interpolation passed.');
