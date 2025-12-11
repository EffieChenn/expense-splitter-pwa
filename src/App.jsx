import React, { useState, useMemo, useEffect, useCallback } from "react";

// 1. 引入 Recharts (從 npm 套件)
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";

// 2. 引入 Lucide React 圖示 (從 npm 套件，不需要再自己畫 SVG 了)
import {
  CreditCard,
  User,
  Users,
  Heart,
  Check,
  X,
  Plus,
  PieChart as PieIcon,
  ArrowLeftRight,
  Settings,
  Wallet,
  FileText,
  Calendar,
  Trash2,
  Loader,
  Sparkles,
  MessageSquareQuote,
  Copy,
  Wand2,
  Banknote,
  Flame,
  Zap,
  Receipt,
  Coins,
  Calculator,
  HelpCircle,
} from "lucide-react";

// 3. 引入 Firebase (從 npm 套件)
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  onSnapshot,
  serverTimestamp,
  doc,
  deleteDoc,
  orderBy,
  runTransaction,
} from "firebase/firestore";

// --- 設定區域 ---

// 🚨 請在此填入您的 Firebase 設定 (這是從您的 Firebase Console 獲取的)
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCYYWwtVnJ4Duo4R6TeV5z6oYGS-2_2Ug8",
  authDomain: "expense-splitter-pwa.firebaseapp.com",
  projectId: "expense-splitter-pwa",
  storageBucket: "expense-splitter-pwa.firebasestorage.app",
  messagingSenderId: "355640730128",
  appId: "1:355640730128:web:b8a64a1a35f7957b05a095",
};

// 🚨 請在此填入您的 Gemini API Key
const GEMINI_API_KEY = "AIzaSyCk1bHPtjg2DX_n3J_JLgTZy_tdC0dK26E";

const APP_NAMESPACE_ID = "vite-couple-expense-app"; // 您可以自訂這個 ID

// --- 常數與輔助函數 ---
const PIE_COLORS = [
  "#FF9500",
  "#AF52DE",
  "#007AFF",
  "#FF2D55",
  "#5856D6",
  "#8E8E93",
  "#34C759",
];
const currentYear = new Date().getFullYear();

const classifyCategory = (merchant) => {
  let cat = "其他";
  const m = merchant;
  if (
    m.includes("Uber") ||
    m.includes("麥當勞") ||
    m.includes("餐") ||
    m.includes("食") ||
    m.includes("飲料") ||
    m.includes("路易莎") ||
    m.includes("星巴克")
  )
    cat = "餐飲";
  else if (
    m.includes("全聯") ||
    m.includes("家樂福") ||
    m.includes("寶雅") ||
    m.includes("康是美") ||
    m.includes("超市") ||
    m.includes("屈臣氏")
  )
    cat = "居家";
  else if (
    m.includes("客運") ||
    m.includes("高鐵") ||
    m.includes("車") ||
    m.includes("加油") ||
    m.includes("捷運") ||
    m.includes("悠遊卡") ||
    m.includes("Line Taxi")
  )
    cat = "交通";
  else if (
    m.includes("Netflix") ||
    m.includes("Spotify") ||
    m.includes("好樂迪") ||
    m.includes("電影") ||
    m.includes("錢櫃") ||
    m.includes("Steam")
  )
    cat = "娛樂";
  else if (
    m.includes("Uniqlo") ||
    m.includes("Zara") ||
    m.includes("衣") ||
    m.includes("服飾") ||
    m.includes("鞋") ||
    m.includes("GU")
  )
    cat = "購物";
  return cat;
};

const callGemini = async (prompt) => {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.includes("YOUR_GEMINI_API_KEY")) {
    return "錯誤：請先在 App.jsx 程式碼中填入您的 GEMINI_API_KEY。";
  }
  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!response.ok) throw new Error(`API call failed: ${response.status}`);
    const data = await response.json();
    return (
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "AI 暫時無法回應，請稍後再試。"
    );
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "連線發生問題，無法產生內容。";
  }
};

// --- App Component ---

