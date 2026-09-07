<script lang="ts">
	import { t } from '$lib/i18n';
	import { App } from '$lib/States.svelte';
	import { isExpired } from '$lib/common/funcs';
	import Page from '$lib/page/Page.svelte';
	import PageHeader from '$lib/page/PageHeader.svelte';
	import PreAuthKeyCreate from '$lib/cards/user/PreAuthKeyCreate.svelte';
	import UserListPreAuthKey from '$lib/cards/user/UserListPreAuthKey.svelte';
	let query = $state('');
	let hideInvalid = $state(false);
	const keys = $derived(App.preAuthKeys.value.filter((key) =>
		(!hideInvalid || (!isExpired(key.expiration) && (!key.used || key.reusable))) &&
		[key.id, key.key, key.user?.name || '', ...key.aclTags].some((value) => value.toLowerCase().includes(query.toLowerCase()))));
</script>

<Page>
	<PageHeader title={$t('ui.preAuthKeys')} />
	<div class="max-w-4xl pr-4">
		<PreAuthKeyCreate />
		<div class="flex flex-wrap items-center gap-4 py-5 border-b border-surface-400/30">
			<input type="search" class="input w-full sm:w-72" aria-label={$t('ui.searchKeys')} placeholder={$t('ui.searchKeys54e5dd')} bind:value={query} />
			<label class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox" bind:checked={hideInvalid} />{$t('cards.hideInvalid')}</label>
			<span class="text-sm">{keys.length} {$t('ui.keys48a53f')}</span>
		</div>
		<div class="divide-y divide-surface-400/30">
			{#each keys as preAuthKey (preAuthKey.id)}<UserListPreAuthKey {preAuthKey} />{:else}<p class="py-8 opacity-70">{$t('ui.noKeys')}</p>{/each}
		</div>
	</div>
</Page>
