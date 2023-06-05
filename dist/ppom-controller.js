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
var _PPOMController_instances, _PPOMController_ppom, _PPOMController_provider, _PPOMController_storage, _PPOMController_ppomMutex, _PPOMController_defaultState, _PPOMController_registerMessageHandlers, _PPOMController_shouldUpdate, _PPOMController_isOutOfDate, _PPOMController_getNewFiles, _PPOMController_updateVersionInfo, _PPOMController_maybeUpdatePPOM, _PPOMController_fetchBlob, _PPOMController_fetchVersionInfo, _PPOMController_jsonRpcRequest, _PPOMController_getPPOM;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PPOMController = exports.DAY_IN_MILLISECONDS = void 0;
const base_controller_1 = require("@metamask/base-controller");
const controller_utils_1 = require("@metamask/controller-utils");
const await_semaphore_1 = require("await-semaphore");
const ppom_1 = require("./ppom");
const ppom_storage_1 = require("./ppom-storage");
exports.DAY_IN_MILLISECONDS = 1000 * 60 * 60 * 24;
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
class PPOMController extends base_controller_1.BaseControllerV2 {
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
    constructor({ chainId, messenger, onNetworkChange, provider, state, storageBackend, }) {
        const defaultState = {
            lastFetched: 0,
            versionInfo: [],
            storageMetadata: [],
            lastChainId: '',
            newChainId: chainId,
            refreshInterval: exports.DAY_IN_MILLISECONDS,
        };
        super({
            name: controllerName,
            metadata: stateMetaData,
            messenger,
            state: { ...defaultState, ...state },
        });
        _PPOMController_instances.add(this);
        _PPOMController_ppom.set(this, void 0);
        _PPOMController_provider.set(this, void 0);
        _PPOMController_storage.set(this, void 0);
        /*
         * This mutex is used to prevent concurrent usage of the PPOM instance
         * and protect the PPOM instance from being used while it is being initialized/updated
         */
        _PPOMController_ppomMutex.set(this, void 0);
        _PPOMController_defaultState.set(this, void 0);
        __classPrivateFieldSet(this, _PPOMController_defaultState, defaultState, "f");
        __classPrivateFieldSet(this, _PPOMController_provider, provider, "f");
        __classPrivateFieldSet(this, _PPOMController_storage, new ppom_storage_1.PPOMStorage({
            storageBackend,
            readMetadata: () => {
                return JSON.parse(JSON.stringify(this.state.storageMetadata));
            },
            writeMetadata: (metadata) => {
                this.update((draftState) => {
                    draftState.storageMetadata = metadata;
                });
            },
        }), "f");
        __classPrivateFieldSet(this, _PPOMController_ppomMutex, new await_semaphore_1.Mutex(), "f");
        onNetworkChange((id) => {
            this.update((draftState) => {
                draftState.newChainId = id;
            });
        });
        __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_registerMessageHandlers).call(this);
    }
    /**
     * Clear the controller state.
     */
    clear() {
        this.update(() => __classPrivateFieldGet(this, _PPOMController_defaultState, "f"));
    }
    /**
     * Set the interval at which the ppom version info will be fetched.
     * Fetching will only occur on the next call to test/bypass.
     * For immediate update to the ppom lists, call updatePPOM directly.
     *
     * @param interval - The new interval in ms.
     */
    setRefreshInterval(interval) {
        this.update((draftState) => {
            draftState.refreshInterval = interval;
        });
    }
    /**
     * Update the PPOM configuration.
     * This function will fetch the latest version info when needed, and update the PPOM storage.
     */
    async updatePPOM() {
        if (__classPrivateFieldGet(this, _PPOMController_ppom, "f")) {
            __classPrivateFieldGet(this, _PPOMController_ppom, "f").free();
            __classPrivateFieldSet(this, _PPOMController_ppom, undefined, "f");
        }
        if (__classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_isOutOfDate).call(this)) {
            await __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_updateVersionInfo).call(this);
        }
        this.update((draftState) => {
            draftState.lastChainId = this.state.newChainId;
        });
        const storageMetadata = await __classPrivateFieldGet(this, _PPOMController_storage, "f").syncMetadata(this.state.versionInfo);
        const newFiles = await __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_getNewFiles).call(this, this.state.newChainId, storageMetadata);
        for (const file of newFiles) {
            await __classPrivateFieldGet(this, _PPOMController_storage, "f").writeFile(file);
        }
    }
    /**
     * Use the PPOM.
     * This function receives a callback that will be called with the PPOM.
     * The callback will be called with the PPOM after it has been initialized.
     *
     * @param callback - Callback to be invoked with PPOM.
     */
    async usePPOM(callback) {
        return await __classPrivateFieldGet(this, _PPOMController_ppomMutex, "f").use(async () => {
            await __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_maybeUpdatePPOM).call(this);
            if (!__classPrivateFieldGet(this, _PPOMController_ppom, "f")) {
                __classPrivateFieldSet(this, _PPOMController_ppom, await __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_getPPOM).call(this), "f");
            }
            return await callback(__classPrivateFieldGet(this, _PPOMController_ppom, "f"));
        });
    }
}
exports.PPOMController = PPOMController;
_PPOMController_ppom = new WeakMap(), _PPOMController_provider = new WeakMap(), _PPOMController_storage = new WeakMap(), _PPOMController_ppomMutex = new WeakMap(), _PPOMController_defaultState = new WeakMap(), _PPOMController_instances = new WeakSet(), _PPOMController_registerMessageHandlers = function _PPOMController_registerMessageHandlers() {
    this.messagingSystem.registerActionHandler(`${controllerName}:clear`, this.clear.bind(this));
    this.messagingSystem.registerActionHandler(`${controllerName}:usePPOM`, this.usePPOM.bind(this));
    this.messagingSystem.registerActionHandler(`${controllerName}:setRefreshInterval`, this.setRefreshInterval.bind(this));
    this.messagingSystem.registerActionHandler(`${controllerName}:updatePPOM`, this.updatePPOM.bind(this));
}, _PPOMController_shouldUpdate = 
/**
 * Determine if an update to the ppom configuration is needed.
 * The function will return true if
 * - the chainId has changed
 * - the ppom is out of date
 * - the ppom is not initialized.
 *
 * @returns True if PPOM data requires update.
 */
