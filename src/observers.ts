// --- Shared document.fonts listener hub ---
// Reading `document.fonts.ready` is expensive and attaching per-instance event
// listeners across hundreds of virtualized rows creates unnecessary churn.
// Share one listener pair per FontFaceSet and one pending `ready` promise.
let boundFontSet: FontFaceSet | undefined;
let pendingFontsPromise: Promise<unknown> | null | undefined;
const fontSubscribers = new Set<() => void>();

function notifyFontSubscribers() {
  for (const subscriber of fontSubscribers) subscriber();
}

function watchPendingFontsReady() {
  if (typeof document === "undefined" || !document.fonts) return;
  if (document.fonts.status === "loaded") return;
  if (pendingFontsPromise === undefined) {
    const currentFonts = document.fonts;
    const ready = currentFonts.ready;
    pendingFontsPromise = ready;
    void ready.then(() => {
      if (pendingFontsPromise === ready) pendingFontsPromise = undefined;
      if (boundFontSet === currentFonts) notifyFontSubscribers();
    });
  }
}

export function subscribeFonts(onFontsChanged: () => void): () => void {
  const fonts = typeof document === "undefined" ? undefined : document.fonts;
  if (!fonts) return () => {};
  if (boundFontSet !== fonts) {
    boundFontSet?.removeEventListener?.("loading", watchPendingFontsReady);
    boundFontSet?.removeEventListener?.("loadingdone", notifyFontSubscribers);
    pendingFontsPromise = undefined;
    boundFontSet = fonts;
    boundFontSet.addEventListener?.("loading", watchPendingFontsReady);
    boundFontSet.addEventListener?.("loadingdone", notifyFontSubscribers);
  }
  fontSubscribers.add(onFontsChanged);
  watchPendingFontsReady();
  return () => {
    fontSubscribers.delete(onFontsChanged);
    if (fontSubscribers.size === 0 && boundFontSet) {
      boundFontSet.removeEventListener?.("loading", watchPendingFontsReady);
      boundFontSet.removeEventListener?.("loadingdone", notifyFontSubscribers);
      boundFontSet = undefined;
      pendingFontsPromise = undefined;
    }
  };
}

// --- Shared ResizeObserver hub ---
let sharedRoCtor: typeof ResizeObserver | undefined;
let sharedRo: ResizeObserver | null = null;
const observedElements = new Map<Element, () => void>();

export function observeResize(element: Element, onResize: () => void): () => void {
  const Ctor = typeof ResizeObserver === "undefined" ? undefined : ResizeObserver;
  if (!Ctor) return () => {};
  if (sharedRoCtor !== Ctor || !sharedRo) {
    sharedRo?.disconnect();
    sharedRoCtor = Ctor;
    sharedRo = new Ctor((entries) => {
      if (!entries || entries.length === 0) {
        for (const cb of observedElements.values()) cb();
        return;
      }
      for (let i = 0; i < entries.length; i++) {
        const cb = observedElements.get(entries[i].target);
        if (cb) cb();
      }
    });
    for (const el of observedElements.keys()) sharedRo.observe(el);
  }
  observedElements.set(element, onResize);
  sharedRo.observe(element);
  return () => {
    if (observedElements.get(element) === onResize) {
      observedElements.delete(element);
      sharedRo?.unobserve?.(element);
      if (observedElements.size === 0 && sharedRo) {
        sharedRo.disconnect();
        sharedRo = null;
        sharedRoCtor = undefined;
      }
    }
  };
}

// --- Shared device-pixel-ratio (resolution) listener hub ---
// Each matching/DOM-measured instance needs to remeasure when DPR changes,
// but creating a MediaQueryList per instance scales O(N) with visible rows.
// Share one matchMedia query per Window and rebind it once on change.
type ResolutionWindow = Pick<Window, "matchMedia" | "devicePixelRatio">;

interface ResolutionHub {
  matchMedia: ResolutionWindow["matchMedia"] | undefined;
  query: MediaQueryList | undefined;
  subscribers: Set<() => void>;
  onChange: () => void;
  bind: () => void;
  unbind: () => void;
}

const resolutionHubs = new WeakMap<ResolutionWindow, ResolutionHub>();

export function subscribeResolutionChange(
  win: ResolutionWindow | undefined,
  onResolutionChanged: () => void,
): () => void {
  if (!win || typeof win.matchMedia !== "function") return () => {};
  let hub = resolutionHubs.get(win);
  if (!hub) {
    const subscribers = new Set<() => void>();
    const unbind = () => {
      hub!.query?.removeEventListener?.("change", hub!.onChange);
      hub!.query = undefined;
    };
    const bind = () => {
      unbind();
      hub!.matchMedia = win.matchMedia;
      hub!.query = win.matchMedia?.(`(resolution: ${win.devicePixelRatio}dppx)`);
      hub!.query?.addEventListener?.("change", hub!.onChange);
    };
    const onChange = () => {
      unbind();
      try {
        for (const subscriber of Array.from(subscribers)) {
          if (subscribers.has(subscriber)) subscriber();
        }
      } finally {
        if (subscribers.size > 0 && !hub!.query) {
          bind();
        }
      }
    };
    hub = { matchMedia: undefined, query: undefined, subscribers, onChange, bind, unbind };
    resolutionHubs.set(win, hub);
  }

  hub.subscribers.add(onResolutionChanged);
  if (!hub.query || hub.matchMedia !== win.matchMedia) {
    hub.bind();
  }

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    hub!.subscribers.delete(onResolutionChanged);
    if (hub!.subscribers.size === 0) {
      hub!.unbind();
      resolutionHubs.delete(win);
    }
  };
}
