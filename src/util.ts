import type { JsonRpcParams } from '@metamask/utils';
import CryptoJS, { SHA256 } from 'crypto-js';
import elliptic from 'elliptic';
import IdIterator from 'json-rpc-random-id';

import type { NativeCrypto } from './ppom-controller';

const EdDSA = elliptic.eddsa;
const URL_PREFIX = 'https://';

export const SUPPORTED_NETWORK_CHAINIDS = {
  MAINNET: '0x1',
  BSC: '0x38',
  OPTIMISM: '0xa',
  POLYGON: '0x89',
  AVALANCHE: '0xa86a',
  ARBITRUM: '0xa4b1',
  LINEA_MAINNET: '0xe708',
  BASE: '0x2105',
  SEPOLIA: '0xaa36a7',
  OPBNB: '0xcc',
  ZKSYNC: '0x144',
  SCROLL: '0x82750',
  BERACHAIN: '0x138d4',
  METACHAIN_ONE: '0x1b6e6',
};

export const blockaidValidationSupportedForNetwork = (
  chainId: string,
): boolean => {
  return Object.values(SUPPORTED_NETWORK_CHAINIDS).some(
    (cid) => cid === chainId,
  );
};

export const IdGenerator = IdIterator();

export const createPayload = (method: string, params: JsonRpcParams) =>
  ({
    id: IdGenerator(),
    jsonrpc: '2.0',
    method,
    params: params ?? [],
  } as const);

export const PROVIDER_ERRORS = {
  limitExceeded: () =>
    ({
      jsonrpc: '2.0',
      id: IdGenerator(),
      error: {
        code: -32005,
        message: 'Limit exceeded',
      },
    } as const),
  methodNotSupported: () =>
    ({
      jsonrpc: '2.0',
      id: IdGenerator(),
      error: {
        code: -32601,
        message: 'Method not supported',
      },
    } as const),
};

const getHash = async (
  data: ArrayBuffer,
  nativeCrypto?: NativeCrypto,
  useNative = true,
): Promise<string> => {
  if (nativeCrypto) {
    return nativeCrypto.createHash('sha256').update(data).digest('hex');
  }

  if (
    'crypto' in globalThis &&
    typeof globalThis.crypto === 'object' &&
    globalThis.crypto.subtle?.digest &&
    useNative
  ) {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray
      .map((item) => item.toString(16).padStart(2, '0'))
      .join('');
    return hash;
  }

  return SHA256(CryptoJS.lib.WordArray.create(data as any)).toString();
};

// useNative argument is added for testing purpose, without it test cases are breaking in Node-20 and above
// Reason being that in node 20 crypto is always present in globalThis
// and it is not possible to reset it due to security reasons
export const validateSignature = async (
  data: ArrayBuffer,
  hashSignature: string,
  key: string,
  filePath: string,
  nativeCrypto?: NativeCrypto,
  useNative?: boolean,
) => {
  const hashString = await getHash(data, nativeCrypto, useNative);
  // const hashString = hash.toString();
  const ec = new EdDSA('ed25519');
  const ecKey = ec.keyFromPublic(key);
  // eslint-disable-next-line no-restricted-globals
  const result = ecKey.verify(Buffer.from(hashString), hashSignature);
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

  return `0x${parseInt(str, 10).toString(16)}`;
};

/*
 * The function check to ensure that file path can contain only alphanumeric
 * characters and a dot character (.) or slash (/).
 */
export const checkFilePath = (filePath: string): void => {
  const filePathRegex = /^[\w./]+$/u;
  if (!filePath.match(filePathRegex)) {
    throw new Error(`Invalid file path for data file: ${filePath}`);
  }
};
