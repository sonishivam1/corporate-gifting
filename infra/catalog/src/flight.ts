/**
 * Reads the React Server Components ("flight") payload that a Next.js App
 * Router page embeds in `self.__next_f.push([1, "…"])` scripts. The payload is
 * rows of `<hex id>:<json>`, and a string `"$<hex id>"` inside a row refers
 * to another row. Storefronts put their product and category data here.
 */
export type FlightRows = Map<string, unknown>;

export function flightRows(html: string): FlightRows {
  let flight = "";
  for (const match of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)) {
    try {
      const chunk = JSON.parse(match[1]!) as unknown[];
      if (chunk[0] === 1 && typeof chunk[1] === "string") flight += chunk[1];
    } catch {
      // Not a data chunk.
    }
  }
  const rows: FlightRows = new Map();
  for (const line of flight.split("\n")) {
    const match = /^([0-9a-f]+):(.*)$/.exec(line);
    if (!match) continue;
    try {
      rows.set(match[1]!, JSON.parse(match[2]!));
    } catch {
      // Text, module and hint rows are not JSON.
    }
  }
  return rows;
}

/** Replaces `"$<id>"` references with the rows they name ("$$" is a literal "$"). */
export function resolveRefs(value: unknown, rows: FlightRows, depth = 0): unknown {
  if (depth > 40) return value;
  if (typeof value === "string") {
    const ref = /^\$([0-9a-f]+)$/.exec(value);
    if (ref && rows.has(ref[1]!)) return resolveRefs(rows.get(ref[1]!), rows, depth + 1);
    return value.startsWith("$$") ? value.slice(1) : value;
  }
  if (Array.isArray(value)) return value.map((item) => resolveRefs(item, rows, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveRefs(item, rows, depth + 1)]));
  }
  return value;
}

/** The object rows that have every one of `keys`, with references resolved. */
export function findObjects(rows: FlightRows, keys: readonly string[]): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  for (const row of rows.values()) {
    if (row && typeof row === "object" && !Array.isArray(row) && keys.every((key) => key in row)) {
      found.push(resolveRefs(row, rows) as Record<string, unknown>);
    }
  }
  return found;
}
