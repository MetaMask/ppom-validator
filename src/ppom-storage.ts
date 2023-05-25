type FileMetadata = {
  name: string;
  chainId: string;
  version: string;
  checksum: string;
};

export type PPOMStorageMetadata = FileMetadata[];

export type StorageKey = {
  name: string;
  chainId: string;
};

export type StorageBackend = {
  read(key: StorageKey): Promise<any>;
  write(key: StorageKey, data: any): Promise<void>;
  delete(key: StorageKey): Promise<void>;
  dir(): Promise<StorageKey[]>;
};

/**
 * PPOMStorage class
 * This class is responsible for managing the local storage
 * It provides the following functionalities:
 * 1. Sync the metadata with the version info from the cdn
 * 2. Read a file from the local storage
 * 3. Write a file to the local storage
 *
 * It also validates the checksum of the file when reading and writing in order to
 * detect corrupted files or files that are not up to date
 */
export class PPOMStorage {
  readonly #storageBackend: StorageBackend;

  readonly _readMetadata: () => PPOMStorageMetadata;

  readonly _writeMetadata: (metadata: PPOMStorageMetadata) => void;

  /**
   * Creates a PPOMStorage instance.
   *
   * @param options0 - The options passed to the function.
   * @param options0.storageBackend - The storage backend to use for the local storage.
   * @param options0.readMetadata - A function to read the metadata from the local storage.
   * @param options0.writeMetadata - A function to write the metadata to the local storage.
   */
  constructor({
    storageBackend,
    readMetadata,
    writeMetadata,
  }: {
    storageBackend: StorageBackend;
    readMetadata: () => PPOMStorageMetadata;
    writeMetadata: (metadata: PPOMStorageMetadata) => void;
  }) {
    this.#storageBackend = storageBackend;
    this._readMetadata = readMetadata;
    this._writeMetadata = writeMetadata;
  }

  /**
   * Sync the metadata with the version info from the cdn.
   * 1. Remove the files that are not readable (e.g. corrupted or deleted).
   * 2. Remove the files that are not in the cdn anymore.
   * 3. Remove the files that are not up to date in the cdn.
   * 4. Remove the files that are not in the local storage from the metadata.
   * 5. Delete the files that are not in the metadata from the local storage.
   *
   * @param versionInfo - Version information of metadata files.
   */
  public async syncMetadata(versionInfo: any[]): Promise<PPOMStorageMetadata> {
    const metadata = this._readMetadata();
    const syncedMetadata = [];

    for (const fileMetadata of metadata) {
      // check if the file is readable (e.g. corrupted or deleted)
      try {
        await this.readFile(fileMetadata.name, fileMetadata.chainId);
      } catch {
        continue;
      }

      // check if the file exits and up to date in the cdn
      if (
        !versionInfo.find(
          (file) =>
            file.name === fileMetadata.name &&
            file.chainId === fileMetadata.chainId &&
            file.version === fileMetadata.version &&
            file.checksum === fileMetadata.checksum,
        )
      ) {
        continue;
      }

      syncedMetadata.push(fileMetadata);
    }

    const filesInDB = await this.#storageBackend.dir();
    for (const { name, chainId } of filesInDB) {
      if (
        !syncedMetadata.find(
          (file) => file.name === name && file.chainId === chainId,
        )
      ) {
        await this.#storageBackend.delete({ name, chainId });
      }
    }

    this._writeMetadata(syncedMetadata);
    return syncedMetadata;
  }

  /**
   * Read the file from the local storage.
   * 1. Check if the file exists in the local storage.
   * 2. Check if the file exists in the metadata.
   * 3. Check if the checksum is valid.
   *
   * @param name - Name assigned to storage.
   * @param chainId - ChainId for which file is queried.
   */
  public async readFile(name: string, chainId: string): Promise<ArrayBuffer> {
    const metadata = this._readMetadata();
    const fileMetadata = metadata.find(
      (file) => file.name === name && file.chainId === chainId,
    );
    if (!fileMetadata) {
      throw new Error(
        `File metadata not found for File (${name}, ${chainId}) not found`,
      );
    }

    const data = await this.#storageBackend.read({ name, chainId });
    if (!data) {
      throw new Error(`Storage File (${name}, ${chainId}) not found`);
    }

    await this.#validateChecksum(data, fileMetadata.checksum);

    return data;
  }

  /**
   * Write the file to the local storage.
   * 1. Check if the checksum is valid.
   * 2. Write the file to the local storage.
   * 3. Update the metadata.
   *
   * @param options0 - Object passed to write to storage.
   * @param options0.data - File data to be written.
   * @param options0.name - Name to be assigned to teh storage.
   * @param options0.chainId - Current ChainId.
   * @param options0.version - Version of file.
   * @param options0.checksum - Checksum of file.
   */
  public async writeFile({
    data,
    name,
    chainId,
    version,
    checksum,
  }: {
    data: ArrayBuffer;
    name: string;
    chainId: string;
    version: string;
    checksum: string;
  }): Promise<void> {
    await this.#validateChecksum(data, checksum);
    await this.#storageBackend.write({ name, chainId }, data);

    const metadata = this._readMetadata();
    const fileMetadata = metadata.find(
      (file) => file.name === name && file.chainId === chainId,
    );
    if (fileMetadata) {
      fileMetadata.version = version;
      fileMetadata.checksum = checksum;
    } else {
      metadata.push({ name, chainId, version, checksum });
    }

    this._writeMetadata(metadata);
  }

  /*
   * Validate the checksum of the file
   * The checksum is calculated from the file content using SHA-256
   */
  async #validateChecksum(data: ArrayBuffer, checksum: string) {
    // eslint-disable-next-line no-restricted-globals
    const hash = await (globalThis as any).crypto.subtle.digest(
      'SHA-256',
      data,
    );
    const hashString = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    console.log('hashString = ', hashString, checksum);
    if (hashString !== checksum) {
      throw new Error('Checksum mismatch');
    }
  }
}
