<script lang="ts">
	import { t } from '$lib/i18n';
	import { InputChip, getToastStore } from '@skeletonlabs/skeleton';
	import type { Node } from '$lib/common/types';
	import { setNodeTags } from '$lib/common/api';
	import { toastError } from '$lib/common/funcs';
	import CardListEntry from '../CardListEntry.svelte';
	import RawMdiSave from '~icons/mdi/content-save-outline';
	import RawMdiClose from '~icons/mdi/close';
	import { App } from '$lib/States.svelte';

	let { node }: { node: Node } = $props();
	let tags = $state<string[]>([]);
	let editing = $state(false);
	let pending = $state(false);
	const toastStore = getToastStore();
	$effect(() => { if (!editing) tags = node.tags.map((tag) => tag.replace(/^tag:/, '')); });

	async function saveTags() {
		if (node.tags.length === 0 && !window.confirm($t('ui.assignTagsAndPermanentlyReplaceUserOwnership'))) return;
		pending = true;
		try {
			const updated = await setNodeTags(node, tags);
			App.updateValue(App.nodes, updated);
			node = updated;
			editing = false;
		} catch (error) {
			toastError($t('ui.unableToSaveTags'), toastStore, error);
		} finally {
			pending = false;
		}
	}
</script>

<CardListEntry top title={$t('cards.tags')}>
	<div class="w-full min-w-0 space-y-2">
		<InputChip name="node-tags-{node.id}" aria-label={$t('ui.nodeTags')} disabled={pending} bind:value={tags}
			class="w-full" chips="variant-filled-success"
			on:add={() => editing = true} on:remove={() => editing = true} />
		{#if editing}
			<div class="flex justify-end gap-2">
				<button type="button" class="btn-icon btn-sm" title={$t('ui.saveTags')} aria-label={$t('ui.saveTags')}
					disabled={pending || tags.length === 0} onclick={saveTags}><RawMdiSave /></button>
				<button type="button" class="btn-icon btn-sm" title={$t('ui.cancelTagChanges')} aria-label={$t('ui.cancelTagChanges')}
					disabled={pending} onclick={() => editing = false}><RawMdiClose /></button>
			</div>
		{/if}
	</div>
</CardListEntry>
