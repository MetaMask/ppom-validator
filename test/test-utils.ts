import { ControllerMessenger } from '@metamask/base-controller';

import { PPOMController } from '../src/ppom-controller';
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
    chainId: '0x1',
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

const PPOM_VERSION_PATH =
  'https://storage.googleapis.com/ppom-cdn/ppom_version.json';

export const buildFetchDataSpy = (
  versionData: any = {
    status: 200,
    json: () => VERSION_INFO,
  },
  blobData: any = {
    status: 200,
    arrayBuffer: () => new ArrayBuffer(123),
  },
) => {
  return jest
    .spyOn(globalThis, 'fetch' as any)
    .mockImplementation((url: any) => {
      if (url === PPOM_VERSION_PATH) {
        return versionData;
      }
      return blobData;
    });
};

export const buildFetchSpy = (
  versionData: any = {
    status: 200,
    json: () => VERSION_INFO,
  },
  blobData: any = {
    status: 200,
    arrayBuffer: () => new ArrayBuffer(123),
  },
) => {
  return jest
    .spyOn(globalThis, 'fetch' as any)
    .mockImplementation((url: any) => {
      if (url === PPOM_VERSION_PATH) {
        return versionData;
      }
      return blobData;
    });
};

export const buildPPOMController = (args?: any) => {
  const controllerMessenger = new ControllerMessenger();
  const ppomController = new PPOMController({
    storageBackend: storageBackendReturningData,
    provider: () => undefined,
    chainId: '0x1',
    onNetworkChange: () => undefined,
    messenger: controllerMessenger.getRestricted({
      name: 'PPOMController',
    }),
    blockaidSecurityCheckEnabled: true,
    onPreferencesChange: () => undefined,
    ...args,
  });
  return ppomController;
};

// eslint-disable-next-line jsdoc/require-jsdoc
export async function flushPromises() {
  // Wait for promises running in the non-async timer callback to complete.
  // From https://github.com/facebook/jest/issues/2157#issuecomment-897935688
  return new Promise(jest.requireActual('timers').setImmediate);
}
