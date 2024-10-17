import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { safelyExecute, timeoutFetch } from '@metamask/controller-utils';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerNetworkDidChangeEvent,
  NetworkState,
  Provider,
} from '@metamask/network-controller';
import type { Json, JsonRpcParams } from '@metamask/utils';
import { Mutex } from 'await-semaphore';

import type {
  StorageBackend,
  FileMetadataList,
  FileMetadata,
} from './ppom-storage';
import { PPOMStorage } from './ppom-storage';
import {
  addHexPrefix,
  blockaidValidationSupportedForNetwork,
  checkFilePath,
  constructURLHref,
  createPayload,
  PROVIDER_ERRORS,
  validateSignature,
} from './util';

const PROVIDER_REQUEST_LIMIT = 300;
export const NETWORK_CACHE_DURATION = 1000 * 60 * 60 * 24 * 7;

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

type SecurityAlertResponse = {
  reason: string;
  features?: string[];
  // eslint-disable-next-line @typescript-eslint/naming-convention
  result_type: string;
  providerRequestsCount?: Record<string, number>;
  securityAlertId?: string;
};

// Provisional skeleton type for PPOM class
// TODO: Replace with actual PPOM class
type PPOM = {
  new: (...args: unknown[]) => PPOM;
  validateJsonRpc: (
    request: Record<string, unknown>,
  ) => Promise<SecurityAlertResponse>;
  free: () => void;
} & Record<string, unknown>;

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

