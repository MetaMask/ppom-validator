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

export const REFRESH_TIME_INTERVAL = 1000 * 60 * 60 * 2;

const PROVIDER_REQUEST_LIMIT = 500;
const FILE_FETCH_SCHEDULE_INTERVAL = 1000 * 60 * 5;
export const NETWORK_CACHE_DURATION = 1000 * 60 * 60 * 24 * 7;

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
 * @type PPOMVersionResponse - array of objects of type PPOMFileVersion
 */
type PPOMVersionResponse = PPOMFileVersion[];

/**
 * @type PPOMState
 *
 * Controller state
 * @property chainId - ID of current chain.
 * @property chainStatus - Array of chainId and time it was last visited.
 * @property versionInfo - Version information fetched from CDN.
 * @property storageMetadata - Metadata of files storaged in storage.
 * @property providerRequestLimit - Number of requests in last 5 minutes that PPOM can make.
 * @property providerRequests - Array of timestamps in last 5 minutes when request was made from PPOM to provider.
 */
export type PPOMState = {
  // chainId of currently selected network
  chainId: string;
  // list of chainIds and time the network was last visited, list of all networks visited in last 1 week is maintained
  chainStatus: Record<
    string,
    {
      chainId: string;
      lastVisited: number;
      dataFetched: boolean;
    }
  >;
  // version information obtained from version info file
  versionInfo: PPOMVersionResponse;
  // storage metadat of files already present in the storage
  storageMetadata: FileMetadataList;
  // interval at which data files are refreshed, default will be 2 hours
  refreshInterval: number;
  // interval at which files for a network are fetched
  fileScheduleInterval: number;
  // number of requests PPOM is allowed to make to provider per transaction
  providerRequestLimit: number;
  // number of requests PPOM has already made to the provider in current transaction
  providerRequests: number[];
  // true if user has enabled preference for blockaid secirity check
  securityAlertsEnabled: boolean;
  // ETag obtained using HEAD request on version file
  versionFileETag?: string;
};

const stateMetaData = {
  versionInfo: { persist: false, anonymous: false },
  chainId: { persist: false, anonymous: false },
  chainStatus: { persist: false, anonymous: false },
  storageMetadata: { persist: false, anonymous: false },
  refreshInterval: { persist: false, anonymous: false },
  fileScheduleInterval: { persist: false, anonymous: false },
  providerRequestLimit: { persist: false, anonymous: false },
  providerRequests: { persist: false, anonymous: false },
  securityAlertsEnabled: { persist: false, anonymous: false },
  versionFileETag: { persist: false, anonymous: false },
};

const PPOM_VERSION_FILE_NAME = 'ppom_version.json';
const URL_PREFIX = 'https://';
const controllerName = 'PPOMController';
const versionInfoFileHeaders = {
  headers: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'Content-Type': 'application/json',
  },
};

export type UsePPOM = {
  type: `${typeof controllerName}:usePPOM`;
  handler: (callback: (ppom: any) => Promise<any>) => Promise<any>;
};

export type UpdatePPOM = {
  type: `${typeof controllerName}:updatePPOM`;
  handler: () => void;
};

export type PPOMControllerActions = UsePPOM | UpdatePPOM;

export type PPOMControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  PPOMControllerActions,
  never,
  never,
  never
>;

// eslint-disable-next-line  @typescript-eslint/naming-convention
type PPOMProvider = { ppomInit: () => Promise<void>; PPOM: any };

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
  PPOMState,
  PPOMControllerMessenger
