import { PPOM } from '@blockaid/ppom-mock';

import {
  VERSION_INFO,
  buildFetchSpy,
  buildPPOMController,
  buildStorageBackend,
} from '../test/test-utils';
import { REFRESH_TIME_DURATION } from './ppom-controller';

Object.defineProperty(globalThis, 'fetch', {
  writable: true,
  value: () => undefined,
});

Object.defineProperty(globalThis, 'performance', {
  writable: true,
  value: () => undefined,
});

const delay = async (delayInms = 1000) => {
  return new Promise((resolve) => setTimeout(resolve, delayInms));
};

// eslint-disable-next-line jsdoc/require-jsdoc
async function flushPromises() {
  // Wait for promises running in the non-async timer callback to complete.
  // From https://github.com/facebook/jest/issues/2157#issuecomment-897935688
  return new Promise(jest.requireActual('timers').setImmediate);
}

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

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should usePPOM immediately and periodically on creating instance of PPOMController', async () => {
      const spy = buildFetchSpy();
      ppomController = buildPPOMController();

      expect(spy).toHaveBeenCalledTimes(0);
      jest.runAllTicks();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(REFRESH_TIME_DURATION);
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(4);
      jest.advanceTimersByTime(REFRESH_TIME_DURATION - 1);

      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(6);

      jest.advanceTimersByTime(1);

      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(7);

      jest.useRealTimers();
    });
  });

  describe('usePPOM', () => {
    it('should provide instance of ppom to the passed ballback', async () => {
      buildFetchSpy();
      ppomController = buildPPOMController();
      jest.runOnlyPendingTimers();

      await ppomController.usePPOM(async (ppom: PPOM) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });
    });

    it('should return the value returned by callback', async () => {
      buildFetchSpy();
      ppomController = buildPPOMController();
      jest.runOnlyPendingTimers();

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
      jest.runOnlyPendingTimers();

      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      jest.runOnlyPendingTimers();
      expect(spy).toHaveBeenCalledTimes(5);

      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      jest.runOnlyPendingTimers();
      expect(spy).toHaveBeenCalledTimes(6);

      callBack({ providerConfig: { chainId: '0x2' } });
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(10);
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
      jest.runOnlyPendingTimers();

      await ppomController.usePPOM(async (ppom: PPOM) => {
        const result = await (ppom as any).testJsonRPCRequest();
        expect(result).toBe('DUMMY_VALUE');
      });
    });

    it('should propogate to ppom if JSON RPC request on provider fails', async () => {
      buildFetchSpy();
      ppomController = buildPPOMController({
        provider: {
          sendAsync: (_arg1: any, arg2: any) => {
            arg2('DUMMY_ERROR');
          },
        },
      });
      jest.runOnlyPendingTimers();
      await ppomController.usePPOM(async (ppom: PPOM) => {
        (ppom as any).testJsonRPCRequest().catch((exp: any) => {
          // eslint-disable-next-line jest/no-conditional-expect
          expect(exp).toBe('DUMMY_ERROR');
        });
      });
    });

    it('should throw error if method call on provider is not allowed to PPOM', async () => {
      buildFetchSpy();
      ppomController = buildPPOMController({
        provider: {
          sendAsync: (_arg1: any, arg2: any) => {
            arg2('DUMMY_ERROR');
          },
        },
      });
      jest.runOnlyPendingTimers();
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
      buildFetchSpy();
      ppomController = buildPPOMController({
        provider: {
          sendAsync: (_arg1: any, arg2: any) => {
            arg2(undefined, 'DUMMY_VALUE');
          },
        },
      });
      jest.runOnlyPendingTimers();

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

    it('should throw error if the user has not enabled blockaid security check', async () => {
      buildFetchSpy();
      ppomController = buildPPOMController({
        securityAlertsEnabled: false,
      });
      jest.runOnlyPendingTimers();
      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow('User has not enabled blockaidSecurityCheck');
    });
  });

  describe('updatePPOM', () => {
    describe('when updating for only current chainId', () => {
      // in these scenario argument "updateForAllChains" passed to function "updatePPOM" is false
      it('should not fetch file if chainId of the file is different from current chainId in the state', async () => {
        const spy = buildFetchSpy();
        ppomController = buildPPOMController({ chainId: '0x2' });
        jest.runOnlyPendingTimers();
        await flushPromises();
        // here only the version file is fetched
        expect(spy).toHaveBeenCalledTimes(2);
      });

      it('should not fetch file if it already exists', async () => {
        const spy = buildFetchSpy();
        ppomController = buildPPOMController();
        jest.runOnlyPendingTimers();

        await ppomController.updatePPOM(false);
        expect(spy).toHaveBeenCalledTimes(5);
        jest.runOnlyPendingTimers();

        await ppomController.updatePPOM(false);
        expect(spy).toHaveBeenCalledTimes(7);
      });

      it('should throw error if fetch for version info return 500', async () => {
        buildFetchSpy({
          status: 500,
        });
        ppomController = buildPPOMController();
        jest.runOnlyPendingTimers();

        await expect(async () => {
          await ppomController.updatePPOM(false);
        }).rejects.toThrow('Failed to fetch version info');
      });

      it('should throw error if fetch for blob return 500', async () => {
        buildFetchSpy(undefined, {
          status: 500,
        });
        ppomController = buildPPOMController();
        jest.runOnlyPendingTimers();

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
        jest.runOnlyPendingTimers();

        await ppomController.updatePPOM(false);
        jest.runOnlyPendingTimers();
        let chainIdData1 = ppomController.state.chainIdCache.find(
          ({ chainId }: any) => chainId === '0x1',
        );
        expect(chainIdData1.dataFetched).toBe(true);
        callBack({ providerConfig: { chainId: '0x2' } });

        await ppomController.updatePPOM(false);
        jest.runOnlyPendingTimers();
        chainIdData1 = ppomController.state.chainIdCache.find(
          ({ chainId }: any) => chainId === '0x1',
        );
        const chainIdData2 = ppomController.state.chainIdCache.find(
          ({ chainId }: any) => chainId === '0x2',
        );
        expect(chainIdData1.dataFetched).toBe(true);
        expect(chainIdData2.dataFetched).toBe(true);
      });

      it('should throw error if the user has not enabled blockaid security check', async () => {
        buildFetchSpy();
        ppomController = buildPPOMController({
          securityAlertsEnabled: false,
        });
        jest.runOnlyPendingTimers();
        await expect(async () => {
          await ppomController.updatePPOM(false);
        }).rejects.toThrow('User has not enabled blockaidSecurityCheck');
      });
    });

    describe('when updating all chainids in chainIdCache', () => {
      // in these scenario argument "scheduleFileFetching" passed to function "updatePPOM" is true
      it('should throw error if fetch for version info return 500', async () => {
        buildFetchSpy({
          status: 500,
        });
        ppomController = buildPPOMController();
        jest.runOnlyPendingTimers();

        await expect(async () => {
          await ppomController.updatePPOM();
        }).rejects.toThrow('Failed to fetch version info');
      });

      it('should not throw error if fetch for blob return 500', async () => {
        buildFetchSpy(undefined, {
          status: 500,
        });
        ppomController = buildPPOMController();
        jest.runOnlyPendingTimers();

        expect(async () => {
          await ppomController.updatePPOM();
          jest.runOnlyPendingTimers();
        }).not.toThrow(
          'Failed to fetch file with url https://storage.googleapis.com/ppom-cdn/blob',
        );
        await flushPromises();
      });

      it('should not fetch data for network if network data is already fetched', async () => {
        const spy = buildFetchSpy();
        ppomController = buildPPOMController({
          chainId: '0x2',
        });
        jest.runOnlyPendingTimers();

        await ppomController.updatePPOM();
        jest.runOnlyPendingTimers();
        expect(spy).toHaveBeenCalledTimes(3);

        await ppomController.updatePPOM();
        jest.runOnlyPendingTimers();
        expect(spy).toHaveBeenCalledTimes(5);
      });

      it('should set dataFetched to true for chainId in chainIdCache', async () => {
        buildFetchSpy();
        let callBack: any;
        ppomController = buildPPOMController({
          onNetworkChange: (func: any) => {
            callBack = func;
          },
        });
        jest.runOnlyPendingTimers();

        await ppomController.updatePPOM(false);
        jest.runOnlyPendingTimers();
        let chainIdData1 = ppomController.state.chainIdCache.find(
          ({ chainId }: any) => chainId === '0x1',
        );
        expect(chainIdData1.dataFetched).toBe(true);

        callBack({ providerConfig: { chainId: '0x2' } });
        await ppomController.updatePPOM(false);
        jest.runOnlyPendingTimers();
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
        jest.runOnlyPendingTimers();
        callBack({ providerConfig: { chainId: '0x2' } });
        expect(ppomController.state.chainIdCache).toHaveLength(2);
        await ppomController.updatePPOM();
        jest.runOnlyPendingTimers();
        expect(spy).toHaveBeenCalledTimes(6);
      });

      it('should not re-throw error if file write fails', async () => {
        const spy = buildFetchSpy();
        const storageBackend = buildStorageBackend({
          write: async (_key: any, _data: any): Promise<void> =>
            Promise.reject(new Error('some error')),
        });
        ppomController = buildPPOMController({
          storageBackend,
        });
        jest.runOnlyPendingTimers();
        expect(ppomController.state.chainIdCache).toHaveLength(1);
        await ppomController.updatePPOM();
        jest.runOnlyPendingTimers();
        expect(spy).toHaveBeenCalledTimes(5);
      });

      it('should decrease scheduleInterval is its set very high', async () => {
        // here fileScheduleInterval is set very high but advance it by just REFRESH_TIME_DURATION
        // is helping fetch new files as value of fileScheduleInterval is adjusted to be able to fetch all data files
        const spy = buildFetchSpy();
        ppomController = buildPPOMController({
          fileScheduleInterval: REFRESH_TIME_DURATION * 100,
        });
        expect(spy).toHaveBeenCalledTimes(0);
        jest.advanceTimersByTime(REFRESH_TIME_DURATION);
        await flushPromises();
        expect(spy).toHaveBeenCalledTimes(2);

        jest.advanceTimersByTime(REFRESH_TIME_DURATION);
        await flushPromises();
        expect(spy).toHaveBeenCalledTimes(5);
      });
    });
  });

  describe('onNetworkChange', () => {
    it('should add network to chainIdCache if not already added', () => {
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

      jest.useRealTimers();
      await delay(10);

      callBack({ providerConfig: { chainId: '0x2' } });
      callBack({ providerConfig: { chainId: '0x1' } });
      const lastVisitedAfter = ppomController.state.chainIdCache.find(
        ({ chainId }: any) => chainId === '0x1',
      ).lastVisited;
      expect(lastVisitedBefore !== lastVisitedAfter).toBe(true);
    });

    it('should do nothing if new chainId is same as the current chainId', async () => {
      buildFetchSpy();
      let callBack: any;
      ppomController = buildPPOMController({
        onNetworkChange: (func: any) => {
          callBack = func;
        },
      });

      const chainIdCacheBefore = [...ppomController.state.chainIdCache];

      jest.useRealTimers();
      await delay(10);

      callBack({ providerConfig: { chainId: '0x1' } });
      const chainIdCacheAfter = [...ppomController.state.chainIdCache];
      expect(chainIdCacheBefore).toStrictEqual(chainIdCacheAfter);
    });
  });

  describe('onPreferencesChange', () => {
    it('should start file fetching if securityAlertsEnabled is set to true', async () => {
      const spy = buildFetchSpy();
      let callBack: any;
      ppomController = buildPPOMController({
        securityAlertsEnabled: false,
        onPreferencesChange: (func: any) => {
          callBack = func;
        },
      });
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(0);
      callBack({ securityAlertsEnabled: true });
      jest.advanceTimersByTime(REFRESH_TIME_DURATION);
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('should update securityAlertsEnabled in state', async () => {
      buildFetchSpy();
      let callBack: any;
      ppomController = buildPPOMController({
        onPreferencesChange: (func: any) => {
          callBack = func;
        },
      });
      const securityAlertsEnabledBefore =
        ppomController.state.securityAlertsEnabled;
      callBack({ securityAlertsEnabled: false });
      const securityAlertsEnabledAfter =
        ppomController.state.securityAlertsEnabled;
      expect(securityAlertsEnabledBefore).not.toBe(securityAlertsEnabledAfter);
    });

    it('should stop file fetching if securityAlertsEnabled is set to false', async () => {
      const spy = buildFetchSpy();
      let callBack: any;
      ppomController = buildPPOMController({
        onPreferencesChange: (func: any) => {
          callBack = func;
        },
      });
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(2);
      callBack({ securityAlertsEnabled: false });
      jest.advanceTimersByTime(REFRESH_TIME_DURATION);
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('should do nothing if new chainId is same as the current chainId', async () => {
      buildFetchSpy();
      let callBack: any;
      ppomController = buildPPOMController({
        onPreferencesChange: (func: any) => {
          callBack = func;
        },
      });
      const securityAlertsEnabledBefore =
        ppomController.state.securityAlertsEnabled;
      callBack({ securityAlertsEnabled: true });
      const securityAlertsEnabledAfter =
        ppomController.state.securityAlertsEnabled;
      expect(securityAlertsEnabledBefore).toBe(securityAlertsEnabledAfter);
    });
  });
});
