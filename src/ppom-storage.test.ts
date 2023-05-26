import { StorageBackend, PPOMStorage, StorageKey } from './ppom-storage';

Object.defineProperty(globalThis, 'crypto', {
  value: {
    subtle: {
      digest: () => new ArrayBuffer(12),
    },
  },
});

class MockStorageBackend implements StorageBackend {
  data: undefined;

  constructor(data?: any) {
    this.data = data;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async read(key: StorageKey): Promise<any> {
    return new Promise((resolve) => {
      resolve(new ArrayBuffer(12));
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async write(key: StorageKey, data: any): Promise<void> {
    return new Promise((resolve) => {
      resolve();
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async delete(key: StorageKey): Promise<void> {
    return new Promise((resolve) => {
      resolve();
    });
  }

  async dir(): Promise<StorageKey[]> {
    return new Promise((resolve) => {
      resolve([]);
    });
  }
}

describe('PPOMStorage', () => {
  it('should get initialised', () => {
    const ppomStorage = new PPOMStorage({
      storageBackend: new MockStorageBackend(),
      readMetadata: () => [],
      writeMetadata: () => undefined,
    });
    expect(ppomStorage).toBeDefined();
  });

  describe('PPOMStorage:readFile', () => {
    it('should return data if it matches checksum', async () => {
      const fileData = {
        chainId: '1',
        name: 'dummy',
        checksum: '000000000000000000000000',
        version: '0',
      };
      const ppomStorage = new PPOMStorage({
        storageBackend: new MockStorageBackend(fileData),
        readMetadata: () => [fileData],
        writeMetadata: () => undefined,
      });
      const data = await ppomStorage.readFile('dummy', '1');
      expect(data).toStrictEqual(new ArrayBuffer(12));
    });

    it('should throw error if checksum does not matches', async () => {
      const fileData = {
        chainId: '1',
        name: 'dummy',
        checksum: '12',
        version: '0',
      };
      const ppomStorage = new PPOMStorage({
        storageBackend: new MockStorageBackend(fileData),
        readMetadata: () => [fileData],
        writeMetadata: () => undefined,
      });
      await expect(async () => {
        await ppomStorage.readFile('dummy', '1');
      }).rejects.toThrow('Checksum mismatch');
    });

    it('should throw error if filemetadata if not found', async () => {
      const fileData = {
        chainId: '1',
        name: 'dummy',
        checksum: '12',
        version: '0',
      };
      const ppomStorage = new PPOMStorage({
        storageBackend: new MockStorageBackend(fileData),
        readMetadata: () => [],
        writeMetadata: () => undefined,
      });
      await expect(async () => {
        await ppomStorage.readFile('dummy', '1');
      }).rejects.toThrow(
        'File metadata not found for File (dummy, 1) not found',
      );
    });

    it('should throw error if file is not found in storage', async () => {
      const fileData = {
        chainId: '1',
        name: 'dummy',
        checksum: '12',
        version: '0',
      };
      const ppomStorage = new PPOMStorage({
        storageBackend: {
          read: async () => Promise.resolve(),
        } as unknown as StorageBackend,
        readMetadata: () => [fileData],
        writeMetadata: () => undefined,
      });
      await expect(async () => {
        await ppomStorage.readFile('dummy', '1');
      }).rejects.toThrow('Storage File (dummy, 1) not found');
    });
  });

  describe('PPOMStorage:writeFile', () => {
    it('should throw error if checksum does not match', async () => {
      const ppomStorage = new PPOMStorage({
        storageBackend: new MockStorageBackend(),
        readMetadata: () => [],
        writeMetadata: () => undefined,
      });
      await expect(async () => {
        await ppomStorage.writeFile({
          data: new ArrayBuffer(1),
          name: 'dummy',
          chainId: '1',
          version: '0',
          checksum: '12',
        });
      }).rejects.toThrow('Checksum mismatch');
    });

    it('should call storageBackend.write if checksum matches', async () => {
      const mockWrite = jest.fn().mockResolvedValue('test');
      const ppomStorage = new PPOMStorage({
        storageBackend: {
          write: mockWrite,
        } as unknown as StorageBackend,
        readMetadata: () => [],
        writeMetadata: () => undefined,
      });
      await ppomStorage.writeFile({
        data: new ArrayBuffer(1),
        name: 'dummy',
        chainId: '1',
        version: '0',
        checksum: '000000000000000000000000',
      });
      expect(mockWrite).toHaveBeenCalledTimes(1);
    });

    it('should invoke writeMetadata if filemetadata exists and checksum matches', async () => {
      const fileData = {
        chainId: '1',
        name: 'dummy',
        checksum: '12',
        version: '1',
      };
      const mockWriteMetadata = jest.fn();
      const ppomStorage = new PPOMStorage({
        storageBackend: new MockStorageBackend(),
        readMetadata: () => [fileData],
        writeMetadata: mockWriteMetadata,
      });
      await ppomStorage.writeFile({
        data: new ArrayBuffer(1),
        name: 'dummy',
        chainId: '1',
        version: '0',
        checksum: '000000000000000000000000',
      });
      expect(mockWriteMetadata).toHaveBeenCalledWith([
        {
          name: 'dummy',
          chainId: '1',
          version: '0',
          checksum: '000000000000000000000000',
        },
      ]);
    });

    it('should invoke writeMetadata with data passed if checksum matches', async () => {
      const mockWriteMetadata = jest.fn();
      const ppomStorage = new PPOMStorage({
        storageBackend: new MockStorageBackend(),
        readMetadata: () => [],
        writeMetadata: mockWriteMetadata,
      });
      await ppomStorage.writeFile({
        data: new ArrayBuffer(1),
        name: 'dummy',
        chainId: '1',
        version: '0',
        checksum: '000000000000000000000000',
      });
      expect(mockWriteMetadata).toHaveBeenCalledWith([
        {
          name: 'dummy',
          chainId: '1',
          version: '0',
          checksum: '000000000000000000000000',
        },
      ]);
    });
  });

  describe('PPOMStorage:syncMetadata', () => {
    it('should return metadata of file if updated file is found in storage', async () => {
      const fileData = {
        chainId: '1',
        name: 'dummy',
        checksum: '000000000000000000000000',
        version: '0',
      };
      const mockWriteMetadata = jest.fn();
      const ppomStorage = new PPOMStorage({
        storageBackend: new MockStorageBackend(fileData),
        readMetadata: () => [fileData],
        writeMetadata: mockWriteMetadata,
      });

      const result = await ppomStorage.syncMetadata([fileData]);
      expect(mockWriteMetadata).toHaveBeenCalledWith([
        {
          name: 'dummy',
          chainId: '1',
          version: '0',
          checksum: '000000000000000000000000',
        },
      ]);
      expect(result).toStrictEqual([fileData]);
    });

    it('should not return data if file is not found in storage', async () => {
      const fileData = {
        chainId: '1',
        name: 'dummy',
        checksum: '000000000000000000000000',
        version: '0',
      };
      const mockWriteMetadata = jest.fn();
      const ppomStorage = new PPOMStorage({
        storageBackend: new MockStorageBackend(),
        readMetadata: () => [],
        writeMetadata: mockWriteMetadata,
      });

      const result = await ppomStorage.syncMetadata([fileData]);
      expect(mockWriteMetadata).toHaveBeenCalledWith([]);
      expect(result).toStrictEqual([]);
    });

    it('should not return metadata of file if file version in storage is outdated', async () => {
      const fileData = {
        chainId: '1',
        name: 'dummy',
        checksum: '000000000000000000000000',
        version: '0',
      };
      const storageFileData = { ...fileData, version: '1' };
      const mockWriteMetadata = jest.fn();

      const mockDelete = jest.fn().mockResolvedValue('');

      const ppomStorage = new PPOMStorage({
        storageBackend: {
          dir: async () => Promise.resolve([storageFileData]),
          delete: mockDelete,
        } as unknown as StorageBackend,
        readMetadata: () => [fileData],
        writeMetadata: mockWriteMetadata,
      });

      const result = await ppomStorage.syncMetadata([storageFileData]);
      expect(mockDelete).toHaveBeenCalledWith({ name: 'dummy', chainId: '1' });
      expect(mockWriteMetadata).toHaveBeenCalledWith([]);
      expect(result).toStrictEqual([]);
    });
  });
});
