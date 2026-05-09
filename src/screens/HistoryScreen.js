import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
// 🌟 deleteField 추가됨
import { collection, deleteDoc, doc, getDocs, query, updateDoc, where, deleteField } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Image, Modal,
  SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { db } from '../../firebaseConfig';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const MAIN_CATEGORIES = [
  '가방', '귀금속', '도서용품', '서류', '산업용품', '쇼핑백', '스포츠용품', 
  '악기', '유가증권', '의류', '자동차용품', '전자기기', '지갑', '컴퓨터', 
  '카메라', '현금', '휴대폰', '증명서', '기타물품'
];

const getCategoryColor = (category) => {
  const colors = {
    // IT/디바이스 계열 (블루/인디고)
    '전자기기': { bg: '#E3F2FD', text: '#1565C0' }, 
    '휴대폰': { bg: '#E8EAF6', text: '#283593' },   
    '컴퓨터': { bg: '#E0F2F1', text: '#00695C' },
    '카메라': { bg: '#F3E5F5', text: '#7B1FA2' },

    // 패션/잡화 계열 (그린/오렌지/핑크)
    '가방': { bg: '#E8F5E9', text: '#2E7D32' },     
    '의류': { bg: '#FFF3E0', text: '#E65100' },     
    '지갑': { bg: '#FCE4EC', text: '#C2185B' },     
    '쇼핑백': { bg: '#F9FBE7', text: '#827717' },

    // 자산/중요문서 계열 (옐로우/앰버/퍼플)
    '귀금속': { bg: '#FFF8E1', text: '#FF8F00' },   
    '현금': { bg: '#E1F5FE', text: '#0277BD' },     
    '유가증권': { bg: '#FFFDE7', text: '#F57F17' },
    '증명서': { bg: '#F5F5F5', text: '#424242' },
    '서류': { bg: '#ECEFF1', text: '#455A64' },

    // 취미/특수 계열 (레드/시안/기타)
    '도서용품': { bg: '#EFEBE9', text: '#5D4037' },
    '스포츠용품': { bg: '#FBE9E7', text: '#D84315' },
    '악기': { bg: '#EDE7F6', text: '#512DA8' },
    '자동차용품': { bg: '#E0F7FA', text: '#006064' },
    '산업용품': { bg: '#FAFAFA', text: '#212121' },
    '기타물품': { bg: '#F5F5F5', text: '#616161' },
  };

  return colors[category] || { bg: '#F5F5F5', text: '#616161' };
};

const cleanText = (text) => {
  if (!text) return '';
  return text.replace(/\s*\(.*?\)\s*/g, '').trim(); 
};

