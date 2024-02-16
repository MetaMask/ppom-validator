import { ControllerMessenger } from '@metamask/base-controller';
import * as ControllerUtils from '@metamask/controller-utils';
import type { NetworkState } from '@metamask/network-controller';

import type {
  PPOMControllerActions,
  PPOMControllerEvents,
} from '../src/ppom-controller';
import { PPOMController } from '../src/ppom-controller';
import type { StorageKey } from '../src/ppom-storage';
import { SUPPORTED_NETWORK_CHAINIDS } from '../src/util';

export const buildDummyResponse = (
  resultType = 'DUMMY_RESULT_TYPE',
  reason = 'DUMMY_REASON',
) => {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    result_type: resultType,
    reason,
    features: [],
    providerRequestsCount: {},
  };
};

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

export const StorageMetadata = [
  {
    name: 'data',
    chainId: SUPPORTED_NETWORK_CHAINIDS.MAINNET,
    version: '1.0.3',
    checksum:
      '409a7f83ac6b31dc8c77e3ec18038f209bd2f545e0f4177c2e2381aa4e067b49',
  },
  {
    name: 'blob',
    chainId: SUPPORTED_NETWORK_CHAINIDS.MAINNET,
    version: '1.0.0',
    checksum:
      '409a7f83ac6b31dc8c77e3ec18038f209bd2f545e0f4177c2e2381aa4e067b49',
  },
];

export const simpleStorageBackend = buildStorageBackend();

export const DUMMY_ARRAY_BUFFER_DATA = new ArrayBuffer(123);

export const storageBackendReturningData = buildStorageBackend({
  read: async (_key: StorageKey): Promise<any> =>
    Promise.resolve(DUMMY_ARRAY_BUFFER_DATA),
});

export const VERSION_INFO = [
  {
    name: 'blob',
    chainId: SUPPORTED_NETWORK_CHAINIDS.MAINNET,
    version: '1.0.0',
    checksum:
      '409a7f83ac6b31dc8c77e3ec18038f209bd2f545e0f4177c2e2381aa4e067b49',
    signature:
      '0x304402206d433e9172960de6717d94ae263e47eefacd3584a3274a452f8f9567b3a797db02201b2e423188fb3f9daa6ce6a8723f69df26bd3ceeee81f77250526b91e093614f',
    filePath: 'blob',
  },
  {
    name: 'data',
    chainId: SUPPORTED_NETWORK_CHAINIDS.MAINNET,
    version: '1.0.3',
    checksum:
      '409a7f83ac6b31dc8c77e3ec18038f209bd2f545e0f4177c2e2381aa4e067b49',
    signature:
      '0x304402206d433e9172960de6717d94ae263e47eefacd3584a3274a452f8f9567b3a797db02201b2e423188fb3f9daa6ce6a8723f69df26bd3ceeee81f77250526b91e093614f',
    filePath: 'data',
  },
];

const PPOM_VERSION_PATH = 'https://ppom_cdn_base_url/ppom_version.json';

export const buildFetchDataSpy = (
  versionData: any = {
    status: 200,
    json: () => VERSION_INFO,
  },
  blobData: any = {
    status: 200,
    arrayBuffer: () => new TextEncoder().encode('test\n'),
  },
) => {
  return jest
    .spyOn(ControllerUtils, 'timeoutFetch' as any)
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
  eTag?: number,
) => {
  return jest
    .spyOn(ControllerUtils, 'timeoutFetch' as any)
    .mockImplementation((url: any) => {
      if (url === PPOM_VERSION_PATH) {
        return {
          headers: {
            get: () => eTag ?? Math.round(Math.random() * 100),
          },
          ...versionData,
        };
      }
      return blobData;
    });
};

export class PPOMClass {
  #jsonRpcRequest: any;

  constructor(newMock?: any, freeMock?: any) {
    if (newMock) {
      this.new = newMock;
    }
    if (freeMock) {
      this.free = freeMock;
    }
  }

  new = (jsonRpcRequest: any) => {
    this.#jsonRpcRequest = jsonRpcRequest;
    return this;
  };

  validateJsonRpc = async () => {
    return Promise.resolve();
  };

  free = () => undefined;

  testJsonRPCRequest = async (method: string) =>
    await this.#jsonRpcRequest(method ?? 'eth_blockNumber');

  testCallRpcRequests = async () => {
    const methods = [
      'eth_getBalance', // call 1 time
      'eth_getTransactionCount', // call 2 times
      'trace_call', // call 3 times
      'trace_callMany', // call 4 times
      'debug_traceCall', // call 5 times
      'trace_filter', // call 6 times
    ];
    const numberOfCalls = [1, 2, 3, 4, 5, 6];

    const promises = [];

    for (let i = 0; i < methods.length; i++) {
      const limit = numberOfCalls[i] ?? 0;
      for (let j = 0; j < limit; j++) {
        promises.push(this.#jsonRpcRequest(methods[i]));
      }
    }
    await Promise.all(promises);
  };
}

export const buildPPOMController = (args?: any) => {
  const controllerMessenger: ControllerMessenger<
    PPOMControllerActions,
    PPOMControllerEvents
  > = new ControllerMessenger();
  const ppomController = new PPOMController({
    storageBackend: storageBackendReturningData,
    provider: () => undefined,
    chainId: SUPPORTED_NETWORK_CHAINIDS.MAINNET,
    messenger: controllerMessenger.getRestricted({
      name: 'PPOMController',
      allowedEvents: ['NetworkController:stateChange'],
    }),
    securityAlertsEnabled: true,
    onPreferencesChange: () => undefined,
    state: {},
    ppomProvider: {
      ppomInit: () => 123,
      PPOM: new PPOMClass(),
    },
    cdnBaseUrl: 'ppom_cdn_base_url',
    ...args,
  });
  const changeNetwork = (chainId: string) => {
    controllerMessenger.publish(
      'NetworkController:stateChange',
      {
        providerConfig: { chainId },
      } as NetworkState,
      [],
    );
  };
  return { changeNetwork, controllerMessenger, ppomController };
};

// eslint-disable-next-line jsdoc/require-jsdoc
export async function flushPromises() {
  // Wait for promises running in the non-async timer callback to complete.
  // From https://github.com/facebook/jest/issues/2157#issuecomment-897935688
  return new Promise(jest.requireActual('timers').setImmediate);
}
