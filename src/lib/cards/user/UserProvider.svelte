<script lang="ts">
	import { t } from '$lib/i18n';
	import type { User } from '$lib/common/types';
	import CardListEntry from '../CardListEntry.svelte';

	type ItemCreatedAtProps = {
		user: User,
	}

	let { user = $bindable() }: ItemCreatedAtProps = $props()

</script>

<CardListEntry title={$t('cards.provider')}>
	{!user.provider || user.provider === 'local' ? $t('details.local') : user.provider}
</CardListEntry>
