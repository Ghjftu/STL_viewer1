export type UserRole = 'admin' | 'doctor';

export interface AuthSession {
  token: string;
  role: UserRole;
  userId: string;
  name: string;
}

const AUTH_STORAGE_VERSION = 'auth-v2';
const AUTH_VERSION_KEY = 'authVersion';
const AUTH_KEYS = ['token', 'role', 'userId', 'name', AUTH_VERSION_KEY, 'returnUrl'] as const;
const GUEST_SKETCH_NAME_KEY = 'viewer3d:guest-sketch-name';
const STORAGE_TEST_KEY = '__meshbridge_storage_test__';
let memorySession: AuthSession | null = null;
let memoryReturnUrl: string | null = null;
let memoryGuestSketchName = '';

const getBrowserStorages = (): Storage[] => {
  const storages: Storage[] = [];

  try {
    storages.push(window.localStorage);
  } catch {
    // Some embedded browsers expose storage lazily or block it entirely.
  }

  try {
    storages.push(window.sessionStorage);
  } catch {
    // Session storage can fail independently from local storage.
  }

  return storages;
};

const getAvailableStorage = (): Storage | null => {
  for (const storage of getBrowserStorages()) {
    try {
      storage.setItem(STORAGE_TEST_KEY, '1');
      storage.removeItem(STORAGE_TEST_KEY);
      return storage;
    } catch {
      // Try the next storage backend.
    }
  }

  return null;
};

const safeGet = (key: string): string | null => {
  for (const storage of getBrowserStorages()) {
    try {
      const value = storage.getItem(key);
      if (value) return value;
    } catch {
      // Ignore broken storage and continue with fallbacks.
    }
  }

  return null;
};

export const getSession = (): AuthSession | null => {
  const token = safeGet('token');
  const role = safeGet('role') as UserRole | null;
  const userId = safeGet('userId');
  const name = safeGet('name') || '';
  const authVersion = safeGet(AUTH_VERSION_KEY);

  if (!token && !role && !userId) return memorySession;

  if (authVersion !== AUTH_STORAGE_VERSION) {
    clearSession();
    return null;
  }

  if (!token || !role || !userId) {
    clearSession();
    return null;
  }

  if (role !== 'admin' && role !== 'doctor') {
    clearSession();
    return null;
  }

  return { token, role, userId, name };
};

export const saveSession = (session: AuthSession) => {
  memorySession = session;

  const storage = getAvailableStorage();
  if (!storage) return;

  storage.setItem('token', session.token);
  storage.setItem('role', session.role);
  storage.setItem('userId', session.userId);
  storage.setItem('name', session.name);
  storage.setItem(AUTH_VERSION_KEY, AUTH_STORAGE_VERSION);
};

export const clearSession = () => {
  memorySession = null;

  for (const storage of getBrowserStorages()) {
    for (const key of AUTH_KEYS) {
      try {
        storage.removeItem(key);
      } catch {
        // Best-effort cleanup.
      }
    }
  }
};

export const getAuthToken = (): string | null => getSession()?.token || null;

export const getAuthHeaders = (contentType = true): Record<string, string> => {
  const token = getAuthToken();
  const headers: Record<string, string> = {};

  if (contentType) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

export const getGuestSketchName = (): string => {
  const storedName = safeGet(GUEST_SKETCH_NAME_KEY);
  return storedName || memoryGuestSketchName;
};

export const saveGuestSketchName = (name: string): string => {
  const normalizedName = name.replace(/\s+/g, ' ').trim().slice(0, 80);
  memoryGuestSketchName = normalizedName;

  const storage = getAvailableStorage();
  if (storage && normalizedName) {
    storage.setItem(GUEST_SKETCH_NAME_KEY, normalizedName);
  }

  return normalizedName;
};

export const setReturnUrl = (url: string) => {
  memoryReturnUrl = url;

  const storage = getAvailableStorage();
  if (!storage) return;

  storage.setItem('returnUrl', url);
};

export const consumeReturnUrl = (): string | null => {
  const value = safeGet('returnUrl') || memoryReturnUrl;
  memoryReturnUrl = null;

  for (const storage of getBrowserStorages()) {
    try {
      storage.removeItem('returnUrl');
    } catch {
      // Best-effort cleanup.
    }
  }

  return value;
};

export const isSafeInternalPath = (path: string | null): path is string => {
  return Boolean(path && path.startsWith('/') && !path.startsWith('//') && !path.includes('\\'));
};
