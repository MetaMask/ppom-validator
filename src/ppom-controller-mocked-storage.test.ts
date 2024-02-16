import * as Utils from './util';
import { buildFetchSpy, buildPPOMController } from '../test/test-utils';

jest.mock('@metamask/controller-utils', () => {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    ...jest.requireActual('@metamask/controller-utils'),
  };
});

jest.mock('./ppom-storage', () => {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    ...jest.requireActual('../test/mock-ppom-storage'),
  };
});

describe('PPOMController', () => {
  beforeEach(() => {
    jest
      .spyOn(Utils, 'validateSignature')
      .mockImplementation(async () => Promise.resolve());
  });

  describe('onPreferencesChange', () => {
    it('should not throw error storage deleteAll fails', async () => {
      buildFetchSpy();
      let callBack: any;
      buildPPOMController({
        onPreferencesChange: (func: any) => {
          callBack = func;
        },
      });

      expect(async () => {
        callBack({ securityAlertsEnabled: false });
        callBack({ securityAlertsEnabled: true });
      }).not.toThrow();
    });
  });

  describe('usePPOM', () => {
    it('should not throw error if sync metadata fails', async () => {
      buildFetchSpy();
      const { ppomController } = buildPPOMController();

      await ppomController.usePPOM(async (ppom: any) => {
        expect(ppom).toBeDefined();
        return Promise.resolve();
      });
    });
  });
});
