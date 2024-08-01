"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkFilePath = exports.addHexPrefix = exports.constructURLHref = exports.validateSignature = exports.PROVIDER_ERRORS = exports.createPayload = exports.IdGenerator = exports.blockaidValidationSupportedForNetwork = exports.SUPPORTED_NETWORK_CHAINIDS = void 0;
const crypto_js_1 = __importStar(require("crypto-js"));
const elliptic_1 = __importDefault(require("elliptic"));
const json_rpc_random_id_1 = __importDefault(require("json-rpc-random-id"));
const EdDSA = elliptic_1.default.eddsa;
const URL_PREFIX = 'https://';
exports.SUPPORTED_NETWORK_CHAINIDS = {
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
    BERACHAIN: '0x138d5',
    METACHAIN_ONE: '0x1b6e6',
};
const blockaidValidationSupportedForNetwork = (chainId) => {
    return Object.values(exports.SUPPORTED_NETWORK_CHAINIDS).some((cid) => cid === chainId);
};
exports.blockaidValidationSupportedForNetwork = blockaidValidationSupportedForNetwork;
exports.IdGenerator = (0, json_rpc_random_id_1.default)();
const createPayload = (method, params) => ({
    id: (0, exports.IdGenerator)(),
    jsonrpc: '2.0',
    method,
    params: params ?? [],
});
exports.createPayload = createPayload;
exports.PROVIDER_ERRORS = {
    limitExceeded: () => ({ code: -32005, message: 'Limit exceeded' }),
    methodNotSupported: () => ({
        code: -32601,
        message: 'Method not supported',
    }),
};
const getHash = async (data, nativeCrypto, useNative = true) => {
    if (nativeCrypto) {
        return nativeCrypto.createHash('sha256').update(data).digest('hex');
    }
    if ('crypto' in globalThis &&
        typeof globalThis.crypto === 'object' &&
        globalThis.crypto.subtle?.digest &&
        useNative) {
        const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hash = hashArray
            .map((item) => item.toString(16).padStart(2, '0'))
            .join('');
        return hash;
    }
    return (0, crypto_js_1.SHA256)(crypto_js_1.default.lib.WordArray.create(data)).toString();
};
// useNative argument is added for testing purpose, without it test cases are breaking in Node-20 and above
// Reason being that in node 20 crypto is always present in globalThis
// and it is not possible to reset it due to security reasons
const validateSignature = async (data, hashSignature, key, filePath, nativeCrypto, useNative) => {
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
exports.validateSignature = validateSignature;
const constructURLHref = (base, path) => new URL(`${URL_PREFIX}${base}/${path}`
    .replace(/https:\/\/https:\/\//gu, 'https://')
    .replace(/\/\//gu, '/')).href;
exports.constructURLHref = constructURLHref;
const addHexPrefix = (str) => {
    if (typeof str !== 'string' || str.match(/^-?0x/u)) {
        return str;
    }
    if (str.match(/^-?0X/u)) {
        return str.replace('0X', '0x');
    }
    return `0x${parseInt(str, 10).toString(16)}`;
};
exports.addHexPrefix = addHexPrefix;
/*
 * The function check to ensure that file path can contain only alphanumeric
 * characters and a dot character (.) or slash (/).
 */
const checkFilePath = (filePath) => {
    const filePathRegex = /^[\w./]+$/u;
    if (!filePath.match(filePathRegex)) {
        throw new Error(`Invalid file path for data file: ${filePath}`);
    }
};
exports.checkFilePath = checkFilePath;
//# sourceMappingURL=util.js.map