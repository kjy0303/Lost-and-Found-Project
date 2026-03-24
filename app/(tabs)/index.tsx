import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const VISION_KEY = process.env.EXPO_PUBLIC_VISION_API_KEY;

// [1단계] Vision API: 6대 센서 풀가동 (Web Detection 포함)
const analyzeWithVisionAPI = async (base64Image: string) => {
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

// [2단계] Gemini 3 Flash: 3대 기법 (Few-shot, Reasoning, Confidence) + 로스트112 기준
const formatWithGemini = async (visionRawData: any, base64Image: string) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
  
  const promptText = `
  사진과 Vision 데이터를 교차 검증해.

  [🚨 분석 핵심 규칙]
  1. 분류: 반드시 로스트112 대분류(가방, 귀금속, 도서용품, 서류, 산업용품, 쇼핑백, 스포츠용품, 악기, 유가증권, 의류, 자동차용품, 전자기기, 지갑, 컴퓨터, 카메라, 현금, 휴대폰, 증명서, 기타물품) 중 선택.
  2. 소분류: '기타물품'일 경우 물체의 정체(예: 텀블러, 우산, 화장품)를 스스로 기재.
  3. 팩트 체크: 'webDetection' 결과가 사진 속 'TEXT'나 'LOGO'와 다르면 웹 결과는 무시하고 사진 속 실제 글자를 우선할 것.
  4. 색상: 조명 보정을 통해 실제 물체의 색상을 판별.

  [💡 퓨샷(Few-shot) 예시]
  - 예: 'Whip Premium' 적힌 회색 튜브 -> reasoning: "튜브형 세안제 확인, 화장품 분류", main: "기타물품", sub: "화장품", brand: "Whip Premium", color: "회색"
  - 예: 스타벅스 로고 보온병 -> reasoning: "스타벅스 로고 확인, 보온병은 텀블러로 분류", main: "기타물품", sub: "텀블러", brand: "스타벅스", color: "흰색"

  [🚨 출력 양식] JSON으로만 대답해. reasoning을 가장 먼저 작성해(Chain of Thought).
  {
    "reasoning": "판단 근거 (1~2줄)",
    "main_category": "대분류",
    "sub_category": "소분류",
    "brand": "브랜드명",
    "color": "보정된 실제 색상",
    "feature": "제품명 위주의 심플한 특징",
    "confidence_score": 0~100점
  }
  `;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptText }, { inline_data: { mime_type: "image/jpeg", data: base64Image.trim().replace(/^data:image\/\w+;base64,/, "") } }] }],
      generationConfig: { responseMimeType: "application/json" }
    }),
  });
  return (await response.json()).candidates[0].content.parts[0].text;
};

export default function App() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [resultText, setResultText] = useState("유실물을 촬영하면 AI 분석이 시작됩니다.");
  const [isLoading, setIsLoading] = useState(false);

  const takePhoto = async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) return Alert.alert("권한 필요");

    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.3 });
    if (result.canceled) return;

    const base64Data = result.assets[0].base64;
    setImageUri(result.assets[0].uri);
    setIsLoading(true);
    setResultText("AI 군단이 정밀 분석 중입니다... 🔍");

    try {
      const vision = await analyzeWithVisionAPI(base64Data!);
      const final = await formatWithGemini(vision, base64Data!);
      const res = JSON.parse(final);

      setResultText(`[신뢰도: ${res.confidence_score}%]\n근거: ${res.reasoning}\n-------------------------\n대분류: ${res.main_category}\n소분류: ${res.sub_category}\n브랜드: ${res.brand}\n색상: ${res.color}\n특징: ${res.feature}`);
    } catch (e) {
      setResultText("분석 실패. 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>LOST112 AI 분석기 📸</Text>
        
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} />
        ) : (
          <View style={styles.placeholder}><Text style={{color: '#aaa'}}>미리보기 영역</Text></View>
        )}

        <View style={styles.resBox}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : (
            <Text style={styles.resText}>{resultText}</Text>
          )}
        </View>

        <TouchableOpacity style={styles.button} onPress={takePhoto} disabled={isLoading}>
          <Text style={styles.btnText}>{isLoading ? "분석 중..." : "유실물 촬영하기"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  scrollContainer: { padding: 20, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', marginVertical: 20 },
  image: { width: '100%', height: 300, borderRadius: 20, marginBottom: 20 },
  placeholder: { width: '100%', height: 300, backgroundColor: '#f0f0f0', borderRadius: 20, marginBottom: 20, justifyContent: 'center', alignItems: 'center' },
  resBox: { width: '100%', padding: 20, backgroundColor: '#f8f9fa', borderRadius: 15, marginBottom: 20, minHeight: 150 },
  resText: { fontSize: 15, lineHeight: 22, color: '#444' },
  button: { width: '100%', padding: 20, backgroundColor: '#007AFF', borderRadius: 15, alignItems: 'center', marginBottom: 40 },
  btnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});