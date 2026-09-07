<script lang="ts">
	import { t } from '$lib/i18n';
	import {
		copyToClipboard,
		isExpired,
		isValidCIDR,
		isValidTag,
		toastError,
		toastSuccess,
		clone,
	} from '$lib/common/funcs';
	import DeployCheck from './DeployCheck.svelte';
	import Page from '$lib/page/Page.svelte';
	import PageHeader from '$lib/page/PageHeader.svelte';
	import type { Deployment, PreAuthKey } from '$lib/common/types';
	import { hasKeySecret } from '$lib/common/types';
	import { InputChip, getToastStore } from '@skeletonlabs/skeleton';
	import { page } from '$app/state';
	import { slide } from 'svelte/transition';

	import { App } from '$lib/States.svelte';

	const ToastStore = getToastStore();

	// $: deployment = defaultDeployment();
	let deployment: Deployment = $state({ ...clone(App.deploymentDefaults.value), preAuthKey: '', preAuthKeyUser: '' });
	const invalidKey = $derived(deployment.usePreAuthKey && !hasKeySecret(deployment.preAuthKey));

	let craftCommand = (d: Deployment) => {
		const cmd = ['tailscale up --login-server=' + (App.apiUrl.value || page.url.origin)];

		// general
		d.shieldsUp && cmd.push('--shields-up');
		d.generateQR && cmd.push('--qr');
		d.reset && cmd.push('--reset');
		d.operator && d.operatorValue != '' && cmd.push('--operator=' + d.operatorValue);
		d.forceReauth && cmd.push('--force-reauth');
		d.sshServer && cmd.push('--ssh');
		d.usePreAuthKey && hasKeySecret(d.preAuthKey) && cmd.push('--auth-key=' + d.preAuthKey);
		d.unattended && cmd.push('--unattended')

		// advertise
		d.advertiseExitNode && cmd.push('--advertise-exit-node');
		d.advertiseExitNodeLocalAccess &&
			cmd.push('--exit-node-allow-lan-access');
		d.advertiseRoutes &&
			d.advertiseRoutesValues.length > 0 &&
			cmd.push('--advertise-routes=' + d.advertiseRoutesValues.join(','));
		d.advertiseTags &&
			d.advertiseTagsValues.length > 0 &&
			cmd.push(
				'--advertise-tags=' +
					d.advertiseTagsValues.map((s) => (s.startsWith('tag:') ? s : 'tag:' + s)).join(','),
			);

		// accept
		d.acceptDns ? cmd.push('--accept-dns') : cmd.push('--accept-dns=false');
		d.acceptRoutes && cmd.push('--accept-routes');
		d.acceptExitNode && d.acceptExitNodeValue && cmd.push('--exit-node=' + d.acceptExitNodeValue);
		return cmd.join(' ');
	};
</script>

