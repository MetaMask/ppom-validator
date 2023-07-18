import IdIterator from 'json-rpc-random-id';

export const IdGenerator = IdIterator();

export const createPayload = (
  method: string,
  params: Record<string, unknown>,
) => ({
  id: IdGenerator(),
  jsonrpc: '2.0',
  method,
  params: params || [],
});

export const PROVIDER_ERRORS = {
  limitExceeded: () => ({
    jsonrpc: '2.0',
    id: IdGenerator(),
    error: {
      code: -32005,
      message: 'Limit exceeded',
    },
  }),
  methodNotSupported: () => ({
    jsonrpc: '2.0',
    id: IdGenerator(),
    error: {
      code: -32004,
      message: 'Method not supported',
    },
  }),
};