async function _PPOMController_shouldUpdate() {
    if (this.state.newChainId !== this.state.lastChainId ||
        __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_isOutOfDate).call(this)) {
        return true;
    }
    return __classPrivateFieldGet(this, _PPOMController_ppom, "f") === undefined;
}, _PPOMController_isOutOfDate = function _PPOMController_isOutOfDate() {
    return Date.now() - this.state.lastFetched >= this.state.refreshInterval;
}, _PPOMController_getNewFiles = 
/**
 * Returns an array of new files that should be downloaded and saved to storage.
 *
 * @param chainId - The chain ID to check for files.
 * @param storageMetadata - An array of file metadata objects already in storage.
 * @returns A promise that resolves to an array of new files to download and save to storage.
 */
async function _PPOMController_getNewFiles(chainId, storageMetadata) {
    const newFiles = [];
    for (const fileVersionInfo of this.state.versionInfo) {
        //  download all files for the current chain + generally required files.
        if (fileVersionInfo.chainId && fileVersionInfo.chainId !== chainId) {
            continue;
        }
        // check if file is already in storage
        if (storageMetadata.find((file) => file.name === fileVersionInfo.name &&
            file.chainId === fileVersionInfo.chainId &&
            file.version === fileVersionInfo.version &&
            file.checksum === fileVersionInfo.checksum)) {
            continue;
        }
        const fileUrl = `${PPOM_CDN_BASE_URL}${fileVersionInfo.filePath}`;
        const fileData = await __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_fetchBlob).call(this, fileUrl);
        newFiles.push({
            data: fileData,
            ...fileVersionInfo,
        });
    }
    return newFiles;
}, _PPOMController_updateVersionInfo = 
/*
 * Fetch the version info from the PPOM cdn.
 *  update the version info in state.
 */
async function _PPOMController_updateVersionInfo() {
    const versionInfo = await __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_fetchVersionInfo).call(this, PPOM_VERSION_PATH);
    this.update((draftState) => {
        draftState.versionInfo = versionInfo;
        draftState.lastFetched = Date.now();
    });
}, _PPOMController_maybeUpdatePPOM = 
/**
 * Conditionally update the ppom configuration.
 *
 * If the ppom configuration is out of date, this function will call `updatePPOM`
 * to update the configuration.
 */
async function _PPOMController_maybeUpdatePPOM() {
    if (await __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_shouldUpdate).call(this)) {
        await this.updatePPOM();
    }
}, _PPOMController_fetchBlob = 
/*
 * Fetch the blob from the PPOM cdn.
 */
async function _PPOMController_fetchBlob(fileUrl) {
    const response = await (0, controller_utils_1.safelyExecute)(async () => fetch(fileUrl, { cache: 'no-cache' }), true);
    switch (response?.status) {
        case 200: {
            return await response.arrayBuffer();
        }
        default: {
            throw new Error(`Failed to fetch file with url ${fileUrl}`);
        }
    }
}, _PPOMController_fetchVersionInfo = 
/*
 * Fetch the version info from the PPOM cdn.
 */
async function _PPOMController_fetchVersionInfo(url) {
    const response = await (0, controller_utils_1.safelyExecute)(async () => fetch(url, { cache: 'no-cache' }), true);
    switch (response?.status) {
        case 200: {
            return response.json();
        }
        default: {
            throw new Error(`Failed to fetch version info url: ${url}`);
        }
    }
}, _PPOMController_jsonRpcRequest = 
/*
 * Send a JSON RPC request to the provider.
 * This method is used by the PPOM to make requests to the provider.
 */
async function _PPOMController_jsonRpcRequest(req) {
    return new Promise((resolve, reject) => {
        __classPrivateFieldGet(this, _PPOMController_provider, "f").sendAsync(req, (error, res) => {
            if (error) {
                reject(error);
            }
            else {
                resolve(res);
            }
        });
    });
}, _PPOMController_getPPOM = 
/*
 * Initialize the PPOM.
 * This function will be called when the PPOM is first used.
 * or when the PPOM is out of date.
 * It will load the PPOM data from storage and initialize the PPOM.
 */
async function _PPOMController_getPPOM() {
    await (0, ppom_1.ppomInit)('./ppom.wasm');
    const chainId = this.state.lastChainId;
    const files = await Promise.all(this.state.versionInfo
        .filter((file) => !file.chainId || file.chainId === chainId)
        .map(async (file) => {
        const data = await __classPrivateFieldGet(this, _PPOMController_storage, "f").readFile(file.name, file.chainId);
        return [file.name, new Uint8Array(data)];
    }));
    return new ppom_1.PPOM(__classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_jsonRpcRequest).bind(this), files);
};
//# sourceMappingURL=ppom-controller.js.map