import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  babokSkillContract,
  createBabokSkillBundleLoader,
  defaultBabokSkillBundleRoot,
  qualifyBabokSkillBundle,
} from '../src/skills/babok-skill-bundle.js';

test('released BABOK skill bundle loads, verifies and qualifies', () => {
  const loader = createBabokSkillBundleLoader({ rootDir: defaultBabokSkillBundleRoot() });
  const bundle = loader.get('1.0.0');
  const profile = qualifyBabokSkillBundle({ loader, policy: { active: '1.0.0', released: ['1.0.0'] } });

  assert.equal(bundle.id, babokSkillContract.id);
  assert.equal(bundle.release, babokSkillContract.outputSchemaVersion);
  assert.match(bundle.read('SKILL.md'), /Декомпозиция требований по BABOK/);
  assert.deepEqual(profile.released.map(({ version }) => version), ['1.0.0']);
  assert.equal(profile.manifestHash, bundle.manifestHash);
});

test('BABOK skill qualification fails closed on an unqualified release or altered file', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'reqai-babok-skill-'));
  await cp(defaultBabokSkillBundleRoot(), temporary, { recursive: true });

  const loader = createBabokSkillBundleLoader({ rootDir: temporary });
  assert.throws(
    () => qualifyBabokSkillBundle({ loader, policy: { active: '2.0.0', released: ['1.0.0', '2.0.0'] } }),
    /unavailable/,
  );

  const skillPath = join(temporary, '1.0.0/SKILL.md');
  await writeFile(skillPath, `${await readFile(skillPath, 'utf8')}\nchanged`, 'utf8');
  assert.throws(() => createBabokSkillBundleLoader({ rootDir: temporary }), /hash mismatch/);
});
