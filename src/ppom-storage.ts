import { PPOMState } from './ppom-controller';

/**
 * @type FileMetadata
 * Defined type for information about file saved in storage backend.
 * @property name - Name of the file.
 * @property chainId - ChainId for file.
 * @property version - File version.
 * @property checksum - Checksum of file data.
 */
export type FileMetadata = {
  name: string;
  chainId: string;
  version: string;
  checksum: string;
};

/**
 * @type FileMetadataList
 * This is type of metadata about files saved in storage,
 * this information is saved in PPOMController state.
 */
export type FileMetadataList = FileMetadata[];

/**
 * @type StorageKey
 * This defines type of key that is used for indexing file data saved in State.
 * @property name - Name of the file.
 * @property chainId - ChainId for file.
 */
export type StorageKey = {
  name: string;
  chainId: string;
};

/**
 * Validates data against a checksum.
 *
 * @param key - Key object containing the name and chainId of file.
 * @param checksum - Checksum to use in validation.
 * @param data - Data to validate.
 * @throws Exception is checksum can not be validated
 */
const validateChecksum = async (
  key: StorageKey,
  checksum: string,
  data: ArrayBuffer | undefined,
) => {
  if (data) {
    // eslint-disable-next-line no-restricted-globals
    const hash = await crypto.subtle.digest('SHA-256', data);
    const hashString = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    if (hashString !== checksum) {
      throw new Error(`Checksum mismatch for key ${key.name}_${key.chainId}`);
    }
  } else {
    throw new Error(`Storage File (${key.name}, ${key.chainId}) not found`);
  }
};

/**
 * Converts ArrayBuffer to json string.
 *
 * @param data - Data to convert to json string.
 * @returns JSON string of converted ArrayBuffer data.
 */
export const arrayBufferToJson = (data: ArrayBuffer) => {
  const dataToUintArray = new Uint8Array(data);
  const stringFromCharCode = String.fromCharCode(...dataToUintArray);
  return stringFromCharCode;
};

/**
 * Converts json string to array buffer.
 *
 * @param json - JSON string to convert to ArrayBuffer.
 * @returns ArrayBuffer of convered data.
 */
const jsonStringToArrayBuffer = (json: string | undefined) => {
  if (json) {
    const dataToUintArray = new Uint8Array(
      [...json].map((character) => character.charCodeAt(0)),
    );
    return dataToUintArray.buffer;
  }

  return undefined;
};

/**
 * Read the file from the local storage.
 * 1. Check if the file exists in the local storage.
 * 2. Check if the file exists in the metadata.
 *
 * @param name - Name assigned to storage.
 * @param chainId - ChainId for which file is queried.
 * @param readState - Controller read state function.
 */
export const readFile = async (
  name: string,
  chainId: string,
  readState: (key?: keyof PPOMState) => Partial<PPOMState>,
): Promise<ArrayBuffer> => {
  const { storageMetadata, fileStorage } = readState();

  const fileMetadata = storageMetadata?.find(
    (file: any) => file.name === name && file.chainId === chainId,
  );
  if (!fileMetadata) {
    throw new Error(`File metadata (${name}, ${chainId}) not found`);
  }

  const stateFileStorage = fileStorage as Record<string, string>;

  const data = jsonStringToArrayBuffer(stateFileStorage[`${name}_${chainId}`]);

  await validateChecksum(
    {
      name,
      chainId,
    },
    fileMetadata.checksum,
    data,
  );

  return data as ArrayBuffer;
};

/**
 * Sync the metadata with the version info from the cdn.
 * 1. Remove the files that are not readable (e.g. corrupted or deleted).
 * 2. Remove the files that are not in the cdn anymore.
 * 3. Remove the files that are not up to date in the cdn.
 * 4. Remove the files that are not in the local storage from the metadata.
 * 5. Delete the files that are not in the metadata from the local storage.
 *
 * @param readState - Controller read state function.
 * @param updateState - Controller update state function.
 * @returns The metadata after it was synchronized.
 */
export const syncMetadata = async (
  readState: (key?: keyof PPOMState) => Partial<PPOMState>,
  updateState: (newState: Partial<PPOMState>) => void,
): Promise<FileMetadataList> => {
  const { storageMetadata, versionInfo, fileStorage } = readState();

  const stateFileStorage = fileStorage as Record<string, string>;

  const syncedMetadata: FileMetadataList = [];

  if (storageMetadata) {
    for (const fileMetadata of storageMetadata) {
      // check if the file is readable (e.g. corrupted or deleted)
      try {
        await readFile(fileMetadata.name, fileMetadata.chainId, readState);
      } catch (exp: any) {
        console.error('Error: ', exp);
        continue;
      }

      // check if the file exits and up to date in the storage
      if (
        !versionInfo?.find(
          (file) =>
            file.name === fileMetadata.name &&
            file.chainId === fileMetadata.chainId &&
            file.version === fileMetadata.version &&
            file.checksum === fileMetadata.checksum,
        )
      ) {
        continue;
      }

      syncedMetadata.push(fileMetadata);
    }
  }

  const filesInState = Object.keys(stateFileStorage).map((key) => {
    const [name, chainId] = key.split('_');
    return { name, chainId };
  });

  for (const { name, chainId } of filesInState) {
    if (
      !syncedMetadata.find(
        (file) => file.name === name && file.chainId === chainId,
      )
    ) {
      if (fileStorage) {
        delete fileStorage[`${name as string}_${chainId as string}`];
      }

      updateState({
        fileStorage: {
          ...fileStorage,
        },
      });
    }
  }

  updateState({
    storageMetadata: [...syncedMetadata],
  });

  return syncedMetadata;
};

/**
 * Write the file to the local storage.
 * 1. Write the file to the local storage.
 * 2. Update the metadata.
 *
 * @param options - Object passed to write to storage.
 * @param options.data - File data to be written.
 * @param options.name - Name to be assigned to the storage.
 * @param options.chainId - Current ChainId.
 * @param options.version - Version of file.
 * @param options.checksum - Checksum of file.
 * @param options.readState - Controller read state function.
 * @param options.updateState - Controller function to update state.
 */
export const writeFile = async ({
  data,
  name,
  chainId,
  version,
  checksum,
  readState,
  updateState,
}: {
  data: ArrayBuffer;
  name: string;
  chainId: string;
  version: string;
  checksum: string;
  readState: (key?: keyof PPOMState) => Partial<PPOMState>;
  updateState: (newState: Partial<PPOMState>) => void;
}) => {
  await validateChecksum(
    {
      name,
      chainId,
    },
    checksum,
    data,
  );

  const { fileStorage } = readState('fileStorage');

  const draftFile = arrayBufferToJson(data);

  if (draftFile) {
    updateState({
      fileStorage: {
        ...fileStorage,
        [`${name}_${chainId}`]: draftFile,
      },
    });
  }

  const { storageMetadata } = readState('storageMetadata');

  const metadata = storageMetadata as FileMetadataList;

  if (metadata) {
    const fileMetadata = metadata.find(
      (file: any) => file.name === name && file.chainId === chainId,
    );

    if (fileMetadata) {
      fileMetadata.version = version;
      fileMetadata.checksum = checksum;
    } else {
      metadata.push({ name, chainId, version, checksum });
    }

    updateState({
      storageMetadata: [...metadata],
    });
  }
};
