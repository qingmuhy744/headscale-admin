import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
vi.mock('$lib/States.svelte', () => import('./app'));
import { App } from './app';
import { ACLBuilder } from '../src/lib/common/acl.svelte';
import { getPolicyUser, hasKeySecret, isNode, matchesApiKey, nodeBelongsToUser, type ApiNode, type PreAuthKey } from '../src/lib/common/types';
import { apiDelete, apiGet, apiPost, createApiKey, createNode, createPreAuthKey, createUser, deleteNode, deletePreAuthKey, deleteUser, disableRoutes, enableRoutes, expireApiKey, expireNode, expirePreAuthKey, getApiKeys, getNodes, getPolicy, getPreAuthKeys, getUsers, refreshApiKey, renameNode, renameUser, setNodeTags, setPolicy } from '../src/lib/common/api';

describe.skipIf(process.env.HEADSCALE_INTEGRATION !== '1')('real Headscale v0.29.2', () => {
  let bootstrapKey: string;
  beforeAll(() => {
    const version = execFileSync('docker', ['compose', '-f', 'dev/compose.yaml', 'exec', '-T', 'headscale', 'headscale', 'version'], { encoding: 'utf8' });
    expect(version).toContain('v0.29.2');
    bootstrapKey = (parseEnv(readFileSync('dev/.env', 'utf8')) as Record<string, string>).TEST_API_KEY;
    // The integration target is deliberately fixed to the isolated local Compose stack.
    App.apiUrl.value = 'http://127.0.0.1:18081';
    App.apiKey.value = bootstrapKey;
  });

  it('lists real user-owned and tag-owned nodes and masked keys', async () => {
    const users = await getUsers();
    const alice = users.find(user => user.name === 'alice')!;
    const nodes = await getNodes();
    expect(nodes.filter(node => nodeBelongsToUser(node, alice.id))).toHaveLength(1);
    const router = nodes.find(node => node.givenName === 'test-router')!;
    expect(isNode(router)).toBe(true);
    expect(router.tags).toEqual(['tag:router']);
    expect(nodeBelongsToUser(router, alice.id)).toBe(false);
    const keys = await getPreAuthKeys();
    expect(keys.some(key => key.user === null && key.aclTags.includes('tag:router'))).toBe(true);
    expect(keys.every(key => !hasKeySecret(key.key))).toBe(true);
    expect(new Set(keys.map(key => key.id)).size).toBe(keys.length);
    expect((await getApiKeys()).some(key => matchesApiKey(key, bootstrapKey))).toBe(true);
  });

  it('creates, renames and deletes a user, and creates/expires/deletes both key types', async () => {
    let user = await createUser(`compat-${Date.now()}`);
    const created: PreAuthKey[] = [];
    try {
      user = await renameUser(user, `${user.name}-renamed`);
      expect((await getUsers(undefined, { id: user.id }))[0].name).toBe(user.name);
      for (const owner of [user, null]) {
        const key = await createPreAuthKey(owner, false, true, new Date(Date.now() + 3600000), owner ? [] : ['tag:test']);
        created.push(key);
        expect(hasKeySecret(key.key)).toBe(true);
        const listed = (await getPreAuthKeys()).find(item => item.id === key.id)!;
        expect(hasKeySecret(listed.key)).toBe(false);
        expect(listed.user?.id || null).toBe(owner?.id || null);
        await expirePreAuthKey(listed);
        const expired = (await getPreAuthKeys()).find(item => item.id === key.id)!;
        expect(new Date(expired.expiration!).getTime()).toBeLessThanOrEqual(Date.now());
      }
    } finally {
      for (const key of created) await deletePreAuthKey(key);
      expect(await deleteUser(user)).toBe(true);
    }
    expect((await getPreAuthKeys()).some(key => created.some(item => item.id === key.id))).toBe(false);
  });

  it('registers, renames, expires, tags and deletes a disposable node', async () => {
    const user = await createUser(`register-${Date.now()}`);
    const registrationKey = `hskey-authreq-${randomBytes(18).toString('base64url')}`;
    execFileSync('docker', ['compose', '-f', 'dev/compose.yaml', 'exec', '-T', 'headscale', 'headscale', 'debug', 'create-node', '--name', 'compat-register', '--user', user.name, '--key', registrationKey], { encoding: 'utf8' });
    let node;
    try {
      node = await createNode(registrationKey, user.name);
      expect(nodeBelongsToUser(node, user.id)).toBe(true);
      node = await renameNode(node, 'compat-renamed');
      expect(node.givenName).toBe('compat-renamed');
      node = await expireNode(node);
      expect(new Date(node.expiry!).getTime()).toBeLessThanOrEqual(Date.now());
      node = await setNodeTags(node, ['test']);
      expect(node.tags).toEqual(['tag:test']);
      expect(nodeBelongsToUser(node, user.id)).toBe(false);
      await expect(apiPost(`/api/v1/node/${node.id}/tags`, { tags: [] })).rejects.toThrow();
    } finally {
      if (node) expect(await deleteNode(node)).toBe(true);
      expect(await deleteUser(user)).toBe(true);
    }
  });

  it('approves and revokes real advertised subnet and exit routes', async () => {
    let router = (await getNodes()).find(node => node.givenName === 'test-router')!;
    const original = [...router.approvedRoutes];
    expect(router.availableRoutes).toEqual(expect.arrayContaining(['10.78.0.0/24', '0.0.0.0/0', '::/0']));
    App.nodes.value = [router];
    try {
      await enableRoutes(router, '10.78.0.0/24', '0.0.0.0/0', '::/0');
      router = (await getNodes()).find(node => node.id === router.id)!;
      expect(router.approvedRoutes).toEqual(expect.arrayContaining(['10.78.0.0/24', '0.0.0.0/0', '::/0']));
      await disableRoutes(router, '10.78.0.0/24', '0.0.0.0/0', '::/0');
      expect((await getNodes()).find(node => node.id === router.id)!.approvedRoutes).not.toContain('10.78.0.0/24');
    } finally {
      await apiPost<ApiNode>(`/api/v1/node/${router.id}/approve_routes`, { routes: original });
    }
  });

  it('checks and saves a grants-only policy without losing advanced fields', async () => {
    await apiPost('/api/v1/policy/check', { policy: ACLBuilder.defaultACL().JSON() });
    const before = ACLBuilder.fromPolicy(await getPolicy());
    const edited = before.clone();
    edited.createHost('integration-test', '10.79.0.0/24');
    const member = getPolicyUser((await getUsers()).find(user => user.name === 'alice')!);
    edited.createGroup('integration-members');
    edited.setGroupMembers('integration-members', [member]);
    edited.createTag('integration-tag');
    edited.setTagOwners('integration-tag', [member]);
    edited.createPolicy({ action: 'accept', src: [member], dst: ['tag:integration-tag:*'] });
    try {
      await setPolicy(edited);
      const saved = JSON.parse(await getPolicy());
      const original = JSON.parse(before.JSON());
      for (const field of ['grants', 'ssh', 'nodeAttrs', 'autoApprovers', 'tests']) expect(saved[field]).toEqual(original[field]);
      expect(saved.acls[0].src).toEqual(['alice@']);
      expect(saved.groups['group:integration-members']).toEqual(['alice@']);
      expect(saved.hosts['integration-test']).toBe('10.79.0.0/24');
    } finally {
      await setPolicy(before);
    }
  });

  it('rotates a disposable API key and verifies that only the replacement remains usable', async () => {
    const original = await createApiKey();
    const oldId = (await getApiKeys()).find(key => matchesApiKey(key, original))!.id;
    let newId;
    try {
      App.apiKey.value = original;
      await refreshApiKey();
      const replacement = App.apiKey.value;
      expect(replacement === original).toBe(false);
      newId = (await getApiKeys()).find(key => matchesApiKey(key, replacement))!.id;
      await expect(apiGet('/api/v1/user', { headers: { Authorization: `Bearer ${original}` } })).rejects.toThrow();
      expect((await getUsers()).length).toBeGreaterThan(0);
    } finally {
      App.apiKey.value = bootstrapKey;
      await expireApiKey(oldId);
      if (newId) await expireApiKey(newId);
    }
  });
});
