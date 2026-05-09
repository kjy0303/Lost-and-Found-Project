import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert,
  Animated, Dimensions,
  FlatList, Image, Modal, SafeAreaView,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { db } from '../../firebaseConfig';

// 달력 한국어 설정
LocaleConfig.locales['kr'] = {
  monthNames: ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'],
  monthNamesShort: ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'],
  dayNames: ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'],
  dayNamesShort: ['일','월','화','수','목','금','토'],
  today: '오늘'
};
LocaleConfig.defaultLocale = 'kr';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

export default function InquiryScreen() {
  const router = useRouter();
  
  const [allData, setAllData] = useState([]); 
  const [displayItems, setDisplayItems] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);

  const [searchKeyword, setSearchKeyword] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  const [tempSort, setTempSort] = useState('최신순');
  const [tempStatus, setTempStatus] = useState([]);
  const [tempCategory, setTempCategory] = useState('없음');

  const [tempStartDate, setTempStartDate] = useState(null);
  const [tempEndDate, setTempEndDate] = useState(null);

  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const q = query(collection(db, "lostItems"), orderBy("registeredAt", "desc"));
        const querySnapshot = await getDocs(q);
        const fetchedData = [];
        querySnapshot.forEach((doc) => {
          fetchedData.push({ id: doc.id, ...doc.data() });
        });
        setAllData(fetchedData);
        setDisplayItems(fetchedData); 
      } catch (error) {
        console.error("데이터 불러오기 실패:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, []);

  const formatDate = (isoString) => {
    if (!isoString) return "날짜 없음";
    const date = new Date(isoString);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const handleGoHome = () => {
    Alert.alert(
      "홈으로 이동", "메인 화면으로 돌아가시겠습니까?",
      [{ text: "취소", style: "cancel" }, { text: "이동", onPress: () => router.push('/') }]
    );
  };

  const openFilter = () => {
    setIsFilterOpen(true);
    Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
  };

  const closeFilter = () => {
    Animated.timing(slideAnim, { toValue: SCREEN_WIDTH, duration: 300, useNativeDriver: true }).start(() => setIsFilterOpen(false));
  };

  const toggleStatus = (status) => {
    if (tempStatus.includes(status)) {
      setTempStatus(tempStatus.filter(item => item !== status));
    } else {
      setTempStatus([...tempStatus, status]);
    }
  };

  const onDayPress = (day) => {
    if (!tempStartDate || (tempStartDate && tempEndDate)) {
      setTempStartDate(day.dateString);
      setTempEndDate(null);
    } else if (tempStartDate && !tempEndDate) {
      if (day.dateString > tempStartDate) {
        setTempEndDate(day.dateString);
      } else {
        setTempStartDate(day.dateString);
        setTempEndDate(null);
      }
    }
  };

  const getMarkedDates = () => {
    let marked = {};
    if (tempStartDate) {
      marked[tempStartDate] = { startingDay: true, color: '#1A237E', textColor: 'white' };
    }
    if (tempEndDate) {
      marked[tempEndDate] = { endingDay: true, color: '#1A237E', textColor: 'white' };
      let start = new Date(tempStartDate);
      let end = new Date(tempEndDate);
      let current = new Date(start);
      current.setDate(current.getDate() + 1);
      while (current < end) {
        const dateString = current.toISOString().split('T')[0];
        marked[dateString] = { color: '#E8EAF6', textColor: '#1A237E' };
        current.setDate(current.getDate() + 1);
      }
    }
    return marked;
  };

  const resetFilters = () => {
    setTempSort('최신순');
    setTempStatus([]);
    setTempCategory('없음');
    setSearchKeyword("");
    setTempStartDate(null); 
    setTempEndDate(null);   
    setDisplayItems(allData);
  };

  const applySearchAndFilter = () => {
    let result = [...allData];

    if (searchKeyword.trim() !== "") {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter(item => 
        (item.feature && item.feature.toLowerCase().includes(keyword)) ||
        (item.description && item.description.toLowerCase().includes(keyword)) ||
        (item.main_category && item.main_category.toLowerCase().includes(keyword)) ||
        (item.sub_category && item.sub_category.toLowerCase().includes(keyword)) ||
        (item.serialNumber && item.serialNumber.toLowerCase().includes(keyword))
      );
    }

    if (tempCategory !== '없음') {
      result = result.filter(item => item.main_category === tempCategory);
    }

    if (tempStatus.length > 0) {
      result = result.filter(item => tempStatus.includes(item.status));
    }

    if (tempStartDate) {
      result = result.filter(item => {
        if (!item.registeredAt) return false;
        const itemDate = new Date(item.registeredAt).toISOString().split('T')[0];
        if (tempEndDate) return itemDate >= tempStartDate && itemDate <= tempEndDate;
        return itemDate === tempStartDate;
      });
    }

    if (tempSort === '최신순') result.sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt));
    else if (tempSort === '과거순') result.sort((a, b) => new Date(a.registeredAt) - new Date(b.registeredAt));
    else if (tempSort === '가나다순') result.sort((a, b) => (a.feature || '').localeCompare(b.feature || '', 'ko'));

    setDisplayItems(result);
    closeFilter(); 
  };

  const removeFilterChip = (type, value) => {
    let newCat = tempCategory;
    let newStat = [...tempStatus];
    let newStart = tempStartDate;
    let newEnd = tempEndDate;

    if (type === 'category') newCat = '없음';
    if (type === 'status') newStat = newStat.filter(s => s !== value);
    if (type === 'date') { newStart = null; newEnd = null; }

    setTempCategory(newCat);
    setTempStatus(newStat);
    setTempStartDate(newStart);
    setTempEndDate(newEnd);

    let result = [...allData];
    if (searchKeyword.trim() !== "") {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter(item => 
        (item.feature && item.feature.toLowerCase().includes(keyword)) ||
        (item.description && item.description.toLowerCase().includes(keyword)) ||
        (item.main_category && item.main_category.toLowerCase().includes(keyword)) ||
        (item.sub_category && item.sub_category.toLowerCase().includes(keyword)) ||
        (item.serialNumber && item.serialNumber.toLowerCase().includes(keyword))
      );
    }
    if (newCat !== '없음') result = result.filter(item => item.main_category === newCat);
    if (newStat.length > 0) result = result.filter(item => newStat.includes(item.status));
    if (newStart) {
      result = result.filter(item => {
        if (!item.registeredAt) return false;
        const itemDate = new Date(item.registeredAt).toISOString().split('T')[0];
        if (newEnd) return itemDate >= newStart && itemDate <= newEnd;
        return itemDate === newStart;
      });
    }
    
    if (tempSort === '최신순') result.sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt));
    else if (tempSort === '과거순') result.sort((a, b) => new Date(a.registeredAt) - new Date(b.registeredAt));
    else if (tempSort === '가나다순') result.sort((a, b) => (a.feature || '').localeCompare(b.feature || '', 'ko'));

    setDisplayItems(result);
  };

  const renderItem = ({ item }) => {
    const catColor = getCategoryColor(item.main_category);
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => setSelectedItem(item)}>
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
        <TouchableOpacity onPress={handleGoHome} style={styles.homeButton}>
          <Ionicons name="home-outline" size={28} color="#1A237E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>분실물 조회</Text>
        <View style={{ width: 28 }} /> 
      </View>

      <View style={styles.searchContainer}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
            <TextInput 
              style={styles.searchInput}
              placeholder="특징·분류·일련번호 검색"
              placeholderTextColor="#999"
              value={searchKeyword}
              onChangeText={setSearchKeyword}
              onSubmitEditing={applySearchAndFilter}
              returnKeyType="search"
              multiline={false}
              numberOfLines={1}
            />
            {searchKeyword.length > 0 && (
              <TouchableOpacity onPress={() => setSearchKeyword('')}>
                <Ionicons name="close-circle" size={18} color="#999" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={openFilter} style={styles.filterBtn}>
            <Ionicons name="options-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {(tempCategory !== '없음' || tempStatus.length > 0 || tempStartDate) && (
        <View style={styles.chipContainerWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            {tempCategory !== '없음' && (
              <View style={styles.filterChip}>
                <Text style={styles.filterChipText}>{tempCategory}</Text>
                <TouchableOpacity onPress={() => removeFilterChip('category')}>
                  <Ionicons name="close-circle" size={16} color="#1A237E" />
                </TouchableOpacity>
              </View>
            )}
            {tempStatus.map(status => (
              <View style={styles.filterChip} key={status}>
                <Text style={styles.filterChipText}>{status}</Text>
                <TouchableOpacity onPress={() => removeFilterChip('status', status)}>
                  <Ionicons name="close-circle" size={16} color="#1A237E" />
                </TouchableOpacity>
              </View>
            ))}
            {tempStartDate && (
              <View style={styles.filterChip}>
                <Text style={styles.filterChipText}>
                  {tempStartDate.slice(5)} ~ {tempEndDate ? tempEndDate.slice(5) : ''}
                </Text>
                <TouchableOpacity onPress={() => removeFilterChip('date')}>
                  <Ionicons name="close-circle" size={16} color="#1A237E" />
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.loadingText}>데이터를 불러오는 중입니다...</Text>
        </View>
      ) : displayItems.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="search-outline" size={60} color="#ccc" />
          <Text style={styles.emptyText}>조건에 맞는 분실물이 없습니다.</Text>
        </View>
      ) : (
        <FlatList
          data={displayItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}

      {isFilterOpen && (
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.overlayBackground} onPress={closeFilter} activeOpacity={1} />
          <Animated.View style={[styles.filterDrawer, { transform: [{ translateX: slideAnim }] }]}>
            <View style={styles.drawerHeader}>
              <TouchableOpacity onPress={closeFilter} style={styles.backButton}>
                <Ionicons name="arrow-back" size={28} color="#333" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.drawerBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionTitle}>정렬 기준</Text>
              <View style={styles.buttonRow}>
                {['최신순', '과거순', '가나다순'].map(item => (
                  <TouchableOpacity 
                    key={item} 
                    style={[styles.pillBtn, tempSort === item && styles.pillBtnActive]}
                    onPress={() => setTempSort(item)}
                  >
                    <Text style={[styles.pillText, tempSort === item && styles.pillTextActive]}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.sectionTitle}>처리 상태</Text>
              <View style={styles.buttonRow}>
                {['보관중', '반환완료', '폐기/이관'].map(item => (
                  <TouchableOpacity 
                    key={item} 
                    style={[styles.pillBtn, tempStatus.includes(item) && styles.pillBtnActive]}
                    onPress={() => toggleStatus(item)}
                  >
                    <Text style={[styles.pillText, tempStatus.includes(item) && styles.pillTextActive]}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.sectionTitle}>대분류</Text>
              <View style={styles.verticalScrollContainer}>
                <ScrollView nestedScrollEnabled={true} showsVerticalScrollIndicator={true}>
                  {['없음', '전자기기', '휴대폰', '지갑', '가방', '의류', '귀금속', '증명서', '현금', '기타물품'].map(item => (
                    <TouchableOpacity 
                      key={item} 
                      style={[styles.verticalListItem, tempCategory === item && styles.verticalListItemActive]}
                      onPress={() => setTempCategory(item)}
                    >
                      <Text style={[styles.verticalListText, tempCategory === item && styles.verticalListTextActive]}>{item}</Text>
                      {tempCategory === item && <Ionicons name="checkmark" size={20} color="#1A237E" />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <Text style={styles.sectionTitle}>기간 선택</Text>
              <View style={styles.dateDisplayBox}>
                <Text style={styles.dateDisplayText}>
                  {tempStartDate ? `${tempStartDate}` : '시작일'} 
                  {'  ~  '} 
                  {tempEndDate ? `${tempEndDate}` : (tempStartDate ? '종료일 선택' : '종료일')}
                </Text>
              </View>
              <Calendar
                markingType={'period'}
                markedDates={getMarkedDates()}
                onDayPress={onDayPress}
                monthFormat={'yyyy년 MM월'}
                theme={{ arrowColor: '#1A237E', todayTextColor: '#1A237E' }}
                style={{ borderRadius: 10, borderWidth: 1, borderColor: '#eee', marginBottom: 30 }}
              />
            </ScrollView>
            <View style={styles.drawerFooter}>
              <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}><Text style={styles.resetBtnText}>초기화</Text></TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={applySearchAndFilter}><Text style={styles.applyBtnText}>확인</Text></TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}

      {/* 🌟 1. 상세 모달 부분을 패럴랙스 스타일로 교체 🌟 */}
      <Modal visible={selectedItem !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedItem(null)}>
        {selectedItem && (
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>상세 정보</Text>
              <TouchableOpacity onPress={() => setSelectedItem(null)} style={styles.closeBtn}><Ionicons name="close" size={28} color="#333" /></TouchableOpacity>
            </View>

            <View style={{ flex: 1, backgroundColor: '#fff' }}>
              {/* 🌟 고정된 사진 배경 */}
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

              {/* 🌟 위로 올라가며 덮는 상세 정보 박스 */}
              <ScrollView style={StyleSheet.absoluteFillObject} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.detailBox}>
                  <View style={styles.modalSection}>
                    <View style={[styles.statusBadge, selectedItem.status === '보관중' ? styles.statusActive : styles.statusDone, { alignSelf: 'flex-start', marginBottom: 10 }]}><Text style={styles.statusText}>{selectedItem.status}</Text></View>
                    <Text style={styles.modalDetailTitle}>{selectedItem.feature}</Text>
                    <Text style={[styles.modalDate, { fontWeight: 'bold', color: '#1A237E', fontSize: 15 }]}>일련번호: {selectedItem.serialNumber || '미발급'}</Text>
                    <Text style={styles.modalDate}>습득일: {formatDate(selectedItem.registeredAt)}</Text>
                    <Text style={styles.modalLocation}>장소: {selectedItem.foundLocation}</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.modalSection}>
                    <Text style={styles.sectionTitle}>분류 정보</Text>
                    <View style={styles.infoGrid}>
                      <Text style={styles.infoLabel}>대분류</Text><Text style={styles.infoValue}>{selectedItem.main_category}</Text>
                      <Text style={styles.infoLabel}>소분류</Text><Text style={styles.infoValue}>{selectedItem.sub_category}</Text>
                      <Text style={styles.infoLabel}>브랜드</Text><Text style={styles.infoValue}>{selectedItem.brand}</Text>
                      <Text style={styles.infoLabel}>색상</Text><Text style={styles.infoValue}>{selectedItem.color}</Text> 
                    </View>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.modalSection}>
                    <Text style={styles.sectionTitle}>상세묘사</Text>
                    <Text style={styles.descText}>{selectedItem.description}</Text>
                    <View style={styles.reasoningBox}>
                      <Text style={styles.reasoningLabel}>💡 AI 판단 근거</Text>
                      <Text style={styles.reasoningText}>{selectedItem.reasoning}</Text>
                    </View>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.modalSection}>
                    <Text style={styles.sectionTitle}>개인정보 및 특이사항</Text>
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
                    <Text style={[styles.infoLabel, {marginTop: 15}]}>관리자 특이사항</Text>
                    <Text style={[styles.infoValue, {width: '100%', fontSize: 16}]}>{selectedItem.specialNote || '입력된 내용이 없습니다.'}</Text>
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F7' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  homeButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A237E' },
  searchContainer: { padding: 16, backgroundColor: '#fff' },
  searchBox: { flex: 1, minWidth: 0, height: 52, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F7', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 0 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, minWidth: 0, height: 52, paddingVertical: 0, fontSize: 14, color: '#333', includeFontPadding: false, textAlignVertical: 'center' },
  filterBtn: { width: 52, height: 52, backgroundColor: '#1A237E', padding: 0, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  listContainer: { padding: 16, paddingBottom: 40 },
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
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 4 },
  infoText: { fontSize: 11, color: '#888' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 15, color: '#666' },
  emptyText: { marginTop: 16, fontSize: 16, color: '#888' },
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 100 },
  overlayBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  filterDrawer: { position: 'absolute', top: 0, bottom: 0, right: 0, width: SCREEN_WIDTH * 0.85, backgroundColor: '#fff', elevation: 5 },
  drawerHeader: { padding: 20, paddingTop: 50, borderBottomWidth: 1, borderColor: '#eee' },
  backButton: { alignSelf: 'flex-start', padding: 4 },
  drawerBody: { flex: 1, padding: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A237E', marginTop: 15, marginBottom: 12 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pillBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff', marginBottom: 8 },
  pillBtnActive: { backgroundColor: '#1A237E', borderColor: '#1A237E' },
  pillText: { fontSize: 14, color: '#555', fontWeight: '500' },
  pillTextActive: { color: '#fff', fontWeight: 'bold' },
  verticalScrollContainer: { height: 180, borderWidth: 1, borderColor: '#eee', borderRadius: 10, backgroundColor: '#FAFAFA' },
  verticalListItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  verticalListItemActive: { backgroundColor: '#E8EAF6' },
  verticalListText: { fontSize: 15, color: '#555' },
  verticalListTextActive: { color: '#1A237E', fontWeight: 'bold' },
  drawerFooter: { flexDirection: 'row', padding: 20, borderTopWidth: 1, borderColor: '#eee', backgroundColor: '#fff' },
  resetBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', backgroundColor: '#F5F5F7', borderRadius: 10, marginRight: 10 },
  resetBtnText: { fontSize: 16, color: '#555', fontWeight: 'bold' },
  applyBtn: { flex: 2, paddingVertical: 14, alignItems: 'center', backgroundColor: '#1A237E', borderRadius: 10 },
  applyBtnText: { fontSize: 16, color: '#fff', fontWeight: 'bold' },
  
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee', zIndex: 10, backgroundColor: '#fff' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1A237E' },
  closeBtn: { padding: 4 },
  
  // 🌟 패럴랙스 스타일 추가 🌟
  fixedImageBackground: { position: 'absolute', top: 0, width: '100%', height: 350 },
  scrollContent: { paddingTop: 300, flexGrow: 1, paddingBottom: 50 },
  detailBox: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, minHeight: SCREEN_HEIGHT - 100, paddingVertical: 30, paddingHorizontal: 0, elevation: 10, shadowColor: '#000', shadowOffset: {width: 0, height: -2}, shadowOpacity: 0.2, shadowRadius: 5 },
  
  modalSection: { marginBottom: 20, paddingHorizontal: 20 },
  modalDetailTitle: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  modalDate: { fontSize: 14, color: '#666', marginBottom: 4 },
  modalLocation: { fontSize: 14, color: '#666', fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 15, marginHorizontal: 20 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  infoLabel: { width: '30%', fontSize: 15, color: '#888', marginBottom: 12, fontWeight: '600' },
  infoValue: { width: '70%', fontSize: 16, color: '#333', marginBottom: 12 },
  
  descText: { fontSize: 15, lineHeight: 24, color: '#444', marginBottom: 15, flexWrap: 'wrap' }, 
  reasoningBox: { backgroundColor: '#F0F4FF', padding: 15, borderRadius: 10 },
  reasoningLabel: { fontSize: 14, fontWeight: '700', color: '#1A237E', marginBottom: 6 },
  reasoningText: { fontSize: 14, lineHeight: 22, color: '#555', flexWrap: 'wrap' },
  
  piBox: { backgroundColor: '#FFEBEE', padding: 15, borderRadius: 10, marginTop: 5 },
  piText: { fontSize: 15, color: '#D32F2F', fontWeight: '600', marginBottom: 6 },
  dateDisplayBox: { backgroundColor: '#E8EAF6', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  dateDisplayText: { fontSize: 15, fontWeight: '700', color: '#1A237E' },
  chipContainerWrapper: { backgroundColor: '#fff', paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  chipScroll: { gap: 8, alignItems: 'center' },
  filterChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8EAF6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, gap: 4 },
  filterChipText: { fontSize: 13, color: '#1A237E', fontWeight: '600' }
});