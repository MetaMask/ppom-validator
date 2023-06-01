import {
  VERSION_INFO,
  buildFetchDataSpy,
  storageBackendReturningData,
} from '../test/test-utils';
import { PPOM } from './ppom';
import { PPOMController } from './ppom-controller';

Object.defineProperty(globalThis, 'fetch', {
  writable: true,
  value: () => undefined,
});

jest.mock('./ppom.js', () => ({
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

describe('PPOMController', () => {
  describe('use', () => {
    let ppomController: any;
    beforeEach(() => {
      ppomController = new PPOMController({
        storageBackend: storageBackendReturningData,
        provider: { sendAsync: Promise.resolve() },
        chainId: '0x1',
        onNetworkChange: (_callback) => undefined,
      });
    });

    it('should be able to invoke use', async () => {
      buildFetchDataSpy();

      await ppomController.use(async (ppom: PPOM) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });
    });

    it('should not fetch file if chainId is different from current chainId', async () => {
      const spy = buildFetchDataSpy({
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

      await ppomController.use(async () => {
        return Promise.resolve();
      });

      expect(spy).toHaveBeenCalledTimes(3);
    });

    it('should throw error', async () => {
      buildFetchDataSpy({
        status: 500,
      });

      await expect(async () => {
        await ppomController.use(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow('Failed to fetch version info');
    });

    it('should throw error if fetch for blob return 500', async () => {
      buildFetchDataSpy(undefined, {
        status: 500,
      });

      await expect(async () => {
        await ppomController.use(async () => {
          return Promise.resolve();
        });
      }).rejects.toThrow('Failed to fetch file data');
    });

    it('should refresh data if refreshInterval is passed', async () => {
      const spy = buildFetchDataSpy();

      await ppomController.use(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(3);
      await ppomController.use(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(3);

      ppomController.setRefreshInterval(0);
      await ppomController.use(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(4);
    });

    it('should refresh data if network is changed', async () => {
      let callBack: any;
      ppomController = new PPOMController({
        storageBackend: storageBackendReturningData,
        provider: { sendAsync: Promise.resolve() },
        chainId: '0x1',
        onNetworkChange: (func: any) => {
          callBack = func;
        },
      });
      const spy = buildFetchDataSpy({
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

      await ppomController.use(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(3);
      await ppomController.use(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(3);

      callBack('0x2');
      await ppomController.use(async () => {
        return Promise.resolve();
      });
      expect(spy).toHaveBeenCalledTimes(4);
    });
  });

  describe('PPOM', () => {
    it('should be able to send JSON RPC request to provider', async () => {
      const sendAsync = (_arg1: any, arg2: any) => {
        arg2(undefined, 'DUMMY_VALUE');
      };
      const ppomController = new PPOMController({
        storageBackend: storageBackendReturningData,
        provider: { sendAsync },
        chainId: '0x1',
        onNetworkChange: (_callback) => undefined,
      });

      buildFetchDataSpy();

      await ppomController.use(async (ppom: PPOM) => {
        expect(ppom).toBeDefined();
        const result = await (ppom as any).testJsonRPCRequest({});
        expect(result).toBe('DUMMY_VALUE');
      });
    });
  });
});
