import { PPOMStorage, StorageKey } from './ppom-storage';

Object.defineProperty(globalThis, 'crypto', {
  value: {
    subtle: {
      digest: () => new ArrayBuffer(12),
    },
  },
});

const checksum =
  '409a7f83ac6b31dc8c77e3ec18038f209bd2f545e0f4177c2e2381aa4e067b49';

const buildStorageBackend = (obj = {}) => {
  return {
    read: async (_key: StorageKey): Promise<any> => Promise.resolve(),
    write: async (_key: StorageKey, _data: any): Promise<void> =>
      Promise.resolve(),
    delete: async (_key: StorageKey): Promise<void> => Promise.resolve(),
    dir: async (): Promise<StorageKey[]> => Promise.resolve([]),
    ...obj,
  };
};

const simpleStorageBackend = buildStorageBackend();

const storageBackendReturningData = buildStorageBackend({
  read: async (_key: StorageKey): Promise<any> =>
    Promise.resolve(new ArrayBuffer(123)),
});

const DUMMY_NAME = 'dummy';
const DUMMY_CHAINID = '1';

const getFileData = (data = {}) => ({
  chainId: DUMMY_CHAINID,
  name: DUMMY_NAME,
  checksum,
  version: '0',
  ...data,
});

const simpleFileData = getFileData();

