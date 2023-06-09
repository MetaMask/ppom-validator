import {
  VERSION_INFO,
  buildFetchSpy,
  buildPPOMController,
} from '../test/test-utils';
import { PPOM } from './ppom';
import { REFRESH_TIME_DURATION } from './ppom-controller';

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

describe('PPOMController', () => {
  let ppomController: any;
  afterEach(() => {
    ppomController.clearRefreshInterval();
  });
  describe('usePPOM', () => {
    it('should provide instance of ppom to the passed ballback', async () => {
      buildFetchSpy();
      ppomController = buildPPOMController();

      await ppomController.usePPOM(async (ppom: PPOM) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });
    });

    it('should return the value returned by callback', async () => {
      buildFetchSpy();
      ppomController = buildPPOMController();

      const result = await ppomController.usePPOM(async (ppom: PPOM) => {
        expect(ppom).toBeDefined();
        return Promise.resolve('DUMMY_VALUE');
      });
      expect(result).toBe('DUMMY_VALUE');
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
      ppomController = buildPPOMController({
        onNetworkChange: (func: any) => {
          callBack = func;
        },
      });
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(4);
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(4);

      callBack('0x2');
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(6);
      callBack('0x1');
    });

    it('should pass instance of provider to ppom to enable it to send JSON RPC request on it', async () => {
      buildFetchSpy();

      ppomController = buildPPOMController({
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

    it('should propogate to ppom if JSON RPC request on provider fails', async () => {
      ppomController = buildPPOMController({
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

  describe('updatePPOM', () => {
    it('should not fetch file if chainId of the file is different from current chainId', async () => {
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

      ppomController = buildPPOMController();
      await ppomController.updatePPOM();
      expect(spy).toHaveBeenCalledTimes(4);
    });

    it('should not fetch file if it already exists', async () => {
      const spy = buildFetchSpy();

      ppomController = buildPPOMController();
      await ppomController.updatePPOM();
      expect(spy).toHaveBeenCalledTimes(4);
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(5);
    });

    it('should throw error if fetch for version info return 500', async () => {
      buildFetchSpy({
        status: 500,
      });

      ppomController = buildPPOMController();
      await expect(async () => {
        await ppomController.updatePPOM();
      }).rejects.toThrow('Failed to fetch version info');
    });

    it('should throw error if fetch for blob return 500', async () => {
      buildFetchSpy(undefined, {
        status: 500,
      });

      ppomController = buildPPOMController();
      await expect(async () => {
        await ppomController.updatePPOM();
      }).rejects.toThrow(
        'Failed to fetch file with url https://storage.googleapis.com/ppom-cdn/blob',
      );
    });
  });

  describe('setRefreshInterval', () => {
    it('should update refresh interval', async () => {
      ppomController = buildPPOMController();
      const spy = buildFetchSpy();

      // controller fetches new data files is difference from last updated time
      // is greater than refresh interval.
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(ppomController.state.refreshInterval).toBe(REFRESH_TIME_DURATION);
      expect(spy).toHaveBeenCalledTimes(4);
      ppomController.setRefreshInterval(0);
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(ppomController.state.refreshInterval).toBe(0);
      expect(spy).toHaveBeenCalledTimes(6);
    });
  });

  describe('clear', () => {
    it('should clear controller state', async () => {
      ppomController = buildPPOMController();
      const spy = buildFetchSpy();
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(4);
      expect(ppomController.state.storageMetadata).toHaveLength(2);
      ppomController.clear();
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(8);
    });
  });
});
