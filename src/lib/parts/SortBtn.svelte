<script lang="ts">
	import type { Direction } from '$lib/common/types';
	import RawMdiArrowUpThin from '~icons/mdi/arrow-up-thin';
	import RawMdiArrowDownThin from '~icons/mdi/arrow-down-thin';

	type SortBtnProps = {
		value: string,
		name: string,
		method: string,
		direction: Direction,
		toggle: (_: string) => void,
	}
	let {
		value = $bindable(),
		name,
		method,
		direction,
		toggle,
	}: SortBtnProps = $props()
</script>

<button aria-pressed={value === method} onclick={() => toggle(method)}>
	<span class={value === method ? '' : 'invisible'}>
		{#if direction === 'up'}
			<RawMdiArrowUpThin />
		{:else}
			<RawMdiArrowDownThin />
		{/if}
	</span>
	{name}
</button>
