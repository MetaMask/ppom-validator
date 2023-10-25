import { ControllerMessenger } from '@metamask/base-controller';
import * as ControllerUtils from '@metamask/controller-utils';

import { PPOMController } from '../src/ppom-controller';
import { StorageKey, arrayBufferToJson } from '../src/ppom-storage';

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

export const simpleStorageBackend = buildStorageBackend();

export const DUMMY_ARRAY_BUFFER_DATA = new ArrayBuffer(123);
export const DUMMY_ARRAY_BUFFER_DATA2 = new ArrayBuffer(234);
export const DUMMY_ARRAY_BUFFER_DATA_JSON = arrayBufferToJson(
  DUMMY_ARRAY_BUFFER_DATA,
);

export const DUMMY_ARRAY_BUFFER_DATA_JSON2 = arrayBufferToJson(
  DUMMY_ARRAY_BUFFER_DATA2,
);

export const DUMMY_NAME = 'blob';
export const DUMMY_NAME2 = 'blob2';
export const DUMMY_DATANAME = 'data';
export const DUMMY_CHAINID = '0x1';
export const DUMMY_CHAINID2 = '0x2';

const DUMMY_CHECKSUM =
  '409a7f83ac6b31dc8c77e3ec18038f209bd2f545e0f4177c2e2381aa4e067b49';
export const DUMMY_CHECKSUM2 =
  '0479688f99e8cbc70291ce272876ff8e0db71a0889daf2752884b0996056b4a0';

export const VERSION_INFO = [
  {
    name: DUMMY_NAME,
    chainId: DUMMY_CHAINID,
    version: '1.0.0',
    checksum:
      '409a7f83ac6b31dc8c77e3ec18038f209bd2f545e0f4177c2e2381aa4e067b49',
    signature:
      '0x304402206d433e9172960de6717d94ae263e47eefacd3584a3274a452f8f9567b3a797db02201b2e423188fb3f9daa6ce6a8723f69df26bd3ceeee81f77250526b91e093614f',
    filePath: DUMMY_NAME,
  },
  {
    name: DUMMY_DATANAME,
    chainId: DUMMY_CHAINID,
    version: '1.0.3',
    checksum:
      '409a7f83ac6b31dc8c77e3ec18038f209bd2f545e0f4177c2e2381aa4e067b49',
    signature:
      '0x304402206d433e9172960de6717d94ae263e47eefacd3584a3274a452f8f9567b3a797db02201b2e423188fb3f9daa6ce6a8723f69df26bd3ceeee81f77250526b91e093614f',
    filePath: DUMMY_DATANAME,
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

class PPOMClass {
  #jsonRpcRequest: any;

  new = (jsonRpcRequest: any) => {
    this.#jsonRpcRequest = jsonRpcRequest;
    return this;
  };

  validateJsonRpc = async () => {
    return Promise.resolve();
  };

  free = () => undefined;

  testJsonRPCRequest = async (method: string, args2: any) =>
    await this.#jsonRpcRequest(method ?? 'eth_blockNumber', args2);

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

export const getFileData = (data = {}) => ({
  chainId: DUMMY_CHAINID,
  name: DUMMY_NAME,
  checksum: DUMMY_CHECKSUM,
  version: '1.0.0',
  ...data,
});

export const buildPPOMController = (args?: any) => {
  const controllerMessenger = new ControllerMessenger();
  const ppomController = new PPOMController({
    provider: () => undefined,
    chainId: '0x1',
    onNetworkChange: () => undefined,
    messenger: controllerMessenger.getRestricted({
      name: 'PPOMController',
    }),
    securityAlertsEnabled: true,
    onPreferencesChange: () => undefined,
    state: {},
    ppomProvider: {
      ppomInit: () => undefined,
      PPOM: new PPOMClass(),
    },
    cdnBaseUrl: 'ppom_cdn_base_url',
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
