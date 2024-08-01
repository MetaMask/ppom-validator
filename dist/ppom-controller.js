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
var _PPOMController_instances, _PPOMController_ppom, _PPOMController_provider, _PPOMController_storage, _PPOMController_ppomMutex, _PPOMController_ppomProvider, _PPOMController_cdnBaseUrl, _PPOMController_providerRequestLimit, _PPOMController_providerRequests, _PPOMController_chainId, _PPOMController_securityAlertsEnabled, _PPOMController_providerRequestsCount, _PPOMController_blockaidPublicKey, _PPOMController_ppomInitialised, _PPOMController_nativeCrypto, _PPOMController_initialisePPOM, _PPOMController_resetToInactiveState, _PPOMController_onNetworkChange, _PPOMController_onPreferenceChange, _PPOMController_registerMessageHandlers, _PPOMController_subscribeMessageEvents, _PPOMController_resetPPOM, _PPOMController_initPPOMIfRequired, _PPOMController_updateVersionInfo, _PPOMController_checkFilePresentInStorage, _PPOMController_getAllFiles, _PPOMController_getFile, _PPOMController_getAPIResponse, _PPOMController_fetchVersionInfo, _PPOMController_fetchBlob, _PPOMController_jsonRpcRequest, _PPOMController_getPPOM;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PPOMController = exports.NETWORK_CACHE_DURATION = void 0;
const base_controller_1 = require("@metamask/base-controller");
const controller_utils_1 = require("@metamask/controller-utils");
const rpc_errors_1 = require("@metamask/rpc-errors");
const await_semaphore_1 = require("await-semaphore");
const ppom_storage_1 = require("./ppom-storage");
const util_1 = require("./util");
const PROVIDER_REQUEST_LIMIT = 300;
exports.NETWORK_CACHE_DURATION = 1000 * 60 * 60 * 24 * 7;
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
class PPOMController extends base_controller_1.BaseController {
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
    constructor({ chainId, messenger, provider, storageBackend, securityAlertsEnabled, onPreferencesChange, ppomProvider, cdnBaseUrl, providerRequestLimit, state, blockaidPublicKey, nativeCrypto, }) {
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
        _PPOMController_instances.add(this);
        _PPOMController_ppom.set(this, void 0);
        _PPOMController_provider.set(this, void 0);
        _PPOMController_storage.set(this, void 0);
        /*
         * This mutex is used to prevent concurrent usage of the PPOM instance
         * and protect the PPOM instance from being used while it is being initialized/updated
         */
        _PPOMController_ppomMutex.set(this, void 0);
        _PPOMController_ppomProvider.set(this, void 0);
        // base URL of the CDN
        _PPOMController_cdnBaseUrl.set(this, void 0);
        // Limit of number of requests ppom can send to the provider per transaction
        _PPOMController_providerRequestLimit.set(this, void 0);
        // Number of requests sent to provider by ppom for current transaction
        _PPOMController_providerRequests.set(this, 0);
        // id of current chain selected
        _PPOMController_chainId.set(this, void 0);
        // true if user has enabled preference for blockaid security check
        _PPOMController_securityAlertsEnabled.set(this, void 0);
        // Map of count of each provider request call
        _PPOMController_providerRequestsCount.set(this, {});
        _PPOMController_blockaidPublicKey.set(this, void 0);
        _PPOMController_ppomInitialised.set(this, false);
        _PPOMController_nativeCrypto.set(this, undefined);
        __classPrivateFieldSet(this, _PPOMController_chainId, (0, util_1.addHexPrefix)(chainId), "f");
        __classPrivateFieldSet(this, _PPOMController_provider, provider, "f");
        __classPrivateFieldSet(this, _PPOMController_ppomProvider, ppomProvider, "f");
        __classPrivateFieldSet(this, _PPOMController_storage, new ppom_storage_1.PPOMStorage({
            storageBackend,
            readMetadata: () => {
                return [...this.state.storageMetadata];
            },
            writeMetadata: (metadata) => {
                this.update((draftState) => {
                    draftState.storageMetadata = metadata;
                });
            },
        }), "f");
        __classPrivateFieldSet(this, _PPOMController_ppomMutex, new await_semaphore_1.Mutex(), "f");
        __classPrivateFieldSet(this, _PPOMController_cdnBaseUrl, cdnBaseUrl, "f");
        __classPrivateFieldSet(this, _PPOMController_providerRequestLimit, providerRequestLimit ?? PROVIDER_REQUEST_LIMIT, "f");
        __classPrivateFieldSet(this, _PPOMController_securityAlertsEnabled, securityAlertsEnabled, "f");
        __classPrivateFieldSet(this, _PPOMController_blockaidPublicKey, blockaidPublicKey, "f");
        __classPrivateFieldSet(this, _PPOMController_nativeCrypto, nativeCrypto, "f");
        // enable / disable PPOM validations as user changes preferences
        onPreferencesChange(__classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_onPreferenceChange).bind(this));
        // register message handlers
        __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_registerMessageHandlers).call(this);
        // subscribe to events
        __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_subscribeMessageEvents).call(this);
    }
    /**
     * Use the PPOM.
     * This function receives a callback that will be called with the PPOM.
     *
     * @param callback - Callback to be invoked with PPOM.
     */
    async usePPOM(callback) {
        if (!__classPrivateFieldGet(this, _PPOMController_securityAlertsEnabled, "f")) {
            throw Error('User has securityAlertsEnabled set to false');
        }
        if (!(0, util_1.blockaidValidationSupportedForNetwork)(__classPrivateFieldGet(this, _PPOMController_chainId, "f"))) {
            throw Error(`Blockaid validation not available on network with chainId: ${__classPrivateFieldGet(this, _PPOMController_chainId, "f")}`);
        }
        return await __classPrivateFieldGet(this, _PPOMController_ppomMutex, "f").use(async () => {
            await __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_initPPOMIfRequired).call(this);
            __classPrivateFieldSet(this, _PPOMController_providerRequests, 0, "f");
            __classPrivateFieldSet(this, _PPOMController_providerRequestsCount, {}, "f");
            // `this.#ppom` is defined in `#initPPOMIfRequired`
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const result = await callback(__classPrivateFieldGet(this, _PPOMController_ppom, "f"));
            return {
                ...result,
                // we are destructuring the object below as this will be used outside the controller
                // we want to avoid possibility of outside code changing an instance variable.
                providerRequestsCount: { ...__classPrivateFieldGet(this, _PPOMController_providerRequestsCount, "f") },
            };
        });
    }
}
exports.PPOMController = PPOMController;
_PPOMController_ppom = new WeakMap(), _PPOMController_provider = new WeakMap(), _PPOMController_storage = new WeakMap(), _PPOMController_ppomMutex = new WeakMap(), _PPOMController_ppomProvider = new WeakMap(), _PPOMController_cdnBaseUrl = new WeakMap(), _PPOMController_providerRequestLimit = new WeakMap(), _PPOMController_providerRequests = new WeakMap(), _PPOMController_chainId = new WeakMap(), _PPOMController_securityAlertsEnabled = new WeakMap(), _PPOMController_providerRequestsCount = new WeakMap(), _PPOMController_blockaidPublicKey = new WeakMap(), _PPOMController_ppomInitialised = new WeakMap(), _PPOMController_nativeCrypto = new WeakMap(), _PPOMController_instances = new WeakSet(), _PPOMController_initialisePPOM = 
/*
 * Initialise PPOM loading wasm file.
 * This is done only if user has enabled preference for PPOM Validation.
 * Initialisation is done as soon as controller is constructed
 * or as user enables preference for blockaid validation.
 */
