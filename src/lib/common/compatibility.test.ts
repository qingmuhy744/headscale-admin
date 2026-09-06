import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
vi.mock('$lib/States.svelte', () => import('../../../tests/app'));
import { App } from '../../../tests/app';
import { ACLBuilder } from './acl.svelte';
import { getPolicyUser, hasKeySecret, isNode, matchesApiKey, nodeBelongsToUser, type ApiKey, type Node, type PreAuthKey, type User } from './types';
import { apiGet, createNode, createPreAuthKey, deletePreAuthKey, expirePreAuthKey, getPreAuthKeys, refreshApiKey, setNodeTags, setPolicy } from './api';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  App.apiUrl.value = 'http://headscale.test';
  App.apiKey.value = 'hskey-api-current-secret';
  App.apiKeyInfo.value.authorized = null;
});
afterEach(() => vi.unstubAllGlobals());

describe('Headscale 0.29.2 API contract', () => {
  it('lists all pre-auth keys once and filters nullable owners locally', async () => {
    const keys = [{ id: '1', user: { id: '10' } }, { id: '2', user: { id: '20' } }, { id: '3', user: null }];
    fetchMock.mockResolvedValueOnce(json({ preAuthKeys: keys }));
    expect(await getPreAuthKeys(['10', '20'])).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://headscale.test/api/v1/preauthkey');
  });

  it('expires pre-auth keys by ID and deletes them through the query parameter', async () => {
    const key = { id: '7', key: 'hskey-auth-masked-***', user: null } as PreAuthKey;
    fetchMock.mockImplementation(async () => json({}));
    App.preAuthKeys.value = [key];
    await expirePreAuthKey(key);
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ id: '7' });
    await deletePreAuthKey(key);
    expect(fetchMock.mock.calls[1][0]).toBe('http://headscale.test/api/v1/preauthkey?id=7');
    expect(fetchMock.mock.calls[1][1]!.method).toBe('DELETE');
    expect(App.preAuthKeys.value).toEqual([]);
  });

  it('creates a tag-owned pre-auth key without a user ID', async () => {
    fetchMock.mockResolvedValueOnce(json({ preAuthKey: { id: '1' } }));
    await createPreAuthKey(null, false, true, '2030-01-01', ['router']);
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
      aclTags: ['tag:router'], ephemeral: false, reusable: true, expiration: '2030-01-01T00:00:00.000Z',
    });
    await expect(createPreAuthKey(null, false, false, '2030-01-01')).rejects.toThrow('Select a user');
  });

  it('sends JSON headers and respects explicit authorization overrides', async () => {
    fetchMock.mockResolvedValueOnce(json({}));
    await apiGet('/api/v1/apikey', { headers: { Authorization: 'Bearer replacement' } });
    const headers = new Headers(fetchMock.mock.calls[0][1]!.headers);
    expect(headers.get('Authorization')).toBe('Bearer replacement');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Accept')).toBe('application/json');
  });

  it.each(['Unauthorized', '{"code":16,"message":"expired"}', 'proxy error'])('handles HTTP 401 regardless of its body: %s', async body => {
    App.apiKeyInfo.value.authorized = true;
    fetchMock.mockResolvedValueOnce(new Response(body, { status: 401 }));
    await expect(apiGet('/api/v1/node')).rejects.toThrow();
    expect(App.apiKeyInfo.value.authorized).toBe(false);
  });

  it('retains authorization for ordinary validation failures and exposes the backend message', async () => {
    App.apiKeyInfo.value.authorized = true;
    fetchMock.mockResolvedValueOnce(json({ code: 3, message: 'invalid tag' }, 400));
    await expect(apiGet('/api/v1/node')).rejects.toThrow('invalid tag');
    expect(App.apiKeyInfo.value.authorized).toBe(true);
  });

  it('does not deauthorize the current session when testing a different key fails', async () => {
    App.apiKeyInfo.value.authorized = true;
    fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    await expect(apiGet('/api/v1/apikey', { headers: { Authorization: 'Bearer invalid' } })).rejects.toThrow();
    expect(App.apiKeyInfo.value.authorized).toBe(true);
  });

  it('encodes registration tokens and usernames', async () => {
    fetchMock.mockResolvedValueOnce(json({ node: { givenName: 'test' } }));
    await createNode('hskey-reg-a+b/c=', 'a&b');
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('key')).toBe('hskey-reg-a+b/c=');
    expect(url.searchParams.get('user')).toBe('a&b');
  });

  it('rejects removing all node tags before issuing a request', async () => {
    await expect(setNodeTags({ id: '1' } as Node, [])).rejects.toThrow('retain at least one tag');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not save a policy that fails the server check', async () => {
    fetchMock.mockResolvedValueOnce(json({ code: 3, message: 'policy rejected' }, 400));
    await expect(setPolicy(ACLBuilder.emptyACL())).rejects.toThrow('policy rejected');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://headscale.test/api/v1/policy/check');
  });

  it('verifies a replacement API key and switches before expiring the current key by ID', async () => {
    fetchMock.mockResolvedValueOnce(json({ apiKeys: [{ id: '1', prefix: 'hskey-api-current-***' }] }))
      .mockResolvedValueOnce(json({ apiKey: 'hskey-api-new-secret' }))
      .mockResolvedValueOnce(json({ apiKeys: [{ id: '2', prefix: 'hskey-api-new-***' }] }))
      .mockImplementationOnce(async (_url, init) => {
        expect(App.apiKey.value).toBe('hskey-api-new-secret');
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer hskey-api-new-secret');
        expect(JSON.parse(init!.body as string)).toEqual({ id: '1' });
        return json({});
      });
    await refreshApiKey();
    expect(new Headers(fetchMock.mock.calls[2][1]!.headers).get('Authorization')).toBe('Bearer hskey-api-new-secret');
  });

  it('keeps the current key when replacement verification fails', async () => {
    fetchMock.mockResolvedValueOnce(json({ apiKeys: [{ id: '1', prefix: 'hskey-api-current-***' }] }))
      .mockResolvedValueOnce(json({ apiKey: 'hskey-api-new-secret' }))
      .mockResolvedValueOnce(json({ apiKeys: [] }));
    await expect(refreshApiKey()).rejects.toThrow('could not be verified');
    expect(App.apiKey.value).toBe('hskey-api-current-secret');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retains the verified new key and reports failed revocation', async () => {
    fetchMock.mockResolvedValueOnce(json({ apiKeys: [{ id: '1', prefix: 'hskey-api-current-***' }] }))
      .mockResolvedValueOnce(json({ apiKey: 'hskey-api-new-secret' }))
      .mockResolvedValueOnce(json({ apiKeys: [{ id: '2', prefix: 'hskey-api-new-***' }] }))
      .mockResolvedValueOnce(json({ code: 13, message: 'temporary failure' }, 500));
    await expect(refreshApiKey()).rejects.toThrow('New key is active');
    expect(App.apiKey.value).toBe('hskey-api-new-secret');
  });
});

