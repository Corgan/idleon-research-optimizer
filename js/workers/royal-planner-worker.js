import {
  planKingdomLayout,
  planLowAttention,
  planNextArmoryShelf,
  planOutpostPointSpending,
  planRankBreakpoint,
  planResetDrainSchedule,
  planSpecialPlacement,
  projectRoyalStateAfterReset,
} from "../stats/systems/w7/royal-guardian-planner.js";

const planners = {
  layout: (message, options) => {
    const report = (stage, offset) => progress => options.onProgress?.({ ...progress, phase: `${stage}-${progress.phase}`, completed: offset + Number(progress.completed) / Math.max(1, Number(progress.total)) * 100, total: 200 });
    const current = planKingdomLayout(message.saveData, message.goal, { ...options, onProgress: report("current", 0) });
    const projection = projectRoyalStateAfterReset(message.saveData, options);
    const postReset = projection.available
      ? planKingdomLayout(projection.state, message.goal, { ...options, onProgress: report("post-reset", 100) })
      : null;
    if (!projection.available) options.onProgress?.({ phase: "post-reset-unavailable", completed: 200, total: 200 });
    return { ...current, postReset, postResetProjection: projection };
  },
  "next-shelf": (message, options) => planNextArmoryShelf(message.saveData, options),
  "drain-before-reset": (message, options) => planResetDrainSchedule(message.saveData, "drain-before-reset", options),
  "least-wasteful": (message, options) => planResetDrainSchedule(message.saveData, "least-wasteful", options),
  "command-breakpoint": (message, options) => planRankBreakpoint(message.saveData, "command-breakpoint", options),
  purification: (message, options) => planRankBreakpoint(message.saveData, "purification", options),
  "low-attention": (message, options) => planLowAttention(message.saveData, message.intervals, message.subgoal, options),
  "support-network": (message, options) => planSpecialPlacement(message.saveData, "support-network", message.subgoal, options),
  "savage-placement": (message, options) => planSpecialPlacement(message.saveData, "savage-placement", message.subgoal, options),
  "outpost-points": (message, options) => planOutpostPointSpending(message.saveData, message.mapIdx, message.goal, options),
};

self.onmessage = (event) => {
  const message = event.data || {};
  if (message.type !== "run") return;
  const planner = planners[message.operation];
  if (!planner) {
    self.postMessage({ type: "error", requestId: message.requestId, error: `Unknown Royal planner operation: ${message.operation}` });
    return;
  }

  let lastProgressAt = 0;
  const onProgress = (progress) => {
    const now = Date.now();
    const complete = Number(progress.completed) >= Number(progress.total);
    if (!complete && now - lastProgressAt < 50) return;
    lastProgressAt = now;
    self.postMessage({ type: "progress", requestId: message.requestId, operation: message.operation, progress });
  };

  try {
    const result = planner(message, { ...(message.options || {}), onProgress });
    self.postMessage({ type: "done", requestId: message.requestId, operation: message.operation, result });
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId: message.requestId,
      operation: message.operation,
      error: String(error?.message || error),
    });
  }
};