async function _PPOMController_initialisePPOM() {
    if (__classPrivateFieldGet(this, _PPOMController_securityAlertsEnabled, "f") && !__classPrivateFieldGet(this, _PPOMController_ppomInitialised, "f")) {
        const { ppomInit } = __classPrivateFieldGet(this, _PPOMController_ppomProvider, "f");
        await ppomInit('./ppom_bg.wasm');
        __classPrivateFieldSet(this, _PPOMController_ppomInitialised, true, "f");
    }
}, _PPOMController_resetToInactiveState = function _PPOMController_resetToInactiveState() {
    __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_resetPPOM).call(this).catch((error) => {
        console.error(`Error in resetting ppom: ${error.message}`);
    });
    const { storageMetadata } = this.state;
    this.update((draftState) => {
        draftState.versionInfo = [];
        draftState.storageMetadata = [];
    });
    __classPrivateFieldGet(this, _PPOMController_storage, "f").deleteAllFiles(storageMetadata).catch((error) => {
        console.error(`Error in deleting files: ${error.message}`);
    });
}, _PPOMController_onNetworkChange = function _PPOMController_onNetworkChange(networkControllerState) {
    const selectedNetworkClient = this.messagingSystem.call('NetworkController:getNetworkClientById', networkControllerState.selectedNetworkClientId);
    const { chainId } = selectedNetworkClient.configuration;
    const id = (0, util_1.addHexPrefix)(chainId);
    if (id === __classPrivateFieldGet(this, _PPOMController_chainId, "f")) {
        return;
    }
    __classPrivateFieldSet(this, _PPOMController_chainId, id, "f");
    __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_resetPPOM).call(this).catch((error) => {
        console.error(`Error in resetting ppom: ${error.message}`);
    });
}, _PPOMController_onPreferenceChange = function _PPOMController_onPreferenceChange(
// TOOD: Replace with `PreferencesState` from `@metamask/preferences-controller`
preferenceControllerState) {
    const blockaidEnabled = preferenceControllerState.securityAlertsEnabled;
    if (blockaidEnabled === __classPrivateFieldGet(this, _PPOMController_securityAlertsEnabled, "f")) {
        return;
    }
    __classPrivateFieldSet(this, _PPOMController_securityAlertsEnabled, blockaidEnabled, "f");
    if (!blockaidEnabled) {
        __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_resetToInactiveState).call(this);
    }
}, _PPOMController_registerMessageHandlers = function _PPOMController_registerMessageHandlers() {
    this.messagingSystem.registerActionHandler(`${controllerName}:usePPOM`, this.usePPOM.bind(this));
}, _PPOMController_subscribeMessageEvents = function _PPOMController_subscribeMessageEvents() {
    const onNetworkChange = __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_onNetworkChange).bind(this);
    this.messagingSystem.subscribe('NetworkController:networkDidChange', onNetworkChange);
}, _PPOMController_resetPPOM = 
/*
 * The function resets PPOM.
 */
