import { Alert, PermissionsAndroid, Platform } from 'react-native';

const PRINTER_NAME_HINTS = ['XP', 'XPRINTER', 'PRINTER', 'DT326', 'XP-DT326B'];
const LABEL_WIDTH_DOTS = 400;
const QR_DOTS = 147;

let connectedPrinter = null;

export const getDeviceAddress = (device) => device?.address || device?.id || '';
export const getDeviceName = (device) => device?.name || '이름 없는 기기';

const getBluetoothClassic = () => {
  const bluetoothModule = require('react-native-bluetooth-classic');
  return bluetoothModule.default || bluetoothModule;
};

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

const requestBluetoothPermissions = async () => {
  if (Platform.OS !== 'android') {
    Alert.alert('지원 안내', '블루투스 프린터 연결은 Android APK에서 지원됩니다.');
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

const getReadyBluetoothClassic = async () => {
  const hasPermissions = await requestBluetoothPermissions();
  if (!hasPermissions) return null;

  const BluetoothClassic = getBluetoothClassic();
  const isAvailable = await BluetoothClassic.isBluetoothAvailable();
  if (!isAvailable) {
    Alert.alert('블루투스 미지원', '이 기기에서는 블루투스를 사용할 수 없습니다.');
    return null;
  }

  const isEnabled = await BluetoothClassic.isBluetoothEnabled();
  if (!isEnabled) {
    const enabled = await BluetoothClassic.requestBluetoothEnabled();
    if (!enabled) return null;
  }

  return BluetoothClassic;
};

export const getBondedBluetoothPrinters = async () => {
  const BluetoothClassic = await getReadyBluetoothClassic();
  if (!BluetoothClassic) return [];

  const bondedDevices = await BluetoothClassic.getBondedDevices();
  return mergeBluetoothDevices(bondedDevices);
};

export const findBluetoothPrinters = async () => {
  const BluetoothClassic = await getReadyBluetoothClassic();
  if (!BluetoothClassic) return [];

  const bondedDevices = await BluetoothClassic.getBondedDevices();
  let discoveredDevices = [];

  try {
    discoveredDevices = await BluetoothClassic.startDiscovery();
  } finally {
    BluetoothClassic.cancelDiscovery().catch(() => {});
  }

  return mergeBluetoothDevices(bondedDevices, discoveredDevices);
};

export const connectBluetoothPrinter = async (device) => {
  const address = getDeviceAddress(device);
  if (!address) throw new Error('프린터 주소를 확인할 수 없습니다.');

  const hasPermissions = await requestBluetoothPermissions();
  if (!hasPermissions) return null;

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

  connectedPrinter = {
    address,
    id: connectedDevice?.id || device.id || address,
    name: getDeviceName(connectedDevice || device)
  };

  return connectedPrinter;
};

export const disconnectBluetoothPrinter = async () => {
  if (!connectedPrinter?.address) return null;

  const BluetoothClassic = getBluetoothClassic();
  await BluetoothClassic.disconnectFromDevice(connectedPrinter.address);
  connectedPrinter = null;
  return null;
};

export const getConnectedPrinter = () => connectedPrinter;

export const isBluetoothPrinterConnected = async () => {
  if (!connectedPrinter?.address) return false;

  const BluetoothClassic = getBluetoothClassic();
  const isConnected = await BluetoothClassic.isDeviceConnected(connectedPrinter.address);
  if (!isConnected) connectedPrinter = null;
  return isConnected;
};

const sanitizeLabelText = (text, fallback = '-') => {
  const cleaned = String(text || fallback)
    .replace(/["\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || fallback;
};

const getCenteredTextX = (text, dotsPerChar) => {
  const estimatedWidth = String(text || '').length * dotsPerChar;
  return Math.max(0, Math.round((LABEL_WIDTH_DOTS - estimatedWidth) / 2));
};

const buildFakeSerial = () => {
  const now = new Date();
  const datePart = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${datePart}-TEST-${randomPart}`;
};

export const buildLostItemLabelCommand = (item) => {
  const serialNumber = sanitizeLabelText(item?.serialNumber || item?.serial || 'NO-SERIAL');
  const qrX = Math.round((LABEL_WIDTH_DOTS - QR_DOTS) / 2);
  const serialX = getCenteredTextX(serialNumber, 15);

  return [
    'SIZE 50 mm,30 mm',
    'GAP 2 mm,0 mm',
    'DIRECTION 1',
    'CLS',
    `QRCODE ${qrX},26,L,7,A,0,"${serialNumber}"`,
    `TEXT ${serialX},198,"3",0,1,1,"${serialNumber}"`,
    'PRINT 1,1',
    ''
  ].join('\r\n');
};

export const printLostItemLabel = async (item) => {
  if (!connectedPrinter?.address) {
    throw new Error('프린터가 연결되어 있지 않습니다.');
  }

  const isConnected = await isBluetoothPrinterConnected();
  if (!isConnected) {
    throw new Error('프린터가 연결되어 있지 않습니다.');
  }

  const BluetoothClassic = getBluetoothClassic();
  const labelCommand = buildLostItemLabelCommand(item);
  await BluetoothClassic.writeToDevice(connectedPrinter.address, labelCommand, 'ascii');
};

export const printTestLabel = async () => {
  const serialNumber = buildFakeSerial();
  await printLostItemLabel({
    sub_category: 'TEST LABEL',
    serialNumber
  });
  return serialNumber;
};
