<script lang="ts">
	import { nodeBelongsToUser } from '$lib/common/types';
	import CardListEntry from '../CardListEntry.svelte';
	import type { Node, User } from '$lib/common/types';
	import OnlineNodeIndicator from '$lib/parts/OnlineNodeIndicator.svelte';
	import { openDrawer } from '$lib/common/funcs';
	import { getDrawerStore } from '@skeletonlabs/skeleton';
	import { App } from '$lib/States.svelte';

	type UserListNodesProps = {
		user: User,
		title?: string,
	}
	let {
		user = $bindable(),
		title = 'Nodes:',
	}: UserListNodesProps = $props();

	const drawerStore = getDrawerStore();

	const filteredNodes = $derived.by(() => {
		if (App.users.value.filter((u) => u.id == user.id).length == 1) {
			return App.nodes.value.filter((n) => nodeBelongsToUser(n, user.id));
		}
		return [];
	});
</script>

<CardListEntry {title}>
	{#each filteredNodes as node}
		<div class="flex min-w-0 flex-row items-center gap-3 justify-end">
			<a
				class="min-w-0 break-words"
				href=" "
				onclick={() => {
					openDrawer(drawerStore, 'nodeDrawer-' + node.id, node);
				}}
			>
				{node.givenName} ({node.name})
			</a>
			<OnlineNodeIndicator {node} />
		</div>
	{/each}
</CardListEntry>
