import { readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

/**
 * What this process calls itself, and which build it is.
 *
 * Both are needed in two places that must agree — the structured log's
 * `service` field and the health endpoint's body — so they are decided once,
 * here, rather than as two string literals that drift.
 */

/**
 * The name in every log record and in the health response.
 *
 * `zycart-api`, not `zycart`: a log aggregator holding lines from the API, the
 * drain and the frontend needs to tell them apart, and "zycart" would be true
 * of all three.
 */
export const SERVICE_NAME = 'zycart-api';

/**
 * The version, from `package.json`, read once.
 *
 * ## Why not a constant in this file
 *
 * Because it would be wrong. A version literal in source is a version literal
 * somebody forgets to bump, and a health endpoint that confidently reports a
 * build it is not running is worse than one that reports nothing.
 *
 * ## Why not git
 *
 * `git describe` on every health request would fork a process per check, and
 * on a built artefact there is usually no `.git` to ask. `package.json` ships
 * with the code, is already the repository's declared version, and is readable
 * without spawning anything.
 *
 * ## Why a search rather than a fixed path
 *
 * This module is loaded from `src/` under `tsx` and from `dist/` after a build,
 * and the two sit at different depths. Walking up to the nearest
 * `zycart-backend` manifest is correct in both, and in a future layout neither
 * of them anticipated.
 *
 * Failure is not an error. A missing or unreadable manifest yields `null`, the
 * field is omitted from the health response, and nothing else changes — a
 * version string is a convenience, and no request should fail for want of one.
 */
function readVersion(): string | null {
  let directory = __dirname;
  const { root } = parse(directory);

  // Bounded rather than `while (true)`: a symlink loop must not hang a process.
  for (let depth = 0; depth < 8; depth += 1) {
    try {
      const manifest: unknown = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));

      if (typeof manifest === 'object' && manifest !== null) {
        const { name, version } = manifest as { name?: unknown; version?: unknown };

        // Only this package's own manifest. Walking past it into a monorepo
        // root would report the workspace's version as the API's.
        if (name === 'zycart-backend' && typeof version === 'string') return version;
      }
    } catch {
      // No manifest at this level, or an unreadable one. Keep walking.
    }

    if (directory === root) break;
    directory = dirname(directory);
  }

  return null;
}

/** Resolved at import, so no health request pays for it. */
export const SERVICE_VERSION: string | null = readVersion();
