import {
  PPOMClass,
  StorageMetadata,
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
      buildPPOMController();

      expect(spy).toHaveBeenCalledTimes(1);
      jest.runAllTicks();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(5);

      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(6);
      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL - 1);

      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(6);

      jest.advanceTimersByTime(1);

      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(7);
    });
  });

  describe('usePPOM', () => {
    it('should provide instance of ppom to the passed ballback', async () => {
      buildFetchSpy();
      const { ppomController } = buildPPOMController();
      jest.runOnlyPendingTimers();
      await flushPromises();

      await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });
    });

    it('should throw error if there is an error in initialising PPOM', async () => {
      buildFetchSpy();
      const { ppomController } = buildPPOMController({
        ppomProvider: {
          ppomInit: async () => {
            throw Error('Error initializing PPOM');
          },
          PPOM: new PPOMClass(),
        },
      });
      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
      await flushPromises();

      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow('Error initializing PPOM');
    });

    it('should return the value returned by callback', async () => {
      buildFetchSpy();
      const { ppomController } = buildPPOMController();
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
      const { ppomController } = buildPPOMController({
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
      const { ppomController } = buildPPOMController({
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
      const { ppomController } = buildPPOMController({
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
      const { ppomController } = buildPPOMController({
        chainId: '0x2',
      });
      jest.runOnlyPendingTimers();
      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow(
        'Blockaid validation not available on network with chainId: 0x2',
      );
    });

    it('should throw error if no files are present for the network', async () => {
      buildFetchSpy({
        status: 200,
        json: () => [],
      });
      const { ppomController } = buildPPOMController();
      jest.runOnlyPendingTimers();
      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow(
        'Aborting initialising PPOM as no files are found for the network with chainId: 0x1',
      );
    });

    it('should throw error if file version info is not present for the network', async () => {
      buildFetchSpy({
        status: 200,
        json: () => undefined,
      });
      const { ppomController } = buildPPOMController();
      jest.runOnlyPendingTimers();
      await flushPromises();
      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow(
        'Aborting initialising PPOM as no files are found for the network with chainId: 0x1',
      );
    });

    it('should throw error if fetch for blob return 500', async () => {
      buildFetchSpy(undefined, {
        status: 500,
      });
      const { ppomController } = buildPPOMController();
      jest.runOnlyPendingTimers();
      await flushPromises();
      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow(
        'Aborting initialising PPOM as not all files could not be downloaded for the network with chainId: 0x1',
      );
    });

    it('should throw error if file path containe weird characters', async () => {
      buildFetchSpy({
        status: 200,
        json: () => [
          {
            name: 'blob',
            chainId: Utils.SUPPORTED_NETWORK_CHAINIDS.MAINNET,
            version: '1.0.0',
            checksum:
              '409a7f83ac6b31dc8c77e3ec18038f209bd2f545e0f4177c2e2381aa4e067b49',
            filePath: 'test~123$.2*()',
          },
        ],
      });
      const { ppomController } = buildPPOMController();
      jest.runOnlyPendingTimers();
      await flushPromises();
      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow(
        'Aborting initialising PPOM as not all files could not be downloaded for the network with chainId: 0x1',
      );
    });

    it('should not fail even if local storage files are corrupted', async () => {
      buildFetchSpy();
      const { ppomController } = buildPPOMController({
        storageBackend: buildStorageBackend({
          read: async (): Promise<any> => {
            throw new Error('not found');
          },
        }),
        state: {
          storageMetadata: StorageMetadata,
        },
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
      const { ppomController } = buildPPOMController({
        storageBackend: buildStorageBackend({
          read: async (): Promise<any> => {
            throw new Error('not found');
          },
        }),
        onPreferencesChange: (func: any) => {
          callBack = func;
        },
        chainId: Utils.SUPPORTED_NETWORK_CHAINIDS.MAINNET,
      });
      jest.runOnlyPendingTimers();
      await flushPromises();
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      callBack({ securityAlertsEnabled: false });
      callBack({ securityAlertsEnabled: true });
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
        'Aborting initialising PPOM as not all files could not be downloaded for the network with chainId: 0x1',
      );
    });

    it('should initantiate PPOM instance if not already done', async () => {
      buildFetchSpy();
      const { ppomController } = buildPPOMController({
        chainId: '0x1',
        state: {
          versionInfo: VERSION_INFO,
        },
      });

      await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });
    });
  });

  describe('updatePPOM', () => {
    it('should throw error if preference securityAlertsEnabled is not enabled', async () => {
      const { ppomController } = buildPPOMController({
        securityAlertsEnabled: false,
      });
      jest.runOnlyPendingTimers();
      await expect(async () => {
        await ppomController.updatePPOM();
      }).rejects.toThrow('User has securityAlertsEnabled set to false');
    });

    it('should throw error if fetch for version info return 500', async () => {
      buildFetchSpy({
        status: 500,
      });
      const { ppomController } = buildPPOMController();
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
      const { ppomController } = buildPPOMController();
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
      const { ppomController } = buildPPOMController();
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(5);
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
      const { changeNetwork, ppomController } = buildPPOMController();
      jest.runOnlyPendingTimers();
      changeNetwork('0x2');
      expect(Object.keys(ppomController.state.chainStatus)).toHaveLength(1);
      await ppomController.updatePPOM();
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(5);
    });

    it('should not re-throw error if file write fails', async () => {
      const spy = buildFetchSpy(undefined, undefined, 123);
      const storageBackend = buildStorageBackend({
        write: async (_key: any, _data: any): Promise<void> =>
          Promise.reject(new Error('some error')),
      });
      const { ppomController } = buildPPOMController({
        storageBackend,
      });
      jest.runOnlyPendingTimers();
      expect(Object.keys(ppomController.state.chainStatus)).toHaveLength(1);
      await ppomController.updatePPOM();
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(10);
    });

    it('should decrease scheduleInterval if its set very high', async () => {
      // here fileScheduleInterval is set very high but advance it by just REFRESH_TIME_INTERVAL
      // is helping fetch new files as value of fileScheduleInterval is adjusted to be able to fetch all data files
      const spy = buildFetchSpy(undefined, undefined);
      buildPPOMController({
        fileFetchScheduleDuration: REFRESH_TIME_INTERVAL * 100,
      });
      expect(spy).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(6);
      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(8);
    });

    it('should delete network more than a week old from chainStatus', async () => {
      buildFetchSpy();
      const { changeNetwork, ppomController } = buildPPOMController({
        chainId: Utils.SUPPORTED_NETWORK_CHAINIDS.BSC,
      });
      jest.runOnlyPendingTimers();
      await flushPromises();
      const chainIdData1 =
        ppomController.state.chainStatus[Utils.SUPPORTED_NETWORK_CHAINIDS.BSC];
      expect(chainIdData1).toBeDefined();
      changeNetwork(Utils.SUPPORTED_NETWORK_CHAINIDS.OPTIMISM);
      changeNetwork(Utils.SUPPORTED_NETWORK_CHAINIDS.POLYGON);
      jest.advanceTimersByTime(NETWORK_CACHE_DURATION * 2);
      changeNetwork(Utils.SUPPORTED_NETWORK_CHAINIDS.ARBITRUM);
      const chainIdData2 =
        ppomController.state.chainStatus[Utils.SUPPORTED_NETWORK_CHAINIDS.BSC];
      expect(chainIdData2).toBeUndefined();
    });

    it('should not get files if ETag of version info file is not changed', async () => {
      const spy = buildFetchSpy(undefined, undefined, 1);
      buildPPOMController();

      jest.runAllTicks();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(5);

      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(6);

      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(7);
    });
  });

  describe('onNetworkChange', () => {
    it('should add network to chainStatus if not already added', () => {
      buildFetchSpy();
      const { changeNetwork, ppomController } = buildPPOMController();
      changeNetwork(Utils.SUPPORTED_NETWORK_CHAINIDS.MAINNET);
      const chainIdData1 =
        ppomController.state.chainStatus[
          Utils.SUPPORTED_NETWORK_CHAINIDS.MAINNET
        ];
      expect(chainIdData1).toBeDefined();
      changeNetwork(Utils.SUPPORTED_NETWORK_CHAINIDS.BSC);
      const chainIdData2 =
        ppomController.state.chainStatus[Utils.SUPPORTED_NETWORK_CHAINIDS.BSC];
      expect(chainIdData2).toBeDefined();
    });

    it('should trigger file download if preference is enabled', async () => {
      const spy = buildFetchSpy();
      const { changeNetwork } = buildPPOMController();
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(6);
      changeNetwork(Utils.SUPPORTED_NETWORK_CHAINIDS.BSC);
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(8);
    });

    it('should not trigger file download if preference is not enabled', async () => {
      const spy = buildFetchSpy();
      const { changeNetwork } = buildPPOMController({
        securityAlertsEnabled: false,
      });
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(0);
      changeNetwork('0x2');
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(0);
    });

    it('should update lastVisited time in chainStatus if network is already added', async () => {
      buildFetchSpy();
      const { changeNetwork, ppomController } = buildPPOMController();

      jest.setSystemTime(new Date('2023-01-01'));
      const lastVisitedBefore =
        ppomController?.state?.chainStatus?.[
          Utils.SUPPORTED_NETWORK_CHAINIDS.MAINNET
        ]?.lastVisited;

      jest.useFakeTimers().setSystemTime(new Date('2023-01-02'));

      changeNetwork(Utils.SUPPORTED_NETWORK_CHAINIDS.BSC);
      changeNetwork(Utils.SUPPORTED_NETWORK_CHAINIDS.MAINNET);
      const lastVisitedAfter =
        ppomController?.state?.chainStatus?.[
          Utils.SUPPORTED_NETWORK_CHAINIDS.MAINNET
        ]?.lastVisited;
      expect(lastVisitedBefore !== lastVisitedAfter).toBe(true);
    });

    it('should delete old network if more than 5 networks are added', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2023-01-01'));
      buildFetchSpy();
      const { changeNetwork, ppomController } = buildPPOMController({
        chainId: Utils.SUPPORTED_NETWORK_CHAINIDS.BSC,
      });

      expect(Object.keys(ppomController.state.chainStatus)).toHaveLength(1);

      jest.useFakeTimers().setSystemTime(new Date('2023-01-02'));
      changeNetwork(Utils.SUPPORTED_NETWORK_CHAINIDS.OPTIMISM);

      jest.useFakeTimers().setSystemTime(new Date('2023-01-05'));
      changeNetwork(Utils.SUPPORTED_NETWORK_CHAINIDS.POLYGON);

      jest.useFakeTimers().setSystemTime(new Date('2023-01-03'));
      changeNetwork(Utils.SUPPORTED_NETWORK_CHAINIDS.AVALANCHE);

      jest.useFakeTimers().setSystemTime(new Date('2023-01-04'));
      changeNetwork(Utils.SUPPORTED_NETWORK_CHAINIDS.ARBITRUM);

      expect(Object.keys(ppomController.state.chainStatus)).toHaveLength(5);

      jest.useFakeTimers().setSystemTime(new Date('2023-01-06'));
      changeNetwork(Utils.SUPPORTED_NETWORK_CHAINIDS.LINEA_MAINNET);
      expect(Object.keys(ppomController.state.chainStatus)).toHaveLength(5);

      expect(
        ppomController.state.chainStatus[
          Utils.SUPPORTED_NETWORK_CHAINIDS.MAINNET
        ],
      ).toBeUndefined();
    });

    it('should not throw error if update ppom fails', async () => {
      buildFetchSpy();
      const { changeNetwork } = buildPPOMController({ chainId: '0x2' });
      changeNetwork(Utils.SUPPORTED_NETWORK_CHAINIDS.MAINNET);
      await flushPromises();
      expect(async () => {
        buildFetchSpy({
          status: 500,
          json: () => {
            throw new Error('some error');
          },
        });
        jest.runOnlyPendingTimers();
        await flushPromises();
      }).not.toThrow();
    });

    it('should not throw error if reset ppom fails when switching to network not supporting validations', async () => {
      buildFetchSpy(undefined, undefined, 123);
      const freeMock = jest.fn().mockImplementation(() => {
        throw new Error('some error');
      });
      const { changeNetwork } = buildPPOMController({
        ppomProvider: {
          ppomInit: async () => {
            return Promise.resolve('123');
          },
          PPOM: new PPOMClass(undefined, freeMock),
        },
      });
      jest.runOnlyPendingTimers();
      await flushPromises();
      buildFetchSpy({
        status: 500,
      });
      expect(async () => {
        changeNetwork('0x2');
      }).not.toThrow();
    });
  });

  describe('onPreferencesChange', () => {
    it('should start file fetching if securityAlertsEnabled is set to true', async () => {
      const spy = buildFetchSpy();
      let callBack: any;
      buildPPOMController({
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
      buildPPOMController({
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
      const { ppomController } = buildPPOMController({
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
      buildPPOMController({
        onPreferencesChange: (func: any) => {
          callBack = func;
        },
      });
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(5);
      callBack({ securityAlertsEnabled: false });
      jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(spy).toHaveBeenCalledTimes(5);
    });

    it('should not throw error if initialisation fails', async () => {
      buildFetchSpy(undefined, undefined, 123);
      let callBack: any;
      buildPPOMController({
        onPreferencesChange: (func: any) => {
          callBack = func;
        },
      });
      jest.runOnlyPendingTimers();
      await flushPromises();
      buildFetchSpy({
        status: 500,
      });
      expect(async () => {
        callBack({ securityAlertsEnabled: false });
        callBack({ securityAlertsEnabled: true });
        jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
        jest.runOnlyPendingTimers();
        await flushPromises();
      }).not.toThrow();
    });

    it('should not throw error if resetting ppom fails', async () => {
      buildFetchSpy(undefined, undefined, 123);
      let callBack: any;
      const freeMock = jest.fn().mockImplementation(() => {
        throw new Error('some error');
      });
      buildPPOMController({
        onPreferencesChange: (func: any) => {
          callBack = func;
        },
        ppomProvider: {
          ppomInit: async () => {
            return Promise.resolve('123');
          },
          PPOM: new PPOMClass(undefined, freeMock),
        },
      });
      jest.runOnlyPendingTimers();
      await flushPromises();
      buildFetchSpy({
        status: 500,
      });
      expect(async () => {
        callBack({ securityAlertsEnabled: false });
      }).not.toThrow();
    });
  });

  describe('jsonRPCRequest', () => {
    it('should propogate to ppom in correct format if JSON RPC request on provider fails', async () => {
      buildFetchSpy();
      const { ppomController } = buildPPOMController({
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
      const { ppomController } = buildPPOMController({
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
      const { ppomController } = buildPPOMController({
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
      const { ppomController } = buildPPOMController({
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

  describe('initialisePPOM', () => {
    it('should publish initialisationStateChange events to the messenger', async () => {
      buildFetchSpy();
      let callBack: any;
      const ppomInitialisationCallbackMock = jest.fn();
      const { controllerMessenger } = buildPPOMController({
        ppomProvider: {
          ppomInit: async () => {
            return Promise.resolve('123');
          },
          PPOM: new PPOMClass(),
        },
        securityAlertsEnabled: true,
        onPreferencesChange: (func: any) => {
          callBack = func;
        },
      });
      controllerMessenger.subscribe(
        'PPOMController:initialisationStateChangeEvent',
        ppomInitialisationCallbackMock,
      );
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(ppomInitialisationCallbackMock).toHaveBeenCalledTimes(2);
      callBack({ securityAlertsEnabled: false });
      callBack({ securityAlertsEnabled: true });
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(ppomInitialisationCallbackMock).toHaveBeenCalledTimes(4);
    });
  });
});
