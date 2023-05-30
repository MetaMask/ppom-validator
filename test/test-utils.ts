import { StorageKey } from '../src/ppom-storage';

export const buildStorageBackend = (obj = {}) => {
  return {
    read: async (_key: StorageKey): Promise<any> => Promise.resolve(),
    write: async (_key: StorageKey, _data: any): Promise<void> =>
      Promise.resolve(),
    delete: async (_key: StorageKey): Promise<void> => Promise.resolve(),
    dir: async (): Promise<StorageKey[]> => Promise.resolve([]),
    ...obj,
  };
};

export const simpleStorageBackend = buildStorageBackend();

export const DUMMY_ARRAY_BUFFER_DATA = new ArrayBuffer(123);

export const storageBackendReturningData = buildStorageBackend({
  read: async (_key: StorageKey): Promise<any> =>
    Promise.resolve(DUMMY_ARRAY_BUFFER_DATA),
});

export const VERSION_INFO = [
  {
    name: 'blob',
    chainId: '',
    version: '1.0.0',
    checksum:
      '409a7f83ac6b31dc8c77e3ec18038f209bd2f545e0f4177c2e2381aa4e067b49',
    filePath: 'blob',
  },
  {
    name: 'data',
    chainId: '0x1',
    version: '1.0.3',
    checksum:
      '409a7f83ac6b31dc8c77e3ec18038f209bd2f545e0f4177c2e2381aa4e067b49',
    filePath: 'data',
  },
];
