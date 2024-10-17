import * as Utils from './util';
import {
  buildDummyResponse,
  buildFetchSpy,
  buildPPOMController,
  buildStorageBackend,
  PPOMClass,
  StorageMetadata,
  VERSION_INFO,
} from '../test/test-utils';

jest.mock('@metamask/controller-utils', () => {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    ...jest.requireActual('@metamask/controller-utils'),
  };
});

const mockMutexUse = jest.fn();
jest.mock('await-semaphore', () => {
  class Mutex {
    use(callback: any) {
      mockMutexUse();
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

describe('PPOMController', () => {
  const dummyResponse = buildDummyResponse();

  beforeEach(() => {
    jest
      .spyOn(Utils, 'validateSignature')
      .mockImplementation(async () => Promise.resolve());
  });

  afterEach(() => {
    mockMutexUse.mockClear();
  });

  describe('usePPOM', () => {
    it('should provide instance of ppom to the passed ballback', async () => {
      buildFetchSpy();
      const { ppomController } = buildPPOMController();

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

      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow('Error initializing PPOM');
    });

    it('should return the value returned by callback', async () => {
      buildFetchSpy();
      const { ppomController } = buildPPOMController();

      const result = await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve(dummyResponse);
      });
      expect(result).toStrictEqual(dummyResponse);
    });

    it('should initialise PPOM on even different network', async () => {
      buildFetchSpy({
        status: 200,
        json: () => [
          {
            name: 'blob',
            chainId: '0xa',
            version: '1.0.0',
            checksum:
              '409a7f83ac6b31dc8c77e3ec18038f209bd2f545e0f4177c2e2381aa4e067b49',
            signature:
              '0x304402206d433e9172960de6717d94ae263e47eefacd3584a3274a452f8f9567b3a797db02201b2e423188fb3f9daa6ce6a8723f69df26bd3ceeee81f77250526b91e093614f',
            filePath: 'blob',
          },
        ],
      });
      const { ppomController } = buildPPOMController();

      const result = await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve(dummyResponse);
      }, '0xa');
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
      );
      const { ppomController } = buildPPOMController({
        fileFetchScheduleDuration: 0,
      });

      await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(3);
    });

    it('should pass instance of provider to ppom to enable it to send JSON RPC request on it', async () => {
      buildFetchSpy();
      const { ppomController } = buildPPOMController({
        provider: {
          request: async () => {
            return Promise.resolve('DUMMY_VALUE');
          },
        },
      });

      await ppomController.usePPOM(async (ppom: any) => {
        const result = await ppom.testJsonRPCRequest();
        expect(result.result).toBe('DUMMY_VALUE');
      });
    });

    it('should throw error if the user has not enabled blockaid security check', async () => {
      buildFetchSpy();
      const { ppomController } = buildPPOMController({
        securityAlertsEnabled: false,
      });

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
          versionInfo: [],
        },
      });

      await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });
    });

    it('should fail if local storage files are corrupted and CDN also not return file', async () => {
      buildFetchSpy();
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

      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      callBack({ securityAlertsEnabled: false });
      callBack({ securityAlertsEnabled: true });
      buildFetchSpy(undefined, {
        status: 500,
      });

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

    it('should not get files if cached response is obtained for version info file', async () => {
      const spy = buildFetchSpy({
        status: 304,
        json: () => VERSION_INFO,
      });
      const { changeNetwork, mockGetNetworkClientById, ppomController } =
        buildPPOMController();
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(3);

      mockGetNetworkClientById.mockReturnValue({
        configuration: {
          chainId: '0x2',
        },
      });
      changeNetwork({
        selectedNetworkClientId: 'selectedNetworkClientId1',
      });
      mockGetNetworkClientById.mockReturnValue({
        configuration: {
          chainId: Utils.SUPPORTED_NETWORK_CHAINIDS.MAINNET,
        },
      });
      changeNetwork({
        selectedNetworkClientId: 'selectedNetworkClientId2',
      });
      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(4);
    });

    it('should re-initantiate PPOM instance if there are new files', async () => {
      buildFetchSpy();
      const freeMock = jest.fn();
      const { ppomController } = buildPPOMController({
        ppomProvider: {
          ppomInit: async () => {
            return Promise.resolve();
          },
          PPOM: new PPOMClass(undefined, freeMock),
        },
      });
      await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });
      expect(freeMock).toHaveBeenCalledTimes(0);

      buildFetchSpy({
        status: 200,
        json: () => [
          ...VERSION_INFO,
          {
            name: 'data',
            chainId: '0x1',
            version: '1.0.3',
            checksum:
              '409a7f83ac6b31dc8c77e3ec18038f209bd2f545e0f4177c2e2381aa4e067b49',
            filePath: 'data',
          },
        ],
      });
      await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });
      expect(freeMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('onNetworkChange', () => {
    it('should not throw error if reset ppom fails when switching to network not supporting validations', async () => {
      buildFetchSpy();
      const freeMock = jest.fn().mockImplementation(() => {
        throw new Error('some error');
      });
      const { changeNetwork, mockGetNetworkClientById, ppomController } =
        buildPPOMController({
          ppomProvider: {
            ppomInit: async () => {
              return Promise.resolve('123');
            },
            PPOM: new PPOMClass(undefined, freeMock),
          },
        });
      // calling usePPOM initialises PPOM
      await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });

      mockGetNetworkClientById.mockReturnValue({
        configuration: {
          chainId: '0x2',
        },
      });
      expect(async () => {
        changeNetwork({
          selectedNetworkClientId: 'selectedNetworkClientId1',
        });
      }).not.toThrow();
      expect(mockMutexUse).toHaveBeenCalledTimes(2);
    });

    it('should not do anything when networkChange called for same network', async () => {
      buildFetchSpy();
      const { changeNetwork, mockGetNetworkClientById, ppomController } =
        buildPPOMController();
      // calling usePPOM initialises PPOM
      await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });
      mockGetNetworkClientById.mockReturnValue({
        configuration: {
          chainId: Utils.SUPPORTED_NETWORK_CHAINIDS.MAINNET,
        },
      });
      changeNetwork({
        selectedNetworkClientId: 'selectedNetworkClientId1',
      });
      expect(mockMutexUse).toHaveBeenCalledTimes(1);
    });
  });

  describe('onPreferencesChange', () => {
    it('should update securityAlertsEnabled in state', async () => {
      buildFetchSpy();
      let callBack: any;
      const { ppomController } = buildPPOMController({
        onPreferencesChange: (func: any) => {
          callBack = func;
        },
      });
      // calling usePPOM initialises PPOM
      await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });

      callBack({ securityAlertsEnabled: false });
      await expect(async () => {
        await ppomController.usePPOM(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow('User has securityAlertsEnabled set to false');
    });

    it('should not throw error if resetting ppom fails', async () => {
      buildFetchSpy();
      let callBack: any;
      const freeMock = jest.fn().mockImplementation(() => {
        throw new Error('some error');
      });
      const { ppomController } = buildPPOMController({
        onPreferencesChange: (func: any) => {
          callBack = func;
        },
        ppomProvider: {
          ppomInit: async () => {
            return Promise.resolve();
          },
          PPOM: new PPOMClass(undefined, freeMock),
        },
      });

      await ppomController.usePPOM(async () => {
        return Promise.resolve();
      });
      expect(async () => {
        callBack({ securityAlertsEnabled: false });
      }).not.toThrow();
    });

    it('should not do anything when value of securityAlertsEnabled is same', async () => {
      buildFetchSpy();
      let callBack: any;
      const { ppomController } = buildPPOMController({
        onPreferencesChange: (func: any) => {
          callBack = func;
        },
      });
      // calling usePPOM initialises PPOM
      await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });

      expect(mockMutexUse).toHaveBeenCalledTimes(1);
      callBack({ securityAlertsEnabled: false });
      expect(mockMutexUse).toHaveBeenCalledTimes(2);
      callBack({ securityAlertsEnabled: false });
      expect(mockMutexUse).toHaveBeenCalledTimes(2);
    });
  });

  describe('jsonRPCRequest', () => {
    it('should propagate to ppom in correct format if JSON RPC request on provider fails', async () => {
      buildFetchSpy();
      const error = new Error('DUMMY_ERROR');
      const { ppomController } = buildPPOMController({
        provider: {
          request: () => {
            throw error;
          },
        },
      });

      await ppomController.usePPOM(async (ppom: any) => {
        const result = await ppom.testJsonRPCRequest();
        expect(result.error).toBe(error);
      });
    });

    it('should not call provider if method call on provider is not allowed to PPOM', async () => {
      buildFetchSpy();
      const requestMock = jest.fn();
      const { ppomController } = buildPPOMController({
        provider: {
          request: requestMock,
        },
      });

      await ppomController.usePPOM(async (ppom: any) => {
        const result = await ppom.testJsonRPCRequest('DUMMY_METHOD');
        expect(result.error).toStrictEqual({
          code: Utils.PROVIDER_ERRORS.methodNotSupported().error.code,
          message: Utils.PROVIDER_ERRORS.methodNotSupported().error.message,
        });
      });
      expect(requestMock).toHaveBeenCalledTimes(0);
    });

    it('should rate limit number of requests by PPOM on provider', async () => {
      buildFetchSpy();
      const { ppomController } = buildPPOMController({
        provider: {
          request: async () => {
            return Promise.resolve('DUMMY_VALUE');
          },
        },
        providerRequestLimit: 5,
      });

      await ppomController.usePPOM(async (ppom: any) => {
        await ppom.testJsonRPCRequest();
        await ppom.testJsonRPCRequest();
        await ppom.testJsonRPCRequest();
        await ppom.testJsonRPCRequest();
        await ppom.testJsonRPCRequest();
        await ppom.testJsonRPCRequest();
        expect((await ppom.testJsonRPCRequest()).error).toStrictEqual({
          code: Utils.PROVIDER_ERRORS.limitExceeded().error.code,
          message: Utils.PROVIDER_ERRORS.limitExceeded().error.message,
        });
      });
    });

    it('should record number of times each RPC method is called and return it in response', async () => {
      buildFetchSpy();
      const { ppomController } = buildPPOMController({
        provider: {
          request: async () => {
            return Promise.resolve('DUMMY_VALUE');
          },
        },
        providerRequestLimit: 25,
      });

      const result = await ppomController.usePPOM(async (ppom: any) => {
        await ppom.testCallRpcRequests();
        return Promise.resolve(dummyResponse);
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
