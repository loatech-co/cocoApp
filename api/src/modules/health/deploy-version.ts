import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/**
 * Which commit is running, as the short SHA `/health` reports.
 *
 * ── Where it comes from ────────────────────────────────────────────────────
 * hbuilds deploys a git CLONE (`hbuilds/current/nodejs` keeps its `.git`), so
 * the answer is already on disk next to the code. It is read from the files
 * —`HEAD`, the ref it points to, `packed-refs`— and not by running `git`: no
 * child process in a plan whose process quota is tiny, and no dependency on a
 * build step having written something first.
 *
 * Once, when the module loads. A request never touches the disk for this.
 *
 * If there is no repository, the answer is `unknown`: a health check that
 * failed because of its version would be reporting the wrong problem.
 */
const SHORT = 7;
const UNKNOWN = 'unknown';

export function readDeployVersion(start: string = __dirname): string {
  try {
    const gitDir = findGitDir(start);
    if (!gitDir) return UNKNOWN;
    const sha = resolveHead(gitDir);
    return sha && /^[0-9a-f]{40,64}$/.test(sha) ? sha.slice(0, SHORT) : UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}

/** The `.git` directory above `start`; a worktree's `.git` FILE is followed. */
function findGitDir(start: string): string | null {
  let current = resolve(start);
  for (;;) {
    const candidate = join(current, '.git');
    if (existsSync(candidate)) {
      if (statSync(candidate).isDirectory()) return candidate;
      const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(candidate, 'utf8'))?.[1]?.trim();
      if (!pointer) return null;
      return isAbsolute(pointer) ? pointer : resolve(current, pointer);
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function resolveHead(gitDir: string): string | null {
  const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
  const ref = /^ref:\s*(.+)$/.exec(head)?.[1];
  if (!ref) return head; // detached: HEAD is the SHA itself

  // A worktree keeps its refs in the main repository (`commondir`).
  const commonFile = join(gitDir, 'commondir');
  const common = existsSync(commonFile)
    ? resolve(gitDir, readFileSync(commonFile, 'utf8').trim())
    : gitDir;

  for (const dir of [gitDir, common]) {
    const loose = join(dir, ref);
    if (existsSync(loose)) return readFileSync(loose, 'utf8').trim();
  }

  const packed = join(common, 'packed-refs');
  if (!existsSync(packed)) return null;
  const line = readFileSync(packed, 'utf8')
    .split('\n')
    .find((entry) => entry.endsWith(` ${ref}`));
  return line?.split(' ')[0] ?? null;
}
