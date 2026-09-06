<script lang="ts">
	import { InputChip, getToastStore } from '@skeletonlabs/skeleton';
	import { App } from '$lib/States.svelte';
	import { createPreAuthKey } from '$lib/common/api';
	import { hasKeySecret, type User } from '$lib/common/types';
	import { copyToClipboard, toastError } from '$lib/common/funcs';
	import RawMdiPlus from '~icons/mdi/plus';
	import RawMdiSave from '~icons/mdi/check';
	import RawMdiClose from '~icons/mdi/close';
	import RawMdiClipboard from '~icons/mdi/clipboard-outline';
	let { user }: { user?: User } = $props();
	let show = $state(false);
	let pending = $state(false);
	let mode = $state('user');
	let userId = $state('');
	let tags = $state<string[]>([]);
	let ephemeral = $state(false);
	let reusable = $state(false);
	let expiration = $state('');
	let secret = $state('');
	let dialog: HTMLDialogElement;
	const toastStore = getToastStore();
	const owner = $derived(user || App.users.value.find((item) => item.id === userId) || null);

	function open() {
		expiration = new Date(Date.now() + 3600000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
		show = true;
	}
	async function create(event: SubmitEvent) {
		event.preventDefault();
		pending = true;
		try {
			if (new Date(expiration).getTime() <= Date.now()) throw new Error('Expiration must be in the future');
			if (mode === 'user' && !owner) throw new Error('Select a user');
			const key = await createPreAuthKey(mode === 'user' ? owner : null, ephemeral, reusable, expiration, mode === 'tags' ? tags : []);
			if (!hasKeySecret(key.key)) throw new Error('Server did not return a complete pre-auth key');
			secret = key.key;
			dialog.showModal();
			show = false;
			await App.populatePreAuthKeys();
		} catch (error) {
			toastError('Unable to create key', toastStore, error);
		} finally {
			pending = false;
		}
	}
</script>

{#if !show}
	<button type="button" class="btn btn-sm variant-filled-success" onclick={open}><RawMdiPlus class="mr-2" />Create key</button>
{:else}
	<form onsubmit={create} class="space-y-4 w-full max-w-xl">
		{#if !user}
			<fieldset class="flex flex-wrap gap-4">
				<legend class="text-sm mb-2">Ownership</legend>
				<label class="flex items-center gap-2"><input type="radio" class="radio" bind:group={mode} value="user" disabled={pending} />User</label>
				<label class="flex items-center gap-2"><input type="radio" class="radio" bind:group={mode} value="tags" disabled={pending} />Tags</label>
			</fieldset>
			{#if mode === 'user'}
				<label class="label">User<select class="select" bind:value={userId} disabled={pending} required>
					<option value="">Select user</option>
					{#each App.users.value as item}<option value={item.id}>{item.name}</option>{/each}
				</select></label>
			{:else}
				<label class="label" for="key-tags">Tags</label>
				<InputChip name="key-tags" id="key-tags" aria-label="Key tags" bind:value={tags} disabled={pending} />
			{/if}
		{/if}
		<label class="label">Expiration<input type="datetime-local" class="input" bind:value={expiration} disabled={pending} required /></label>
		<div class="flex flex-wrap gap-4">
			<label class="flex items-center gap-2"><input type="checkbox" class="checkbox" bind:checked={reusable} disabled={pending} />Reusable</label>
			<label class="flex items-center gap-2"><input type="checkbox" class="checkbox" bind:checked={ephemeral} disabled={pending} />Ephemeral</label>
		</div>
		<div class="flex gap-2">
			<button type="submit" class="btn btn-sm variant-filled-success" disabled={pending}><RawMdiSave class="mr-2" />Create</button>
			<button type="button" class="btn-icon btn-sm" title="Cancel key creation" aria-label="Cancel key creation" disabled={pending} onclick={() => show = false}><RawMdiClose /></button>
		</div>
	</form>
{/if}

<dialog bind:this={dialog} onclose={() => secret = ''} class="p-6 rounded-lg bg-surface-100-800-token text-surface-900-50-token w-[calc(100%-2rem)] max-w-lg backdrop:bg-black/50">
	<h2 class="text-xl font-semibold mb-4">Pre-auth key created</h2>
	<p class="text-sm mb-3">This key is shown only once.</p>
	<code class="block break-all p-3 bg-surface-500/10" data-testid="created-key">{secret}</code>
	<div class="flex justify-end gap-3 mt-5">
		<button type="button" class="btn btn-sm variant-filled-primary" onclick={() => copyToClipboard(secret, toastStore)}><RawMdiClipboard class="mr-2" />Copy key</button>
		<button type="button" class="btn btn-sm" onclick={() => dialog.close()}>Done</button>
	</div>
</dialog>