export default function App() {
  // 確認 Recharts 元件是否可用
  const isRechartsReady = !!PieChart;
  const [activeTab, setActiveTab] = useState("swipe");
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);

  const [manualForm, setManualForm] = useState({
    merchant: "",
    amount: "",
    type: "shared",
  });
  const [rawInput, setRawInput] = useState("");
  const [cardNameInput, setCardNameInput] = useState("");
  const [chartView, setChartView] = useState("personal");

  // --- AI State ---
  const [aiMessage, setAiMessage] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiInsight, setAiInsight] = useState("");
  const [isInsightLoading, setIsInsightLoading] = useState(false);

  // --- Firebase State ---
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const appId = APP_NAMESPACE_ID;

  // --- Date Filter State ---
  const today = new Date();
  const currentMonthKey = `${today.getFullYear()}-${String(
    today.getMonth() + 1
  ).padStart(2, "0")}`;
  const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey);
  const [availableMonths, setAvailableMonths] = useState([currentMonthKey]);

  // --- 1. Initialize Firebase & Auth ---
  useEffect(() => {
    if (
      !FIREBASE_CONFIG.apiKey ||
      FIREBASE_CONFIG.apiKey.includes("YOUR_FIREBASE_API_KEY")
    ) {
      alert("請在 src/App.jsx 中填寫正確的 FIREBASE_CONFIG！");
      return;
    }

    try {
      const app = initializeApp(FIREBASE_CONFIG);
      const authInstance = getAuth(app);
      const dbInstance = getFirestore(app);

      setAuth(authInstance);
      setDb(dbInstance);

      const initAuth = async () => {
        await signInAnonymously(authInstance);
      };
      initAuth();

      const unsubscribe = onAuthStateChanged(authInstance, (u) => {
        setUser(u);
        setIsAuthReady(true);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Firebase Init Error:", e);
      alert("Firebase 初始化失敗，請檢查 Config");
    }
  }, []);

  // --- 2. Data Sync ---
  useEffect(() => {
    if (!user || !db) return;

    // 這裡使用您的 Firestore 路徑
    const q = query(
      collection(db, "artifacts", appId, "users", user.uid, "expenses")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        docs.sort((a, b) => {
          // 處理 timestamp 可能為 null 的情況
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          // 如果沒有 createdAt，使用 date 字串比較
          if (timeA === 0 && timeB === 0) {
            const dateA = new Date(a.date || 0).getTime();
            const dateB = new Date(b.date || 0).getTime();
            return dateB - dateA;
          }
          return timeB - timeA;
        });

        setHistory(docs);

        const months = new Set(docs.map((d) => d.monthKey).filter(Boolean));
        if (!months.has(currentMonthKey)) months.add(currentMonthKey);
        setAvailableMonths(Array.from(months).sort().reverse());
      },
      (error) => {
        console.error("Data sync error:", error);
      }
    );

    return () => unsubscribe();
  }, [user, db, appId, currentMonthKey]);

  // --- Actions ---
  const handleSwipe = async (item, type) => {
    if (!user || !db) return;

    const classifiedItem = {
      ...item,
      type,
      monthKey: item.date.substring(0, 7).replace(/\//g, "-"),
      // 使用 serverTimestamp 確保排序正確
      createdAt: serverTimestamp(),
      userId: user.uid,
    };

    try {
      await addDoc(
        collection(db, "artifacts", appId, "users", user.uid, "expenses"),
        classifiedItem
      );
      setQueue((prev) => prev.filter((i) => i.id !== item.id));
    } catch (e) {
      console.error("Save error:", e);
      alert("儲存失敗，請檢查網路連線");
    }
  };

  const handleDelete = async (itemId) => {
    if (!user || !db) return;
    if (confirm("確定要刪除這筆紀錄嗎？")) {
      try {
        await deleteDoc(
          doc(db, "artifacts", appId, "users", user.uid, "expenses", itemId)
        );
      } catch (e) {
        console.error("Delete error:", e);
      }
    }
  };

  const copyToClipboard = (text) => {
    // 嘗試使用現代 API
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          alert("複製成功！趕快傳給他吧 ❤️");
          setShowAiModal(false);
        })
        .catch((err) => {
          console.error("Async: Could not copy text: ", err);
          fallbackCopyTextToClipboard(text);
        });
    } else {
      fallbackCopyTextToClipboard(text);
    }
  };

  const fallbackCopyTextToClipboard = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed"; // Avoid scrolling to bottom
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand("copy");
      if (successful) {
        alert("複製成功！趕快傳給他吧 ❤️");
        setShowAiModal(false);
      } else {
        alert("複製失敗，請手動複製");
      }
    } catch (err) {
      console.error("Fallback: Oops, unable to copy", err);
      alert("複製失敗，請手動複製");
    }
    document.body.removeChild(textArea);
  };

  // ... (保留 Gemini AI 和 解析邏輯，與之前相同，此處略過重複程式碼以節省篇幅，請直接使用之前提供的邏輯) ...
  // *注意：請將之前 index.html 中的 generateSettlementMessage, generateInsight, parseBillText, handleAddManual 函數
  // 完整複製到這裡。*

  // --- Gemini Features ---
  const generateSettlementMessage = async () => {
    setIsAiLoading(true);
    setShowAiModal(true);
    setAiMessage("");

    const halfShared = Math.round(summary.sharedTotal / 2);
    const prompt = `
          你是一位貼心的女友，要傳訊息給男友進行本月帳務結算。
          請根據以下數據寫一段繁體中文訊息，語氣要**可愛、撒嬌、友善**，不要像討債公司。
          可以加一些表情符號 (Emoji)。
          
          資料如下：
          - 月份：${summary.monthLabel}
          - 共同花費總金額：${summary.sharedTotal.toLocaleString()} 元 (所以一人分擔 ${halfShared.toLocaleString()} 元)
          - 我幫你代墊的個人花費：${summary.forHimTotal.toLocaleString()} 元
          - **男友總共需要轉給我**：${summary.bfOwes.toLocaleString()} 元

          結構建議：
          1. 開頭先撒嬌一下。
          2. 列出清晰的算式 (共同的一半 + 代墊 = 總額)。
          3. 最後給一個付款的 Call to Action (例如：再麻煩寶貝轉帳囉~)。
          `;

    const result = await callGemini(prompt);
    setAiMessage(result);
    setIsAiLoading(false);
  };

  const generateInsight = async () => {
    setIsInsightLoading(true);
    setAiInsight("");

    const topCategories = chartData
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
    const dataStr = topCategories
      .map((c) => `${c.name}: $${c.value}`)
      .join(", ");
    const total =
      chartView === "personal" ? summary.personalTotal : summary.sharedTotal;

    const prompt = `
          請根據這個月的消費數據，給出一句**幽默、毒舌但中肯**的短評 (50字以內)。
          對象：${chartView === "personal" ? "我個人" : "我們情侶倆"}
          月份：${selectedMonthKey}
          總花費：${total.toLocaleString()}
          前三大花費類別：${dataStr}

          請用繁體中文。如果是餐飲多，可以笑我們太會吃；如果是購物多，可以笑要剁手了。
          `;

    const result = await callGemini(prompt);
    setAiInsight(result);
    setIsInsightLoading(false);
  };

  // --- Parsing Logic ---
  const parseBillText = () => {
    const lines = rawInput.split("\n");
    let rawItems = [];
    const finalCardName = cardNameInput.trim() || "匯入帳單";

    lines.forEach((line, idx) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      let match = null;
      let date = "";
      let merchant = "";
      let amount = 0;
      let cardName = finalCardName;

      // 台灣信用卡/網銀常見格式
      const regexTypeA =
        /^(\d{2}\/\d{2})\s+\d{2}\/\d{2}\s+(.+?)\s+(-?[\d,]+)\s+\d{4}\s+TW\s+TWD$/;
      const regexTypeB =
        /^(\d{3}\/\d{2}\/\d{2})\s+(.*?)\s+(?:\d{3}\/\d{2}\/\d{2})\s+TWD\s+([-\d,]+)$/; // 民國年
      const regexTypeC =
        /^(\d{3}\/\d{2}\/\d{2})\s+\d{3}\/\d{2}\/\d{2}\s+(.+?)\s+([-\d,]+)\s+TW$/; // 民國年
      const regexCSV = /^([\d\/-]+)[,，](.+?)[,，]([-\d,]+).*$/;

      if ((match = trimmedLine.match(regexTypeA))) {
        date = `${currentYear}/${match[1]}`;
        merchant = match[2].trim();
        amount = parseFloat(match[3].replace(/,/g, ""));
      } else if ((match = trimmedLine.match(regexTypeB))) {
        const [y, m, d] = match[1].split("/");
        date = `${parseInt(y) + 1911}/${m}/${d}`; // 民國年轉西元年
        merchant = match[2].trim();
        amount = parseFloat(match[3].replace(/,/g, ""));
      } else if ((match = trimmedLine.match(regexTypeC))) {
        const [y, m, d] = match[1].split("/");
        date = `${parseInt(y) + 1911}/${m}/${d}`; // 民國年轉西元年
        merchant = match[2].trim();
        amount = parseFloat(match[3].replace(/,/g, ""));
      } else if ((match = trimmedLine.match(regexCSV))) {
        date = match[1].replace(/-/g, "/");
        merchant = match[2];
        amount = parseFloat(match[3].replace(/,/g, ""));
      }

      if (!isNaN(amount) && amount !== 0) {
        // 排除分期、年百分率等非實際消費項目
        if (
          !merchant.includes("本筆分期") &&
          !merchant.includes("總費用年百分率")
        ) {
          rawItems.push({
            id: Date.now() + idx + Math.random(),
            date,
            merchant,
            amount,
            card: cardName,
            category: classifyCategory(merchant),
          });
        }
      }
    });

    // Deduplication Logic (合併折抵)
    const mergedItems = [];
    const usedOffsetIds = new Set();
    const positiveItems = rawItems.filter((i) => i.amount > 0);
    const negativeItems = rawItems.filter((i) => i.amount < 0);

    positiveItems.forEach((item) => {
      let finalAmount = item.amount;
      let totalDeduction = 0;
      let matched = false;

      negativeItems.forEach((offset) => {
        if (usedOffsetIds.has(offset.id)) return;
        const isOffsetType =
          offset.merchant.includes("折抵") ||
          offset.merchant.includes("點數") ||
          offset.merchant.includes("回饋");
        if (!isOffsetType) return;

        // 簡易名稱比對
        const cleanItemName = item.merchant
          .replace(/連加\*/g, "")
          .replace(/\(.*\)/g, "")
          .trim();
        const cleanOffsetName = offset.merchant
          .replace(/點數折抵_?/g, "")
          .replace(/折抵/g, "")
          .replace(/連加\*/g, "")
          .trim();
        const isNameMatch =
          (cleanItemName.includes(cleanOffsetName) ||
            cleanOffsetName.includes(cleanItemName)) &&
          cleanOffsetName.length > 2;

        if (isNameMatch) {
          if (Math.abs(offset.amount) <= item.amount) {
            finalAmount += offset.amount; // offset amount is negative, so this subtracts
            totalDeduction += Math.abs(offset.amount);
            usedOffsetIds.add(offset.id);
            matched = true;
          }
        }
      });

      const note = matched
        ? ` (已扣除折抵 $${totalDeduction.toLocaleString()})`
        : "";
      if (finalAmount > 0) {
        mergedItems.push({
          ...item,
          amount: finalAmount,
          merchant: item.merchant + note,
          originalAmount: item.amount, // 保持原始金額，以供參考
        });
      }
    });

    // 加入未匹配的負項 (如果有的話)
    negativeItems.forEach((offset) => {
      if (!usedOffsetIds.has(offset.id)) {
        mergedItems.push(offset);
      }
    });

    if (mergedItems.length > 0) {
      setQueue((prev) => [...prev, ...mergedItems]);
      setRawInput("");
      setCardNameInput("");
      setShowImportModal(false);
    } else {
      alert("無法識別內容，或所有項目皆被折抵完畢。");
    }
  };

  const handleAddManual = async () => {
    if (
      !manualForm.merchant ||
      !manualForm.amount ||
      isNaN(parseFloat(manualForm.amount))
    ) {
      alert("請輸入有效的項目名稱和金額。");
      return;
    }
    const date = new Date().toISOString().split("T")[0].replace(/-/g, "/");
    const item = {
      id: Date.now(),
      date,
      merchant: manualForm.merchant,
      amount: parseFloat(manualForm.amount),
      category: classifyCategory(manualForm.merchant),
      card: "現金/手動",
    };
    await handleSwipe(item, manualForm.type);
    setShowManualModal(false);
    setManualForm({ merchant: "", amount: "", type: "shared" });
  };

  // --- Derived Data ---
  const monthlyHistory = useMemo(() => {
    return history.filter((item) => item.monthKey === selectedMonthKey);
  }, [history, selectedMonthKey]);

  const summary = useMemo(() => {
    let personalTotal = 0;
    let sharedTotal = 0;
    let forHimTotal = 0;
    monthlyHistory.forEach((item) => {
      if (item.type === "personal") personalTotal += item.amount;
      if (item.type === "shared") sharedTotal += item.amount;
      if (item.type === "for_him") forHimTotal += item.amount;
    });
    return {
      personalTotal,
      sharedTotal,
      forHimTotal,
      bfOwes: Math.round(sharedTotal / 2 + forHimTotal),
      myShare: Math.round(sharedTotal / 2 + personalTotal),
      monthLabel: selectedMonthKey,
    };
  }, [monthlyHistory, selectedMonthKey]);

  const chartData = useMemo(() => {
    const targetType = chartView === "personal" ? "personal" : "shared";
    const dataMap = {};
    monthlyHistory
      .filter((i) => i.type === targetType && i.amount > 0)
      .forEach((item) => {
        const cat = item.category || "其他";
        dataMap[cat] = (dataMap[cat] || 0) + item.amount;
      });
    return Object.keys(dataMap).map((key) => ({
      name: key,
      value: dataMap[key],
    }));
  }, [monthlyHistory, chartView]);

  // --- Components ---
  const MonthSelector = () => (
    <div className="flex items-center justify-center space-x-2 bg-white px-4 py-2 rounded-full shadow-sm mb-4 relative transform translate-y-0">
      <Calendar className="w-4 h-4 text-gray-500" />
      <select
        value={selectedMonthKey}
        onChange={(e) => {
          setSelectedMonthKey(e.target.value);
          setAiInsight("");
        }}
        className="bg-white text-sm font-bold text-gray-700 focus:outline-none"
      >
        {availableMonths.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );

  const TabButton = ({ id, icon: Icon, label }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex flex-col items-center justify-center w-full py-2 transition-colors ${
        activeTab === id ? "text-blue-500" : "text-gray-400"
      }`}
    >
      <Icon className="w-6 h-6" />
      <span className="text-[10px] mt-1 font-medium">{label}</span>
    </button>
  );

  if (!isAuthReady) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center bg-gray-50">
        <Loader className="w-8 h-8 animate-spin text-blue-500 mb-2" />
        <p className="text-gray-500 text-sm">正在初始化...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-[#F2F2F7] overflow-hidden font-sans text-slate-900 relative">
      {/* Navbar */}
      <div className="bg-white/80 backdrop-blur-md border-b border-gray-200 pt-10 pb-3 px-4 flex justify-between items-center z-20 sticky top-0">
        <h1 className="text-xl font-bold">
          {activeTab === "swipe" && "帳單分類"}
          {activeTab === "summary" && "結算明細"}
          {activeTab === "analysis" && "花費分析"}
        </h1>
        <div className="flex gap-3">
          {activeTab === "swipe" && (
            <>
              <button
                onClick={() => setShowImportModal(true)}
                className="text-blue-500 flex items-center gap-1"
              >
                <FileText className="w-5 h-5" />
                <span className="text-sm font-medium">匯入</span>
              </button>
              <button
                onClick={() => setShowManualModal(true)}
                className="text-blue-500"
              >
                <Plus className="w-6 h-6" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area - Render Logic Here */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden relative p-4 no-scrollbar">
        {/* SWIPE TAB */}
        {activeTab === "swipe" && (
          <div className="h-full flex flex-col items-center justify-center -mt-4">
            {queue.length > 0 ? (
              <div className="w-full max-w-xs relative h-[420px]">
                <div className="absolute top-4 left-4 w-full h-full bg-white rounded-3xl shadow-sm border border-gray-200 opacity-50 transform scale-95 translate-y-2"></div>

                <div className="absolute top-0 left-0 w-full h-full bg-white rounded-3xl shadow-xl border border-gray-100 flex flex-col items-center justify-between p-6 z-10 transition-all duration-300">
                  <div className="w-full flex justify-between items-center text-gray-400 text-sm font-medium uppercase tracking-wider">
                    <span>{queue[0].card}</span>
                    <span>{queue[0].date}</span>
                  </div>

                  <div className="flex-1 flex flex-col items-center justify-center text-center w-full">
                    <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4 text-3xl">
                      {queue[0].merchant.includes("Uber")
                        ? "🍔"
                        : queue[0].category === "交通"
                        ? "🚄"
                        : queue[0].category === "居家"
                        ? "🏠"
                        : "🧾"}
                    </div>
                    <h2 className="text-xl font-bold text-gray-800 mb-2 line-clamp-3 leading-tight break-words w-full px-2">
                      {queue[0].merchant}
                    </h2>
                    {queue[0].amount < 0 ? (
                      <span className="text-red-500 text-sm bg-red-50 px-3 py-1 rounded-full font-bold">
                        退款 / 負項
                      </span>
                    ) : (
                      <span className="text-blue-500 text-xs bg-blue-50 px-3 py-1 rounded-full font-bold">
                        {queue[0].category}
                      </span>
                    )}
                  </div>

                  <div className="mb-8">
                    <span
                      className={`text-4xl font-bold ${
                        queue[0].amount < 0
                          ? "text-green-600"
                          : "text-slate-900"
                      }`}
                    >
                      ${queue[0].amount.toLocaleString()}
                    </span>
                  </div>

                  <div className="w-full grid grid-cols-3 gap-3">
                    <button
                      onClick={() => handleSwipe(queue[0], "personal")}
                      className="flex flex-col items-center justify-center py-3 rounded-2xl bg-red-50 text-red-500 hover:bg-red-100 transition active:scale-95"
                    >
                      <User className="w-6 h-6 mb-1" />
                      <span className="text-xs font-bold">個人</span>
                    </button>
                    <button
                      onClick={() => handleSwipe(queue[0], "for_him")}
                      className="flex flex-col items-center justify-center py-3 rounded-2xl bg-purple-50 text-purple-600 hover:bg-purple-100 transition active:scale-95"
                    >
                      <ArrowLeftRight className="w-6 h-6 mb-1" />
                      <span className="text-xs font-bold">代墊</span>
                    </button>
                    <button
                      onClick={() => handleSwipe(queue[0], "shared")}
                      className="flex flex-col items-center justify-center py-3 rounded-2xl bg-green-50 text-green-500 hover:bg-green-100 transition active:scale-95"
                    >
                      <Users className="w-6 h-6 mb-1" />
                      <span className="text-xs font-bold">共同</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center p-10 bg-white rounded-3xl shadow-sm">
                <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600">
                  <Check className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">
                  全部分類完畢！
                </h3>
                <p className="text-gray-500">
                  您可以手動新增或從結算頁面查看詳細資料。
                </p>
              </div>
            )}
          </div>
        )}

        {/* SUMMARY TAB */}
        {activeTab === "summary" && (
          <div className="space-y-4 pb-20">
            <MonthSelector />

            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-3xl p-6 text-white shadow-lg shadow-blue-200 relative overflow-hidden">
              {/* Gemini AI Message Button */}
              <button
                onClick={generateSettlementMessage}
                className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 p-2 rounded-full transition backdrop-blur-sm"
                title="AI 產生請款訊息"
              >
                <Sparkles className="w-5 h-5 text-yellow-300" />
              </button>

              <div className="flex items-center justify-between mb-2">
                <span className="text-blue-100 font-medium text-sm">
                  男友應付總額
                </span>
                <Heart className="w-5 h-5 text-blue-200 fill-blue-200" />
              </div>
              <div className="text-4xl font-bold mb-6">
                ${summary.bfOwes.toLocaleString()}
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-white/20 pt-4">
                <div>
                  <span className="text-xs text-blue-100 block mb-1">
                    共同花費 (淨額)
                  </span>
                  <span className="text-lg font-semibold">
                    ${summary.sharedTotal.toLocaleString()}
                  </span>
                  <div className="text-[10px] text-blue-200 mt-0.5">
                    一人 ${Math.round(summary.sharedTotal / 2).toLocaleString()}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-blue-100 block mb-1">
                    妳幫他代墊
                  </span>
                  <span className="text-lg font-semibold">
                    ${summary.forHimTotal.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                <h3 className="font-bold text-gray-800">分類明細</h3>
                <span className="text-xs text-gray-400">
                  {monthlyHistory.length} 筆資料
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {monthlyHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center p-4 group"
                  >
                    <div className="flex items-center gap-3 overflow-hidden flex-1">
                      <div
                        className={`w-2 h-10 shrink-0 rounded-full ${
                          item.type === "personal"
                            ? "bg-red-400"
                            : item.type === "shared"
                            ? "bg-green-400"
                            : "bg-purple-400"
                        }`}
                      ></div>
                      <div className="min-w-0 flex-1">
                        <div
                          className="font-medium text-gray-900 truncate text-sm"
                          title={item.merchant}
                        >
                          {item.merchant}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {item.date} · {item.card}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div>
                        <div className="font-bold text-gray-900">
                          ${item.amount.toLocaleString()}
                        </div>
                        <div
                          className={`text-[10px] px-2 py-0.5 rounded-md inline-block mt-1 ${
                            item.type === "personal"
                              ? "bg-red-50 text-red-500"
                              : item.type === "shared"
                              ? "bg-green-50 text-green-500"
                              : "bg-purple-50 text-purple-500"
                          }`}
                        >
                          {item.type === "personal"
                            ? "個人"
                            : item.type === "shared"
                            ? "共同"
                            : "代墊"}
                        </div>
                      </div>
                      <button
                        // 修正：使用自定義 modal 替換 confirm()，但為保持單檔案簡單性，使用 window.confirm
                        onClick={() => handleDelete(item.id)}
                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {monthlyHistory.length === 0 && (
                  <div className="p-8 text-center text-gray-400 text-sm">
                    此月份尚無資料
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ANALYSIS TAB */}
        {activeTab === "analysis" && (
          <div className="space-y-4 pb-20">
            <MonthSelector />

            <div className="w-full bg-white p-1 rounded-xl flex shadow-sm">
              <button
                className={`flex-1 text-center py-2 text-sm font-medium rounded-lg transition ${
                  chartView === "personal"
                    ? "bg-blue-500 text-white"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
                onClick={() => setChartView("personal")}
              >
                個人花費
              </button>
              <button
                className={`flex-1 text-center py-2 text-sm font-medium rounded-lg transition ${
                  chartView === "shared"
                    ? "bg-green-500 text-white"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
                onClick={() => setChartView("shared")}
              >
                共同花費
              </button>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm relative">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-gray-800 text-center flex-1">
                  {chartView === "personal" ? "個人" : "共同"}花費類別 (
                  {selectedMonthKey})
                </h3>
                {/* AI Insight Button */}
                {chartData.length > 0 && (
                  <button
                    onClick={generateInsight}
                    disabled={isInsightLoading}
                    className="absolute right-4 top-4 text-purple-600 hover:bg-purple-50 p-2 rounded-full transition"
                    title="AI 消費分析"
                  >
                    {isInsightLoading ? (
                      <Loader className="w-5 h-5 animate-spin" />
                    ) : (
                      <Wand2 className="w-5 h-5" />
                    )}
                  </button>
                )}
              </div>

              {/* AI Insight Result */}
              {aiInsight && (
                <div className="mb-6 bg-purple-50 p-3 rounded-xl text-sm text-purple-800 border border-purple-100 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>{aiInsight}</p>
                  </div>
                </div>
              )}

              <div className="h-[250px] w-full">
                {/* 僅在 Recharts 模組和資料都準備好時才渲染圖表 */}
                {isRechartsReady && chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {chartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => `$${value.toLocaleString()}`}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">
                    {isRechartsReady ? "無數據" : "圖表組件載入中..."}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Nav */}
      <div className="bg-white/90 backdrop-blur-lg border-t border-gray-200 pb-safe pt-1 px-2 flex justify-around items-center z-20 shrink-0">
        <TabButton id="swipe" icon={CreditCard} label="分類" />
        <TabButton id="summary" icon={Wallet} label="結算" />
        <TabButton id="analysis" icon={PieIcon} label="分析" />
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:w-10/12 max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[90%]">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h3 className="font-bold text-lg">匯入帳單明細</h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="p-1 bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 shrink-0">
              <label className="text-xs font-bold text-gray-500 ml-1">
                卡片名稱
              </label>
              <input
                type="text"
                className="w-full mt-1 p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="例如：台新狗狗卡"
                value={cardNameInput}
                onChange={(e) => setCardNameInput(e.target.value)}
              />
            </div>

            <p className="text-sm text-gray-500 mb-3 shrink-0">
              請貼上網銀明細。智慧系統會自動合併「折抵」項目，僅顯示淨額。
            </p>
            <textarea
              className="w-full flex-1 min-h-[150px] p-3 bg-gray-50 rounded-xl border-none text-xs focus:ring-2 focus:ring-blue-500 font-mono"
              placeholder={`請貼上明細文字...`}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
            />
            <button
              onClick={parseBillText}
              className="w-full mt-4 bg-blue-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition shrink-0"
            >
              智慧解析匯入
            </button>
          </div>
        </div>
      )}

      {/* AI Message Modal */}
      {showAiModal && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:w-10/12 max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-500" />
                <h3 className="font-bold text-lg">AI 撒嬌請款單</h3>
              </div>
              <button
                onClick={() => setShowAiModal(false)}
                className="p-1 bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-yellow-50 p-4 rounded-xl text-sm text-gray-800 leading-relaxed mb-4 min-h-[100px] whitespace-pre-wrap font-medium">
              {isAiLoading ? (
                <div className="flex flex-col items-center justify-center h-24 text-gray-400 gap-2">
                  <Loader className="w-6 h-6 animate-spin text-yellow-500" />
                  <span>正在醞釀可愛語氣...</span>
                </div>
              ) : (
                aiMessage
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={generateSettlementMessage}
                disabled={isAiLoading}
                className="flex-1 py-3 rounded-xl font-bold text-sm bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
              >
                換個語氣
              </button>
              <button
                onClick={() => copyToClipboard(aiMessage)}
                disabled={isAiLoading || !aiMessage}
                className="flex-1 py-3 rounded-xl font-bold text-sm bg-black text-white hover:bg-gray-800 transition flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4" />
                複製訊息
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Modal */}
      {showManualModal && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:w-10/12 max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-lg">新增手動花費</h3>
              <button
                onClick={() => setShowManualModal(false)}
                className="p-1 bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 ml-1">
                  項目名稱
                </label>
                <input
                  type="text"
                  className="w-full mt-1 p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如：路邊攤晚餐"
                  value={manualForm.merchant}
                  onChange={(e) =>
                    setManualForm({
                      ...manualForm,
                      merchant: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 ml-1">
                  金額
                </label>
                <input
                  type="number"
                  className="w-full mt-1 p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500 text-lg font-bold"
                  placeholder="0"
                  value={manualForm.amount}
                  onChange={(e) =>
                    setManualForm({
                      ...manualForm,
                      amount: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 ml-1">
                  分類
                </label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <button
                    onClick={() =>
                      setManualForm({ ...manualForm, type: "personal" })
                    }
                    className={`py-2 rounded-lg text-xs font-bold border transition ${
                      manualForm.type === "personal"
                        ? "bg-red-50 border-red-200 text-red-600"
                        : "border-gray-100 text-gray-400"
                    }`}
                  >
                    個人
                  </button>
                  <button
                    onClick={() =>
                      setManualForm({ ...manualForm, type: "shared" })
                    }
                    className={`py-2 rounded-lg text-xs font-bold border transition ${
                      manualForm.type === "shared"
                        ? "bg-green-50 border-green-200 text-green-600"
                        : "border-gray-100 text-gray-400"
                    }`}
                  >
                    共同
                  </button>
                  <button
                    onClick={() =>
                      setManualForm({ ...manualForm, type: "for_him" })
                    }
                    className={`py-2 rounded-lg text-xs font-bold border transition ${
                      manualForm.type === "for_him"
                        ? "bg-purple-50 border-purple-200 text-purple-600"
                        : "border-gray-100 text-gray-400"
                    }`}
                  >
                    代墊
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleAddManual}
              className="w-full mt-8 bg-black text-white py-3 rounded-xl font-bold text-sm hover:bg-gray-800 transition shadow-lg"
            >
              加入帳單
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
