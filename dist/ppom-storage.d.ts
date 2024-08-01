/**
 * @type FileMetadata
 * Defined type for information about file saved in storage backend.
 * @property name - Name of the file.
 * @property chainId - ChainId for file.
 * @property version - File version.
 * @property checksum - Checksum of file data.
 */
export declare type FileMetadata = {
    name: string;
    chainId: string;
    version: string;
    checksum: string;
};
/**
 * @type FileMetadataList
 * This is type of metadata about files saved in storage,
 * this information is saved in PPOMController state.
 */
export declare type FileMetadataList = FileMetadata[];
/**
 * @type StorageKey
 * This defines type of key that is used for indexing file data saved in StorageBackend.
 * @property name - Name of the file.
 * @property chainId - ChainId for file.
 */
export declare type StorageKey = {
    name: string;
    chainId: string;
};
/**
 * @type StorageBackend
 * This defines type for storage backend implementation.
 * There will be different storage implementations depending on platform:
 * 1. extension - indexDB
 * 2. mobile app - <TBD>
 * @property read - Read file from storage.
 * @property write - Write file to storage.
 * @property delete - Delete file from storage.
 * @property dir - Get list of all files in storage.
 */
export declare type StorageBackend = {
    read(key: StorageKey, checksum: string): Promise<ArrayBuffer>;
    write(key: StorageKey, data: ArrayBuffer, checksum: string): Promise<void>;
    delete(key: StorageKey): Promise<void>;
    dir(): Promise<StorageKey[]>;
};
/**
 * @class PPOMStorage
 * This class is responsible for managing the local storage
 * It provides the following functionalities:
 * 1. Sync the metadata with the version info from the cdn
 * 2. Read a file from the local storage
 * 3. Write a file to the local storage
 *
 * It also validates the checksum of the file when reading and writing in order to
 * detect corrupted files or files that are not up to date
 */
export declare class PPOMStorage {
    #private;
    /**
     * Creates a PPOMStorage instance.
     *
     * @param options - The options passed to the function.
     * @param options.storageBackend - The storage backend to use for the local storage.
     * @param options.readMetadata - A function to read the metadata from the local storage.
     * @param options.writeMetadata - A function to write the metadata to the local storage.
     */
    constructor({ storageBackend, readMetadata, writeMetadata, }: {
        storageBackend: StorageBackend;
        readMetadata: () => FileMetadataList;
        writeMetadata: (metadata: FileMetadataList) => void;
    });
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
    syncMetadata(versionInfo: FileMetadataList): Promise<FileMetadataList>;
    /**
     * Delete all files in storage.
     *
     * @param metadata - List of all files in storage.
     */
    deleteAllFiles(metadata: FileMetadataList): Promise<void>;
    /**
     * Read the file from the local storage.
     * 1. Check if the file exists in the local storage.
     * 2. Check if the file exists in the metadata.
     *
     * @param name - Name assigned to storage.
     * @param chainId - ChainId for which file is queried.
     */
    readFile(name: string, chainId: string): Promise<ArrayBuffer>;
    /**
     * Write the file to the local storage.
     * 1. Write the file to the local storage.
     * 2. Update the metadata.
     *
     * @param options - Object passed to write to storage.
     * @param options.data - File data to be written.
     * @param options.name - Name to be assigned to the storage.
     * @param options.chainId - Current ChainId.
     * @param options.version - Version of file.
     * @param options.checksum - Checksum of file.
     */
    writeFile({ data, name, chainId, version, checksum, }: {
        data: ArrayBuffer;
        name: string;
        chainId: string;
        version: string;
        checksum: string;
    }): Promise<void>;
}
