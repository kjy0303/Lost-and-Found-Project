import NfcManager, { Ndef, NfcTech } from 'react-native-nfc-manager';

let started = false;

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
  } catch (error) {
    return '';
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

export const readNfcText = async () => {
  await initNfc();

  try {
    await NfcManager.requestTechnology(NfcTech.Ndef, {
      alertMessage: '보관구역 NFC 태그를 휴대폰에 가까이 대주세요.',
    });

    const tag = await NfcManager.getTag();
    const records = tag?.ndefMessage || [];
    const textRecords = records.map(decodeNdefTextRecord).filter(Boolean);
    const text = textRecords[0] || '';

    if (!text) {
      throw new Error('NFC 태그에서 구역 정보를 읽지 못했습니다.');
    }

    return text;
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }
};