async function _PPOMController_resetPPOM() {
    await __classPrivateFieldGet(this, _PPOMController_ppomMutex, "f").use(async () => {
        if (__classPrivateFieldGet(this, _PPOMController_ppom, "f")) {
            __classPrivateFieldGet(this, _PPOMController_ppom, "f").free();
            __classPrivateFieldSet(this, _PPOMController_ppom, undefined, "f");
        }
    });
}, _PPOMController_initPPOMIfRequired = 
/*
 * The function will initialise PPOM for the network if required.
 */
async function _PPOMController_initPPOMIfRequired() {
    const versionInfoUpdated = await __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_updateVersionInfo).call(this);
    if (__classPrivateFieldGet(this, _PPOMController_ppom, "f") === undefined || versionInfoUpdated) {
        __classPrivateFieldSet(this, _PPOMController_ppom, await __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_getPPOM).call(this), "f");
        __classPrivateFieldGet(this, _PPOMController_storage, "f").syncMetadata(this.state.versionInfo).catch((exp) => {
            console.error(`Error while trying to sync metadata: ${exp.message}`);
        });
    }
}, _PPOMController_updateVersionInfo = 
/*
 * Fetch the version info from the CDN and update the version info in state.
 * Function returns true if update is available for versionInfo.
 */
async function _PPOMController_updateVersionInfo() {
    const versionInfo = await __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_fetchVersionInfo).call(this);
    if (versionInfo) {
        this.update((draftState) => {
            draftState.versionInfo = versionInfo;
        });
        return true;
    }
    return false;
}, _PPOMController_checkFilePresentInStorage = function _PPOMController_checkFilePresentInStorage(storageMetadata, fileVersionInfo) {
    return storageMetadata.find((file) => file.name === fileVersionInfo.name &&
        file.chainId === fileVersionInfo.chainId &&
        file.version === fileVersionInfo.version &&
        file.checksum === fileVersionInfo.checksum);
}, _PPOMController_getAllFiles = 
/*
 *
 * Get all files listed in versionInfo passed.
 */
