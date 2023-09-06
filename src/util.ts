import elliptic from 'elliptic';
import IdIterator from 'json-rpc-random-id';

const EdDSA = elliptic.eddsa;
const URL_PREFIX = 'https://';

export const IdGenerator = IdIterator();

export const createPayload = (
  method: string,
  params: Record<string, unknown>,
) => ({
  id: IdGenerator(),
  jsonrpc: '2.0',
  method,
  params: params || {},
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
      code: -32601,
      message: 'Method not supported',
    },
  }),
};

export const validateSignature = async (
  data: any,
  signature: string,
  key: string,
  filePath: string,
) => {
  const ec = new EdDSA('ed25519');
  const ecKey = ec.keyFromPublic(key);
  // eslint-disable-next-line no-restricted-globals
  const result = ecKey.verify(Buffer.from(data), signature);
  if (!result) {
    throw Error(`Signature verification failed for file path: ${filePath}`);
  }
};

export const constructURLHref = (base: string, path: string): string =>
  new URL(
    `${URL_PREFIX}${base}/${path}`
      .replace(/https:\/\/https:\/\//gu, 'https://')
      .replace(/\/\//gu, '/'),
  ).href;

export const addHexPrefix = (str: string) => {
  if (typeof str !== 'string' || str.match(/^-?0x/u)) {
    return str;
  }

  if (str.match(/^-?0X/u)) {
    return str.replace('0X', '0x');
  }

  return `0x${str}`;
};
