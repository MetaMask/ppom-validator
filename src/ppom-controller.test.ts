import {
  VERSION_INFO,
  buildDummyResponse,
  buildFetchSpy,
  buildPPOMController,
  buildStorageBackend,
} from '../test/test-utils';
import {
  NETWORK_CACHE_DURATION,
  REFRESH_TIME_INTERVAL,
} from './ppom-controller';
import * as Utils from './util';

jest.mock('@metamask/controller-utils', () => {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    ...jest.requireActual('@metamask/controller-utils'),
  };
});

jest.mock('await-semaphore', () => {
  class Mutex {
    use(callback: any) {
      return callback();
    }
  }
  return {
    ...jest.requireActual('await-semaphore'),
    Mutex,
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

      expect(spy).toHaveBeenCalledTimes(1);
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

    it('should create instance of PPOMController even if there is an error in initialising PPOM', async () => {
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
      await flushPromises();

      await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });
    });

    it('should return the value returned by callback', async () => {
      buildFetchSpy();
      ppomController = buildPPOMController();
      jest.runOnlyPendingTimers();
      await flushPromises();

      const result = await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve(buildDummyResponse());
      });
      expect(result).toStrictEqual(dummyResponse);
    });

    it('should not fetch files for network not supported for PPOM validations', async () => {
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
      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL + 1);
      await flushPromises();

      await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(5);
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
      await flushPromises();

      await ppomController.usePPOM(async (ppom: any) => {
        const result = await ppom.testJsonRPCRequest();
        expect(result).toBe('DUMMY_VALUE');
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
      }).rejects.toThrow('User has securityAlertsEnabled set to false');
    });

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
      const spyEmptyResponse = buildFetchSpy(
        {
          status: 200,
          json: () => [],
        },
        undefined,
        123,
      );
      ppomController = buildPPOMController();
      jest.runAllTicks();
      await flushPromises();
      expect(spyEmptyResponse).toHaveBeenCalledTimes(2);

      buildFetchSpy();

      // even though new version has files
      // ppom continues to use old information till the new one is downloaded by scheduled job
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
        json: () => undefined,
      });
      ppomController = buildPPOMController();
      jest.runOnlyPendingTimers();
      await flushPromises();
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
      await flushPromises();
      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow(
        'Aborting validation as not all files could not be downloaded for the network with chainId: 0x1',
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
      await flushPromises();
      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow(
        'Aborting validation as not all files could not be downloaded for the network with chainId: 0x1',
      );
    });

    it('should not fail even if local storage files are corrupted', async () => {
      buildFetchSpy();
      ppomController = buildPPOMController({
        storageBackend: buildStorageBackend({
          read: async (): Promise<any> => {
            throw new Error('not found');
          },
        }),
      });
      jest.runOnlyPendingTimers();
      await flushPromises();

      await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });
    });

    it('should fail if local storage files are corrupted and CDN also not return file', async () => {
      buildFetchSpy(undefined, undefined, 123);
      let callBack: any;
      ppomController = buildPPOMController({
        storageBackend: buildStorageBackend({
          read: async (): Promise<any> => {
            throw new Error('not found');
          },
        }),
        onNetworkChange: (func: any) => {
          callBack = func;
        },
        chainId: '0x1',
      });
      jest.runOnlyPendingTimers();
      await flushPromises();
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      callBack({
        networkConfigurations: {},
        providerConfig: { chainId: '0x2' },
      });
      callBack({
        networkConfigurations: {},
        providerConfig: { chainId: '0x1' },
      });
      buildFetchSpy(
        undefined,
        {
          status: 500,
        },
        456,
      );
      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL + 1);
      jest.advanceTimersByTime(1);
      await flushPromises();

      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow(
        'Aborting validation as not all files could not be downloaded for the network with chainId: 0x1',
      );
    });

    it('should pass instance of provider to ppom from the network registry if networkClientId is provided', async () => {
      buildFetchSpy();
      ppomController = buildPPOMController({
        provider: {
          sendAsync: (_arg1: any, arg2: any) => {
            arg2(undefined, 'DUMMY_VALUE_FROM_PROVIDER_PROXY');
          },
        },
      });
      jest.spyOn(ppomController.messagingSystem, 'call').mockReturnValue({
        configuration: {
          chainId: '0x1',
        },
        provider: {
          sendAsync: (_arg1: any, arg2: any) => {
            arg2(undefined, 'DUMMY_VALUE_FROM_NETWORK_REGISTRY');
          },
        },
      });
      jest.runOnlyPendingTimers();

      await ppomController.usePPOM(async (ppom: any) => {
        const result = await ppom.testJsonRPCRequest();
        expect(result).toBe('DUMMY_VALUE_FROM_NETWORK_REGISTRY');
      }, 'networkClientId1');
      expect(ppomController.messagingSystem.call).toHaveBeenCalledWith(
        'NetworkController:getNetworkClientById',
        'networkClientId1',
      );
    });

    it('should use chain ID from the network registry if networkClientId is provided', async () => {
      buildFetchSpy();
      ppomController = buildPPOMController();
      jest.spyOn(ppomController.messagingSystem, 'call').mockReturnValue({
        configuration: {
          chainId: '0x5',
        },
      });
      jest.runOnlyPendingTimers();

      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        }, 'networkClientId1');
      }).rejects.toThrow(
        'Blockaid validation is available only on ethereum mainnet',
      );
      expect(ppomController.messagingSystem.call).toHaveBeenCalledWith(
        'NetworkController:getNetworkClientById',
        'networkClientId1',
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
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(3);
      await ppomController.updatePPOM();
      jest.runOnlyPendingTimers();
      await flushPromises();
      // 4 calls to version info file and 2 data files
      expect(spy).toHaveBeenCalledTimes(7);
      await ppomController.updatePPOM();
      jest.runOnlyPendingTimers();
      await flushPromises();
      // 2 additional call this time is to version info HEAD
      expect(spy).toHaveBeenCalledTimes(9);
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
      callBack({
        networkConfigurations: {},
        providerConfig: { chainId: '0x2' },
      });
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
      callBack({
        networkConfigurations: {},
        providerConfig: { chainId: '0x2' },
      });
      expect(Object.keys(ppomController.state.chainStatus)).toHaveLength(2);
      await ppomController.updatePPOM();
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(13);
    });

    it('should not re-throw error if file write fails', async () => {
      const spy = buildFetchSpy(undefined, undefined, 123);
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
      expect(spy).toHaveBeenCalledTimes(5);
    });

    it('should decrease scheduleInterval if its set very high', async () => {
      // here fileScheduleInterval is set very high but advance it by just REFRESH_TIME_INTERVAL
      // is helping fetch new files as value of fileScheduleInterval is adjusted to be able to fetch all data files
      const spy = buildFetchSpy(undefined, undefined, 123);
      ppomController = buildPPOMController({
        fileFetchScheduleDuration: REFRESH_TIME_INTERVAL * 100,
      });
      expect(spy).toHaveBeenCalledTimes(1);
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
      callBack({
        networkConfigurations: {},
        providerConfig: { chainId: '0x2' },
      });
      callBack({
        networkConfigurations: {},
        providerConfig: { chainId: '0x3' },
      });
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
    it('should add current network to chainStatus if not already added', () => {
      buildFetchSpy();
      let callBack: any;
      ppomController = buildPPOMController({
        onNetworkChange: (func: any) => {
          callBack = func;
        },
      });

      const chainIdData1 = ppomController.state.chainStatus['0x1'];
      expect(chainIdData1).toBeDefined();
      callBack({
        networkConfigurations: {},
        providerConfig: { chainId: '0x2' },
      });
      const chainIdData2 = ppomController.state.chainStatus['0x2'];
      expect(chainIdData2).toBeDefined();
    });

    it('should add new network from configs to chainStatus if not already added', () => {
      buildFetchSpy();
      let callBack: any;
      ppomController = buildPPOMController({
        onNetworkChange: (func: any) => {
          callBack = func;
        },
      });

      const chainIdData1 = ppomController.state.chainStatus['0x1'];
      expect(chainIdData1).toBeDefined();
      callBack({
        providerConfig: { chainId: '0x1' },
        networkConfigurations: {
          id1: { chainId: '0x3' },
          id2: { chainId: '0x4' },
        },
      });
      const chainIdData3 = ppomController.state.chainStatus['0x3'];
      expect(chainIdData3).toBeDefined();
      const chainIdData4 = ppomController.state.chainStatus['0x4'];
      expect(chainIdData4).toBeDefined();
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

      callBack({
        networkConfigurations: {},
        providerConfig: { chainId: '0x2' },
      });
      callBack({
        networkConfigurations: {},
        providerConfig: { chainId: '0x1' },
      });
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
      callBack({
        networkConfigurations: {},
        providerConfig: { chainId: '0x2' },
      });

      jest.useFakeTimers().setSystemTime(new Date('2023-01-05'));
      callBack({
        networkConfigurations: {},
        providerConfig: { chainId: '0x5' },
      });

      jest.useFakeTimers().setSystemTime(new Date('2023-01-03'));
      callBack({
        networkConfigurations: {},
        providerConfig: { chainId: '0x3' },
      });

      jest.useFakeTimers().setSystemTime(new Date('2023-01-04'));
      callBack({
        networkConfigurations: {},
        providerConfig: { chainId: '0x4' },
      });

      expect(Object.keys(ppomController.state.chainStatus)).toHaveLength(5);

      jest.useFakeTimers().setSystemTime(new Date('2023-01-06'));
      callBack({
        networkConfigurations: {},
        providerConfig: { chainId: '0x6' },
      });
      expect(Object.keys(ppomController.state.chainStatus)).toHaveLength(5);

      expect(ppomController.state.chainStatus['0x1']).toBeUndefined();
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
      await flushPromises();
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

  describe('jsonRPCRequest', () => {
    it('should propogate to ppom in correct format if JSON RPC request on provider fails', async () => {
      buildFetchSpy();
      ppomController = buildPPOMController({
        provider: {
          sendAsync: (_arg1: any, arg2: any) => {
            arg2('DUMMY_ERROR');
          },
        },
      });
      jest.runOnlyPendingTimers();
      await flushPromises();
      const result = await ppomController.usePPOM(async (ppom: any) => {
        return await ppom.testJsonRPCRequest();
      });
      expect(result.error).toBe('DUMMY_ERROR');
    });

    it('should not call provider if method call on provider is not allowed to PPOM', async () => {
      buildFetchSpy();
      const sendAsyncMock = jest.fn();
      ppomController = buildPPOMController({
        provider: {
          sendAsync: sendAsyncMock,
        },
      });
      jest.runOnlyPendingTimers();
      await flushPromises();
      await ppomController.usePPOM(async (ppom: any) => {
        await ppom.testJsonRPCRequest('DUMMY_METHOD');
      });
      expect(sendAsyncMock).toHaveBeenCalledTimes(0);
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
      await flushPromises();

      await ppomController.usePPOM(async (ppom: any) => {
        await ppom.testJsonRPCRequest();
        await ppom.testJsonRPCRequest();
        await ppom.testJsonRPCRequest();
        await ppom.testJsonRPCRequest();
        await ppom.testJsonRPCRequest();
        await ppom.testJsonRPCRequest();
        const result = await ppom.testJsonRPCRequest();
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
      await flushPromises();

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
  });
});
