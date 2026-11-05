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
