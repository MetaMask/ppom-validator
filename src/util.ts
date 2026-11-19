import { verify } from '@metamask/cryptography/ed25519';
import { sha256 } from '@metamask/cryptography/sha';
import type { JsonRpcParams } from '@metamask/utils';
import { bytesToHex, hexToBytes, remove0x } from '@metamask/utils';
import IdIterator from 'json-rpc-random-id';

import type { NativeCrypto } from './ppom-controller';

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
): Promise<string> => {
  if (nativeCrypto) {
    return nativeCrypto.createHash('sha256').update(data).digest('hex');
  }

  return remove0x(bytesToHex(await sha256(data)));
};

export const validateSignature = async (
  data: ArrayBuffer,
  hashSignature: string,
  key: string,
  filePath: string,
  nativeCrypto?: NativeCrypto,
) => {
  const hashString = await getHash(data, nativeCrypto);
  // The signature is over the hex string of the hash, not the raw digest.
  const result = await verify(
    new Uint8Array(hexToBytes(key)),
    new Uint8Array(hexToBytes(hashSignature)),
    new TextEncoder().encode(hashString),
  );
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
