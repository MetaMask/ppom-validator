import fs from 'fs';

import { validateSignature } from './util';

const TEST_PUBLIC_KEY =
  '066ad3e8af5583385e312c156d238055215d5f25247c1e91055afa756cb98a88';

describe('Util', () => {
  describe('validateSignature', () => {
    it('should throw error for incorrect signature', async () => {
      await expect(async () => {
        const blobData = await fs.promises.readFile('./test/stale_tags.bin');
        await validateSignature(
          blobData,
          'd56e247e6f5d50a59687c53a2b86d498496351b170004',
          TEST_PUBLIC_KEY,
          'invalid_data_file',
        );
      }).rejects.toThrow(
        'Signature verification failed for file path: invalid_data_file',
      );
    });

    it('should validate correct signature', async () => {
      expect(async () => {
        const blobData = await fs.promises.readFile('./test/0.0.2');
        await validateSignature(
          blobData,
          'f8b1e03065036fc344c01c172293ed70ba772c56f9e8a2bea8dac0189d6d71b0189c8aa94ed82537cf5deddbbaeaadefbffbbb7a8bfd91fe185b423e6c01190b',
          '066ad3e8af5583385e312c156d238055215d5f25247c1e91055afa756cb98a88',
          'valid_data_file',
        );
      }).not.toThrow(
        'Signature verification failed for file path: valid_data_file',
      );
    });

    it('should validate correct signature - failing', async () => {
      await expect(async () => {
        const blobData = await fs.promises.readFile('./test/stale_tags.bin');
        await validateSignature(
          blobData,
          'd56e247e6f5d5033c36ae65f70aa7b0c4a42385eeef63da3af1ca8da28dce0788f45491771acea46fcb1242297231ff9aa59687c53a2b86d498496351b170004',
          TEST_PUBLIC_KEY,
          'valid_data_file',
        );
      }).rejects.toThrow(
        'Signature verification failed for file path: valid_data_file',
      );
    });
  });
});
