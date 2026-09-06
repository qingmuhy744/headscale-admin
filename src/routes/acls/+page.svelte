<script lang="ts">
	import { TabGroup, getToastStore } from '@skeletonlabs/skeleton';
	import { onMount } from 'svelte';
	import RawMdiCodeJSON from '~icons/mdi/code-json';
	import RawMdiConsole from '~icons/mdi/console';
	import RawMdiDevices from '~icons/mdi/devices';
	import RawMdiGroups from '~icons/mdi/account-group';
	import RawMdiSecurity from '~icons/mdi/security';
	import RawMdiTag from '~icons/mdi/tag';
	import RawMdiRefresh from '~icons/mdi/refresh';
	import RawMdiPlus from '~icons/mdi/plus';

	import { ACLBuilder } from '$lib/common/acl.svelte';
	import { getPolicy } from '$lib/common/api';
	import { toastError } from '$lib/common/funcs';
	import Page from '$lib/page/Page.svelte';
	import PageHeader from '$lib/page/PageHeader.svelte';
	import Tabbed from '$lib/parts/Tabbed.svelte';

	import Config from './Config.svelte';
	import Groups from './Groups.svelte';
	import Hosts from './Hosts.svelte';
	import Policies from './Policies.svelte';
	import TagOwners from './TagOwners.svelte'
	import SshRules from './SshRules.svelte';

	const ToastStore = getToastStore()

	let acl = $state(ACLBuilder.defaultACL());
	let loading = $state(false)
	let loaded = $state(false)
	let loadError = $state('')
	let noPolicy = $state(false)

	// Navigation tabs
	let tabSet: number = $state(5);
	const tabs = [
		{ name: 'groups', title: 'Groups', logo: RawMdiGroups },
		{ name: 'tag-owners', title: 'Tag Owners', logo: RawMdiTag },
		{ name: 'hosts', title: 'Hosts', logo: RawMdiDevices },
		{ name: 'policies', title: 'Policies', logo: RawMdiSecurity },
		{ name: 'ssh', title: 'SSH', logo: RawMdiConsole },
		{ name: 'config', title: 'Config', logo: RawMdiCodeJSON },
	];

	async function loadPolicy() {
		loading = true
		loadError = ''
		noPolicy = false
		try {
			const policy = await getPolicy()
			if (!policy.trim()) { noPolicy = true; return }
			acl = ACLBuilder.fromPolicy(policy)
			loaded = true
		} catch (error) {
			loadError = error instanceof Error ? error.message : String(error)
			noPolicy = loadError === 'loading ACL from database: acl policy not found'
			if (!noPolicy) toastError('Unable to load policy', ToastStore, error)
		} finally {
			loading = false
		}
	}
	onMount(() => { void loadPolicy() });
</script>

<Page>
	<PageHeader title="ACL Builder" />
	{#if !loaded}
		<div class="p-4 space-y-3" role="status">
			{#if loading}
				<p>Loading policy...</p>
			{:else if noPolicy}
				<p>No policy configured.</p>
				<button type="button" class="btn btn-sm variant-filled-secondary" onclick={() => {
					acl = ACLBuilder.defaultACL()
					loaded = true
				}}><RawMdiPlus /> Create policy</button>
			{:else}
				<p class="text-error-500 break-words">{loadError}</p>
				<button type="button" class="btn btn-sm variant-filled-secondary" onclick={loadPolicy}>
					<RawMdiRefresh /> Retry
				</button>
			{/if}
		</div>
	{:else}
	<TabGroup
		justify="justify-left"
		active="variant-filled-secondary"
		hover="hover:variant-soft-secondary"
		flex="flex-1 lg:flex-none"
		rounded="rounded-md"
		border=""
		class="bg-surface-100-800-token w-full px-2 py-2"
	>
		<div class="flex text-center overflow-x-auto">
			<Tabbed {tabs} bind:tabSet />
		</div>
		<svelte:fragment slot="panel">
			{#if tabs[tabSet].name == 'groups'}
				<Groups bind:loading bind:acl />
			{:else if tabs[tabSet].name == 'tag-owners'}
				<TagOwners bind:loading bind:acl />
			{:else if tabs[tabSet].name == 'hosts'}
				<Hosts bind:loading bind:acl />
			{:else if tabs[tabSet].name == 'policies'}
				<Policies bind:loading bind:acl />
			{:else if tabs[tabSet].name == 'ssh'}
				<SshRules bind:loading bind:acl />
			{:else if tabs[tabSet].name == 'config'}
				<Config bind:loading bind:acl />
			{/if}
		</svelte:fragment>
	</TabGroup>
	{/if}
</Page>
