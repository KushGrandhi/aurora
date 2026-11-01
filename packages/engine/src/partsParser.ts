export type Meta = { title?: string; summary?: string };

/**
 * Incremental parser for the streamed LLM document `{ title, summary?, parts: [...] }`.
 * Calls onPart as soon as each element of the top-level `parts` array closes.
 */
export function createPartsParser(h: { onMeta(m: Meta): void; onPart(raw: unknown): void }) {
  let buf = "";
  let pos = 0;
  let depth = 0;
  let inString = false;
  let escape = false;
  let stringStart = -1;
  let expectKey = false; // at depth 1: next string is a key
  let key: string | undefined; // current depth-1 key
  let elementStart = -1;
  let partsStarted = false;
  let metaDeferred = false;
  let closed = false;
  const meta: Meta = {};

  function onStringClosed(end: number) {
    const raw = buf.slice(stringStart, end + 1);
    if (depth === 1 && expectKey) {
      key = JSON.parse(raw);
      expectKey = false;
    } else if (depth === 1 && (key === "title" || key === "summary")) {
      meta[key] = JSON.parse(raw);
      if (partsStarted) metaDeferred = true;
      else h.onMeta({ ...meta });
    }
  }

  function scan() {
    for (; pos < buf.length; pos++) {
      const ch = buf[pos];
      if (inString) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') {
          inString = false;
          onStringClosed(pos);
        }
        continue;
      }
      switch (ch) {
        case '"':
          inString = true;
          stringStart = pos;
          break;
        case "{":
        case "[":
          if (depth === 2 && key === "parts" && ch === "{") elementStart = pos;
          if (depth === 1 && key === "parts") partsStarted = true;
          depth++;
          if (depth === 1) expectKey = true;
          break;
        case "}":
        case "]":
          depth--;
          if (depth === 2 && key === "parts" && elementStart >= 0 && ch === "}") {
            h.onPart(JSON.parse(buf.slice(elementStart, pos + 1)));
            elementStart = -1;
          }
          if (depth === 0) closed = true;
          break;
        case ",":
          if (depth === 1) expectKey = true;
          break;
      }
    }
  }

  return {
    push(chunk: string) {
      buf += chunk;
      scan();
    },
    end(): { complete: boolean } {
      if (metaDeferred) h.onMeta({ ...meta });
      return { complete: closed };
    },
  };
}
