import {afterEach,expect,it,vi} from "vitest";
import {createMeasurementSession} from "./measurement";
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();document.body.replaceChildren();});
function fixture(doc=document) { const el=doc.createElement("span");el.dataset.truncateOriginal="emoji-🪑-filename.pdf";doc.body.append(el);return el; }
it("does not acquire source box geometry until a native cache miss requires it",()=>{
 const element=fixture();const computed=window.getComputedStyle(element);
 const styles=vi.spyOn(window,"getComputedStyle");
 const session=createMeasurementSession(element,computed);
 expect(styles).toHaveBeenCalledTimes(0);
 session.verifyText!("emoji-🪑...pdf");
 expect(styles).toHaveBeenCalledTimes(2);
 session.dispose();
});
it("reuses one document root, synchronously removes text, and removes the empty root after the callback batch",()=>{
 vi.useFakeTimers();const element=fixture();const computed=window.getComputedStyle(element);
 const appends=vi.spyOn(document.body,"append");
 const a=createMeasurementSession(element,computed);a.verifyText!("first-🪑.pdf");
 const root=document.body.lastElementChild as HTMLElement;
 expect(root.style.contain).toBe("layout style");
 a.dispose();expect(root.childNodes).toHaveLength(0);expect(root.textContent).toBe("");
 expect(root.isConnected).toBe(true);
 const b=createMeasurementSession(element,computed);b.verifyText!("second-🪑.pdf");
 expect(document.body.lastElementChild).toBe(root);expect(appends).toHaveBeenCalledTimes(1);
 b.dispose();b.dispose();expect(root.childNodes).toHaveLength(0);
 vi.runAllTimers();expect(root.isConnected).toBe(false);expect(document.body.children).toHaveLength(1);
 const c=createMeasurementSession(element,computed);c.verifyText!("third-🪑.pdf");
 expect(document.body.lastElementChild).not.toBe(root);c.dispose();vi.runAllTimers();
});
it("keeps simultaneous sessions isolated and never cleans an active root",()=>{
 vi.useFakeTimers();const element=fixture();const computed=window.getComputedStyle(element);
 const a=createMeasurementSession(element,computed),b=createMeasurementSession(element,computed);
 a.verifyText!("first-🪑.pdf");const root=document.body.lastElementChild as HTMLElement;
 b.verifyText!("second-🪑.pdf");expect(root.children).toHaveLength(2);
 a.dispose();expect(root.children).toHaveLength(1);expect(root.textContent).toBe("second-🪑.pdf");
 vi.runAllTimers();expect(root.isConnected).toBe(true);
 b.dispose();expect(root.childNodes).toHaveLength(0);vi.runAllTimers();expect(root.isConnected).toBe(false);
});
it("owns separate roots and cleanup per document",()=>{
 vi.useFakeTimers();const other=document.implementation.createHTMLDocument("other");
 const first=fixture(),second=fixture(other);
 const a=createMeasurementSession(first,window.getComputedStyle(first));
 const b=createMeasurementSession(second,window.getComputedStyle(second));
 a.verifyText!("first-🪑.pdf");b.verifyText!("second-🪑.pdf");
 const root=document.body.lastElementChild as HTMLElement,otherRoot=other.body.lastElementChild as HTMLElement;
 expect(root).not.toBe(otherRoot);expect(root.ownerDocument).toBe(document);expect(otherRoot.ownerDocument).toBe(other);
 a.dispose();vi.runAllTimers();expect(root.isConnected).toBe(false);expect(otherRoot.parentElement).toBe(other.body);
 b.dispose();expect(otherRoot.textContent).toBe("");vi.runAllTimers();expect(other.body.children).toHaveLength(1);
});
