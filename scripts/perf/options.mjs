export function validateCaptureOptions(args) {
  if (args.includes("--strict") && !args.some(arg=>arg.startsWith("--baseline=") && arg.slice(11).trim())) throw new Error("--strict requires --baseline=<capture.json>");
}