<Page>
	<PageHeader title={$t('deploy.title')} buttonText={''} show={true}>
		{#snippet button()}
			<button
				disabled={invalidKey}
				class="bg-surface-400/30 dark:bg-surface-800/70 border border-dashed border-surface-200 border-1 px-4 rounded-lg justify-start text-left w-full disabled:opacity-50"
				onclick={() =>
					copyToClipboard(craftCommand(deployment), ToastStore, $t('ui.copiedCommandToClipboard'))}
				><code class="text-black dark:text-white text-sm block py-4 w-full break-all"
					>{craftCommand(deployment)}</code
				>
			</button>
		{/snippet}
	</PageHeader>

	<div class="grid grid-cols-12">
		<p class="text-xl col-span-12">{$t('ui.general')}</p>
		<DeployCheck
			bind:checked={deployment.shieldsUp}
			name={$t('deploy.shieldsUp')}
			help={$t('deploy.shieldsUpHelp')}
		/>
		<DeployCheck
			bind:checked={deployment.generateQR}
			name={$t('deploy.generateQR')}
			help={$t('ui.createAScannableQrCodeToImportIntoTailscaleClient')}
		/>
		<DeployCheck
			bind:checked={deployment.reset}
			name={$t('deploy.reset')}
			help={$t('ui.resetUnspecifiedSettingsToDefaultValues')}
		/>
		<DeployCheck
			bind:checked={deployment.operator}
			name={$t('deploy.operator')}
			help={$t('ui.unixOnlyRunAsADifferentUser')}
		>
			<input type="text" class="input text-sm rounded-md" bind:value={deployment.operatorValue} />
		</DeployCheck>
		<DeployCheck
			bind:checked={deployment.forceReauth}
			name={$t('deploy.forceReauth')}
			help={$t('ui.forceUserToReAuthenticateToHeadscaleServer')}
		/>
		<DeployCheck
			bind:checked={deployment.sshServer}
			name={$t('deploy.sshServer')}
			help={$t('ui.runALocalSshServerAccessibleByAdministrators')}
		/>
		<DeployCheck
			bind:checked={deployment.usePreAuthKey}
			name={$t('deploy.preAuthKey')}
			help={$t('ui.aGeneratedKeyToAutomaticallyAuthenticateTheNodeForAGivenUser')}
		>
			<div class="flex flex-col gap-2">
				<input type="password" class="input rounded-md" aria-label={$t('ui.completePreAuthKey')}
					autocomplete="off" placeholder="hskey-auth-..." bind:value={deployment.preAuthKey} />
				{#if invalidKey}
					<p class="text-sm text-error-500">{$t('ui.aCompletePreAuthKeyIsRequired')}</p>
				{/if}
			</div>
		</DeployCheck>
		<DeployCheck
			bind:checked={deployment.unattended}
			name={$t('deploy.unattended')}
			help={$t('ui.runTheTailscaleClientInUnattendedModeOnStartup')}
		/>
		<DeployCheck 
			bind:checked={deployment.advertiseExitNodeLocalAccess}
			name={$t('deploy.allowLANAccess')}
			help={$t('ui.allowLocalNetworkAccessWhileConnectedToTheTailnetAndUsingAnExitNode')}
		/>

		<p class="text-xl col-span-12 py-4">{$t('ui.advertise')}</p>
		<DeployCheck
			bind:checked={deployment.advertiseExitNode}
			name={$t('deploy.advertiseExitNode')}
			help={$t('ui.allowOtherNodesOnTheTailnetToUseThisNodeAsAGateway')}
		/>
		<DeployCheck
			bind:checked={deployment.advertiseTags}
			name={$t('deploy.advertiseTags')}
			help={$t('ui.listOfAdvertisedTagsToApplyToAMachineOnProvisioning')}
		>
			<InputChip
				name="advertiseRoutesValues"
				bind:value={deployment.advertiseTagsValues}
				validation={isValidTag}
				on:invalid={() => {
					toastError($t('ui.tagShouldBeALowercaseAlphanumericWord'), ToastStore);
				}}
			/>
		</DeployCheck>
		<DeployCheck
			bind:checked={deployment.advertiseRoutes}
			name={$t('deploy.advertiseRoutes')}
			help={$t('ui.listOfSubnetsWhichAreReachableViaThisNode')}
		>
			<InputChip
				name="advertiseRoutesValues"
				bind:value={deployment.advertiseRoutesValues}
				validation={isValidCIDR}
				on:invalid={() => {
					toastError($t('ui.invalidCidrFormat'), ToastStore);
				}}
			/>
		</DeployCheck>

		<p class="text-xl col-span-12 py-4">{$t('ui.accept')}</p>
		<DeployCheck
			bind:checked={deployment.acceptDns}
			name={$t('deploy.acceptDNS')}
			help={$t('ui.acceptTheHeadscaleProvidedDnsSettings')}
		/>
		<DeployCheck
			bind:checked={deployment.acceptRoutes}
			name={$t('deploy.acceptRoutes')}
			help={$t('ui.acceptOtherNodesAdvertisedSubnets')}
		/>
		<DeployCheck
			bind:checked={deployment.acceptExitNode}
			name={$t('deploy.exitNode')}
			help={$t('ui.useThisNodeAsAGatewayTargetNodeMustAdvertiseExitNode')}
		>
			<label class="label">
				<select class="select" bind:value={deployment.acceptExitNodeValue}>
					{#each App.nodes.value as node}
						<option value={node.ipAddresses.filter((s) => /^\d+\.\d+\.\d+\.\d+$/.test(s))[0]}
							>{node.givenName} ({node.name})</option
						>
					{/each}
				</select>
			</label>
		</DeployCheck>
	</div>
		<button class="btn rounded-md variant-filled-secondary mt-4" onclick={() => {
			App.saveDeploymentDefaults(deployment)
			toastSuccess($t('ui.savedDeploymentDefaults'), ToastStore)
		}}>
			{$t('deploy.saveDefaults')}
		</button>
</Page>
