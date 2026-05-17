import type { StateUpdate } from "@/agents/types";

export type Subscriber = (update: StateUpdate) => void;

const subscribers = new Map<string, Set<Subscriber>>();

export function emitReportUpdate(reportId: string, update: StateUpdate): void {
  const set = subscribers.get(reportId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(update);
    } catch {
      // subscriber errors must never break the swarm
    }
  }
}

export function addReportSubscriber(reportId: string, fn: Subscriber): () => void {
  let set = subscribers.get(reportId);
  if (!set) {
    set = new Set();
    subscribers.set(reportId, set);
  }
  set.add(fn);

  return () => {
    set?.delete(fn);
    if (set && set.size === 0) {
      subscribers.delete(reportId);
    }
  };
}
