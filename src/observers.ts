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
