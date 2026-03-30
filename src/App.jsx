import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query, doc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './App.css';

const IconMenu = ({ d }) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={d}></path></svg>;
const IconFilter = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>;
const IconSearch = () => <svg className="search-icon-svg" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;
// 🌟 사이드바 검색 메뉴 타이틀용 돋보기 아이콘
const IconMenuSearch = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;
const IconClock = () => <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>;
const IconAI = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"></path></svg>;
const IconArchive = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>;
const IconAlert = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>;

const cleanFeatureText = (item) => {
  return (item.sub_category || item.feature || "").replace(/\s*\(.*?\)\s*/g, '').split(' ').pop().trim();
};

const getStatusClass = (status) => {
  if (status === '보관중') return 'status-storage';
  if (status === '반환완료') return 'status-return';
  if (status === '폐기/이관') return 'status-discard';
  return 'status-default';
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const d = new Date(dateString);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const PIE_COLORS = ['#0ea5e9', '#10b981', '#f43f5e', '#8b5cf6', '#f59e0b', '#14b8a6', '#f97316', '#3b82f6', '#ec4899', '#84cc16'];
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

const Pagination = ({ currentPage, setCurrentPage, totalItems, itemsPerPage }) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const currentBlock = Math.ceil(currentPage / 10);
  const startPage = (currentBlock - 1) * 10 + 1;
  const endPage = Math.min(startPage + 9, totalPages);

  const pages = [];
  for (let i = startPage; i <= endPage; i++) {
    pages.push(
      <button 
        key={i} 
        className={currentPage === i ? 'active' : ''} 
        onClick={() => setCurrentPage(i)}
      >
        {i}
      </button>
    );
  }

  return (
    <div className="pagination">
      <button disabled={currentBlock === 1} onClick={() => setCurrentPage(startPage - 1)}>이전</button>
      {pages}
      <button disabled={endPage === totalPages} onClick={() => setCurrentPage(endPage + 1)}>다음</button>
    </div>
  );
};

