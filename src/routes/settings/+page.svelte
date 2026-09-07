<script lang="ts">
	import { t, locale, setLanguage } from '$lib/i18n';
	import { ALL_THEMES, setTheme } from '$lib/common/themes';
	import {
		getTime,
		getTimeDifference,
		getTimeDifferenceColor,
		toastSuccess,
		toastError,
	} from '$lib/common/funcs';

	import { page } from '$app/state';
	import { debug } from '$lib/common/debug';
	import { createPopulateErrorHandler } from '$lib/common/errors';
	import type { ApiKeyInfo, ExpirationMessage } from '$lib/common/types';
	import Page from '$lib/page/Page.svelte';
	import PageHeader from '$lib/page/PageHeader.svelte';
	import { getToastStore } from '@skeletonlabs/skeleton';
	import { refreshApiKey } from '$lib/common/api';

	// icons
	import RawMdiContentSaveOutline from '~icons/mdi/content-save-outline';
	import RawMdiOrbit from '~icons/mdi/orbit-variant';
	import RawMdiEye from '~icons/mdi/eye-outline';
	import RawMdiEyeOff from '~icons/mdi/eye-off-outline';

	import { App } from '$lib/States.svelte';
	import { goto } from '$app/navigation';

	type Settings = {
		apiUrl: string;
		apiKey: string;
		apiTtl: number;
		theme: string;
		debug: boolean;
	};

	let settings = $state<Settings>({
		apiUrl: App.apiUrl.value,
		apiKey: App.apiKey.value,
		apiTtl: App.apiTtl.value / 1000,
		debug: App.debug.value,
		theme: App.theme.value,
	});

	const ToastStore = getToastStore();

	let apiKeyInfo = $derived(App.apiKeyInfo.value);
	let apiKeyShow = $state(false);
	let loading = $state(false);

	const apiKeyExpirationMessage: ExpirationMessage = $derived.by(() => {
		$locale;
		if (apiKeyInfo.expires !== ''){
			const td = getTimeDifference(getTime(apiKeyInfo.expires));
			return {
				message: td.message,
				color: getTimeDifferenceColor(td),
			};
		} else {
			return { message: '', color: '' };
		}
	});

	async function saveSettings(event?: Event) {
		event?.preventDefault()

		loading = true;
		try {
			if(settings.apiUrl === '') {
				settings.apiUrl = page.url.origin
			}
			App.apiUrl.value = settings.apiUrl
			App.apiKey.value = settings.apiKey
			App.apiTtl.value = settings.apiTtl * 1000
			App.debug.value = settings.debug
			App.theme.value = settings.theme
			App.apiKeyInfo.value = {
				expires: '',
				authorized: null,
				informedUnauthorized: false,
				informedExpiringSoon: false,
			};
			toastSuccess($t('ui.savedSettings'), ToastStore);
			const handler = createPopulateErrorHandler(ToastStore);
			await App.populateApiKeyInfo().catch(handler);
			await App.populateAll(handler, false);
		} catch (err) {
			debug(err);
		} finally {
			loading = false;
		}
	}
</script>

