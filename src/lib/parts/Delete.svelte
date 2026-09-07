<script lang="ts">
	import { t } from '$lib/i18n';
	import { slide } from 'svelte/transition';
	import type { Component } from 'svelte';
	import { getToastStore } from '@skeletonlabs/skeleton';
	import { toastError } from '$lib/common/funcs';

	import RawMdiDelete from '~icons/mdi/delete';
	import RawMdiCheckCircleOutline from '~icons/mdi/check-circle-outline';
	import RawMdiCloseCircleOutline from '~icons/mdi/close-circle-outline';

	type DeleteProps = {
		func: () => unknown | Promise<unknown>,
		title?: string,
		icon?: Component,
		show?: boolean,
		disabled?: boolean,
	}

	let { func, show = false, disabled = false, title = $t('cards.delete'), icon: Icon = RawMdiDelete }: DeleteProps = $props()
	const toastStore = getToastStore();
</script>

<div class="flex flex-row items-center justify-end py-0 my-0 pl-0 ml-4">
	{#if show}
		<span transition:slide={{ delay: 50, axis: 'x' }} class="text-right flex space-x-2">
			<button
				type="button" aria-label="{$t('common.confirm')} {title}" title="{$t('common.confirm')} {title}"
				{disabled}
				onclick={async () => {
					try {
						disabled = true;
						await func();
					} catch (error) {
						toastError($t('ui.valueFailed', { values: { v0: String(title) } }), toastStore, error);
					} finally {
						disabled = false;
						show = false;
					}
				}}
			>
				<RawMdiCheckCircleOutline />
			</button>
			<button
				type="button" aria-label="{$t('common.cancel')} {title}" title="{$t('common.cancel')} {title}"
				{disabled}
				onclick={() => {
					show = false;
				}}
			>
				<RawMdiCloseCircleOutline />
			</button>
		</span>
	{/if}
	<span class="text-error-600 dark:text-error-400 ml-2">
		<button type="button" {title} aria-label={title} {disabled} onclick={() => (show = !show)}>
			<Icon />
		</button>
	</span>
</div>
