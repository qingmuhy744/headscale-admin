import { translate } from '$lib/i18n';
import { API_URL_NODE, API_URL_POLICY, API_URL_PREAUTHKEY, API_URL_USER, apiGet } from '$lib/common/api';
import type {
	ApiNodes,
	ApiPolicy,
	ApiPreAuthKeys,
	ApiUsers,
	Node,
	PreAuthKey,
	User,
} from '$lib/common/types';
import type { ApiApiKeys, ApiKey } from '$lib/common/types';
import { API_URL_APIKEY } from './url';

export async function getPreAuthKeys(
	user_ids?: string[],
	init?: RequestInit,
): Promise<PreAuthKey[]> {
	const { preAuthKeys } = await apiGet<ApiPreAuthKeys>(API_URL_PREAUTHKEY, init);
	return user_ids === undefined
		? preAuthKeys
		: preAuthKeys.filter((key) => key.user && user_ids.includes(key.user.id));
}

export async function getApiKeys(init?: RequestInit): Promise<ApiKey[]> {
	const { apiKeys } = await apiGet<ApiApiKeys>(API_URL_APIKEY, init);
	return apiKeys;
}

type GetUserOptions = 
	{id: string, name?: never, email?: never} |
	{id?: never, name: string, email?: never} |
	{id?: never, name?: never, email: string}

export async function getUsers(init?: RequestInit, options?: GetUserOptions): Promise<User[]> {
	let url = API_URL_USER;
	if (options !== undefined){
		if(options.id !== undefined) {
			url += "?" + new URLSearchParams({ id: options.id })
		} else if (options.name !== undefined) {
			url += "?" + new URLSearchParams({ name: options.name })
		} else if (options.email !== undefined) {
			url += "?" + new URLSearchParams({ email: options.email })
		} else {
			throw new Error(translate('ui.invalidUserParameters'))
		}
	}
	const { users } = await apiGet<ApiUsers>(url, init);
	return users;
}

export async function getNodes(): Promise<Node[]> {
	const { nodes } = await apiGet<ApiNodes>(API_URL_NODE);
	return nodes;
}

export async function getPolicy(): Promise<string> {
	const { policy } = await apiGet<ApiPolicy>(API_URL_POLICY)
	return policy
}
