import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseControllerV2 } from '@metamask/base-controller';
import { safelyExecute, timeoutFetch } from '@metamask/controller-utils';
import type { NetworkControllerStateChangeEvent } from '@metamask/network-controller';
import { Mutex } from 'await-semaphore';

import type {
  StorageBackend,
  FileMetadataList,
  FileMetadata,
} from './ppom-storage';
import { PPOMStorage } from './ppom-storage';
import {
  IdGenerator,
  PROVIDER_ERRORS,
  addHexPrefix,
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

const ETHEREUM_CHAIN_ID = '0x1';

/**
 * @type PPOMFileVersion
 * @augments FileMetadata
 * @property filePath - Path of the file in CDN.
 */
type PPOMFileVersion = FileMetadata & {
  filePath: string;
  hashSignature: string;
};

/**
 * @type PPOMVersionResponse - array of objects of type PPOMFileVersion
 */
type PPOMVersionResponse = PPOMFileVersion[];

type ChainInfo = {
  chainId: string;
  lastVisited: number;
  dataFetched: boolean;
  versionInfo: PPOMVersionResponse;
};

type ChainType = Record<string, ChainInfo>;

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
  chainStatus: ChainType;
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

export type PPOMInitialisationStatusType = 'INPROGRESS' | 'SUCCESS' | 'FAIL';

export const PPOMInitialisationStatus: Record<
  PPOMInitialisationStatusType,
  PPOMInitialisationStatusType
> = {
  INPROGRESS: 'INPROGRESS',
  SUCCESS: 'SUCCESS',
  FAIL: 'FAIL',
};

export type PPOMControllerActions = UsePPOM | UpdatePPOM;

export type PPOMControllerInitialisationStateChangeEvent = {
  type: 'PPOMController:initialisationStateChangeEvent';
  payload: [PPOMInitialisationStatusType];
};

export type PPOMControllerEvents =
  | PPOMControllerInitialisationStateChangeEvent
  | NetworkControllerStateChangeEvent;

export type PPOMControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  PPOMControllerActions,
  | PPOMControllerInitialisationStateChangeEvent
  | NetworkControllerStateChangeEvent,
  never,
  NetworkControllerStateChangeEvent['type']
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

  #ppomInitError: any;

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

  // Map of count of each provider request call
  #providerRequestsCount: Record<string, number> = {};

  #blockaidPublicKey: string;

  #ppomInitialised = false;

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
   * @returns The PPOMController instance.
   */
  constructor({
    chainId,
    messenger,
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
    const currentChainId = addHexPrefix(chainId);
    const initialState = {
      versionInfo: state?.versionInfo ?? [],
      storageMetadata: state?.storageMetadata ?? [],
      chainStatus: state?.chainStatus ?? {
        [currentChainId]: {
          chainId: currentChainId,
          lastVisited: new Date().getTime(),
          dataFetched: false,
          versionInfo: [],
        },
      },
      versionFileETag: state?.versionFileETag ?? '',
    };
    super({
      name: controllerName,
      metadata: stateMetaData,
      messenger,
      state: initialState,
    });

    this.#chainId = currentChainId;
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
      fileFetchScheduleDuration === undefined
        ? FILE_FETCH_SCHEDULE_INTERVAL
        : fileFetchScheduleDuration;
    this.#securityAlertsEnabled = securityAlertsEnabled;
    this.#blockaidPublicKey = blockaidPublicKey;

    // enable / disable PPOM validations as user changes preferences
    onPreferencesChange(this.#onPreferenceChange.bind(this));

    // register message handlers
    this.#registerMessageHandlers();

    // subscribe to events
    this.#subscribeMessageEvents();

    if (securityAlertsEnabled) {
      this.#setToActiveState();
    }
  }

  /**
   * Update the PPOM.
   */
  async updatePPOM(): Promise<void> {
    if (!this.#securityAlertsEnabled) {
      throw Error('User has securityAlertsEnabled set to false');
    }
    // delete chains more than a week old
    this.#deleteOldChainIds();
    await this.#updatePPOM();
  }

  /**
   * Use the PPOM.
   * This function receives a callback that will be called with the PPOM.
   *
   * @param callback - Callback to be invoked with PPOM.
   */
  async usePPOM<Type>(
    callback: (ppom: any) => Promise<Type>,
  ): Promise<Type & { providerRequestsCount: Record<string, number> }> {
    if (!this.#securityAlertsEnabled) {
      throw Error('User has securityAlertsEnabled set to false');
    }
    if (!this.#networkIsSupported(this.#chainId)) {
      throw Error('Blockaid validation is available only on ethereum mainnet');
    }
    await this.#reinitPPOMForChainIfRequired(this.#chainId);

    this.#providerRequests = 0;
    this.#providerRequestsCount = {};
    return await this.#ppomMutex.use(async () => {
      const result = await callback(this.#ppom);

      return {
        ...result,
        // we are destructuring the object below as this will be used outside the controller
        // we want to avoid possibility of outside code changing an instance variable.
        providerRequestsCount: { ...this.#providerRequestsCount },
      };
    });
  }

  /*
   * Initialise PPOM loading wasm file.
   * This is done only if user has enabled preference for PPOM Validation.
   * Initialisation is done as soon as controller is constructed
   * or as user enables preference for blcokaid validation.
   */
  async #initialisePPOM() {
    if (this.#securityAlertsEnabled && !this.#ppomInitialised) {
      await this.#ppomMutex
        .use(async () => {
          const { ppomInit } = this.#ppomProvider;
          await ppomInit('./ppom_bg.wasm');
          this.#ppomInitialised = true;
        })
        .catch((error: Error) => {
          console.error('Error in trying to initialize PPOM', error);
          throw error;
        });
    }
  }

  /*
   * The function check if ethereum chainId is supported for validation
   * Currently it checks for only Ethereum Mainnet but it will include more networks in future.
   */
  #networkIsSupported(chainId: string) {
    return chainId === ETHEREUM_CHAIN_ID;
  }

  /*
   * Clear intervals for data fetching.
   * This is done if data fetching is no longer needed.
   * In cases like:
   * 1. User disabled preference to validate request using Blockaid
   * 2. There is not network in stats.chainStatus for which Blockaid validation is supported.
   */
  #clearDataFetchIntervals() {
    clearInterval(this.#refreshDataInterval);
    clearInterval(this.#fileScheduleInterval);
    this.#refreshDataInterval = undefined;
    this.#fileScheduleInterval = undefined;
  }

  #setToActiveState() {
    this.messagingSystem.publish(
      'PPOMController:initialisationStateChangeEvent',
      PPOMInitialisationStatus.INPROGRESS,
    );
    this.#reinitPPOMForChainIfRequired(ETHEREUM_CHAIN_ID)
      .then(async () => {
        this.messagingSystem.publish(
          'PPOMController:initialisationStateChangeEvent',
          PPOMInitialisationStatus.SUCCESS,
        );
        this.#checkScheduleFileDownloadForAllChains();
      })
      .catch((error: Error) => {
        this.messagingSystem.publish(
          'PPOMController:initialisationStateChangeEvent',
          PPOMInitialisationStatus.FAIL,
        );
        console.error(`Error in initialising ppom: ${error.message}`);
      });
  }

  /*
   * The function resets the controller to inactiva state
   * 1. reset the PPOM
   * 2. clear data fetch intervals
   * 3. clears version information of data files
   */
  #resetToInactiveState() {
    this.#resetPPOM().catch((error: Error) => {
      console.error(`Error in resetting ppom: ${error.message}`);
    });
    this.#clearDataFetchIntervals();
    this.update((draftState) => {
      draftState.versionInfo = [];
      const newChainStatus = { ...this.state.chainStatus };
      Object.keys(newChainStatus).forEach((chainId: string) => {
        if (newChainStatus[chainId]) {
          const chainInfo: ChainInfo = {
            ...(newChainStatus[chainId] as ChainInfo),
            dataFetched: false,
            versionInfo: [],
          };
          newChainStatus[chainId] = chainInfo;
        }
      });
      draftState.chainStatus = newChainStatus;
      draftState.storageMetadata = [];
      draftState.versionFileETag = '';
    });
    // todo: as we move data files to controller storage we should also delete those here
  }

  /*
   * The function adds new network to chainStatus list.
   */
  #onNetworkChange(networkControllerState: any): void {
    const id = addHexPrefix(networkControllerState.providerConfig.chainId);
    let chainStatus = { ...this.state.chainStatus };
    const existingNetworkObject = chainStatus[id];
    this.#chainId = id;
    chainStatus = {
      ...chainStatus,
      [id]: {
        chainId: id,
        lastVisited: new Date().getTime(),
        dataFetched: existingNetworkObject?.dataFetched ?? false,
        versionInfo: existingNetworkObject?.versionInfo ?? [],
      },
    };
    this.update((draftState) => {
      draftState.chainStatus = chainStatus;
    });
    this.#deleteOldChainIds();
    this.#checkScheduleFileDownloadForAllChains();
  }

  /*
   * enable / disable PPOM validations as user changes preferences
   */
  #onPreferenceChange(preferenceControllerState: any): void {
    const blockaidEnabled = preferenceControllerState.securityAlertsEnabled;
    if (blockaidEnabled === this.#securityAlertsEnabled) {
      return;
    }
    this.#securityAlertsEnabled = blockaidEnabled;
    if (blockaidEnabled) {
      this.#setToActiveState();
    } else {
      this.#resetToInactiveState();
    }
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
   * Constructor helper for registering this controller's messaging system
   * actions.
   */
  #subscribeMessageEvents(): void {
    const onNetworkChange = this.#onNetworkChange.bind(this);
    this.messagingSystem.subscribe(
      'NetworkController:stateChange',
      onNetworkChange,
    );
  }

  /*
   * The function resets PPOM.
   */
  async #resetPPOM(): Promise<void> {
    await this.#ppomMutex.use(async () => {
      if (this.#ppom) {
        this.#ppom.free();
        this.#ppom = undefined;
      }
    });
  }

  /*
   * The function initialises PPOM.
   */
  async #reinitPPOM(chainId: string): Promise<void> {
    await this.#resetPPOM();
    await this.#getPPOM(chainId);
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
   * If new version info file is available the function will update data files for all chains.
   */
  async #updatePPOM(): Promise<void> {
    const versionInfoUpdated = await this.#updateVersionInfo();
    if (versionInfoUpdated) {
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

  // todo: function below can be utility function
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

  async #getAllFiles(versionInfo: PPOMVersionResponse) {
    const files = await Promise.all(
      versionInfo.map(async (file) => {
        let data: ArrayBuffer | undefined;
        try {
          data = await this.#getFile(file);
        } catch (exp: unknown) {
          console.error(
            `Error in getting file ${file.filePath}: ${(exp as Error).message}`,
          );
        }
        if (data) {
          return [file.name, new Uint8Array(data)];
        }
        return undefined;
      }),
    );
    return files?.filter(
      (data: (string | Uint8Array)[] | undefined) => data?.[1] !== undefined,
    );
  }

  /*
   * Gets a single file from CDN and write to the storage.
   */
  async #getFile(
    fileVersionInfo: PPOMFileVersion,
  ): Promise<ArrayBuffer | undefined> {
    const { storageMetadata } = this.state;
    // do not fetch file if the storage version is latest
    if (this.#checkFilePresentInStorage(storageMetadata, fileVersionInfo)) {
      try {
        return await this.#storage.readFile(
          fileVersionInfo.name,
          fileVersionInfo.chainId,
        );
      } catch (error: unknown) {
        console.error(`Error in reading file: ${(error as Error).message}`);
      }
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
      fileVersionInfo.hashSignature,
      this.#blockaidPublicKey,
      fileVersionInfo.filePath,
    );

    try {
      await this.#storage.writeFile({
        data: fileData,
        ...fileVersionInfo,
      });
    } catch (error: unknown) {
      console.error(`Error in writing file: ${(error as Error).message}`);
    }

    return fileData;
  }

  /*
   * As files for a chain are fetched this function set dataFetched
   * property for that chainId in chainStatus to true.
   */
  async #setChainIdDataFetched(chainId: string): Promise<void> {
    const { chainStatus, versionInfo } = this.state;
    const chainIdObject = chainStatus[chainId];
    const versionInfoForChain = versionInfo.filter(
      ({ chainId: id }) => id === chainId,
    );
    if (chainIdObject) {
      this.update((draftState) => {
        draftState.chainStatus = {
          ...chainStatus,
          [chainId]: {
            ...chainIdObject,
            dataFetched: true,
            versionInfo: versionInfoForChain,
          },
        };
      });
    }
  }

  /*
   * The function will initialise PPOM for the network if required.
   */
  async #reinitPPOMForChainIfRequired(chainId: string): Promise<void> {
    if (this.#isDataRequiredForCurrentChain() || this.#ppom === undefined) {
      await this.#reinitPPOM(chainId);
      await this.#setChainIdDataFetched(chainId);
    }
  }

  /*
   * Function creates list of all files to be fetched for all chainIds in chainStatus.
   */
  async #getListOfFilesToBeFetched(): Promise<
    {
      fileVersionInfo: PPOMFileVersion;
      isLastFileOfNetwork: boolean;
    }[]
  > {
    const {
      chainStatus,
      storageMetadata,
      versionInfo: stateVersionInfo,
    } = this.state;
    const networkIsSupported = this.#networkIsSupported.bind(this);
    // create a map of chainId and files belonging to that chainId
    // not include the files for which the version in storage is the latest one
    // As we add support for multiple chains it will be useful to sort the chain in desc order of lastvisited
    const chainIdsFileInfoList = Object.keys(chainStatus)
      .filter(networkIsSupported)
      .map((chainId): { chainId: string; versionInfo: PPOMFileVersion[] } => ({
        chainId,
        versionInfo: stateVersionInfo.filter(
          (versionInfo) =>
            versionInfo.chainId === chainId &&
            !this.#checkFilePresentInStorage(storageMetadata, versionInfo),
        ),
      }));

    // build a list of files to be fetched for all networks
    const fileToBeFetchedList: {
      fileVersionInfo: PPOMFileVersion;
      isLastFileOfNetwork: boolean;
    }[] = [];
    chainIdsFileInfoList.forEach((chainIdFileInfo) => {
      const { versionInfo } = chainIdFileInfo;
      versionInfo.forEach((fileVersionInfo, index) => {
        fileToBeFetchedList.push({
          fileVersionInfo,
          isLastFileOfNetwork: index === versionInfo.length - 1,
        });
      });
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

    const chainIds = Object.keys(this.state.chainStatus).filter(
      (id) => id !== ETHEREUM_CHAIN_ID,
    );
    const oldChaninIds: any[] = chainIds.filter(
      (chainId) =>
        (this.state.chainStatus[chainId] as any).lastVisited <
          currentTimestamp - NETWORK_CACHE_DURATION &&
        chainId !== this.#chainId,
    );

    if (chainIds.length > NETWORK_CACHE_LIMIT.MAX) {
      const oldestChainId = chainIds.sort(
        (c1, c2) =>
          Number(this.state.chainStatus[c2]?.lastVisited) -
          Number(this.state.chainStatus[c1]?.lastVisited),
      )[NETWORK_CACHE_LIMIT.MAX];
      oldChaninIds.push(oldestChainId);
    }

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
    // clear existing scheduled task to fetch files if any
    if (this.#fileScheduleInterval) {
      clearInterval(this.#fileScheduleInterval);
    }

    // build a list of files to be fetched for all networks
    const fileToBeFetchedList = await this.#getListOfFilesToBeFetched();

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

      if (fileToBeFetched) {
        const { chainStatus } = this.state;
        const { fileVersionInfo, isLastFileOfNetwork } = fileToBeFetched;
        // check here if chain is present in chainStatus, it may be removed from chainStatus
        // if more than 5 networks are added to it.
        if (chainStatus[fileVersionInfo.chainId]) {
          // get the file from CDN
          this.#getFile(fileVersionInfo)
            .then(async () => {
              if (isLastFileOfNetwork) {
                // if this was last file for the chainId set dataFetched for chainId to true
                await this.#setChainIdDataFetched(fileVersionInfo.chainId);
                if (fileVersionInfo.chainId === ETHEREUM_CHAIN_ID) {
                  await this.#reinitPPOM(ETHEREUM_CHAIN_ID);
                }
              }
            })
            .catch((exp: Error) =>
              console.error(
                `Error in getting file ${fileVersionInfo.filePath}: ${exp.message}`,
              ),
            );
        }
      }
      // clear interval if all files are fetched
      if (!fileToBeFetchedList.length) {
        clearInterval(this.#fileScheduleInterval);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.#storage.syncMetadata(this.state.versionInfo);
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
    if (!eTagChanged && this.state.versionInfo?.length) {
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
    return new Promise((resolve) => {
      // Resolve with error if number of requests from PPOM to provider exceeds the limit for the current transaction
      if (this.#providerRequests > this.#providerRequestLimit) {
        resolve(PROVIDER_ERRORS.limitExceeded());
        return;
      }
      this.#providerRequests += 1;
      // Resolve with error if the provider method called by PPOM is not allowed for PPOM
      if (!ALLOWED_PROVIDER_CALLS.includes(method)) {
        resolve(PROVIDER_ERRORS.methodNotSupported());
        return;
      }

      this.#providerRequestsCount[method] = this.#providerRequestsCount[method]
        ? Number(this.#providerRequestsCount[method]) + 1
        : 1;

      // Invoke provider and return result
      this.#provider.sendAsync(
        createPayload(method, params),
        (error: Error, res: any) => {
          if (error) {
            resolve({
              jsonrpc: '2.0',
              id: IdGenerator(),
              error,
            });
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
  async #getPPOM(chainId: string): Promise<any> {
    // For some reason ppom initialisation in contrructor fails for react native
    // thus it is added here to prevent validation from failing.
    await this.#initialisePPOM();
    const { chainStatus } = this.state;
    let versionInfo = chainStatus[chainId]?.versionInfo;
    if (!versionInfo?.length) {
      await this.#updateVersionInfo();
      versionInfo = this.state.versionInfo.filter(
        ({ chainId: id }) => id === chainId,
      );
    }

    if (versionInfo?.length === undefined || versionInfo?.length === 0) {
      throw new Error(
        `Aborting initialising PPOM as no files are found for the network with chainId: ${chainId}`,
      );
    }
    // Get all the files for  the chainId
    const files = await this.#getAllFiles(versionInfo);

    // The following code throw error if no data files are found for the chainId.
    // This check has been put in place after suggestion of security team.
    // If we want to disable ppom validation on all instances of Metamask,
    // this can be achieved by returning empty data from version file.
    if (files?.length !== versionInfo?.length) {
      throw new Error(
        `Aborting initialising PPOM as not all files could not be downloaded for the network with chainId: ${chainId}`,
      );
    }

    return await this.#ppomMutex.use(async () => {
      const { PPOM } = this.#ppomProvider;
      this.#ppom = PPOM.new(this.#jsonRpcRequest.bind(this), files);
    });
  }

  /**
   * Functioned to be called to update PPOM.
   */
  #onDataUpdateDuration(): void {
    this.updatePPOM().catch((exp: Error) => {
      console.error(`Error while trying to update PPOM: ${exp.message}`);
    });
  }

  /*
   * The function invokes the task to fetch files of all the chains and then
   * starts the scheduled periodic task to fetch files for all the chains.
   */
  #checkScheduleFileDownloadForAllChains(): void {
    if (this.#securityAlertsEnabled) {
      if (!this.#refreshDataInterval) {
        this.#onDataUpdateDuration();
        this.#refreshDataInterval = setInterval(
          this.#onDataUpdateDuration.bind(this),
          this.#dataUpdateDuration,
        );
      }
    } else {
      this.#resetToInactiveState();
    }
  }
}
