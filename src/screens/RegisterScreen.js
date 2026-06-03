import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { addDoc, collection } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { db } from '../../firebaseConfig';
import { printLostItemLabel } from '../utils/bluetoothPrinter';

const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const VISION_KEY = process.env.EXPO_PUBLIC_VISION_API_KEY;
const { width } = Dimensions.get('window');

const MAIN_CATEGORIES = [
  '가방', '귀금속', '도서용품', '서류', '산업용품', '쇼핑백', '스포츠용품', 
  '악기', '유가증권', '의류', '자동차용품', '전자기기', '지갑', '컴퓨터', 
  '카메라', '현금', '휴대폰', '증명서', '기타물품'
];

const LOCATION_OPTIONS = ['KTX', '새마을호', '무궁화호', '역내'];

// 🌟 개인정보 자동 마스킹 함수 4종 (엄격한 변환 규칙)
const maskName = (name) => {
  if (!name) return "";
  if (name.includes('*')) return name; // 이미 마스킹된 경우 무시
  const len = name.length;
  if (len === 1) return name;
  if (len === 2) return name[0] + "*";
  return name[0] + "*".repeat(len - 2) + name[len - 1];
};

const maskResident = (res) => {
  if (!res) return "";
  if (res.includes('*')) return res;
  const cleaned = res.replace(/[^0-9]/g, ''); // 숫자만 추출
  if (cleaned.length <= 6) return cleaned;
  return cleaned.slice(0, 6) + '-' + '*'.repeat(cleaned.length - 6).slice(0, 7);
};

const maskCard = (card) => {
  if (!card) return "";
  if (card.includes('*')) return card;
  const cleaned = card.replace(/[^0-9]/g, ''); // 숫자만 추출
  let masked = '';
  for (let i = 0; i < cleaned.length; i++) {
    if (i > 0 && i % 4 === 0) masked += '-';
    masked += i < 8 ? cleaned[i] : '*';
  }
  return masked.slice(0, 19);
};

const maskPassport = (passport) => {
  if (!passport) return "";
  if (passport.includes('*')) return passport;
  const cleaned = passport.replace(/[^a-zA-Z0-9]/g, ''); // 영문/숫자만 추출
  if (cleaned.length <= 3) return cleaned;
  return cleaned.slice(0, 3) + '*'.repeat(cleaned.length - 3);
};

