/** Turns a display name into a URL-safe slug: "Ray-Ban Wayfarer" -> "ray-ban-wayfarer". */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/**
 * Appends a counter until the slug is free. `exists` is supplied by the caller so
 * this stays independent of any particular collection.
 */
export async function uniqueSlug(
  value: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(value) || 'item';

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    if (!(await exists(candidate))) return candidate;
  }

  return `${base}-${Date.now()}`;
}
