import type { JsonRpcParams } from '@metamask/utils';
import type { NativeCrypto } from './ppom-controller';
export declare const SUPPORTED_NETWORK_CHAINIDS: {
    MAINNET: string;
    BSC: string;
    OPTIMISM: string;
    POLYGON: string;
    AVALANCHE: string;
    ARBITRUM: string;
    LINEA_MAINNET: string;
    BASE: string;
    SEPOLIA: string;
    OPBNB: string;
    ZKSYNC: string;
    SCROLL: string;
    BERACHAIN: string;
    METACHAIN_ONE: string;
};
export declare const blockaidValidationSupportedForNetwork: (chainId: string) => boolean;
export declare const IdGenerator: () => number;
export declare const createPayload: (method: string, params: JsonRpcParams) => {
    readonly id: number;
    readonly jsonrpc: "2.0";
    readonly method: string;
    readonly params: JsonRpcParams;
};
export declare const PROVIDER_ERRORS: {
    limitExceeded: () => {
        code: number;
        message: string;
    };
    methodNotSupported: () => {
        code: number;
        message: string;
    };
};
export declare const validateSignature: (data: ArrayBuffer, hashSignature: string, key: string, filePath: string, nativeCrypto?: NativeCrypto, useNative?: boolean) => Promise<void>;
export declare const constructURLHref: (base: string, path: string) => string;
export declare const addHexPrefix: (str: string) => string;
export declare const checkFilePath: (filePath: string) => void;
