import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { db } from '../../firebaseConfig';
import { extractNfcLocation, readNfcTag } from '../utils/nfc';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NFC_ZONE_ICON = require('../assets/nfc-zone-icon.png');

export default function ZoneScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  const [step, setStep] = useState('nfc');
  const [scanMode, setScanMode] = useState('scan');
  const [scanned, setScanned] = useState(false);
  const [serialInput, setSerialInput] = useState('');
  const [loading, setLoading] = useState(false);

  const [zoneText, setZoneText] = useState('');
  const [nfcRawText, setNfcRawText] = useState('');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [itemData, setItemData] = useState(null);
  const [itemDocId, setItemDocId] = useState(null);

  const selectZone = (zone, rawText = '', tagId = '') => {
    setNfcRawText(rawText);
    setSelectedTagId(tagId);
    setZoneText(zone);
    setScanned(false);
    setSerialInput('');
    setItemData(null);
    setItemDocId(null);
    setStep('item');
  };

  const handleReadNfc = async () => {
    setLoading(true);
    try {
      const { tagId, text } = await readNfcTag();
      const rawZoneText = extractNfcLocation(text);
      const zoneRef = doc(db, 'storageZones', tagId);
      const zoneSnap = await getDoc(zoneRef);

      setSelectedTagId(tagId);
      setNfcRawText(text || '');

      const savedZoneName = zoneSnap.exists()
        ? zoneSnap.data()?.zoneName || rawZoneText || ''
        : '';

      if (savedZoneName) {
        Alert.alert(
          '구역 확인 완료',
          `${savedZoneName} 태그가 확인되었습니다.\n물품 연결을 진행하시겠습니까?`,
          [
            { text: '취소', style: 'cancel' },
            { text: '물품 연결', onPress: () => selectZone(savedZoneName, text || '', tagId) },
          ]
        );
        return;
      }

      setZoneText('');
      setSelectedTagId('');
      setNfcRawText('');
      Alert.alert('미등록된 태그입니다.', '태그를 옵션에서 등록해주세요.');
    } catch (error) {
      Alert.alert('NFC 오류', String(error?.message || error));
    } finally {
      setLoading(false);
    }
  };

  const handleSerialChange = (text) => {
    const cleaned = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    let formatted = '';

    if (cleaned.length <= 6) {
      formatted = cleaned;
    } else if (cleaned.length <= 10) {
      formatted = `${cleaned.slice(0, 6)}-${cleaned.slice(6)}`;
    } else {
      formatted = `${cleaned.slice(0, 6)}-${cleaned.slice(6, 10)}-${cleaned.slice(10, 14)}`;
    }

    setSerialInput(formatted);
  };

  const resetAll = () => {
    setStep('nfc');
    setScanMode('scan');
    setScanned(false);
    setSerialInput('');
    setZoneText('');
    setNfcRawText('');
    setSelectedTagId('');
    setItemData(null);
    setItemDocId(null);
  };

  const updateStorageZone = async (documentId, data) => {
    setLoading(true);
    try {
      const registeredZone = zoneText;
      const itemRef = doc(db, 'lostItems', documentId);
      const updatePayload = {
        storageZone: registeredZone,
        storageRegisteredAt: new Date().toISOString(),
        storageZoneUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (selectedTagId) {
        updatePayload.storageTagId = selectedTagId;
      }

      if (nfcRawText) {
        updatePayload.storageZoneNfcText = nfcRawText;
      }

      await updateDoc(itemRef, updatePayload);
      setItemData({ ...data, ...updatePayload });
      Alert.alert(
        '구역 등록 완료',
        `보관구역이 등록되었습니다: ${registeredZone}`,
        [{ text: '확인', onPress: resetAll }],
        { cancelable: false }
      );
    } catch (_error) {
      Alert.alert('오류', '보관구역 저장 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const confirmZoneUpdate = (documentId, data) => {
    const currentZone = data.storageZone || data.storageArea || data.location || '';

    if (!currentZone) {
      Alert.alert(
        '보관구역 등록',
        `이 분실물을 ${zoneText}에 등록하시겠습니까?`,
        [
          { text: '취소', style: 'cancel' },
          { text: '등록', onPress: () => updateStorageZone(documentId, data) }
        ]
      );
      return;
    }

    if (currentZone === zoneText) {
      Alert.alert(
        '알림',
        `이미 ${zoneText}에 등록되어 있습니다.`,
        [{ text: '확인', onPress: resetAll }],
        { cancelable: false }
      );
      return;
    }

    Alert.alert(
      '보관구역 변경',
      `이미 ${currentZone}에 등록된 분실물입니다. ${zoneText}으로 변경하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        { text: '변경', onPress: () => updateStorageZone(documentId, data) }
      ]
    );
  };

  const fetchItemBySerial = async (serialNumber) => {
    if (!zoneText) {
      Alert.alert('알림', '먼저 보관구역을 선택해 주세요.');
      setStep('nfc');
      return;
    }

    if (!serialNumber.trim()) {
      Alert.alert('알림', '일련번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const q = query(collection(db, 'lostItems'), where('serialNumber', '==', serialNumber.trim()));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        Alert.alert('검색 실패', '등록되지 않은 일련번호입니다.');
        return;
      }

      const docSnap = querySnapshot.docs[0];
      const data = docSnap.data();
      setItemData(data);
      setItemDocId(docSnap.id);
      confirmZoneUpdate(docSnap.id, data);
    } catch (_error) {
      Alert.alert('오류', '데이터 조회 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleBarCodeScanned = ({ data }) => {
    const isSerialFormat = /^[A-Za-z0-9-]+$/.test(data);
    if (!isSerialFormat) return;

    setScanned(true);
    fetchItemBySerial(data);
  };

  const renderCameraArea = () => {
    if (!permission) {
      return <View style={styles.emptyBox} />;
    }

    if (!permission.granted) {
      return (
        <View style={styles.permissionBox}>
          <Ionicons name="camera-outline" size={54} color="#1A237E" />
          <Text style={styles.permissionText}>QR 스캔을 위해 카메라 권한이 필요합니다.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
            <Text style={styles.primaryBtnText}>권한 허용하기</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.scannerWrapper}>
        <View style={styles.scannerBox}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerTarget} />
          </View>
        </View>
        <Text style={styles.scannerGuide}>물품의 일련번호 QR을 맞춰주세요.</Text>

        {scanned && (
          <TouchableOpacity style={styles.rescanBtn} onPress={() => setScanned(false)}>
            <Ionicons name="refresh" size={20} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.rescanBtnText}>다시 스캔하기</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/')} style={styles.homeButton}>
          <Ionicons name="home-outline" size={28} color="#1A237E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>구역 등록</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.topCard}>
          <Image source={NFC_ZONE_ICON} style={styles.topIcon} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={styles.topTitle}>NFC 보관구역 등록</Text>
            <Text style={styles.topDesc}>NFC 태그로 구역을 먼저 확인한 뒤 QR 또는 일련번호로 물품을 연결합니다.</Text>
          </View>
        </View>

        <View style={styles.stepBox}>
          <View style={[styles.stepChip, step === 'nfc' && styles.stepChipActive]}>
            <Text style={[styles.stepText, step === 'nfc' && styles.stepTextActive]}>1. 구역 태그</Text>
          </View>
          <View style={[styles.stepChip, step === 'item' && styles.stepChipActive]}>
            <Text style={[styles.stepText, step === 'item' && styles.stepTextActive]}>2. 물품 연결</Text>
          </View>
        </View>

        <View style={styles.currentZoneBox}>
          <Text style={styles.currentZoneLabel}>선택된 보관구역</Text>
          <Text style={styles.currentZoneValue}>{zoneText || '없음'}</Text>
        </View>

        {step === 'nfc' && (
          <View style={styles.cardBox}>
            <Ionicons name="radio-outline" size={48} color="#1A237E" />
            <Text style={styles.sectionTitle}>보관구역 NFC 태그를 스캔하세요</Text>
            <Text style={styles.sectionDesc}>등록된 NFC 태그를 스캔하면 보관구역을 확인하고 물품을 연결합니다.</Text>
            <TouchableOpacity style={styles.primaryBtnWide} onPress={handleReadNfc} disabled={loading}>
              <Text style={styles.primaryBtnText}>NFC 태그 읽기</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'item' && (
          <View style={styles.cardBoxNoPadding}>
            <View style={styles.zoneHeaderRow}>
              <Text style={styles.zoneHeaderTitle}>등록할 구역: {zoneText}</Text>
              <TouchableOpacity onPress={resetAll}>
                <Text style={styles.changeZoneText}>구역 다시 선택</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabBtn, scanMode === 'scan' && styles.tabActive]}
                onPress={() => { setScanMode('scan'); setScanned(false); }}
              >
                <Text style={[styles.tabText, scanMode === 'scan' && styles.tabTextActive]}>QR 스캔</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, scanMode === 'manual' && styles.tabActive]}
                onPress={() => setScanMode('manual')}
              >
                <Text style={[styles.tabText, scanMode === 'manual' && styles.tabTextActive]}>일련번호 수동입력</Text>
              </TouchableOpacity>
            </View>

            {scanMode === 'scan' && renderCameraArea()}

            {scanMode === 'manual' && (
              <View style={styles.manualWrapper}>
                <Ionicons name="barcode-outline" size={60} color="#1A237E" style={{ marginBottom: 20 }} />
                <Text style={styles.manualTitle}>일련번호를 입력해주세요</Text>
                <TextInput
                  style={styles.manualInput}
                  placeholder="예: 260329-WALT-A3F9"
                  placeholderTextColor="#999"
                  value={serialInput}
                  onChangeText={handleSerialChange}
                  autoCapitalize="characters"
                  keyboardType="ascii-capable"
                  autoCorrect={false}
                  maxLength={16}
                />
                <TouchableOpacity style={styles.searchBtn} onPress={() => fetchItemBySerial(serialInput)}>
                  <Text style={styles.searchBtnText}>조회 후 구역 등록</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {itemData && (
          <View style={styles.resultSummaryBox}>
            <Text style={styles.resultSummaryTitle}>최근 조회 물품</Text>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>일련번호</Text><Text style={styles.summaryValue}>{itemData.serialNumber || '-'}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>물품명</Text><Text style={styles.summaryValue}>{itemData.sub_category || itemData.feature || '-'}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>보관구역</Text><Text style={styles.summaryValue}>{itemData.storageZone || itemData.storageArea || '없음'}</Text></View>
          </View>
        )}
      </ScrollView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.loadingText}>처리 중...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F7' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E0E0E0', zIndex: 10 },
  homeButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A237E' },
  container: { flex: 1 },
  contentContainer: { padding: 20, paddingBottom: 40 },
  topCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 24, padding: 16, marginBottom: 14, shadowColor: '#1A237E', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  topIcon: { width: 76, height: 76, marginRight: 12 },
  topTitle: { fontSize: 20, fontWeight: '900', color: '#1A237E', marginBottom: 6 },
  topDesc: { fontSize: 13, color: '#666', lineHeight: 19, fontWeight: '600' },
  stepBox: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stepChip: { flex: 1, backgroundColor: '#E9ECF5', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  stepChipActive: { backgroundColor: '#1A237E' },
  stepText: { color: '#777', fontSize: 14, fontWeight: '800' },
  stepTextActive: { color: '#fff' },
  currentZoneBox: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E6EAF5' },
  currentZoneLabel: { fontSize: 13, color: '#777', fontWeight: '700', marginBottom: 6 },
  currentZoneValue: { fontSize: 22, color: '#1A237E', fontWeight: '900' },
  cardBox: { backgroundColor: '#fff', borderRadius: 24, padding: 18, alignItems: 'center', shadowColor: '#1A237E', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  cardBoxNoPadding: { backgroundColor: '#fff', borderRadius: 24, overflow: 'hidden', shadowColor: '#1A237E', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  sectionTitle: { fontSize: 20, fontWeight: '900', color: '#1A237E', marginTop: 12, marginBottom: 8, textAlign: 'center' },
  sectionDesc: { fontSize: 14, color: '#666', lineHeight: 21, textAlign: 'center', marginBottom: 22 },
  primaryBtn: { backgroundColor: '#1A237E', paddingVertical: 14, paddingHorizontal: 30, borderRadius: 10, marginTop: 16 },
  primaryBtnWide: { width: '100%', backgroundColor: '#1A237E', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  zoneHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  zoneHeaderTitle: { fontSize: 16, fontWeight: '900', color: '#1A237E' },
  changeZoneText: { fontSize: 13, fontWeight: '800', color: '#FF9800' },
  tabContainer: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#ddd' },
  tabBtn: { flex: 1, paddingVertical: 15, alignItems: 'center' },
  tabActive: { borderBottomWidth: 3, borderBottomColor: '#1A237E' },
  tabText: { fontSize: 15, color: '#888', fontWeight: '600' },
  tabTextActive: { color: '#1A237E', fontWeight: 'bold' },
  permissionBox: { padding: 28, alignItems: 'center' },
  permissionText: { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22, marginTop: 12 },
  emptyBox: { height: 120 },
  scannerWrapper: { alignItems: 'center', paddingVertical: 24 },
  scannerBox: { width: SCREEN_WIDTH * 0.76, height: SCREEN_WIDTH * 0.76, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' },
  scannerOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scannerTarget: { width: '70%', height: '70%', borderWidth: 3, borderColor: '#fff', borderRadius: 18, backgroundColor: 'transparent' },
  scannerGuide: { marginTop: 18, fontSize: 15, color: '#555', fontWeight: '600' },
  rescanBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A237E', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30, marginTop: 14 },
  rescanBtnText: { color: '#fff', fontWeight: '700' },
  manualWrapper: { alignItems: 'center', padding: 28 },
  manualTitle: { fontSize: 20, fontWeight: '800', color: '#333', marginBottom: 18 },
  manualInput: { width: '100%', backgroundColor: '#F5F5F7', borderRadius: 14, padding: 16, fontSize: 18, textAlign: 'center', letterSpacing: 1, fontWeight: '700', color: '#333', marginBottom: 16, borderWidth: 1, borderColor: '#E0E0E0' },
  searchBtn: { width: '100%', backgroundColor: '#1A237E', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  searchBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  resultSummaryBox: { backgroundColor: '#fff', borderRadius: 20, padding: 18, marginTop: 16, borderWidth: 1, borderColor: '#E6EAF5' },
  resultSummaryTitle: { fontSize: 17, color: '#1A237E', fontWeight: '900', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 12 },
  summaryLabel: { fontSize: 14, fontWeight: '700', color: '#777' },
  summaryValue: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '800', color: '#333' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', zIndex: 99 },
  loadingText: { color: '#fff', marginTop: 10, fontWeight: 'bold' }
});
