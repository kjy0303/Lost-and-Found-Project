import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useRouter } from 'expo-router';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, Image, Modal,
  SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { db } from '../../firebaseConfig';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const MAIN_CATEGORIES = [
  '가방', '귀금속', '도서용품', '서류', '산업용품', '쇼핑백', '스포츠용품', 
  '악기', '유가증권', '의류', '자동차용품', '전자기기', '지갑', '컴퓨터', 
  '카메라', '현금', '휴대폰', '증명서', '기타물품'
];

export default function ReturnScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  
  const [viewMode, setViewState] = useState('scan'); 
  const [scanned, setScanned] = useState(false);
  const [serialInput, setSerialInput] = useState("");
  const [loading, setLoading] = useState(false);
  
  const [itemData, setItemData] = useState(null);
  const [itemDocId, setItemDocId] = useState(null); 
  
  const [isEditing, setIsEditing] = useState(false);
  const [editableData, setEditableData] = useState({});
  const [isCategoryModalVisible, setIsCategoryModalVisible] = useState(false);

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.permissionText}>QR 스캔을 위해 카메라 권한이 필요합니다.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>권한 허용하기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const fetchItemBySerial = async (serialNumber) => {
    if (!serialNumber.trim()) return Alert.alert("알림", "일련번호를 입력해주세요.");
    
    setLoading(true);
    try {
      const q = query(collection(db, "lostItems"), where("serialNumber", "==", serialNumber.trim()));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        Alert.alert(
          "검색 실패", 
          "등록되지 않은 일련번호입니다.\n화면의 '다시 스캔하기' 버튼을 눌러주세요.", 
          [{ text: "확인", style: "cancel" }]
        );
      } else {
        const docSnap = querySnapshot.docs[0];
        setItemData(docSnap.data());
        setItemDocId(docSnap.id);
        setIsEditing(false); 
        setViewState('result');
      }
    } catch (error) {
      Alert.alert("오류", "데이터 조회 중 문제가 발생했습니다.", [{ text: "확인", style: "cancel" }]);
    } finally {
      setLoading(false);
    }
  };

  const handleBarCodeScanned = ({ type, data }) => {
    const isSerialFormat = /^[A-Za-z0-9-]+$/.test(data);
    
    if (!isSerialFormat) {
      return; 
    }

    setScanned(true);
    fetchItemBySerial(data);
  };

  const handleResetSearch = () => {
    setViewState('scan');
    setScanned(false);
    setItemData(null);
    setSerialInput("");
    setIsEditing(false);
  };

  // 🌟 6자리-4자리-4자리 자동 하이픈 로직 완벽 수정
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

  const handleStatusChange = (newStatus) => {
    if (itemData.status === newStatus) {
      return Alert.alert("알림", `이미 ${newStatus} 처리된 물품입니다.`);
    }

    Alert.alert(
      "상태 변경", 
      `'${itemData.sub_category}' 물품을 [${newStatus}] 처리하시겠습니까?\n(기록은 보존됩니다.)`,
      [
        { text: "취소", style: "cancel" },
        { text: "확인", style: "destructive", onPress: async () => {
            setLoading(true);
            try {
              const expireDate = new Date();
              expireDate.setFullYear(expireDate.getFullYear() + 1);

              const itemRef = doc(db, "lostItems", itemDocId);
              await updateDoc(itemRef, { 
                status: newStatus,
                updatedAt: new Date().toISOString(),
                expireAt: expireDate 
              });
              
              setItemData({...itemData, status: newStatus});
              Alert.alert("처리 완료", `성공적으로 ${newStatus} 처리되었습니다.`);
            } catch (error) {
              Alert.alert("오류", "상태 변경 중 문제가 발생했습니다.");
            } finally {
              setLoading(false);
            }
        }}
      ]
    );
  };

  const startEditing = () => {
    setEditableData({
      main_category: itemData.main_category || '',
      sub_category: itemData.sub_category || '',
      feature: itemData.feature || '',
      foundLocation: itemData.foundLocation || '',
      specialNote: itemData.specialNote || '',
      pi_name: itemData.pi_name || '',
      pi_resident: itemData.pi_resident || '',
      pi_card: itemData.pi_card || '',
      pi_passport: itemData.pi_passport || ''
    });
    setIsEditing(true);
  };

  const saveEditedData = async () => {
    setLoading(true);
    try {
      const itemRef = doc(db, "lostItems", itemDocId);
      await updateDoc(itemRef, editableData);
      
      setItemData({ ...itemData, ...editableData });
      setIsEditing(false);
      Alert.alert("수정 완료", "분실물 정보가 성공적으로 수정되었습니다.");
    } catch (error) {
      Alert.alert("오류", "수정 사항을 저장하는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/')} style={styles.homeButton}>
          <Ionicons name="home-outline" size={28} color="#1A237E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>확인 및 반환</Text>
        <View style={{ width: 28 }} /> 
      </View>

      {(viewMode === 'scan' || viewMode === 'manual') && (
        <View style={styles.container}>
          <View style={styles.tabContainer}>
            <TouchableOpacity style={[styles.tabBtn, viewMode === 'scan' && styles.tabActive]} onPress={() => { setViewState('scan'); setScanned(false); }}>
              <Text style={[styles.tabText, viewMode === 'scan' && styles.tabTextActive]}>QR 스캔</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabBtn, viewMode === 'manual' && styles.tabActive]} onPress={() => setViewState('manual')}>
              <Text style={[styles.tabText, viewMode === 'manual' && styles.tabTextActive]}>일련번호 수동입력</Text>
            </TouchableOpacity>
          </View>

          {viewMode === 'scan' && (
            <View style={styles.scannerWrapper}>
              <View style={styles.scannerBox}>
                <CameraView 
                  style={StyleSheet.absoluteFillObject} 
                  facing="back"
                  onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
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
          )}

          {viewMode === 'manual' && (
            <View style={styles.manualWrapper}>
              <Ionicons name="barcode-outline" size={60} color="#1A237E" style={{ marginBottom: 20 }} />
              <Text style={styles.manualTitle}>일련번호를 입력해주세요</Text>
              {/* 🌟 maxLength 제한, 영어/숫자 키보드, 하이픈 함수 추가 */}
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
                <Text style={styles.searchBtnText}>조회하기</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {viewMode === 'result' && itemData && (
        <View style={styles.resultContainer}>
          <View style={styles.fixedImageBackground}>
            {itemData.imageUrl ? (
              <Image source={{ uri: itemData.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#eaeaea' }}>
                <Ionicons name="image-outline" size={60} color="#ccc" />
                <Text style={{color:'#999', marginTop:10}}>사진 없음</Text>
              </View>
            )}
          </View>

          <ScrollView 
            style={StyleSheet.absoluteFillObject} 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.detailBox}>
              
              {isEditing ? (
                <View style={styles.actionBtnRow}>
                  <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#999'}]} onPress={() => setIsEditing(false)}>
                    <Text style={styles.actionBtnText}>수정 취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#2E7D32'}]} onPress={saveEditedData}>
                    <Text style={styles.actionBtnText}>저장하기</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.actionBtnRow}>
                  <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#999'}]} onPress={handleResetSearch}>
                    <Text style={styles.actionBtnText}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#FF9800'}]} onPress={startEditing}>
                    <Text style={styles.actionBtnText}>수정</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#7B1FA2'}]} onPress={() => handleStatusChange('폐기/이관')}>
                    <Text style={styles.actionBtnText}>이관</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, {backgroundColor: itemData.status === '반환완료' ? '#ccc' : '#1A237E'}]} onPress={() => handleStatusChange('반환완료')}>
                    <Text style={styles.actionBtnText}>반환</Text>
                  </TouchableOpacity>
                </View>
              )}

              {isEditing ? (
                <View style={{ marginTop: 25 }}>
                  <Text style={styles.editLabel}>대분류</Text>
                  <TouchableOpacity style={styles.dropdownInput} onPress={() => setIsCategoryModalVisible(true)}>
                    <Text style={styles.dropdownText}>{editableData.main_category || "대분류 선택"}</Text>
                    <Ionicons name="chevron-down" size={20} color="#666" />
                  </TouchableOpacity>

                  <Text style={styles.editLabel}>소분류 (물품 이름)</Text>
                  <TextInput style={styles.inputField} value={editableData.sub_category} onChangeText={t => setEditableData({...editableData, sub_category: t})} />

                  <Text style={styles.editLabel}>주요 특징</Text>
                  <TextInput style={styles.inputField} value={editableData.feature} onChangeText={t => setEditableData({...editableData, feature: t})} />

                  <Text style={styles.editLabel}>습득 장소</Text>
                  <TextInput style={styles.inputField} value={editableData.foundLocation} onChangeText={t => setEditableData({...editableData, foundLocation: t})} />

                  <Text style={styles.editLabel}>관리자 특이사항</Text>
                  <TextInput style={[styles.inputField, {height: 80, textAlignVertical: 'top'}]} multiline={true} value={editableData.specialNote} onChangeText={t => setEditableData({...editableData, specialNote: t})} />

                  <View style={styles.piEditBox}>
                    <Text style={styles.piEditBoxTitle}>🚨 개인정보 (선택)</Text>
                    <Text style={styles.editLabel}>이름</Text>
                    <TextInput style={styles.inputField} placeholder="예: 홍*동" value={editableData.pi_name} onChangeText={t => setEditableData({...editableData, pi_name: t})} />
                    <Text style={styles.editLabel}>주민등록번호</Text>
                    <TextInput style={styles.inputField} placeholder="예: 900101-*******" value={editableData.pi_resident} onChangeText={t => setEditableData({...editableData, pi_resident: t})} />
                    <Text style={styles.editLabel}>카드번호</Text>
                    <TextInput style={styles.inputField} placeholder="예: 1234-5678-****" value={editableData.pi_card} onChangeText={t => setEditableData({...editableData, pi_card: t})} />
                    <Text style={styles.editLabel}>여권번호</Text>
                    <TextInput style={styles.inputField} placeholder="예: M12*****" value={editableData.pi_passport} onChangeText={t => setEditableData({...editableData, pi_passport: t})} />
                  </View>
                </View>
              ) : (
                <View style={{ marginTop: 25 }}>
                  <View style={styles.titleRow}>
                    <View style={[styles.statusBadge, itemData.status === '보관중' ? styles.statusActive : styles.statusDone]}>
                      <Text style={[styles.statusText, itemData.status !== '보관중' && {color:'#666'}]}>{itemData.status}</Text>
                    </View>
                    <Text style={styles.serialText}>{itemData.serialNumber || '일련번호 없음'}</Text>
                  </View>

                  <Text style={styles.mainItemName}>{itemData.feature}</Text>
                  
                  <View style={styles.infoRow}><Text style={styles.infoLabel}>대분류</Text><Text style={styles.infoValue}>{itemData.main_category}</Text></View>
                  <View style={styles.infoRow}><Text style={styles.infoLabel}>소분류</Text><Text style={styles.infoValue}>{itemData.sub_category}</Text></View>
                  <View style={styles.infoRow}><Text style={styles.infoLabel}>습득일</Text><Text style={styles.infoValue}>{new Date(itemData.registeredAt).toLocaleString('ko-KR')}</Text></View>
                  <View style={styles.infoRow}><Text style={styles.infoLabel}>장소</Text><Text style={styles.infoValue}>{itemData.foundLocation}</Text></View>
                  <View style={styles.infoRow}><Text style={styles.infoLabel}>보관구역</Text><Text style={styles.infoValue}>{itemData.storageZone || '없음'}</Text></View>
                  
                  <View style={styles.divider} />
                  <Text style={styles.sectionTitle}>상세 묘사</Text>
                  <Text style={styles.descText}>{itemData.description}</Text>

                  <View style={styles.divider} />
                  <Text style={styles.sectionTitle}>개인정보</Text>
                  <View style={styles.piBox}>
                    {(itemData.pi_name || itemData.pi_resident || itemData.pi_card || itemData.pi_passport) ? (
                      <>
                        {itemData.pi_name ? <Text style={styles.piText}>- 이름: {itemData.pi_name}</Text> : null}
                        {itemData.pi_resident ? <Text style={styles.piText}>- 주민번호: {itemData.pi_resident}</Text> : null}
                        {itemData.pi_card ? <Text style={styles.piText}>- 카드번호: {itemData.pi_card}</Text> : null}
                        {itemData.pi_passport ? <Text style={styles.piText}>- 여권번호: {itemData.pi_passport}</Text> : null}
                      </>
                    ) : <Text style={styles.piText}>등록된 개인정보가 없습니다.</Text>}
                  </View>
                  
                  <View style={{ marginTop: 25, marginBottom: 20 }}>
                    <Text style={styles.sectionTitle}>관리자 특이사항</Text>
                    <Text style={{ fontSize: 15, color: '#333', lineHeight: 24 }}>
                      {itemData.specialNote || '입력된 내용이 없습니다.'}
                    </Text>
                  </View>
                  
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      )}

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={{color:'#fff', marginTop:10, fontWeight:'bold'}}>처리 중...</Text>
        </View>
      )}

      <Modal visible={isCategoryModalVisible} transparent={true} animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsCategoryModalVisible(false)}>
          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownModalTitle}>대분류 선택</Text>
            <ScrollView showsVerticalScrollIndicator={true}>
              {MAIN_CATEGORIES.map((cat) => (
                <TouchableOpacity key={cat} style={styles.dropdownItem} onPress={() => { setEditableData({...editableData, main_category: cat}); setIsCategoryModalVisible(false); }}>
                  <Text style={styles.dropdownItemText}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F7' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E0E0E0', zIndex: 10 },
  homeButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A237E' },
  
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  permissionText: { fontSize: 16, marginBottom: 20, textAlign: 'center' },
  primaryBtn: { backgroundColor: '#1A237E', paddingVertical: 14, paddingHorizontal: 30, borderRadius: 10 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  
  container: { flex: 1 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#ddd' },
  tabBtn: { flex: 1, paddingVertical: 15, alignItems: 'center' },
  tabActive: { borderBottomWidth: 3, borderBottomColor: '#1A237E' },
  tabText: { fontSize: 15, color: '#888', fontWeight: '600' },
  tabTextActive: { color: '#1A237E', fontWeight: 'bold' },

  scannerWrapper: { flex: 1, alignItems: 'center', paddingTop: 40 },
  scannerBox: { width: SCREEN_WIDTH * 0.8, height: SCREEN_WIDTH * 0.8, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' },
  scannerOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scannerTarget: { width: 200, height: 200, borderWidth: 3, borderColor: '#fff', borderStyle: 'dashed', borderRadius: 20 },
  scannerGuide: { marginTop: 30, fontSize: 16, color: '#555', fontWeight: '600' },
  
  rescanBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A237E', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 30, marginTop: 20, elevation: 5 },
  rescanBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  /* 🌟 flex-start 및 paddingTop 부여로 키보드 가림 완벽 해결 */
  manualWrapper: { flex: 1, padding: 30, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 80 },
  
  manualTitle: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 20 },
  manualInput: { width: '100%', backgroundColor: '#fff', borderWidth: 2, borderColor: '#1A237E', borderRadius: 12, padding: 18, fontSize: 18, textAlign: 'center', marginBottom: 20, fontWeight: 'bold' },
  searchBtn: { width: '100%', backgroundColor: '#1A237E', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  searchBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  resultContainer: { flex: 1, backgroundColor: '#fff' },
  fixedImageBackground: { position: 'absolute', top: 0, width: '100%', height: 350 }, 
  scrollContent: { paddingTop: 300, flexGrow: 1 }, 
  detailBox: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, minHeight: SCREEN_HEIGHT - 100, padding: 20, elevation: 10, shadowColor: '#000', shadowOffset: {width: 0, height: -2}, shadowOpacity: 0.2, shadowRadius: 5 }, 
  
  actionBtnRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },

  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusActive: { backgroundColor: '#E8F5E9' },
  statusDone: { backgroundColor: '#EEEEEE' },
  statusText: { fontSize: 13, fontWeight: 'bold', color: '#2E7D32' },
  serialText: { fontSize: 18, fontWeight: '900', color: '#1A237E', letterSpacing: 1 },
  mainItemName: { fontSize: 26, fontWeight: 'bold', color: '#333', marginBottom: 20 },
  
  infoRow: { flexDirection: 'row', marginBottom: 10 },
  infoLabel: { width: 80, fontSize: 15, color: '#888', fontWeight: '600' },
  infoValue: { flex: 1, fontSize: 16, color: '#333' },
  
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 20 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#1A237E', marginBottom: 10 },
  descText: { fontSize: 15, lineHeight: 24, color: '#444' },

  editLabel: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 10 },
  inputField: { backgroundColor: '#F5F5F7', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, color: '#333', marginBottom: 8 },
  dropdownInput: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F5F5F7', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 8 },
  dropdownText: { fontSize: 16, color: '#333' },

  piEditBox: { backgroundColor: '#FFEBEE', padding: 16, borderRadius: 12, marginTop: 20, borderWidth: 1, borderColor: '#FFCDD2' },
  piEditBoxTitle: { fontSize: 15, fontWeight: 'bold', color: '#D32F2F', marginBottom: 12 },
  piBox: { backgroundColor: '#FFEBEE', padding: 15, borderRadius: 10, marginTop: 5 },
  piText: { fontSize: 15, color: '#D32F2F', fontWeight: '600', marginBottom: 6 },

  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  dropdownModal: { width: '80%', maxHeight: '60%', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10 },
  dropdownModalTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee', color: '#1A237E' },
  dropdownItem: { paddingVertical: 15, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  dropdownItemText: { fontSize: 16, color: '#333' }
});