<script lang="ts">
	import { t } from '$lib/i18n';
	import Navigation from '$lib/Navigation.svelte';
	import LanguageSwitcher from '$lib/parts/LanguageSwitcher.svelte';
	import RawMdiGithub from '~icons/mdi/github';
	import RawMdiMenu from '~icons/mdi/menu';
	import '../app.postcss';
	import {
		AppBar,
		AppShell,
		LightSwitch,
		Modal,
		Toast,
		getDrawerStore,
		getToastStore,
		initializeStores,
		type DrawerSettings,
	} from '@skeletonlabs/skeleton';

	import { base } from '$app/paths';
	import { goto } from '$app/navigation';

	initializeStores();

	const DrawerStore = getDrawerStore();

	let drawerSettings = $state({
		id: 'navDrawer',
		position: 'left',
		width: 'w-64',
		padding: '',
	}) as DrawerSettings;

	// Highlight JS
	import hljs from 'highlight.js';
	import 'highlight.js/styles/github-dark.css';
	import { storeHighlightJs } from '@skeletonlabs/skeleton';
	storeHighlightJs.set(hljs);

	// Floating UI for Popups
	import { computePosition, autoUpdate, flip, shift, offset, arrow } from '@floating-ui/dom';
	import { storePopup } from '@skeletonlabs/skeleton';
	import { onMount } from 'svelte';
	storePopup.set({ computePosition, autoUpdate, flip, shift, offset, arrow });

	import PageDrawer from '$lib/page/PageDrawer.svelte';
	import { fade } from 'svelte/transition';
	import { createPopulateErrorHandler } from '$lib/common/errors';
	import { version } from '$lib/common/debug';
	import { App } from '$lib/States.svelte';
	import { ALL_THEMES, DEFAULT_THEME, setTheme } from '$lib/common/themes';

	let { children } = $props()

	let ToastStore = $state(getToastStore());

	onMount(() => {
		if (!ALL_THEMES.includes(App.theme.value)) App.theme.value = DEFAULT_THEME;
		setTheme(App.theme.value)
		App.populateAll(createPopulateErrorHandler(ToastStore), true)

		if (!App.hasValidApi) {
			goto(`${base}/settings`);
		}
	});
</script>

<Toast />
<PageDrawer />
<Modal />
<AppShell slotSidebarLeft="w-0 mr-2 lg:w-48" scrollGutter="stable both-edges">
	<svelte:fragment slot="header">
		<!-- App Bar -->
		<AppBar
			gridColumns="grid-cols-[minmax(0,1fr)_auto]"
			gap="gap-2 sm:gap-4"
			padding="p-2 sm:p-4"
			slotDefault="hidden"
			slotTrail="space-x-1 sm:space-x-4"
		>
			<svelte:fragment slot="lead">
				<div class="flex min-w-0 items-center gap-2">
					<button
						aria-label={$t('ui.openNavigationPanel')}
						title={$t('ui.openNavigationPanel')}
						class="lg:hidden btn-icon btn-icon-sm shrink-0"
						onclick={() => {
							DrawerStore.open(drawerSettings);
						}}
					>
						<RawMdiMenu />
					</button>
					<div class="min-w-0">
						<strong class="block text-sm sm:inline sm:text-xl uppercase">Headscale-Admin</strong>
						<span class="text-xs sm:text-sm lowercase">{version}</span>
					</div>
				</div>
			</svelte:fragment>

			<svelte:fragment slot="trail">
				<LanguageSwitcher />
				<LightSwitch title={$t('ui.toggleLightOrDarkMode')} width="w-10 sm:w-12" height="h-5 sm:h-6" />
				<a
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm variant-ghost-surface sm:w-auto sm:gap-2 sm:px-3"
					aria-label="GitHub"
					title="GitHub"
					href="https://github.com/qingmuhy744/headscale-admin"
					target="_blank"
					rel="noreferrer"
				>
					<RawMdiGithub class="h-4 w-4 shrink-0" />
					<span class="hidden sm:inline">GitHub</span>
				</a>
			</svelte:fragment>
		</AppBar>
	</svelte:fragment>
	<svelte:fragment slot="sidebarLeft">
		<Navigation />
	</svelte:fragment>
	<div class="pl-2 h-full" transition:fade|local>
		{@render children()}
	</div>
</AppShell>
