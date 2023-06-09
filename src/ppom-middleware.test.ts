import { buildPPOMController } from '../test/test-utils';
import { createPPOMMiddleware } from './ppom-middleware';

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

    testJsonRPCRequest = () => this.#jsonRpcRequest();
  },
  ppomInit: () => undefined,
}));

describe('createPPOMMiddleware', () => {
  it('should return PPOM Middleware function', () => {
    const ppomController = buildPPOMController();
    const middlewareFunction = createPPOMMiddleware(ppomController);
    expect(middlewareFunction).toBeDefined();
  });

  describe('PPOMMiddleware', () => {
    it('should call ppomController.use when invoked', async () => {
      const useMock = jest.fn();
      const controller = {
        usePPOM: useMock,
      };
      const middlewareFunction = createPPOMMiddleware(controller as any);
      await middlewareFunction(
        { method: 'eth_sendTransaction' },
        undefined,
        () => undefined,
      );
      expect(useMock).toHaveBeenCalledTimes(1);
    });

    it('should call next method when ppomController.use completes', async () => {
      const ppom = {
        validateJsonRpc: () => undefined,
      };
      const controller = {
        usePPOM: async (callback: any) => {
          callback(ppom);
        },
      };
      const middlewareFunction = createPPOMMiddleware(controller as any);
      const nextMock = jest.fn();
      await middlewareFunction(
        { method: 'eth_sendTransaction' },
        undefined,
        nextMock,
      );
      expect(nextMock).toHaveBeenCalledTimes(1);
    });

    it('should call next method when ppomController.use throws error', async () => {
      const controller = {
        usePPOM: async (_callback: any) => {
          throw Error('Some error');
        },
      };
      const middlewareFunction = createPPOMMiddleware(controller as any);
      const nextMock = jest.fn();
      await middlewareFunction(
        { method: 'eth_sendTransaction' },
        undefined,
        nextMock,
      );
      expect(nextMock).toHaveBeenCalledTimes(1);
    });

    it('should call ppom.validateJsonRpc when invoked', async () => {
      const validateMock = jest.fn();
      const ppom = {
        validateJsonRpc: validateMock,
      };
      const controller = {
        usePPOM: async (callback: any) => {
          callback(ppom);
        },
      };
      const middlewareFunction = createPPOMMiddleware(controller as any);
      await middlewareFunction(
        { method: 'eth_sendTransaction' },
        undefined,
        () => undefined,
      );
      expect(validateMock).toHaveBeenCalledTimes(1);
    });
  });
});
