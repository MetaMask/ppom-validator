import { generateKeyPair, sign } from '@metamask/cryptography/ed25519';
import { bytesToHex, remove0x } from '@metamask/utils';

import { addHexPrefix, constructURLHref, validateSignature } from './util';

Object.defineProperty(globalThis, 'crypto', {
  // eslint-disable-next-line
  value: require('crypto').webcrypto,
  writable: true,
});

const DATA = new TextEncoder().encode('ppom data file');

/**
 * Hash the data the same way the validator does, and sign the hex string.
 *
 * @param privateKey - The Ed25519 private key.
 * @param data - The data to hash and sign.
 * @returns The hex encoded signature.
 */
const signHash = async (
  privateKey: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
) => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  const hash = remove0x(bytesToHex(new Uint8Array(digest)));
  const signature = await sign(privateKey, new TextEncoder().encode(hash));
  return remove0x(bytesToHex(signature));
};

describe('Util', () => {
  describe('validateSignature', () => {
    it('resolves for a valid signature', async () => {
      const { privateKey, publicKey } = await generateKeyPair();
      const signature = await signHash(privateKey, DATA);

      expect(
        await validateSignature(
          DATA,
          signature,
          remove0x(bytesToHex(publicKey)),
          'valid_data_file',
        ),
      ).toBeUndefined();
    });

    it('throws for a signature from a different key', async () => {
      const { publicKey } = await generateKeyPair();
      const { privateKey: otherPrivateKey } = await generateKeyPair();
      const signature = await signHash(otherPrivateKey, DATA);

      await expect(
        validateSignature(
          DATA,
          signature,
          remove0x(bytesToHex(publicKey)),
          'invalid_data_file',
        ),
      ).rejects.toThrow(
        'Signature verification failed for file path: invalid_data_file',
      );
    });

    it('throws for a signature over different data', async () => {
      const { privateKey, publicKey } = await generateKeyPair();
      const signature = await signHash(
        privateKey,
        new TextEncoder().encode('other data'),
      );

      await expect(
        validateSignature(
          DATA,
          signature,
          remove0x(bytesToHex(publicKey)),
          'invalid_data_file',
        ),
      ).rejects.toThrow(
        'Signature verification failed for file path: invalid_data_file',
      );
    });

    it('throws for a signature with an invalid length', async () => {
      const { publicKey } = await generateKeyPair();

      await expect(
        validateSignature(
          DATA,
          'abcd',
          remove0x(bytesToHex(publicKey)),
          'invalid_data_file',
        ),
      ).rejects.toThrow('Invalid signature length');
    });

    it('uses nativeCrypto to hash if passed', async () => {
      const { privateKey, publicKey } = await generateKeyPair();
      const signature = remove0x(
        bytesToHex(await sign(privateKey, new TextEncoder().encode('abc'))),
      );
      const nativeDigest = jest.fn().mockReturnValue('abc');
      const nativeCrypto = {
        createHash: () => ({
          update: () => ({
            digest: nativeDigest,
          }),
        }),
      };

      await validateSignature(
        DATA,
        signature,
        remove0x(bytesToHex(publicKey)),
        'valid_data_file',
        nativeCrypto,
      );

      expect(nativeDigest).toHaveBeenCalledTimes(1);
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
      expect(addHexPrefix('123')).toBe('0x7b');
      expect(addHexPrefix('0X123')).toBe('0x123');
      expect(addHexPrefix('0x123')).toBe('0x123');
    });
  });
});
