/**
 */
export declare function main(): void;
/**
 */
export declare class PPOM {
    static __wrap(ptr: any): any;
    __destroy_into_raw(): any;
    free(): void;
    /**
     * @param {Function} json_rpc_callback
     * @param {any[]} files
     */
    constructor(json_rpc_callback: any, files: any);
    /**
     * @returns {Promise<void>}
     */
    test(): any;
    /**
     * @param {any} request
     * @returns {Promise<any>}
     */
    validateJsonRpc(request: any): any;
}
declare function initSync(module: any): any;
declare function init(input: any): Promise<any>;
export { initSync, init as ppomInit };