async function _PPOMController_getAllFiles(versionInfo) {
    const files = await Promise.all(versionInfo.map(async (file) => {
        let data;
        try {
            data = await __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_getFile).call(this, file);
        }
        catch (exp) {
            console.error(`Error in getting file ${file.filePath}: ${exp.message}`);
        }
        if (data) {
            return [file.name, new Uint8Array(data)];
        }
        return undefined;
    }));
    return files?.filter((data) => data?.[1] !== undefined);
}, _PPOMController_getFile = 
/*
 * Gets a single file from CDN and write to the storage.
 */
async function _PPOMController_getFile(fileVersionInfo) {
    const { storageMetadata } = this.state;
    // do not fetch file if the storage version is latest
    if (__classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_checkFilePresentInStorage).call(this, storageMetadata, fileVersionInfo)) {
        try {
            return await __classPrivateFieldGet(this, _PPOMController_storage, "f").readFile(fileVersionInfo.name, fileVersionInfo.chainId);
        }
        catch (error) {
            console.error(`Error in reading file: ${error.message}`);
        }
    }
    // validate file path for valid characters
    (0, util_1.checkFilePath)(fileVersionInfo.filePath);
    const fileUrl = (0, util_1.constructURLHref)(__classPrivateFieldGet(this, _PPOMController_cdnBaseUrl, "f"), fileVersionInfo.filePath);
    const fileData = await __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_fetchBlob).call(this, fileUrl);
    await (0, util_1.validateSignature)(fileData, fileVersionInfo.hashSignature, __classPrivateFieldGet(this, _PPOMController_blockaidPublicKey, "f"), fileVersionInfo.filePath, __classPrivateFieldGet(this, _PPOMController_nativeCrypto, "f"));
    await __classPrivateFieldGet(this, _PPOMController_storage, "f")
        .writeFile({
        data: fileData,
        ...fileVersionInfo,
    })
        .catch((error) => {
        console.error(`Error in writing file: ${error.message}`);
    });
    return fileData;
}, _PPOMController_getAPIResponse = 
/*
 * Generic method to fetch file from CDN.
 */
async function _PPOMController_getAPIResponse(url, options = {}, method = 'GET') {
    const response = await (0, controller_utils_1.safelyExecute)(async () => (0, controller_utils_1.timeoutFetch)(url, {
        method,
        cache: 'no-cache',
        redirect: 'error',
        ...options,
    }, 10000), true);
    const cached = response?.status === 304;
    if (!response?.status || response?.status < 200 || response?.status > 399) {
        throw new Error(`Failed to fetch file with url: ${url}`);
    }
    return { cached, response };
}, _PPOMController_fetchVersionInfo = 
/*
 * Fetch the version info from the PPOM cdn.
 */
async function _PPOMController_fetchVersionInfo() {
    const url = (0, util_1.constructURLHref)(__classPrivateFieldGet(this, _PPOMController_cdnBaseUrl, "f"), PPOM_VERSION_FILE_NAME);
    const { cached, response } = await __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_getAPIResponse).call(this, url, {
        headers: versionInfoFileHeaders,
    });
    if (cached && this.state.versionInfo?.length) {
        return undefined;
    }
    return response.json();
}, _PPOMController_fetchBlob = 
/*
 * Fetch the blob file from the PPOM cdn.
 */
