import fs from 'fs';

import { addHexPrefix, constructURLHref, validateSignature } from './util';

const TEST_PUBLIC_KEY =
  '066ad3e8af5583385e312c156d238055215d5f25247c1e91055afa756cb98a88';
const CORRECT_SIGNATURE =
  '66a93a1f6a6c45294333dcf8f32fd0db6961bf842e41e060226cb2ef79d56cddb46279fd2365fd0f9dc2969a4166d4d7bab2262c237ba31d9a67716f0a7db90c';
const INCORRECT_SIGNATURE =
  '66a93a1f6a6c45294333dcf8f32fd0db6961bf842e41e060226cb2ef79d56cddb46279fd2365fd0f9dc2969a4166d4d7bab2262c237ba31d9a67716f0a7db90c123';

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

    it('should validate correct signature - failing', async () => {
      expect(async () => {
        const blobData = await fs.promises.readFile('./test/stale_tags.bin');
        await validateSignature(
          blobData,
          CORRECT_SIGNATURE,
          TEST_PUBLIC_KEY,
          'valid_data_file',
        );
      }).not.toThrow(
        'Signature verification failed for file path: valid_data_file',
      );
    });
  });
  describe('constructURLHref', () => {
    it('should create correct URL', () => {
      expect(constructURLHref('https://www.base.com', 'test')).toBe(
        'https://www.base.com/test',
      );
      expect(constructURLHref('https://www.base.com', '/test')).toBe(
        'https://www.base.com/test',
      );
      expect(constructURLHref('https://www.base.com/', 'test')).toBe(
        'https://www.base.com/test',
      );
      expect(constructURLHref('https://www.base.com/', 'test')).toBe(
        'https://www.base.com/test',
      );
      expect(constructURLHref('www.base.com/', 'test')).toBe(
        'https://www.base.com/test',
      );
    });
  });
  describe('addHexPrefix', () => {
    it('should add prefix', () => {
      expect(addHexPrefix('123')).toBe('0x123');
      expect(addHexPrefix('0X123')).toBe('0x123');
      expect(addHexPrefix('0x123')).toBe('0x123');
    });
  });
});
