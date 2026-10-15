import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadAll } from 'js-yaml';

const documents = (name) => readFile(new URL(`../../deploy/k8s/base/${name}.yaml`, import.meta.url), 'utf8').then((text) => loadAll(text));
test('deployment roles receive only their scoped secrets and Nginx has writable runtime volumes', async () => {
  const docs = [...await documents('platform'), ...await documents('workers')];
  const secrets = new Map(docs.filter((d) => d.kind === 'Secret').map((d) => [d.metadata.name, Object.keys(d.stringData)]));
  const deployments = docs.filter((d) => d.kind === 'Deployment');
  for (const d of deployments) {
    const keys = d.spec.template.spec.containers.flatMap((c) => (c.envFrom || []).flatMap((env) => secrets.get(env.secretRef?.name) || []));
    const allowed = ['reqai-api', 'reqai-decomposition-worker', 'reqai-research-worker'].includes(d.metadata.name);
    assert.equal(keys.includes('ZAI_API_KEY'), allowed, d.metadata.name);
    if (d.metadata.name !== 'reqai-api') assert.equal(keys.includes('IAM_CLIENT_SECRET'), false, d.metadata.name);
  }
  const pod = deployments.find((d) => d.metadata.name === 'reqai-frontend').spec.template.spec;
  assert.equal(pod.securityContext.runAsUser, 101);
  assert.equal(pod.securityContext.fsGroup, 101);
  const nginx = pod.containers[0];
  assert.equal(nginx.securityContext.readOnlyRootFilesystem, true);
  for (const path of ['/var/cache/nginx', '/var/run']) {
    const mount = nginx.volumeMounts.find((v) => v.mountPath === path);
    assert.ok(mount);
    assert.ok(pod.volumes.find((v) => v.name === mount.name).emptyDir);
  }
});
