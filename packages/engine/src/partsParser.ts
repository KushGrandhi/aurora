function parseOr<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export type Meta = { title?: string; summary?: string };

/**
 * Incremental parser for the streamed LLM document `{ title, summary?, parts: [...] }`.
 * Calls onPart as soon as each element of the top-level `parts` array closes.
 */
export function createPartsParser(h: { onMeta(m: Meta): void; onPart(raw: unknown): void; onBadPart?(raw: string): void }) {
  let buf = "";
  let pos = 0;
  let depth = 0;
  const stack: string[] = []; // open containers, to skip closers that don't match (models occasionally emit a stray brace)
  let inString = false;
  let escape = false;
  let stringStart = -1;
  let expectKey = false; // at depth 1: next string is a key
  let key: string | undefined; // current depth-1 key
  let elementStart = -1;
  let partsStarted = false;
  let metaDeferred = false;
  let closed = false;
  let ended = false;
  const PART_START = /^\{\s*"kind"\s*:/;
  const CLOSER: Record<string, string> = { "{": "}", "[": "]" };

  function emitElement(text: string) {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      h.onBadPart?.(text);
      return;
    }
    h.onPart(value);
  }
  const meta: Meta = {};

  function onStringClosed(end: number) {
    const raw = buf.slice(stringStart, end + 1);
    if (depth === 1 && expectKey) {
      key = parseOr(raw, raw.slice(1, -1));
      expectKey = false;
    } else if (depth === 1 && (key === "title" || key === "summary")) {
      const value = parseOr<string | undefined>(raw, undefined);
      if (value === undefined) return;
      meta[key] = value;
      if (partsStarted) metaDeferred = true;
      else h.onMeta({ ...meta });
    }
  }

  function scan() {
    for (; pos < buf.length && !closed; pos++) {
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
          // A new part starting inside an unfinished one means the model dropped closers: close it for them.
          if (ch === "{" && key === "parts" && depth > 2 && elementStart >= 0) {
            const rest = buf.slice(pos, pos + 16);
            if (rest.length < 16 && !ended && !rest.includes(":")) return; // wait for enough text to decide
            if (PART_START.test(rest)) {
              const text = buf.slice(elementStart, pos).replace(/[\s,]+$/, "") + stack.slice(2).reverse().map((c) => CLOSER[c]).join("");
              emitElement(text);
              stack.length = 2;
              depth = 2;
              elementStart = -1;
            }
          }
          if (depth === 2 && key === "parts" && ch === "{") elementStart = pos;
          if (depth === 1 && key === "parts") partsStarted = true;
          stack.push(ch);
          depth++;
          if (depth === 1) expectKey = true;
          break;
        case "}":
        case "]":
          if (stack[stack.length - 1] !== (ch === "}" ? "{" : "[")) break; // stray closer: ignore it
          stack.pop();
          depth--;
          if (depth === 2 && key === "parts" && elementStart >= 0 && ch === "}") {
            emitElement(buf.slice(elementStart, pos + 1));
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
      ended = true;
      scan();
      if (metaDeferred) h.onMeta({ ...meta });
      return { complete: closed };
    },
  };
}
