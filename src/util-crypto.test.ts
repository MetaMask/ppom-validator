import crypto from 'crypto';
import fs from 'fs';

import { validateSignature } from './util';

const TEST_PUBLIC_KEY =
  '821e94d60bf030d7f5c399f751324093363a229acc1aa77cfbd795a0e62ff947';
const INCORRECT_SIGNATURE = 'd56e247e6f5d50a59687c53a2b86d498496351b170004';

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
