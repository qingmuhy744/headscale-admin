import { App } from '$lib/States.svelte';
import { ApiAuthErrorUnauthorized } from '../errors';
import { debug } from '../debug';

// errors received from headscale
export type ApiError = {
	code: number;
	message: string;
	details: unknown[];
};

export type ApiResponse<T> = T | ApiError;

function isApiError<T>(response: ApiResponse<T>): response is ApiError {
	return response != null && typeof (response as ApiError).code === 'number' && (response as ApiError).code !== 0;
}

async function toApiResponse<T>(response: Response): Promise<T> {
	if (response.status === 401) throw new ApiAuthErrorUnauthorized();
	if (!response.ok) {
		const text = await response.text();
		if (text === 'Unauthorized') {
			throw new ApiAuthErrorUnauthorized();
		}

		try{
			const data = JSON.parse(text)
			if (isApiError(data)) {
				throw new Error(data.message);
			}
		} catch(e) {
			if (!(e instanceof SyntaxError)) {
				throw e
			}
		}


		// unspecified errors
		throw new Error('Unspecified Error: ' + text);
	}

	const text = await response.text();
	const data = text ? JSON.parse(text) : undefined;
	if (isApiError(data)) {
		throw new Error(data.message);
	}

	return data as T;
}

function headers(): { headers: HeadersInit } {
	return {
		headers: {
			Authorization: 'Bearer ' + App.apiKey.value,
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
	};
}

export function toUrl(path: string): string {
	return new URL(path, App.apiUrl.value).href
}

async function apiFetch<T>(path: string, init?: RequestInit, verbose: boolean = false): Promise<T> {
	const requestHeaders = new Headers(headers().headers);
	new Headers(init?.headers).forEach((value, name) => requestHeaders.set(name, value));
	const usesCurrentKey = () => requestHeaders.get('Authorization') === `Bearer ${App.apiKey.value}`;
	try {
		const response = await fetch(toUrl(path), { ...init, headers: requestHeaders });
		if (verbose) {
			debug(response);
		}
		const apiResponse = await toApiResponse<T>(response);
		if (usesCurrentKey() && App.apiKeyInfo.value.authorized === null) {
			App.apiKeyInfo.value.authorized = true
		}
		return apiResponse;
	} catch (err) {
		if (usesCurrentKey() && err instanceof ApiAuthErrorUnauthorized) App.apiKeyInfo.value.authorized = false;
		if (err instanceof Error) {
			debug('Fetch Error:', err.message);
		}
		throw err;
	}
}

export async function apiGet<T>(
	path: string,
	init?: RequestInit,
	verbose: boolean = false,
): Promise<T> {
	return await apiFetch<T>(path, init, verbose);
}

export async function apiDelete<T>(path: string, init?: RequestInit): Promise<T> {
	return await apiFetch<T>(path, { method: 'DELETE', ...init });
}

export async function apiPost<T>(
	path: string,
	data: unknown = null,
	init?: RequestInit,
	verbose: boolean = false,
): Promise<T> {
	const body = JSON.stringify(data ?? {});
	return await apiFetch<T>(path, { method: 'POST', body, ...init }, verbose);
}

export async function apiPut<T>(
	path: string,
	data: unknown = null,
	init?: RequestInit,
	verbose: boolean = false,
): Promise<T> {
	const body = JSON.stringify(data ?? {});
	return await apiFetch<T>(path, { method: 'PUT', body, ...init }, verbose);
}