export default function HistoryScreen() {
  const router = useRouter();
  
  const [currentTab, setCurrentTab] = useState('select'); 
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [sortOrder, setSortOrder] = useState('desc');
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);

  const [selectedItem, setSelectedItem] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editableData, setEditableData] = useState({});
  const [isCategoryModalVisible, setIsCategoryModalVisible] = useState(false);

  useEffect(() => {
    if (currentTab === 'select') return;
    fetchRecords();
  }, [currentTab, sortOrder]);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "lostItems"), where("status", "==", currentTab));
      const querySnapshot = await getDocs(q);
      
      let fetchedData = [];
      querySnapshot.forEach((document) => {
        fetchedData.push({ id: document.id, ...document.data() });
      });

      fetchedData.sort((a, b) => {
        const dateA = new Date(a.registeredAt || 0).getTime();
        const dateB = new Date(b.registeredAt || 0).getTime();
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      });

      setItems(fetchedData);
    } catch (error) {
      Alert.alert("오류", "데이터를 불러오는 중 문제가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "경고: 데이터 완전 삭제", 
      "이 작업은 되돌릴 수 없습니다.\n정말 이 데이터를 영구 삭제하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        { text: "영구 삭제", style: "destructive", onPress: async () => {
          setLoading(true);
          try {
            await deleteDoc(doc(db, "lostItems", selectedItem.id));
            setItems(items.filter(item => item.id !== selectedItem.id));
            setSelectedItem(null);
            Alert.alert("삭제 완료", "데이터가 영구적으로 삭제되었습니다.");
          } catch (error) {
            Alert.alert("오류", "삭제에 실패했습니다.");
          } finally {
            setLoading(false);
          }
        }}
      ]
    );
  };

  const handlePrintLabel = () => {
    Alert.alert(
      "라벨 인쇄", 
      `일련번호: ${selectedItem.serialNumber}\n블루투스 프린터로 라벨을 전송하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        { text: "인쇄하기", onPress: () => {
          Alert.alert("인쇄 신호 전송 완료", "프린터에서 라벨이 출력됩니다.");
        }}
      ]
    );
  };

  const handleReRegister = () => {
    Alert.alert(
      "물품 재등록", 
      "상태를 다시 '보관중'으로 변경하고, 등록 날짜를 최신화하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        { text: "재등록", onPress: async () => {
          setLoading(true);
          try {
            const now = new Date().toISOString();
            const itemRef = doc(db, "lostItems", selectedItem.id);
            await updateDoc(itemRef, { 
              status: '보관중',
              registeredAt: now, 
              updatedAt: now,
              expireAt: deleteField() // 🌟 삭제 타이머 무효화
            });
            
            setItems(items.filter(item => item.id !== selectedItem.id));
            setSelectedItem(null);
            Alert.alert("재등록 완료", "성공적으로 재등록되어 [등록 기록]으로 이동되었습니다.");
          } catch (error) {
            Alert.alert("오류", "재등록 처리에 실패했습니다.");
          } finally {
            setLoading(false);
          }
        }}
      ]
    );
  };

  const startEditing = () => {
    setEditableData({
      main_category: selectedItem.main_category || '',
      sub_category: selectedItem.sub_category || '',
      feature: selectedItem.feature || '',
      foundLocation: selectedItem.foundLocation || '',
      specialNote: selectedItem.specialNote || '',
      pi_name: selectedItem.pi_name || '',
      pi_resident: selectedItem.pi_resident || '',
      pi_card: selectedItem.pi_card || '',
      pi_passport: selectedItem.pi_passport || ''
    });
    setIsEditing(true);
  };

  const saveEditedData = async () => {
    setLoading(true);
    try {
      const itemRef = doc(db, "lostItems", selectedItem.id);
      await updateDoc(itemRef, editableData);
      
      const updatedItem = { ...selectedItem, ...editableData };
      setSelectedItem(updatedItem);
      setItems(items.map(item => item.id === updatedItem.id ? updatedItem : item));
      setIsEditing(false);
      Alert.alert("수정 완료", "정보가 성공적으로 수정되었습니다.");
    } catch (error) {
      Alert.alert("오류", "수정에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    setSelectedItem(null);
    setIsEditing(false);
  };

  const handleGoHome = () => {
    if (currentTab === 'select') {
      router.push('/');
    } else {
      Alert.alert(
        "홈으로 이동", 
        "메인 화면으로 돌아가시겠습니까?",
        [
          { text: "취소", style: "cancel" },
          { text: "이동", onPress: () => router.push('/') }
        ]
      );
    }
  };

  const renderItem = ({ item }) => {
    const catColor = getCategoryColor(item.main_category);
    
    const formatDate = (isoString) => {
      if (!isoString) return "날짜 없음";
      const date = new Date(isoString);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    };

    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => { setSelectedItem(item); setIsEditing(false); }}>
        <View style={styles.cardContentRow}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.thumbnail} />
          ) : (
            <View style={styles.thumbnailPlaceholder}>
              <Ionicons name="image-outline" size={24} color="#999" />
            </View>
          )}

          <View style={styles.cardRightArea}>
            <View style={styles.cardTopRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.statusBadge, item.status === '보관중' ? styles.statusActive : styles.statusDone]}>
                  <Text style={styles.statusText}>{item.status || '상태없음'}</Text>
                </View>
                <View style={[styles.tagBadge, { backgroundColor: catColor.bg }]}>
                  <Text style={[styles.tagText, { color: catColor.text }]}>{item.main_category}</Text>
                </View>
              </View>
              <Text style={styles.dateText}>{formatDate(item.registeredAt)}</Text>
            </View>

            <View style={styles.cardSerialRow}>
              <Text style={styles.serialText}>{item.serialNumber || '미발급'}</Text>
            </View>

            <View style={styles.cardMainRow}>
               <Text style={styles.featureText} numberOfLines={1}>{cleanText(item.sub_category)}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={12} color="#888" />
              <Text style={styles.infoText}>{item.foundLocation}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoHome} style={styles.iconBtn}>
          <Ionicons name="home-outline" size={28} color="#1A237E" />
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>기록 관리</Text>
        
        {currentTab === 'select' ? (
          <View style={{ width: 36 }} />
        ) : (
          <TouchableOpacity 
            onPress={() => { setCurrentTab('select'); setSortOrder('desc'); }} 
            style={styles.iconBtn}
          >
            <Ionicons name="arrow-back" size={28} color="#1A237E" />
          </TouchableOpacity>
        )}
      </View>

      {currentTab === 'select' && (
        <View style={styles.selectContainer}>
          <TouchableOpacity style={[styles.menuBox, { borderColor: '#2E7D32', backgroundColor: '#F1F8E9' }]} onPress={() => setCurrentTab('보관중')}>
            <Ionicons name="cube-outline" size={50} color="#2E7D32" style={{ marginBottom: 12 }} />
            <Text style={[styles.menuBoxTitle, { color: '#2E7D32' }]}>등록 기록</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuBox, { borderColor: '#7B1FA2', backgroundColor: '#F3E5F5' }]} onPress={() => setCurrentTab('폐기/이관')}>
            <Ionicons name="send-outline" size={50} color="#7B1FA2" style={{ marginBottom: 12 }} />
            <Text style={[styles.menuBoxTitle, { color: '#7B1FA2' }]}>이관 기록</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuBox, { borderColor: '#1A237E', backgroundColor: '#E8EAF6', marginBottom: 0 }]} onPress={() => setCurrentTab('반환완료')}>
            <Ionicons name="checkmark-done-circle-outline" size={50} color="#1A237E" style={{ marginBottom: 12 }} />
            <Text style={[styles.menuBoxTitle, { color: '#1A237E' }]}>반환 기록</Text>
          </TouchableOpacity>
        </View>
      )}

      {currentTab !== 'select' && (
        <View style={styles.listContainer}>
          <View style={styles.listHeaderRow}>
            <Text style={styles.listTabTitle}>
              {currentTab === '보관중' ? '등록 기록' : currentTab === '폐기/이관' ? '이관 기록' : '반환 기록'}
            </Text>
            
            <TouchableOpacity style={styles.sortBtn} onPress={() => setIsSortModalOpen(true)}>
              <Text style={styles.sortBtnText}>{sortOrder === 'desc' ? '최신순' : '오래된순'}</Text>
              <Ionicons name="chevron-down" size={16} color="#666" />
            </TouchableOpacity>
          </View>

          {loading ? (
             <View style={styles.centerContainer}><ActivityIndicator size="large" color="#1A237E" /></View>
          ) : items.length === 0 ? (
             <View style={styles.centerContainer}>
               <Text style={styles.emptyText}>기록이 없습니다</Text>
             </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={{ padding: 15, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}

      <Modal visible={selectedItem !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleCloseModal}>
        {selectedItem && (
          <View style={styles.modalContainer}>
            
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>상세 기록</Text>
              <TouchableOpacity onPress={handleCloseModal} style={styles.iconBtn}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, backgroundColor: '#fff' }}>
              
              <View style={styles.fixedImageBackground}>
                {selectedItem.imageUrl ? (
                  <Image source={{ uri: selectedItem.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                ) : (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#eaeaea' }}>
                    <Ionicons name="image-outline" size={60} color="#ccc" />
                    <Text style={{color:'#999', marginTop:10}}>사진 없음</Text>
                  </View>
                )}
              </View>

              <ScrollView style={StyleSheet.absoluteFillObject} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.detailBox}>
                  
                  {isEditing ? (
                    <View style={styles.actionBtnRow}>
                      <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#999'}]} onPress={() => setIsEditing(false)}>
                        <Text style={styles.actionBtnText}>취소</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#2E7D32'}]} onPress={saveEditedData}>
                        <Text style={styles.actionBtnText}>저장하기</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.actionBtnRow}>
                      {currentTab === '보관중' && (
                        <>
                          <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#D32F2F'}]} onPress={handleDelete}>
                            <Ionicons name="trash" size={16} color="#fff" />
                            <Text style={styles.actionBtnText}> 삭제</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#FF9800'}]} onPress={startEditing}>
                            <Ionicons name="pencil" size={16} color="#fff" />
                            <Text style={styles.actionBtnText}> 수정</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#1A237E'}]} onPress={handlePrintLabel}>
                            <Ionicons name="print" size={16} color="#fff" />
                            <Text style={styles.actionBtnText}> 인쇄</Text>
                          </TouchableOpacity>
                        </>
                      )}
                      {(currentTab === '폐기/이관' || currentTab === '반환완료') && (
                        <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#2E7D32'}]} onPress={handleReRegister}>
                          <Ionicons name="refresh-circle" size={20} color="#fff" />
                          <Text style={styles.actionBtnText}> 다시 '보관중'으로 재등록</Text>
                        </TouchableOpacity>
                      )}
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
                      <Text style={styles.serialText}>{selectedItem.serialNumber || '일련번호 없음'}</Text>
                      <Text style={styles.mainItemName}>{selectedItem.feature}</Text>
                      
                      <View style={styles.infoRow}><Text style={styles.infoLabel}>현재 상태</Text><Text style={[styles.infoValue, {fontWeight: 'bold', color: '#D32F2F'}]}>{selectedItem.status}</Text></View>
                      <View style={styles.infoRow}><Text style={styles.infoLabel}>등록일시</Text><Text style={styles.infoValue}>{new Date(selectedItem.registeredAt).toLocaleString('ko-KR')}</Text></View>
                      <View style={styles.infoRow}><Text style={styles.infoLabel}>분류</Text><Text style={styles.infoValue}>{selectedItem.main_category} > {selectedItem.sub_category}</Text></View>
                      <View style={styles.infoRow}><Text style={styles.infoLabel}>습득장소</Text><Text style={styles.infoValue}>{selectedItem.foundLocation}</Text></View>
                      
                      <View style={styles.divider} />
                      <Text style={styles.sectionTitle}>상세 묘사</Text>
                      <Text style={styles.descText}>{selectedItem.description}</Text>

                      <View style={styles.divider} />
                      <Text style={styles.sectionTitle}>개인정보</Text>
                      <View style={styles.piBox}>
                        {(selectedItem.pi_name || selectedItem.pi_resident || selectedItem.pi_card || selectedItem.pi_passport) ? (
                          <>
                            {selectedItem.pi_name ? <Text style={styles.piText}>- 이름: {selectedItem.pi_name}</Text> : null}
                            {selectedItem.pi_resident ? <Text style={styles.piText}>- 주민번호: {selectedItem.pi_resident}</Text> : null}
                            {selectedItem.pi_card ? <Text style={styles.piText}>- 카드번호: {selectedItem.pi_card}</Text> : null}
                            {selectedItem.pi_passport ? <Text style={styles.piText}>- 여권번호: {selectedItem.pi_passport}</Text> : null}
                          </>
                        ) : <Text style={styles.piText}>등록된 개인정보가 없습니다.</Text>}
                      </View>
                      
                      <View style={{ marginTop: 25, marginBottom: 20 }}>
                        <Text style={styles.sectionTitle}>관리자 특이사항</Text>
                        <Text style={{ fontSize: 15, color: '#333', lineHeight: 24 }}>
                          {selectedItem.specialNote || '입력된 내용이 없습니다.'}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>

      <Modal visible={isSortModalOpen} transparent={true} animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsSortModalOpen(false)}>
          <View style={styles.smallModalBox}>
            <TouchableOpacity style={styles.smallModalBtn} onPress={() => { setSortOrder('desc'); setIsSortModalOpen(false); }}>
              <Text style={[styles.smallModalText, sortOrder === 'desc' && {color: '#1A237E', fontWeight: 'bold'}]}>최신순 (기본)</Text>
            </TouchableOpacity>
            <View style={{height: 1, backgroundColor: '#eee'}} />
            <TouchableOpacity style={styles.smallModalBtn} onPress={() => { setSortOrder('asc'); setIsSortModalOpen(false); }}>
              <Text style={[styles.smallModalText, sortOrder === 'asc' && {color: '#1A237E', fontWeight: 'bold'}]}>오래된순</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={isCategoryModalVisible} transparent={true} animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsCategoryModalVisible(false)}>
          <View style={styles.dropdownModal}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {MAIN_CATEGORIES.map((cat) => (
                <TouchableOpacity key={cat} style={styles.dropdownItem} onPress={() => { setEditableData({...editableData, main_category: cat}); setIsCategoryModalVisible(false); }}>
                  <Text style={{fontSize:16}}>{cat}</Text>
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
  iconBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A237E' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  selectContainer: { flex: 1, padding: 20 }, 
  menuBox: { flex: 1, width: '100%', borderWidth: 2, borderRadius: 20, justifyContent: 'center', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: {width:0, height:2}, marginBottom: 15 },
  menuBoxTitle: { fontSize: 24, fontWeight: 'bold' },

  listContainer: { flex: 1 },
  listHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  listTabTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  sortBtnText: { fontSize: 13, color: '#666', marginRight: 4 },
  
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
  cardContentRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  thumbnail: { width: 90, height: 90, borderRadius: 10, backgroundColor: '#f0f0f0' },
  thumbnailPlaceholder: { width: 90, height: 90, borderRadius: 10, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  cardRightArea: { flex: 1, justifyContent: 'center' },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }, 
  cardSerialRow: { alignItems: 'center', marginBottom: 6 }, 
  cardMainRow: { alignItems: 'center', marginBottom: 6 }, 
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusActive: { backgroundColor: '#E8F5E9' },
  statusDone: { backgroundColor: '#EEEEEE' },
  statusText: { fontSize: 10, fontWeight: '700', color: '#2E7D32' },
  dateText: { fontSize: 11, color: '#999' },
  tagBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  tagText: { fontSize: 10, fontWeight: '800' },
  serialText: { fontSize: 14, fontWeight: 'bold', color: '#1A237E', letterSpacing: 0.5 }, 
  featureText: { fontSize: 18, fontWeight: '800', color: '#333', textAlign: 'center' },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 4, marginBottom: 10 },
  infoText: { fontSize: 11, color: '#888' },

  emptyText: { fontSize: 22, fontWeight: 'bold', color: '#888' },

  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fff', zIndex: 10 },
  modalHeaderTitle: { fontSize: 18, fontWeight: 'bold' },
  
  fixedImageBackground: { position: 'absolute', top: 0, width: '100%', height: 350 }, 
  scrollContent: { paddingTop: 300, flexGrow: 1, paddingBottom: 50 }, 
  detailBox: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, minHeight: SCREEN_HEIGHT - 100, paddingVertical: 30, paddingHorizontal: 20, elevation: 10, shadowColor: '#000', shadowOffset: {width: 0, height: -2}, shadowOpacity: 0.2, shadowRadius: 5 },

  actionBtnRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', paddingVertical: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },

  mainItemName: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 20, marginTop: 5 },
  infoLabel: { width: 80, fontSize: 14, color: '#888', fontWeight: '600' },
  infoValue: { flex: 1, fontSize: 15, color: '#333' },
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

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  smallModalBox: { width: 200, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  smallModalBtn: { padding: 15, alignItems: 'center' },
  smallModalText: { fontSize: 16, color: '#555' },
  dropdownModal: { width: '80%', maxHeight: '60%', backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  dropdownItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' }
});