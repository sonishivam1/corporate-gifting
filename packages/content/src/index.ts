import { STRINGS } from "./strings";

export { STRINGS, type ContentKey } from "./strings";

export type ContentValues = Record<string, string | number>;

/**
 * The text people read: gift emails, the redemption page, portal wording.
 * Code never contains literal text; it asks for a key. Hardcoded strings are
 * the first adapter; a headless CMS adapter can return the same keys later.
 */
export interface ContentProvider {
  /** The text for `key` with `{placeholders}` filled from `values`. Throws a ContentError if the key or a value is missing. */
  getContent(key: string, values?: ContentValues): Promise<string>;
}

export class ContentError extends Error {
  constructor(
    readonly code: "missing_key" | "missing_value",
    message: string,
  ) {
    super(message);
    this.name = "ContentError";
  }
}

/** Fills `{name}` placeholders. A placeholder with no value is an error, so a typo never reaches a recipient. */
export function renderTemplate(template: string, values: ContentValues = {}): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = values[name];
    if (value === undefined) throw new ContentError("missing_value", `No value for {${name}}.`);
    return String(value);
  });
}

/** A content provider backed by a plain map of key to template. Used by tests and by the hardcoded adapter. */
export function createMemoryContent(strings: Readonly<Record<string, string>>): ContentProvider {
  return {
    async getContent(key, values) {
      const template = strings[key];
      if (template === undefined) throw new ContentError("missing_key", `No content for ${key}.`);
      return renderTemplate(template, values);
    },
  };
}

/** The hardcoded content adapter: the platform's built-in strings behind the content contract. */
export function createStaticContent(): ContentProvider {
  return createMemoryContent(STRINGS);
}