export type NativeCrypto = {
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
export type PPOMState = {
  // version information obtained from version info file
  versionInfo: PPOMVersionResponse;
  // storage metadat of files already present in the storage
  storageMetadata: FileMetadataList;
};

const stateMetaData = {
  versionInfo: { persist: true, anonymous: false },
  storageMetadata: { persist: true, anonymous: false },
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
  handler: (callback: (ppom: PPOM) => Promise<unknown>) => Promise<unknown>;
};

export type PPOMControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  PPOMState
>;

export type PPOMControllerActions = PPOMControllerGetStateAction | UsePPOM;

export type PPOMControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  PPOMState
>;

export type PPOMControllerEvents = PPOMControllerStateChangeEvent;

export type AllowedEvents = NetworkControllerNetworkDidChangeEvent;

export type AllowedActions = NetworkControllerGetNetworkClientByIdAction;

export type PPOMControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  PPOMControllerActions | AllowedActions,
  PPOMControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

// eslint-disable-next-line  @typescript-eslint/naming-convention
type PPOMProvider = {
  ppomInit: (wasmFilePath: string) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/naming-convention
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
export class PPOMController extends BaseController<
  typeof controllerName,
  PPOMState,
  PPOMControllerMessenger
> {
  #ppom: PPOM | undefined;

  #provider: Provider;

  #storage: PPOMStorage;

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

  // true if user has enabled preference for blockaid security check
  #securityAlertsEnabled: boolean;

  // Map of count of each provider request call
  #providerRequestsCount: Record<string, number> = {};

  #blockaidPublicKey: string;

  #ppomInitialised = false;

  #nativeCrypto: NativeCrypto | undefined = undefined;

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
    state,
    blockaidPublicKey,
    nativeCrypto,
  }: {
    chainId: string;
    messenger: PPOMControllerMessenger;
    provider: Provider;
    storageBackend: StorageBackend;
    securityAlertsEnabled: boolean;
    onPreferencesChange: (
      callback: (
        // TOOD: Replace with `PreferencesState` from `@metamask/preferences-controller`
        preferencesState: { securityAlertsEnabled: boolean } & Record<
          string,
          Json
        >,
      ) => void,
    ) => void;
    ppomProvider: PPOMProvider;
    cdnBaseUrl: string;
    providerRequestLimit?: number;
    dataUpdateDuration?: number;
    fileFetchScheduleDuration?: number;
    state?: PPOMState;
    blockaidPublicKey: string;
    nativeCrypto?: NativeCrypto;
  }) {
    const initialState = {
      versionInfo: state?.versionInfo ?? [],
      storageMetadata: state?.storageMetadata ?? [],
    };
    super({
      name: controllerName,
      metadata: stateMetaData,
      messenger,
      state: initialState,
    });

    this.#chainId = addHexPrefix(chainId);
    this.#provider = provider;
    this.#ppomProvider = ppomProvider;
    this.#storage = new PPOMStorage({
      storageBackend,
      readMetadata: () => {
        return [...this.state.storageMetadata];
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
    this.#securityAlertsEnabled = securityAlertsEnabled;
    this.#blockaidPublicKey = blockaidPublicKey;
    this.#nativeCrypto = nativeCrypto;

    // enable / disable PPOM validations as user changes preferences
    onPreferencesChange(this.#onPreferenceChange.bind(this));

    // register message handlers
    this.#registerMessageHandlers();

    // subscribe to events
    this.#subscribeMessageEvents();
  }

  /**
   * Use the PPOM.
   * This function receives a callback that will be called with the PPOM.
   *
   * @param callback - Callback to be invoked with PPOM.
   * @param chainId - ChainId of confirmation.
   */
  async usePPOM<Type>(
    callback: (ppom: PPOM) => Promise<Type>,
    chainId?: string,
  ): Promise<Type & { providerRequestsCount: Record<string, number> }> {
    const chainIdForRequest = chainId ?? this.#chainId;
    if (!this.#securityAlertsEnabled) {
      throw Error('User has securityAlertsEnabled set to false');
    }
    if (!blockaidValidationSupportedForNetwork(chainIdForRequest)) {
      throw Error(
        `Blockaid validation not available on network with chainId: ${chainIdForRequest}`,
      );
    }
    return await this.#ppomMutex.use(async () => {
      const ppom = await this.#initPPOMIfRequired(chainIdForRequest);

      this.#providerRequests = 0;
      this.#providerRequestsCount = {};

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const result = await callback(ppom!);

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
   * or as user enables preference for blockaid validation.
   */
  async #initialisePPOM() {
    if (this.#securityAlertsEnabled && !this.#ppomInitialised) {
      const { ppomInit } = this.#ppomProvider;
      await ppomInit('./ppom_bg.wasm');
      this.#ppomInitialised = true;
    }
  }

  /*
   * The function resets the controller to inactive state.
   * This is invoked when user disables blockaid preference.
   * 1. reset the PPOM
   * 2. clear data fetch intervals
   * 3. clears version information of data files
   */
  #resetToInactiveState() {
    this.#resetPPOM().catch((error: Error) => {
      console.error(`Error in resetting ppom: ${error.message}`);
    });
    const { storageMetadata } = this.state;
    this.update((draftState) => {
      draftState.versionInfo = [];
      draftState.storageMetadata = [];
    });
    this.#storage.deleteAllFiles(storageMetadata).catch((error: Error) => {
      console.error(`Error in deleting files: ${error.message}`);
    });
  }

  /*
   * The function is invoked on network change, it does following:
   * 1. update instance value this.#chainid
   * 2. reset PPOM
   */
  #onNetworkChange(networkControllerState: NetworkState): void {
    const selectedNetworkClient = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkControllerState.selectedNetworkClientId,
    );
    const { chainId } = selectedNetworkClient.configuration;
    const id = addHexPrefix(chainId);
    if (id === this.#chainId) {
      return;
    }
    this.#chainId = id;
    this.#resetPPOM().catch((error: Error) => {
      console.error(`Error in resetting ppom: ${error.message}`);
    });
  }

  /*
   * enable / disable PPOM validations as user changes preferences
   */
  #onPreferenceChange(
    // TOOD: Replace with `PreferencesState` from `@metamask/preferences-controller`
    preferenceControllerState: { securityAlertsEnabled: boolean } & Record<
      string,
      Json
    >,
  ): void {
    const blockaidEnabled = preferenceControllerState.securityAlertsEnabled;
    if (blockaidEnabled === this.#securityAlertsEnabled) {
      return;
    }
    this.#securityAlertsEnabled = blockaidEnabled;
    if (!blockaidEnabled) {
      this.#resetToInactiveState();
    }
  }

  /*
   * Constructor helper for registering this controller's messaging system actions.
   */
  #registerMessageHandlers(): void {
    this.messagingSystem.registerActionHandler(
      `${controllerName}:usePPOM` as const,
      this.usePPOM.bind(this),
    );
  }

  /*
   * Constructor helper for registering this controller's messaging system
   * actions.
   */
  #subscribeMessageEvents(): void {
    const onNetworkChange = this.#onNetworkChange.bind(this);
    this.messagingSystem.subscribe(
      'NetworkController:networkDidChange',
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
   * The function will initialise PPOM for the network if required.
   */
  async #initPPOMIfRequired(chainId: string): Promise<PPOM | undefined> {
    const versionInfoUpdated = await this.#updateVersionInfo();
    let ppom;
    if (this.#ppom === undefined || versionInfoUpdated) {
      ppom = await this.#getPPOM(chainId);
      if (this.#chainId === chainId) {
        if (this.#ppom) {
          this.#ppom.free();
        }
        this.#ppom = ppom;
      }
      this.#storage.syncMetadata(this.state.versionInfo).catch((exp: Error) => {
        console.error(`Error while trying to sync metadata: ${exp.message}`);
      });
    }
    return ppom;
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
   *
   * Get all files listed in versionInfo passed.
   */
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
    checkFilePath(fileVersionInfo.filePath);
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
      this.#nativeCrypto,
    );

    await this.#storage
      .writeFile({
        data: fileData,
        ...fileVersionInfo,
      })
      .catch((error: Error) => {
        console.error(`Error in writing file: ${error.message}`);
      });

    return fileData;
  }

  /*
   * Generic method to fetch file from CDN.
   */
  async #getAPIResponse(
    url: string,
    options: Record<string, unknown> = {},
    method = 'GET',
  ): Promise<{ cached: boolean; response: any }> {
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
    const cached = response?.status === 304;
    if (!response?.status || response?.status < 200 || response?.status > 399) {
      throw new Error(`Failed to fetch file with url: ${url}`);
    }
    return { cached, response };
  }

  /*
   * Fetch the version info from the PPOM cdn.
   */
  async #fetchVersionInfo(): Promise<PPOMVersionResponse | undefined> {
    const url = constructURLHref(this.#cdnBaseUrl, PPOM_VERSION_FILE_NAME);

    const { cached, response } = await this.#getAPIResponse(url, {
      headers: versionInfoFileHeaders,
    });

    if (cached && this.state.versionInfo?.length) {
      return undefined;
    }

    return response.json();
  }

  /*
   * Fetch the blob file from the PPOM cdn.
   */
  async #fetchBlob(url: string): Promise<ArrayBuffer> {
    const { response } = await this.#getAPIResponse(url);
    return await response.arrayBuffer();
  }

  /*
   * Send a JSON RPC request to the provider.
   * This method is used by the PPOM to make requests to the provider.
   */
  async #jsonRpcRequest(method: string, params: JsonRpcParams): Promise<Json> {
    // Resolve with error if number of requests from PPOM to provider exceeds the limit for the current transaction
    if (this.#providerRequests > this.#providerRequestLimit) {
      return PROVIDER_ERRORS.limitExceeded();
    }
    this.#providerRequests += 1;
    // Resolve with error if the provider method called by PPOM is not allowed for PPOM
    if (!ALLOWED_PROVIDER_CALLS.includes(method)) {
      return PROVIDER_ERRORS.methodNotSupported();
    }

    this.#providerRequestsCount[method] = this.#providerRequestsCount[method]
      ? Number(this.#providerRequestsCount[method]) + 1
      : 1;

    const payload = createPayload(method, params);
    const result = await this.#provider.request(payload);
    return { jsonrpc: '2.0', id: payload.id, result };
  }

  /*
   * This function can be called to initialise PPOM or re-initilise it,
   * when new files are required to be passed to it.
   *
   * It will load the data files from storage and pass data files and wasm file to ppom.
   */
  async #getPPOM(chainId: string): Promise<PPOM> {
    // PPOM initialisation in contructor fails for react native
    // thus it is added here to prevent validation from failing.
    await this.#initialisePPOM();
    const versionInfo = this.state.versionInfo.filter(
      ({ chainId: id }) => id === chainId,
    );

    // The following code throw error if no data files are found for the chainId.
    // This check has been put in place after suggestion of security team.
    // If we want to disable ppom validation on all instances of Metamask,
    // this can be achieved by returning empty data from version file.
    if (versionInfo?.length === undefined || versionInfo?.length === 0) {
      throw new Error(
        `Aborting initialising PPOM as no files are found for the network with chainId: ${chainId}`,
      );
    }

    // Get all the files for  the chainId
    const files = await this.#getAllFiles(versionInfo);

    if (files?.length !== versionInfo?.length) {
      throw new Error(
        `Aborting initialising PPOM as not all files could not be downloaded for the network with chainId: ${chainId}`,
      );
    }

    const { PPOM } = this.#ppomProvider;
    return PPOM.new(this.#jsonRpcRequest.bind(this), files);
  }
}
