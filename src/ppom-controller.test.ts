import crypto from 'crypto';

import {
  DUMMY_ARRAY_BUFFER_DATA_JSON,
  DUMMY_CHAINID,
  DUMMY_NAME,
  VERSION_INFO,
  buildDummyResponse,
  buildFetchSpy,
  buildPPOMController,
  getFileData,
} from '../test/test-utils';
import {
  NETWORK_CACHE_DURATION,
  REFRESH_TIME_INTERVAL,
} from './ppom-controller';
import * as Utils from './util';

Object.defineProperty(globalThis, 'crypto', {
  value: {
    subtle: crypto.webcrypto.subtle,
  },
});

jest.mock('@metamask/controller-utils', () => {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    ...jest.requireActual('@metamask/controller-utils'),
  };
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

  const dummyResponse = buildDummyResponse();

  beforeEach(() => {
    jest.useFakeTimers();
    jest
      .spyOn(Utils, 'validateSignature')
      .mockImplementation(async () => Promise.resolve());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should update PPOM immediately and periodically on creating instance of PPOMController', async () => {
      const spy = buildFetchSpy(undefined, undefined, 123);
      ppomController = buildPPOMController();

      expect(spy).toHaveBeenCalledTimes(0);
      jest.runAllTicks();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(5);
      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL - 1);

      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(5);

      jest.advanceTimersByTime(1);

      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(6);
    });

    it('should not fail if there is error in initializing PPOM', async () => {
      buildFetchSpy();
      ppomController = buildPPOMController({
        ppomProvider: {
          ppomInit: async () => {
            throw Error('Error initializing PPOM');
          },
        },
      });
      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
      await flushPromises();

      expect(ppomController).toBeDefined();
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
        return Promise.resolve(buildDummyResponse());
      });
      expect(result).toStrictEqual(dummyResponse);
    });

    it('should fetch data for files in version info other than mainnet', async () => {
      const spy = buildFetchSpy(
        {
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
        },
        undefined,
        123,
      );
      ppomController = buildPPOMController({
        fileFetchScheduleDuration: 0,
      });

      jest.runOnlyPendingTimers();
      const result = await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve(buildDummyResponse());
      });
      expect(result).toStrictEqual(dummyResponse);
      expect(spy).toHaveBeenCalledTimes(7);
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
        ppom.testJsonRPCRequest('DUMMY_METHOD').catch((exp: any) => {
          // eslint-disable-next-line jest/no-conditional-expect
          expect(exp.error.message).toBe('Method not supported');
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
        providerRequestLimit: 5,
      });
      jest.runOnlyPendingTimers();

      await ppomController.usePPOM(async (ppom: any) => {
        await ppom.testJsonRPCRequest();
        await ppom.testJsonRPCRequest();
        await ppom.testJsonRPCRequest();
        await ppom.testJsonRPCRequest();
        await ppom.testJsonRPCRequest();
        await ppom.testJsonRPCRequest();
        const result = await ppom.testJsonRPCRequest().catch((exp: any) => {
          // eslint-disable-next-line jest/no-conditional-expect
          expect(exp.error.message).toBe('Limit exceeded');
        });
        expect(result.error.code).toBe(
          Utils.PROVIDER_ERRORS.limitExceeded().error.code,
        );
      });
    });

    it('should record number of times each RPC method is called and return it in response', async () => {
      buildFetchSpy();
      ppomController = buildPPOMController({
        provider: {
          sendAsync: (_arg1: any, arg2: any) => {
            arg2(undefined, 'DUMMY_VALUE');
          },
        },
        providerRequestLimit: 25,
      });
      jest.runOnlyPendingTimers();

      const result = await ppomController.usePPOM(async (ppom: any) => {
        await ppom.testCallRpcRequests();
        return Promise.resolve(buildDummyResponse());
      });

      const providerRequestsCount = {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        eth_getBalance: 1,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        eth_getTransactionCount: 2,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        trace_call: 3,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        trace_callMany: 4,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        debug_traceCall: 5,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        trace_filter: 6,
      };

      expect(result.providerRequestsCount).toStrictEqual(providerRequestsCount);
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
      }).rejects.toThrow('User has securityAlertsEnabled set to false');
    });

    // TODO: We currently have constraint of mainnet in controller, but we will soon remove this.
    it('should throw error if the user is not on ethereum mainnet', async () => {
      buildFetchSpy();
      ppomController = buildPPOMController({
        chainId: '0x2',
      });
      jest.runOnlyPendingTimers();
      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow(
        'Blockaid validation is available only on ethereum mainnet',
      );
    });

    it('should throw error if no files are present for the network', async () => {
      buildFetchSpy({
        status: 200,
        json: () => [],
      });
      ppomController = buildPPOMController();
      jest.runOnlyPendingTimers();
      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow(
        'Aborting validation as no files are found for the network with chainId: 0x1',
      );
    });

    it(`should use old version info data that was fetched even if after CDN is updated,
        till next scheduled job to fetch data runs`, async () => {
      const spyEmptyResponse = buildFetchSpy({
        status: 200,
        json: () => [],
      });
      ppomController = buildPPOMController();
      jest.runAllTicks();
      await flushPromises();
      expect(spyEmptyResponse).toHaveBeenCalledTimes(2);

      const spyWithResponse = buildFetchSpy();
      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
      jest.runOnlyPendingTimers();
      expect(spyWithResponse).toHaveBeenCalledTimes(2);

      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow(
        'Aborting validation as no files are found for the network with chainId: 0x1',
      );
    });

    it('should throw error if file version info is not present for the network', async () => {
      buildFetchSpy({
        status: 200,
        json: () => [],
      });
      ppomController = buildPPOMController();
      jest.runOnlyPendingTimers();
      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow(
        'Aborting validation as no files are found for the network with chainId: 0x1',
      );
    });

    it('should throw error if fetch for blob return 500', async () => {
      buildFetchSpy(undefined, {
        status: 500,
      });
      ppomController = buildPPOMController();
      jest.runOnlyPendingTimers();
      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow(
        'Failed to fetch file with url: https://ppom_cdn_base_url/blob',
      );
    });

    it('should throw error if file path containe weird characters', async () => {
      buildFetchSpy({
        status: 200,
        json: () => [
          {
            name: 'blob',
            chainId: '0x1',
            version: '1.0.0',
            checksum:
              '409a7f83ac6b31dc8c77e3ec18038f209bd2f545e0f4177c2e2381aa4e067b49',
            filePath: 'test~123$.2*()',
          },
        ],
      });
      ppomController = buildPPOMController();
      jest.runOnlyPendingTimers();
      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow('Invalid file path for data file: test~123$.2*()');
    });

    it('should not fail even if local storage files are corrupted', async () => {
      buildFetchSpy();
      ppomController = buildPPOMController();
      jest.runOnlyPendingTimers();

      await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });
    });

    it('should fail if no files are found for the network', async () => {
      buildFetchSpy();
      let callBack: any;
      ppomController = buildPPOMController({
        state: {
          storageMetadata: [getFileData()],
          fileStorage: {
            [`${DUMMY_NAME}_${DUMMY_CHAINID}`]: DUMMY_ARRAY_BUFFER_DATA_JSON,
          },
        },
        onNetworkChange: (func: any) => {
          callBack = func;
        },
        chainId: '0x2',
      });
      callBack({ providerConfig: { chainId: '0x1' } });
      jest.runOnlyPendingTimers();

      await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });
      callBack({ providerConfig: { chainId: '0x2' } });
      callBack({ providerConfig: { chainId: '0x1' } });
      jest.runOnlyPendingTimers();

      buildFetchSpy(undefined, {
        status: 500,
      });

      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow(
        'Aborting validation as no files are found for the network with chainId: 0x1',
      );
    });
  });

  describe('updatePPOM', () => {
    it('should throw error if preference securityAlertsEnabled is not enabled', async () => {
      ppomController = buildPPOMController({ securityAlertsEnabled: false });
      jest.runOnlyPendingTimers();
      await expect(async () => {
        await ppomController.updatePPOM();
      }).rejects.toThrow('User has securityAlertsEnabled set to false');
    });
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
      const spy = buildFetchSpy(undefined, undefined, 123);
      ppomController = buildPPOMController();
      jest.runOnlyPendingTimers();
      await ppomController.updatePPOM();
      jest.runOnlyPendingTimers();
      expect(spy).toHaveBeenCalledTimes(6);
      await ppomController.updatePPOM();
      jest.runOnlyPendingTimers();
      expect(spy).toHaveBeenCalledTimes(8);
    });
    it('should set dataFetched to true for supported chainIds in chainStatus', async () => {
      buildFetchSpy();
      let callBack: any;
      ppomController = buildPPOMController({
        onNetworkChange: (func: any) => {
          callBack = func;
        },
      });
      jest.runOnlyPendingTimers();
      callBack({ providerConfig: { chainId: '0x2' } });
      await ppomController.updatePPOM();
      jest.runOnlyPendingTimers();
      await flushPromises();
      const chainIdData1 = ppomController.state.chainStatus['0x1'];
      const chainIdData2 = ppomController.state.chainStatus['0x2'];
      expect(chainIdData1.dataFetched).toBe(true);
      expect(chainIdData2.dataFetched).toBe(false);
    });
    it('should get files for only supported chains in chainStatus', async () => {
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
            signature:
              '0x304402206d433e9172960de6717d94ae263e47eefacd3584a3274a452f8f9567b3a797db02201b2e423188fb3f9daa6ce6a8723f69df26bd3ceeee81f77250526b91e093614f',
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
      expect(spy).toHaveBeenCalledTimes(10);
    });
    it('should not re-throw error if file write fails', async () => {
      const spy = buildFetchSpy(undefined, undefined, 123);
      ppomController = buildPPOMController();
      jest.runOnlyPendingTimers();
      expect(Object.keys(ppomController.state.chainStatus)).toHaveLength(1);
      await ppomController.updatePPOM();
      jest.runOnlyPendingTimers();
      expect(spy).toHaveBeenCalledTimes(6);
    });
    it('should decrease scheduleInterval if its set very high', async () => {
      // here fileScheduleInterval is set very high but advance it by just REFRESH_TIME_INTERVAL
      // is helping fetch new files as value of fileScheduleInterval is adjusted to be able to fetch all data files
      const spy = buildFetchSpy(undefined, undefined, 123);
      ppomController = buildPPOMController({
        fileFetchScheduleDuration: REFRESH_TIME_INTERVAL * 100,
      });
      expect(spy).toHaveBeenCalledTimes(0);
      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(3);
      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(6);
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
      callBack({ providerConfig: { chainId: '0x3' } });
      jest.advanceTimersByTime(NETWORK_CACHE_DURATION);
      jest.runOnlyPendingTimers();
      await flushPromises();
      const chainIdData2 = ppomController.state.chainStatus['0x1'];
      expect(chainIdData2).toBeUndefined();
    });
    it('should not get files if ETag of version info file is not changed', async () => {
      const spy = buildFetchSpy(undefined, undefined, 1);
      ppomController = buildPPOMController();

      jest.runAllTicks();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(5);

      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(6);
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

    it('should delete old network if more than 5 networks are added', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2023-01-01'));
      buildFetchSpy();
      let callBack: any;
      ppomController = buildPPOMController({
        onNetworkChange: (func: any) => {
          callBack = func;
        },
      });

      expect(Object.keys(ppomController.state.chainStatus)).toHaveLength(1);

      jest.useFakeTimers().setSystemTime(new Date('2023-01-02'));
      callBack({ providerConfig: { chainId: '0x2' } });

      jest.useFakeTimers().setSystemTime(new Date('2023-01-05'));
      callBack({ providerConfig: { chainId: '0x5' } });

      jest.useFakeTimers().setSystemTime(new Date('2023-01-03'));
      callBack({ providerConfig: { chainId: '0x3' } });

      jest.useFakeTimers().setSystemTime(new Date('2023-01-04'));
      callBack({ providerConfig: { chainId: '0x4' } });

      expect(Object.keys(ppomController.state.chainStatus)).toHaveLength(5);

      jest.useFakeTimers().setSystemTime(new Date('2023-01-06'));
      callBack({ providerConfig: { chainId: '0x6' } });
      expect(Object.keys(ppomController.state.chainStatus)).toHaveLength(5);

      expect(ppomController.state.chainStatus['0x1']).toBeUndefined();
    });

    it('should reset PPOM when network is changed', async () => {
      buildFetchSpy();
      const newMock = jest.fn().mockReturnValue('abc');
      class PPOMClass {
        #jsonRpcRequest: any;

        constructor(newM: any) {
          this.new = newM;
        }

        new = (jsonRpcRequest: any) => {
          this.#jsonRpcRequest = jsonRpcRequest;
          return this;
        };

        validateJsonRpc = async () => {
          return Promise.resolve();
        };

        free = () => undefined;

        testJsonRPCRequest = async (
          method = 'eth_blockNumber',
          args2: any = {},
        ) => await this.#jsonRpcRequest(method, ...args2);
      }
      let callBack: any;
      ppomController = buildPPOMController({
        onNetworkChange: (func: any) => {
          callBack = func;
        },
        chainId: '0x2',
        ppomProvider: {
          ppomInit: () => undefined,
          PPOM: new PPOMClass(newMock),
        },
      });

      callBack({ providerConfig: { chainId: '0x1' } });
      jest.runOnlyPendingTimers();
      expect(newMock).toHaveBeenCalledTimes(0);
      await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        expect(newMock).toHaveBeenCalledTimes(1);
        return Promise.resolve();
      });
      jest.runOnlyPendingTimers();
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
      expect(spy).toHaveBeenCalledTimes(6);
    });

    it('should do nothing if incoming value of securityAlertsEnabled is set to false when it was already false', async () => {
      const spy = buildFetchSpy();
      let callBack: any;
      ppomController = buildPPOMController({
        onPreferencesChange: (func: any) => {
          callBack = func;
        },
        securityAlertsEnabled: false,
      });
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(0);
      callBack({ securityAlertsEnabled: false });
      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(0);
    });

    it('should update securityAlertsEnabled in state', async () => {
      buildFetchSpy();
      let callBack: any;
      ppomController = buildPPOMController({
        onPreferencesChange: (func: any) => {
          callBack = func;
        },
      });
      jest.runOnlyPendingTimers();

      await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });
      callBack({ securityAlertsEnabled: false });
      // jest.runOnlyPendingTimers();
      // await flushPromises();
      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow('User has securityAlertsEnabled set to false');
    });

    it('should stop file fetching if securityAlertsEnabled is set to false', async () => {
      const spy = buildFetchSpy(undefined, undefined, 123);
      let callBack: any;
      ppomController = buildPPOMController({
        onPreferencesChange: (func: any) => {
          callBack = func;
        },
      });
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(3);
      callBack({ securityAlertsEnabled: false });
      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(3);
    });
  });
});
