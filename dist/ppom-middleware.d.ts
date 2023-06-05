import { PPOMController } from './ppom-controller';
/**
 * Middleware function that handles JSON RPC requests.
 * This function will be called for every JSON RPC request.
 * It will call the PPOM to check if the request is malicious or benign.
 * If the request is benign, it will be forwarded to the next middleware.
 * If the request is malicious or warning, it will trigger the PPOM alert dialog,
 * after the user has confirmed or rejected the request,
 * the request will be forwarded to the next middleware, together with the PPOM response.
 *
 * @param ppomController - Instance of PPOMController.
 * @returns PPOMMiddleware function.
 */
export declare function createPPOMMiddleware(ppomController: PPOMController): (req: any, _res: any, next: () => void) => Promise<void>;
