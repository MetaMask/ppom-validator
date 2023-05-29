import { StorageBackend, PPOMStorage, StorageKey } from './ppom-storage';

Object.defineProperty(globalThis, 'crypto', {
  value: {
    subtle: {
      digest: () => new ArrayBuffer(12),
    },
  },
});

const checksum =
  '409a7f83ac6b31dc8c77e3ec18038f209bd2f545e0f4177c2e2381aa4e067b49';
class MockStorageBackend implements StorageBackend {
  data: undefined;

  constructor(data?: any) {
    this.data = data;
  }

  async read(_key: StorageKey): Promise<any> {
    return new Promise((resolve) => {
      resolve(this.data);
    });
  }

  async write(_key: StorageKey, _data: any): Promise<void> {
    return new Promise((resolve) => {
      resolve();
    });
  }

  async delete(_key: StorageKey): Promise<void> {
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

  describe('readFile', () => {
    it('should return data if it matches checksum', async () => {
      const fileData = {
        chainId: '1',
        name: 'dummy',
        checksum,
        version: '0',
      };
      const ppomStorage = new PPOMStorage({
        storageBackend: new MockStorageBackend(new ArrayBuffer(123)),
        readMetadata: () => [fileData],
        writeMetadata: () => undefined,
      });
      const data = await ppomStorage.readFile('dummy', '1');
      expect(data).toStrictEqual(new ArrayBuffer(123));
    });

    it('should throw error if checksum does not matches', async () => {
      const fileData = {
        chainId: '1',
        name: 'dummy',
        version: '0',
      };
      const ppomStorage = new PPOMStorage({
        storageBackend: new MockStorageBackend(new ArrayBuffer(123)),
        readMetadata: () => [{ ...fileData, checksum: '000' }],
        writeMetadata: () => undefined,
      });
      await expect(async () => {
        await ppomStorage.readFile('dummy', '1');
      }).rejects.toThrow('Checksum mismatch');
    });

    it('should throw error if filemetadata if not found', async () => {
      const ppomStorage = new PPOMStorage({
        storageBackend: new MockStorageBackend(new ArrayBuffer(123)),
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
        checksum,
        version: '0',
      };
      const ppomStorage = new PPOMStorage({
        storageBackend: new MockStorageBackend(),
        readMetadata: () => [fileData],
        writeMetadata: () => undefined,
      });
      await expect(async () => {
        await ppomStorage.readFile('dummy', '1');
      }).rejects.toThrow('Storage File (dummy, 1) not found');
    });
  });

  describe('writeFile', () => {
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
          checksum,
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
        data: new ArrayBuffer(123),
        name: 'dummy',
        chainId: '1',
        version: '0',
        checksum,
      });
      expect(mockWrite).toHaveBeenCalledTimes(1);
    });

    it('should invoke writeMetadata if filemetadata exists and checksum matches', async () => {
      const fileData = {
        chainId: '1',
        name: 'dummy',
        checksum,
        version: '0',
      };
      const mockWriteMetadata = jest.fn();
      const ppomStorage = new PPOMStorage({
        storageBackend: new MockStorageBackend(),
        readMetadata: () => [fileData],
        writeMetadata: mockWriteMetadata,
      });
      await ppomStorage.writeFile({
        data: new ArrayBuffer(123),
        name: 'dummy',
        chainId: '1',
        version: '0',
        checksum,
      });
      expect(mockWriteMetadata).toHaveBeenCalledWith([
        {
          name: 'dummy',
          chainId: '1',
          version: '0',
          checksum,
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
        data: new ArrayBuffer(123),
        name: 'dummy',
        chainId: '1',
        version: '0',
        checksum,
      });
      expect(mockWriteMetadata).toHaveBeenCalledWith([
        {
          name: 'dummy',
          chainId: '1',
          version: '0',
          checksum,
        },
      ]);
    });
  });

  describe('PPOMStorage:syncMetadata', () => {
    it('should return metadata of file if updated file is found in storage', async () => {
      const fileData = {
        chainId: '1',
        name: 'dummy',
        checksum,
        version: '0',
      };
      const mockWriteMetadata = jest.fn();
      const ppomStorage = new PPOMStorage({
        storageBackend: new MockStorageBackend(new ArrayBuffer(123)),
        readMetadata: () => [fileData],
        writeMetadata: mockWriteMetadata,
      });

      const result = await ppomStorage.syncMetadata([fileData]);
      expect(mockWriteMetadata).toHaveBeenCalledWith([
        {
          name: 'dummy',
          chainId: '1',
          version: '0',
          checksum,
        },
      ]);
      expect(result).toStrictEqual([fileData]);
    });

    it('should not return data if file is not found in storage', async () => {
      const fileData = {
        chainId: '1',
        name: 'dummy',
        checksum,
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
        checksum,
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
