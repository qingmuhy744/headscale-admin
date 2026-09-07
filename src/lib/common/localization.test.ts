import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('$lib/States.svelte', () => import('../../../tests/app'));
import { App } from '../../../tests/app';
import { get } from 'svelte/store';
import { locale, normalizeLocale, setLanguage, t } from '$lib/i18n';
import en from '$lib/locales/en.json';
import zh from '$lib/locales/zh-CN.json';
import { ACLBuilder } from './acl.svelte';
import { apiDelete } from './api';
import { getTimeDifference } from './funcs';
import { claudeTheme } from './claude-theme';

function flatten(value: object, prefix = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) =>
    typeof entry === 'string' ? [[prefix + key, entry]] : Object.entries(flatten(entry, prefix + key + '.')),
  ));
}

afterEach(() => { setLanguage('en'); vi.unstubAllGlobals(); });

describe('localization', () => {
  it('provides matching dictionaries and formats every message in both languages', () => {
    const english = flatten(en);
    expect(Object.keys(flatten(zh)).sort()).toEqual(Object.keys(english).sort());
    for (const language of ['en', 'zh-CN']) {
      setLanguage(language);
      for (const key of Object.keys(english)) {
        const rendered = get(t)(key, { values: { v0: 'example', v1: 'renamed', name: 'alice', number: 2 } });
        expect(rendered.trim(), key).not.toBe('');
        expect(rendered, key).not.toBe(key);
        expect(rendered, key).not.toMatch(/\{(?:v\d+|name|number)\}/);
      }
    }
  });

  it('uses Chinese by default and normalizes supported locale preferences', () => {
    expect(normalizeLocale(null)).toBe('zh-CN');
    expect(normalizeLocale('zh-Hans')).toBe('zh-CN');
    expect(normalizeLocale('en-US')).toBe('en');
    setLanguage('unsupported');
    expect(get(locale)).toBe('zh-CN');
  });

  it('formats relative dates using the selected language', () => {
    setLanguage('zh-CN');
    expect(getTimeDifference(120000, 0).message).toBe('2分钟后');
    setLanguage('en');
    expect(getTimeDifference(0, 120000).message).toBe('2 minutes ago');
  });

  it.each(['en', 'zh-CN'])('keeps HTTP methods and policy fields unchanged in %s', async language => {
    setLanguage(language);
    App.apiUrl.value = 'http://headscale.test';
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await apiDelete('/api/v1/preauthkey?id=7');
    expect(fetch.mock.calls[0][1].method).toBe('DELETE');
    const policy = { tagOwners: { 'tag:router': ['alice@'] }, grants: [{ src: ['alice@'], dst: ['*'], ip: ['*'] }] };
    expect(JSON.parse(ACLBuilder.fromPolicy(policy).JSON())).toEqual(policy);
  });
});

describe('Claude theme', () => {
  const properties = claudeTheme.properties;
  const rgb = (key: string) => String(properties[key as keyof typeof properties]).split(' ').map(Number);
  function luminance(color: number[]) {
    return color.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  }
  function contrast(a: number[], b: number[]) {
    const levels = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (levels[0] + 0.05) / (levels[1] + 0.05);
  }
  it('defines valid RGB tokens for every color', () => {
    for (const [key, value] of Object.entries(properties)) {
      if (!key.startsWith('--color-')) continue;
      expect(value, key).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
      expect(rgb(key).every(channel => channel >= 0 && channel <= 255), key).toBe(true);
    }
  });
  it('keeps body text and filled action labels readable', () => {
    expect(contrast(rgb('--color-surface-900'), rgb('--color-surface-50'))).toBeGreaterThan(10);
    for (const color of ['primary', 'secondary', 'tertiary', 'success', 'warning', 'error']) {
      expect(contrast(rgb('--on-' + color), rgb('--color-' + color + '-500')), color).toBeGreaterThanOrEqual(4.5);
    }
  });
});
