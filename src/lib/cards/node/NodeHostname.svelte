<script lang="ts">
	import { t } from '$lib/i18n';
	import CardListEntry from '../CardListEntry.svelte';
	import type { Node } from '$lib/common/types';

	type NodeHostnameProps = {
		node: Node,
	}
	let { node }: NodeHostnameProps = $props()

</script>

<CardListEntry title={$t('cards.hostname')}>
	{node.name}
</CardListEntry>