describe('ownership and masked keys', () => {
  it('formats local and OIDC users as policy identifiers', () => {
    expect(getPolicyUser({ name: 'alice', email: '' } as User)).toBe('alice@');
    expect(getPolicyUser({ name: 'bob', email: 'bob@example.com' } as User)).toBe('bob@example.com');
    expect(getPolicyUser({ name: 'alice@example.com', email: '' } as User)).toBe('alice@example.com');
    expect(getPolicyUser({ name: '', email: '', providerId: 'https://idp.example/sub' } as User)).toBe('https://idp.example/sub@');
  });
  it('recognizes 0.29.2 nodes without the removed lastSuccessfulUpdate field', () => {
    const node = { id: '1', name: 'test', createdAt: '2026-01-01', ipAddresses: [] };
    expect(isNode(node)).toBe(true);
  });
  it.each([null, { id: '1', name: 'TaggedDevices' }])('excludes tagged devices from user counts, owner=%j', user => {
    expect(nodeBelongsToUser({ tags: ['tag:router'], user } as Node, '1')).toBe(false);
  });
  it('matches both legacy and new masked API key prefixes', () => {
    expect(matchesApiKey({ prefix: 'legacy***' } as ApiKey, 'legacy.secret')).toBe(true);
    expect(matchesApiKey({ prefix: 'hskey-api-new-***' } as ApiKey, 'hskey-api-new-secret')).toBe(true);
    expect(matchesApiKey({ prefix: '***' } as ApiKey, 'anything')).toBe(false);
    expect(matchesApiKey({ prefix: 'other***' } as ApiKey, 'legacy.secret')).toBe(false);
  });
  it('does not treat a masked key as a usable secret', () => {
    expect(hasKeySecret('hskey-auth-prefix-***')).toBe(false);
    expect(hasKeySecret('  ')).toBe(false);
    expect(hasKeySecret('hskey-auth-prefix-secret')).toBe(true);
  });
});

