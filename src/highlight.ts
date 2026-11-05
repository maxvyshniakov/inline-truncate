export const HIGHLIGHT_CLASS_NAME =
  "relative isolate rounded-[2px] text-[var(--text-truncate-highlight-foreground,currentColor)] before:pointer-events-none before:absolute before:inset-x-0 before:inset-y-0 before:-z-10 before:rounded-[2px] before:bg-[var(--text-truncate-highlight-background,#fde68a)]";

export function highlightedTextParts(text: string, query?: string) {
  const normalizedQuery = query?.trim().toLowerCase() ?? "";
  const normalizedText = text.toLowerCase();
  const parts: {text:string;matched:boolean;start:number}[] = [];
  if (!normalizedQuery || !normalizedText.includes(normalizedQuery)) return [{text,matched:false,start:0}];
  let cursor = 0;
  let matchIndex = normalizedText.indexOf(normalizedQuery);
  while (matchIndex >= 0) {
    if (matchIndex > cursor) parts.push({text:text.slice(cursor,matchIndex),matched:false,start:cursor});
    const matchEnd = matchIndex + normalizedQuery.length;
    parts.push({text:text.slice(matchIndex,matchEnd),matched:true,start:matchIndex});
    cursor = matchEnd;
    matchIndex = normalizedText.indexOf(normalizedQuery,cursor);
  }
  if (cursor < text.length) parts.push({text:text.slice(cursor),matched:false,start:cursor});
  return parts;
}