function App() {
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const [activeMenu, setActiveMenu] = useState('search');
  const [activeStatTab, setActiveStatTab] = useState('basic');
  const [timeframe, setTimeframe] = useState('daily'); 
  const [detailedTimeframe, setDetailedTimeframe] = useState('daily');

  const [tempSort, setTempSort] = useState('최신순');
  const [tempStatus, setTempStatus] = useState(['보관중']); 
  const [tempCat, setTempCat] = useState('전체');
  const [tempStartDate, setTempStartDate] = useState('');
  const [tempEndDate, setTempEndDate] = useState('');

  const [appliedSort, setAppliedSort] = useState('최신순');
  const [appliedStatus, setAppliedStatus] = useState(['보관중']);
  const [appliedCat, setAppliedCat] = useState('전체');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');

  // 모든 페이징 10개로 통일
  const [searchPage, setSearchPage] = useState(1);
  const [transferTab, setTransferTab] = useState('D-1');
  const [transferPage, setTransferPage] = useState(1);
  const [claimPage, setClaimPage] = useState(1);
  const itemsPerPage = 10;

  const [aiSearchQuery, setAiSearchQuery] = useState('');
  const [aiResults, setAiResults] = useState([]);
  const [isAiSearching, setIsAiSearching] = useState(false);

  const [claims, setClaims] = useState([]);
  const [newClaimName, setNewClaimName] = useState('');
  const [newClaimInfo, setNewClaimInfo] = useState('');
  const [isClaimMatching, setIsClaimMatching] = useState(false);

  const categories = ['전체', '가방', '귀금속', '도서용품', '서류', '산업용품', '쇼핑백', '스포츠용품', '악기', '유가증권', '의류', '자동차용품', '전자기기', '지갑', '컴퓨터', '카메라', '현금', '휴대폰', '증명서', '기타물품'];

  const closeDrawer = () => { 
    setTempSort(appliedSort); setTempStatus(appliedStatus); setTempCat(appliedCat); 
    setTempStartDate(appliedStartDate); setTempEndDate(appliedEndDate); setIsDrawerOpen(false); 
  };
  
  const toggleStatus = (stat) => {
    tempStatus.includes(stat) 
      ? (tempStatus.length > 1 && setTempStatus(tempStatus.filter(s => s !== stat))) 
      : setTempStatus([...tempStatus, stat]);
  };
  
  const applyFilters = () => { 
    setAppliedSort(tempSort); setAppliedStatus(tempStatus); setAppliedCat(tempCat); 
    setAppliedStartDate(tempStartDate); setAppliedEndDate(tempEndDate); 
    setIsDrawerOpen(false); setSearchPage(1); 
  };
  
  const resetFilters = () => { 
    setTempSort('최신순'); setTempStatus(['보관중']); setTempCat('전체'); 
    setTempStartDate(''); setTempEndDate(''); setSearchPage(1); 
  };

  useEffect(() => {
    if (activeMenu === 'stats') {
      setActiveStatTab('basic'); setTimeframe('daily'); setDetailedTimeframe('daily');
    } else if (activeMenu === 'search') {
      setSearchTerm(''); setSelectedItem(null); setSearchPage(1);
      setTempSort('최신순'); setTempStatus(['보관중']); setTempCat('전체'); setTempStartDate(''); setTempEndDate('');
      setAppliedSort('최신순'); setAppliedStatus(['보관중']); setAppliedCat('전체'); setAppliedStartDate(''); setAppliedEndDate('');
    } else if (activeMenu === 'ai_search') {
      setAiSearchQuery(''); setAiResults([]); setIsAiSearching(false); setSelectedItem(null);
    } else if (activeMenu === 'transfer_manage') {
      setTransferTab('D-1'); setTransferPage(1); setSelectedItem(null);
    } else if (activeMenu === 'claim_manage') {
      setClaimPage(1);
    }
  }, [activeMenu]);

  // DB 연동 및 더미 데이터 완전 삭제
  useEffect(() => {
    const fetchData = async () => {
      try {
        const q = query(collection(db, "lostItems"), orderBy("registeredAt", "desc"));
        const snap = await getDocs(q);
        const nowTime = new Date().getTime();
        
        const data = await Promise.all(snap.docs.map(async (docSnap) => {
          const item = { id: docSnap.id, ...docSnap.data() };
          if (item.status === '보관중' && item.registeredAt) {
            const regTime = new Date(item.registeredAt).getTime();
            if ((nowTime - regTime) / (1000 * 60 * 60 * 24) >= 7) {
              const itemRef = doc(db, "lostItems", item.id);
              await updateDoc(itemRef, { status: '폐기/이관', updatedAt: new Date().toISOString() });
              item.status = '폐기/이관'; item.updatedAt = new Date().toISOString();
            }
          }
          return item;
        }));

        setItems(data);
        setClaims([]);

      } catch (e) { 
        console.error(e); 
      } finally { 
        setLoading(false); 
      }
    };
    fetchData();
  }, [activeMenu]);

  useEffect(() => {
    let result = items.filter(i => appliedStatus.includes(i.status));
    if (appliedCat !== '전체') result = result.filter(i => i.main_category === appliedCat);
    if (appliedStartDate) result = result.filter(i => new Date(i.registeredAt) >= new Date(appliedStartDate));
    if (appliedEndDate) { 
      const end = new Date(appliedEndDate); 
      end.setHours(23, 59, 59, 999); 
      result = result.filter(i => new Date(i.registeredAt) <= end); 
    }
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      result = result.filter(i => 
        i.feature?.toLowerCase().includes(s) || 
        i.serialNumber?.toLowerCase().includes(s) || 
        i.foundLocation?.toLowerCase().includes(s)
      );
    }
    if (appliedSort === '과거순') result.sort((a, b) => new Date(a.registeredAt) - new Date(b.registeredAt));
    else if (appliedSort === '가나다순') result.sort((a, b) => (cleanFeatureText(a) > cleanFeatureText(b) ? 1 : -1));
    else result.sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt));
    
    setFilteredItems(result);
    setSearchPage(1); 
  }, [searchTerm, appliedSort, appliedStatus, appliedCat, appliedStartDate, appliedEndDate, items]);

  const handleAiSearch = async () => {
    if (!aiSearchQuery.trim()) return alert("검색할 특징을 입력해 주세요.");
    if (!GEMINI_KEY) return alert("환경변수에 VITE_GEMINI_API_KEY를 설정해주세요.");

    setIsAiSearching(true);
    setAiResults([]);

    try {
      const targetItems = items.filter(i => i.status === '보관중').map(i => ({
        id: i.id, category: i.main_category, sub_category: i.sub_category,
        feature: i.feature, color: i.color, description: i.description, location: i.foundLocation
      }));

      if (targetItems.length === 0) {
        alert("현재 보관중인 분실물이 없습니다.");
        setIsAiSearching(false);
        return;
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
      const promptText = `
        너는 유실물 센터의 데이터 분석 AI야. 검색어와 일치율이 40% 이상인 보관 물품을 찾아줘.
        [검색어]: "${aiSearchQuery}"
        [보관 물품 목록]: ${JSON.stringify(targetItems)}
        아래 JSON 배열 형식으로만 반환할 것.
        [ { "id": "물품id", "confidence": 85, "reason": "이 물건이라고 판단한 구체적인 이유 1~2줄" } ]
      `;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }], generationConfig: { responseMimeType: "application/json" } })
      });

      const data = await response.json();
      const parsedResults = JSON.parse(data.candidates[0].content.parts[0].text);

      const matchedItems = parsedResults.map(res => {
        const originalItem = items.find(i => i.id === res.id);
        return originalItem ? { ...originalItem, aiConfidence: res.confidence, aiReason: res.reason } : null;
      }).filter(Boolean);

      matchedItems.sort((a, b) => b.aiConfidence - a.aiConfidence);
      setAiResults(matchedItems);
    } catch (error) {
      console.error(error);
      alert("AI 분석 중 오류가 발생했습니다.");
    } finally {
      setIsAiSearching(false);
    }
  };

  const handleClaimSubmit = () => {
    if (!newClaimName.trim() || !newClaimInfo.trim()) return alert("물품명과 상세 정보를 모두 입력해주세요.");
    
    const newClaim = {
      id: `c_${Date.now()}`,
      itemName: newClaimName,
      itemInfo: newClaimInfo,
      status: '접수됨',
      registeredAt: new Date().toISOString()
    };
    
    setClaims([newClaim, ...claims]);
    setNewClaimName('');
    setNewClaimInfo('');
    setClaimPage(1);
    alert("정상적으로 접수되었습니다.");
  };

  const handleDailyClaimMatch = async () => {
    if (!GEMINI_KEY) return alert("환경변수에 VITE_GEMINI_API_KEY를 설정해주세요.");
    
    const pendingClaims = validClaims.filter(c => c.status === '접수됨');
    if (pendingClaims.length === 0) return alert("현재 대기 중인 청구 내역이 없습니다.");

    const storageItems = items.filter(i => i.status === '보관중').map(i => ({
      id: i.id, feature: i.feature, color: i.color, description: i.description, location: i.foundLocation
    }));

    if (storageItems.length === 0) return alert("현재 보관 창고에 대조할 물품이 없습니다.");

    setIsClaimMatching(true);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
      const promptText = `
        너는 유실물 센터의 AI 매니저야.
        아래 [고객 청구 분실물 목록(찾는 물건)]과 [현재 보관중인 습득물 목록]을 비교해서,
        서로 동일한 물건일 확률이 50% 이상인 짝(Match)을 찾아줘.
        
        [고객 청구 목록]: ${JSON.stringify(pendingClaims.map(c => ({ id: c.id, name: c.itemName, info: c.itemInfo })))}
        [보관중 습득물]: ${JSON.stringify(storageItems)}

        결과는 무조건 아래 JSON 배열 형식으로만 반환해. 매칭된 게 없으면 빈 배열 [] 반환.
        [ { "claimId": "청구목록id", "matchedItemId": "보관중습득물id", "confidence": 85, "reason": "매칭 판단 이유 (1줄)" } ]
      `;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }], generationConfig: { responseMimeType: "application/json" } })
      });

      const data = await response.json();
      const matchResults = JSON.parse(data.candidates[0].content.parts[0].text);

      if (matchResults.length === 0) {
        alert("보관 중인 물품 중 의심되는 매칭 결과가 없습니다.");
      } else {
        const updatedClaims = claims.map(claim => {
          const matchInfo = matchResults.find(m => m.claimId === claim.id);
          if (matchInfo) {
            const storedItem = items.find(i => i.id === matchInfo.matchedItemId);
            return {
              ...claim,
              status: '의심물품 발견',
              matchedFeature: storedItem ? cleanFeatureText(storedItem) : '알 수 없음',
              matchedSerial: storedItem ? storedItem.serialNumber : '-',
              aiReason: matchInfo.reason,
              aiConfidence: matchInfo.confidence
            };
          }
          return claim;
        });
        setClaims(updatedClaims);
        alert(`${matchResults.length}건의 의심 물품을 발견했습니다! 목록의 경고 표시를 확인하세요.`);
      }
    } catch (error) {
      console.error(error);
      alert("매칭 분석 중 오류가 발생했습니다.");
    } finally {
      setIsClaimMatching(false);
    }
  };

  const now = new Date();
  const thisYear = now.getFullYear(); const thisMonth = now.getMonth();
  const today = new Date(thisYear, thisMonth, now.getDate());
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const lastMonthDate = new Date(thisYear, thisMonth - 1, 1);
  const lastMonthYear = lastMonthDate.getFullYear(); const lastMonthIdx = lastMonthDate.getMonth();
  
  const isTargetDay = (dStr, tDate) => dStr && new Date(dStr).getFullYear() === tDate.getFullYear() && new Date(dStr).getMonth() === tDate.getMonth() && new Date(dStr).getDate() === tDate.getDate();
  const isTargetMonth = (dStr, y, m) => dStr && new Date(dStr).getFullYear() === y && new Date(dStr).getMonth() === m;
  const isTargetYear = (dStr, y) => dStr && new Date(dStr).getFullYear() === y;

  const storageItems = items.filter(item => item.status === '보관중');
  const d1Items = items.filter(item => item.status === '보관중' && item.registeredAt && Math.floor((now.getTime() - new Date(item.registeredAt).getTime()) / (1000 * 60 * 60 * 24)) === 6);
  const d2Items = items.filter(item => item.status === '보관중' && item.registeredAt && Math.floor((now.getTime() - new Date(item.registeredAt).getTime()) / (1000 * 60 * 60 * 24)) === 5);
  const currentTransferItems = transferTab === 'D-1' ? d1Items : d2Items;
  
  // 데이터 페이지네이션 적용 (모두 10개)
  const paginatedSearchItems = filteredItems.slice((searchPage - 1) * itemsPerPage, searchPage * itemsPerPage);
  const paginatedTransferItems = currentTransferItems.slice((transferPage - 1) * itemsPerPage, transferPage * itemsPerPage);
  
  // 청구 접수 7일 자동 삭제 필터링
  const validClaims = claims.filter(c => {
    const diff = now.getTime() - new Date(c.registeredAt).getTime();
    return diff < 7 * 24 * 60 * 60 * 1000;
  });
  const paginatedClaims = validClaims.slice((claimPage - 1) * itemsPerPage, claimPage * itemsPerPage);

  const getStatsFromList = (list) => {
    const byCategory = {}; 
    categories.filter(c => c !== '전체').forEach(c => byCategory[c] = 0);
    list.forEach(i => { 
      if(i.main_category && byCategory[i.main_category] !== undefined) {
        byCategory[i.main_category]++; 
      }
    });
    return { total: list.length, byCategory };
  };

  const storageStats = getStatsFromList(storageItems);
  const imminentStats = getStatsFromList(d1Items);
  const claimStats = { total: validClaims.length, byCategory: {} };

  let currReg=0, currRet=0, currDis=0, prevReg=0, prevRet=0, prevDis=0, labelCurr='', labelPrev='', chartTitle='';
  let chartData = [];
  if (timeframe === 'daily') {
    labelCurr = '오늘'; labelPrev = '어제'; chartTitle = `${thisMonth + 1}월 일별 접수 및 처리 추이`;
    chartData = Array.from({length: new Date(thisYear, thisMonth + 1, 0).getDate()}, (_, i) => ({ name: `${i+1}일`, 접수:0, 반환:0, 이관:0 }));
    items.forEach(item => {
      const actionDate = item.updatedAt || item.registeredAt;
      if (isTargetDay(item.registeredAt, today)) currReg++; if (isTargetDay(item.registeredAt, yesterday)) prevReg++;
      if (item.status === '반환완료') { if (isTargetDay(actionDate, today)) currRet++; if (isTargetDay(actionDate, yesterday)) prevRet++; }
      if (item.status === '폐기/이관') { if (isTargetDay(actionDate, today)) currDis++; if (isTargetDay(actionDate, yesterday)) prevDis++; }
      if (isTargetMonth(item.registeredAt, thisYear, thisMonth)) chartData[new Date(item.registeredAt).getDate() - 1].접수++;
      if (item.status === '반환완료' && isTargetMonth(actionDate, thisYear, thisMonth)) chartData[new Date(actionDate).getDate() - 1].반환++;
      if (item.status === '폐기/이관' && isTargetMonth(actionDate, thisYear, thisMonth)) chartData[new Date(actionDate).getDate() - 1].이관++;
    });
  } else if (timeframe === 'monthly') {
    labelCurr = '이번 달'; labelPrev = '지난달'; chartTitle = `${thisYear}년 월별 접수 및 처리 추이`;
    chartData = Array.from({length: 12}, (_, i) => ({ name: `${i+1}월`, 접수:0, 반환:0, 이관:0 }));
    items.forEach(item => {
      const actionDate = item.updatedAt || item.registeredAt;
      if (isTargetMonth(item.registeredAt, thisYear, thisMonth)) currReg++; if (isTargetMonth(item.registeredAt, lastMonthYear, lastMonthIdx)) prevReg++;
      if (item.status === '반환완료') { if (isTargetMonth(actionDate, thisYear, thisMonth)) currRet++; if (isTargetMonth(actionDate, lastMonthYear, lastMonthIdx)) prevRet++; }
      if (item.status === '폐기/이관') { if (isTargetMonth(actionDate, thisYear, thisMonth)) currDis++; if (isTargetMonth(actionDate, lastMonthYear, lastMonthIdx)) prevDis++; }
      if (isTargetYear(item.registeredAt, thisYear)) chartData[new Date(item.registeredAt).getMonth()].접수++;
      if (item.status === '반환완료' && isTargetYear(actionDate, thisYear)) chartData[new Date(actionDate).getMonth()].반환++;
      if (item.status === '폐기/이관' && isTargetYear(actionDate, thisYear)) chartData[new Date(actionDate).getMonth()].이관++;
    });
  } else {
    labelCurr = '올해'; labelPrev = '전년도'; chartTitle = `최근 5년 접수 및 처리 추이`;
    const startYear = thisYear - 4;
    chartData = Array.from({length: 5}, (_, i) => ({ name: `${startYear + i}년`, 접수:0, 반환:0, 이관:0 }));
    items.forEach(item => {
      const actionDate = item.updatedAt || item.registeredAt;
      if (isTargetYear(item.registeredAt, thisYear)) currReg++; if (isTargetYear(item.registeredAt, thisYear - 1)) prevReg++;
      if (item.status === '반환완료') { if (isTargetYear(actionDate, thisYear)) currRet++; if (isTargetYear(actionDate, thisYear - 1)) prevRet++; }
      if (item.status === '폐기/이관') { if (isTargetYear(actionDate, thisYear)) currDis++; if (isTargetYear(actionDate, thisYear - 1)) prevDis++; }
      const regYear = new Date(item.registeredAt).getFullYear(); const actYear = new Date(actionDate).getFullYear();
      if (regYear >= startYear && regYear <= thisYear) chartData[regYear - startYear].접수++;
      if (item.status === '반환완료' && actYear >= startYear && actYear <= thisYear) chartData[actYear - startYear].반환++;
      if (item.status === '폐기/이관' && actYear >= startYear && actYear <= thisYear) chartData[actYear - startYear].이관++;
    });
  }

  const currRate = currReg > 0 ? Math.round((currRet / currReg) * 100) : 0;
  const prevRate = prevReg > 0 ? Math.round((prevRet / prevReg) * 100) : 0;
  const renderTrend = (curr, prev) => {
    if (prev === 0 && curr === 0) return <span className="kpi-trend" style={{background: '#f1f5f9', color: '#64748b'}}>- {labelPrev}와 동일</span>;
    if (prev === 0 && curr > 0) return <span className="kpi-trend up">▲ {labelPrev} 보다 100% 증가</span>;
    const growth = Math.round(((curr - prev) / prev) * 100);
    return growth > 0 ? <span className="kpi-trend up">▲ {labelPrev} 보다 {growth.toLocaleString()}% 증가</span> : growth < 0 ? <span className="kpi-trend down">▼ {labelPrev} 보다 {Math.abs(growth).toLocaleString()}% 감소</span> : <span className="kpi-trend" style={{background: '#f1f5f9', color: '#64748b'}}>- {labelPrev}와 동일</span>;
  };
  const renderRateTrend = (cRate, pRate) => {
    const diff = cRate - pRate;
    return diff > 0 ? <span className="kpi-trend up">▲ {labelPrev} 대비 {diff}%p 상승</span> : diff < 0 ? <span className="kpi-trend down">▼ {labelPrev} 대비 {Math.abs(diff)}%p 하락</span> : <span className="kpi-trend" style={{background: '#f1f5f9', color: '#64748b'}}>- {labelPrev}와 동일</span>;
  };

  let detailedFilteredItems = [];
  if (detailedTimeframe === 'daily') detailedFilteredItems = items.filter(i => isTargetMonth(i.registeredAt, thisYear, thisMonth));
  else if (detailedTimeframe === 'monthly') detailedFilteredItems = items.filter(i => isTargetYear(i.registeredAt, thisYear));
  else detailedFilteredItems = items.filter(i => new Date(i.registeredAt).getFullYear() >= thisYear - 4);

  const catDetailedStats = {}; categories.filter(c => c !== '전체').forEach(c => catDetailedStats[c] = { total: 0, returned: 0 });
  detailedFilteredItems.forEach(item => {
    if (item.main_category && catDetailedStats[item.main_category]) {
      catDetailedStats[item.main_category].total += 1;
      if (item.status === '반환완료') catDetailedStats[item.main_category].returned += 1;
    }
  });
  
  const pieChartDataRaw = Object.entries(catDetailedStats).filter(([_, data]) => data.total > 0).map(([name, data]) => ({ name, value: data.total })).sort((a, b) => b.value - a.value);
  const top5PieData = pieChartDataRaw.slice(0, 5);
  const othersValue = pieChartDataRaw.slice(5).reduce((sum, item) => sum + item.value, 0);
  const finalPieData = othersValue > 0 ? [...top5PieData, { name: '기타', value: othersValue }] : top5PieData;
  const pieTotal = finalPieData.reduce((sum, d) => sum + d.value, 0);

  const locationCount = {};
  detailedFilteredItems.forEach(item => { if (item.foundLocation) locationCount[item.foundLocation] = (locationCount[item.foundLocation] || 0) + 1; });
  const topLocations = Object.entries(locationCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const simulatedDBStats = { thisMonth: { count: 0, totalLeadTimeMs: 0 }, lastMonth: { count: 0, totalLeadTimeMs: 0 } };
  items.forEach(item => {
    if (item.status === '반환완료' && item.registeredAt && item.updatedAt) {
      const msDiff = new Date(item.updatedAt).getTime() - new Date(item.registeredAt).getTime();
      if (isTargetMonth(item.updatedAt, thisYear, thisMonth)) { simulatedDBStats.thisMonth.count += 1; simulatedDBStats.thisMonth.totalLeadTimeMs += msDiff; }
      else if (isTargetMonth(item.updatedAt, lastMonthYear, lastMonthIdx)) { simulatedDBStats.lastMonth.count += 1; simulatedDBStats.lastMonth.totalLeadTimeMs += msDiff; }
    }
  });

  const thisMonthAvgHours = simulatedDBStats.thisMonth.count > 0 ? Math.round(simulatedDBStats.thisMonth.totalLeadTimeMs / simulatedDBStats.thisMonth.count / (1000 * 60 * 60)) : 0;
  const lastMonthAvgHours = simulatedDBStats.lastMonth.count > 0 ? Math.round(simulatedDBStats.lastMonth.totalLeadTimeMs / simulatedDBStats.lastMonth.count / (1000 * 60 * 60)) : 0;

  let avgLeadTimeText = "데이터 없음";
  if (simulatedDBStats.thisMonth.count > 0) {
    const days = Math.floor(thisMonthAvgHours / 24); const hours = thisMonthAvgHours % 24;
    avgLeadTimeText = (days > 0 && hours > 0) ? `${days}일 ${hours}시` : days > 0 ? `${days}일` : `${hours}시`;
  }

  let leadTimeTrendUI = <span className="kpi-trend" style={{background: '#f1f5f9', color: '#64748b'}}>- 비교할 지난달 데이터 없음</span>;
  if (simulatedDBStats.lastMonth.count > 0) {
    const diffHours = thisMonthAvgHours - lastMonthAvgHours;
    if (diffHours < 0) leadTimeTrendUI = <span className="kpi-trend up">▼ 지난달 보다 {Math.abs(diffHours)}시간 단축</span>;
    else if (diffHours > 0) leadTimeTrendUI = <span className="kpi-trend down">▲ 지난달 보다 {diffHours}시간 지연</span>;
    else leadTimeTrendUI = <span className="kpi-trend" style={{background: '#f1f5f9', color: '#64748b'}}>- 지난달과 동일</span>;
  }

  return (
    <div className="admin-container">
      <div className={`drawer-overlay ${isDrawerOpen ? 'open' : ''}`} onClick={closeDrawer}></div>
      <aside className={`filter-drawer ${isDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-header"><h3>상세 조회 필터</h3><button className="close-btn" onClick={closeDrawer}>×</button></div>
        <div className="drawer-content">
          <div className="filter-section">
            <h4>정렬 기준</h4>
            <div className="filter-options">
              {['최신순', '과거순', '가나다순'].map(sort => (
                <button key={sort} className={`f-btn ${tempSort === sort ? 'active' : ''}`} onClick={() => setTempSort(sort)}>{sort}</button>
              ))}
            </div>
          </div>
          <div className="filter-section">
            <h4>처리 상태 (다중 선택)</h4>
            <div className="filter-options">
              {['보관중', '반환완료', '폐기/이관'].map(stat => (
                <button key={stat} className={`f-btn ${tempStatus.includes(stat) ? 'active' : ''}`} onClick={() => toggleStatus(stat)}>{stat}</button>
              ))}
            </div>
          </div>
          <div className="filter-section">
            <h4>대분류</h4>
            <select className="category-select" value={tempCat} onChange={e => setTempCat(e.target.value)}>
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div className="filter-section">
            <h4>등록 기간</h4>
            <div className="date-inputs">
              <input type="date" value={tempStartDate} onChange={e => setTempStartDate(e.target.value)} />
              <span>~</span>
              <input type="date" value={tempEndDate} onChange={e => setTempEndDate(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="drawer-footer">
          <button className="reset-btn" onClick={resetFilters}>초기화</button>
          <button className="apply-btn" onClick={applyFilters}>조건 적용하기</button>
        </div>
      </aside>

      {/* 🌟 사이드바 플랫 구조 개편 적용 🌟 */}
      <nav className="sidebar">
        <h2 className="logo">철도 분실물<br />통합 관리 시스템</h2>
        
        {/* 검색 메뉴 그룹 */}
        <div className="menu-section">
          <div className="menu-label">
            <IconMenuSearch /> 검색 메뉴
          </div>
          <div className={`menu-item ${activeMenu === 'search' ? 'active' : ''}`} onClick={() => setActiveMenu('search')}>
            통합 물품 검색
          </div>
          <div className={`menu-item ${activeMenu === 'ai_search' ? 'active' : ''}`} onClick={() => setActiveMenu('ai_search')}>
            AI 스마트 검색
          </div>
        </div>

        {/* 관리/통계 메뉴 그룹 */}
        <div className="menu-section">
          <div className="menu-label">
            <IconMenu d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /> 
            분실물 관리/통계
          </div>
          <div className={`menu-item ${activeMenu === 'manage' ? 'active' : ''}`} onClick={() => setActiveMenu('manage')}>
            분실물 관리
          </div>
          <div className={`menu-item ${activeMenu === 'stats' ? 'active' : ''}`} onClick={() => setActiveMenu('stats')}>
            분실물 통계
          </div>
        </div>

        {/* 기타 메뉴 그룹 */}
        <div className="menu-section">
          <div className="menu-label">
            <IconArchive /> 기타 메뉴
          </div>
          <div className={`menu-item ${activeMenu === 'transfer_manage' ? 'active' : ''}`} onClick={() => setActiveMenu('transfer_manage')}>
            이관 예정 물품 관리
          </div>
          <div className={`menu-item ${activeMenu === 'claim_manage' ? 'active' : ''}`} onClick={() => setActiveMenu('claim_manage')}>
            고객 청구 분실물 접수
          </div>
        </div>
      </nav>

      <main className="main-content">
        {activeMenu === 'search' ? (
          !selectedItem ? (
            <>
              <section className="inquiry-section">
                <div className="search-bar-wrapper">
                  <div className="search-input-container">
                    <IconSearch />
                    <input 
                      type="text" 
                      className="main-search-input" 
                      placeholder="물품명, S/N, 습득장소 통합 검색" 
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm.length > 0 && (
                      <button className="search-clear-btn" onClick={() => setSearchTerm('')}>✕</button>
                    )}
                  </div>
                  <button className="filter-open-btn" onClick={() => setIsDrawerOpen(true)}><IconFilter /> 필터 옵션</button>
                </div>
              </section>
              <div className="table-container">
                {loading ? <p style={{textAlign:'center', padding:'50px', color:'#94a3b8'}}>데이터 로딩 중...</p> : (
                  <>
                    <table className="data-table fixed-layout">
                      <thead>
                        <tr>
                          <th style={{width: '10%'}}>상태</th>
                          <th style={{width: '25%'}}>일련번호</th>
                          <th style={{width: '15%'}}>대분류</th>
                          <th style={{width: '20%'}}>물품명</th>
                          <th style={{width: '15%'}}>습득장소</th>
                          <th style={{width: '15%'}}>등록일</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedSearchItems.map(item => (
                          <tr key={item.id} className="clickable-row" onClick={() => setSelectedItem(item)}>
                            <td><span className={`status-badge ${getStatusClass(item.status)}`}>{item.status}</span></td>
                            <td className="serial">{item.serialNumber || '-'}</td>
                            <td>{item.main_category}</td>
                            <td className="col-feature" title={cleanFeatureText(item)}>{cleanFeatureText(item)}</td>
                            <td title={item.foundLocation}>{item.foundLocation}</td>
                            <td>{new Date(item.registeredAt).toLocaleDateString()}</td>
                          </tr>
                        ))}
                        {paginatedSearchItems.length === 0 && (
                          <tr><td colSpan="6" style={{padding: '50px', color: '#94a3b8', textAlign: 'center'}}>검색 결과가 없습니다.</td></tr>
                        )}
                      </tbody>
                    </table>
                    {filteredItems.length > 0 ? (
                      <Pagination currentPage={searchPage} setCurrentPage={setSearchPage} totalItems={filteredItems.length} itemsPerPage={itemsPerPage} />
                    ) : (
                      <div className="pagination"><button disabled>이전</button><button className="active">1</button><button disabled>다음</button></div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="detail-view">
              <div className="detail-header">
                <button className="back-btn" onClick={() => setSelectedItem(null)}>← 목록으로 돌아가기</button>
                <h2 className="detail-title">물품 상세 정보</h2>
              </div>
              <div className="detail-container">
                <div className="detail-image-box">
                  {selectedItem.imageUrl ? <img src={selectedItem.imageUrl} alt="사진" /> : <span className="no-image">등록된 사진이 없습니다</span>}
                </div>
                <div className="detail-info">
                  <div>
                    <span className={`status-badge ${getStatusClass(selectedItem.status)}`}>{selectedItem.status}</span>
                    <h3 className="detail-main-title">{selectedItem.feature}</h3>
                  </div>
                  <div className="info-grid">
                    <span className="info-label">일련번호</span><span className="serial">{selectedItem.serialNumber || '발급 전'}</span>
                    <span className="info-label">대분류</span><span className="info-value">{selectedItem.main_category}</span>
                    <span className="info-label">소분류</span><span className="info-value">{selectedItem.sub_category || '-'}</span>
                    <span className="info-label">습득장소</span><span className="info-value">{selectedItem.foundLocation}</span>
                    <span className="info-label">등록일시</span><span className="info-value">{formatDate(selectedItem.registeredAt)}</span>
                  </div>
                  <div className="detail-section">
                    <h4>상세 묘사</h4>
                    <p>{selectedItem.description || '없음'}</p>
                  </div>
                  <div className="detail-section">
                    <h4>특이사항</h4>
                    <p>{selectedItem.specialNote || '없음'}</p>
                  </div>
                  <div className="detail-section pi-section">
                    <h4>개인정보 내역</h4>
                    <div className="info-grid">
                      <span className="info-label">이름</span><span className="info-value">{selectedItem.pi_name || '-'}</span>
                      <span className="info-label">카드번호</span><span className="info-value">{selectedItem.pi_card || '-'}</span>
                      <span className="info-label">주민번호</span><span className="info-value">{selectedItem.pi_resident || '-'}</span>
                      <span className="info-label">여권번호</span><span className="info-value">{selectedItem.pi_passport || '-'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        
        ) : activeMenu === 'ai_search' ? (
          !selectedItem ? (
            <>
              <section className="inquiry-section full-width-ai">
                <div className="ai-header">
                  <h3>AI 스마트 검색</h3>
                  <p>물품의 색상, 형태, 잃어버린 상황 등을 추상적으로 입력해도 유사한 보관 물품을 찾아냅니다.</p>
                </div>
                <div className="search-bar-wrapper ai-search-wrapper">
                  <div className="search-input-container">
                    <IconSearch />
                    <input 
                      type="text" 
                      className="main-search-input" 
                      placeholder="예: 까만색이고 가죽 재질인 반지갑" 
                      value={aiSearchQuery} 
                      onChange={(e) => setAiSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAiSearch()}
                    />
                    {aiSearchQuery.length > 0 && (
                      <button className="search-clear-btn" onClick={() => setAiSearchQuery('')}>✕</button>
                    )}
                  </div>
                  <button className="ai-search-btn" onClick={handleAiSearch} disabled={isAiSearching}>
                    {isAiSearching ? '데이터 분석 중...' : '데이터베이스 분석 시작'}
                  </button>
                </div>
              </section>

              <div className="table-container mt-20">
                {isAiSearching ? (
                  <div className="ai-loading-container">
                    <div className="ai-spinner"></div>
                    <p className="ai-loading-text">AI 모델이 특징을 추출하고 교차 검증하는 중입니다...</p>
                  </div>
                ) : aiResults.length > 0 ? (
                  <table className="data-table fixed-layout">
                    <thead>
                      <tr>
                        <th style={{width: '15%'}}>일치율</th>
                        <th style={{width: '45%'}}>AI 추천 사유</th>
                        <th style={{width: '20%'}}>물품명</th>
                        <th style={{width: '20%'}}>등록일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiResults.map(item => (
                        <tr key={item.id} className="clickable-row" onClick={() => setSelectedItem(item)}>
                          <td>
                            <div className="ai-match-badge">{item.aiConfidence}%</div>
                          </td>
                          <td className="text-left font-13" title={item.aiReason}>
                            {item.aiReason}
                          </td>
                          <td className="font-bold" title={cleanFeatureText(item)}>{cleanFeatureText(item)}</td>
                          <td>{new Date(item.registeredAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-chart">
                    <p>검색 결과가 여기에 표시됩니다.</p>
                    <p style={{ fontSize: '13px', marginTop: '5px' }}>현재 센터에 '보관중'인 물품만 대상으로 분석합니다.</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="detail-view">
              <div className="detail-header">
                <button className="back-btn" onClick={() => setSelectedItem(null)}>← 목록으로 돌아가기</button>
                <h2 className="detail-title">물품 상세 정보</h2>
              </div>
              <div className="detail-container">
                <div className="detail-image-box">
                  {selectedItem.imageUrl ? <img src={selectedItem.imageUrl} alt="사진" /> : <span className="no-image">등록된 사진이 없습니다</span>}
                </div>
                <div className="detail-info">
                  {selectedItem.aiConfidence && (
                    <div className="ai-report-box">
                      <h4>AI 분석 리포트 (일치율: {selectedItem.aiConfidence}%)</h4>
                      <p>{selectedItem.aiReason}</p>
                    </div>
                  )}
                  <div>
                    <span className={`status-badge ${getStatusClass(selectedItem.status)}`}>{selectedItem.status}</span>
                    <h3 className="detail-main-title">{selectedItem.feature}</h3>
                  </div>
                  <div className="info-grid">
                    <span className="info-label">일련번호</span><span className="serial">{selectedItem.serialNumber || '발급 전'}</span>
                    <span className="info-label">대분류</span><span className="info-value">{selectedItem.main_category}</span>
                    <span className="info-label">소분류</span><span className="info-value">{selectedItem.sub_category || '-'}</span>
                    <span className="info-label">습득장소</span><span className="info-value">{selectedItem.foundLocation}</span>
                    <span className="info-label">등록일시</span><span className="info-value">{formatDate(selectedItem.registeredAt)}</span>
                  </div>
                  <div className="detail-section">
                    <h4>상세 묘사</h4>
                    <p>{selectedItem.description || '없음'}</p>
                  </div>
                  <div className="detail-section">
                    <h4>특이사항</h4>
                    <p>{selectedItem.specialNote || '없음'}</p>
                  </div>
                </div>
              </div>
            </div>
          )

        ) : activeMenu === 'manage' ? (
          <div className="manage-dashboard">
            <div className="dashboard-header"><h2 className="dashboard-title">분실물 관리 / 통계 대시보드</h2></div>
            
            <div className="monthly-summary-container">
              <div className="monthly-summary-box">
                <div className="monthly-icon-box" style={{backgroundColor: '#e0f2fe', color: '#0ea5e9'}}>
                  <IconMenu d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </div>
                <div className="monthly-text">
                  <span className="monthly-label">현재 보관중인 분실물</span>
                  <span className="monthly-value storage">{storageStats.total.toLocaleString()}<span>건</span></span>
                </div>
              </div>
              <div className="monthly-summary-box">
                <div className="monthly-icon-box" style={{backgroundColor: '#fee2e2', color: '#f43f5e'}}>
                  <IconMenu d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </div>
                <div className="monthly-text">
                  <span className="monthly-label">이관 임박 물품 (D-1)</span>
                  <span className="monthly-value discard">{imminentStats.total.toLocaleString()}<span>건</span></span>
                </div>
              </div>
              <div className="monthly-summary-box">
                <div className="monthly-icon-box" style={{backgroundColor: '#fef3c7', color: '#d97706'}}>
                  <IconMenu d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </div>
                <div className="monthly-text">
                  <span className="monthly-label">고객 청구 접수 대기</span>
                  <span className="monthly-value" style={{color: '#d97706'}}>{claimStats.total.toLocaleString()}<span>건</span></span>
                </div>
              </div>
            </div>
            
            <div className="stats-cards-container">
              <div className="stat-card card-storage">
                <div className="stat-card-header">
                  <h3>전체 보관중 <span className="stat-badge storage">보관중</span></h3>
                  <div className="total-count">{storageStats.total}<span>건</span></div>
                </div>
                <div className="stat-card-body">
                  {Object.entries(storageStats.byCategory).map(([cat, count]) => (
                    <div key={cat} className="stat-row">
                      <span className="stat-cat-name">{cat}</span>
                      <span className="stat-cat-count">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="stat-card card-discard">
                <div className="stat-card-header" style={{cursor: 'pointer'}} onClick={() => setActiveMenu('transfer_manage')}>
                  <h3 style={{width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                      이관 임박 물품 <span className="stat-badge discard">D-1</span>
                    </div>
                    <span style={{color: '#94a3b8', fontSize: '18px'}}>&gt;</span>
                  </h3>
                  <div className="total-count" style={{color: '#f43f5e', marginTop: '10px'}}>{imminentStats.total}<span>건</span></div>
                </div>
                <div className="stat-card-body">
                  {Object.entries(imminentStats.byCategory).map(([cat, count]) => (
                    <div key={cat} className="stat-row">
                      <span className="stat-cat-name">{cat}</span>
                      <span className="stat-cat-count">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="stat-card">
                <div className="stat-card-header" style={{cursor: 'pointer', paddingBottom: '10px'}} onClick={() => setActiveMenu('claim_manage')}>
                  <h3 style={{width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                      고객 청구 물품 <span className="stat-badge" style={{background:'#fef3c7', color:'#b45309'}}>대기중</span>
                    </div>
                    <span style={{color: '#94a3b8', fontSize: '18px'}}>&gt;</span>
                  </h3>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px'}}>
                    <div className="total-count" style={{color:'#d97706'}}>{claimStats.total}<span>건</span></div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDailyClaimMatch(); }} 
                      disabled={isClaimMatching}
                      style={{padding: '8px 12px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', zIndex: 10}}
                    >
                      {isClaimMatching ? '분석 중...' : '🔄 갱신'}
                    </button>
                  </div>
                </div>
                <div className="stat-card-body">
                  <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                    {claims.filter(c => c.status === '의심물품 발견').length > 0 ? (
                      claims.filter(c => c.status === '의심물품 발견').map(c => (
                        <div key={c.id} style={{padding: '12px', background: '#fff1f2', border: '1px solid #ffe4e6', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '6px'}}>
                          <div style={{fontSize: '13px', fontWeight: '800', color: '#e11d48'}}>⚠️ {c.itemName}</div>
                          <div style={{fontSize: '13px', color: '#475569', wordBreak: 'keep-all', lineHeight: '1.4'}}>
                            발견: {c.matchedFeature} ({c.matchedSerial})
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: '13px', backgroundColor: '#f8fafc', borderRadius: '8px'}}>의심 물품 내역이 없습니다.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        
        ) : activeMenu === 'stats' ? (
          <div className="stats-dashboard-container">
            <div className="dashboard-header"><h2 className="dashboard-title">분실물 관리 / 통계 대시보드</h2></div>
            <div className="stats-tabs">
              <button className={`stat-tab-btn ${activeStatTab === 'basic' ? 'active' : ''}`} onClick={() => setActiveStatTab('basic')}>기본 통계 (연/월/일별)</button>
              <button className={`stat-tab-btn ${activeStatTab === 'detailed' ? 'active' : ''}`} onClick={() => setActiveStatTab('detailed')}>세부 통계 (분석 인사이트)</button>
            </div>
            {activeStatTab === 'basic' ? (
              <div className="stat-tab-content">
                <div className="chart-box full-width">
                  <div className="chart-header-row">
                    <h3>{chartTitle}</h3>
                    <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="timeframe-select">
                      <option value="daily">일별 (이번 달)</option>
                      <option value="monthly">월별 (올해)</option>
                      <option value="yearly">연도별 (최근 5년)</option>
                    </select>
                  </div>
                  <div className="chart-wrapper" style={{ height: '350px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 13}} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 13}} dx={-10} />
                        <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)'}} />
                        <Legend wrapperStyle={{paddingTop: '20px'}} />
                        <Line type="monotone" dataKey="접수" stroke="#0ea5e9" strokeWidth={4} dot={{r: 4}} activeDot={{r: 8}} />
                        <Line type="monotone" dataKey="반환" stroke="#10b981" strokeWidth={4} dot={{r: 4}} activeDot={{r: 8}} />
                        <Line type="monotone" dataKey="이관" stroke="#f43f5e" strokeWidth={4} dot={{r: 4}} activeDot={{r: 8}} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="kpi-grid">
                  <div className="kpi-card"><span className="kpi-label">{labelCurr} 접수 건수</span><div className="kpi-value" style={{color: '#0ea5e9'}}>{currReg.toLocaleString()}<span>건</span></div>{renderTrend(currReg, prevReg)}</div>
                  <div className="kpi-card"><span className="kpi-label">{labelCurr} 반환 건수</span><div className="kpi-value" style={{color: '#10b981'}}>{currRet.toLocaleString()}<span>건</span></div>{renderTrend(currRet, prevRet)}</div>
                  <div className="kpi-card"><span className="kpi-label">{labelCurr} 이관 건수</span><div className="kpi-value" style={{color: '#f43f5e'}}>{currDis.toLocaleString()}<span>건</span></div>{renderTrend(currDis, prevDis)}</div>
                  <div className="kpi-card"><span className="kpi-label">{labelCurr} 평균 반환율</span><div className="kpi-value">{currRate.toLocaleString()}<span>%</span></div>{renderRateTrend(currRate, prevRate)}</div>
                </div>
              </div>
            ) : (
              <div className="stat-tab-content">
                <div className="chart-box full-width">
                  <div className="chart-header-row">
                    <h3>카테고리별 분실물 통계 (등록 비중 및 반환율)</h3>
                    <select value={detailedTimeframe} onChange={(e) => setDetailedTimeframe(e.target.value)} className="timeframe-select">
                      <option value="daily">일별 (이번 달)</option>
                      <option value="monthly">월별 (올해)</option>
                      <option value="yearly">연도별 (최근 5년)</option>
                    </select>
                  </div>
                  <div className="detailed-category-container">
                    <div className="pie-section">
                      <h4 className="sub-title">카테고리별 등록 건수</h4>
                      <div style={{ width: '100%', height: '280px' }}>
                        {finalPieData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={finalPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                                {finalPieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.name === '기타' ? '#e2e8f0' : PIE_COLORS[index % PIE_COLORS.length]} />)}
                              </Pie>
                              <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)'}} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : <p className="empty-chart">데이터가 없습니다.</p>}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 15px', padding: '15px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                        {top5PieData.map((item, index) => {
                          const pct = pieTotal > 0 ? Math.round((item.value / pieTotal) * 100) : 0;
                          return (
                            <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', fontWeight: '800' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ color: '#1e293b', width: '14px' }}>{index + 1}.</span><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}></div><span style={{ color: PIE_COLORS[index % PIE_COLORS.length] }}>{item.name}</span></div>
                              <span style={{ color: '#64748b', fontSize: '12px', minWidth: '35px', textAlign: 'right' }}>{pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="rate-grid-section">
                      <h4 className="sub-title">카테고리별 반환율 현황</h4>
                      <div className="return-rate-grid">
                        {categories.filter(c => c !== '전체').map(cat => {
                          const data = catDetailedStats[cat];
                          const rate = data.total > 0 ? Math.round((data.returned / data.total) * 100) : 0;
                          return (<div key={cat} className="rate-item"><span className="rate-cat">{cat}</span><span className="rate-val" style={{color: rate === 0 && data.total === 0 ? '#cbd5e1' : '#0ea5e9'}}>{rate}%</span></div>);
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid-2col">
                  <div className="chart-box">
                    <h3>습득 장소 상위 5곳</h3>
                    <div className="chart-wrapper" style={{ height: '250px' }}>
                      {topLocations.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={topLocations.map(l => ({ name: l[0], 건수: l[1] }))} layout="vertical" margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 13, fontWeight: 600}} width={80} />
                            <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)'}} />
                            <Bar dataKey="건수" fill="#f43f5e" radius={[0, 8, 8, 0]} barSize={24} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : <p className="empty-chart">데이터가 없습니다.</p>}
                    </div>
                  </div>
                  <div className="chart-box">
                    <h3>이번 달 평균 반환 소요 시간</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '250px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                      <IconClock />
                      <div style={{ fontSize: '42px', fontWeight: '900', color: '#10b981', margin: '15px 0 5px 0', letterSpacing: '-1px' }}>{avgLeadTimeText}</div>
                      <div style={{ marginTop: '8px' }}>{leadTimeTrendUI}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        
        ) : activeMenu === 'transfer_manage' ? (
          <div className="manage-dashboard">
            <div className="dashboard-header"><h2 className="dashboard-title">이관 예정 물품 관리</h2></div>
            <div className="stats-tabs">
              <button className={`stat-tab-btn ${transferTab === 'D-1' ? 'active' : ''}`} onClick={() => { setTransferTab('D-1'); setTransferPage(1); }}>
                1일 남음 ({d1Items.length}개)
              </button>
              <button className={`stat-tab-btn ${transferTab === 'D-2' ? 'active' : ''}`} onClick={() => { setTransferTab('D-2'); setTransferPage(1); }}>
                2일 남음 ({d2Items.length}개)
              </button>
            </div>
            
            <div className="stat-tab-content">
              <div style={{backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.02)'}}>
                <table className="data-table fixed-layout" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th style={{width: '25%', padding: '15px'}}>대분류</th>
                      <th style={{width: '45%', padding: '15px'}}>물품명</th>
                      <th style={{width: '30%', padding: '15px'}}>일련번호</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTransferItems.length > 0 ? (
                      paginatedTransferItems.map(item => (
                        <tr key={item.id} style={{cursor: 'default', backgroundColor: '#fff'}}>
                          <td style={{padding: '15px'}}>{item.main_category || '기타물품'}</td>
                          <td style={{fontWeight: '700', color: '#334155', padding: '15px'}} title={cleanFeatureText(item)}>{cleanFeatureText(item)}</td>
                          <td className="serial" style={{padding: '15px'}}>{item.serialNumber || '-'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan="3" style={{padding: '60px', color: '#94a3b8', textAlign: 'center'}}>해당하는 이관 예정 물품이 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
                {currentTransferItems.length > 0 ? (
                  <Pagination currentPage={transferPage} setCurrentPage={setTransferPage} totalItems={currentTransferItems.length} itemsPerPage={itemsPerPage} />
                ) : (
                  <div className="pagination"><button disabled>이전</button><button className="active">1</button><button disabled>다음</button></div>
                )}
              </div>
            </div>
          </div>
        
        ) : activeMenu === 'claim_manage' ? (
          <div className="manage-dashboard">
            <div className="dashboard-header"><h2 className="dashboard-title">고객 청구 분실물 접수</h2></div>
            
            <div className="claim-input-section">
              <h3>새로운 분실물 청구 접수</h3>
              <div className="claim-form">
                <input type="text" className="claim-input" placeholder="물품명 (예: 검은색 가죽 지갑)" value={newClaimName} onChange={e => setNewClaimName(e.target.value)} />
                <textarea className="claim-textarea" placeholder="상세 정보 (잃어버린 시간, 장소, 내용물 등 구체적으로)" value={newClaimInfo} onChange={e => setNewClaimInfo(e.target.value)} />
                <button className="claim-submit-btn" onClick={handleClaimSubmit}>접수 등록하기</button>
              </div>
            </div>

            <div className="claim-action-section">
              <div className="action-text">
                <h3>일일 AI 교차 검증</h3>
                <p>접수된 목록과 보관 중인 습득물을 비교하여 동일 물품을 찾아냅니다.</p>
              </div>
              <button className="claim-ai-btn" onClick={handleDailyClaimMatch} disabled={isClaimMatching}>
                {isClaimMatching ? 'AI가 매칭 검사 중입니다...' : '🔄 일일 AI 교차검증 실행'}
              </button>
            </div>

            <div className="table-container" style={{ marginBottom: '50px' }}>
              <table className="data-table fixed-layout">
                <thead>
                  <tr>
                    <th style={{ width: '12%' }}>상태</th>
                    <th style={{ width: '15%' }}>접수일</th>
                    <th style={{ width: '20%' }}>찾는 물품명</th>
                    <th style={{ width: '30%' }}>고객 설명</th>
                    <th style={{ width: '23%' }}>AI 검증 결과</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedClaims.length > 0 ? (
                    paginatedClaims.map(claim => (
                      <tr key={claim.id} style={{ backgroundColor: claim.status === '의심물품 발견' ? '#fff1f2' : '#fff' }}>
                        <td>
                          <span className={`status-badge ${claim.status === '의심물품 발견' ? 'status-discard' : 'status-default'}`} style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                            {claim.status === '의심물품 발견' && <IconAlert />}
                            {claim.status}
                          </span>
                        </td>
                        <td>{new Date(claim.registeredAt).toLocaleDateString()}</td>
                        <td style={{ fontWeight: '700', color: '#1e293b' }} title={claim.itemName}>{claim.itemName}</td>
                        <td style={{ fontSize: '13px', color: '#475569', textAlign: 'left' }} title={claim.itemInfo}>{claim.itemInfo}</td>
                        <td style={{ fontSize: '13px', textAlign: 'left' }} title={claim.aiReason || '대조 대기 중'}>
                          {claim.status === '의심물품 발견' ? (
                            <div style={{ color: '#e11d48' }}>
                              <strong style={{ display: 'block', marginBottom: '4px' }}>[{claim.matchedFeature}] ({claim.aiConfidence}%)</strong>
                              S/N: {claim.matchedSerial}
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>대조 대기 중</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" style={{ padding: '60px', color: '#94a3b8', textAlign: 'center' }}>최근 7일 내 접수된 고객 청구 내역이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {validClaims.length > 0 ? (
                <Pagination currentPage={claimPage} setCurrentPage={setClaimPage} totalItems={validClaims.length} itemsPerPage={itemsPerPage} />
              ) : (
                <div className="pagination"><button disabled>이전</button><button className="active">1</button><button disabled>다음</button></div>
              )}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default App;