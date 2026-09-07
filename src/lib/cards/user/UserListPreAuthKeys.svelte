<script lang="ts">
	import { t } from '$lib/i18n';
	import CardListEntry from '../CardListEntry.svelte';
	import UserListPreAuthKey from './UserListPreAuthKey.svelte';
	import PreAuthKeyCreate from './PreAuthKeyCreate.svelte';
	import type { User } from '$lib/common/types';
	import { isExpired } from '$lib/common/funcs';
	import { App } from '$lib/States.svelte';
	let { user, title = $t('ui.preauthKeys') }: { user: User; title?: string } = $props();
	let hideInvalid = $state(true);
	const keys = $derived(App.preAuthKeys.value.filter((key) => key.user?.id === user.id &&
		(!hideInvalid || (!isExpired(key.expiration) && (!key.used || key.reusable)))));
</script>

<CardListEntry {title} top>
	<div class="w-full space-y-3">
		<label class="flex justify-end items-center gap-2 text-sm">
			<input class="checkbox" type="checkbox" bind:checked={hideInvalid} /> {$t('cards.hideInvalid')}
		</label>
		<PreAuthKeyCreate {user} />
	</div>
	{#snippet childBottom()}
		<div class="w-full divide-y divide-surface-400/30">
			{#each keys as preAuthKey (preAuthKey.id)}
				<UserListPreAuthKey {preAuthKey} />
			{/each}
		</div>
	{/snippet}
</CardListEntry>
