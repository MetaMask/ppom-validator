import {
  VERSION_INFO,
  buildFetchSpy,
  buildPPOMController,
  buildStorageBackend,
} from '../test/test-utils';
import {
  NETWORK_CACHE_DURATION,
  REFRESH_TIME_INTERVAL,
} from './ppom-controller';

Object.defineProperty(globalThis, 'fetch', {
  writable: true,
  value: () => undefined,
});

Object.defineProperty(globalThis, 'performance', {
  writable: true,
  value: () => undefined,
});

// eslint-disable-next-line jsdoc/require-jsdoc
async function flushPromises() {
  // Wait for promises running in the non-async timer callback to complete.
  // From https://github.com/facebook/jest/issues/2157#issuecomment-897935688
  return new Promise(jest.requireActual('timers').setImmediate);
}

describe('PPOMController', () => {
  let ppomController: any;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should update PPOM immediately and periodically on creating instance of PPOMController', async () => {
      const spy = buildFetchSpy();
      ppomController = buildPPOMController();

      expect(spy).toHaveBeenCalledTimes(0);
      jest.runAllTicks();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(6);
      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL - 1);

      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(6);

      jest.advanceTimersByTime(1);

      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(8);
    });
  });

  describe('usePPOM', () => {
    it('should provide instance of ppom to the passed ballback', async () => {
      buildFetchSpy();
      ppomController = buildPPOMController();
      jest.runOnlyPendingTimers();

      await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });
    });

    it('should return the value returned by callback', async () => {
      buildFetchSpy();
      ppomController = buildPPOMController();
      jest.runOnlyPendingTimers();

      const result = await ppomController.usePPOM(async (ppom: any) => {
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
      expect(spy).toHaveBeenCalledTimes(7);

      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      jest.runOnlyPendingTimers();
      expect(spy).toHaveBeenCalledTimes(9);

      callBack({ providerConfig: { chainId: '0x2' } });
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(15);
    });

    it('should re-initialise ppom to use files fetched with scheduled job', async () => {
      buildFetchSpy();
      const freeMock = jest.fn();
      class PPOMClass {
        #jsonRpcRequest: any;

        constructor(freeM: any) {
          this.free = freeM;
        }

        new = (jsonRpcRequest: any) => {
          this.#jsonRpcRequest = jsonRpcRequest;
          return this;
        };

        validateJsonRpc = async () => {
          return Promise.resolve();
        };

        free = freeMock;

        testJsonRPCRequest = async (args2: any) =>
          await this.#jsonRpcRequest({
            method: 'eth_blockNumber',
            ...args2,
          });
      }
      ppomController = buildPPOMController({
        ppomProvider: {
          ppomInit: () => undefined,
          PPOM: new PPOMClass(freeMock),
        },
      });
      jest.runOnlyPendingTimers();
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      jest.runOnlyPendingTimers();
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(freeMock).toHaveBeenCalledTimes(1);
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

      await ppomController.usePPOM(async (ppom: any) => {
        const result = await ppom.testJsonRPCRequest();
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
      await ppomController.usePPOM(async (ppom: any) => {
        ppom.testJsonRPCRequest().catch((exp: any) => {
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
      await ppomController.usePPOM(async (ppom: any) => {
        ppom
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

      await ppomController.usePPOM(async (ppom: any) => {
        await ppom.testJsonRPCRequest();
        await ppom.testJsonRPCRequest();
        await ppom.testJsonRPCRequest();
        await ppom.testJsonRPCRequest();
        await ppom.testJsonRPCRequest();
        const result = await ppom.testJsonRPCRequest().catch((exp: any) => {
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
        expect(spy).toHaveBeenCalledTimes(4);
      });
      it('should not update if version infor file has not changed', async () => {
        const spy = buildFetchSpy({
          headers: {
            get: () => '1',
          },
          status: 200,
          json: () => VERSION_INFO,
        });
        ppomController = buildPPOMController();
        jest.runOnlyPendingTimers();
        await ppomController.updatePPOM({ updateForAllChains: false });
        expect(spy).toHaveBeenCalledTimes(6);
        jest.runOnlyPendingTimers();
        await ppomController.updatePPOM({ updateForAllChains: false });
        expect(spy).toHaveBeenCalledTimes(8);
      });
      it('should not fetch file if it already exists', async () => {
        const spy = buildFetchSpy();
        ppomController = buildPPOMController();
        jest.runOnlyPendingTimers();
        await ppomController.updatePPOM({ updateForAllChains: false });
        expect(spy).toHaveBeenCalledTimes(7);
        jest.runOnlyPendingTimers();
        await ppomController.updatePPOM({ updateForAllChains: false });
        expect(spy).toHaveBeenCalledTimes(10);
      });
      it('should throw error if fetch for version info return 500', async () => {
        buildFetchSpy({
          status: 500,
        });
        ppomController = buildPPOMController();
        jest.runOnlyPendingTimers();
        await expect(async () => {
          await ppomController.updatePPOM({ updateForAllChains: false });
        }).rejects.toThrow(
          'Failed to fetch file with url: https://ppom_cdn_base_url/ppom_version.json',
        );
      });
      it('should throw error if fetch for blob return 500', async () => {
        buildFetchSpy(undefined, {
          status: 500,
        });
        ppomController = buildPPOMController();
        jest.runOnlyPendingTimers();
        await expect(async () => {
          await ppomController.updatePPOM({ updateForAllChains: false });
        }).rejects.toThrow(
          'Failed to fetch file with url: https://ppom_cdn_base_url/blob',
        );
      });
      it('should set dataFetched to true for chainId in chainStatus', async () => {
        buildFetchSpy();
        let callBack: any;
        ppomController = buildPPOMController({
          onNetworkChange: (func: any) => {
            callBack = func;
          },
        });
        jest.runOnlyPendingTimers();
        await ppomController.updatePPOM({ updateForAllChains: false });
        jest.runOnlyPendingTimers();
        let chainIdData1 = ppomController.state.chainStatus['0x1'];
        expect(chainIdData1.dataFetched).toBe(true);
        callBack({ providerConfig: { chainId: '0x2' } });
        await ppomController.updatePPOM({ updateForAllChains: false });
        jest.runOnlyPendingTimers();
        await flushPromises();
        chainIdData1 = ppomController.state.chainStatus['0x1'];
        const chainIdData2 = ppomController.state.chainStatus['0x2'];
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
    describe('when updating all chainids in chainStatus', () => {
      // in these scenario argument "scheduleFileFetching" passed to function "updatePPOM" is true
      it('should throw error if fetch for version info return 500', async () => {
        buildFetchSpy({
          status: 500,
        });
        ppomController = buildPPOMController();
        jest.runOnlyPendingTimers();
        await expect(async () => {
          await ppomController.updatePPOM();
        }).rejects.toThrow(
          'Failed to fetch file with url: https://ppom_cdn_base_url/ppom_version.json',
        );
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
          'Failed to fetch file with url: https://ppom_cdn_base_url/blob',
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
        expect(spy).toHaveBeenCalledTimes(6);
        await ppomController.updatePPOM();
        jest.runOnlyPendingTimers();
        expect(spy).toHaveBeenCalledTimes(10);
      });
      it('should set dataFetched to true for chainId in chainStatus', async () => {
        buildFetchSpy();
        let callBack: any;
        ppomController = buildPPOMController({
          onNetworkChange: (func: any) => {
            callBack = func;
          },
        });
        jest.runOnlyPendingTimers();
        await ppomController.updatePPOM({ updateForAllChains: false });
        jest.runOnlyPendingTimers();
        let chainIdData1 = ppomController.state.chainStatus['0x1'];
        expect(chainIdData1.dataFetched).toBe(true);
        callBack({ providerConfig: { chainId: '0x2' } });
        await ppomController.updatePPOM({ updateForAllChains: false });
        jest.runOnlyPendingTimers();
        await flushPromises();
        chainIdData1 = ppomController.state.chainStatus['0x1'];
        const chainIdData2 = ppomController.state.chainStatus['0x2'];
        expect(chainIdData1.dataFetched).toBe(true);
        expect(chainIdData2.dataFetched).toBe(true);
      });
      it('should get files for all chains in chainStatus', async () => {
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
        expect(Object.keys(ppomController.state.chainStatus)).toHaveLength(2);
        await ppomController.updatePPOM();
        jest.runOnlyPendingTimers();
        await flushPromises();
        expect(spy).toHaveBeenCalledTimes(11);
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
        expect(Object.keys(ppomController.state.chainStatus)).toHaveLength(1);
        await ppomController.updatePPOM();
        jest.runOnlyPendingTimers();
        expect(spy).toHaveBeenCalledTimes(8);
      });
      it('should decrease scheduleInterval is its set very high', async () => {
        // here fileScheduleInterval is set very high but advance it by just REFRESH_TIME_INTERVAL
        // is helping fetch new files as value of fileScheduleInterval is adjusted to be able to fetch all data files
        const spy = buildFetchSpy();
        ppomController = buildPPOMController({
          state: {
            fileScheduleInterval: REFRESH_TIME_INTERVAL * 100,
          },
        });
        expect(spy).toHaveBeenCalledTimes(0);
        jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
        await flushPromises();
        expect(spy).toHaveBeenCalledTimes(4);
        jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
        await flushPromises();
        expect(spy).toHaveBeenCalledTimes(8);
      });
      it('should delete network more than a week old from chainStatus', async () => {
        buildFetchSpy();
        let callBack: any;
        ppomController = buildPPOMController({
          onNetworkChange: (func: any) => {
            callBack = func;
          },
        });
        jest.runOnlyPendingTimers();
        await flushPromises();
        const chainIdData1 = ppomController.state.chainStatus['0x1'];
        expect(chainIdData1).toBeDefined();
        callBack({ providerConfig: { chainId: '0x2' } });
        jest.advanceTimersByTime(NETWORK_CACHE_DURATION);
        jest.runOnlyPendingTimers();
        await flushPromises();
        const chainIdData2 = ppomController.state.chainStatus['0x1'];
        expect(chainIdData2).toBeUndefined();
      });
    });
  });

  describe('onNetworkChange', () => {
    it('should add network to chainStatus if not already added', () => {
      buildFetchSpy();
      let callBack: any;
      ppomController = buildPPOMController({
        onNetworkChange: (func: any) => {
          callBack = func;
        },
      });

      const chainIdData1 = ppomController.state.chainStatus['0x1'];
      expect(chainIdData1).toBeDefined();
      callBack({ providerConfig: { chainId: '0x2' } });
      const chainIdData2 = ppomController.state.chainStatus['0x2'];
      expect(chainIdData2).toBeDefined();
    });

    it('should update lastVisited time in chainStatus if network is already added', async () => {
      buildFetchSpy();
      let callBack: any;
      ppomController = buildPPOMController({
        onNetworkChange: (func: any) => {
          callBack = func;
        },
      });

      jest.setSystemTime(new Date('2023-01-01'));
      const lastVisitedBefore =
        ppomController.state.chainStatus['0x1'].lastVisited;

      jest.useFakeTimers().setSystemTime(new Date('2023-01-02'));

      callBack({ providerConfig: { chainId: '0x2' } });
      callBack({ providerConfig: { chainId: '0x1' } });
      const lastVisitedAfter =
        ppomController.state.chainStatus['0x1'].lastVisited;
      expect(lastVisitedBefore !== lastVisitedAfter).toBe(true);
    });

    it('should do nothing if new chainId is same as the current chainId', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2023-01-01'));
      buildFetchSpy();
      let callBack: any;
      ppomController = buildPPOMController({
        onNetworkChange: (func: any) => {
          callBack = func;
        },
      });

      const chainIdCacheBefore = { ...ppomController.state.chainStatus };
      const lastVisitedBefore =
        ppomController.state.chainStatus['0x1'].lastVisited;

      jest.useFakeTimers().setSystemTime(new Date('2023-01-02'));
      callBack({ providerConfig: { chainId: '0x1' } });
      const chainIdCacheAfter = { ...ppomController.state.chainStatus };
      const lastVisitedAfter =
        ppomController.state.chainStatus['0x1'].lastVisited;
      expect(chainIdCacheBefore).toStrictEqual(chainIdCacheAfter);
      expect(lastVisitedBefore).toBe(lastVisitedAfter);
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
      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(4);
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
      expect(spy).toHaveBeenCalledTimes(4);
      callBack({ securityAlertsEnabled: false });
      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(4);
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
