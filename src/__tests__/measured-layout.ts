import { act } from "@testing-library/react";
import { vi } from "vitest";

const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
const originalRO = globalThis.ResizeObserver;

// A ResizeObserver that reports nothing by itself: `deliverResize` hands an
// observation to every live observer watching the target, as a browser would
// after the element's box changed.
export const liveResizeObservers = new Set<FakeResizeObserver>();

export class FakeResizeObserver {
  private readonly targets = new Set<Element>();

  constructor(private readonly callback: ResizeObserverCallback) {
    liveResizeObservers.add(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
    liveResizeObservers.delete(this);
  }

  deliver(target: Element) {
    if (!this.targets.has(target)) return;
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
}

export function stubResizeObserver() {
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
}

export function deliverResize(target: Element) {
  act(() => {
    for (const observer of liveResizeObservers) observer.deliver(target);
  });
}

export function stubDocumentFonts(
  status: "loaded" | "loading",
  readySpy: () => void,
  ready: () => Promise<unknown> = () => Promise.resolve(),
) {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      status,
      get ready() {
        readySpy();
        return ready();
      },
    },
  });
}

export function resetMeasuredLayoutGlobals() {
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else delete (document as unknown as { fonts?: unknown }).fonts;
  globalThis.ResizeObserver = originalRO;
  liveResizeObservers.clear();
}

export interface MeasuredLayoutOptions {
  characterWidth?: number;
  queuedFrames?: boolean;
  stubRect?: boolean;
  stubFonts?: boolean;
}

export function stubMeasuredLayout(width: number, options: MeasuredLayoutOptions = {}) {
  let currentWidth = width;
  let characterWidth = options.characterWidth ?? 10;
  stubResizeObserver();
  if (options.stubFonts !== false) {
    stubDocumentFonts("loaded", () => {});
  }
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => currentWidth);
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "",
    measureText: (value: string) => ({ width: value.length * characterWidth }),
  } as unknown as CanvasRenderingContext2D);
  if (options.stubRect) {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { width: (this.textContent?.length ?? 0) * characterWidth, height: 16 } as DOMRect;
    });
  }
  const frames: FrameRequestCallback[] = [];
  const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    if (options.queuedFrames) {
      frames.push(callback);
      return frames.length;
    }
    callback(0);
    return 1;
  });
  const flush = () => act(() => {
    while (frames.length) frames.shift()!(0);
  });
  return {
    getContext,
    requestAnimationFrame,
    flush,
    setWidth: (next: number) => {
      currentWidth = next;
    },
    setCharacterWidth: (next: number) => {
      characterWidth = next;
    },
    deliverResize,
  };
}