const analyzeWithVisionAPI = async (base64Image) => {
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${VISION_KEY}`;
  const requestBody = {
    requests: [{
      image: { content: base64Image.trim().replace(/^data:image\/\w+;base64,/, "") },
      features: [
        { type: "LABEL_DETECTION", maxResults: 5 },
        { type: "LOGO_DETECTION", maxResults: 3 },
        { type: "TEXT_DETECTION", maxResults: 1 },
        { type: "OBJECT_LOCALIZATION", maxResults: 1 },
        { type: "IMAGE_PROPERTIES", maxResults: 1 },
        { type: "WEB_DETECTION", maxResults: 2 }
      ]
    }]
  };
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
  return (await response.json()).responses[0];
};

const formatWithGemini = async (visionRawData, base64Image) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;

  const cleanBase64 = String(base64Image || "")
    .trim()
    .replace(/^data:image\/\w+;base64,/, "")
    .replace(/\s/g, "");

  if (!GEMINI_KEY) {
    throw new Error("Gemini API 키가 없습니다. EAS 환경변수를 확인하세요.");
  }

  if (!cleanBase64) {
    throw new Error("이미지 base64 데이터가 비어 있습니다.");
  }

  const visionText = JSON.stringify(visionRawData || {}).slice(0, 6000);
  
  const promptText = `
  사진과 Vision 데이터를 반드시 교차 검증해.

  [🚨 1단계: 시각적 팩트 체크]
  1. WEB_DETECTION 맹신 금지. 카메라 렌즈 개수, 전면 구멍, 이어팁 유무 등 시각적 증거 우선. 텍스트(TEXT_DETECTION) 증거 최우선.
  1-1. 중심물건 집중 분석: 사진에서 분실물로 보이는 중심물건 하나에만 집중해. 주변 환경, 배경, 중심물건이 아닌 다른 물건은 대분류/소분류/브랜드/색상/특징/상세묘사/키워드 판단에서 배제해.

  [🚨 2단계: 시리즈명 추측 금지]
  2. '아이폰', '갤럭시', '에어팟' 등 기본 라인업까지만 허용. 텍스트로 입증 안 되면 '15', 'Pro', '4세대' 등 구체적 시리즈 절대 기재 금지.
  3. 형태 묘사와 기본 제품명 결합 (예: 렌즈가 3개인 아이폰, 커널형 에어팟).
  4. 🌟 괄호 사용 절대 금지: 색상, 브랜드, 소분류 등에 괄호 '( )'를 사용하여 사견이나 부연 설명을 절대 넣지 마. 괄호 안에 들어갈 구구절절한 설명은 무조건 'feature(특징)'나 'description(상세 묘사)' 항목으로 몰아서 넣어.

  [🚨 3단계: 🌟 로스트112 대분류 엄수 및 소분류 작성]
  5. 대분류(main_category): 반드시 다음 19개 목록 중에서만 무조건 딱 하나를 선택해. 절대 임의로 지어내지 마.
     [가방, 귀금속, 도서용품, 서류, 산업용품, 쇼핑백, 스포츠용품, 악기, 유가증권, 의류, 자동차용품, 전자기기, 지갑, 컴퓨터, 카메라, 현금, 휴대폰, 증명서, 기타물품]
  6. 소분류(sub_category): 수식어(형용사 등)를 모두 빼고, 구체적인 물건 명칭을 나타내는 **딱 하나의 명사 단어**로만 기재해. (예: '하얀색 무선이어폰' -> '무선이어폰')
  
  [🚨 4단계: 개인정보 부분 마스킹 규칙 (엄격 준수)]
  7. 인식 대상 제한: 이름, 주민등록번호, 카드번호, 여권번호 4가지만 인식, 이외의 인식되는 개인정보(계좌번호 등)은 작성 금지. (카드 뒷면 CVC 절대 무시).
  8. 부분 마스킹 표기법 (전부 별표 절대 금지):
     - 한국 이름: 맨 앞, 맨 뒤 노출 (홍*동, 남**일, 김*).
     - 외국/영어 이름: 앞쪽 이름(Fist Name) 노출(전체이름에서 띄어쓰기 전까지의 이름만 노출)
     - 주민번호: 앞 6자리 노출 (900101-*******).
     - 여권번호: 앞 3자리 노출 (M12*****).
     - 카드번호: 앞 8자리 노출 (1234-5678-****-****).

  [출력 양식] JSON으로만 대답해.
  {
    "isImageValid": true/false,
    "rejectReason": "사유 또는 '없음'",
    "reasoning": "판단 근거",
    "main_category": "대분류 (반드시 19개 목록 중 하나 기재)",
    "sub_category": "소분류 (자유 기재)",
    "brand": "제조사 브랜드",
    "color": "보정된 실제 색상",
    "feature": "외형 특징 + 기본 제품명",
    "description": "외형 상세 묘사",
    "keywords": ["단어1", "단어2"],
    "pi_name": "마스킹된 이름 또는 ''",
    "pi_resident": "마스킹된 주민번호 또는 ''",
    "pi_card": "마스킹된 카드번호 또는 ''",
    "pi_passport": "마스킹된 여권번호 또는 ''",
    "confidence_score": 0~100
  }
  `;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: cleanBase64
            }
          },
          {
            text: promptText
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_KEY
    },
    body: JSON.stringify(requestBody)
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      `Gemini 오류 ${response.status}: ${data.error?.status || ""} / ${data.error?.message || JSON.stringify(data).slice(0, 700)}`
    );
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error(`Gemini 응답 없음: ${JSON.stringify(data).slice(0, 700)}`);
  }

  return text;
};

const generateSerialNumber = (categoryName) => {
  const today = new Date();
  const yy = String(today.getFullYear()).slice(2);
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  
  const categoryMap = {
    '가방': 'BAGS', '귀금속': 'JWLY', '도서용품': 'BOOK', '서류': 'DOCS', 
    '산업용품': 'INDT', '쇼핑백': 'SHOP', '스포츠용품': 'SPRT', '악기': 'INST', 
    '유가증권': 'SECU', '의류': 'CLOT', '자동차용품': 'AUTO', '전자기기': 'ELEC', 
    '지갑': 'WALT', '컴퓨터': 'COMP', '카메라': 'CAMR', '현금': 'CASH', 
    '휴대폰': 'PHON', '증명서': 'CERT', '기타물품': 'MISC'
  };

  const catCode = categoryMap[categoryName] || 'MISC';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
  let randomStr = '';
  for (let i = 0; i < 4; i++) {
    randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return `${yy}${mm}${dd}-${catCode}-${randomStr}`;
};

export default function RegisterScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [torchEnabled, setTorchEnabled] = useState(false);
  
  const [viewState, setViewState] = useState('camera'); 
  const [aiData, setAiData] = useState(null); 
  
  const [capturedImageUri, setCapturedImageUri] = useState(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdatingAI, setIsUpdatingAI] = useState(false);
  
  const [editableData, setEditableData] = useState({
    main_category: '', sub_category: '', brand: '', color: '', feature: ''
  });

  const [piName, setPiName] = useState("");
  const [piResident, setPiResident] = useState("");
  const [piCard, setPiCard] = useState("");
  const [piPassport, setPiPassport] = useState("");

  const [isCategoryModalVisible, setIsCategoryModalVisible] = useState(false);
  const [specialNote, setSpecialNote] = useState(""); 
  const [locationText, setLocationText] = useState("");
  
  const cameraRef = useRef(null);

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>카메라 사용 권한이 필요합니다.</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>권한 허용하기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const takePhotoAndAnalyze = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.3 });
    const base64Data = photo.base64;
    
    setCapturedImageUri(photo.uri);
    setViewState('loading');

    try {
      const vision = await analyzeWithVisionAPI(base64Data);
      const final = await formatWithGemini(vision, base64Data);
      const res = JSON.parse(final);

      if (res.isImageValid === false) {
        Alert.alert("재촬영 요청", res.rejectReason);
        setViewState('camera');
        return;
      }

      setAiData(res);
      setEditableData({
        main_category: res.main_category || "",
        sub_category: res.sub_category || "",
        brand: res.brand || "",
        color: res.color || "",
        feature: res.feature || ""
      });
      
      setPiName(res.pi_name || "");
      setPiResident(res.pi_resident || "");
      setPiCard(res.pi_card || "");
      setPiPassport(res.pi_passport || "");
      
      setSpecialNote("");
      setViewState('result');
      } catch (e) {
        console.log("AI 분석 오류:", e);
        Alert.alert("분석 실패", String(e?.message || e).slice(0, 900));
        setViewState('camera');
      }
  };

  const handleUpdateAI = async () => {
    setIsUpdatingAI(true);

    // 🌟 1. AI 업데이트 실행 직전에 안전하게 강제 마스킹 처리 덮어쓰기!
    const mName = maskName(piName);
    const mRes = maskResident(piResident);
    const mCard = maskCard(piCard);
    const mPass = maskPassport(piPassport);
    
    setPiName(mName);
    setPiResident(mRes);
    setPiCard(mCard);
    setPiPassport(mPass);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
      const updatePrompt = `
      관리자가 AI의 초기 분석 결과를 직접 수정했어.
      수정된 데이터에 완벽하게 맞춰서 'description'(상세 묘사)과 'keywords'(검색 키워드 배열)만 다시 작성해.
      description과 keywords도 수정된 중심물건만 다루고, 주변 환경이나 중심물건이 아닌 다른 물건은 추가하지 마.

      [관리자 수정 데이터]
      - 대분류: ${editableData.main_category}
      - 소분류: ${editableData.sub_category}
      - 브랜드: ${editableData.brand}
      - 색상: ${editableData.color}
      - 특징: ${editableData.feature}

      [출력 양식] JSON으로만 대답해.
      {
        "main_category": "${editableData.main_category}",
        "sub_category": "${editableData.sub_category}",
        "brand": "${editableData.brand}",
        "color": "${editableData.color}",
        "feature": "${editableData.feature}",
        "description": "수정된 데이터 기반으로 상세 묘사 다시 작성",
        "keywords": ["단어1", "단어2", "수정된 단어 반영"]
      }
      `;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: updatePrompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      
      const final = await response.json();
      const updatedAiData = JSON.parse(final.candidates[0].content.parts[0].text);
      
      setAiData({
        ...aiData,
        main_category: updatedAiData.main_category,
        sub_category: updatedAiData.sub_category,
        brand: updatedAiData.brand,
        color: updatedAiData.color,
        feature: updatedAiData.feature,
        description: updatedAiData.description,
        keywords: updatedAiData.keywords
      });
      
      setIsEditing(false);
    } catch (e) {
      Alert.alert("오류", "키워드 동기화 중 문제가 발생했습니다.");
    } finally {
      setIsUpdatingAI(false);
    }
  };

  const handleGoHome = () => {
    Alert.alert(
      "홈으로 이동",
      "메인 화면으로 돌아가시겠습니까?\n작성 중인 내용이 있다면 모두 초기화됩니다.",
      [
        { text: "취소", style: "cancel" },
        { text: "이동", style: "destructive", onPress: () => router.push('/') }
      ]
    );
  };

  const askLabelPrintAndSubmit = (selectedLocation) => {
    setLocationText(selectedLocation);
    Alert.alert(
      "라벨지 출력",
      "라벨지를 출력하겠습니까?",
      [
        { text: "아니오", style: "cancel", onPress: () => handleFinalSubmit(selectedLocation, false) },
        { text: "예", onPress: () => handleFinalSubmit(selectedLocation, true) }
      ]
    );
  };

  const handleFinalSubmit = async (selectedLocation, shouldPrintLabel) => {
    setViewState('loading');
    let uploadedImageUrl = "";

    try {
      if (capturedImageUri) {
        const blob = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.onload = function () { resolve(xhr.response); };
          xhr.onerror = function (e) { reject(new TypeError("Network request failed")); };
          xhr.responseType = "blob";
          xhr.open("GET", capturedImageUri, true);
          xhr.send(null);
        });

        const storage = getStorage();
        const imageName = `lostItems/${Date.now()}.jpg`; 
        const imageRef = ref(storage, imageName);
        
        await uploadBytes(imageRef, blob);
        uploadedImageUrl = await getDownloadURL(imageRef);
        blob.close();
      }

      const newSerialNumber = generateSerialNumber(aiData.main_category);

      // 🌟 2. DB로 가기 직전 최종적으로 마스킹 함수를 한 번 더 거쳐서 절대 원본이 저장되지 않게 조치!
      const finalData = {
        serialNumber: newSerialNumber,
        ...aiData,
        specialNote: specialNote,
        foundLocation: selectedLocation,
        registeredAt: new Date().toISOString(),
        status: '보관중',
        pi_name: maskName(piName),
        pi_resident: maskResident(piResident),
        pi_card: maskCard(piCard),
        pi_passport: maskPassport(piPassport),
        imageUrl: uploadedImageUrl 
      };
      
      await addDoc(collection(db, "lostItems"), finalData);

      let resultMessage = "안전하게 데이터베이스에 저장되었습니다.";
      if (shouldPrintLabel) {
        try {
          await printLostItemLabel(finalData);
          resultMessage = "안전하게 데이터베이스에 저장되었고, 라벨지 출력 명령을 전송했습니다.";
        } catch (printError) {
          const message = String(printError?.message || "프린터가 연결되어 있지 않습니다.");
          resultMessage = `${message}\n데이터만 등록되었습니다.`;
        }
      }

      Alert.alert("등록 완료", resultMessage, [
        { text: "확인", onPress: () => router.push('/') }
      ]);
    } catch (error) {
      console.error("저장 에러: ", error);
      Alert.alert("전송 실패", "사진 및 데이터 저장 중 오류가 발생했습니다.");
      setViewState('locationInput'); 
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.header}>
      <TouchableOpacity onPress={handleGoHome} style={styles.homeButton}>
        <Ionicons name="home-outline" size={28} color="#1A237E" />
      </TouchableOpacity>
        <Text style={styles.headerTitle}>분실물 등록</Text>
        <View style={{ width: 28 }} /> 
      </View>

      {viewState === 'camera' && (
        <View style={styles.cameraContainer}>
          <CameraView ref={cameraRef} style={styles.camera} facing="back" enableTorch={torchEnabled}>
            <View style={styles.cameraTopBar}>
              <TouchableOpacity onPress={() => setTorchEnabled(!torchEnabled)} style={styles.iconButton}>
                <Ionicons name={torchEnabled ? "flash" : "flash-off"} size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.overlayArea}>
              <View style={styles.guideBox} />
              <Text style={styles.guideText}>밝은 곳에서 분실물이 잘 보이도록 찍어주세요.</Text>
            </View>
            <View style={styles.cameraBottomBar}>
              <TouchableOpacity style={styles.captureButton} onPress={takePhotoAndAnalyze}>
                <View style={styles.captureInnerCircle} />
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
      )}

      {viewState === 'loading' && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.loadingText}>처리 중입니다...</Text>
        </View>
      )}

      {viewState === 'result' && aiData && (
        <ScrollView contentContainerStyle={styles.resultContainer} showsVerticalScrollIndicator={false}>
          
          <View style={styles.resBox}>
            {isEditing ? (
              <View>
                <Text style={styles.editLabel}>대분류</Text>
                <TouchableOpacity style={styles.dropdownButton} onPress={() => setIsCategoryModalVisible(true)}>
                  <Text style={styles.dropdownButtonText}>{editableData.main_category || "대분류 선택"}</Text>
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>

                <Text style={styles.editLabel}>소분류</Text>
                <TextInput style={styles.editInput} placeholderTextColor="#888" value={editableData.sub_category} onChangeText={t => setEditableData({...editableData, sub_category: t})} />
                <Text style={styles.editLabel}>브랜드</Text>
                <TextInput style={styles.editInput} placeholderTextColor="#888" value={editableData.brand} onChangeText={t => setEditableData({...editableData, brand: t})} />
                <Text style={styles.editLabel}>색상</Text>
                <TextInput style={styles.editInput} placeholderTextColor="#888" value={editableData.color} onChangeText={t => setEditableData({...editableData, color: t})} />
                <Text style={styles.editLabel}>특징</Text>
                <TextInput style={styles.editInput} placeholderTextColor="#888" value={editableData.feature} onChangeText={t => setEditableData({...editableData, feature: t})} />

                <View style={styles.piEditBox}>
                  <Text style={styles.piEditBoxTitle}>🚨 개인정보 직접 수정 (선택)</Text>
                  
                  {/* 🌟 3. 사용자가 입력을 마치고(완료버튼 클릭) 칸을 벗어나면 즉각 마스킹 씌움 */}
                  <Text style={styles.editLabel}>이름</Text>
                  <TextInput style={styles.editInput} placeholder="예: 홍*동" placeholderTextColor="#888" value={piName} onChangeText={setPiName} onEndEditing={(e) => setPiName(maskName(e.nativeEvent.text))} />
                  
                  <Text style={styles.editLabel}>주민등록번호</Text>
                  <TextInput style={styles.editInput} placeholder="예: 900101-*******" placeholderTextColor="#888" value={piResident} onChangeText={setPiResident} onEndEditing={(e) => setPiResident(maskResident(e.nativeEvent.text))} />
                  
                  <Text style={styles.editLabel}>카드번호</Text>
                  <TextInput style={styles.editInput} placeholder="예: 1234-5678-****" placeholderTextColor="#888" value={piCard} onChangeText={setPiCard} onEndEditing={(e) => setPiCard(maskCard(e.nativeEvent.text))} />
                  
                  <Text style={styles.editLabel}>여권번호</Text>
                  <TextInput style={styles.editInput} placeholder="예: M12*****" placeholderTextColor="#888" value={piPassport} onChangeText={setPiPassport} onEndEditing={(e) => setPiPassport(maskPassport(e.nativeEvent.text))} />
                </View>

                <View style={styles.editActionRow}>
                  <TouchableOpacity style={styles.cancelEditBtn} onPress={() => setIsEditing(false)} disabled={isUpdatingAI}>
                    <Text style={styles.cancelEditBtnText}>취소</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.updateAiBtn} onPress={handleUpdateAI} disabled={isUpdatingAI}>
                    {isUpdatingAI ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.updateAiBtnText}>수정 완료 (AI 동기화)</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View>
                <Text style={styles.resTextLine}>[AI 신뢰도: {aiData.confidence_score}%]</Text>
                
                <View style={styles.cleanRow}><Text style={styles.cleanLabel}>대분류</Text><Text style={styles.cleanValue}>{aiData.main_category}</Text></View>
                <View style={styles.cleanRow}><Text style={styles.cleanLabel}>소분류</Text><Text style={styles.cleanValue}>{aiData.sub_category}</Text></View>
                <View style={styles.cleanRow}><Text style={styles.cleanLabel}>브랜드</Text><Text style={styles.cleanValue}>{aiData.brand || '없음'}</Text></View>
                <View style={styles.cleanRow}><Text style={styles.cleanLabel}>색상</Text><Text style={styles.cleanValue}>{aiData.color || '없음'}</Text></View>
                <View style={styles.cleanRow}><Text style={styles.cleanLabel}>특징</Text><Text style={styles.cleanValue}>{aiData.feature || '없음'}</Text></View>
                
                <View style={styles.divider} />

                {(piName || piResident || piCard || piPassport) ? (
                  <View>
                    <Text style={[styles.cleanLabel, {color: '#D32F2F', marginBottom: 8, width: '100%'}]}>🚨 개인정보 (마스킹 적용)</Text>
                    {piName ? <View style={styles.cleanRow}><Text style={styles.cleanLabel}>이름</Text><Text style={styles.cleanValue}>{piName}</Text></View> : null}
                    {piResident ? <View style={styles.cleanRow}><Text style={styles.cleanLabel}>주민번호</Text><Text style={styles.cleanValue}>{piResident}</Text></View> : null}
                    {piCard ? <View style={styles.cleanRow}><Text style={styles.cleanLabel}>카드번호</Text><Text style={styles.cleanValue}>{piCard}</Text></View> : null}
                    {piPassport ? <View style={styles.cleanRow}><Text style={styles.cleanLabel}>여권번호</Text><Text style={styles.cleanValue}>{piPassport}</Text></View> : null}
                  </View>
                ) : (
                  <View style={styles.cleanRow}><Text style={[styles.cleanLabel, {width: '100%'}]}>개인정보: 없음</Text></View>
                )}
              </View>
            )}
          </View>
          
          {!isEditing && (
            <>
              <Text style={styles.inputLabel}>특이사항 추가 (선택)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="지갑 속 현금 등 사진으로 알 수 없는 내용 입력"
                placeholderTextColor="#888"
                value={specialNote}
                onChangeText={setSpecialNote}
                multiline={true}
              />

              <View style={styles.actionButtons}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setViewState('camera')}>
                  <Text style={styles.secondaryBtnText}>재촬영</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setIsEditing(true)}>
                  <Text style={styles.secondaryBtnText}>수정</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => setViewState('locationInput')}>
                  <Text style={styles.primaryBtnText}>등록</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {viewState === 'locationInput' && (
        <View style={styles.locationContainer}>
          <Text style={styles.locationTitle}>분실물을 잃어버린 장소를 선택해 주세요</Text>
          <Text style={styles.locationSub}>장소 선택 후 데이터 등록과 라벨지 출력 여부를 확인합니다.</Text>

          <View style={styles.locationOptionGrid}>
            {LOCATION_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.locationOptionButton,
                  locationText === option && styles.locationOptionButtonSelected
                ]}
                onPress={() => askLabelPrintAndSubmit(option)}
              >
                <Text
                  style={[
                    styles.locationOptionText,
                    locationText === option && styles.locationOptionTextSelected
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setViewState('result')}>
              <Text style={styles.secondaryBtnText}>뒤로</Text>
            </TouchableOpacity>
          </View>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  homeButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A237E' },
  cameraContainer: { flex: 1 },
  camera: { flex: 1 },
  cameraTopBar: { flexDirection: 'row', justifyContent: 'flex-end', padding: 20, paddingTop: 40 },
  iconButton: { backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 20 },
  overlayArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  guideBox: { width: width * 0.75, height: width * 0.75, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', borderStyle: 'dashed', borderRadius: 12 },
  guideText: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 20, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, overflow: 'hidden', textAlign: 'center' },
  cameraBottomBar: { height: 120, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  captureButton: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  captureInnerCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 16, fontSize: 16, color: '#333', fontWeight: '600' },
  resultContainer: { padding: 20, paddingBottom: 60 },
  resBox: { backgroundColor: '#fff', padding: 20, borderRadius: 16, elevation: 2, marginBottom: 20 },
  resTextLine: { fontSize: 14, color: '#888', marginBottom: 12, textAlign: 'right' },
  
  cleanRow: { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-start' },
  cleanLabel: { fontSize: 17, fontWeight: '800', color: '#1A237E', width: 85 },
  cleanValue: { fontSize: 17, color: '#333', flex: 1, fontWeight: '500', lineHeight: 24 },
  divider: { height: 1, backgroundColor: '#E0E0E0', marginVertical: 15 },

  editLabel: { fontSize: 13, color: '#666', marginBottom: 4, fontWeight: '600' },
  editInput: { backgroundColor: '#F5F5F7', borderRadius: 8, padding: 12, fontSize: 15, marginBottom: 12, borderWidth: 1, borderColor: '#E0E0E0', color: '#333' },
  
  editActionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  cancelEditBtn: { flex: 2, backgroundColor: '#E0E0E0', padding: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cancelEditBtnText: { color: '#333', fontSize: 15, fontWeight: '700' },
  updateAiBtn: { flex: 8, backgroundColor: '#1A237E', padding: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  updateAiBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  dropdownButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F5F5F7', borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E0E0E0' },
  dropdownButtonText: { fontSize: 15, color: '#333' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  dropdownModal: { width: '80%', maxHeight: '60%', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10, elevation: 5 },
  dropdownModalTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee', color: '#1A237E' },
  dropdownItem: { paddingVertical: 15, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  dropdownItemText: { fontSize: 16, color: '#333' },

  inputLabel: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 8, marginLeft: 4 },
  textInput: { backgroundColor: '#fff', borderRadius: 12, padding: 16, fontSize: 15, minHeight: 100, textAlignVertical: 'top', marginBottom: 24, borderWidth: 1, borderColor: '#ddd', color: '#333' },
  actionButtons: { flexDirection: 'row', gap: 10 },
  secondaryBtn: { flex: 1, paddingVertical: 14, backgroundColor: '#E0E0E0', borderRadius: 10, alignItems: 'center' },
  secondaryBtnText: { color: '#333', fontSize: 15, fontWeight: '700' },
  primaryBtn: { flex: 1.5, paddingVertical: 14, backgroundColor: '#1A237E', borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  locationContainer: { padding: 24, flex: 1, justifyContent: 'center' },
  locationTitle: { fontSize: 22, fontWeight: 'bold', color: '#1A237E', marginBottom: 8, textAlign: 'center' },
  locationSub: { fontSize: 14, color: '#666', marginBottom: 30, textAlign: 'center' },
  locationOptionGrid: { gap: 12, marginBottom: 40 },
  locationOptionButton: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 18, borderWidth: 1, borderColor: '#DDE5FF', alignItems: 'center' },
  locationOptionButtonSelected: { backgroundColor: '#1A237E', borderColor: '#1A237E' },
  locationOptionText: { color: '#1A237E', fontSize: 17, fontWeight: '800' },
  locationOptionTextSelected: { color: '#fff' },
  locationInput: { backgroundColor: '#fff', borderRadius: 12, padding: 18, fontSize: 16, borderWidth: 1, borderColor: '#1A237E', marginBottom: 40, color: '#333' },
  permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  permissionText: { fontSize: 16, marginBottom: 20 },
  permissionButton: { padding: 15, backgroundColor: '#1A237E', borderRadius: 10 },
  permissionButtonText: { color: '#fff', fontWeight: 'bold' },
  
  piEditBox: { backgroundColor: '#FFEBEE', padding: 16, borderRadius: 12, marginTop: 10, marginBottom: 10, borderWidth: 1, borderColor: '#FFCDD2' },
  piEditBoxTitle: { fontSize: 15, fontWeight: 'bold', color: '#D32F2F', marginBottom: 12 }
});