async function _PPOMController_fetchBlob(url) {
    const { response } = await __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_getAPIResponse).call(this, url);
    return await response.arrayBuffer();
}, _PPOMController_jsonRpcRequest = 
/*
 * Send a JSON RPC request to the provider.
 * This method is used by the PPOM to make requests to the provider.
 */
async function _PPOMController_jsonRpcRequest(method, params) {
    // Resolve with error if number of requests from PPOM to provider exceeds the limit for the current transaction
    if (__classPrivateFieldGet(this, _PPOMController_providerRequests, "f") > __classPrivateFieldGet(this, _PPOMController_providerRequestLimit, "f")) {
        const limitExceededError = util_1.PROVIDER_ERRORS.limitExceeded();
        throw new rpc_errors_1.JsonRpcError(limitExceededError.code, limitExceededError.message);
    }
    __classPrivateFieldSet(this, _PPOMController_providerRequests, __classPrivateFieldGet(this, _PPOMController_providerRequests, "f") + 1, "f");
    // Resolve with error if the provider method called by PPOM is not allowed for PPOM
    if (!ALLOWED_PROVIDER_CALLS.includes(method)) {
        const methodNotSupportedError = util_1.PROVIDER_ERRORS.methodNotSupported();
        throw new rpc_errors_1.JsonRpcError(methodNotSupportedError.code, methodNotSupportedError.message);
    }
    __classPrivateFieldGet(this, _PPOMController_providerRequestsCount, "f")[method] = __classPrivateFieldGet(this, _PPOMController_providerRequestsCount, "f")[method]
        ? Number(__classPrivateFieldGet(this, _PPOMController_providerRequestsCount, "f")[method]) + 1
        : 1;
    return await __classPrivateFieldGet(this, _PPOMController_provider, "f").request((0, util_1.createPayload)(method, params));
}, _PPOMController_getPPOM = 
/*
 * This function can be called to initialise PPOM or re-initilise it,
 * when new files are required to be passed to it.
 *
 * It will load the data files from storage and pass data files and wasm file to ppom.
 */
async function _PPOMController_getPPOM() {
    // PPOM initialisation in contructor fails for react native
    // thus it is added here to prevent validation from failing.
    await __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_initialisePPOM).call(this);
    const versionInfo = this.state.versionInfo.filter(({ chainId: id }) => id === __classPrivateFieldGet(this, _PPOMController_chainId, "f"));
    // The following code throw error if no data files are found for the chainId.
    // This check has been put in place after suggestion of security team.
    // If we want to disable ppom validation on all instances of Metamask,
    // this can be achieved by returning empty data from version file.
    if (versionInfo?.length === undefined || versionInfo?.length === 0) {
        throw new Error(`Aborting initialising PPOM as no files are found for the network with chainId: ${__classPrivateFieldGet(this, _PPOMController_chainId, "f")}`);
    }
    // Get all the files for  the chainId
    const files = await __classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_getAllFiles).call(this, versionInfo);
    if (files?.length !== versionInfo?.length) {
        throw new Error(`Aborting initialising PPOM as not all files could not be downloaded for the network with chainId: ${__classPrivateFieldGet(this, _PPOMController_chainId, "f")}`);
    }
    if (__classPrivateFieldGet(this, _PPOMController_ppom, "f")) {
        __classPrivateFieldGet(this, _PPOMController_ppom, "f").free();
    }
    const { PPOM } = __classPrivateFieldGet(this, _PPOMController_ppomProvider, "f");
    return PPOM.new(__classPrivateFieldGet(this, _PPOMController_instances, "m", _PPOMController_jsonRpcRequest).bind(this), files);
};
//# sourceMappingURL=ppom-controller.js.map