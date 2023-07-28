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

    it('should validate correct signature - failing', async () => {
      expect(async () => {
        const blobData = await fs.promises.readFile('./test/stale_tags.bin');
        await validateSignature(
          blobData,
          'd56e247e6f5d5033c36ae65f70aa7b0c4a42385eeef63da3af1ca8da28dce0788f45491771acea46fcb1242297231ff9aa59687c53a2b86d498496351b170004',
          '821e94d60bf030d7f5c399f751324093363a229acc1aa77cfbd795a0e62ff947',
          'valid_data_file',
        );
      }).not.toThrow(
        'Signature verification failed for file path: valid_data_file',
      );
    });
  });
});
