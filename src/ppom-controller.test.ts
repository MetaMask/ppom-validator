import { PPOM } from '@blockaid/ppom-mock';

import {
  VERSION_INFO,
  buildFetchSpy,
  buildPPOMController,
} from '../test/test-utils';
import { REFRESH_TIME_DURATION } from './ppom-controller';

Object.defineProperty(globalThis, 'fetch', {
  writable: true,
  value: () => undefined,
});

Object.defineProperty(globalThis, 'setInterval', {
  writable: true,
  value: (callback: any, times: number) => {
    if (times < 100) {
      for (let i = 0; i < times - 1; i++) {
        // eslint-disable-next-line node/callback-return
        callback();
      }
    }
    return 123;
  },
});

const delay = async (delayInms = 1000) => {
  return new Promise((resolve) => setTimeout(resolve, delayInms));
};

jest.mock('@blockaid/ppom-mock', () => ({
  PPOM: class PPOMClass {
    #jsonRpcRequest;

    constructor(jsonRpcRequest: any) {
      this.#jsonRpcRequest = jsonRpcRequest;
    }

    validateJsonRpc = async () => {
      return Promise.resolve();
    };

    free = () => undefined;

    testJsonRPCRequest = async (args: any) =>
      await this.#jsonRpcRequest({
        method: 'eth_blockNumber',
        ...args,
      });
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  __esModule: true,
  default: () => undefined,
}));

