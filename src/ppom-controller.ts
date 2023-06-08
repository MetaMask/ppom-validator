import {
  BaseController,
  BaseConfig,
  BaseState,
} from '@metamask/base-controller';
import { safelyExecute } from '@metamask/controller-utils';
import { Mutex } from 'await-semaphore';

import { ppomInit, PPOM } from './ppom';
import {
  StorageBackend,
  PPOMStorage,
  PPOMFileMetadata,
  FileInfo,
} from './ppom-storage';

const DAY_IN_MILLISECONDS = 1000 * 60 * 60 * 24;

/**
 * @type PPOMFileVersion
 * @augments FileInfo
 * @property filePath - Path of the file in CDN.
 */
type PPOMFileVersion = FileInfo & {
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
 * @property lastFetched - Time when files were last updated.
 * @property lastChainId - ChainId for which files were last updated.
 * @property newChainId - ChainIf of currently selected network.
 * @property versionInfo - Version information fetched from CDN.
 * @property storageMetadata - Metadata of files storaged in storage.
 */
export type PPOMState = BaseState & {
  lastFetched: number;
  lastChainId: string;
  newChainId: string;
  versionInfo: PPOMVersionResponse;
  storageMetadata: PPOMFileMetadata;
};

/**
 * @type PPOMControllerConfig
 *
 * Controller configuration
 * @property refreshInterval - Polling interval used to fetch new PPOM lists
 */
export type PPOMControllerConfig = BaseConfig & {
  refreshInterval: number;
};

const PPOM_DATA_NAME = 'data';
const PPOM_BLOB_NAME = 'blob';

// TODO: replace with metamask cdn
const PPOM_CDN_BASE_URL = 'https://storage.googleapis.com/ppom-cdn/';
const PPOM_VERSION = 'ppom_version.json';
const PPOM_VERSION_PATH = `${PPOM_CDN_BASE_URL}${PPOM_VERSION}`;

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
  PPOMControllerConfig,
  PPOMState
> {
  /**
   * Name of this controller used during composition
   */
  override name = 'PPOMController';

  #ppom: PPOM | undefined;

  #provider: any;

  #storage: PPOMStorage;

  /*
   * This mutex is used to prevent concurrent usage of the PPOM instance
   * and protect the PPOM instance from being used while it is being initialized/updated
   */
  #ppomMutex: Mutex;

  /**
   * Creates a PPOMController instance.
   *
   * @param options - Constructor options.
   * @param options.storageBackend - The storage backend to use for storing PPOM data.
   * @param options.provider - The provider used to create the PPOM instance.
   * @param options.chainId - Id of current chain.
   * @param options.onNetworkChange - Callback tobe invoked when network changes.
   * @param options.config - The controller configuration.
   * @param options.state - The controller state.
   * @returns The PPOMController instance.
   */
  constructor({
    storageBackend,
    provider,
    chainId,
    onNetworkChange,
    config,
    state,
  }: {
    storageBackend: StorageBackend;
    provider: any;
    chainId: string;
    onNetworkChange: (callback: (chainId: string) => void) => void;
    config?: PPOMControllerConfig;
    state?: PPOMState;
  }) {
    const defaultConfig = {
      refreshInterval: DAY,
    };
    const defaultState = {
      lastFetched: 0,
      versionInfo: [],
      storageMetadata: [],
      lastChainId: '',
      newChainId: chainId,
    };
    super(config ?? defaultConfig, state ?? defaultState);

    this.defaultConfig = defaultConfig;
    this.defaultState = defaultState;

    this.#provider = provider;
    this.#storage = new PPOMStorage({
      storageBackend,
      readMetadata: () => {
        return this.state.storageMetadata;
      },
      writeMetadata: (metadata) => {
        this.update({ storageMetadata: metadata });
      },
    });
    this.#ppomMutex = new Mutex();

    onNetworkChange((id: string) => {
      this.update({ newChainId: id });
    });

    this.initialize();
  }

  /**
   * Set the interval at which the ppom version info will be fetched.
   * Fetching will only occur on the next call to test/bypass.
   * For immediate update to the ppom lists, call updatePPOM directly.
   *
   * @param interval - The new interval in ms.
   */
  setRefreshInterval(interval: number) {
    this.configure({ refreshInterval: interval }, false, false);
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
    return Date.now() - this.state.lastFetched >= this.config.refreshInterval;
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

    this.update({ lastChainId: this.state.newChainId });

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
  async #getNewFiles(chainId: string, storageMetadata: any[]): Promise<any[]> {
    const newFiles: any[] = [];

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
      if (!fileData) {
        throw new Error('Failed to fetch file data');
      }

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
    if (!versionInfo) {
      throw new Error('Failed to fetch version info');
    }

    this.update({
      versionInfo,
      lastFetched: Date.now(),
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

    this.update(this.state);
  }

  /*
   * Fetch the blob from the PPOM cdn.
   */
  async #fetchBlob(input: string): Promise<ArrayBuffer | null> {
    const response = await safelyExecute(
      async () => fetch(input, { cache: 'no-cache' }),
      true,
    );

    switch (response?.status) {
      case 200: {
        return await response.arrayBuffer();
      }

      default: {
        return null;
      }
    }
  }

  /*
   * Fetch the version info from the PPOM cdn.
   */
  async #fetchVersionInfo(input: string): Promise<PPOMVersionResponse | null> {
    const response = await safelyExecute(
      async () => fetch(input, { cache: 'no-cache' }),
      true,
    );
    switch (response?.status) {
      case 200: {
        return response.json();
      }

      default: {
        return null;
      }
    }
  }

  /*
   * Send a JSON RPC request to the provider.
   * This method is used by the PPOM to make requests to the provider.
   */
  async #jsonRpcRequest(req: any): Promise<any> {
    return new Promise((resolve) => {
      this.#provider.sendAsync(req, (_err: any, res: any) => {
        resolve(res);
      });
    });
  }

  /*
   * Initialize the PPOM.
   * This function will be called when the PPOM is first used.
   * or when the PPOM is out of date.
   * It will load the PPOM data from storage and initialize the PPOM.
   */
  async #getPPOM(): Promise<PPOM> {
    await ppomInit(this.#storage.readFile(PPOM_BLOB_NAME, ''));
    const data = await this.#storage.readFile(
      PPOM_DATA_NAME,
      this.state.newChainId,
    );

    return new PPOM(this.#jsonRpcRequest.bind(this), new Uint8Array(data));
  }

  /**
   * Use the PPOM.
   * This function receives a callback that will be called with the PPOM.
   * The callback will be called with the PPOM after it has been initialized.
   *
   * @param callback - Callback to be invoked with PPOM.
   */
  async use(callback: (ppom: PPOM) => Promise<any>): Promise<any> {
    return await this.#ppomMutex.use(async () => {
      await this.#maybeUpdatePPOM();

      if (!this.#ppom) {
        this.#ppom = await this.#getPPOM();
      }

      return await callback(this.#ppom);
    });
  }
}
