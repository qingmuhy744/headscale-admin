import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const env = parseEnv(readFileSync('dev/.env', 'utf8')) as Record<string, string>;
const auth = { Authorization: `Bearer ${env.TEST_API_KEY}` };

async function login(page: Page, key = env.TEST_API_KEY) {
  await page.goto('/admin/settings');
  await page.getByLabel('API URL', { exact: true }).fill('http://127.0.0.1:18080');
  await page.getByLabel('API Key', { exact: true }).fill(key);
  await page.getByRole('button', { name: 'Save Settings' }).click();
  await expect(page.getByText('Authorized', { exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => { await login(page); });

test('loads all main views without runtime errors on desktop and mobile', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [route, heading] of [
    ['', 'Home'], ['users', 'Users'], ['nodes', 'Nodes'], ['routes', 'Routes'], ['keys', 'Pre-auth Keys'], ['acls', 'ACL Builder'], ['deploy', 'Deploy'],
  ]) {
    const initialized = page.waitForResponse(response => response.url().endsWith('/api/v1/apikey') && response.status() === 200);
    await page.goto(`/admin/${route}`);
    await initialized;
    await expect(page.getByRole('main').getByText(heading, { exact: true }).first()).toBeVisible();
    if (route === 'users') await expect(page.getByRole('button').filter({ hasText: 'alice' }).first()).toBeVisible();
    if (route === 'nodes' || route === 'routes') await expect(page.getByText('test-router', { exact: true }).first()).toBeVisible();
    if (route === 'keys') {
      await expect(page.getByRole('button', { name: 'Copy pre-auth key' }).first()).toBeDisabled();
      const response = await page.request.get('/api/v1/preauthkey', { headers: auth });
      expect(await page.locator('[data-testid^="preauth-key-"]').count()).toBe((await response.json()).preAuthKeys.length);
    }
    if (route === 'acls') await expect(page.getByRole('button', { name: 'Save Config', exact: true })).toBeEnabled();
    await page.screenshot({ path: info.outputPath(`${route || 'home'}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('creates user and tag keys, shows secrets once, then expires and deletes them', async ({ page }) => {
  await page.goto('/admin/keys');
  for (const mode of ['User', 'Tags']) {
    await page.getByRole('button', { name: 'Create key', exact: true }).click();
    await page.getByRole('radio', { name: mode, exact: true }).check();
    if (mode === 'User') await page.getByRole('combobox').selectOption(env.TEST_USER_ID);
    else {
      await page.getByRole('textbox', { name: 'Key tags', exact: true }).fill('test');
      await page.getByRole('textbox', { name: 'Key tags', exact: true }).press('Enter');
    }
    const createdResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/preauthkey') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const { preAuthKey } = await (await createdResponse).json();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect((await page.getByTestId('created-key').textContent()) === preAuthKey.key).toBe(true);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(await page.evaluate(secret => JSON.stringify(localStorage).includes(secret), preAuthKey.key)).toBe(false);
    const row = page.getByTestId(`preauth-key-${preAuthKey.id}`);
    await expect(row.getByRole('button', { name: 'Copy pre-auth key' })).toBeDisabled();
    await row.getByRole('button', { name: 'Expire key', exact: true }).click();
    await row.getByRole('button', { name: 'Confirm Expire key', exact: true }).click();
    await expect(row.getByText('Expired', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'Delete key', exact: true }).click();
    await row.getByRole('button', { name: 'Confirm Delete key', exact: true }).click();
    await expect(row).toHaveCount(0);
  }
});

test('updates tags and route approval without losing the open node state', async ({ page }) => {
  const { nodes } = await (await page.request.get('/api/v1/node', { headers: auth })).json();
  const router = nodes.find((node: { givenName: string }) => node.givenName === 'test-router');
  await page.goto('/admin/nodes');
  await page.getByRole('button').filter({ hasText: 'test-router' }).click();
  await expect(page.getByText('Tagged device', { exact: true })).toBeVisible();
  const tags = page.getByRole('textbox', { name: 'Node tags', exact: true });
  await tags.fill('test');
  await tags.press('Enter');
  await page.getByRole('button', { name: 'Save tags', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save tags', exact: true })).toHaveCount(0);
  const changed = await (await page.request.get('/api/v1/node', { headers: auth })).json();
  expect(changed.nodes.find((node: { id: string }) => node.id === router.id).tags).toContain('tag:test');
  await page.getByRole('button', { name: 'Approve route 10.78.0.0/24', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Revoke route 10.78.0.0/24', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Revoke route 10.78.0.0/24', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve route 10.78.0.0/24', exact: true })).toBeVisible();
  await page.request.post(`/api/v1/node/${router.id}/tags`, { headers: auth, data: { tags: router.tags } });
});

test('preserves advanced policy fields when saving through the UI', async ({ page }) => {
  const before = JSON.parse((await (await page.request.get('/api/v1/policy', { headers: auth })).json()).policy);
  await page.goto('/admin/acls');
  const saved = page.waitForResponse(response => response.url().endsWith('/api/v1/policy') && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Save Config', exact: true }).click();
  expect((await saved).status()).toBe(200);
  const after = JSON.parse((await (await page.request.get('/api/v1/policy', { headers: auth })).json()).policy);
  expect(after).toEqual(before);
});

test('blocks policy editing after a load failure and supports retry', async ({ page }) => {
  await page.route('**/api/v1/policy', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 13, message: 'Test policy unavailable' }) }));
  await page.goto('/admin/acls');
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Config', exact: true })).toHaveCount(0);
  await page.unroute('**/api/v1/policy');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save Config', exact: true })).toBeEnabled();
});

test('requires an explicit action to draft the first policy', async ({ page }) => {
  await page.route('**/api/v1/policy', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 2, message: 'loading ACL from database: acl policy not found' }) }));
  await page.goto('/admin/acls');
  await expect(page.getByRole('button', { name: 'Save Config', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Create policy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save Config', exact: true })).toBeEnabled();
});

test('rotates an API key in Settings and stays authorized after reload', async ({ page }) => {
  const { apiKey } = await (await page.request.post('/api/v1/apikey', { headers: auth, data: { expiration: new Date(Date.now() + 3600000).toISOString() } })).json();
  await login(page, apiKey);
  const expired = page.waitForResponse(response => response.url().endsWith('/api/v1/apikey/expire'));
  await page.getByRole('button', { name: 'Refresh API Key', exact: true }).click();
  expect((await expired).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Save Settings' })).toBeEnabled();
  const replacement = await page.getByLabel('API Key', { exact: true }).inputValue();
  expect(replacement !== apiKey).toBe(true);
  await page.reload();
  await expect(page.getByText('Authorized', { exact: true })).toBeVisible();
  expect((await page.request.get('/api/v1/user', { headers: { Authorization: `Bearer ${apiKey}` } })).status()).toBe(401);
  const { apiKeys } = await (await page.request.get('/api/v1/apikey', { headers: auth })).json();
  const key = apiKeys.find((key: { prefix: string }) => replacement.startsWith(key.prefix.replace(/\*+$/, '')));
  await page.request.post('/api/v1/apikey/expire', { headers: auth, data: { id: key.id } });
});
