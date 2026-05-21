import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { collection, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

const { width } = Dimensions.get('window');
const NFC_ZONE_ICON = require('../assets/nfc-zone-icon.png');
const REGISTER_ICON = require('../assets/lost-and-found-icon.png');
const PRINTER_NAME_HINTS = ['XP', 'XPRINTER', 'PRINTER', 'DT326', 'XP-DT326B'];

const getDeviceAddress = (device) => device?.address || device?.id || '';
const getDeviceName = (device) => device?.name || '이름 없는 기기';

const isLikelyPrinter = (device) => {
  const name = getDeviceName(device).toUpperCase();
  return PRINTER_NAME_HINTS.some((hint) => name.includes(hint));
};

const mergeBluetoothDevices = (...deviceLists) => {
  const deviceMap = new Map();

  deviceLists.flat().filter(Boolean).forEach((device) => {
    const address = getDeviceAddress(device);
    if (!address) return;

    deviceMap.set(address, {
      ...device,
      address,
      id: device.id || address,
      name: getDeviceName(device),
      isLikelyPrinter: isLikelyPrinter(device)
    });
  });

  return Array.from(deviceMap.values()).sort((a, b) => {
    if (a.isLikelyPrinter !== b.isLikelyPrinter) return a.isLikelyPrinter ? -1 : 1;
    return getDeviceName(a).localeCompare(getDeviceName(b));
  });
};

const getBluetoothClassic = () => {
  const bluetoothModule = require('react-native-bluetooth-classic');
  return bluetoothModule.default || bluetoothModule;
};

const buildFakeSerial = () => {
  const now = new Date();
  const datePart = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${datePart}-TEST-${randomPart}`;
};

const buildTsplTestLabel = (serialNumber) => [
  'SIZE 50 mm,30 mm',
  'GAP 2 mm,0 mm',
  'DIRECTION 1',
  'CLS',
  'TEXT 30,25,"3",0,1,1,"LOST ITEM TEST"',
  `TEXT 30,70,"2",0,1,1,"S/N: ${serialNumber}"`,
  `QRCODE 30,115,L,5,A,0,"${serialNumber}"`,
  'PRINT 1,1',
  ''
].join('\r\n');

export default function MainScreen() {
  const router = useRouter();

  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [printerDevices, setPrinterDevices] = useState([]);
  const [isScanningPrinters, setIsScanningPrinters] = useState(false);
  const [isConnectingPrinter, setIsConnectingPrinter] = useState(false);
  const [connectedPrinter, setConnectedPrinter] = useState(null);
  const [printerStatus, setPrinterStatus] = useState('프린터 미연결');

  const menuItems = [
    { id: 'Zone', title: '구역 등록', image: NFC_ZONE_ICON, route: '/zone' },
    { id: 'Inquiry', title: '분실물 조회', icon: 'search', color: '#1A237E', route: '/inquiry' },
    { id: 'Return', title: '확인 및 반환', icon: 'qr-code', color: '#1A237E', route: '/return' },
    { id: 'History', title: '기록 관리', icon: 'time', color: '#1A237E', route: '/history' },
  ];

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

  const requestBluetoothPermissions = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('지원 안내', '블루투스 프린터 연결 테스트는 Android APK에서 지원됩니다.');
      return false;
    }

    const permissions = [];
    const androidVersion = Number(Platform.Version);

    if (androidVersion >= 31) {
      permissions.push(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
      );
    } else {
      permissions.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }

    const validPermissions = permissions.filter(Boolean);
    const granted = await PermissionsAndroid.requestMultiple(validPermissions);
    const deniedPermission = validPermissions.find(
      (permission) => granted[permission] !== PermissionsAndroid.RESULTS.GRANTED
    );

    if (deniedPermission) {
      Alert.alert('권한 필요', '프린터 검색과 연결을 위해 블루투스 및 위치 권한을 허용해 주세요.');
      return false;
    }

    return true;
  };

  const handleFindPrinters = async () => {
    if (isScanningPrinters) return;

    const hasPermissions = await requestBluetoothPermissions();
    if (!hasPermissions) return;

    setIsScanningPrinters(true);
    setPrinterStatus('프린터 검색 중...');

    try {
      const BluetoothClassic = getBluetoothClassic();
      const isAvailable = await BluetoothClassic.isBluetoothAvailable();
      if (!isAvailable) {
        Alert.alert('블루투스 미지원', '이 기기에서는 블루투스를 사용할 수 없습니다.');
        setPrinterStatus('블루투스 사용 불가');
        return;
      }

      const isEnabled = await BluetoothClassic.isBluetoothEnabled();
      if (!isEnabled) {
        const enabled = await BluetoothClassic.requestBluetoothEnabled();
        if (!enabled) {
          setPrinterStatus('블루투스 꺼짐');
          return;
        }
      }

      const bondedDevices = await BluetoothClassic.getBondedDevices();
      let discoveredDevices = [];

      try {
        discoveredDevices = await BluetoothClassic.startDiscovery();
      } finally {
        BluetoothClassic.cancelDiscovery().catch(() => {});
      }

      const mergedDevices = mergeBluetoothDevices(bondedDevices, discoveredDevices);
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

    const hasPermissions = await requestBluetoothPermissions();
    if (!hasPermissions) return;

    setIsConnectingPrinter(true);
    setPrinterStatus(`${getDeviceName(device)} 연결 중...`);

    try {
      const BluetoothClassic = getBluetoothClassic();
      await BluetoothClassic.cancelDiscovery().catch(() => {});

      let connectedDevice;
      try {
        connectedDevice = await BluetoothClassic.connectToDevice(address, {
          connectionType: 'binary',
          charset: 'ascii'
        });
      } catch {
        connectedDevice = await BluetoothClassic.connectToDevice(address, {
          connectionType: 'binary',
          charset: 'ascii',
          secureSocket: false
        });
      }

      const isConnected = await BluetoothClassic.isDeviceConnected(address);
      if (!isConnected) {
        throw new Error('프린터 연결 상태를 확인하지 못했습니다.');
      }

      setConnectedPrinter({
        address,
        id: connectedDevice?.id || device.id || address,
        name: getDeviceName(connectedDevice || device)
      });
      setPrinterStatus(`${getDeviceName(connectedDevice || device)} 연결됨`);
    } catch (error) {
      console.error('블루투스 연결 오류:', error);
      setConnectedPrinter(null);
      setPrinterStatus('프린터 연결 실패');
      Alert.alert('연결 실패', '프린터 전원이 켜져 있고 휴대폰과 페어링되어 있는지 확인해 주세요.');
    } finally {
      setIsConnectingPrinter(false);
    }
  };

  const handlePrintTestLabel = async () => {
    if (!connectedPrinter?.address) {
      Alert.alert('프린터 미연결', '먼저 프린터를 선택해서 연결해 주세요.');
      return;
    }

    setPrinterStatus('테스트 라벨 출력 중...');

    try {
      const BluetoothClassic = getBluetoothClassic();
      const isConnected = await BluetoothClassic.isDeviceConnected(connectedPrinter.address);
      if (!isConnected) {
        setConnectedPrinter(null);
        setPrinterStatus('프린터 연결 끊김');
        Alert.alert('연결 끊김', '프린터 연결이 끊겼습니다. 다시 연결해 주세요.');
        return;
      }

      const fakeSerial = buildFakeSerial();
      const labelCommand = buildTsplTestLabel(fakeSerial);
      await BluetoothClassic.writeToDevice(connectedPrinter.address, labelCommand, 'ascii');
      setPrinterStatus(`테스트 출력 완료: ${fakeSerial}`);
      Alert.alert('출력 전송 완료', `가짜 일련번호 ${fakeSerial} 라벨 출력을 전송했습니다.`);
    } catch (error) {
      console.error('테스트 출력 오류:', error);
      setPrinterStatus('테스트 출력 실패');
      Alert.alert('출력 실패', '프린터 출력 전송에 실패했습니다. 연결 상태와 프린터 용지를 확인해 주세요.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuButton} onPress={() => setIsMenuVisible(true)}>
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
              <View style={styles.bluetoothPanel}>
                <View style={styles.bluetoothPanelHeader}>
                  <View style={styles.bluetoothTitleRow}>
                    <Ionicons name="bluetooth" size={22} color="#1A237E" />
                    <Text style={styles.bluetoothPanelTitle}>블루투스 프린터</Text>
                  </View>
                  <Text style={[styles.printerStatusText, connectedPrinter && styles.printerStatusConnected]}>
                    {printerStatus}
                  </Text>
                </View>

                {connectedPrinter && (
                  <View style={styles.connectedPrinterBox}>
                    <Ionicons name="checkmark-circle" size={20} color="#2E7D32" />
                    <View style={styles.connectedPrinterTextBox}>
                      <Text style={styles.connectedPrinterName}>{connectedPrinter.name}</Text>
                      <Text style={styles.connectedPrinterAddress}>{connectedPrinter.address}</Text>
                    </View>
                  </View>
                )}

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

                <View style={styles.printerList}>
                  {printerDevices.length === 0 ? (
                    <Text style={styles.emptyPrinterText}>프린터 찾기를 눌러 주변 기기와 등록된 기기를 불러오세요.</Text>
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
                </View>

                <TouchableOpacity
                  style={[styles.testPrintButton, !connectedPrinter && styles.testPrintButtonDisabled]}
                  onPress={handlePrintTestLabel}
                  disabled={!connectedPrinter}
                >
                  <Ionicons name="qr-code-outline" size={20} color="#fff" />
                  <Text style={styles.testPrintButtonText}>가짜 일련번호/QR 테스트 인쇄</Text>
                </TouchableOpacity>
              </View>

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
  bluetoothPanel: { backgroundColor: '#F7F8FF', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#DDE5FF' },
  bluetoothPanelHeader: { marginBottom: 12 },
  bluetoothTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  bluetoothPanelTitle: { color: '#1A237E', fontSize: 17, fontWeight: '900' },
  printerStatusText: { color: '#666', fontSize: 12, fontWeight: '700' },
  printerStatusConnected: { color: '#2E7D32' },
  connectedPrinterBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', borderRadius: 12, padding: 10, marginBottom: 12, gap: 8 },
  connectedPrinterTextBox: { flex: 1 },
  connectedPrinterName: { color: '#2E7D32', fontSize: 14, fontWeight: '900' },
  connectedPrinterAddress: { color: '#4F6F52', fontSize: 11, fontWeight: '700', marginTop: 2 },
  bluetoothButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', padding: 14, borderRadius: 12, gap: 8, marginBottom: 12, borderWidth: 1, borderColor: '#DDE5FF' },
  bluetoothButtonText: { color: '#1A237E', fontSize: 16, fontWeight: '800' },
  printerList: { gap: 8, marginBottom: 12 },
  emptyPrinterText: { color: '#777', fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 10 },
  printerDeviceItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E8EAF6', gap: 8 },
  printerDeviceSelected: { borderColor: '#2E7D32', backgroundColor: '#F1F8E9' },
  printerDeviceName: { color: '#333', fontSize: 14, fontWeight: '900' },
  printerDeviceAddress: { color: '#777', fontSize: 11, fontWeight: '700', marginTop: 3 },
  printerHint: { color: '#1A237E', fontSize: 11, fontWeight: '800', marginTop: 4 },
  testPrintButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A237E', padding: 14, borderRadius: 12, gap: 8 },
  testPrintButtonDisabled: { backgroundColor: '#B0B4C8' },
  testPrintButtonText: { color: '#fff', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  dangerButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFEBEE', padding: 16, borderRadius: 12, gap: 10 },
  dangerButtonText: { color: '#D32F2F', fontSize: 16, fontWeight: '700' }
});
