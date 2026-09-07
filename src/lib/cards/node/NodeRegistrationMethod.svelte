<script lang="ts">
	import { t } from '$lib/i18n';
	import CardListEntry from '../CardListEntry.svelte';
	import type { Node } from '$lib/common/types';

	type NodeRegistrationMethodProps = {
		node: Node,
	}

	let { node }: NodeRegistrationMethodProps = $props()
	const nodeRegMethod = $derived.by(() => {
		switch (node.registerMethod) {
			case 'REGISTER_METHOD_AUTH_KEY':
				return $t('ui.preauthkey');
			case 'REGISTER_METHOD_CLI':
				return 'CLI';
			case 'REGISTER_METHOD_OIDC':
				return "OIDC";
			default:
				return $t('cards.unspecified')
		}
	});
</script>

<CardListEntry title={$t('ui.registerMethod')}>
	{nodeRegMethod}
</CardListEntry>
