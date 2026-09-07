<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { hasKeySecret, type PreAuthKey } from '$lib/common/types';
	import RawMdiClipboard from '~icons/mdi/clipboard-outline';
	import RawMdiClock from '~icons/mdi/clock-remove-outline';
	import { getToastStore } from '@skeletonlabs/skeleton';
	import { copyToClipboard, isExpired } from '$lib/common/funcs';
	import Delete from '$lib/parts/Delete.svelte';
	import { expirePreAuthKey, deletePreAuthKey } from '$lib/common/api';
	import { App } from '$lib/States.svelte';
	import { onMount } from 'svelte';
	let { preAuthKey }: { preAuthKey: PreAuthKey } = $props();
	const toastStore = getToastStore();
	let now = $state(Date.now());
	const expired = $derived.by(() => { void now; return isExpired(preAuthKey.expiration); });
	onMount(() => {
		const timer = setInterval(() => now = Date.now(), 1000);
		return () => clearInterval(timer);
	});
</script>

<div data-testid="preauth-key-{preAuthKey.id}" class="flex flex-wrap items-start justify-between gap-3 py-4 w-full min-w-0">
	<div class="min-w-0 grow basis-64 space-y-2">
		<div class="flex items-start gap-2">
			<code class="break-all text-sm">{preAuthKey.key}</code>
			<button type="button" class="btn-icon btn-icon-sm shrink-0" aria-label={$t('ui.copyPreAuthKey')}
				title={hasKeySecret(preAuthKey.key) ? $t('ui.copyKey') : $t('ui.fullKeyIsOnlyAvailableAtCreation')}
				disabled={!hasKeySecret(preAuthKey.key)} onclick={() => copyToClipboard(preAuthKey.key, toastStore)}>
				<RawMdiClipboard />
			</button>
		</div>
		<div class="text-sm break-words">#{preAuthKey.id} &middot; {preAuthKey.aclTags.length ? preAuthKey.aclTags.join(', ') : preAuthKey.user?.name || $t('ui.unassigned')}</div>
		<div class="flex flex-wrap gap-2 text-xs">
			{#if expired}<span class="badge variant-soft-error">{$t('cards.expired')}</span>{/if}
			{#if preAuthKey.used}<span class="badge variant-soft-surface">{$t('cards.used')}</span>{/if}
			{#if preAuthKey.reusable}<span class="badge variant-soft-success">{$t('cards.reusable')}</span>{/if}
			{#if preAuthKey.ephemeral}<span class="badge variant-soft-secondary">{$t('cards.ephemeral')}</span>{/if}
			<span>{preAuthKey.expiration && !preAuthKey.expiration.startsWith('0001-') ? new Date(preAuthKey.expiration).toLocaleString($locale ?? 'zh-CN') : $t('ui.noExpiry')}</span>
		</div>
	</div>
	<div class="ml-auto flex max-w-full flex-wrap items-center justify-end gap-y-2 shrink-0">
		{#if !expired}
			<Delete title={$t('ui.expireKey')} icon={RawMdiClock} func={async () => {
				await expirePreAuthKey(preAuthKey);
				await App.populatePreAuthKeys();
			}} />
		{/if}
		<Delete title={$t('ui.deleteKey')} func={() => deletePreAuthKey(preAuthKey)} />
	</div>
</div>
