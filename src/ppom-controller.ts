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

export const DAY_IN_MILLISECONDS = 1000 * 60 * 60 * 24;

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
 * @property lastFetched - Time when files were last updated.
 * @property lastChainId - ChainId for which files were last updated.
 * @property newChainId - ChainIf of currently selected network.
 * @property versionInfo - Version information fetched from CDN.
 * @property storageMetadata - Metadata of files storaged in storage.
 */
export type PPOMControllerState = {
  lastFetched: number;
  lastChainId: string;
  newChainId: string;
  versionInfo: PPOMVersionResponse;
  storageMetadata: FileMetadataList;
  refreshInterval: number;
};

const stateMetaData = {
  lastFetched: { persist: false, anonymous: false },
  lastChainId: { persist: false, anonymous: false },
  newChainId: { persist: false, anonymous: false },
  versionInfo: { persist: false, anonymous: false },
  storageMetadata: { persist: false, anonymous: false },
  refreshInterval: { persist: false, anonymous: false },
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

  /*
   * This mutex is used to prevent concurrent usage of the PPOM instance
   * and protect the PPOM instance from being used while it is being initialized/updated
   */
  #ppomMutex: Mutex;

  #defaultState: PPOMControllerState;

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
    const defaultState = {
      lastFetched: 0,
      versionInfo: [],
      storageMetadata: [],
      lastChainId: '',
      newChainId: chainId,
      refreshInterval: DAY_IN_MILLISECONDS,
    };
    super({
      name: controllerName,
      metadata: stateMetaData,
      messenger,
      state: { ...defaultState, ...state },
    });

    this.#defaultState = defaultState;

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
  }

  /**
   * Clear the controller state.
   */
  clear(): void {
    this.update(() => this.#defaultState);
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
  }

  /**
   * Update the PPOM configuration.
   * This function will fetch the latest version info when needed, and update the PPOM storage.
   */
  async updatePPOM() {
    if (this.#ppom) {
      this.#ppom.free();
      this.#ppom = undefined;
    }

    if (this.#isOutOfDate()) {
      await this.#updateVersionInfo();
    }

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
    if (
      this.state.newChainId !== this.state.lastChainId ||
      this.#isOutOfDate()
    ) {
      return true;
    }

    return this.#ppom === undefined;
  }

  /*
   * check if the ppom is out of date
   */
  #isOutOfDate(): boolean {
    return Date.now() - this.state.lastFetched >= this.state.refreshInterval;
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

    this.update((draftState) => {
      draftState.versionInfo = versionInfo;
      draftState.lastFetched = Date.now();
    });
  }

  /**
   * Conditionally update the ppom configuration.
   *
   * If the ppom configuration is out of date, this function will call `updatePPOM`
   * to update the configuration.
   */
  async #maybeUpdatePPOM() {
    if (await this.#shouldUpdate()) {
      await this.updatePPOM();
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
  async #fetchVersionInfo(url: string): Promise<PPOMVersionResponse> {
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
  async #jsonRpcRequest(req: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.#provider.sendAsync(req, (error: any, res: any) => {
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
}
