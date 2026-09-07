<script lang="ts">
	import { locale, setLanguage, t } from '$lib/i18n';
	import RawMdiTranslate from '~icons/mdi/translate';
	import RawMdiChevronDown from '~icons/mdi/chevron-down';
</script>

<label
	class="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-surface-400 hover:bg-surface-200 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary-500 dark:border-surface-600 dark:hover:bg-surface-700 sm:w-28 sm:justify-start sm:gap-2 sm:px-2"
	title={$t('ui.changeLanguage')}
>
	<RawMdiTranslate class="pointer-events-none h-4 w-4 shrink-0" />
	<span class="pointer-events-none hidden flex-1 text-sm sm:inline" aria-hidden="true">
		{$locale === 'en' ? 'English' : '中文'}
	</span>
	<RawMdiChevronDown class="pointer-events-none hidden h-4 w-4 shrink-0 sm:block" />
	<select
		aria-label={$t('ui.changeLanguage')}
		class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
		value={$locale}
		onchange={(event) => setLanguage(event.currentTarget.value)}
	>
		<option value="zh-CN">简体中文</option>
		<option value="en">English</option>
	</select>
</label>
