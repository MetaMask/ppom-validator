import { storageBackendReturningData } from '../test/test-utils';
import { PPOMController } from './ppom-controller';
import { createPPOMMiddleware } from './ppom-middleware';

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

describe('createPPOMMiddleware', () => {
  let ppomController: any;
  beforeEach(() => {
    ppomController = new PPOMController({
      storageBackend: storageBackendReturningData,
      provider: { sendAsync: Promise.resolve() },
      chainId: '0x1',
      onNetworkChange: (_callback) => undefined,
    });
  });

  it('should return PPOM Middleware function', () => {
    const middlewareFunction = createPPOMMiddleware(ppomController);
    expect(middlewareFunction).toBeDefined();
  });

  describe('PPOMMiddleware', () => {
    it('should call ppomController.use when invoked', async () => {
      const useSpy = jest.spyOn(ppomController, 'use');
      const middlewareFunction = createPPOMMiddleware(ppomController);
      await middlewareFunction({}, undefined, () => undefined);
      expect(useSpy).toHaveBeenCalledTimes(1);
    });

    it('should call ppom.validateJsonRpc when invoked', async () => {
      const validateMock = jest.fn();
      const ppom = {
        validateJsonRpc: validateMock,
      };
      const controller = {
        use: async (callback: any) => {
          callback(ppom);
        },
      };
      const middlewareFunction = createPPOMMiddleware(controller as any);
      await middlewareFunction({}, undefined, () => undefined);
      expect(validateMock).toHaveBeenCalledTimes(1);
    });
  });
});
