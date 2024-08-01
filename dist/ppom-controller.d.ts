import type { ControllerGetStateAction, ControllerStateChangeEvent, RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { NetworkControllerGetNetworkClientByIdAction, NetworkControllerNetworkDidChangeEvent, Provider } from '@metamask/network-controller';
import type { Json } from '@metamask/utils';
import type { StorageBackend, FileMetadataList, FileMetadata } from './ppom-storage';
export declare const NETWORK_CACHE_DURATION: number;
declare type SecurityAlertResponse = {
    reason: string;
    features?: string[];
    result_type: string;
    providerRequestsCount?: Record<string, number>;
    securityAlertId?: string;
};
declare type PPOM = {
    new: (...args: unknown[]) => PPOM;
    validateJsonRpc: (request: Record<string, unknown>) => Promise<SecurityAlertResponse>;
    free: () => void;
} & Record<string, unknown>;
/**
 * @type PPOMFileVersion
 * @augments FileMetadata
 * @property filePath - Path of the file in CDN.
 */
declare type PPOMFileVersion = FileMetadata & {
    filePath: string;
    hashSignature: string;
};
/**
 * @type PPOMVersionResponse - array of objects of type PPOMFileVersion
 */
declare type PPOMVersionResponse = PPOMFileVersion[];
export declare type NativeCrypto = {
    createHash: (str: string) => {
        update: (ab: ArrayBuffer) => {
            digest: (str: string) => string;
        };
    };
};
/**
 * @type PPOMState
 *
 * Controller state
 * @property chainId - ID of current chain.
 * @property versionInfo - Version information fetched from CDN.
 * @property storageMetadata - Metadata of files storaged in storage.
 */
export declare type PPOMState = {
    versionInfo: PPOMVersionResponse;
    storageMetadata: FileMetadataList;
};
declare const controllerName = "PPOMController";
export declare type UsePPOM = {
    type: `${typeof controllerName}:usePPOM`;
    handler: (callback: (ppom: PPOM) => Promise<unknown>) => Promise<unknown>;
};
export declare type PPOMControllerGetStateAction = ControllerGetStateAction<typeof controllerName, PPOMState>;
export declare type PPOMControllerActions = PPOMControllerGetStateAction | UsePPOM;
export declare type PPOMControllerStateChangeEvent = ControllerStateChangeEvent<typeof controllerName, PPOMState>;
export declare type PPOMControllerEvents = PPOMControllerStateChangeEvent;
export declare type AllowedEvents = NetworkControllerNetworkDidChangeEvent;
export declare type AllowedActions = NetworkControllerGetNetworkClientByIdAction;
export declare type PPOMControllerMessenger = RestrictedControllerMessenger<typeof controllerName, PPOMControllerActions | AllowedActions, PPOMControllerEvents | AllowedEvents, AllowedActions['type'], AllowedEvents['type']>;
declare type PPOMProvider = {
    ppomInit: (wasmFilePath: string) => Promise<void>;
    PPOM: PPOM;
};
/**
 * PPOMController
 * Controller responsible for managing the PPOM
 *
 * @property config - The controller configuration
 * @property state - The controller state
 * @property storage - The controller storage
 * @property ppom - The PPOM instance
 * @property provider - The provider used to create the PPOM instance
 */
export declare class PPOMController extends BaseController<typeof controllerName, PPOMState, PPOMControllerMessenger> {
    #private;
    /**
     * Creates a PPOMController instance.
     *
     * @param options - Constructor options.
     * @param options.chainId - ChainId of the selected network.
     * @param options.messenger - Controller messenger.
     * @param options.provider - The provider used to create the PPOM instance.
     * @param options.storageBackend - The storage backend to use for storing PPOM data.
     * @param options.securityAlertsEnabled - True if user has enabled preference for blockaid security check.
     * @param options.onPreferencesChange - Callback invoked when user changes preferences.
     * @param options.ppomProvider - Object wrapping PPOM.
     * @param options.cdnBaseUrl - Base URL for the CDN.
     * @param options.providerRequestLimit - Limit of number of requests that can be sent to provider per transaction.
     * @param options.dataUpdateDuration - Duration after which data is fetched again.
     * @param options.fileFetchScheduleDuration - Duration after which next data file is fetched.
     * @param options.state - Initial state of the controller.
     * @param options.blockaidPublicKey - Public key of blockaid for verifying signatures of data files.
     * @param options.nativeCrypto - Native implementation of crypto hashing function.
     * This is useful to leverage faster native crypto implementation on devices.
     * @returns The PPOMController instance.
     */
    constructor({ chainId, messenger, provider, storageBackend, securityAlertsEnabled, onPreferencesChange, ppomProvider, cdnBaseUrl, providerRequestLimit, state, blockaidPublicKey, nativeCrypto, }: {
        chainId: string;
        messenger: PPOMControllerMessenger;
        provider: Provider;
        storageBackend: StorageBackend;
        securityAlertsEnabled: boolean;
        onPreferencesChange: (callback: (preferencesState: {
            securityAlertsEnabled: boolean;
        } & Record<string, Json>) => void) => void;
        ppomProvider: PPOMProvider;
        cdnBaseUrl: string;
        providerRequestLimit?: number;
        dataUpdateDuration?: number;
        fileFetchScheduleDuration?: number;
        state?: PPOMState;
        blockaidPublicKey: string;
        nativeCrypto?: NativeCrypto;
    });
    /**
     * Use the PPOM.
     * This function receives a callback that will be called with the PPOM.
     *
     * @param callback - Callback to be invoked with PPOM.
     */
    usePPOM<Type>(callback: (ppom: PPOM) => Promise<Type>): Promise<Type & {
        providerRequestsCount: Record<string, number>;
    }>;
}
export {};
