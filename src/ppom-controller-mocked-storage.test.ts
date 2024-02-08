import { buildFetchSpy, buildPPOMController } from '../test/test-utils';
import { REFRESH_TIME_INTERVAL } from './ppom-controller';

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

// eslint-disable-next-line jsdoc/require-jsdoc
async function flushPromises() {
  // Wait for promises running in the non-async timer callback to complete.
  // From https://github.com/facebook/jest/issues/2157#issuecomment-897935688
  return new Promise(jest.requireActual('timers').setImmediate);
}

describe('PPOMController', () => {
  describe('onPreferencesChange', () => {
    it('should not throw error storage deleteAll fails', async () => {
      buildFetchSpy(undefined, undefined, 123);
      let callBack: any;
      buildPPOMController({
        onPreferencesChange: (func: any) => {
          callBack = func;
        },
      });
      jest.runOnlyPendingTimers();
      await flushPromises();
      expect(async () => {
        callBack({ securityAlertsEnabled: false });
        callBack({ securityAlertsEnabled: true });
        jest.advanceTimersByTime(REFRESH_TIME_INTERVAL);
        jest.runOnlyPendingTimers();
        await flushPromises();
      }).not.toThrow();
    });
  });
});
