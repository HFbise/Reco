import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Metro picks foo.web.ts on the web and foo.native.ts on phones, but TypeScript only checks
// the plain foo.ts that callers import. A value missing from a platform file is therefore
// only found when it's called: logout broke on the web this way (unregisterPushToken).

const SRC = join(__dirname, '..', '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** Names a module exports at runtime (types and interfaces don't count). */
function runtimeExports(path: string): Set<string> {
  const code = readFileSync(path, 'utf8');
  const names = new Set<string>();
  for (const m of code.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|enum)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(m[1]);
  }
  for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && !name.startsWith('type ')) names.add(name);
    }
  }
  return names;
}

test('every platform file exports what its shared counterpart does', () => {
  const variants = files(SRC).filter((p) => /\.(web|native)\.tsx?$/.test(p));
  assert.ok(variants.length > 0);
  for (const variant of variants) {
    const base = [variant.replace(/\.(web|native)\.(tsx?)$/, '.$2'), variant.replace(/\.(web|native)\.tsx?$/, '.tsx'),
      variant.replace(/\.(web|native)\.tsx?$/, '.ts')].find(existsSync);
    if (!base) continue;
    const missing = [...runtimeExports(base)].filter((name) => !runtimeExports(variant).has(name));
    assert.deepEqual(missing, [], `${variant.slice(SRC.length + 1)} lacks exports of ${base.slice(SRC.length + 1)}`);
  }
});