describe('PPOMStorage', () => {
  describe('readFile', () => {
    it('should return data if it matches checksum', async () => {
      const ppomStorage = new PPOMStorage({
        storageBackend: storageBackendReturningData,
        readMetadata: () => [simpleFileData],
        writeMetadata: () => undefined,
      });
      const data = await ppomStorage.readFile(DUMMY_NAME, DUMMY_CHAINID);
      expect(data).toStrictEqual(new ArrayBuffer(123));
    });

    it('should throw error if checksum does not matches', async () => {
      const ppomStorage = new PPOMStorage({
        storageBackend: storageBackendReturningData,
        readMetadata: () => [getFileData({ checksum: '000' })],
        writeMetadata: () => undefined,
      });
      await expect(async () => {
        await ppomStorage.readFile(DUMMY_NAME, DUMMY_CHAINID);
      }).rejects.toThrow('Checksum mismatch');
    });

    it('should throw error if filemetadata if not found', async () => {
      const ppomStorage = new PPOMStorage({
        storageBackend: storageBackendReturningData,
        readMetadata: () => [],
        writeMetadata: () => undefined,
      });
      await expect(async () => {
        await ppomStorage.readFile(DUMMY_NAME, DUMMY_CHAINID);
      }).rejects.toThrow(
        `File metadata not found for File (${DUMMY_NAME}, ${DUMMY_CHAINID}) not found`,
      );
    });

    it('should throw error if file is not found in storage', async () => {
      const ppomStorage = new PPOMStorage({
        storageBackend: simpleStorageBackend,
        readMetadata: () => [simpleFileData],
        writeMetadata: () => undefined,
      });
      await expect(async () => {
        await ppomStorage.readFile(DUMMY_NAME, DUMMY_CHAINID);
      }).rejects.toThrow(
        `Storage File (${DUMMY_NAME}, ${DUMMY_CHAINID}) not found`,
      );
    });
  });

  describe('writeFile', () => {
    it('should throw error if checksum does not match', async () => {
      const ppomStorage = new PPOMStorage({
        storageBackend: simpleStorageBackend,
        readMetadata: () => [],
        writeMetadata: () => undefined,
      });
      await expect(async () => {
        await ppomStorage.writeFile({
          data: new ArrayBuffer(1),
          ...simpleFileData,
        });
      }).rejects.toThrow('Checksum mismatch');
    });

    it('should call storageBackend.write if checksum matches', async () => {
      const mockWrite = jest.fn().mockResolvedValue('test');
      const ppomStorage = new PPOMStorage({
        storageBackend: buildStorageBackend({ write: mockWrite }),
        readMetadata: () => [],
        writeMetadata: () => undefined,
      });
      await ppomStorage.writeFile({
        data: new ArrayBuffer(123),
        ...simpleFileData,
      });
      expect(mockWrite).toHaveBeenCalledTimes(1);
    });

    it('should invoke writeMetadata if filemetadata exists and checksum matches', async () => {
      const mockWriteMetadata = jest.fn();
      const ppomStorage = new PPOMStorage({
        storageBackend: simpleStorageBackend,
        readMetadata: () => [simpleFileData],
        writeMetadata: mockWriteMetadata,
      });
      await ppomStorage.writeFile({
        data: new ArrayBuffer(123),
        ...simpleFileData,
      });
      expect(mockWriteMetadata).toHaveBeenCalledWith([simpleFileData]);
    });

    it('should invoke writeMetadata with data passed if checksum matches', async () => {
      const mockWriteMetadata = jest.fn();
      const ppomStorage = new PPOMStorage({
        storageBackend: simpleStorageBackend,
        readMetadata: () => [],
        writeMetadata: mockWriteMetadata,
      });
      await ppomStorage.writeFile({
        data: new ArrayBuffer(123),
        ...simpleFileData,
      });
      expect(mockWriteMetadata).toHaveBeenCalledWith([simpleFileData]);
    });
  });

  describe('syncMetadata', () => {
    it('should return metadata of file if updated file is found in storage', async () => {
      const mockWriteMetadata = jest.fn();
      const ppomStorage = new PPOMStorage({
        storageBackend: storageBackendReturningData,
        readMetadata: () => [simpleFileData],
        writeMetadata: mockWriteMetadata,
      });

      const result = await ppomStorage.syncMetadata([simpleFileData]);
      expect(mockWriteMetadata).toHaveBeenCalledWith([simpleFileData]);
      expect(result).toStrictEqual([simpleFileData]);
    });

    it('should not return data if file is not found in storage', async () => {
      const mockWriteMetadata = jest.fn();
      const ppomStorage = new PPOMStorage({
        storageBackend: simpleStorageBackend,
        readMetadata: () => [simpleFileData],
        writeMetadata: mockWriteMetadata,
      });

      const result = await ppomStorage.syncMetadata([simpleFileData]);
      expect(mockWriteMetadata).toHaveBeenCalledWith([]);
      expect(result).toStrictEqual([]);
    });

    it('should not return metadata of file if file version in storage is outdated', async () => {
      const storageFileData = { ...simpleFileData, version: '1' };
      const mockWriteMetadata = jest.fn();
      const mockDelete = jest.fn().mockResolvedValue('');

      const ppomStorage = new PPOMStorage({
        storageBackend: buildStorageBackend({
          read: async (_key: StorageKey): Promise<any> =>
            Promise.resolve(new ArrayBuffer(123)),
          dir: async () => Promise.resolve([storageFileData]),
          delete: mockDelete,
        }),
        readMetadata: () => [simpleFileData],
        writeMetadata: mockWriteMetadata,
      });

      const result = await ppomStorage.syncMetadata([storageFileData]);
      expect(mockDelete).toHaveBeenCalledWith({
        name: DUMMY_NAME,
        chainId: DUMMY_CHAINID,
      });
      expect(mockWriteMetadata).toHaveBeenCalledWith([]);
      expect(result).toStrictEqual([]);
    });

    it('should delete file from storage backend if its name is not found in file version info passed', async () => {
      const fileDataInStorage = getFileData({
        name: 'dummy_2',
      });
      const mockWriteMetadata = jest.fn();
      const mockDelete = jest.fn().mockResolvedValue('');

      const ppomStorage = new PPOMStorage({
        storageBackend: buildStorageBackend({
          read: async (_key: StorageKey): Promise<any> =>
            Promise.resolve(new ArrayBuffer(123)),
          dir: async () => Promise.resolve([fileDataInStorage]),
          delete: mockDelete,
        }),
        readMetadata: () => [simpleFileData],
        writeMetadata: mockWriteMetadata,
      });

      await ppomStorage.syncMetadata([simpleFileData]);
      expect(mockDelete).toHaveBeenCalledWith({
        name: 'dummy_2',
        chainId: DUMMY_CHAINID,
      });
    });

    it('should delete file from storage backend if its version info is not passed', async () => {
      const fileDataInStorage = getFileData({
        chainId: '5',
      });
      const mockWriteMetadata = jest.fn();
      const mockDelete = jest.fn().mockResolvedValue('');

      const ppomStorage = new PPOMStorage({
        storageBackend: buildStorageBackend({
          read: async (_key: StorageKey): Promise<any> =>
            Promise.resolve(new ArrayBuffer(123)),
          dir: async () => Promise.resolve([fileDataInStorage]),
          delete: mockDelete,
        }),
        readMetadata: () => [simpleFileData],
        writeMetadata: mockWriteMetadata,
      });

      await ppomStorage.syncMetadata([simpleFileData]);
      expect(mockDelete).toHaveBeenCalledWith({
        name: DUMMY_NAME,
        chainId: '5',
      });
    });
  });
});
