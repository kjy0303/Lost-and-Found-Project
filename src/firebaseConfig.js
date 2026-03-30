import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 🌟 모바일 앱(React Native)에 있는 firebaseConfig.js의 설정값을 그대로 가져오세요!
const firebaseConfig = {
  apiKey: "AIzaSyAwysnxt6-43A8jtln-5lKKVmv5bN8sruo",
  authDomain: "lostandfound-d866c.firebaseapp.com",
  projectId: "lostandfound-d866c",
  storageBucket: "lostandfound-d866c.firebasestorage.app",
  messagingSenderId: "938320327435",
  appId: "1:938320327435:web:d6b74de524d4dff3e2280e",
  measurementId: "G-RBMJ4PJF00"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);