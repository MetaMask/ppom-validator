import * as PPOMModule from '@blockaid/ppom-mock';
import {
  BaseControllerV2,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { safelyExecute } from '@metamask/controller-utils';
import { Mutex } from 'await-semaphore';

import {
  StorageBackend,
  PPOMStorage,
  FileMetadataList,
  FileMetadata,
} from './ppom-storage';

export const REFRESH_TIME_DURATION = 1000 * 60 * 60 * 24;

const PROVIDER_REQUEST_LIMIT = 500;
const MILLISECONDS_IN_FIVE_MINUTES = 300000;

// The following methods on provider are allowed to PPOM
const ALLOWED_PROVIDER_CALLS = [
  'eth_call',
  'eth_blockNumber',
  'eth_getLogs',
  'eth_getFilterLogs',
  'eth_getTransactionByHash',
  'eth_chainId',
  'eth_getBlockByHash',
  'eth_getBlockByNumber',
  'eth_getCode',
  'eth_getStorageAt',
  'eth_getBalance',
  'eth_getTransactionCount',
  'trace_call',
  'trace_callMany',
  'debug_traceCall',
  'trace_filter',
];

/**
 * @type ProviderRequest - Type of JSON RPC request sent to provider.
 * @property id - Request identifier.
 * @property jsonrpc - JSON RPC version.
 * @property method - Method to be invoked on the provider.
 * @property params - Parameters to be passed to method call.
 */
type ProviderRequest = {
  id: number;
  jsonrpc: string;
  method: string;
  params: any[];
};

/**
 * @type PPOMFileVersion
 * @augments FileMetadata
 * @property filePath - Path of the file in CDN.
 */
type PPOMFileVersion = FileMetadata & {
  filePath: string;
};

/**
 * @type PPOMFileVersion
 * @augments FileMetadata
 * @property filePath - Path of the file in CDN.
 */
type PPOMFile = FileMetadata & {
  filePath: string;
  data: ArrayBuffer;
};

/**
 * @type PPOMVersionResponse - array of objects of type PPOMFileVersion
 */
type PPOMVersionResponse = PPOMFileVersion[];

/**
 * @type PPOMControllerState
 *
 * Controller state
 * @property lastChainId - ChainId for which files were last updated.
 * @property newChainId - ChainIf of currently selected network.
 * @property versionInfo - Version information fetched from CDN.
 * @property storageMetadata - Metadata of files storaged in storage.
 * @property providerRequestLimit - Number of requests in last 5 minutes that PPOM can make.
 * @property providerRequests - Array of timestamps in last 5 minutes when request was made from PPOM to provider.
 */
export type PPOMControllerState = {
  lastChainId: string;
  newChainId: string;
  versionInfo: PPOMVersionResponse;
  storageMetadata: FileMetadataList;
  refreshInterval: number;
  providerRequestLimit: number;
  providerRequests: number[];
};

const stateMetaData = {
  lastChainId: { persist: false, anonymous: false },
  newChainId: { persist: false, anonymous: false },
  versionInfo: { persist: false, anonymous: false },
  storageMetadata: { persist: false, anonymous: false },
  refreshInterval: { persist: false, anonymous: false },
  providerRequestLimit: { persist: false, anonymous: false },
  providerRequests: { persist: false, anonymous: false },
};

// TODO: replace with metamask cdn
const PPOM_CDN_BASE_URL = 'https://storage.googleapis.com/ppom-cdn/';
const PPOM_VERSION = 'ppom_version.json';
const PPOM_VERSION_PATH = `${PPOM_CDN_BASE_URL}${PPOM_VERSION}`;

const controllerName = 'PPOMController';

export type Clear = {
  type: `${typeof controllerName}:clear`;
  handler: () => void;
};

export type UsePPOM = {
  type: `${typeof controllerName}:usePPOM`;
  handler: (callback: (ppom: PPOMModule.PPOM) => Promise<any>) => Promise<any>;
};

export type SetRefreshInterval = {
  type: `${typeof controllerName}:setRefreshInterval`;
  handler: (interval: number) => void;
};

export type UpdatePPOM = {
  type: `${typeof controllerName}:updatePPOM`;
  handler: () => void;
};

export type PPOMControllerActions =
  | Clear
  | UsePPOM
  | SetRefreshInterval
  | UpdatePPOM;

export type PPOMControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  PPOMControllerActions,
  never,
  never,
  never
>;

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
export class PPOMController extends BaseControllerV2<
  typeof controllerName,
  PPOMControllerState,
  PPOMControllerMessenger
> {
  #ppom: PPOMModule.PPOM | undefined;

  #provider: any;

  #storage: PPOMStorage;

  #refreshDataInterval: any;

  /*
   * This mutex is used to prevent concurrent usage of the PPOM instance
   * and protect the PPOM instance from being used while it is being initialized/updated
   */
  #ppomMutex: Mutex;

  #initState: PPOMControllerState;

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
  constructor({
    chainId,
    messenger,
    onNetworkChange,
    provider,
    state,
    storageBackend,
  }: {
    chainId: string;
    messenger: PPOMControllerMessenger;
    onNetworkChange: (callback: (chainId: string) => void) => void;
    provider: any;
    state?: PPOMControllerState;
    storageBackend: StorageBackend;
  }) {
    const initState = {
      versionInfo: [],
      storageMetadata: [],
      lastChainId: '',
      newChainId: chainId,
      refreshInterval: REFRESH_TIME_DURATION,
      providerRequestLimit: PROVIDER_REQUEST_LIMIT,
      providerRequests: [],
      ...state,
    };
    super({
      name: controllerName,
      metadata: stateMetaData,
      messenger,
      state: initState,
    });

    this.#initState = initState;

    this.#provider = provider;
    this.#storage = new PPOMStorage({
      storageBackend,
      readMetadata: () => {
        return JSON.parse(JSON.stringify(this.state.storageMetadata));
      },
      writeMetadata: (metadata) => {
        this.update((draftState) => {
          draftState.storageMetadata = metadata;
        });
      },
    });
    this.#ppomMutex = new Mutex();

    onNetworkChange((id: string) => {
      this.update((draftState) => {
        draftState.newChainId = id;
      });
    });

    this.#registerMessageHandlers();
    this.#startDataRefreshTask();
  }

  /**
   * Clear the controller state.
   */
  clear(): void {
    this.update(() => this.#initState);
    this.#startDataRefreshTask();
  }

  /**
   * Set the interval at which the ppom version info will be fetched.
   * Fetching will only occur on the next call to test/bypass.
   * For immediate update to the ppom lists, call updatePPOM directly.
   *
   * @param interval - The new interval in ms.
   */
  setRefreshInterval(interval: number) {
    this.update((draftState) => {
      draftState.refreshInterval = interval;
    });
    this.#startDataRefreshTask(interval);
  }

  /**
   * Clears the periodic job to refresh file data.
   */
  clearRefreshInterval() {
    clearInterval(this.#refreshDataInterval);
  }

  /**
   * Update the PPOM.
   * This function will acquire mutex lock and invoke internal method #updatePPOM.
   */
  async updatePPOM() {
    await this.#ppomMutex.use(async () => {
      await this.#updatePPOM();
    });
  }

  /**
   * Use the PPOM.
   * This function receives a callback that will be called with the PPOM.
   * The callback will be called with the PPOM after it has been initialized.
   *
   * @param callback - Callback to be invoked with PPOM.
   */
  async usePPOM<T>(
    callback: (ppom: PPOMModule.PPOM) => Promise<T>,
  ): Promise<T> {
    return await this.#ppomMutex.use(async () => {
      await this.#maybeUpdatePPOM();

      if (!this.#ppom) {
        this.#ppom = await this.#getPPOM();
      }

      return await callback(this.#ppom);
    });
  }

  /**
   * Constructor helper for registering this controller's messaging system
   * actions.
   */
  #registerMessageHandlers(): void {
    this.messagingSystem.registerActionHandler(
      `${controllerName}:clear` as const,
      this.clear.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:usePPOM` as const,
      this.usePPOM.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:setRefreshInterval` as const,
      this.setRefreshInterval.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:updatePPOM` as const,
      this.updatePPOM.bind(this),
    );
  }

  /**
   * Determine if an update to the ppom configuration is needed.
   * The function will return true if
   * - the chainId has changed
   * - the ppom is out of date
   * - the ppom is not initialized.
   *
   * @returns True if PPOM data requires update.
   */
  async #shouldUpdate(): Promise<boolean> {
    if (this.state.newChainId !== this.state.lastChainId) {
      return true;
    }

    return this.#ppom === undefined;
  }

  /**
   * Update the PPOM configuration.
   * This function will fetch the latest version info when needed, and update the PPOM storage.
   */
  async #updatePPOM() {
    if (this.#ppom) {
      this.#ppom.free();
      this.#ppom = undefined;
    }

    await this.#updateVersionInfo();

    this.update((draftState) => {
      draftState.lastChainId = this.state.newChainId;
    });

    const storageMetadata = await this.#storage.syncMetadata(
      this.state.versionInfo,
    );
    const newFiles = await this.#getNewFiles(
      this.state.newChainId,
      storageMetadata,
    );

    for (const file of newFiles) {
      await this.#storage.writeFile(file);
    }
  }

  /**
   * Returns an array of new files that should be downloaded and saved to storage.
   *
   * @param chainId - The chain ID to check for files.
   * @param storageMetadata - An array of file metadata objects already in storage.
   * @returns A promise that resolves to an array of new files to download and save to storage.
   */
  async #getNewFiles(
    chainId: string,
    storageMetadata: FileMetadataList,
  ): Promise<PPOMFile[]> {
    const newFiles: PPOMFile[] = [];

    for (const fileVersionInfo of this.state.versionInfo) {
      //  download all files for the current chain + generally required files.
      if (fileVersionInfo.chainId && fileVersionInfo.chainId !== chainId) {
        continue;
      }

      // check if file is already in storage
      if (
        storageMetadata.find(
          (file) =>
            file.name === fileVersionInfo.name &&
            file.chainId === fileVersionInfo.chainId &&
            file.version === fileVersionInfo.version &&
            file.checksum === fileVersionInfo.checksum,
        )
      ) {
        continue;
      }

      const fileUrl = `${PPOM_CDN_BASE_URL}${fileVersionInfo.filePath}`;
      const fileData = await this.#fetchBlob(fileUrl);

      newFiles.push({
        data: fileData,
        ...fileVersionInfo,
      });
    }

    return newFiles;
  }

  /*
   * Fetch the version info from the PPOM cdn.
   *  update the version info in state.
   */
  async #updateVersionInfo() {
    const versionInfo = await this.#fetchVersionInfo(PPOM_VERSION_PATH);
    if (versionInfo) {
      this.update((draftState) => {
        draftState.versionInfo = versionInfo;
      });
    }
  }

  /**
   * Conditionally update the ppom configuration.
   *
   * If the ppom configuration is out of date, this function will call `updatePPOM`
   * to update the configuration.
   */
  async #maybeUpdatePPOM() {
    if (await this.#shouldUpdate()) {
      await this.#updatePPOM();
    }
  }

  /*
   * Fetch the blob from the PPOM cdn.
   */
  async #fetchBlob(fileUrl: string): Promise<ArrayBuffer> {
    const response = await safelyExecute(
      async () => fetch(fileUrl, { cache: 'no-cache' }),
      true,
    );

    switch (response?.status) {
      case 200: {
        return await response.arrayBuffer();
      }

      default: {
        throw new Error(`Failed to fetch file with url ${fileUrl}`);
      }
    }
  }

  /*
   * Fetch the version info from the PPOM cdn.
   */
  async #fetchVersionInfo(
    url: string,
  ): Promise<PPOMVersionResponse | undefined> {
    const response = await safelyExecute(
      async () => fetch(url, { cache: 'no-cache' }),
      true,
    );
    switch (response?.status) {
      case 200: {
        return response.json();
      }

      default: {
        throw new Error(`Failed to fetch version info url: ${url}`);
      }
    }
  }

  /*
   * Send a JSON RPC request to the provider.
   * This method is used by the PPOM to make requests to the provider.
   */
  async #jsonRpcRequest(req: ProviderRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      const currentTimestamp = new Date().getTime();
      const requests = this.state.providerRequests.filter(
        (requestTime) =>
          requestTime - currentTimestamp < MILLISECONDS_IN_FIVE_MINUTES,
      );
      if (requests.length >= 5) {
        reject(
          new Error(
            'Number of request to provider from PPOM exceed rate limit',
          ),
        );
        return;
      }
      this.update((draftState) => {
        draftState.providerRequests = [
          ...this.state.providerRequests,
          currentTimestamp,
        ];
      });
      if (!ALLOWED_PROVIDER_CALLS.includes(req.method)) {
        reject(new Error(`Method not allowed on provider ${req.method}`));
        return;
      }
      this.#provider.sendAsync(req, (error: Error, res: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(res);
        }
      });
    });
  }

  /*
   * Initialize the PPOM.
   * This function will be called when the PPOM is first used.
   * or when the PPOM is out of date.
   * It will load the PPOM data from storage and initialize the PPOM.
   */
  async #getPPOM(): Promise<PPOMModule.PPOM> {
    await PPOMModule.default();

    const chainId = this.state.lastChainId;

    const files = await Promise.all(
      this.state.versionInfo
        .filter((file) => !file.chainId || file.chainId === chainId)
        .map(async (file) => {
          const data = await this.#storage.readFile(file.name, file.chainId);
          return [file.name, new Uint8Array(data)];
        }),
    );

    return new PPOMModule.PPOM(this.#jsonRpcRequest.bind(this), files);
  }

  /**
   * Starts the periodic task to refresh data.
   *
   * @param refreshInterval - Time interval at which the refresh will be done.
   */
  #startDataRefreshTask(refreshInterval?: number) {
    if (this.#refreshDataInterval) {
      clearInterval(this.#refreshDataInterval);
    }
    const updatePPOMfn = () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.updatePPOM().catch(() => {
        // do noting;
      });
    };
    updatePPOMfn();
    this.#refreshDataInterval = setInterval(
      updatePPOMfn,
      refreshInterval ?? this.#initState.refreshInterval,
    );
  }
}
