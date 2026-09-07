<script lang="ts">
	import { t } from '$lib/i18n';
	import { base } from '$app/paths';
	import { getDrawerStore } from '@skeletonlabs/skeleton';

	import RawMdiDevices from '~icons/mdi/devices';
	import RawMdiHome from '~icons/mdi/home';
	import RawMdiHomeGroupPlus from '~icons/mdi/home-group-plus';
	import RawMdiPerson from '~icons/mdi/person';
	import RawMdiRouter from '~icons/mdi/router';
	import RawMdiSecurity from '~icons/mdi/security';
	import RawMdiSettings from '~icons/mdi/settings';
	import RawMdiKey from '~icons/mdi/key-outline';

	// import { ApiKeyInfoStore, ApiKeyStore, hasValidApi } from './Stores';
	import { onMount, type Component } from 'svelte';
	import { page } from '$app/state';
	import { App } from '$lib/States.svelte';

	type NavigationProps = {
		labels?: boolean
	}

	let {
		labels = true,
	}: NavigationProps = $props()

	const DrawerStore = getDrawerStore();

	function classesActive(href: string): string {
		return href === page.route.id ? 'bg-primary-300 dark:bg-primary-700' : '';
	}

	let newPath = $state('');

	function setActivePath(path: string) {
		newPath = path;
	}

	type Page = {
		path: string;
		name: string;
		logo: Component;
	};

	const allPages: Page[] = $derived([
		{ path: '/', name: $t('home.title'), logo: RawMdiHome },
		{ path: '/users', name: $t('users.title'), logo: RawMdiPerson },
		{ path: '/nodes', name: $t('nodes.title'), logo: RawMdiDevices },
		{ path: '/keys', name: $t('ui.keys'), logo: RawMdiKey },
		{ path: '/deploy', name: $t('deploy.title'), logo: RawMdiHomeGroupPlus },
		{ path: '/routes', name: $t('routes.title'), logo: RawMdiRouter },
		{ path: '/acls', name: $t('acls.title'), logo: RawMdiSecurity },
		{ path: '/settings', name: $t('settings.title'), logo: RawMdiSettings },
	]);

	const pages = $derived.by(() => App.hasValidApi ? allPages : allPages.slice(-1));
</script>

<nav class="list-nav pt-0">
	<ul>
		{#each pages as p}
			<li>
				<a
					href="{base}{p.path}"
					class={'!rounded-none ' + classesActive(p.path)}
					onclick={() => {
						DrawerStore.close();
						setActivePath(p.path);
					}}
				>
					<span class="flex flex-row items-center text-lg">
						<p.logo />
						<!--svelte:component this={p.logo} class="mr-4" /-->
						{#if labels}
							<span class="text-sm ml-2">{p.name}</span>
						{/if}
					</span>
				</a>
			</li>
		{/each}
	</ul>
</nav>
