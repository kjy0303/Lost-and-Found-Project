import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react'; // 🌟 useState 추가
import { ActivityIndicator, Alert, Dimensions, Image, Modal, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'; // 🌟 Modal, Alert, ActivityIndicator 추가

// 🌟 파이어베이스 세팅 불러오기
import { collection, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

const { width } = Dimensions.get('window');

export default function MainScreen() {
  const router = useRouter(); 

  // 🌟 메뉴 및 삭제 로딩 상태 추가
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const menuItems = [
    { id: 'Register', title: '분실물 등록', icon: 'camera', color: '#1A237E', route: '/register' },
    { id: 'Inquiry', title: '분실물 조회', icon: 'search', color: '#1A237E', route: '/inquiry' },
    { id: 'Return', title: '확인 및 반환', icon: 'qr-code', color: '#1A237E', route: '/return' },
    { id: 'History', title: '등록/반환 기록', icon: 'time', color: '#1A237E', route: '/history' },
  ];

  // 🌟 전체 데이터 삭제 함수
  const handleDeleteAllData = async () => {
    Alert.alert(
      "경고",
      "정말로 등록된 모든 분실물 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.",
      [
        { text: "취소", style: "cancel" },
        { 
          text: "전체 삭제", 
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              const querySnapshot = await getDocs(collection(db, "lostItems"));
              const deletePromises = [];
              querySnapshot.forEach((document) => {
                deletePromises.push(deleteDoc(doc(db, "lostItems", document.id)));
              });
              await Promise.all(deletePromises);
              
              Alert.alert("완료", "모든 데이터가 깔끔하게 삭제되었습니다.");
              setIsMenuVisible(false); // 창 닫기
            } catch (error) {
              console.error("삭제 중 오류 발생:", error);
              Alert.alert("오류", "데이터 삭제에 실패했습니다.");
            } finally {
              setIsDeleting(false);
            }
          } 
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {/* 🌟 왼쪽 위 햄버거 메뉴 버튼 추가 */}
        <TouchableOpacity style={styles.menuButton} onPress={() => setIsMenuVisible(true)}>
          <Ionicons name="menu" size={36} color="#1A237E" />
        </TouchableOpacity>
        
        <Text style={styles.greeting}>오늘도 힘내세요!{"\n"}관리자님!</Text>
      </View>

      <View style={styles.centralArea}>
        <Image 
          source={require('../assets/lost-and-found-icon.png')} 
          style={styles.mainImage}
          resizeMode="contain" 
        />
      </View>

      <View style={styles.gridContainer}>
        {menuItems.map((item) => (
          <TouchableOpacity 
            key={item.id} 
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push(item.route)} 
          >
            <View style={styles.iconContainer}>
              <Ionicons name={item.icon} size={30} color={item.color} />
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 🌟 햄버거 메뉴 누르면 나오는 사이드 모달 창 */}
      <Modal visible={isMenuVisible} transparent={true} animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsMenuVisible(false)}>
          <View style={styles.sideMenu}>
            <View style={styles.sideMenuHeader}>
              <Text style={styles.sideMenuTitle}>설정 메뉴</Text>
              <TouchableOpacity onPress={() => setIsMenuVisible(false)}>
                <Ionicons name="close" size={28} color="#333" />
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
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F7', justifyContent: 'space-between' },
  
  // 🌟 header에 position: 'relative' 추가
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20, alignItems: 'center', position: 'relative' },
  
  // 🌟 햄버거 버튼 위치 절대값 지정
  menuButton: { position: 'absolute', right: 24, top: 60, zIndex: 10 },
  
  greeting: { fontSize: 32, fontWeight: '900', color: '#1A237E', textAlign: 'center', lineHeight: 40 },
  centralArea: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 30 },
  mainImage: { width: '100%', height: '100%' },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 0 },
  card: { width: (width - 64) / 2, aspectRatio: 1, backgroundColor: '#FFFFFF', borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 16, shadowColor: '#1A237E', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  iconContainer: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#F0F4FF', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#333333' },

  // 🌟 모달창 스타일
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-start', alignItems: 'flex-end' },
  sideMenu: { width: '75%', height: '100%', backgroundColor: '#fff', padding: 24, paddingTop: 60, shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.2, elevation: 5 },
  sideMenuHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  sideMenuTitle: { fontSize: 20, fontWeight: '800', color: '#1A237E' },
  dangerButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFEBEE', padding: 16, borderRadius: 12, gap: 10 },
  dangerButtonText: { color: '#D32F2F', fontSize: 16, fontWeight: '700' }
});