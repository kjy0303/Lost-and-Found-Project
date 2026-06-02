import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import {
  connectBluetoothPrinter,
  disconnectBluetoothPrinter,
  findBluetoothPrinters,
  getConnectedPrinter,
  getDeviceAddress,
  getDeviceName,
  isBluetoothPrinterConnected,
  printTestLabel
} from '../utils/bluetoothPrinter';
import { readNfcTag } from '../utils/nfc';

const { width } = Dimensions.get('window');
const NFC_ZONE_ICON = require('../assets/nfc-zone-icon.png');
const REGISTER_ICON = require('../assets/lost-and-found-icon.png');
const ZONE_OPTIONS = ['A구역', 'B구역', 'C구역', '이관대기'];

export default function MainScreen() {
  const router = useRouter();

  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPrinterModalVisible, setIsPrinterModalVisible] = useState(false);
  const [printerDevices, setPrinterDevices] = useState([]);
  const [isScanningPrinters, setIsScanningPrinters] = useState(false);
  const [isConnectingPrinter, setIsConnectingPrinter] = useState(false);
  const [isDisconnectingPrinter, setIsDisconnectingPrinter] = useState(false);
  const [isNfcZoneModalVisible, setIsNfcZoneModalVisible] = useState(false);
  const [isReadingNfcZone, setIsReadingNfcZone] = useState(false);
  const [isSavingNfcZone, setIsSavingNfcZone] = useState(false);
  const [nfcZoneTagId, setNfcZoneTagId] = useState('');
  const [nfcZoneStatus, setNfcZoneStatus] = useState('NFC 태그 읽기를 눌러 등록할 태그를 확인하세요.');
  const [connectedPrinter, setConnectedPrinter] = useState(getConnectedPrinter());
  const [printerStatus, setPrinterStatus] = useState('프린터 미연결');

  const menuItems = [
    { id: 'Zone', title: '구역 등록', image: NFC_ZONE_ICON, route: '/zone' },
    { id: 'Inquiry', title: '분실물 조회', icon: 'search', color: '#1A237E', route: '/inquiry' },
    { id: 'Return', title: '확인 및 반환', icon: 'qr-code', color: '#1A237E', route: '/return' },
    { id: 'History', title: '기록 관리', icon: 'time', color: '#1A237E', route: '/history' },
  ];

  const handleOpenMenu = () => {
    const currentPrinter = getConnectedPrinter();
    setConnectedPrinter(currentPrinter);
    setPrinterStatus(currentPrinter ? `${currentPrinter.name} 연결 확인 중...` : '프린터 미연결');
    setIsMenuVisible(true);

    if (currentPrinter?.address) {
      isBluetoothPrinterConnected()
        .then((isConnected) => {
          const latestPrinter = getConnectedPrinter();
          setConnectedPrinter(latestPrinter);
          setPrinterStatus(isConnected && latestPrinter ? `${latestPrinter.name} 연결됨` : '프린터 미연결');
        })
        .catch(() => {
          setConnectedPrinter(null);
          setPrinterStatus('프린터 상태 확인 실패');
        });
    }
  };

  const handleDeleteAllData = async () => {
    Alert.alert(
      '경고',
      '정말로 등록된 모든 분실물 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '전체 삭제',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              const querySnapshot = await getDocs(collection(db, 'lostItems'));
              const deletePromises = [];
              querySnapshot.forEach((document) => {
                deletePromises.push(deleteDoc(doc(db, 'lostItems', document.id)));
              });
              await Promise.all(deletePromises);

              Alert.alert('완료', '모든 데이터가 깔끔하게 삭제되었습니다.');
              setIsMenuVisible(false);
            } catch (error) {
              console.error('삭제 중 오류 발생:', error);
              Alert.alert('오류', '데이터 삭제에 실패했습니다.');
            } finally {
              setIsDeleting(false);
            }
          }
        }
      ]
    );
  };

  const handleFindPrinters = async () => {
    if (isScanningPrinters) return;

    setIsScanningPrinters(true);
    setPrinterStatus('프린터 검색 중...');

    try {
      const mergedDevices = await findBluetoothPrinters();
      setPrinterDevices(mergedDevices);
      setPrinterStatus(
        mergedDevices.length > 0
          ? `검색 완료: ${mergedDevices.length}개 기기`
          : '검색된 기기가 없습니다'
      );
    } catch (error) {
      console.error('블루투스 검색 오류:', error);
      setPrinterStatus('프린터 검색 실패');
      Alert.alert('검색 실패', '블루투스 프린터를 찾는 중 문제가 발생했습니다. APK로 실행 중인지 확인해 주세요.');
    } finally {
      setIsScanningPrinters(false);
    }
  };

  const handleConnectPrinter = async (device) => {
    const address = getDeviceAddress(device);
    if (!address || isConnectingPrinter) return;

    setIsConnectingPrinter(true);
    setPrinterStatus(`${getDeviceName(device)} 연결 중...`);

    try {
      const nextPrinter = await connectBluetoothPrinter(device);
      if (!nextPrinter) {
        setPrinterStatus('프린터 미연결');
        return;
      }

      setConnectedPrinter(nextPrinter);
      setPrinterStatus(`${nextPrinter.name} 연결됨`);
      setIsPrinterModalVisible(false);
    } catch (error) {
      console.error('블루투스 연결 오류:', error);
      setConnectedPrinter(null);
      setPrinterStatus('프린터 연결 실패');
      Alert.alert('연결 실패', '프린터 전원이 켜져 있고 휴대폰과 페어링되어 있는지 확인해 주세요.');
    } finally {
      setIsConnectingPrinter(false);
    }
  };

  const handleDisconnectPrinter = async () => {
    if (!connectedPrinter?.address || isDisconnectingPrinter) {
      setPrinterStatus('프린터 미연결');
      return;
    }

    setIsDisconnectingPrinter(true);
    setPrinterStatus('프린터 연결 해제 중...');

    try {
      await disconnectBluetoothPrinter();
      setConnectedPrinter(null);
      setPrinterStatus('프린터 미연결');
    } catch (error) {
      console.error('블루투스 연결 해제 오류:', error);
      Alert.alert('연결 해제 실패', '프린터 연결을 끊는 중 문제가 발생했습니다.');
      setPrinterStatus(`${connectedPrinter.name} 연결됨`);
    } finally {
      setIsDisconnectingPrinter(false);
    }
  };

  const openNfcZoneModal = () => {
    setNfcZoneTagId('');
    setNfcZoneStatus('NFC 태그 읽기를 눌러 등록할 태그를 확인하세요.');
    setIsNfcZoneModalVisible(true);
  };

  const closeNfcZoneModal = () => {
    if (isReadingNfcZone || isSavingNfcZone) return;

    setIsNfcZoneModalVisible(false);
    setNfcZoneTagId('');
    setNfcZoneStatus('NFC 태그 읽기를 눌러 등록할 태그를 확인하세요.');
  };

  const handleReadNfcZoneTag = async () => {
    if (isReadingNfcZone) return;

    setIsReadingNfcZone(true);
    setNfcZoneStatus('NFC 태그를 휴대폰에 가까이 대주세요.');

    try {
      const { tagId } = await readNfcTag({
        alertMessage: '등록할 보관구역 NFC 태그를 휴대폰에 가까이 대주세요.',
      });
      const zoneRef = doc(db, 'storageZones', tagId);
      const zoneSnap = await getDoc(zoneRef);
      const savedZoneName = zoneSnap.exists() ? zoneSnap.data()?.zoneName || '' : '';

      setNfcZoneTagId(tagId);
      setNfcZoneStatus(
        savedZoneName
          ? `현재 등록된 구역: ${savedZoneName}\n다른 구역을 선택하면 변경됩니다.`
          : '등록되지 않은 태그입니다. 등록할 구역을 선택해주세요.'
      );
    } catch (error) {
      setNfcZoneStatus('태그를 읽지 못했습니다. 다시 시도해주세요.');
      Alert.alert('NFC 오류', String(error?.message || error));
    } finally {
      setIsReadingNfcZone(false);
    }
  };

  const handleSaveNfcZoneTag = async (zoneName) => {
    if (!nfcZoneTagId) {
      Alert.alert('알림', '먼저 NFC 태그를 읽어주세요.');
      return;
    }

    if (isSavingNfcZone) return;

    setIsSavingNfcZone(true);
    setNfcZoneStatus(`${zoneName}으로 저장 중...`);

    try {
      const zoneRef = doc(db, 'storageZones', nfcZoneTagId);
      const zoneSnap = await getDoc(zoneRef);
      const payload = {
        tagId: nfcZoneTagId,
        zoneName,
        updatedAt: serverTimestamp(),
      };

      if (!zoneSnap.exists()) {
        payload.createdAt = serverTimestamp();
      }

      await setDoc(zoneRef, payload, { merge: true });
      setNfcZoneStatus(`${zoneName} 태그로 등록되었습니다.`);
      Alert.alert('등록 완료', `${zoneName} 태그로 저장되었습니다.`);
    } catch (error) {
      console.error('NFC 구역 태그 저장 오류:', error);
      setNfcZoneStatus('태그 저장 중 문제가 발생했습니다.');
      Alert.alert('저장 실패', 'NFC 보관구역 태그 저장 중 문제가 발생했습니다.');
    } finally {
      setIsSavingNfcZone(false);
    }
  };

  const handlePrintTestLabel = async () => {
    if (!connectedPrinter?.address) {
      Alert.alert('프린터 미연결', '먼저 프린터를 선택해서 연결해 주세요.');
      return;
    }

    setPrinterStatus('테스트 라벨 출력 중...');

    try {
      const fakeSerial = await printTestLabel();
      setPrinterStatus(`테스트 출력 완료: ${fakeSerial}`);
      Alert.alert('출력 전송 완료', `가짜 일련번호 ${fakeSerial} 라벨 출력을 전송했습니다.`);
    } catch (error) {
      console.error('테스트 출력 오류:', error);
      setPrinterStatus('테스트 출력 실패');
      if (String(error?.message || '').includes('연결되어 있지')) {
        setConnectedPrinter(null);
      }
      Alert.alert('출력 실패', String(error?.message || '프린터 출력 전송에 실패했습니다.'));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuButton} onPress={handleOpenMenu}>
          <Ionicons name="menu" size={36} color="#1A237E" />
        </TouchableOpacity>

        <Text style={styles.greeting}>오늘도 힘내세요!{'\n'}관리자님!</Text>
      </View>

      <View style={styles.centralArea}>
        <Image
          source={require('../assets/lost-and-found-icon.png')}
          style={styles.mainImage}
          resizeMode="contain"
        />
      </View>

      <View style={styles.menuArea}>
        <TouchableOpacity
          style={styles.registerWideCard}
          activeOpacity={0.78}
          onPress={() => router.push('/register')}
        >
          <Image source={REGISTER_ICON} style={styles.registerMenuImage} resizeMode="contain" />
          <View style={styles.registerTextBox}>
            <Text style={styles.registerTitle}>분실물 등록</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#1A237E" />
        </TouchableOpacity>

        <View style={styles.gridContainer}>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => router.push(item.route)}
            >
              {item.image ? (
                <Image source={item.image} style={styles.menuImage} resizeMode="contain" />
              ) : (
                <View style={styles.iconContainer}>
                  <Ionicons name={item.icon} size={30} color={item.color} />
                </View>
              )}
              <Text style={styles.cardTitle}>{item.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Modal visible={isMenuVisible} transparent={true} animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsMenuVisible(false)}>
          <View style={styles.sideMenu}>
            <View style={styles.sideMenuHeader}>
              <Text style={styles.sideMenuTitle}>설정 메뉴</Text>
              <TouchableOpacity onPress={() => setIsMenuVisible(false)}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.statusCard}>
                <Text style={styles.statusLabel}>블루투스 연결 상태</Text>
                <View style={styles.statusRow}>
                  <Ionicons
                    name={connectedPrinter ? 'checkmark-circle' : 'alert-circle-outline'}
                    size={22}
                    color={connectedPrinter ? '#2E7D32' : '#777'}
                  />
                  <View style={styles.statusTextBox}>
                    <Text style={[styles.statusTitle, connectedPrinter && styles.statusTitleConnected]}>
                      {connectedPrinter ? '프린터 연결됨' : '프린터 미연결'}
                    </Text>
                    <Text style={styles.statusSubText}>
                      {connectedPrinter ? `${connectedPrinter.name} (${connectedPrinter.address})` : printerStatus}
                    </Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity style={styles.settingsActionButton} onPress={() => setIsPrinterModalVisible(true)}>
                <Ionicons name="bluetooth" size={22} color="#1A237E" />
                <Text style={styles.settingsActionText}>블루투스 연결</Text>
                <Ionicons name="chevron-forward" size={20} color="#1A237E" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.settingsActionButton, !connectedPrinter && styles.settingsActionButtonDisabled]}
                onPress={handleDisconnectPrinter}
                disabled={!connectedPrinter || isDisconnectingPrinter}
              >
                {isDisconnectingPrinter ? (
                  <ActivityIndicator size="small" color="#1A237E" />
                ) : (
                  <Ionicons name="unlink-outline" size={22} color={connectedPrinter ? '#1A237E' : '#9AA0B8'} />
                )}
                <Text style={[styles.settingsActionText, !connectedPrinter && styles.settingsActionTextDisabled]}>
                  블루투스 연결끊기
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.settingsActionButton} onPress={openNfcZoneModal}>
                <Ionicons name="radio-outline" size={22} color="#1A237E" />
                <Text style={styles.settingsActionText}>NFC 구역 태그 등록</Text>
                <Ionicons name="chevron-forward" size={20} color="#1A237E" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.testPrintButton, !connectedPrinter && styles.testPrintButtonDisabled]}
                onPress={handlePrintTestLabel}
                disabled={!connectedPrinter}
              >
                <Ionicons name="qr-code-outline" size={20} color="#fff" />
                <Text style={styles.testPrintButtonText}>QR 테스트 인쇄</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.dangerButton} onPress={handleDeleteAllData} disabled={isDeleting}>
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#D32F2F" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={22} color="#D32F2F" />
                    <Text style={styles.dangerButtonText}>데이터 전체 삭제</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={isPrinterModalVisible} transparent={true} animationType="fade">
        <View style={styles.printerModalOverlay}>
          <View style={styles.printerModalBox}>
            <View style={styles.printerModalHeader}>
              <Text style={styles.printerModalTitle}>블루투스 프린터 연결</Text>
              <TouchableOpacity onPress={() => setIsPrinterModalVisible(false)}>
                <Ionicons name="close" size={26} color="#333" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.bluetoothButton}
              onPress={handleFindPrinters}
              disabled={isScanningPrinters}
            >
              {isScanningPrinters ? (
                <ActivityIndicator size="small" color="#1A237E" />
              ) : (
                <Ionicons name="search" size={20} color="#1A237E" />
              )}
              <Text style={styles.bluetoothButtonText}>
                {isScanningPrinters ? '프린터 찾는 중...' : '프린터 찾기'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.printerModalStatus}>{printerStatus}</Text>

            <ScrollView style={styles.printerModalList} showsVerticalScrollIndicator={false}>
              {printerDevices.length === 0 ? (
                <Text style={styles.emptyPrinterText}>프린터 찾기를 눌러 등록된 기기와 주변 기기를 불러오세요.</Text>
              ) : (
                printerDevices.map((device) => {
                  const address = getDeviceAddress(device);
                  const isSelected = connectedPrinter?.address === address;

                  return (
                    <TouchableOpacity
                      key={address}
                      style={[styles.printerDeviceItem, isSelected && styles.printerDeviceSelected]}
                      onPress={() => handleConnectPrinter(device)}
                      disabled={isConnectingPrinter}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.printerDeviceName}>{getDeviceName(device)}</Text>
                        <Text style={styles.printerDeviceAddress}>{address}</Text>
                        {device.isLikelyPrinter && <Text style={styles.printerHint}>프린터 후보</Text>}
                      </View>
                      {isConnectingPrinter && !isSelected ? (
                        <ActivityIndicator size="small" color="#1A237E" />
                      ) : (
                        <Ionicons name={isSelected ? 'checkmark-circle' : 'link-outline'} size={22} color={isSelected ? '#2E7D32' : '#1A237E'} />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={isNfcZoneModalVisible} transparent={true} animationType="fade">
        <View style={styles.printerModalOverlay}>
          <View style={styles.nfcZoneModalBox}>
            <View style={styles.printerModalHeader}>
              <Text style={styles.printerModalTitle}>NFC 구역 태그 등록</Text>
              <TouchableOpacity onPress={closeNfcZoneModal} disabled={isReadingNfcZone || isSavingNfcZone}>
                <Ionicons name="close" size={26} color="#333" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.bluetoothButton}
              onPress={handleReadNfcZoneTag}
              disabled={isReadingNfcZone || isSavingNfcZone}
            >
              {isReadingNfcZone ? (
                <ActivityIndicator size="small" color="#1A237E" />
              ) : (
                <Ionicons name="radio-outline" size={20} color="#1A237E" />
              )}
              <Text style={styles.bluetoothButtonText}>
                {isReadingNfcZone ? '태그 읽는 중...' : 'NFC 태그 읽기'}
              </Text>
            </TouchableOpacity>

            <View style={styles.nfcStatusBox}>
              <Text style={styles.nfcStatusLabel}>태그 상태</Text>
              <Text style={styles.nfcStatusText}>{nfcZoneStatus}</Text>
              {nfcZoneTagId ? (
                <Text style={styles.nfcTagIdText} numberOfLines={1} ellipsizeMode="middle">
                  {nfcZoneTagId}
                </Text>
              ) : null}
            </View>

            <View style={styles.nfcZoneOptionGrid}>
              {ZONE_OPTIONS.map((zone) => (
                <TouchableOpacity
                  key={zone}
                  style={[styles.nfcZoneOptionButton, !nfcZoneTagId && styles.nfcZoneOptionButtonDisabled]}
                  onPress={() => handleSaveNfcZoneTag(zone)}
                  disabled={!nfcZoneTagId || isReadingNfcZone || isSavingNfcZone}
                >
                  <Text style={styles.nfcZoneOptionText}>{zone}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F7' },
  header: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 10,
    alignItems: 'center',
    position: 'relative'
  },
  menuButton: { position: 'absolute', right: 24, top: 60, zIndex: 10 },
  greeting: {
    fontSize: 32,
    fontWeight: '900',
    color: '#1A237E',
    textAlign: 'center',
    lineHeight: 40
  },
  centralArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 8,
    minHeight: 120
  },
  mainImage: { width: '100%', height: '100%' },
  menuArea: { paddingHorizontal: 24, paddingBottom: 10 },
  registerWideCard: {
    width: '100%',
    minHeight: 82,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4
  },
  registerMenuImage: {
    width: 64,
    height: 64,
    marginRight: 16
  },
  registerTextBox: { flex: 1 },
  registerTitle: { fontSize: 20, fontWeight: '900', color: '#1A237E' },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  card: {
    width: (width - 64) / 2,
    aspectRatio: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F0F4FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12
  },
  menuImage: {
    width: 82,
    height: 82,
    marginBottom: 4
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#333333' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-start', alignItems: 'flex-end' },
  sideMenu: { width: '75%', height: '100%', backgroundColor: '#fff', padding: 24, paddingTop: 60, shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.2, elevation: 5 },
  sideMenuHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  sideMenuTitle: { fontSize: 20, fontWeight: '800', color: '#1A237E' },
  statusCard: { backgroundColor: '#F7F8FF', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#DDE5FF' },
  statusLabel: { color: '#5D6480', fontSize: 12, fontWeight: '800', marginBottom: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusTextBox: { flex: 1 },
  statusTitle: { color: '#333', fontSize: 16, fontWeight: '900' },
  statusTitleConnected: { color: '#2E7D32' },
  statusSubText: { color: '#777', fontSize: 11, fontWeight: '700', marginTop: 3, lineHeight: 16 },
  settingsActionButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F4FF', padding: 16, borderRadius: 12, gap: 10, marginBottom: 12, borderWidth: 1, borderColor: '#DDE5FF' },
  settingsActionButtonDisabled: { backgroundColor: '#F5F5F7', borderColor: '#E5E7F0' },
  settingsActionText: { flex: 1, color: '#1A237E', fontSize: 16, fontWeight: '800' },
  settingsActionTextDisabled: { color: '#9AA0B8' },
  printerModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 22 },
  printerModalBox: { width: '100%', maxHeight: '78%', backgroundColor: '#fff', borderRadius: 20, padding: 18 },
  printerModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#eee', marginBottom: 14 },
  printerModalTitle: { color: '#1A237E', fontSize: 18, fontWeight: '900' },
  printerModalStatus: { color: '#666', fontSize: 12, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  printerModalList: { maxHeight: 360 },
  bluetoothButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', padding: 14, borderRadius: 12, gap: 8, marginBottom: 12, borderWidth: 1, borderColor: '#DDE5FF' },
  bluetoothButtonText: { color: '#1A237E', fontSize: 16, fontWeight: '800' },
  nfcZoneModalBox: { width: '100%', maxWidth: 390, backgroundColor: '#fff', borderRadius: 20, padding: 18 },
  nfcStatusBox: { backgroundColor: '#F7F8FF', borderRadius: 14, borderWidth: 1, borderColor: '#DDE5FF', padding: 14, marginBottom: 12 },
  nfcStatusLabel: { color: '#5D6480', fontSize: 12, fontWeight: '800', marginBottom: 6 },
  nfcStatusText: { color: '#333', fontSize: 14, fontWeight: '800', lineHeight: 20 },
  nfcTagIdText: { color: '#1A237E', fontSize: 12, fontWeight: '900', marginTop: 8 },
  nfcZoneOptionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nfcZoneOptionButton: { flexGrow: 1, flexBasis: '45%', alignItems: 'center', backgroundColor: '#1A237E', borderRadius: 12, paddingVertical: 13 },
  nfcZoneOptionButtonDisabled: { backgroundColor: '#B0B4C8' },
  nfcZoneOptionText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  emptyPrinterText: { color: '#777', fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 10 },
  printerDeviceItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E8EAF6', gap: 8, marginBottom: 8 },
  printerDeviceSelected: { borderColor: '#2E7D32', backgroundColor: '#F1F8E9' },
  printerDeviceName: { color: '#333', fontSize: 14, fontWeight: '900' },
  printerDeviceAddress: { color: '#777', fontSize: 11, fontWeight: '700', marginTop: 3 },
  printerHint: { color: '#1A237E', fontSize: 11, fontWeight: '800', marginTop: 4 },
  testPrintButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A237E', padding: 14, borderRadius: 12, gap: 8, marginBottom: 12 },
  testPrintButtonDisabled: { backgroundColor: '#B0B4C8' },
  testPrintButtonText: { color: '#fff', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  dangerButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFEBEE', padding: 16, borderRadius: 12, gap: 10 },
  dangerButtonText: { color: '#D32F2F', fontSize: 16, fontWeight: '700' }
});
