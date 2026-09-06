import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const envPath = new URL('.env', import.meta.url);
const env = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};
const compose = (...args) => execFileSync('docker', ['compose', '-f', 'dev/compose.yaml', ...args], { cwd: root, encoding: 'utf8' });
const cli = (...args) => compose('exec', '-T', 'headscale', 'headscale', ...args).trim();
compose('up', '-d', '--wait', 'headscale');
if (!cli('version').includes('v0.29.2')) throw new Error('Expected the pinned Headscale v0.29.2 test server');

async function api(path, method = 'GET', body) {
  const response = await fetch(`http://127.0.0.1:18081/api/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.TEST_API_KEY}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Test API ${method} ${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

try { await api('apikey'); }
catch { env.TEST_API_KEY = cli('apikeys', 'create', '--expiration', '24h'); }
const users = (await api('user')).users;
for (const name of ['alice', 'bob']) {
  if (!users.some(user => user.name === name)) users.push((await api('user', 'POST', { name })).user);
}
env.TEST_USER_ID = users.find(user => user.name === 'alice').id;
const policy = readFileSync(new URL('policy.json', import.meta.url), 'utf8');
// User-based policy tests require registered nodes, so apply them after client startup.
const initialPolicy = JSON.parse(policy);
delete initialPolicy.tests;
await api('policy/check', 'POST', { policy: JSON.stringify(initialPolicy) });
await api('policy', 'PUT', { policy: JSON.stringify(initialPolicy) });

const keys = (await api('preauthkey')).preAuthKeys;
for (const [variable, ownership] of [
  ['TEST_USER_AUTHKEY', { user: env.TEST_USER_ID }],
  ['TEST_ROUTER_AUTHKEY', { aclTags: ['tag:router'] }],
]) {
  if (!keys.some(key => env[variable]?.startsWith(key.key.replace(/\*+$/, '')) && new Date(key.expiration).getTime() > Date.now())) {
    const { preAuthKey } = await api('preauthkey', 'POST', {
      ...ownership, reusable: true, expiration: new Date(Date.now() + 86400000).toISOString(),
    });
    env[variable] = preAuthKey.key;
  }
}
writeFileSync(envPath, Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
compose('--profile', 'clients', 'up', '-d', 'user-node', 'router-node');
for (let attempt = 0; attempt < 60; attempt++) {
  const nodes = (await api('node')).nodes;
  if (['test-user', 'test-router'].every(name => nodes.some(node => node.givenName === name && node.online))) {
    await api('policy/check', 'POST', { policy });
    await api('policy', 'PUT', { policy });
    console.log('Headscale v0.29.2 is ready with two online test nodes. Credentials: dev/.env (local only).');
    process.exit(0);
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
throw new Error('Test clients did not become online within 60 seconds');
