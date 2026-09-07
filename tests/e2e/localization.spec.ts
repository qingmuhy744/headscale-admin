import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const env = parseEnv(readFileSync('dev/.env', 'utf8')) as Record<string, string>;
const auth = { Authorization: `Bearer ${env.TEST_API_KEY}` };

async function login(page: Page) {
  await page.goto('/admin/settings/');
  await page.getByLabel('API 地址', { exact: true }).fill('http://127.0.0.1:18080');
  await page.getByLabel('API 密钥', { exact: true }).fill(env.TEST_API_KEY);
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.getByText('授权有效', { exact: true })).toBeVisible();
}

test('defaults to Chinese and light Claude, and remembers language and theme changes', async ({ page }, info) => {
  await page.goto('/admin/settings/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'claude');
  await expect(page.locator('#theme-selector')).toHaveValue('claude');
  await page.locator('#language-selector').selectOption('en');
  await expect(page.getByRole('main').getByText('Settings', { exact: true })).toBeVisible();
  await page.locator('#theme-selector').selectOption('wintry');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'wintry');
  await page.locator('#theme-selector').selectOption('claude');
  await page.locator('#language-selector').selectOption('zh-CN');
  await page.getByRole('switch', { name: 'Light Switch', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'claude');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: info.outputPath('claude-dark-settings.png'), fullPage: true, animations: 'disabled' });
});

test('retains previously selected themes and mode on upgrade', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('theme', JSON.stringify('skeleton'));
    localStorage.setItem('modeUserPrefers', 'false');
    localStorage.setItem('modeCurrent', 'false');
  });
  await page.goto('/admin/settings/');
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'skeleton');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('#theme-selector')).toHaveValue('skeleton');
});

test('renders all Chinese views without missing translations or overflow', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.text().includes('svelte-i18n')) errors.push(message.text()); });
  await login(page);
  for (const [route, heading] of [
    ['', '首页'], ['users', '用户'], ['nodes', '节点'], ['routes', '路由'],
    ['keys', '预授权密钥'], ['acls', 'ACL 管理'], ['deploy', '部署'], ['settings', '设置'],
  ]) {
    await page.goto(`/admin/${route}/`.replace('//', '/'));
    await expect(page.getByRole('main').getByText(heading, { exact: true }).first()).toBeVisible();
    if (route === '') await expect(page.getByRole('button').filter({ hasText: '用户总数' })).toContainText('2');
    if (route === 'users') {
      await page.getByRole('button').filter({ hasText: 'alice' }).first().click();
      await expect(page.getByText('预授权密钥：', { exact: true })).toBeVisible();
    }
    if (route === 'deploy') await expect(page.getByText('出口节点', { exact: true }).first()).toBeVisible();
    if (route === 'acls') await expect(page.getByRole('button', { name: '保存配置', exact: true })).toBeEnabled();
    await page.screenshot({ path: info.outputPath(`zh-${route || 'home'}.png`), fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('sorts users, nodes and routes by name with Chinese labels', async ({ page }) => {
  const { nodes } = await (await page.request.get('/api/v1/node', { headers: auth })).json();
  const users = ['zeta', 'alpha'].map((name, index) => ({ id: String(index + 1), name, createdAt: '2026-09-01T00:00:00Z' }));
  await page.route('**/api/v1/user', route => route.fulfill({ json: { users } }));
  await page.route('**/api/v1/node', route => route.fulfill({ json: { nodes: users.map((user, index) => ({
    ...nodes[index], id: user.id, user, name: user.name, givenName: user.name,
    availableRoutes: [`10.77.${index}.0/24`],
  })) } }));
  await login(page);
  for (const route of ['users', 'nodes', 'routes']) {
    await page.goto(`/admin/${route}/`);
    const entries = page.getByRole('button', { name: /ID:\s*[12]\s+(?:alpha|zeta)/ });
    await expect(entries).toHaveText([/zeta/, /alpha/]);
    await page.getByRole('button', { name: '名称', exact: true }).click();
    await expect(entries).toHaveText([/alpha/, /zeta/]);
    await page.getByRole('button', { name: '名称', exact: true }).click();
    await expect(entries).toHaveText([/zeta/, /alpha/]);
    await page.getByRole('button', { name: 'ID', exact: true }).click();
    await expect(entries).toHaveText([/zeta/, /alpha/]);
  }
});

test('performs key lifecycle and policy saves with Chinese labels and unchanged API values', async ({ page }) => {
  await login(page);
  await page.goto('/admin/keys/');
  let keyId: string | undefined;
  try {
    await page.getByRole('button', { name: '创建密钥', exact: true }).click();
    await page.getByRole('radio', { name: '标签', exact: true }).check();
    await page.getByRole('textbox', { name: '密钥标签', exact: true }).fill('test');
    await page.getByRole('textbox', { name: '密钥标签', exact: true }).press('Enter');
    const created = page.waitForResponse(response => response.url().endsWith('/api/v1/preauthkey') && response.request().method() === 'POST');
    await page.getByRole('button', { name: '创建', exact: true }).click();
    const response = await created;
    expect(response.request().postDataJSON().aclTags).toEqual(['tag:test']);
    keyId = (await response.json()).preAuthKey.id;
    await page.getByRole('button', { name: '完成', exact: true }).click();
    const row = page.getByTestId(`preauth-key-${keyId}`);
    await row.getByRole('button', { name: '使密钥过期', exact: true }).click();
    await row.getByRole('button', { name: '确认 使密钥过期', exact: true }).click();
    await expect(row.getByText('已过期', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: '删除密钥', exact: true }).click();
    await row.getByRole('button', { name: '确认 删除密钥', exact: true }).click();
    await expect(row).toHaveCount(0);
    keyId = undefined;
  } finally {
    if (keyId) await page.request.delete(`/api/v1/preauthkey?id=${keyId}`, { headers: auth });
  }
  const before = JSON.parse((await (await page.request.get('/api/v1/policy', { headers: auth })).json()).policy);
  await page.goto('/admin/acls/');
  const saved = page.waitForResponse(response => response.url().endsWith('/api/v1/policy') && response.request().method() === 'PUT');
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  expect((await saved).status()).toBe(200);
  const after = JSON.parse((await (await page.request.get('/api/v1/policy', { headers: auth })).json()).policy);
  expect(after).toEqual(before);
});
