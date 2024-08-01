"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _PPOMStorage_storageBackend, _PPOMStorage_readMetadata, _PPOMStorage_writeMetadata;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PPOMStorage = void 0;
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
class PPOMStorage {
    /**
     * Creates a PPOMStorage instance.
     *
     * @param options - The options passed to the function.
     * @param options.storageBackend - The storage backend to use for the local storage.
     * @param options.readMetadata - A function to read the metadata from the local storage.
     * @param options.writeMetadata - A function to write the metadata to the local storage.
     */
    constructor({ storageBackend, readMetadata, writeMetadata, }) {
        _PPOMStorage_storageBackend.set(this, void 0);
        _PPOMStorage_readMetadata.set(this, void 0);
        _PPOMStorage_writeMetadata.set(this, void 0);
        __classPrivateFieldSet(this, _PPOMStorage_storageBackend, storageBackend, "f");
        __classPrivateFieldSet(this, _PPOMStorage_readMetadata, readMetadata, "f");
        __classPrivateFieldSet(this, _PPOMStorage_writeMetadata, writeMetadata, "f");
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
    async syncMetadata(versionInfo) {
        const metadata = __classPrivateFieldGet(this, _PPOMStorage_readMetadata, "f").call(this);
        const syncedMetadata = [];
        for (const fileMetadata of metadata) {
            // check if the file is readable (e.g. corrupted or deleted)
            try {
                await this.readFile(fileMetadata.name, fileMetadata.chainId);
            }
            catch (exp) {
                console.error('Error: ', exp);
                continue;
            }
            // check if the file exits and up to date in the storage
            if (!versionInfo.find((file) => file.name === fileMetadata.name &&
                file.chainId === fileMetadata.chainId &&
                file.version === fileMetadata.version &&
                file.checksum === fileMetadata.checksum)) {
                continue;
            }
            syncedMetadata.push(fileMetadata);
        }
        const filesInDB = await __classPrivateFieldGet(this, _PPOMStorage_storageBackend, "f").dir();
        for (const { name, chainId } of filesInDB) {
            if (!syncedMetadata.find((file) => file.name === name && file.chainId === chainId)) {
                await __classPrivateFieldGet(this, _PPOMStorage_storageBackend, "f").delete({ name, chainId });
            }
        }
        __classPrivateFieldGet(this, _PPOMStorage_writeMetadata, "f").call(this, syncedMetadata);
        return syncedMetadata;
    }
    /**
     * Delete all files in storage.
     *
     * @param metadata - List of all files in storage.
     */
    async deleteAllFiles(metadata) {
        for (const fileMetadata of metadata) {
            const { name, chainId } = fileMetadata;
            try {
                await __classPrivateFieldGet(this, _PPOMStorage_storageBackend, "f").delete({ name, chainId });
            }
            catch (exp) {
                console.error(`Error in deleting file: ${name}, ${chainId}`, exp);
            }
        }
    }
    /**
     * Read the file from the local storage.
     * 1. Check if the file exists in the local storage.
     * 2. Check if the file exists in the metadata.
     *
     * @param name - Name assigned to storage.
     * @param chainId - ChainId for which file is queried.
     */
    async readFile(name, chainId) {
        const metadata = __classPrivateFieldGet(this, _PPOMStorage_readMetadata, "f").call(this);
        const fileMetadata = metadata.find((file) => file.name === name && file.chainId === chainId);
        if (!fileMetadata) {
            throw new Error(`File metadata (${name}, ${chainId}) not found`);
        }
        const data = await __classPrivateFieldGet(this, _PPOMStorage_storageBackend, "f").read({ name, chainId }, fileMetadata.checksum);
        if (!data) {
            throw new Error(`Storage File (${name}, ${chainId}) not found`);
        }
        return data;
    }
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
    async writeFile({ data, name, chainId, version, checksum, }) {
        await __classPrivateFieldGet(this, _PPOMStorage_storageBackend, "f").write({ name, chainId }, data, checksum);
        const metadata = __classPrivateFieldGet(this, _PPOMStorage_readMetadata, "f").call(this);
        const fileMetadata = metadata.find((file) => file.name === name && file.chainId === chainId);
        if (fileMetadata) {
            fileMetadata.version = version;
            fileMetadata.checksum = checksum;
        }
        else {
            metadata.push({ name, chainId, version, checksum });
        }
        __classPrivateFieldGet(this, _PPOMStorage_writeMetadata, "f").call(this, metadata);
    }
}
exports.PPOMStorage = PPOMStorage;
_PPOMStorage_storageBackend = new WeakMap(), _PPOMStorage_readMetadata = new WeakMap(), _PPOMStorage_writeMetadata = new WeakMap();
//# sourceMappingURL=ppom-storage.js.map