<script lang="ts">
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
			<button type="button" class="btn-icon btn-icon-sm shrink-0" aria-label="Copy pre-auth key"
				title={hasKeySecret(preAuthKey.key) ? 'Copy key' : 'Full key is only available at creation'}
				disabled={!hasKeySecret(preAuthKey.key)} onclick={() => copyToClipboard(preAuthKey.key, toastStore)}>
				<RawMdiClipboard />
			</button>
		</div>
		<div class="text-sm break-words">#{preAuthKey.id} &middot; {preAuthKey.aclTags.length ? preAuthKey.aclTags.join(', ') : preAuthKey.user?.name || 'Unassigned'}</div>
		<div class="flex flex-wrap gap-2 text-xs">
			{#if expired}<span class="badge variant-soft-error">Expired</span>{/if}
			{#if preAuthKey.used}<span class="badge variant-soft-surface">Used</span>{/if}
			{#if preAuthKey.reusable}<span class="badge variant-soft-success">Reusable</span>{/if}
			{#if preAuthKey.ephemeral}<span class="badge variant-soft-secondary">Ephemeral</span>{/if}
			<span>{preAuthKey.expiration && !preAuthKey.expiration.startsWith('0001-') ? new Date(preAuthKey.expiration).toLocaleString() : 'No expiry'}</span>
		</div>
	</div>
	<div class="ml-auto flex max-w-full flex-wrap items-center justify-end gap-y-2 shrink-0">
		{#if !expired}
			<Delete title="Expire key" icon={RawMdiClock} func={async () => {
				await expirePreAuthKey(preAuthKey);
				await App.populatePreAuthKeys();
			}} />
		{/if}
		<Delete title="Delete key" func={() => deletePreAuthKey(preAuthKey)} />
	</div>
</div>
