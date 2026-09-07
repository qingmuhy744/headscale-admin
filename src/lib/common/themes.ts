export const DEFAULT_THEME = 'claude';

export const ALL_THEMES = [
	'claude',
	'skeleton',
	'wintry',
	'modern',
	'rocket',
	'seafoam',
	'vintage',
	'sahara',
	'hamlindigo',
	'gold-nouveau',
	'crimson',
];

export function setTheme(theme: string) {
	document.body.setAttribute('data-theme', ALL_THEMES.includes(theme) ? theme : DEFAULT_THEME)
}