> {
  #ppom: any;

  #provider: any;

  #storage: PPOMStorage;

  #refreshDataInterval: any;

  #fileScheduleInterval: any;

  /*
   * This mutex is used to prevent concurrent usage of the PPOM instance
   * and protect the PPOM instance from being used while it is being initialized/updated
   */
  #ppomMutex: Mutex;

  #ppomProvider: PPOMProvider;

  #cdnBaseUrl: string;

  /**
   * Creates a PPOMController instance.
   *
   * @param options - Constructor options.
   * @param options.chainId - ChainId of the selected network.
   * @param options.messenger - Controller messenger.
   * @param options.onNetworkChange - Callback tobe invoked when network changes.
   * @param options.provider - The provider used to create the PPOM instance.
   * @param options.storageBackend - The storage backend to use for storing PPOM data.
   * @param options.securityAlertsEnabled - True if user has enabled preference for blockaid security check.
   * @param options.onPreferencesChange - Callback invoked when user changes preferences.
   * @param options.ppomProvider - Object wrapping PPOM.
   * @param options.cdnBaseUrl - Base URL for the CDN.
   * @param options.state - Initial state of the controller.
   * @returns The PPOMController instance.
   */
  constructor({
    chainId,
    messenger,
    onNetworkChange,
    provider,
    storageBackend,
    securityAlertsEnabled,
    onPreferencesChange,
    ppomProvider,
    cdnBaseUrl,
    state,
  }: {
    chainId: string;
    onNetworkChange: (callback: (networkState: any) => void) => void;
    messenger: PPOMControllerMessenger;
    provider: any;
    storageBackend: StorageBackend;
    securityAlertsEnabled: boolean;
    onPreferencesChange: (callback: (perferenceState: any) => void) => void;
    ppomProvider: PPOMProvider;
    cdnBaseUrl: string;
    state?: PPOMState;
  }) {
    const initialState = {
      versionInfo: state?.versionInfo ?? [],
      storageMetadata: state?.storageMetadata ?? [],
      chainId,
      chainStatus: state?.chainStatus ?? {
        [chainId]: {
          chainId,
          lastVisited: new Date().getTime(),
          dataFetched: false,
        },
      },
      refreshInterval: state?.refreshInterval ?? REFRESH_TIME_INTERVAL,
      fileScheduleInterval:
        state?.fileScheduleInterval ?? FILE_FETCH_SCHEDULE_INTERVAL,
      providerRequestLimit:
        state?.providerRequestLimit ?? PROVIDER_REQUEST_LIMIT,
      providerRequests: state?.providerRequests ?? [],
      securityAlertsEnabled,
    };
    super({
      name: controllerName,
      metadata: stateMetaData,
      messenger,
      state: initialState,
    });

    this.#provider = provider;
    this.#ppomProvider = ppomProvider;
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
    this.#cdnBaseUrl = cdnBaseUrl;

    onNetworkChange((networkControllerState: any) => {
      const id = networkControllerState.providerConfig.chainId;
      if (id === this.state.chainId) {
        return;
      }
      let chainStatus = { ...this.state.chainStatus };
      // delete ols chainId if total number of chainId is equal 5
      const chainIds = Object.keys(chainStatus);
      if (chainIds.length >= 5) {
        const oldestChainId = chainIds.sort((c1, c2) =>
          (chainStatus[c1]?.lastVisited as any) >
          (chainStatus[c2]?.lastVisited as any)
            ? -1
            : 1,
        )[4];
        if (oldestChainId) {
          delete chainStatus[oldestChainId];
        }
      }
      const existingNetworkObject = chainStatus[id];
      chainStatus = {
        ...chainStatus,
        [id]: {
          chainId: id,
          lastVisited: new Date().getTime(),
          dataFetched: existingNetworkObject?.dataFetched ?? false,
        },
      };
      this.update((draftState) => {
        draftState.chainId = id;
        draftState.chainStatus = chainStatus;
      });
    });

    onPreferencesChange((preferenceControllerState: any) => {
      const blockaidEnabled = preferenceControllerState.securityAlertsEnabled;
      if (blockaidEnabled === this.state.securityAlertsEnabled) {
        return;
      }
      if (blockaidEnabled) {
        this.#scheduleFileDownloadForAllChains();
      } else {
        clearInterval(this.#refreshDataInterval);
        clearInterval(this.#fileScheduleInterval);
      }
      this.update((draftState) => {
        draftState.securityAlertsEnabled = blockaidEnabled;
      });
    });

    this.#registerMessageHandlers();
    if (securityAlertsEnabled) {
      this.#scheduleFileDownloadForAllChains();
    }
  }

  /**
   * Update the PPOM.
   * This function will acquire mutex lock and invoke internal method #updatePPOM.
   *
   * @param options - Options.
   * @param options.updateForAllChains - True is update if required to be done for all chains in cache.
   */
  async updatePPOM({ updateForAllChains } = { updateForAllChains: true }) {
    if (!this.state.securityAlertsEnabled) {
      throw Error('User has not enabled blockaidSecurityCheck');
    }
    await this.#ppomMutex.use(async () => {
      await this.#updatePPOM(updateForAllChains);
    });
  }

  /**
   * Use the PPOM.
   * This function receives a callback that will be called with the PPOM.
   * The callback will be called with the PPOM after it has been initialized.
   *
   * @param callback - Callback to be invoked with PPOM.
   */
  async usePPOM<T>(callback: (ppom: any) => Promise<T>): Promise<T> {
    if (!this.state.securityAlertsEnabled) {
      throw Error('User has not enabled blockaidSecurityCheck');
    }
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
      `${controllerName}:usePPOM` as const,
      this.usePPOM.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:updatePPOM` as const,
      this.updatePPOM.bind(this),
    );
  }

  /**
   * Conditionally update the ppom configuration.
   *
   * If the ppom configuration is out of date, this function will call `updatePPOM`
   * to update the configuration.
   */
  async #maybeUpdatePPOM() {
    if (this.#ppom) {
      this.#ppom.free();
      this.#ppom = undefined;
    }
    if (await this.#shouldUpdate()) {
      await this.#updatePPOM(false);
    }
  }

  /**
   * Determine if an update to the ppom configuration is needed.
   * The function will return true if data is not already fetched for the chain.
   *
   * @returns True if PPOM data requires update.
   */
  async #shouldUpdate(): Promise<boolean> {
    const { chainId, chainStatus } = this.state;
    return !chainStatus[chainId]?.dataFetched;
  }

  /**
   * Update the PPOM configuration.
   * This function will fetch the latest version info when needed, and update the PPOM storage.
   *
   * @param updateForAllChains - True if update is required to be done for all chains in chainStatus.
   */
  async #updatePPOM(updateForAllChains: boolean) {
    const versionInfoUpdated = await this.#updateVersionInfo(
      updateForAllChains,
    );
    if (!versionInfoUpdated) {
      return;
    }

    await this.#storage.syncMetadata(this.state.versionInfo);
    if (updateForAllChains) {
      await this.#getNewFilesForAllChains();
    } else {
      await this.#getNewFilesForCurrentChain();
    }
  }

  /*
   * Fetch the version info from the CDN and update the version info in state.
   */
  async #updateVersionInfo(updateForAllChains: boolean): Promise<boolean> {
    const versionInfo = await this.#fetchVersionInfo(updateForAllChains);
    if (versionInfo) {
      this.update((draftState) => {
        draftState.versionInfo = versionInfo;
      });
      return true;
    }
    return false;
  }

  /**
   * The function checks if file is already present in the storage.
   *
   * @param storageMetadata - Latest storageMetadata synced with storage.
   * @param fileVersionInfo - Information about file.
   * @returns True if file is present in storage.
   */
  #checkFilePresentInStorage(
    storageMetadata: FileMetadataList,
    fileVersionInfo: PPOMFileVersion,
  ) {
    return storageMetadata.find(
      (file) =>
        file.name === fileVersionInfo.name &&
        file.chainId === fileVersionInfo.chainId &&
        file.version === fileVersionInfo.version &&
        file.checksum === fileVersionInfo.checksum,
    );
  }

  /**
   * The function check to ensure that file path can contain only alphanumeric characters and a dot character (.) or slash (/).
   *
   * @param filePath - Path of the file.
   */
  #checkFilePath(filePath: string) {
    const filePathRegex = /^[\w./]+$/u;
    if (!filePathRegex.test(filePath)) {
      throw new Error(`Invalid file path for data file: ${filePath}`);
    }
  }

  /**
   * Gets a single file from CDN and write to the storage.
   *
   * @param fileVersionInfo - Information about the file to be retrieved.
   */
  async #getFile(fileVersionInfo: PPOMFileVersion) {
    const { storageMetadata } = this.state;
    if (this.#checkFilePresentInStorage(storageMetadata, fileVersionInfo)) {
      return;
    }
    this.#checkFilePath(fileVersionInfo.filePath);
    const fileUrl = `${URL_PREFIX}${this.#cdnBaseUrl}/${
      fileVersionInfo.filePath
    }`;
    const fileData = await this.#fetchBlob(fileUrl);

    await this.#storage.writeFile({
      data: fileData,
      ...fileVersionInfo,
    });
  }

  /**
   * As files for a chain are fetched this function set dataFetched property in chainStatus to true.
   *
   * @param chainId - ChainId for which dataFetched is set to true.
   */
  #setChainIdDataFetched(chainId: string) {
    const { chainStatus } = this.state;
    const chainIdObject = chainStatus[chainId];
    if (chainIdObject && !chainIdObject.dataFetched) {
      this.update((draftState) => {
        draftState.chainStatus = {
          ...chainStatus,
          [chainId]: { ...chainIdObject, dataFetched: true },
        };
      });
    }
  }

  /**
   * Fetches new files and save them to storage.
   * The function is invoked if user if attempting transaction for a network,
   * for which data is not previously fetched.
   *
   * @returns A promise that resolves to return void.
   */
  async #getNewFilesForCurrentChain(): Promise<void> {
    const { chainId, versionInfo } = this.state;
    for (const fileVersionInfo of versionInfo) {
      //  download all files for the current chain.
      if (fileVersionInfo.chainId !== chainId) {
        continue;
      }

      await this.#getFile(fileVersionInfo).catch((exp: Error) => {
        console.error(
          `Error in getting file ${fileVersionInfo.filePath}: ${exp.message}`,
        );
        throw exp;
      });
    }
    this.#setChainIdDataFetched(chainId);
  }

  /**
   * Function creates list of all files to be fetched for all chainIds in chainStatus.
   *
   * @returns List of files to be fetched.
   */
  #getListOfFilesToBeFetched(): {
    fileVersionInfo: PPOMFileVersion;
    isLastFileOfNetwork: boolean;
  }[] {
    const {
      chainStatus,
      storageMetadata,
      versionInfo: stateVersionInfo,
    } = this.state;

    // create a map of chainId and files belonging to that chainId
    const chainIdsFileInfoList = Object.keys(chainStatus).map(
      (chainId): { chainId: string; versionInfo: PPOMFileVersion[] } => ({
        chainId,
        versionInfo: stateVersionInfo.filter(
          (versionInfo) =>
            versionInfo.chainId === chainId &&
            !this.#checkFilePresentInStorage(storageMetadata, versionInfo),
        ),
      }),
    );

    // build a list of files to be fetched for all networks
    const fileToBeFetchedList: {
      fileVersionInfo: PPOMFileVersion;
      isLastFileOfNetwork: boolean;
    }[] = [];
    chainIdsFileInfoList.forEach((chainIdFileInfo) => {
      const { chainId, versionInfo } = chainIdFileInfo;
      versionInfo.forEach((fileVersionInfo, index) => {
        fileToBeFetchedList.push({
          fileVersionInfo,
          isLastFileOfNetwork: index === versionInfo.length - 1,
        });
      });
      if (versionInfo.length === 0) {
        // set dataFetched to true for chainId
        this.#setChainIdDataFetched(chainId);
      }
    });

    return fileToBeFetchedList;
  }

  /**
   * Delete from chainStatus chainIds of networks visited more than one week ago.
   */
  #deleteOldChainIds() {
    // We keep minimum of 2 chainIds in the state
    if (Object.keys(this.state.chainStatus)?.length <= 2) {
      return;
    }
    const currentTimestamp = new Date().getTime();

    const oldChaninIds = Object.keys(this.state.chainStatus).filter(
      (chainId) =>
        (this.state.chainStatus[chainId] as any).lastVisited <
          currentTimestamp - NETWORK_CACHE_DURATION &&
        chainId !== this.state.chainId,
    );
    const chainStatus = { ...this.state.chainStatus };
    oldChaninIds.forEach((chainId) => {
      delete chainStatus[chainId];
    });
    this.update((draftState) => {
      draftState.chainStatus = chainStatus;
    });
  }

  /**
   * Function that fetched and saves to storage files for all networks.
   * Files are not fetched parallely but at an interval.
   *
   * @returns A promise that resolves to return void.
   */
  async #getNewFilesForAllChains(): Promise<void> {
    this.#deleteOldChainIds();
    // clear already scheduled fetch if any
    if (this.#fileScheduleInterval) {
      clearInterval(this.#fileScheduleInterval);
    }

    // build a list of files to be fetched for all networks
    const fileToBeFetchedList = this.#getListOfFilesToBeFetched();

    // if schedule interval is large so that not all files can be fetched in
    // refreshInterval, reduce schedule interval
    let scheduleInterval = this.state.fileScheduleInterval;
    if (
      this.state.refreshInterval / (fileToBeFetchedList.length + 1) <
      scheduleInterval
    ) {
      scheduleInterval =
        this.state.refreshInterval / (fileToBeFetchedList.length + 1);
    }

    // schedule files to be fetched in intervals
    this.#fileScheduleInterval = setInterval(() => {
      const fileToBeFetched = fileToBeFetchedList.pop();
      if (!fileToBeFetched) {
        return;
      }

      const { chainStatus } = this.state;
      const { fileVersionInfo, isLastFileOfNetwork } = fileToBeFetched;
      if (chainStatus[fileVersionInfo.chainId]) {
        // get the file from CDN
        this.#getFile(fileVersionInfo)
          .then(() => {
            if (isLastFileOfNetwork) {
              // set dataFetched for chainId to true
              this.#setChainIdDataFetched(fileVersionInfo.chainId);
            }
          })
          .catch((exp: Error) =>
            console.error(
              `Error in getting file ${fileVersionInfo.filePath}: ${exp.message}`,
            ),
          );
      }
      // clear interval if all files are fetched
      if (!fileToBeFetchedList.length) {
        clearInterval(this.#fileScheduleInterval);
      }
    }, scheduleInterval);
  }

  /*
   * getAPIResponse - Generic method to fetch file from CDN.
   */
  async #getAPIResponse(
    url: string,
    options: Record<string, unknown> = {},
    method = 'GET',
  ): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response = await safelyExecute(
      async () =>
        fetch(url, {
          method,
          cache: 'no-cache',
          redirect: 'error',
          signal: controller.signal,
          ...options,
        }),
      true,
    );
    clearTimeout(timeoutId);
    if (response?.status !== 200) {
      throw new Error(`Failed to fetch file with url: ${url}`);
    }
    return response;
  }

  /*
   * Fetch the version info from the PPOM cdn.
   */
  async #fetchVersionInfo(
    updateForAllChains: boolean,
  ): Promise<PPOMVersionResponse | undefined> {
    const url = `${URL_PREFIX}${this.#cdnBaseUrl}/${PPOM_VERSION_FILE_NAME}`;
    if (updateForAllChains) {
      const headResponse = await this.#getAPIResponse(
        url,
        {
          headers: versionInfoFileHeaders,
        },
        'HEAD',
      );

      const { versionFileETag } = this.state;
      if (headResponse.headers.get('ETag') === versionFileETag) {
        return undefined;
      }

      this.update((draftState) => {
        draftState.versionFileETag = headResponse.headers.get('ETag');
      });
    }
    const response = await this.#getAPIResponse(url, {
      headers: versionInfoFileHeaders,
    });
    return response.json();
  }

  /*
   * Fetch the blob from the PPOM cdn.
   */
  async #fetchBlob(url: string): Promise<ArrayBuffer> {
    const response = await this.#getAPIResponse(url);
    return await response.arrayBuffer();
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
          requestTime - currentTimestamp < FILE_FETCH_SCHEDULE_INTERVAL,
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
  async #getPPOM(): Promise<any> {
    const { chainId } = this.state;

    const files = await Promise.all(
      this.state.versionInfo
        .filter((file) => file.chainId === chainId)
        .map(async (file) => {
          const data = await this.#storage.readFile(file.name, file.chainId);
          return [file.name, new Uint8Array(data)];
        }),
    );

    if (!files.length) {
      throw new Error(
        `Aborting validation as no files are found for the network with chainId: ${chainId}`,
      );
    }

    const { ppomInit, PPOM } = this.#ppomProvider;
    await ppomInit();
    return new PPOM(this.#jsonRpcRequest.bind(this), files);
  }

  /**
   * Functioned scheduled to be called to update PPOM.
   */
  #onFileScheduledInterval() {
    this.updatePPOM().catch(() => {
      // console.error(`Error while trying to update PPOM: ${exp.message}`);
    });
  }

  /**
   * Starts the scheduled periodic task to refresh data.
   */
  #scheduleFileDownloadForAllChains() {
    this.#onFileScheduledInterval();
    this.#refreshDataInterval = setInterval(
      this.#onFileScheduledInterval.bind(this),
      this.state.refreshInterval,
    );
  }
}
