import { translate } from '$lib/i18n';
import type {
	ApiNode,
	ApiPolicy,
	ApiUser,
	Node,
	PreAuthKey,
	User,
} from '$lib/common/types';
import { debug } from '../debug';
import { apiPost, apiPut } from './base';
import type { ACLBuilder } from '../acl.svelte';
import { API_URL_NODE, API_URL_POLICY, API_URL_PREAUTHKEY, API_URL_USER } from './url';
import { createApiKey } from './create';
import { expireApiKey } from './delete';
import { App } from '$lib/States.svelte';
import { setsEqual } from '../funcs';
import { getApiKeys } from './get';
import { matchesApiKey } from '../types';

export async function renameUser(u: User, nameNew: string): Promise<User> {
	const path = `${API_URL_USER}/${u.id}/rename/${encodeURIComponent(nameNew)}`;
	const { user } = await apiPost<ApiUser>(path, undefined);
	debug('Renamed User from "' + u.name + '" to "' + nameNew + '"');
	return user;
}

export async function renameNode(n: Node, nameNew: string): Promise<Node> {
	const path = `${API_URL_NODE}/${n.id}/rename/${encodeURIComponent(nameNew)}`;
	const { node } = await apiPost<ApiNode>(path, undefined);
	debug('Renamed Node from "' + n.givenName + '" to "' + nameNew + '"');
	return node;
}

export async function expirePreAuthKey(pak: PreAuthKey) {
	const path = `${API_URL_PREAUTHKEY}/expire`;
	const data = { id: pak.id };
	await apiPost(path, data);
}

export async function expireNode(n: Node): Promise<Node> {
	const path = `${API_URL_NODE}/${n.id}/expire`;
	const { node } = await apiPost<ApiNode>(path, undefined);
	debug('Expired Node "' + n.givenName + '"');
	return node;
}

export async function setNodeTags(n: Node, tags: string[]): Promise<Node> {
	if (tags.length === 0) throw new Error(translate('ui.taggedNodesMustRetainAtLeastOneTag'));
	const path = `${API_URL_NODE}/${n.id}/tags`;
	tags = tags.map((tag) => (tag.startsWith('tag:') ? tag : 'tag:' + tag));
	const { node } = await apiPost<ApiNode>(path, { tags });
	debug('Set Tags for Node "' + n.givenName + '"');
	return node;
}

export async function enableRoutes(node: Node, ...routes: string[]): Promise<string[]> {
	const path = `${API_URL_NODE}/${node.id}/approve_routes`;
	const currentRoutes = new Set(node.approvedRoutes);
	const newRoutes = new Set(node.approvedRoutes.concat(routes));

	if (setsEqual(currentRoutes, newRoutes)) {
		return node.approvedRoutes; // No change needed
	}

	// fix headscale bug #2637
	const currentStatus = node.online;

	const { node: nodeNew } = await apiPost<ApiNode>(path, { routes: [...newRoutes] });
	debug(`Enabled Routes ${routes.join(', ')} for Node "${node.givenName}"`);
	nodeNew.online = currentStatus; // Preserve online status, #2637
	App.updateValue(App.nodes, nodeNew);
	return nodeNew.approvedRoutes;
}

export async function disableRoutes(node: Node, ...routes: string[]): Promise<string[]> {
	const path = `${API_URL_NODE}/${node.id}/approve_routes`;
	const currentRoutes = new Set(node.approvedRoutes);
	const newRoutes = new Set(node.approvedRoutes.filter((r) => !routes.includes(r)));

	if (setsEqual(currentRoutes, newRoutes)) {
		return node.approvedRoutes; // No change needed
	}

	// fix headscale bug #2637
	const currentStatus = node.online;

	const { node: nodeNew } = await apiPost<ApiNode>(path, { routes: [...newRoutes] });
	debug(`Disabled Routes ${routes.join(', ')} for Node "${node.givenName}"`);
	nodeNew.online = currentStatus; // Preserve online status, #2637
	App.updateValue(App.nodes, nodeNew);
	return nodeNew.approvedRoutes;
}

export async function setPolicy(acl: ACLBuilder) {
	const path = `${API_URL_POLICY}`
	const data = { policy: acl.JSON(4) };
	await apiPost(`${path}/check`, data);
	await apiPut<ApiPolicy>(path, data);
}

export async function refreshApiKey() {
	const oldKey = (await getApiKeys()).find((key) => matchesApiKey(key, App.apiKey.value));
	if (!oldKey) throw new Error(translate('ui.currentApiKeyWasNotFound'));
	const apiKeyNew = await createApiKey();
	const verifiedKeys = await getApiKeys({ headers: { Authorization: `Bearer ${apiKeyNew}` } });
	if (!verifiedKeys.some((key) => matchesApiKey(key, apiKeyNew))) {
		throw new Error(translate('ui.newApiKeyCouldNotBeVerified'));
	}
	// Switch before revocation so a failed response cannot strand the browser on an expired key.
	App.apiKey.value = apiKeyNew;
	await App.populateApiKeyInfo();
	App.apiKeyInfo.value.informedExpiringSoon = false;
	App.apiKeyInfo.value.informedUnauthorized = false;
	try {
		await expireApiKey(oldKey.id);
	} catch (error) {
		throw new Error(translate('ui.newKeyIsActiveButThePreviousKeyCouldNotBeExpiredValue', { values: { v0: String(error) } }));
	}
}
