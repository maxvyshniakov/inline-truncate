export function validateCaptureOptions(args) {
  if (args.includes("--strict") && !args.some(arg=>arg.startsWith("--baseline=") && arg.slice(11).trim())) throw new Error("--strict requires --baseline=<capture.json>");
  const ratioArg = args.find((arg) => arg.startsWith("--max-call-ratio="));
  if (ratioArg !== undefined) {
    const value = Number(ratioArg.slice(17));
    if (!Number.isFinite(value) || value < 1) throw new Error("--max-call-ratio must be a finite number >= 1");
  }
}
