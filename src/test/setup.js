import '@testing-library/jest-dom/vitest';

if (!globalThis.crypto?.randomUUID) {
  globalThis.crypto = { ...globalThis.crypto, randomUUID: () => 'test-uuid' };
}
Object.defineProperty(window, 'scrollTo', { value: () => {}, writable: true });
