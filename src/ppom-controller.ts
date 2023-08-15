import {
  BaseControllerV2,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { safelyExecute, timeoutFetch } from '@metamask/controller-utils';
import { Mutex } from 'await-semaphore';

import {
  StorageBackend,
  PPOMStorage,
  FileMetadataList,
  FileMetadata,
} from './ppom-storage';
import {
  PROVIDER_ERRORS,
  constructURLHref,
  createPayload,
  validateSignature,
} from './util';

export const REFRESH_TIME_INTERVAL = 1000 * 60 * 60 * 2;

const PROVIDER_REQUEST_LIMIT = 300;
const FILE_FETCH_SCHEDULE_INTERVAL = 1000 * 60 * 5;
export const NETWORK_CACHE_DURATION = 1000 * 60 * 60 * 24 * 7;

const NETWORK_CACHE_LIMIT = {
  MAX: 5,
  MIN: 2,
};

// The following methods on provider are allowed to PPOM
const ALLOWED_PROVIDER_CALLS = [
  'eth_call',
  'eth_blockNumber',
  'eth_createAccessList',
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
 * @type PPOMFileVersion
 * @augments FileMetadata
 * @property filePath - Path of the file in CDN.
 */
type PPOMFileVersion = FileMetadata & {
  filePath: string;
  signature: string;
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
 */
export type PPOMState = {
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
  // ETag obtained using HEAD request on version file
  versionFileETag?: string;
};

const stateMetaData = {
  versionInfo: { persist: false, anonymous: false },
  chainStatus: { persist: false, anonymous: false },
  storageMetadata: { persist: false, anonymous: false },
  versionFileETag: { persist: false, anonymous: false },
};

const PPOM_VERSION_FILE_NAME = 'ppom_version.json';
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
type PPOMProvider = {
  ppomInit: (wasmFilePath: string) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  PPOM: any;
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

  // base URL of the CDN
  #cdnBaseUrl: string;

  // Limit of number of requests ppom can send to the provider per transaction
  #providerRequestLimit: number;

  // Number of requests sent to provider by ppom for current transaction
  #providerRequests = 0;

  // id of current chain selected
  #chainId: string;

  // interval at which data files are refreshed, default will be 2 hours
  #dataUpdateDuration: number;

  // interval at which files for a network are fetched
  #fileFetchScheduleDuration: number;

  // true if user has enabled preference for blockaid security check
  #securityAlertsEnabled: boolean;

  #blockaidPublicKey: string;

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
   * @param options.providerRequestLimit - Limit of number of requests that can be sent to provider per transaction.
   * @param options.dataUpdateDuration - Duration after which data is fetched again.
   * @param options.fileFetchScheduleDuration - Duration after which next data file is fetched.
   * @param options.state - Initial state of the controller.
   * @param options.blockaidPublicKey - Public key of blcokaid for verifying signatures of data files.
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
    providerRequestLimit,
    dataUpdateDuration,
    fileFetchScheduleDuration,
    state,
    blockaidPublicKey,
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
    providerRequestLimit?: number;
    dataUpdateDuration?: number;
    fileFetchScheduleDuration?: number;
    state?: PPOMState;
    blockaidPublicKey: string;
  }) {
    const initialState = {
      versionInfo: state?.versionInfo ?? [],
      storageMetadata: state?.storageMetadata ?? [],
      chainStatus: state?.chainStatus ?? {
        [chainId]: {
          chainId,
          lastVisited: new Date().getTime(),
          dataFetched: false,
        },
      },
    };
    super({
      name: controllerName,
      metadata: stateMetaData,
      messenger,
      state: initialState,
    });

    this.#chainId = chainId;
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
    this.#providerRequestLimit = providerRequestLimit ?? PROVIDER_REQUEST_LIMIT;
    this.#dataUpdateDuration = dataUpdateDuration ?? REFRESH_TIME_INTERVAL;
    this.#fileFetchScheduleDuration =
      fileFetchScheduleDuration ?? FILE_FETCH_SCHEDULE_INTERVAL;
    this.#securityAlertsEnabled = securityAlertsEnabled;
    this.#blockaidPublicKey = blockaidPublicKey;

    // add new network to chainStatus list
    onNetworkChange(this.#onNetworkChange.bind(this));

    // enable / disable PPOM validations as user changes preferences
    onPreferencesChange(this.#onPreferenceChange.bind(this));

    // register message handlers
    this.#registerMessageHandlers();

    // start scheduled task to fetch data files
    if (this.#securityAlertsEnabled) {
      this.#scheduleFileDownloadForAllChains();
    }
  }

  /**
   * Update the PPOM.
   * This function will acquire mutex lock and invoke internal method #updatePPOM.
   */
  async updatePPOM(): Promise<void> {
    if (!this.#securityAlertsEnabled) {
      throw Error('User has securityAlertsEnabled set to false');
    }
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
  async usePPOM<T>(callback: (ppom: any) => Promise<T>): Promise<T> {
    if (!this.#securityAlertsEnabled) {
      throw Error('User has securityAlertsEnabled set to false');
    }
    return await this.#ppomMutex.use(async () => {
      this.#resetPPOM();
      await this.#maybeUpdatePPOM();
      this.#ppom = await this.#getPPOM();

      this.#providerRequests = 0;
      return await callback(this.#ppom);
    });
  }

  /*
   * The function adds new network to chainStatus list.
   */
  #onNetworkChange(networkControllerState: any): void {
    const id = networkControllerState.providerConfig.chainId;
    if (id === this.#chainId) {
      return;
    }
    let chainStatus = { ...this.state.chainStatus };
    // delete ols chainId if total number of chainId is equal 5
    const chainIds = Object.keys(chainStatus);
    if (chainIds.length >= NETWORK_CACHE_LIMIT.MAX) {
      const oldestChainId = chainIds.sort(
        (c1, c2) =>
          Number(chainStatus[c2]?.lastVisited) -
          Number(chainStatus[c1]?.lastVisited),
      )[NETWORK_CACHE_LIMIT.MAX - 1];
      if (oldestChainId) {
        delete chainStatus[oldestChainId];
      }
    }
    const existingNetworkObject = chainStatus[id];
    this.#chainId = id;
    chainStatus = {
      ...chainStatus,
      [id]: {
        lastVisited: new Date().getTime(),
        dataFetched: existingNetworkObject?.dataFetched ?? false,
      },
    };
    this.update((draftState) => {
      draftState.chainStatus = chainStatus;
    });
  }

  /*
   * enable / disable PPOM validations as user changes preferences
   */
  #onPreferenceChange(preferenceControllerState: any): void {
    const blockaidEnabled = preferenceControllerState.securityAlertsEnabled;
    if (blockaidEnabled === this.#securityAlertsEnabled) {
      return;
    }
    if (blockaidEnabled) {
      this.#scheduleFileDownloadForAllChains();
    } else {
      clearInterval(this.#refreshDataInterval);
      clearInterval(this.#fileScheduleInterval);
    }
    this.#securityAlertsEnabled = blockaidEnabled;
  }

  /*
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

  /*
   * The function resets PPOM.
   */
  #resetPPOM(): void {
    if (this.#ppom) {
      this.#ppom.free();
      this.#ppom = undefined;
    }
  }

  /**
   * Conditionally update the ppom configuration.
   *
   * If the ppom configuration is out of date, this function will call `updatePPOM`
   * to update the configuration.
   */
  async #maybeUpdatePPOM(): Promise<void> {
    if (this.#isDataRequiredForCurrentChain()) {
      await this.#getNewFilesForCurrentChain();
    }
  }

  /*
   * The function will return true if data is not already fetched for current chain.
   */
  #isDataRequiredForCurrentChain(): boolean {
    const { chainStatus } = this.state;
    return !chainStatus[this.#chainId]?.dataFetched;
  }

  /*
   * Update the PPOM configuration for all chainId.
   */
  async #updatePPOM(): Promise<void> {
    const versionInfoUpdated = await this.#updateVersionInfo();
    if (versionInfoUpdated) {
      await this.#storage.syncMetadata(this.state.versionInfo);
      await this.#getNewFilesForAllChains();
    }
  }

  /*
   * Fetch the version info from the CDN and update the version info in state.
   * Function returns true if update is available for versionInfo.
   */
  async #updateVersionInfo(): Promise<boolean> {
    const versionInfo = await this.#fetchVersionInfo();
    if (versionInfo) {
      this.update((draftState) => {
        draftState.versionInfo = versionInfo;
      });
      return true;
    }
    return false;
  }

  /*
   * The function checks if file is already present in the storage.
   */
  #checkFilePresentInStorage(
    storageMetadata: FileMetadataList,
    fileVersionInfo: PPOMFileVersion,
  ): FileMetadata | undefined {
    return storageMetadata.find(
      (file) =>
        file.name === fileVersionInfo.name &&
        file.chainId === fileVersionInfo.chainId &&
        file.version === fileVersionInfo.version &&
        file.checksum === fileVersionInfo.checksum,
    );
  }

  /*
   * The function check to ensure that file path can contain only alphanumeric
   * characters and a dot character (.) or slash (/).
   */
  #checkFilePath(filePath: string): void {
    const filePathRegex = /^[\w./]+$/u;
    if (!filePath.match(filePathRegex)) {
      throw new Error(`Invalid file path for data file: ${filePath}`);
    }
  }

  /*
   * Gets a single file from CDN and write to the storage.
   */
  async #getFile(fileVersionInfo: PPOMFileVersion): Promise<void> {
    const { storageMetadata } = this.state;
    // do not fetch file if the storage version is latest
    if (this.#checkFilePresentInStorage(storageMetadata, fileVersionInfo)) {
      return;
    }
    // validate file path for valid characters
    this.#checkFilePath(fileVersionInfo.filePath);
    const fileUrl = constructURLHref(
      this.#cdnBaseUrl,
      fileVersionInfo.filePath,
    );
    const fileData = await this.#fetchBlob(fileUrl);

    await validateSignature(
      fileData,
      fileVersionInfo.signature,
      this.#blockaidPublicKey,
      fileVersionInfo.filePath,
    );

    await this.#storage.writeFile({
      data: fileData,
      ...fileVersionInfo,
    });
  }

  /*
   * As files for a chain are fetched this function set dataFetched
   * property for that chainId in chainStatus to true.
   */
  #setChainIdDataFetched(chainId: string): void {
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

  /*
   * Fetches new files for current network and save them to storage.
   * The function is invoked if user if attempting transaction for current network,
   * for which data is not previously fetched.
   */
  async #getNewFilesForCurrentChain(): Promise<void> {
    const { versionInfo } = this.state;
    for (const fileVersionInfo of versionInfo) {
      if (fileVersionInfo.chainId !== this.#chainId) {
        continue;
      }

      await this.#getFile(fileVersionInfo).catch((exp: Error) => {
        console.error(
          `Error in getting file ${fileVersionInfo.filePath}: ${exp.message}`,
        );
        throw exp;
      });
    }
    this.#setChainIdDataFetched(this.#chainId);
  }

  /*
   * Function creates list of all files to be fetched for all chainIds in chainStatus.
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
    // not include the files for which the version in storage is the latest one
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

  /*
   * Delete from chainStatus chainIds of networks visited more than one week ago.
   * Do not delete current ChainId.
   */
  #deleteOldChainIds(): void {
    // We keep minimum of 2 chainIds in the state
    if (
      Object.keys(this.state.chainStatus)?.length <= NETWORK_CACHE_LIMIT.MIN
    ) {
      return;
    }
    const currentTimestamp = new Date().getTime();

    const oldChaninIds = Object.keys(this.state.chainStatus).filter(
      (chainId) =>
        (this.state.chainStatus[chainId] as any).lastVisited <
          currentTimestamp - NETWORK_CACHE_DURATION &&
        chainId !== this.#chainId,
    );
    const chainStatus = { ...this.state.chainStatus };
    oldChaninIds.forEach((chainId) => {
      delete chainStatus[chainId];
    });
    this.update((draftState) => {
      draftState.chainStatus = chainStatus;
    });
  }

  /*
   * Function that fetches and saves to storage files for all networks.
   * Files are not fetched parallely but at regular intervals to
   * avoid sending a lot of parallel requests to CDN.
   */
  async #getNewFilesForAllChains(): Promise<void> {
    // delete chains more than a week old
    this.#deleteOldChainIds();

    // clear existing scheduled task to fetch files if any
    if (this.#fileScheduleInterval) {
      clearInterval(this.#fileScheduleInterval);
    }

    // build a list of files to be fetched for all networks
    const fileToBeFetchedList = this.#getListOfFilesToBeFetched();

    // Get scheduled interval, if schedule interval is large so that not all files can be fetched in
    // this.#dataUpdateDuration, reduce schedule interval
    let scheduleInterval = this.#fileFetchScheduleDuration;
    if (
      this.#dataUpdateDuration / (fileToBeFetchedList.length + 1) <
      this.#fileFetchScheduleDuration
    ) {
      scheduleInterval =
        this.#dataUpdateDuration / (fileToBeFetchedList.length + 1);
    }

    // schedule files to be fetched in regular intervals
    this.#fileScheduleInterval = setInterval(() => {
      const fileToBeFetched = fileToBeFetchedList.pop();
      if (!fileToBeFetched) {
        return;
      }

      const { chainStatus } = this.state;
      const { fileVersionInfo, isLastFileOfNetwork } = fileToBeFetched;
      // check here if chain is present in chainStatus, it may be removed from chainStatus
      // if more than 5 networks are added to it.
      if (chainStatus[fileVersionInfo.chainId]) {
        // get the file from CDN
        this.#getFile(fileVersionInfo)
          .then(() => {
            if (isLastFileOfNetwork) {
              // if this was last file for the chainId set dataFetched for chainId to true
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
   * Generic method to fetch file from CDN.
   */
  async #getAPIResponse(
    url: string,
    options: Record<string, unknown> = {},
    method = 'GET',
  ): Promise<any> {
    const response = await safelyExecute(
      async () =>
        timeoutFetch(
          url,
          {
            method,
            cache: 'no-cache',
            redirect: 'error',
            ...options,
          },
          10000,
        ),
      true,
    );
    if (response?.status !== 200) {
      throw new Error(`Failed to fetch file with url: ${url}`);
    }
    return response;
  }

  /*
   * Function sends a HEAD request to version info file and compares the ETag to the one saved in controller state.
   * If ETag is not changed we can be sure that there is not change in files and we do not need to fetch data again.
   */
  async #checkIfVersionInfoETagChanged(url: string): Promise<boolean> {
    const headResponse = await this.#getAPIResponse(
      url,
      {
        headers: versionInfoFileHeaders,
      },
      'HEAD',
    );

    const { versionFileETag } = this.state;
    if (headResponse.headers.get('ETag') === versionFileETag) {
      return false;
    }

    this.update((draftState) => {
      draftState.versionFileETag = headResponse.headers.get('ETag');
    });

    return true;
  }

  /*
   * Fetch the version info from the PPOM cdn.
   */
  async #fetchVersionInfo(): Promise<PPOMVersionResponse | undefined> {
    const url = constructURLHref(this.#cdnBaseUrl, PPOM_VERSION_FILE_NAME);

    // If ETag is same it is not required to fetch data files again
    const eTagChanged = await this.#checkIfVersionInfoETagChanged(url);
    if (!eTagChanged) {
      return undefined;
    }

    const response = await this.#getAPIResponse(url, {
      headers: versionInfoFileHeaders,
    });
    return response.json();
  }

  /*
   * Fetch the blob file from the PPOM cdn.
   */
  async #fetchBlob(url: string): Promise<ArrayBuffer> {
    const response = await this.#getAPIResponse(url);
    return await response.arrayBuffer();
  }

  /*
   * Send a JSON RPC request to the provider.
   * This method is used by the PPOM to make requests to the provider.
   */
  async #jsonRpcRequest(
    method: string,
    params: Record<string, unknown>,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      // Throw error if number of request to provider from PPOM exceed the limit for current transaction
      if (this.#providerRequests > this.#providerRequestLimit) {
        reject(PROVIDER_ERRORS.limitExceeded());
        return;
      }
      this.#providerRequests += 1;
      // Throw error if the method called on provider by PPOM is not allowed for PPOM
      if (!ALLOWED_PROVIDER_CALLS.includes(method)) {
        reject(PROVIDER_ERRORS.methodNotSupported());
        return;
      }
      // Invoke provider and return result
      this.#provider.sendAsync(
        createPayload(method, params),
        (error: Error, res: any) => {
          if (error) {
            reject(error);
          } else {
            resolve(res);
          }
        },
      );
    });
  }

  /*
   * This function can be called to initialise PPOM or re-initilise it,
   * when new files are required to be passed to it.
   *
   * It will load the data files from storage and pass data files and wasm file to ppom.
   */
  async #getPPOM(): Promise<any> {
    // Get all the files for  the chainId
    const files = await Promise.all(
      this.state.versionInfo
        .filter((file) => file.chainId === this.#chainId)
        .map(async (file) => {
          const data = await this.#storage.readFile(file.name, file.chainId);
          return [file.name, new Uint8Array(data)];
        }),
    );

    // The following code throw error if no data files are found for the chainId.
    // This check has been put in place after suggestion of security team.
    // If we want to disable ppom validation on all instances of Metamask,
    // this can be achieved by returning empty data from version file.
    if (!files.length) {
      throw new Error(
        `Aborting validation as no files are found for the network with chainId: ${
          this.#chainId
        }`,
      );
    }

    const { ppomInit, PPOM } = this.#ppomProvider;
    await ppomInit('./ppom_bg.wasm');
    return PPOM.new(this.#jsonRpcRequest.bind(this), files);
  }

  /**
   * Functioned to be called to update PPOM.
   */
  #onDataUpdateDuration(): void {
    this.updatePPOM().catch(() => {
      // console.error(`Error while trying to update PPOM: ${exp.message}`);
    });
  }

  /**
   * The function invokes the task to fetch files of all the chains and then
   * starts the scheduled periodic task to fetch files for all the chains.
   */
  #scheduleFileDownloadForAllChains(): void {
    this.#onDataUpdateDuration();
    this.#refreshDataInterval = setInterval(
      this.#onDataUpdateDuration.bind(this),
      this.#dataUpdateDuration,
    );
  }
}