<Page classes="items-start">
	<PageHeader title={$t('settings.title')} />
	<form onsubmit={saveSettings} class="w-full max-w-3xl mx-auto py-4 px-2">
		<div class="space-y-6">
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label for="language-selector" class="label">{$t('ui.interfaceLanguage')}</label>
					<select id="language-selector" class="select mt-1" value={$locale} onchange={(event) => setLanguage(event.currentTarget.value)}>
						<option value="zh-CN">简体中文</option>
						<option value="en">English</option>
					</select>
				</div>
				<div>
					<label for="theme-selector" class="label">{$t('settings.theme')}</label>
					<select id="theme-selector" class="select mt-1" bind:value={App.theme.value} onchange={() => {
						setTheme(App.theme.value);
						settings.theme = App.theme.value;
					}}>
						{#each ALL_THEMES as theme}
							<option value={theme}>{theme === 'claude' ? $t('ui.claudeCream') : theme}</option>
						{/each}
					</select>
				</div>
			</div>
			<div>
				<label for="api-url" class="block text-lg font-medium text-surface-700 dark:text-surface-200">{$t('ui.apiUrl')}</label>
				<input
					id="api-url"
					class="mt-1 block w-full rounded-md border-surface-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-surface-700 dark:border-surface-600 dark:text-white"
					type="text"
					placeholder={page.url.origin}
					disabled={loading}
					bind:value={settings.apiUrl}
				/>
			</div>

			<div>
				<label for="api-key" class="block text-lg font-medium text-surface-700 dark:text-surface-200">{$t('ui.apiKey')}</label>
				<div class="mt-1 flex items-center">
					<input
						id="api-key"
						class="min-w-0 flex-1 rounded-md border-surface-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-surface-700 dark:border-surface-600 dark:text-white"
						type={apiKeyShow ? "text" : "password"}
						placeholder={$t('settings.apiKeyPlaceholder')}
						disabled={loading}
						bind:value={settings.apiKey}
					/>
					<button
						type="button"
						disabled={loading}
						class="ml-2 p-2 rounded-md text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200 focus:outline-none"
						onclick={() => { apiKeyShow = !apiKeyShow; }}
						aria-label={apiKeyShow ? $t('settings.hideApiKey') : $t('settings.showApiKey')}
					>
						{#if apiKeyShow}
							<RawMdiEyeOff class="w-5 h-5" />
						{:else}
							<RawMdiEye class="w-5 h-5" />
						{/if}
					</button>
					<button
						type="button"
						disabled={loading}
						class="ml-2 p-2 rounded-md text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200 focus:outline-none"
						onclick={async () => {
							loading = true;
							try {
								await refreshApiKey();
								settings.apiKey = App.apiKey.value;
								await saveSettings();
							} catch (error) {
								settings.apiKey = App.apiKey.value;
								toastError($t('ui.apiKeyRotationFailed'), ToastStore, error);
							} finally {
								loading = false;
							}
						}}
						aria-label={$t('ui.refreshApiKey')}
					>
						<RawMdiOrbit />
					</button>
				</div>
				{#if apiKeyInfo.authorized !== null}
					<div class="mt-2 text-sm">
						<span class={apiKeyInfo.authorized ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
							{apiKeyInfo.authorized ? $t('settings.authorized') : $t('settings.notAuthorized')}
						</span>
						{#if apiKeyInfo.authorized && apiKeyExpirationMessage}
							<span class="ml-2 text-surface-500 dark:text-surface-400">
								{$t('ui.expiresIn')} {apiKeyExpirationMessage.message}
							</span>
						{/if}
					</div>
				{:else if loading}
					<div class="mt-2 text-sm text-yellow-500 dark:text-yellow-400">{$t('ui.checkingAuthorization')}</div>
				{/if}
			</div>

			<div>
				<label for="api-ttl" class="block text-lg font-medium text-surface-700 dark:text-surface-200">{$t('ui.apiRefreshIntervalSeconds')}</label>
				<input
					id="api-ttl"
					class="mt-1 block w-32 rounded-md border-surface-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-surface-700 dark:border-surface-600 dark:text-white"
					type="number"
					min="1"
					disabled={loading}
					bind:value={settings.apiTtl}
				/>
			</div>

			<div class="flex items-center">
				<input
					id="debugging"
					type="checkbox"
					class="h-4 w-4 text-primary-600 border-surface-300 rounded dark:bg-surface-700 dark:border-surface-600"
					disabled={loading}
					bind:checked={settings.debug}
				/>
				<label for="debugging" class="ml-2 block text-lg text-surface-700 dark:text-surface-200">
					{$t('ui.consoleDebugging')}
				</label>
			</div>

			<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<button type="button" class="btn btn-sm rounded-md variant-ghost-primary w-full" onclick={() => console.log(JSON.stringify(App.users.value, null, 4))}>
					{$t('settings.logUsers')}
				</button>
				<button type="button" class="btn btn-sm rounded-md variant-ghost-primary w-full" onclick={() => console.log(JSON.stringify(App.nodes.value, null, 4))}>
					{$t('settings.logNodes')}
				</button>
				<button type="button" class="btn btn-sm rounded-md variant-ghost-primary w-full" onclick={() => console.log(JSON.stringify(App.preAuthKeys.value, null, 4))}>
					{$t('ui.logPreauthkeys')}
				</button>
				<button type="button" class="btn btn-sm rounded-md variant-ghost-primary w-full" onclick={() => console.log(JSON.stringify(App.apiKeyInfo.value, null, 4))}>
					{$t('ui.logApikeyInfo')}
				</button>
			</div>

			<div class="flex justify-end">
				<button
					type="submit"
					disabled={loading || !settings.apiKey}
					class="btn variant-filled-primary disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<RawMdiContentSaveOutline class="w-5 h-5 mr-2" />
					{$t('settings.save')}
				</button>
			</div>
		</div>
	</form>
</Page>
