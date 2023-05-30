export class PPOM {
  free(): void;

  constructor(jsonRpcCallback: any, data: Uint8Array);

  test(): Promise<void>;

  validateJsonRpc(request: any): Promise<any>;
}

type InitInput = any;

type InitOutput = any;

export function ppomInit(
  moduleOrPath: InitInput | Promise<InitInput>,
): Promise<InitOutput>;
