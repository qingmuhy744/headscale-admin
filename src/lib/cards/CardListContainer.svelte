<script>
	let { children } = $props()
</script>

<div class="card-list-content grid grid-cols-1 bg-surface-50 dark:bg-surface-800 rounded-md p-5">
	{@render children()}
</div>
