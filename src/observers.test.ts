import { describe, expect, it, vi } from "vitest";
import { subscribeResolutionChange } from "./observers";

function createFakeWindow(initialDpr = 1) {
  let dpr = initialDpr;
  const queries: { media: string; listeners: Set<() => void> }[] = [];
  const matchMedia = vi.fn((media: string) => {
    const query = { media, listeners: new Set<() => void>() };
    queries.push(query);
    return {
      media,
      matches: true,
      addEventListener: (_type: string, listener: () => void) => query.listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => query.listeners.delete(listener),
    } as unknown as MediaQueryList;
  });
  const win = {
    get devicePixelRatio() {
      return dpr;
    },
    matchMedia,
  };
  const live = () => queries.filter((query) => query.listeners.size > 0);
  const change = (next: number) => {
    dpr = next;
    for (const query of live()) {
      for (const listener of Array.from(query.listeners)) listener();
    }
  };
  return { win, matchMedia, live, change };
}

describe("subscribeResolutionChange", () => {
  it("shares one matchMedia query across DPR 1 -> 2 -> 3 and cleans up on last unsubscribe", () => {
    const { win, matchMedia, live, change } = createFakeWindow(1);
    const a = vi.fn();
    const b = vi.fn();

    const unsubA = subscribeResolutionChange(win, a);
    const unsubB = subscribeResolutionChange(win, b);

    expect(matchMedia).toHaveBeenCalledTimes(1);
    expect(live()).toHaveLength(1);
    expect(live()[0].media).toBe("(resolution: 1dppx)");
    expect(live()[0].listeners.size).toBe(1);

    change(2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(matchMedia).toHaveBeenCalledTimes(2);
    expect(live()).toHaveLength(1);
    expect(live()[0].media).toBe("(resolution: 2dppx)");

    change(3);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);
    expect(matchMedia).toHaveBeenCalledTimes(3);
    expect(live()).toHaveLength(1);
    expect(live()[0].media).toBe("(resolution: 3dppx)");

    unsubA();
    expect(live()).toHaveLength(1);
    // Double unsubscribe is a safe no-op.
    unsubA();
    expect(live()).toHaveLength(1);

    unsubB();
    expect(live()).toHaveLength(0);
  });

  it("handles a subscriber unsubscribing another mid-callback", () => {
    const { win, live, change } = createFakeWindow(1);
    const b = vi.fn();
    let unsubB = () => {};
    const a = vi.fn(() => unsubB());

    const unsubA = subscribeResolutionChange(win, a);
    unsubB = subscribeResolutionChange(win, b);

    change(2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(live()).toHaveLength(1);
    expect(live()[0].media).toBe("(resolution: 2dppx)");

    unsubA();
    expect(live()).toHaveLength(0);
  });

  it("handles a new subscriber joining mid-callback without double-binding", () => {
    const { win, matchMedia, live, change } = createFakeWindow(1);
    const c = vi.fn();
    let unsubC = () => {};
    const a = vi.fn(() => {
      unsubC = subscribeResolutionChange(win, c);
    });

    const unsubA = subscribeResolutionChange(win, a);
    change(2);

    expect(a).toHaveBeenCalledTimes(1);
    expect(c).not.toHaveBeenCalled();
    expect(matchMedia).toHaveBeenCalledTimes(2);
    expect(live()).toHaveLength(1);
    expect(live()[0].media).toBe("(resolution: 2dppx)");

    change(3);
    expect(c).toHaveBeenCalledTimes(1);

    unsubA();
    unsubC();
    expect(live()).toHaveLength(0);
  });

  it("does not rebind when the last subscriber unsubscribes mid-callback", () => {
    const { win, matchMedia, live, change } = createFakeWindow(1);
    let unsub = () => {};
    const a = vi.fn(() => unsub());

    unsub = subscribeResolutionChange(win, a);
    expect(matchMedia).toHaveBeenCalledTimes(1);

    change(2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(matchMedia).toHaveBeenCalledTimes(1);
    expect(live()).toHaveLength(0);
  });

  it("still rebinds for the new DPR when a subscriber throws", () => {
    const { win, matchMedia, live, change } = createFakeWindow(1);
    const boom = vi.fn(() => {
      throw new Error("subscriber failure");
    });

    const unsub = subscribeResolutionChange(win, boom);
    expect(() => change(2)).toThrow("subscriber failure");

    expect(matchMedia).toHaveBeenCalledTimes(2);
    expect(live()).toHaveLength(1);
    expect(live()[0].media).toBe("(resolution: 2dppx)");

    unsub();
    expect(live()).toHaveLength(0);
  });

  it("returns a no-op unsubscribe when window or matchMedia is unavailable", () => {
    const unsubUndef = subscribeResolutionChange(undefined, vi.fn());
    const unsubNoMatch = subscribeResolutionChange(
      { devicePixelRatio: 1, matchMedia: undefined as unknown as Window["matchMedia"] },
      vi.fn(),
    );
    expect(() => unsubUndef()).not.toThrow();
    expect(() => unsubNoMatch()).not.toThrow();
  });

  it("isolates hubs per window instance", () => {
    const winA = createFakeWindow(1);
    const winB = createFakeWindow(2);
    const cbA = vi.fn();
    const cbB = vi.fn();

    const unsubA = subscribeResolutionChange(winA.win, cbA);
    const unsubB = subscribeResolutionChange(winB.win, cbB);

    expect(winA.live()[0].media).toBe("(resolution: 1dppx)");
    expect(winB.live()[0].media).toBe("(resolution: 2dppx)");

    winA.change(3);
    expect(cbA).toHaveBeenCalledTimes(1);
    expect(cbB).not.toHaveBeenCalled();

    unsubA();
    expect(winA.live()).toHaveLength(0);
    expect(winB.live()).toHaveLength(1);

    unsubB();
    expect(winB.live()).toHaveLength(0);
  });
});
