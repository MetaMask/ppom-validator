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
const MILLISECONDS_IN_ONE_WEEK = 604800000;

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
 * @type PPOMControllerState
 *
 * Controller state
 * @property chainId - ID of current chain.
 * @property chainIdCache - Array of chainId and time it was last visited.
 * @property versionInfo - Version information fetched from CDN.
 * @property storageMetadata - Metadata of files storaged in storage.
 * @property providerRequestLimit - Number of requests in last 5 minutes that PPOM can make.
 * @property providerRequests - Array of timestamps in last 5 minutes when request was made from PPOM to provider.
 */
export type PPOMControllerState = {
  // chainId of currently selected network
  chainId: string;
  // list of chainIds and time the network was last visited, list of all networks visited in last 1 week is maintained
  chainIdCache: {
    chainId: string;
    lastVisited: number;
    dataFetched: boolean;
  }[];
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
};

const stateMetaData = {
  versionInfo: { persist: false, anonymous: false },
  chainId: { persist: false, anonymous: false },
  chainIdCache: { persist: false, anonymous: false },
  storageMetadata: { persist: false, anonymous: false },
  refreshInterval: { persist: false, anonymous: false },
  fileScheduleInterval: { persist: false, anonymous: false },
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

export type UpdatePPOM = {
  type: `${typeof controllerName}:updatePPOM`;
  handler: () => void;
};

export type PPOMControllerActions = Clear | UsePPOM | UpdatePPOM;

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

  #fileScheduleInterval: any;

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
   * @param options.storageBackend - The storage backend to use for storing PPOM data.
   * @param options.refreshInterval - Interval at which data is refreshed.
   * @param options.fileScheduleInterval - Interval at which fetching data files is scheduled.
   * @returns The PPOMController instance.
   */
  constructor({
    chainId,
    messenger,
    onNetworkChange,
    provider,
    storageBackend,
    refreshInterval,
    fileScheduleInterval,
  }: {
    chainId: string;
    messenger: PPOMControllerMessenger;
    onNetworkChange: (callback: (chainId: string) => void) => void;
    provider: any;
    storageBackend: StorageBackend;
    refreshInterval: number;
    fileScheduleInterval: number;
  }) {
    const initState = {
      versionInfo: [],
      storageMetadata: [],
      chainId,
      chainIdCache: [
        { chainId, lastVisited: new Date().getTime(), dataFetched: false },
      ],
      refreshInterval: refreshInterval || REFRESH_TIME_DURATION,
      fileScheduleInterval:
        fileScheduleInterval || MILLISECONDS_IN_FIVE_MINUTES,
      providerRequestLimit: PROVIDER_REQUEST_LIMIT,
      providerRequests: [],
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

    onNetworkChange((networkControllerState: any) => {
      const id = networkControllerState.providerConfig.chainId;
      let { chainIdCache } = this.state;
      const existingNetworkObject = chainIdCache.find(
        ({ chainId: cid }) => cid === id,
      );
      if (existingNetworkObject) {
        chainIdCache = [
          { chainId: id, lastVisited: new Date().getTime(), dataFetched: true },
          ...chainIdCache.filter(({ chainId: cid }) => cid !== id),
        ];
      } else {
        chainIdCache = [
          {
            chainId: id,
            lastVisited: new Date().getTime(),
            dataFetched: false,
          },
          ...chainIdCache,
        ];
      }
      this.update((draftState) => {
        draftState.chainId = id;
        draftState.chainIdCache = chainIdCache;
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
   * Update the PPOM.
   * This function will acquire mutex lock and invoke internal method #updatePPOM.
   *
   * @param updateForAllChains - True is update if required to be done for all chains in cache.
   */
  async updatePPOM(updateForAllChains = true) {
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
    if (await this.#shouldUpdate()) {
      await this.#updatePPOM(false);
    }
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
    const { chainId, chainIdCache } = this.state;

    if (
      chainIdCache.find(
        ({ chainId: cid, dataFetched }) => cid === chainId && dataFetched,
      )
    ) {
      return false;
    }

    return true;
  }

  /**
   * Update the PPOM configuration.
   * This function will fetch the latest version info when needed, and update the PPOM storage.
   *
   * @param updateForAllChains - True is update if required to be done for all chains in chainIdCache.
   */
  async #updatePPOM(updateForAllChains: boolean) {
    if (this.#ppom) {
      this.#ppom.free();
      this.#ppom = undefined;
    }

    await this.#updateVersionInfo();

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
  async #updateVersionInfo() {
    const versionInfo = await this.#fetchVersionInfo(PPOM_VERSION_PATH);
    if (versionInfo) {
      this.update((draftState) => {
        draftState.versionInfo = versionInfo;
      });
    }
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
   * Gets a single file from CDN and write to the storage.
   *
   * @param fileVersionInfo - Information about the file to be retrieved.
   */
  async #getFile(fileVersionInfo: PPOMFileVersion) {
    const { storageMetadata } = this.state;
    if (this.#checkFilePresentInStorage(storageMetadata, fileVersionInfo)) {
      return;
    }
    const fileUrl = `${PPOM_CDN_BASE_URL}${fileVersionInfo.filePath}`;
    const fileData = await this.#fetchBlob(fileUrl);

    await this.#storage.writeFile({
      data: fileData,
      ...fileVersionInfo,
    });
  }

  /**
   * As files for a chain are fetched this function set dataFetched property in chainIdCache to true.
   *
   * @param chainId - ChainId for which dataFetched is set to true.
   */
  #setChainIdDataFetched(chainId: string) {
    const { chainIdCache } = this.state;
    const chainIdObject = chainIdCache.find(
      ({ chainId: cid }) => chainId === cid,
    );
    if (chainIdObject && !chainIdObject.dataFetched) {
      this.update((draftState) => {
        draftState.chainIdCache = [
          { ...chainIdObject, dataFetched: true },
          ...chainIdCache.filter(({ chainId: cid }) => chainId !== cid),
        ];
      });
    }
  }

  /**
   * Returns an array of new files that should be downloaded and saved to storage.
   * The function is invoked if user if attempting transaction for a network,
   * for which data is not previously fetched.
   *
   * @returns A promise that resolves to an array of new files to download and save to storage.
   */
  async #getNewFilesForCurrentChain(): Promise<void> {
    const { chainId, versionInfo } = this.state;
    for (const fileVersionInfo of versionInfo) {
      //  download all files for the current chain.
      if (fileVersionInfo.chainId !== chainId) {
        continue;
      }

      await this.#getFile(fileVersionInfo);
    }
    this.#setChainIdDataFetched(chainId);
  }

  /**
   * Returns an array of new files that should be downloaded and saved to storage.
   *
   * @returns A promise that resolves to an array of new files to download and save to storage.
   */
  async #getNewFilesForAllChains(): Promise<void> {
    const {
      chainIdCache,
      storageMetadata,
      versionInfo: stateVersionInfo,
    } = this.state;

    // create a map of chainId and files belonging to that chainId
    const chainIdsFileInfoList = chainIdCache.map(
      (chain): { chainId: string; versionInfo: PPOMFileVersion[] } => ({
        chainId: chain.chainId,
        versionInfo: stateVersionInfo.filter(
          (versionInfo) =>
            versionInfo.chainId === chain.chainId &&
            !this.#checkFilePresentInStorage(storageMetadata, versionInfo),
        ),
      }),
    );

    // clear already scheduled fetch if any
    if (this.#fileScheduleInterval) {
      clearInterval(this.#fileScheduleInterval);
    }

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
      const { fileVersionInfo, isLastFileOfNetwork } = fileToBeFetched;
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
      // clear interval if all files are fetched
      if (!fileToBeFetchedList.length) {
        clearInterval(this.#fileScheduleInterval);
      }
    }, scheduleInterval);
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

    const { chainId } = this.state;

    const files = await Promise.all(
      this.state.versionInfo
        .filter((file) => file.chainId === chainId)
        .map(async (file) => {
          const data = await this.#storage.readFile(file.name, file.chainId);
          return [file.name, new Uint8Array(data)];
        }),
    );

    return new PPOMModule.PPOM(this.#jsonRpcRequest.bind(this), files);
  }

  /**
   * Starts the periodic task to refresh data.
   */
  #startDataRefreshTask() {
    if (this.#refreshDataInterval) {
      clearInterval(this.#refreshDataInterval);
    }
    const currentTimestamp = new Date().getTime();
    const chainIdCache = this.state.chainIdCache.filter(
      (cache) =>
        cache.lastVisited > currentTimestamp - MILLISECONDS_IN_ONE_WEEK,
    );
    this.update((draftState) => {
      draftState.chainIdCache = chainIdCache;
    });
    const updatePPOMfn = () => {
      this.updatePPOM().catch(() => {
        // console.error(`Error while trying to update PPOM: ${exp.message}`);
      });
    };
    updatePPOMfn();
    this.#refreshDataInterval = setInterval(
      updatePPOMfn,
      this.state.refreshInterval,
    );
  }
}
