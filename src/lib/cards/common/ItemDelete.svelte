<script lang="ts">
	import { t } from '$lib/i18n';
	import { nodeBelongsToUser } from '$lib/common/types';
	import type { ItemTypeName, Named } from '$lib/common/types';
	import { getTypeName, isUser, isNode } from '$lib/common/types';

	import CardListEntry from '../CardListEntry.svelte';

	import { deleteNode, deleteUser } from '$lib/common/api';
	import { getDrawerStore, getToastStore } from '@skeletonlabs/skeleton';
	import { toastError, toastSuccess } from '$lib/common/funcs';
	import Delete from '$lib/parts/Delete.svelte';
	import { App } from '$lib/States.svelte';

	type ItemDeleteProps = {
		item: Named,
	}

	let { item = $bindable() }: ItemDeleteProps = $props()

	let show = false;
	const prefix: ItemTypeName = getTypeName(item);

	const ToastStore = getToastStore();
	const DrawerStore = getDrawerStore();

	async function deleteItem() {
		show = false;
		const name = item.name;
		const id = item.id;

		if (isUser(item)) {
			if (await deleteUser(item)) {
				toastSuccess($t('ui.deletedUserValueIdValue', { values: { v0: String(name), v1: String(id) } }), ToastStore);
				DrawerStore.close()
			} else {
				let msg = $t('ui.failedToDeleteUserValueValue', { values: { v0: String(name), v1: String(id) } });
				if(App.nodes.value.some((node) => nodeBelongsToUser(node, item.id))){
					msg += ' ' + $t('details.stillHasNodes');
				}
				toastError(msg, ToastStore);
			}
		}
		if (isNode(item)) {
			if (await deleteNode(item)) {
				toastSuccess($t('ui.deletedMachineValueValue', { values: { v0: String(name), v1: String(id) } }), ToastStore);
				DrawerStore.close()
			} else {
				toastError($t('ui.failedToDeleteNachineValueValue', { values: { v0: String(name), v1: String(id) } }), ToastStore);
			}
		}
	}
</script>

<CardListEntry title={$t(prefix === 'user' ? 'ui.deleteUser' : 'ui.deleteNode')}>
	<Delete func={deleteItem} />
</CardListEntry>
