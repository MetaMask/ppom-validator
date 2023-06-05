import { BaseControllerV2, RestrictedControllerMessenger } from '@metamask/base-controller';
import { PPOM } from './ppom';
import { StorageBackend, PPOMFileMetadata, FileInfo } from './ppom-storage';
export declare const DAY_IN_MILLISECONDS: number;
/**
 * @type PPOMFileVersion
 * @augments FileInfo
 * @property filePath - Path of the file in CDN.
 */
declare type PPOMFileVersion = FileInfo & {
    filePath: string;
};
/**
 * @type PPOMVersionResponse - array of objects of type PPOMFileVersion
 */
declare type PPOMVersionResponse = PPOMFileVersion[];
/**
 * @type PPOMControllerState
 *
 * Controller state
 * @property lastFetched - Time when files were last updated.
 * @property lastChainId - ChainId for which files were last updated.
 * @property newChainId - ChainIf of currently selected network.
 * @property versionInfo - Version information fetched from CDN.
 * @property storageMetadata - Metadata of files storaged in storage.
 */
export declare type PPOMControllerState = {
    lastFetched: number;
    lastChainId: string;
    newChainId: string;
    versionInfo: PPOMVersionResponse;
    storageMetadata: PPOMFileMetadata;
    refreshInterval: number;
};
declare const controllerName = "PPOMController";
export declare type Clear = {
    type: `${typeof controllerName}:clear`;
    handler: () => void;
};
export declare type UsePPOM = {
    type: `${typeof controllerName}:usePPOM`;
    handler: (callback: (ppom: PPOM) => Promise<any>) => Promise<any>;
};
export declare type SetRefreshInterval = {
    type: `${typeof controllerName}:setRefreshInterval`;
    handler: (interval: number) => void;
};
export declare type UpdatePPOM = {
    type: `${typeof controllerName}:updatePPOM`;
    handler: () => void;
};
export declare type PPOMControllerActions = Clear | UsePPOM | SetRefreshInterval | UpdatePPOM;
export declare type PPOMControllerMessenger = RestrictedControllerMessenger<typeof controllerName, PPOMControllerActions, never, never, never>;
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
export declare class PPOMController extends BaseControllerV2<typeof controllerName, PPOMControllerState, PPOMControllerMessenger> {
    #private;
    /**
     * Creates a PPOMController instance.
     *
     * @param options - Constructor options.
     * @param options.chainId - Id of current chain.
     * @param options.messenger - Controller messenger.
     * @param options.onNetworkChange - Callback tobe invoked when network changes.
     * @param options.provider - The provider used to create the PPOM instance.
     * @param options.state - The controller state.
     * @param options.storageBackend - The storage backend to use for storing PPOM data.
     * @returns The PPOMController instance.
     */
    constructor({ chainId, messenger, onNetworkChange, provider, state, storageBackend, }: {
        chainId: string;
        messenger: PPOMControllerMessenger;
        onNetworkChange: (callback: (chainId: string) => void) => void;
        provider: any;
        state?: PPOMControllerState;
        storageBackend: StorageBackend;
    });
    /**
     * Clear the controller state.
     */
    clear(): void;
    /**
     * Set the interval at which the ppom version info will be fetched.
     * Fetching will only occur on the next call to test/bypass.
     * For immediate update to the ppom lists, call updatePPOM directly.
     *
     * @param interval - The new interval in ms.
     */
    setRefreshInterval(interval: number): void;
    /**
     * Update the PPOM configuration.
     * This function will fetch the latest version info when needed, and update the PPOM storage.
     */
    updatePPOM(): Promise<void>;
    /**
     * Use the PPOM.
     * This function receives a callback that will be called with the PPOM.
     * The callback will be called with the PPOM after it has been initialized.
     *
     * @param callback - Callback to be invoked with PPOM.
     */
    usePPOM<T>(callback: (ppom: PPOM) => Promise<T>): Promise<T>;
}
export {};
