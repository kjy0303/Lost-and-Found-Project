import NfcManager, { Ndef, NfcTech } from 'react-native-nfc-manager';

let started = false;
const NFC_NOT_FOUND_MESSAGE = 'NFC 태그를 찾지 못했습니다.';
const DEFAULT_NFC_TIMEOUT_MS = 10000;
const NFC_SESSION_SETTLE_MS = 200;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = (promise, timeoutMs) => {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(NFC_NOT_FOUND_MESSAGE));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
};

export const initNfc = async () => {
  if (started) return true;

  const supported = await NfcManager.isSupported();
  if (!supported) {
    throw new Error('이 기기는 NFC를 지원하지 않습니다.');
  }

  await NfcManager.start();
  started = true;
  return true;
};

export const ensureNfcReady = async () => {
  await initNfc();

  try {
    const enabled = await NfcManager.isEnabled();
    if (!enabled) {
      throw new Error('NFC가 꺼져 있습니다. 기기 설정에서 NFC를 켜주세요.');
    }
  } catch (error) {
    if (String(error?.message || '').includes('NFC가 꺼져')) {
      throw error;
    }

    throw new Error('NFC 상태를 확인하지 못했습니다. 권한 또는 기기 설정을 확인해주세요.');
  }

  return true;
};

const decodeNdefTextRecord = (record) => {
  try {
    if (record?.type && Array.isArray(record.type)) {
      const typeText = String.fromCharCode(...record.type);
      if (typeText !== 'T') return '';
    }

    const payload = record?.payload;
    if (!payload || !Array.isArray(payload) || payload.length < 3) return '';

    const languageCodeLength = payload[0] & 0x3f;
    const textBytes = payload.slice(1 + languageCodeLength);
    return Ndef.util.bytesToString(textBytes);
  } catch (_error) {
    return '';
  }
};

const normalizeTagIdValue = (value) => {
  if (!value) return '';

  if (Array.isArray(value)) {
    return value
      .map((byte) => Number(byte).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }

  const text = String(value).trim();
  if (!text) return '';

  const hexOnly = text.replace(/[^0-9a-f]/gi, '');
  return (hexOnly || text).toUpperCase();
};

export const extractNfcTagId = (tag = {}) => {
  const candidates = [
    tag.id,
    tag.tagID,
    tag.uid,
    tag.identifier,
    tag.serialNumber,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeTagIdValue(candidate);
    if (normalized) return normalized;
  }

  return '';
};

export const cancelNfcRequest = async () => {
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch (_error) {
    // 이미 취소되었거나 요청이 없는 경우는 다음 스캔을 막지 않도록 무시합니다.
  }
};

export const extractNfcLocation = (rawText = '') => {
  const text = String(rawText || '').trim();
  if (!text) return '';

  const patterns = [
    /^LAF_LOC\s*:\s*(.+)$/i,
    /^LAF_ZONE\s*:\s*(.+)$/i,
    /^ZONE\s*:\s*(.+)$/i,
    /^LOC\s*:\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return text;
};

export const readNfcTag = async ({
  timeoutMs = DEFAULT_NFC_TIMEOUT_MS,
  alertMessage = '보관구역 NFC 태그를 휴대폰에 가까이 대주세요.',
} = {}) => {
  await ensureNfcReady();
  await cancelNfcRequest();
  await wait(NFC_SESSION_SETTLE_MS);

  try {
    await withTimeout(
      NfcManager.requestTechnology([NfcTech.Ndef, NfcTech.NfcA], {
        alertMessage,
      }),
      timeoutMs
    );

    const tag = await NfcManager.getTag();
    if (!tag) {
      throw new Error(NFC_NOT_FOUND_MESSAGE);
    }

    const tagId = extractNfcTagId(tag);
    if (!tagId) {
      throw new Error('NFC 태그 ID를 읽지 못했습니다.');
    }

    const records = tag?.ndefMessage || [];
    const textRecords = records.map(decodeNdefTextRecord).filter(Boolean);
    const text = textRecords[0] || '';

    return { tag, tagId, text };
  } finally {
    await cancelNfcRequest();
    await wait(NFC_SESSION_SETTLE_MS);
  }
};

export const readNfcText = async ({ timeoutMs = DEFAULT_NFC_TIMEOUT_MS } = {}) => {
  const { text } = await readNfcTag({ timeoutMs });

  if (!text) {
    throw new Error('NFC 태그에서 구역 정보를 읽지 못했습니다.');
  }

  return text;
};
