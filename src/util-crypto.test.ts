import crypto from 'crypto';
import fs from 'fs';

import { validateSignature } from './util';

const TEST_PUBLIC_KEY =
  '066ad3e8af5583385e312c156d238055215d5f25247c1e91055afa756cb98a88';
const INCORRECT_SIGNATURE =
  '66a93a1f6a6c45294333dcf8f32fd0db6961bf842e41e060226cb2ef79d56cddb46279fd2365fd0f9dc2969a4166d4d7bab2262c237ba31d9a67716f0a7db90c123';

Object.defineProperty(globalThis, 'crypto', {
  value: crypto.webcrypto,
  writable: true,
});

// This test case check signature validation using globalThis.crypto

describe('Util', () => {
  describe('validateSignature', () => {
    it('should throw error for incorrect signature', async () => {
      await expect(async () => {
        const blobData = await fs.promises.readFile('./test/stale_tags.bin');
        await validateSignature(
          blobData,
          INCORRECT_SIGNATURE,
          TEST_PUBLIC_KEY,
          'invalid_data_file',
        );
      }).rejects.toThrow(
        'Signature verification failed for file path: invalid_data_file',
      );
    });
  });
});
