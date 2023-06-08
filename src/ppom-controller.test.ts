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

    testJsonRPCRequest = async () => await this.#jsonRpcRequest();
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

const buildPPOMController = (args?: any) => {
  const controllerMessenger = new ControllerMessenger();
  const ppomController = new PPOMController({
    storageBackend: storageBackendReturningData,
    provider: () => undefined,
    chainId: '0x1',
    onNetworkChange: () => undefined,
    messenger: controllerMessenger.getRestricted({
      name: 'PPOMController',
    }),
    ...args,
  });
  return ppomController;
};

describe('PPOMController', () => {
  describe('usePPOM', () => {
    it('should be able to invoke usePPOM', async () => {
      const ppomController = buildPPOMController();
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

      const ppomController = buildPPOMController();
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });

      expect(spy).toHaveBeenCalledTimes(3);
    });

    it('should throw error if fetch for version info return 500', async () => {
      buildFetchSpy({
        status: 500,
      });

      const ppomController = buildPPOMController();
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

      const ppomController = buildPPOMController();
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

      let callBack: any;
      const ppomController = buildPPOMController({
        onNetworkChange: (func: any) => {
          callBack = func;
        },
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

      const ppomController = buildPPOMController({
        provider: {
          sendAsync: (_arg1: any, arg2: any) => {
            arg2(undefined, 'DUMMY_VALUE');
          },
        },
      });

      await ppomController.usePPOM(async (ppom: PPOM) => {
        const result = await (ppom as any).testJsonRPCRequest({});
        expect(result).toBe('DUMMY_VALUE');
      });
    });

    it('should throw error if JSON RPC request on provider fails', async () => {
      const ppomController = buildPPOMController({
        provider: {
          sendAsync: (_arg1: any, arg2: any) => {
            arg2('DUMMY_ERROR');
          },
        },
      });
      buildFetchSpy();
      await ppomController.usePPOM(async (ppom: PPOM) => {
        (ppom as any).testJsonRPCRequest({}).catch((exp: any) => {
          // eslint-disable-next-line jest/no-conditional-expect
          expect(exp).toBe('DUMMY_ERROR');
        });
      });
    });
  });

  describe('setRefreshInterval', () => {
    it('should refresh data if refreshInterval is passed the time', async () => {
      const ppomController = buildPPOMController();
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

  describe('clear', () => {
    it('should clear controller state', async () => {
      const ppomController = buildPPOMController();
      const spy = buildFetchSpy();

      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(3);
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(3);
      ppomController.clear();
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(6);
    });
  });
});
