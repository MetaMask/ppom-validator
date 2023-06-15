import {
  DUMMY_ARRAY_BUFFER_DATA,
  buildStorageBackend,
  simpleStorageBackend,
  storageBackendReturningData,
} from '../test/test-utils';
import { PPOMStorage, StorageKey } from './ppom-storage';

const DUMMY_CHECKSUM = 'DUMMY_CHECKSUM';
const DUMMY_NAME = 'DUMMY_NAME';
const DUMMY_CHAINID = '1';
const ARRAY_BUFFER_DATA = new ArrayBuffer(123);

const getFileData = (data = {}) => ({
  chainId: DUMMY_CHAINID,
  name: DUMMY_NAME,
  checksum: DUMMY_CHECKSUM,
  version: '0',
  ...data,
});

const simpleFileData = getFileData();

describe('PPOMStorage', () => {
  describe('readFile', () => {
    it('should return data', async () => {
      const ppomStorage = new PPOMStorage({
        storageBackend: buildStorageBackendReturningData(ARRAY_BUFFER_DATA),
        readMetadata: () => [simpleFileData],
        writeMetadata: () => undefined,
      });
      const data = await ppomStorage.readFile(DUMMY_NAME, DUMMY_CHAINID);
      expect(data).toStrictEqual(DUMMY_ARRAY_BUFFER_DATA);
    });

    it('should throw error if file metadata not found', async () => {
      const ppomStorage = new PPOMStorage({
        storageBackend: buildStorageBackendReturningData(ARRAY_BUFFER_DATA),
        readMetadata: () => [],
        writeMetadata: () => undefined,
      });
      await expect(async () => {
        await ppomStorage.readFile(DUMMY_NAME, DUMMY_CHAINID);
      }).rejects.toThrow(
        `File metadata (${DUMMY_NAME}, ${DUMMY_CHAINID}) not found`,
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
    it('should call storageBackend.write', async () => {
      const mockWrite = jest.fn().mockResolvedValue('test');
      const ppomStorage = new PPOMStorage({
        storageBackend: buildStorageBackend({ write: mockWrite }),
        readMetadata: () => [],
        writeMetadata: () => undefined,
      });
      await ppomStorage.writeFile({
        data: DUMMY_ARRAY_BUFFER_DATA,
        ...simpleFileData,
      });
      expect(mockWrite).toHaveBeenCalledTimes(1);
    });

    it('should invoke writeMetadata if file metadata exists', async () => {
      const mockWriteMetadata = jest.fn();
      const ppomStorage = new PPOMStorage({
        storageBackend: simpleStorageBackend,
        readMetadata: () => [simpleFileData],
        writeMetadata: mockWriteMetadata,
      });
      await ppomStorage.writeFile({
        data: DUMMY_ARRAY_BUFFER_DATA,
        ...simpleFileData,
      });
      expect(mockWriteMetadata).toHaveBeenCalledWith([simpleFileData]);
    });

    it('should invoke writeMetadata with data passed', async () => {
      const mockWriteMetadata = jest.fn();
      const ppomStorage = new PPOMStorage({
        storageBackend: simpleStorageBackend,
        readMetadata: () => [],
        writeMetadata: mockWriteMetadata,
      });
      await ppomStorage.writeFile({
        data: DUMMY_ARRAY_BUFFER_DATA,
        ...simpleFileData,
      });
      expect(mockWriteMetadata).toHaveBeenCalledWith([simpleFileData]);
    });
  });

  describe('syncMetadata', () => {
    it('should return metadata of file if updated file is found in storage', async () => {
      const mockWriteMetadata = jest.fn();
      const ppomStorage = new PPOMStorage({
        storageBackend: buildStorageBackendReturningData(ARRAY_BUFFER_DATA),
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
            Promise.resolve(DUMMY_ARRAY_BUFFER_DATA),
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
            Promise.resolve(DUMMY_ARRAY_BUFFER_DATA),
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
            Promise.resolve(DUMMY_ARRAY_BUFFER_DATA),
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
