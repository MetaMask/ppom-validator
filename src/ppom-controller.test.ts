import { ControllerMessenger } from '@metamask/base-controller';

import { VERSION_INFO, storageBackendReturningData } from '../test/test-utils';
import { PPOM } from './ppom';
import { PPOMController, DAY_IN_MILLISECONDS } from './ppom-controller';

Object.defineProperty(globalThis, 'fetch', {
  writable: true,
  value: () => undefined,
});

jest.mock('./ppom.ts', () => ({
  PPOM: class PPOMClass {
    #jsonRpcRequest;

    constructor(jsonRpcRequest: any) {
      this.#jsonRpcRequest = jsonRpcRequest;
    }

    validateJsonRpc = async () => {
      return Promise.resolve();
    };

    free = () => undefined;

    testJsonRPCRequest = () => this.#jsonRpcRequest();
  },
  ppomInit: () => undefined,
}));

const PPOM_VERSION_PATH =
  'https://storage.googleapis.com/ppom-cdn/ppom_version.json';

const buildFetchSpy = (
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

const controllerMessenger = new ControllerMessenger();

describe('PPOMController', () => {
  const sendAsync = (_arg1: any, arg2: any) => {
    arg2(undefined, 'DUMMY_VALUE');
  };
  let callBack: any;

  const ppomController = new PPOMController({
    storageBackend: storageBackendReturningData,
    provider: { sendAsync },
    chainId: '0x1',
    onNetworkChange: (func: any) => {
      callBack = func;
    },
    messenger: controllerMessenger.getRestricted({
      name: 'PPOMController',
    }),
  });

  describe('usePPOM', () => {
    beforeEach(() => {
      ppomController.clear();
    });

    it('should be able to invoke usePPOM', async () => {
      buildFetchSpy();

      await ppomController.usePPOM(async (ppom: PPOM) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });
    });

    it('should not fetch file if chainId is different from current chainId', async () => {
      const spy = buildFetchSpy({
        status: 200,
        json: () => [
          ...VERSION_INFO,
          {
            name: 'data',
            chainId: '0x2',
            version: '1.0.3',
            checksum:
              '409a7f83ac6b31dc8c77e3ec18038f209bd2f545e0f4177c2e2381aa4e067b49',
            filePath: 'data',
          },
        ],
      });

      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });

      expect(spy).toHaveBeenCalledTimes(3);
    });

    it('should throw error if fetch for version info return 500', async () => {
      buildFetchSpy({
        status: 500,
      });

      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow('Failed to fetch version info');
    });

    it('should throw error if fetch for blob return 500', async () => {
      buildFetchSpy(undefined, {
        status: 500,
      });

      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow(
        'Failed to fetch file with url https://storage.googleapis.com/ppom-cdn/blob',
      );
    });

    it('should refresh data if network is changed', async () => {
      const spy = buildFetchSpy({
        status: 200,
        json: () => [
          ...VERSION_INFO,
          {
            name: 'data',
            chainId: '0x2',
            version: '1.0.3',
            checksum:
              '409a7f83ac6b31dc8c77e3ec18038f209bd2f545e0f4177c2e2381aa4e067b49',
            filePath: 'data',
          },
        ],
      });

      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(3);
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(3);

      callBack('0x2');
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(4);
      callBack('0x1');
    });

    it('should be able to send JSON RPC request to provider', async () => {
      buildFetchSpy();

      await ppomController.usePPOM(async (ppom: PPOM) => {
        expect(ppom).toBeDefined();
        const result = await (ppom as any).testJsonRPCRequest({});
        expect(result).toBe('DUMMY_VALUE');
      });
    });
  });

  describe('setRefreshInterval', () => {
    it('should refresh data if refreshInterval is passed', async () => {
      ppomController.clear();
      ppomController.setRefreshInterval(0);
      const spy = buildFetchSpy();

      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(3);
      ppomController.setRefreshInterval(0);
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(4);

      ppomController.setRefreshInterval(1000);
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(4);
      ppomController.setRefreshInterval(DAY_IN_MILLISECONDS);
    });
  });
});