describe('policy preservation', () => {
  const advanced = {
    grants: [{ src: ['group:dev'], dst: ['tag:router'], ip: ['*'] }],
    groups: { 'group:dev': ['alice@'] }, tagOwners: { 'tag:router': ['group:dev'] },
    hosts: { lan: '10.77.0.0/24' },
    autoApprovers: { routes: { '10.77.0.0/24': ['tag:router'] } },
    nodeAttrs: [{ target: ['*'], attr: ['randomize-client-port'] }],
    tests: [{ src: 'group:dev', accept: ['lan:80'] }],
    ssh: [{ action: 'check' as const, checkPeriod: '12h', acceptEnv: ['LANG'], src: ['alice@'], dst: ['autogroup:self'], users: ['root'] }],
  };
  it('round-trips grants-only policies without adding an empty acls field', () => {
    const builder = ACLBuilder.fromPolicy(advanced);
    expect(JSON.parse(builder.JSON())).toEqual(advanced);
    expect(JSON.parse(builder.clone().JSON())).toEqual(advanced);
  });
  it('preserves advanced fields and SSH options when editing supported sections', () => {
    const builder = ACLBuilder.fromPolicy(advanced);
    builder.createGroup('new');
    builder.setSshRule(0, { action: 'check', src: ['bob@'], dst: ['autogroup:self'], users: ['root'] });
    const result = JSON.parse(builder.JSON());
    expect(result.grants).toEqual(advanced.grants);
    expect(result.autoApprovers).toEqual(advanced.autoApprovers);
    expect(result.nodeAttrs).toEqual(advanced.nodeAttrs);
    expect(result.tests).toEqual(advanced.tests);
    expect(result.ssh[0]).toMatchObject({ checkPeriod: '12h', acceptEnv: ['LANG'], src: ['bob@'] });
  });
  it.each(['tag', 'group', 'host'])('blocks deleting or renaming a %s used by advanced fields', kind => {
    const builder = ACLBuilder.fromPolicy(advanced);
    const actions = kind === 'tag' ? [() => builder.deleteTag('router'), () => builder.renameTag('router', 'new')]
      : kind === 'group' ? [() => builder.deleteGroup('dev'), () => builder.renameGroup('dev', 'new')]
      : [() => builder.deleteHost('lan'), () => builder.renameHost('lan', 'new')];
    for (const action of actions) expect(action).toThrow('still reference');
    expect(JSON.parse(builder.JSON())).toEqual(advanced);
  });
  it('retains an explicitly empty acls array', () => {
    expect(JSON.parse(ACLBuilder.fromPolicy({ acls: [] }).JSON())).toEqual({ acls: [] });
  });
  it.each(['null', '[]', '{"acls": {}}', '{"groups": []}'])('rejects malformed policy structure: %s', input => {
    expect(() => ACLBuilder.fromPolicy(input)).toThrow();
  });
});
