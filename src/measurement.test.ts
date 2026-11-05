import { afterEach, expect, it, vi } from "vitest";
import { createMeasurementSession } from "./measurement";

afterEach(() => vi.restoreAllMocks());

it("measures disabled optical sizing with a native probe that preserves it", () => {
  const source = document.createElement("span");
  source.style.fontOpticalSizing = "none";
  source.dataset.truncateOriginal = "Draft";
  document.body.append(source);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "", measureText: (text: string) => ({ width: text.length }),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { width: (this.textContent?.length ?? 0) * (this.style.fontOpticalSizing === "none" ? 2 : 1) } as DOMRect;
  });
  const session = createMeasurementSession(source, getComputedStyle(source));
  try {
    expect(session.measureText("Draft")).toBe(10);
  } finally {
    session.dispose();
    source.remove();
  }
});
