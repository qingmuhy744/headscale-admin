import { browser } from '$app/environment';
import { addMessages, init, locale, _ } from 'svelte-i18n';
import { get } from 'svelte/store';
import en from './locales/en.json';
import zh from './locales/zh-CN.json';

export const LOCALES = ['zh-CN', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'zh-CN';

export function normalizeLocale(value: unknown): Locale {
	return typeof value === 'string' && /^en(?:-|$)/i.test(value) ? 'en' : DEFAULT_LOCALE;
}

function initialLocale(): Locale {
	if (browser) {
		try {
			return normalizeLocale(JSON.parse(localStorage.getItem('locale') ?? 'null'));
		} catch {
			return DEFAULT_LOCALE;
		}
	}
	return DEFAULT_LOCALE;
}

addMessages('en', en);
addMessages('zh-CN', zh);
init({ fallbackLocale: 'en', initialLocale: initialLocale(), warnOnMissingMessages: true });

export function setLanguage(value: string) {
	const language = normalizeLocale(value);
	locale.set(language);
	if (browser) {
		document.documentElement.lang = language;
		localStorage.setItem('locale', JSON.stringify(language));
	}
}

export function translate(id: string, options?: { values?: Record<string, string | number> }) {
	return get(_)(id, options);
}

export { _ as t, locale };
