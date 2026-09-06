import { vi } from 'vitest';
import type { ApiKeyInfo, Node, PreAuthKey, User } from '../src/lib/common/types';

export const App = {
  apiUrl: { value: 'http://headscale.test' },
  apiKey: { value: 'hskey-api-current-secret' },
  apiKeyInfo: { value: { authorized: null, expires: '', informedUnauthorized: false, informedExpiringSoon: false } as ApiKeyInfo },
  debug: { value: false },
  users: { value: [] as User[] },
  nodes: { value: [] as Node[] },
  preAuthKeys: { value: [] as PreAuthKey[] },
  populateApiKeyInfo: vi.fn().mockResolvedValue(true),
  updateValue<T extends { id: string }>(state: { value: T[] }, item: T) {
    state.value = state.value.map(old => old.id === item.id ? Object.assign(old, item) : old);
  },
};
