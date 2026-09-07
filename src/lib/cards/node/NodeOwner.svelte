<script lang="ts">
	import { t } from '$lib/i18n';
	import CardListEntry from '../CardListEntry.svelte';
	import type { Node } from '$lib/common/types';
	import OnlineUserIndicator from '$lib/parts/OnlineUserIndicator.svelte';
	import { openDrawer } from '$lib/common/funcs';
	import { getDrawerStore } from '@skeletonlabs/skeleton';
	let { node }: { node: Node } = $props();
	const drawerStore = getDrawerStore();
</script>

<CardListEntry title={$t('cards.owner')} top>
	<div class="flex flex-wrap items-center gap-3 justify-end">
		{#if node.tags.length > 0}
			<span>{$t('ui.taggedDevice')}</span>
		{:else if node.user}
			<button type="button" class="underline" onclick={() => {
				if (node.user) openDrawer(drawerStore, 'userDrawer-' + node.user.id, node.user);
			}}>{node.user.name}</button>
			<OnlineUserIndicator user={node.user} />
		{:else}
			<span>{$t('ui.unassigned')}</span>
		{/if}
	</div>
</CardListEntry>
