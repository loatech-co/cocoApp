import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readDeployVersion } from './deploy-version';

const SHA = 'abcdef0123456789abcdef0123456789abcdef01';

describe('deploy version', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'coco-version-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** A clone like hbuilds leaves it, with the code a few folders below. */
  function clone(): string {
    mkdirSync(join(root, '.git', 'refs', 'heads'), { recursive: true });
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/Dev\n');
    const code = join(root, 'api', 'dist');
    mkdirSync(code, { recursive: true });
    return code;
  }

  it('reads the short SHA of the branch HEAD points to', () => {
    const code = clone();
    writeFileSync(join(root, '.git', 'refs', 'heads', 'Dev'), `${SHA}\n`);
    expect(readDeployVersion(code)).toBe('abcdef0');
  });

  it('finds the ref in packed-refs when it is not loose', () => {
    const code = clone();
    writeFileSync(join(root, '.git', 'packed-refs'), `# pack-refs\n${SHA} refs/heads/Dev\n`);
    expect(readDeployVersion(code)).toBe('abcdef0');
  });

  it('reads a detached HEAD', () => {
    const code = clone();
    writeFileSync(join(root, '.git', 'HEAD'), `${SHA}\n`);
    expect(readDeployVersion(code)).toBe('abcdef0');
  });

  it('says unknown without a repository, and never anything else', () => {
    expect(readDeployVersion(root)).toMatch(/^([0-9a-f]{7}|unknown)$/);
    const code = clone(); // HEAD points to a branch that does not exist
    expect(readDeployVersion(code)).toBe('unknown');
  });
});
