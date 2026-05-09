import { Alert, Platform } from 'react-native';
import NfcManager, { Ndef, NfcTech } from 'react-native-nfc-manager';

let nfcStarted = false;

export async function initNfc() {
  const supported = await NfcManager.isSupported();

  if (!supported) {
    return {
      supported: false,
      enabled: false,
      message: '이 기기는 NFC를 지원하지 않습니다.',
    };
  }

  if (!nfcStarted) {
    await NfcManager.start();
    nfcStarted = true;
  }

  const enabled = await NfcManager.isEnabled();

  return {
    supported: true,
    enabled,
    message: enabled ? 'NFC 사용 가능' : 'NFC가 꺼져 있습니다.',
  };
}

export function extractNfcLocation(text) {
  const value = String(text || '').trim();
  if (!value) return '';

  if (value.toUpperCase().startsWith('LAF_LOC:')) {
    return value.split(':').slice(1).join(':').trim().toUpperCase();
  }

  return value.toUpperCase();
}

export async function readNfcText() {
  try {
    const state = await initNfc();

    if (!state.supported) {
      Alert.alert('NFC 미지원', state.message);
      return null;
    }

    if (!state.enabled) {
      Alert.alert('NFC 꺼짐', '휴대폰 설정에서 NFC를 켜주세요.');
      if (Platform.OS === 'android') {
        await NfcManager.goToNfcSetting();
      }
      return null;
    }

    Alert.alert('NFC 구역확인', '휴대폰 뒷면을 NFC 스티커에 가까이 대주세요.');

    await NfcManager.requestTechnology(NfcTech.Ndef);
    const tag = await NfcManager.getTag();
    const record = tag?.ndefMessage?.[0];

    if (!record?.payload) {
      Alert.alert('읽기 실패', 'NFC 태그 안에 읽을 수 있는 데이터가 없습니다.');
      return null;
    }

    return Ndef.text.decodePayload(record.payload);
  } catch (error) {
    console.log('NFC 읽기 오류:', error);
    Alert.alert('NFC 읽기 실패', '태그를 읽는 중 문제가 발생했습니다.');
    return null;
  } finally {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch (e) {}
  }
}
