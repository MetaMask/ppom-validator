import crypto from 'crypto';

import {
  DUMMY_ARRAY_BUFFER_DATA,
  DUMMY_ARRAY_BUFFER_DATA2,
  DUMMY_ARRAY_BUFFER_DATA_JSON,
  DUMMY_CHAINID,
  DUMMY_CHAINID2,
  DUMMY_CHECKSUM2,
  DUMMY_NAME,
  DUMMY_NAME2,
  VERSION_INFO,
  getFileData,
} from '../test/test-utils';
import { readFile, syncMetadata, writeFile } from './ppom-storage';

Object.defineProperty(globalThis, 'crypto', {
  value: {
    subtle: crypto.webcrypto.subtle,
  },
});

const simpleFileData = getFileData();
const simpleFileData2 = getFileData({
  chainId: DUMMY_CHAINID2,
  name: DUMMY_NAME2,
  checksum: DUMMY_CHECKSUM2,
  version: '2.0.0',
});

describe('PPOMStorage', () => {
  describe('readFile', () => {
    it('should read data', async () => {
      const mockReadState = jest.fn().mockReturnValue({
        storageMetadata: [simpleFileData],
        versionInfo: VERSION_INFO,
        fileStorage: {
          [`${DUMMY_NAME}_${DUMMY_CHAINID}`]: DUMMY_ARRAY_BUFFER_DATA_JSON,
        },
      });
      const data = await readFile(DUMMY_NAME, DUMMY_CHAINID, mockReadState);
      expect(data).toStrictEqual(DUMMY_ARRAY_BUFFER_DATA);
      expect(mockReadState).toHaveBeenCalledTimes(1);
    });

    it('should throw error if file metadata not found', async () => {
      const mockReadState = jest.fn().mockReturnValue({
        storageMetadata: [],
        versionInfo: VERSION_INFO,
        fileStorage: {
          [`${DUMMY_NAME}_${DUMMY_CHAINID}`]: DUMMY_ARRAY_BUFFER_DATA_JSON,
        },
      });
      await expect(async () => {
        await readFile(DUMMY_NAME, DUMMY_CHAINID, mockReadState);
      }).rejects.toThrow(
        `File metadata (${DUMMY_NAME}, ${DUMMY_CHAINID}) not found`,
      );
    });

    it('should throw error if file is not found in storage', async () => {
      const mockReadState = jest.fn().mockReturnValue({
        storageMetadata: [simpleFileData],
        versionInfo: VERSION_INFO,
        fileStorage: {
          [`${DUMMY_NAME}_${DUMMY_CHAINID}`]: undefined,
        },
      });
      await expect(async () => {
        await readFile(DUMMY_NAME, DUMMY_CHAINID, mockReadState);
      }).rejects.toThrow(
        `Storage File (${DUMMY_NAME}, ${DUMMY_CHAINID}) not found`,
      );
    });
  });

  describe('writeFile', () => {
    it('should call write file', async () => {
      const mockUpdateState = jest.fn().mockResolvedValue(undefined);
      const mockReadState = jest.fn().mockReturnValue({
        storageMetadata: [simpleFileData],
        versionInfo: VERSION_INFO,
        fileStorage: {
          [`${DUMMY_NAME}_${DUMMY_CHAINID}`]: DUMMY_ARRAY_BUFFER_DATA_JSON,
        },
      });
      await writeFile({
        data: DUMMY_ARRAY_BUFFER_DATA,
        ...simpleFileData,
        readState: mockReadState,
        updateState: mockUpdateState,
      });

      expect(mockUpdateState).toHaveBeenCalledTimes(2);
      expect(mockReadState).toHaveBeenCalledTimes(2);
    });

    it('should throw error with wrong checksum', async () => {
      const mockUpdateState = jest.fn().mockResolvedValue(undefined);
      const mockReadState = jest.fn().mockReturnValue({
        storageMetadata: [simpleFileData],
        versionInfo: VERSION_INFO,
        fileStorage: {
          [`${DUMMY_NAME}_${DUMMY_CHAINID}`]: DUMMY_ARRAY_BUFFER_DATA_JSON,
        },
      });

      const withWrongChecksum = {
        ...simpleFileData,
        checksum: DUMMY_CHECKSUM2,
      };

      await expect(async () => {
        await writeFile({
          data: DUMMY_ARRAY_BUFFER_DATA,
          ...withWrongChecksum,
          readState: mockReadState,
          updateState: mockUpdateState,
        });
      }).rejects.toThrow(`Checksum mismatch for key blob_0x1`);
    });

    it('should call write file with new data', async () => {
      const mockUpdateState = jest.fn().mockResolvedValue(undefined);
      const mockReadState = jest.fn().mockReturnValue({
        storageMetadata: [simpleFileData],
        versionInfo: VERSION_INFO,
        fileStorage: {
          [`${DUMMY_NAME}_${DUMMY_CHAINID}`]: DUMMY_ARRAY_BUFFER_DATA_JSON,
        },
      });

      await writeFile({
        data: DUMMY_ARRAY_BUFFER_DATA2,
        ...simpleFileData2,
        readState: mockReadState,
        updateState: mockUpdateState,
      });

      expect(mockUpdateState).toHaveBeenCalledTimes(2);
      expect(mockReadState).toHaveBeenCalledTimes(2);
    });
  });

  describe('syncMetadata', () => {
    it('should return metadata of file if updated file is found in storage', async () => {
      const mockUpdateState = jest.fn().mockResolvedValue(undefined);
      const mockReadState = jest.fn().mockReturnValue({
        storageMetadata: [simpleFileData],
        versionInfo: VERSION_INFO,
        fileStorage: {
          [`${DUMMY_NAME}_${DUMMY_CHAINID}`]: DUMMY_ARRAY_BUFFER_DATA_JSON,
        },
      });

      const result = await syncMetadata(mockReadState, mockUpdateState);

      expect(mockUpdateState).toHaveBeenCalledWith({
        storageMetadata: [simpleFileData],
      });
      expect(mockUpdateState).toHaveBeenCalledTimes(1);
      expect(mockReadState).toHaveBeenCalledTimes(2);
      expect(result).toStrictEqual([simpleFileData]);
    });

    it('should not return data if file is not found in storage', async () => {
      const mockUpdateState = jest.fn().mockResolvedValue(undefined);
      const mockReadState = jest.fn().mockReturnValue({
        storageMetadata: [simpleFileData],
        versionInfo: VERSION_INFO,
        fileStorage: {
          [`${DUMMY_NAME}_${DUMMY_CHAINID}`]: undefined,
        },
      });

      const result = await syncMetadata(mockReadState, mockUpdateState);

      expect(mockUpdateState).toHaveBeenCalledWith({
        fileStorage: {
          [`${DUMMY_NAME}_${DUMMY_CHAINID}`]: undefined,
        },
      });
      expect(mockUpdateState).toHaveBeenCalledWith({
        storageMetadata: [],
      });

      expect(mockUpdateState).toHaveBeenCalledTimes(2);
      expect(mockReadState).toHaveBeenCalledTimes(2);
      expect(result).toStrictEqual([]);
    });

    it('should not return metadata of file if file version in storage is outdated', async () => {
      const mockUpdateState = jest.fn().mockResolvedValue(undefined);
      const mockReadState = jest.fn().mockReturnValue({
        storageMetadata: [simpleFileData],
        versionInfo: VERSION_INFO.map((versionInfo) => {
          return {
            ...versionInfo,
            version: '1',
          };
        }),
        fileStorage: {
          [`${DUMMY_NAME}_${DUMMY_CHAINID}`]: DUMMY_ARRAY_BUFFER_DATA_JSON,
        },
      });

      const result = await syncMetadata(mockReadState, mockUpdateState);

      expect(mockUpdateState).toHaveBeenCalledWith({
        fileStorage: {
          [`${DUMMY_NAME}_${DUMMY_CHAINID}`]: undefined,
        },
      });
      expect(mockUpdateState).toHaveBeenCalledWith({
        storageMetadata: [],
      });

      expect(mockUpdateState).toHaveBeenCalledTimes(2);
      expect(mockReadState).toHaveBeenCalledTimes(2);

      expect(result).toStrictEqual([]);
    });

    it('should delete file from storage backend if its name is not found in file version info passed', async () => {
      const mockUpdateState = jest.fn().mockResolvedValue(undefined);
      const mockReadState = jest.fn().mockReturnValue({
        storageMetadata: [{ ...simpleFileData, name: 'dummy_2' }],
        versionInfo: VERSION_INFO,
        fileStorage: {
          [`${DUMMY_NAME}_${DUMMY_CHAINID}`]: DUMMY_ARRAY_BUFFER_DATA_JSON,
        },
      });

      const result = await syncMetadata(mockReadState, mockUpdateState);

      expect(mockUpdateState).toHaveBeenCalledWith({
        fileStorage: {
          [`${DUMMY_NAME}_${DUMMY_CHAINID}`]: undefined,
        },
      });
      expect(mockUpdateState).toHaveBeenCalledWith({
        storageMetadata: [],
      });

      expect(mockUpdateState).toHaveBeenCalledTimes(2);
      expect(mockReadState).toHaveBeenCalledTimes(2);
      expect(result).toStrictEqual([]);
    });

    it('should delete file from storage backend if its version info is not passed', async () => {
      const mockUpdateState = jest.fn().mockResolvedValue(undefined);
      const mockReadState = jest.fn().mockReturnValue({
        storageMetadata: [{ ...simpleFileData, version: undefined }],
        versionInfo: VERSION_INFO,
        fileStorage: {
          [`${DUMMY_NAME}_${DUMMY_CHAINID}`]: DUMMY_ARRAY_BUFFER_DATA_JSON,
        },
      });

      const result = await syncMetadata(mockReadState, mockUpdateState);
      expect(mockUpdateState).toHaveBeenCalledTimes(2);
      expect(mockReadState).toHaveBeenCalledTimes(2);
      expect(result).toStrictEqual([]);
    });
  });
});
