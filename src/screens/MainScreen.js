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
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { collection, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

const { width } = Dimensions.get('window');
const NFC_ZONE_ICON = require('../assets/nfc-zone-icon.png');

export default function MainScreen() {
  const router = useRouter();

  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const menuItems = [
    { id: 'Zone', title: '구역 등록', image: NFC_ZONE_ICON, route: '/zone' },
    { id: 'Inquiry', title: '분실물 조회', icon: 'search', color: '#1A237E', route: '/inquiry' },
    { id: 'Return', title: '확인 및 반환', icon: 'qr-code', color: '#1A237E', route: '/return' },
    { id: 'History', title: '등록/반환 기록', icon: 'time', color: '#1A237E', route: '/history' },
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
          <View style={styles.registerIconCircle}>
            <Ionicons name="camera" size={34} color="#1A237E" />
          </View>
          <View style={styles.registerTextBox}>
            <Text style={styles.registerTitle}>분실물 등록</Text>
            <Text style={styles.registerSubtitle}>사진 촬영 후 AI 분석으로 빠르게 등록</Text>
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
    minHeight: 92,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4
  },
  registerIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#F0F4FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15
  },
  registerTextBox: { flex: 1 },
  registerTitle: { fontSize: 19, fontWeight: '900', color: '#1A237E', marginBottom: 4 },
  registerSubtitle: { fontSize: 13, fontWeight: '600', color: '#777', lineHeight: 18 },
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
  dangerButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFEBEE', padding: 16, borderRadius: 12, gap: 10 },
  dangerButtonText: { color: '#D32F2F', fontSize: 16, fontWeight: '700' }
});
