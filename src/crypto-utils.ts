import CryptoJS from 'crypto-js';

const arrayBufferToHex = (arrayBuffer: ArrayBuffer): string => {
  const uint8Array = new Uint8Array(arrayBuffer);
  let hexString = '';
  for (const i of uint8Array) {
    const val = uint8Array[i]?.toString(16).padStart(2, '0');
    hexString += val;
  }
  return hexString;
};

export const calculateSHA256 = (arrayBuffer: ArrayBuffer): string => {
  const hexString = arrayBufferToHex(arrayBuffer);
  const wordArray = CryptoJS.enc.Hex.parse(hexString);
  const hash = CryptoJS.SHA256(wordArray);
  const hashHex = hash.toString(CryptoJS.enc.Hex);
  return hashHex;
};