describe('PPOMController', () => {
  let ppomController: any;
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

    it('should refresh data if network is changed and data is not available for new network', async () => {
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

      callBack({ providerConfig: { chainId: '0x2' } });
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(6);
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
        const result = await (ppom as any).testJsonRPCRequest();
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
        (ppom as any).testJsonRPCRequest().catch((exp: any) => {
          // eslint-disable-next-line jest/no-conditional-expect
          expect(exp).toBe('DUMMY_ERROR');
        });
      });
    });

    it('should throw error if method call on provider is not allowed to PPOM', async () => {
      ppomController = buildPPOMController({
        provider: {
          sendAsync: (_arg1: any, arg2: any) => {
            arg2('DUMMY_ERROR');
          },
        },
      });
      buildFetchSpy();
      await ppomController.usePPOM(async (ppom: PPOM) => {
        (ppom as any)
          .testJsonRPCRequest({ method: 'DUMMY_METHOD' })
          .catch((exp: any) => {
            // eslint-disable-next-line jest/no-conditional-expect
            expect(exp.toString()).toBe(
              'Error: Method not allowed on provider DUMMY_METHOD',
            );
          });
      });
    });

    it('should rate limit number of requests by PPOM on provider', async () => {
      ppomController = buildPPOMController({
        provider: {
          sendAsync: (_arg1: any, arg2: any) => {
            arg2(undefined, 'DUMMY_VALUE');
          },
        },
      });
      buildFetchSpy();
      await ppomController.usePPOM(async (ppom: PPOM) => {
        await (ppom as any).testJsonRPCRequest();
        await (ppom as any).testJsonRPCRequest();
        await (ppom as any).testJsonRPCRequest();
        await (ppom as any).testJsonRPCRequest();
        await (ppom as any).testJsonRPCRequest();
        const result = await (ppom as any)
          .testJsonRPCRequest()
          .catch((exp: any) => {
            // eslint-disable-next-line jest/no-conditional-expect
            expect(exp.toString()).toBe(
              'Error: Number of request to provider from PPOM exceed rate limit',
            );
          });
        expect(result).toBeUndefined();
      });
    });
  });

  describe('updatePPOM', () => {
    describe('when updating for only current chainId', () => {
      // in these scenario argument "updateForAllChains" passed to function "updatePPOM" is false
      it('should not fetch file if chainId of the file is different from current chainId in the state', async () => {
        const spy = buildFetchSpy();
        ppomController = buildPPOMController({ chainId: '0x2' });
        await ppomController.updatePPOM(false);
        // here only the version infor file is fetched, once when construction and once during updatePPOM
        expect(spy).toHaveBeenCalledTimes(2);
      });

      it('should not fetch file if it already exists', async () => {
        const spy = buildFetchSpy();

        ppomController = buildPPOMController();
        await ppomController.updatePPOM(false);
        expect(spy).toHaveBeenCalledTimes(4);
        await ppomController.updatePPOM(false);
        expect(spy).toHaveBeenCalledTimes(5);
      });

      it('should throw error if fetch for version info return 500', async () => {
        buildFetchSpy({
          status: 500,
        });

        ppomController = buildPPOMController();
        await expect(async () => {
          await ppomController.updatePPOM(false);
        }).rejects.toThrow('Failed to fetch version info');
      });

      it('should throw error if fetch for blob return 500', async () => {
        buildFetchSpy(undefined, {
          status: 500,
        });

        ppomController = buildPPOMController();
        await expect(async () => {
          await ppomController.updatePPOM(false);
        }).rejects.toThrow(
          'Failed to fetch file with url https://storage.googleapis.com/ppom-cdn/blob',
        );
      });

      it('should set dataFetched to true for chainId in chainIdCache', async () => {
        buildFetchSpy();
        let callBack: any;
        ppomController = buildPPOMController({
          onNetworkChange: (func: any) => {
            callBack = func;
          },
        });

        await ppomController.updatePPOM(false);
        let chainIdData1 = ppomController.state.chainIdCache.find(
          ({ chainId }: any) => chainId === '0x1',
        );
        expect(chainIdData1.dataFetched).toBe(true);
        callBack({ providerConfig: { chainId: '0x2' } });
        await ppomController.updatePPOM(false);
        chainIdData1 = ppomController.state.chainIdCache.find(
          ({ chainId }: any) => chainId === '0x1',
        );
        const chainIdData2 = ppomController.state.chainIdCache.find(
          ({ chainId }: any) => chainId === '0x2',
        );
        expect(chainIdData1.dataFetched).toBe(true);
        expect(chainIdData2.dataFetched).toBe(true);
      });
    });

    describe('when updating all chainids in chainIdCache', () => {
      // in these scenario argument "scheduleFileFetching" passed to function "updatePPOM" is true
      it('should throw error if fetch for version info return 500', async () => {
        buildFetchSpy({
          status: 500,
        });

        ppomController = buildPPOMController();
        await expect(async () => {
          await ppomController.updatePPOM();
        }).rejects.toThrow('Failed to fetch version info');
      });

      it('should not fetch data for network if network data is already fetched', async () => {
        const spy = buildFetchSpy();

        ppomController = buildPPOMController({
          chainId: '0x2',
        });
        await ppomController.updatePPOM();
        expect(spy).toHaveBeenCalledTimes(2);
        await ppomController.updatePPOM();
        expect(spy).toHaveBeenCalledTimes(3);
      });

      it('should set dataFetched to true for chainId in chainIdCache', async () => {
        buildFetchSpy();
        let callBack: any;
        ppomController = buildPPOMController({
          onNetworkChange: (func: any) => {
            callBack = func;
          },
        });

        await ppomController.updatePPOM(false);
        let chainIdData1 = ppomController.state.chainIdCache.find(
          ({ chainId }: any) => chainId === '0x1',
        );
        expect(chainIdData1.dataFetched).toBe(true);
        callBack({ providerConfig: { chainId: '0x2' } });
        await ppomController.updatePPOM(false);
        chainIdData1 = ppomController.state.chainIdCache.find(
          ({ chainId }: any) => chainId === '0x1',
        );
        const chainIdData2 = ppomController.state.chainIdCache.find(
          ({ chainId }: any) => chainId === '0x2',
        );
        expect(chainIdData1.dataFetched).toBe(true);
        expect(chainIdData2.dataFetched).toBe(true);
      });

      it('should get files for all chains in chainIdCache', async () => {
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
        callBack({ providerConfig: { chainId: '0x2' } });
        expect(ppomController.state.chainIdCache).toHaveLength(2);
        await ppomController.updatePPOM();
        expect(spy).toHaveBeenCalledTimes(5);
      });
    });
  });

  describe('setRefreshInterval', () => {
    it('should update refresh interval', async () => {
      const clearIntervalMock = jest.fn();
      Object.defineProperty(globalThis, 'clearInterval', {
        writable: true,
        value: clearIntervalMock,
      });
      ppomController = buildPPOMController({
        refreshInterval: undefined,
        fileScheduleInterval: undefined,
      });
      expect(ppomController.state.refreshInterval).toBe(REFRESH_TIME_DURATION);
      ppomController.setRefreshInterval(5);
      expect(ppomController.state.refreshInterval).toBe(5);
      expect(clearIntervalMock).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should clear controller state', async () => {
      ppomController = buildPPOMController();
      buildFetchSpy();
      await ppomController.updatePPOM(false);
      expect(ppomController.state.storageMetadata).toHaveLength(2);
      ppomController.clear();
      expect(ppomController.state.storageMetadata).toHaveLength(0);
    });
  });

  describe('onNetworkChange', () => {
    it('should add network to chainIdCache if not already added', async () => {
      buildFetchSpy();
      let callBack: any;
      ppomController = buildPPOMController({
        onNetworkChange: (func: any) => {
          callBack = func;
        },
      });

      const chainIdData1 = ppomController.state.chainIdCache.find(
        ({ chainId }: any) => chainId === '0x1',
      );
      expect(chainIdData1).toBeDefined();
      callBack({ providerConfig: { chainId: '0x2' } });
      const chainIdData2 = ppomController.state.chainIdCache.find(
        ({ chainId }: any) => chainId === '0x2',
      );
      expect(chainIdData2).toBeDefined();
    });
  });

  it('should update lastVisited time in chainIdCache if network is already added', async () => {
    buildFetchSpy();
    let callBack: any;
    ppomController = buildPPOMController({
      onNetworkChange: (func: any) => {
        callBack = func;
      },
    });

    const lastVisitedBefore = ppomController.state.chainIdCache.find(
      ({ chainId }: any) => chainId === '0x1',
    ).lastVisited;
    await delay(1);
    callBack({ providerConfig: { chainId: '0x1' } });
    const lastVisitedAfter = ppomController.state.chainIdCache.find(
      ({ chainId }: any) => chainId === '0x1',
    ).lastVisited;
    expect(lastVisitedBefore !== lastVisitedAfter).toBe(true);
  });
});
