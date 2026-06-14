// State Management
let appState = {
  currentMode: 'student', // 'student' or 'teacher'
  workshopTitle: 'AI 與深度學習研習課程地圖',
  sheetUrl: 'https://docs.google.com/spreadsheets/d/18u82OZMeHzkY9W4lYUP2GtJADe2PlwcgQfAF4x2QAQs/edit?usp=sharing',
  rawCSV: '',
  supplementaryInfo: '課前準備事項：\n1. 請於課前安裝好 Python 3.10+ 及 VS Code 編輯器。\n2. 研習將會使用 Google Colab，請確保有可用的 Google 帳號。\n\n聯絡資訊：\n如有任何問題，請來信：teacher@example.edu.tw',
  parsedItems: [], // Flat list of parsed objects from CSV
  selectedItem: null, // Currently active leaf node item
  checkedRanks: new Set(), // Set of rank values that are checked
  isLocked: false, // True if standalone student link is loaded via query params
  sheetTabs: [], // List of detected Google Sheet tabs: { name, gid }
  activeGid: '0' // Active worksheet gid
};

const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/18u82OZMeHzkY9W4lYUP2GtJADe2PlwcgQfAF4x2QAQs/edit?usp=sharing';
const TARGET_SHEET_TAB_NAME = 'now';
const SUPPLEMENTARY_SHEET_TAB_NAME = 'help';
const SHEET_AUTO_REFRESH_INTERVAL_MS = 30000;
const HAND_RAISE_STORAGE_KEY = 'learningmap-hand-raises';
const HAND_RAISE_SOUND_DATA_KEY = 'learningmap-hand-raise-sound-data';
const HAND_RAISE_SOUND_NAME_KEY = 'learningmap-hand-raise-sound-name';
const HAND_RAISE_RECENT_WINDOW_MS = 5 * 60 * 1000;
const HAND_RAISE_PRESETS = [
  { type: 'stuck', label: '我卡住了', message: '我卡住了，想請老師協助說明。' },
  { type: 'repeat', label: '請再講一次', message: '這段我沒有跟上，請老師再講一次。' },
  { type: 'question', label: '我想提問', message: '我有一個問題想請教老師。' },
  { type: 'too_fast', label: '進度太快', message: '目前進度有點快，可以稍微放慢嗎？' },
  { type: 'too_slow', label: '進度太慢', message: '目前進度我已經跟上，可以加快一些。' },
];

let sheetAutoRefreshTimer = null;
let isSheetAutoRefreshInFlight = false;
let isSheetAutoRefreshEnabled = false;
let handRaiseStorePromise = null;
let handRaiseStoreRef = null;
let handRaiseUnsubscribe = () => {};
let activeHandRaiseSessionId = '';
let handRaiseEntries = [];
let teacherHandRaiseRecentOnly = false;
let teacherHandRaiseSoundEnabled = true;
let handRaiseHasHydrated = false;
let handRaiseKnownEntryIds = new Set();
let handRaiseAudioContext = null;
let handRaiseAudioUnlocked = false;
let teacherHandRaiseSoundDataUrl = '';
let teacherHandRaiseSoundName = '';
let teacherHandRaiseSoundAudio = null;

function updateTeacherHandRaiseSoundStatus(message) {
  const statusEl = document.getElementById('teacher-hand-raise-sound-status');
  if (statusEl) {
    statusEl.innerText = message;
  }
}

function updateTeacherHandRaiseSoundFileLabel() {
  const fileNameEl = document.getElementById('teacher-hand-raise-sound-file-name');
  if (fileNameEl) {
    fileNameEl.innerText = teacherHandRaiseSoundName
      ? `目前使用: ${teacherHandRaiseSoundName}`
      : '目前使用預設提示音';
  }
}

function loadTeacherHandRaiseSoundPreference() {
  try {
    teacherHandRaiseSoundDataUrl = localStorage.getItem(HAND_RAISE_SOUND_DATA_KEY) || '';
    teacherHandRaiseSoundName = localStorage.getItem(HAND_RAISE_SOUND_NAME_KEY) || '';
  } catch (error) {
    console.warn('Unable to load teacher hand raise sound preference:', error.message);
    teacherHandRaiseSoundDataUrl = '';
    teacherHandRaiseSoundName = '';
  }
  updateTeacherHandRaiseSoundFileLabel();
}

function saveTeacherHandRaiseSoundPreference(dataUrl, fileName) {
  teacherHandRaiseSoundDataUrl = dataUrl || '';
  teacherHandRaiseSoundName = fileName || '';

  try {
    if (teacherHandRaiseSoundDataUrl) {
      localStorage.setItem(HAND_RAISE_SOUND_DATA_KEY, teacherHandRaiseSoundDataUrl);
      localStorage.setItem(HAND_RAISE_SOUND_NAME_KEY, teacherHandRaiseSoundName);
    } else {
      localStorage.removeItem(HAND_RAISE_SOUND_DATA_KEY);
      localStorage.removeItem(HAND_RAISE_SOUND_NAME_KEY);
    }
  } catch (error) {
    console.warn('Unable to save teacher hand raise sound preference:', error.message);
  }

  teacherHandRaiseSoundAudio = null;
  updateTeacherHandRaiseSoundFileLabel();
}

function isGoogleSheetUrl(url) {
  return typeof url === 'string' && /docs\.google\.com\/spreadsheets\/d\//.test(url);
}

function bootstrapHandRaiseUI() {
  const clearBtn = document.getElementById('btn-clear-hand-raises');
  const recentOnlyInput = document.getElementById('teacher-hand-raise-recent-only');
  const soundEnabledInput = document.getElementById('teacher-hand-raise-sound-enabled');
  const testSoundBtn = document.getElementById('btn-test-hand-raise-sound');
  const soundFileInput = document.getElementById('input-hand-raise-sound-file');
  const clearSoundFileBtn = document.getElementById('btn-clear-hand-raise-sound-file');

  loadTeacherHandRaiseSoundPreference();

  if (recentOnlyInput) {
    recentOnlyInput.checked = teacherHandRaiseRecentOnly;
    recentOnlyInput.addEventListener('change', () => {
      teacherHandRaiseRecentOnly = recentOnlyInput.checked;
      renderTeacherHandRaisePanel();
    });
  }

  if (soundEnabledInput) {
    soundEnabledInput.checked = teacherHandRaiseSoundEnabled;
    soundEnabledInput.addEventListener('change', async () => {
      teacherHandRaiseSoundEnabled = soundEnabledInput.checked;
      if (teacherHandRaiseSoundEnabled) {
        await unlockTeacherHandRaiseAudio();
        updateTeacherHandRaiseSoundStatus('音效提醒已開啟');
      } else {
        updateTeacherHandRaiseSoundStatus('音效提醒已關閉');
      }
    });
  }

  if (testSoundBtn) {
    testSoundBtn.addEventListener('click', async () => {
      testSoundBtn.disabled = true;
      try {
        await unlockTeacherHandRaiseAudio();
        const played = playTeacherHandRaiseSound();
        updateTeacherHandRaiseSoundStatus(played ? '已播放測試音效' : '瀏覽器尚未允許播放音效');
      } catch (error) {
        console.error(error);
        updateTeacherHandRaiseSoundStatus(`音效測試失敗: ${error.message}`);
      } finally {
        testSoundBtn.disabled = false;
      }
    });
  }

  if (soundFileInput) {
    soundFileInput.addEventListener('change', async () => {
      const [file] = Array.from(soundFileInput.files || []);
      if (!file) return;

      try {
        const dataUrl = await readFileAsDataUrl(file);
        saveTeacherHandRaiseSoundPreference(dataUrl, file.name);
        await unlockTeacherHandRaiseAudio();
        updateTeacherHandRaiseSoundStatus(`已載入自訂音效: ${file.name}`);
      } catch (error) {
        console.error(error);
        updateTeacherHandRaiseSoundStatus(`載入音效失敗: ${error.message}`);
      } finally {
        soundFileInput.value = '';
      }
    });
  }

  if (clearSoundFileBtn) {
    clearSoundFileBtn.addEventListener('click', () => {
      saveTeacherHandRaiseSoundPreference('', '');
      updateTeacherHandRaiseSoundStatus('已清除自訂音效，改用預設提示音');
    });
  }

  primeHandRaiseAudioUnlock();

  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (!handRaiseStoreRef || !activeHandRaiseSessionId) return;
      clearBtn.disabled = true;
      try {
        await handRaiseStoreRef.clear(activeHandRaiseSessionId);
      } catch (error) {
        console.error(error);
        alert(`清除提問失敗: ${error.message}`);
      } finally {
        clearBtn.disabled = false;
      }
    });
  }

  const handleStatusAction = async (event) => {
    const actionBtn = event.target.closest('[data-hand-raise-action]');
    if (!actionBtn || !handRaiseStoreRef || !activeHandRaiseSessionId) return;

    const { handRaiseAction, handRaiseId } = actionBtn.dataset;
    if (!handRaiseId || (handRaiseAction !== 'pending' && handRaiseAction !== 'resolved')) return;

    actionBtn.disabled = true;
    try {
      await handRaiseStoreRef.updateStatus(activeHandRaiseSessionId, handRaiseId, handRaiseAction);
    } catch (error) {
      console.error(error);
      alert(`????????: ${error.message}`);
    } finally {
      actionBtn.disabled = false;
    }
  };

  const listEl = document.getElementById('teacher-hand-raise-list');
  if (listEl) {
    listEl.addEventListener('click', handleStatusAction);
  }

  const detailContainer = document.getElementById('detail-container');
  if (detailContainer) {
    detailContainer.addEventListener('click', handleStatusAction);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('讀取本機音檔失敗'));
    reader.readAsDataURL(file);
  });
}

async function unlockTeacherHandRaiseAudio() {
  handRaiseAudioUnlocked = true;
  if (!(typeof window.AudioContext === 'function' || typeof window.webkitAudioContext === 'function')) {
    updateTeacherHandRaiseSoundStatus('此瀏覽器不支援音效提醒');
    return false;
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  handRaiseAudioContext = handRaiseAudioContext || new AudioContextCtor();
  if (handRaiseAudioContext.state === 'suspended') {
    await handRaiseAudioContext.resume();
  }
  updateTeacherHandRaiseSoundStatus('音效已就緒');
  return handRaiseAudioContext.state === 'running';
}

function primeHandRaiseAudioUnlock() {
  const unlock = async () => {
    try {
      if (handRaiseAudioUnlocked && handRaiseAudioContext?.state === 'running') return;
      await unlockTeacherHandRaiseAudio();
    } catch (error) {
      console.warn('Unable to unlock hand raise audio:', error.message);
    }
  };

  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('keydown', unlock);
}

function playTeacherHandRaiseSound() {
  if (!teacherHandRaiseSoundEnabled || appState.currentMode !== 'teacher') return;
  if (!handRaiseAudioUnlocked) return;

  try {
    if (teacherHandRaiseSoundDataUrl) {
      teacherHandRaiseSoundAudio = teacherHandRaiseSoundAudio || new Audio(teacherHandRaiseSoundDataUrl);
      teacherHandRaiseSoundAudio.currentTime = 0;
      teacherHandRaiseSoundAudio.play().catch((error) => {
        console.warn('Unable to play custom hand raise audio:', error.message);
      });
      updateTeacherHandRaiseSoundStatus(teacherHandRaiseSoundName
        ? `已播放自訂音效: ${teacherHandRaiseSoundName}`
        : '已播放自訂音效');
      return true;
    }

    if (!handRaiseAudioContext) {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return;
      handRaiseAudioContext = new AudioContextCtor();
    }

    const now = handRaiseAudioContext.currentTime;
    const oscillator = handRaiseAudioContext.createOscillator();
    const gainNode = handRaiseAudioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.18);
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    oscillator.connect(gainNode);
    gainNode.connect(handRaiseAudioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.24);
    updateTeacherHandRaiseSoundStatus('新提問音效已播放');
    return true;
  } catch (error) {
    console.warn('Unable to play hand raise audio:', error.message);
    updateTeacherHandRaiseSoundStatus('音效播放失敗，請先按「測試音效」');
  }

  return false;
}

function syncTeacherHandRaiseAlerts(entries) {
  const nextIds = new Set(entries.map((entry) => entry.id).filter(Boolean));

  if (!handRaiseHasHydrated) {
    handRaiseKnownEntryIds = nextIds;
    handRaiseHasHydrated = true;
    return;
  }

  const hasNewEntry = entries.some((entry) => entry.id && !handRaiseKnownEntryIds.has(entry.id));
  handRaiseKnownEntryIds = nextIds;

  if (hasNewEntry) {
    playTeacherHandRaiseSound();
  }
}

function hashString(value) {
  let hash = 0;
  const input = String(value || '');
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getHandRaiseSessionId() {
  if (!isGoogleSheetUrl(appState.sheetUrl)) return '';
  return `sheet-${hashString(appState.sheetUrl)}`;
}

// Initialize Application
window.addEventListener('DOMContentLoaded', () => {
  // Load data from LocalStorage if available
  loadStateFromLocalStorage();

  // Bind inputs to state
  initDOMBindings();

  // Check query string parameters for student link quick setup
  const isLocked = checkURLParameters();

  if (!isLocked) {
    // Prefer live Google Sheet data whenever a valid sheet URL exists.
    if (isGoogleSheetUrl(appState.sheetUrl)) {
      if (appState.rawCSV) {
        parseAndRender(appState.rawCSV);
        renderSheetTabsUI();
      }
      fetchSheetData(appState.sheetUrl);
    } else if (appState.rawCSV) {
      parseAndRender(appState.rawCSV);
      renderSheetTabsUI();
    } else {
      loadSampleCSV();
    }
  }

  // Update header print date
  document.getElementById('print-current-date').innerText = `產出日期: ${new Date().toLocaleDateString('zh-TW')}`;

  // Handle click outside to close dropdown menu
  document.addEventListener('click', (e) => {
    const wrapper = document.querySelector('.pdf-dropdown-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      document.getElementById('pdf-dropdown-menu').classList.add('hidden');
    }
  });

  window.addEventListener('focus', () => {
    refreshSheetDataIfNeeded();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshSheetDataIfNeeded();
    }
  });

  bootstrapHandRaiseUI();
});

async function getHandRaiseStore() {
  if (handRaiseStorePromise) return handRaiseStorePromise;

  handRaiseStorePromise = createHandRaiseStore().catch((error) => {
    console.warn('Falling back to local hand raise store:', error.message);
    return createLocalHandRaiseStore();
  });

  return handRaiseStorePromise;
}

async function createHandRaiseStore() {
  const { firebaseConfig } = await import('../vote/firebase-config.js');
  if (!firebaseConfig?.apiKey || !firebaseConfig?.projectId) {
    throw new Error('Firebase config missing');
  }

  const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js');
  const {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    getFirestore,
    onSnapshot,
    serverTimestamp,
    setDoc,
    updateDoc,
  } = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js');

  const firebaseApp = getApps().find((app) => app.name === 'learningmap-handraise')
    || initializeApp(firebaseConfig, 'learningmap-handraise');
  const db = getFirestore(firebaseApp);

  async function ensureSessionDoc(sessionId) {
    await setDoc(doc(db, 'sessions', sessionId), {
      title: appState.workshopTitle || '學習地圖',
      kind: 'learningmap',
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  return {
    subscribe(sessionId, callback) {
      ensureSessionDoc(sessionId).catch((error) => {
        console.error('Unable to ensure learningmap session doc:', error);
      });
      const ref = collection(db, 'sessions', sessionId, 'hand_raises');
      return onSnapshot(ref, (snapshot) => {
        const entries = snapshot.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            ...data,
            createdAtMs: data.createdAt?.toMillis ? data.createdAt.toMillis() : 0,
          };
        }).sort((a, b) => b.createdAtMs - a.createdAtMs);
        callback(entries);
      }, (error) => {
        console.error('Learningmap hand raise subscription failed:', error);
      });
    },
    async submit(sessionId, payload) {
      await ensureSessionDoc(sessionId);
      const ref = collection(db, 'sessions', sessionId, 'hand_raises');
      await addDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
      });
    },
    async updateStatus(sessionId, entryId, status) {
      await ensureSessionDoc(sessionId);
      const ref = doc(db, 'sessions', sessionId, 'hand_raises', entryId);
      await updateDoc(ref, { status });
    },
    async clear(sessionId) {
      await ensureSessionDoc(sessionId);
      const ref = collection(db, 'sessions', sessionId, 'hand_raises');
      const snapshot = await getDocs(ref);
      await Promise.all(snapshot.docs.map((item) => deleteDoc(doc(db, 'sessions', sessionId, 'hand_raises', item.id))));
    },
  };
}

function createLocalHandRaiseStore() {
  const listeners = new Set();

  function readStore() {
    try {
      return JSON.parse(localStorage.getItem(HAND_RAISE_STORAGE_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function writeStore(data) {
    localStorage.setItem(HAND_RAISE_STORAGE_KEY, JSON.stringify(data));
  }

  function emit(sessionId) {
    const data = readStore();
    const entries = [...(data[sessionId] || [])].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    listeners.forEach((listener) => listener(sessionId, entries));
  }

  window.addEventListener('storage', () => {
    listeners.forEach((listener) => listener(null, null));
  });

  return {
    subscribe(sessionId, callback) {
      const listener = (changedSessionId, entries) => {
        if (changedSessionId && changedSessionId !== sessionId) return;
        if (entries) {
          callback(entries);
          return;
        }
        const data = readStore();
        callback([...(data[sessionId] || [])].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)));
      };

      listeners.add(listener);
      listener(sessionId, null);
      return () => listeners.delete(listener);
    },
    async submit(sessionId, payload) {
      const data = readStore();
      const current = data[sessionId] || [];
      current.push({
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...payload,
        createdAtMs: Date.now(),
      });
      data[sessionId] = current;
      writeStore(data);
      emit(sessionId);
    },
    async updateStatus(sessionId, entryId, status) {
      const data = readStore();
      const current = data[sessionId] || [];
      data[sessionId] = current.map((entry) => (
        entry.id === entryId ? { ...entry, status } : entry
      ));
      writeStore(data);
      emit(sessionId);
    },
    async clear(sessionId) {
      const data = readStore();
      data[sessionId] = [];
      writeStore(data);
      emit(sessionId);
    },
  };
}

// Load state from local storage
function loadStateFromLocalStorage() {
  const savedTitle = localStorage.getItem('roadmap_workshopTitle');
  if (savedTitle) appState.workshopTitle = savedTitle;

  const savedUrl = localStorage.getItem('roadmap_sheetUrl');
  if (savedUrl) appState.sheetUrl = savedUrl;

  const savedCSV = localStorage.getItem('roadmap_rawCSV');
  if (savedCSV) appState.rawCSV = savedCSV;

  const savedSupp = localStorage.getItem('roadmap_supplementaryInfo');
  if (savedSupp !== null) appState.supplementaryInfo = savedSupp;

  const savedGid = localStorage.getItem('roadmap_activeGid');
  if (savedGid) appState.activeGid = savedGid;

  const savedTabs = localStorage.getItem('roadmap_sheetTabs');
  if (savedTabs) {
    try {
      appState.sheetTabs = JSON.parse(savedTabs);
    } catch(e) {
      appState.sheetTabs = [];
    }
  }
}

// Save state to local storage
function saveStateToLocalStorage() {
  if (appState.isLocked) return; // Do not overwrite teacher's state when viewing locked student link
  
  localStorage.setItem('roadmap_workshopTitle', appState.workshopTitle);
  localStorage.setItem('roadmap_sheetUrl', appState.sheetUrl);
  localStorage.setItem('roadmap_rawCSV', appState.rawCSV);
  localStorage.setItem('roadmap_supplementaryInfo', appState.supplementaryInfo);
  localStorage.setItem('roadmap_activeGid', appState.activeGid);
  localStorage.setItem('roadmap_sheetTabs', JSON.stringify(appState.sheetTabs));
}

// Bind DOM Input fields
function initDOMBindings() {
  const titleInput = document.getElementById('input-title');
  const sheetInput = document.getElementById('input-sheet-url');
  const suppInput = document.getElementById('input-supplement');
  const csvRawInput = document.getElementById('input-csv-raw');

  // Set initial UI values
  titleInput.value = appState.workshopTitle;
  sheetInput.value = appState.sheetUrl;
  suppInput.value = appState.supplementaryInfo;
  if (csvRawInput) csvRawInput.value = appState.rawCSV;

  const sheetGroup = sheetInput?.closest('.form-group');
  if (sheetGroup) {
    sheetGroup.style.display = 'none';
  }

  const shareGroup = document.getElementById('input-share-url')?.closest('.form-group');
  if (shareGroup) {
    shareGroup.style.display = 'none';
  }

  // Header Title
  const headerTitle = document.getElementById('header-workshop-title');
  if (headerTitle) headerTitle.innerText = appState.workshopTitle;
  document.getElementById('tree-root-title').innerText = appState.workshopTitle;

  // Initial share link generator
  updateShareLinkInput();

  // Sync Input Elements back to state dynamically
  titleInput.addEventListener('input', (e) => {
    appState.workshopTitle = e.target.value;
    const headerTitleEl = document.getElementById('header-workshop-title');
    if (headerTitleEl) headerTitleEl.innerText = appState.workshopTitle;
    document.getElementById('tree-root-title').innerText = appState.workshopTitle;
    document.getElementById('print-workshop-title').innerText = appState.workshopTitle;
    saveStateToLocalStorage();
    updateShareLinkInput();
  });

  sheetInput.addEventListener('input', (e) => {
    appState.sheetUrl = e.target.value;
    saveStateToLocalStorage();
    updateShareLinkInput();
  });

  suppInput.addEventListener('input', (e) => {
    appState.supplementaryInfo = e.target.value;
    updateSupplementaryDisplay();
    saveStateToLocalStorage();
    updateShareLinkInput();
  });
}

// Check URL search parameters (e.g. ?view=student&title=...)
// Returns true if standalone student mode is activated via URL parameters
function checkURLParameters() {
  const urlParams = new URLSearchParams(window.location.search);
  
  // 1. Locked student view sharing link detection
  const viewParam = urlParams.get('view');
  if (viewParam === 'student') {
    appState.isLocked = true;
    appState.currentMode = 'student';
    switchMode('student');
    document.body.classList.add('lock-student'); // Hides mode toggle switcher in top right

    // Read other sharing parameters from URL
    const titleParam = urlParams.get('title');
    if (titleParam) {
      appState.workshopTitle = titleParam;
      document.getElementById('tree-root-title').innerText = titleParam;
    }

    const suppParam = urlParams.get('supp');
    if (suppParam && !urlParams.get('sheet')) {
      appState.supplementaryInfo = suppParam;
      updateSupplementaryDisplay();
    }

    const sheetParam = urlParams.get('sheet');
    if (sheetParam) {
      appState.sheetUrl = sheetParam;
      fetchSheetData(sheetParam);
    } else {
      if (isGoogleSheetUrl(appState.sheetUrl)) {
        fetchSheetData(appState.sheetUrl);
      } else if (isGoogleSheetUrl(DEFAULT_SHEET_URL)) {
        appState.sheetUrl = DEFAULT_SHEET_URL;
        fetchSheetData(DEFAULT_SHEET_URL);
      } else {
        stopSheetAutoRefresh();
        showUnboundStudentState('此學生頁尚未綁定 Google Sheet，請改用教師頁產生含 sheet 參數的分享連結。');
      }
    }
    return true;
  }

  if (viewParam === 'teacher') {
    appState.isLocked = false;
    appState.currentMode = 'teacher';
    switchMode('teacher');
    return false;
  }

  // 2. Legacy backend testing parameters
  const modeParam = urlParams.get('mode');
  if (modeParam === 'student' || modeParam === 'teacher') {
    appState.currentMode = modeParam;
    switchMode(modeParam);
  }
  return false;
}

// Switch Mode (Teacher vs Student View)
function switchMode(mode) {
  appState.currentMode = mode;
  document.body.className = `mode-${mode}`;

  // If locked student mode, force the body class to contain it
  if (appState.isLocked) {
    document.body.classList.add('lock-student');
  }

  // Update Toggle buttons active class
  document.getElementById('btn-mode-student').classList.toggle('active', mode === 'student');
  document.getElementById('btn-mode-teacher').classList.toggle('active', mode === 'teacher');
  
  // Scroll details back to top
  document.getElementById('panel-detail').scrollTop = 0;
  
  // Close dropdown if open
  document.getElementById('pdf-dropdown-menu').classList.add('hidden');
  renderTeacherHandRaisePanel();
}

// Convert Google Sheet edit URL to raw CSV export URL
function getGoogleSheetCsvUrl(url, gid = null) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    let csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
    
    // Determine active gid
    let targetGid = gid;
    if (!targetGid) {
      const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
      if (gidMatch && gidMatch[1]) {
        targetGid = gidMatch[1];
      }
    }
    
    if (targetGid) {
      csvUrl += `&gid=${targetGid}`;
    } else {
      csvUrl += `&gid=0`; // default to first tab
    }
    return csvUrl;
  }
  return null;
}

function findSheetTabByName(tabs, targetName) {
  const normalizedName = String(targetName || '').trim().toLowerCase();
  return (tabs || []).find((tab) => tab.name && tab.name.trim().toLowerCase() === normalizedName);
}

function findTargetSheetTab(tabs) {
  return findSheetTabByName(tabs, TARGET_SHEET_TAB_NAME);
}

function findSupplementarySheetTab(tabs) {
  return findSheetTabByName(tabs, SUPPLEMENTARY_SHEET_TAB_NAME);
}

function stopSheetAutoRefresh() {
  isSheetAutoRefreshEnabled = false;
  if (sheetAutoRefreshTimer) {
    clearInterval(sheetAutoRefreshTimer);
    sheetAutoRefreshTimer = null;
  }
}

function clearHandRaiseSubscription() {
  handRaiseUnsubscribe();
  handRaiseUnsubscribe = () => {};
  activeHandRaiseSessionId = '';
  handRaiseEntries = [];
  handRaiseHasHydrated = false;
  handRaiseKnownEntryIds = new Set();
  renderTeacherHandRaisePanel();
}

function startSheetAutoRefresh() {
  isSheetAutoRefreshEnabled = true;
  stopSheetAutoRefresh();
  isSheetAutoRefreshEnabled = true;
  sheetAutoRefreshTimer = setInterval(() => {
    refreshSheetDataIfNeeded();
  }, SHEET_AUTO_REFRESH_INTERVAL_MS);
}

function applySheetCsv(csvText) {
  appState.rawCSV = csvText;
  const csvRawInput = document.getElementById('input-csv-raw');
  if (csvRawInput) csvRawInput.value = csvText;

  saveStateToLocalStorage();
  parseAndRender(csvText);
  updateShareLinkInput();
}

function applySupplementaryInfo(infoText) {
  appState.supplementaryInfo = infoText || '';
  const suppInput = document.getElementById('input-supplement');
  if (suppInput) suppInput.value = appState.supplementaryInfo;
  updateSupplementaryDisplay();
  saveStateToLocalStorage();
  updateShareLinkInput();
}

function parseSupplementaryCsv(text) {
  const rows = [];
  let row = [''];
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      row.push('');
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') i++;
      if (row.some((cell) => cell.trim() !== '')) {
        rows.push(row.map((cell) => cell.trim()));
      }
      row = [''];
    } else {
      row[row.length - 1] += char;
    }
  }

  if (row.some((cell) => cell.trim() !== '')) {
    rows.push(row.map((cell) => cell.trim()));
  }

  if (rows.length === 0) return '';

  const firstRow = rows[0];
  const normalizedHeader = firstRow.map((cell) => cell.toLowerCase());
  const contentColumnIndex = normalizedHeader.findIndex((cell) => (
    cell === 'content' ||
    cell === 'text' ||
    cell === 'description' ||
    cell === 'supplement' ||
    cell === 'help' ||
    cell === '補充說明' ||
    cell === '說明'
  ));

  if (contentColumnIndex >= 0 && rows.length > 1) {
    return rows
      .slice(1)
      .map((cells) => cells[contentColumnIndex] || '')
      .filter((cell) => cell.trim() !== '')
      .join('\n');
  }

  if (rows.length > 1 && firstRow.length === 1 && normalizedHeader[0] === '補充說明') {
    return rows
      .slice(1)
      .map((cells) => cells[0] || '')
      .filter((cell) => cell.trim() !== '')
      .join('\n');
  }

  return rows
    .flat()
    .filter((cell) => cell.trim() !== '')
    .join('\n');
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMultilineHtml(text) {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function getSupplementaryDetailMarkup() {
  if (!appState.supplementaryInfo.trim()) return '';
  return `
    <section class="detail-section supplementary-detail-panel">
      <h4>補充說明</h4>
      <div class="detail-desc">${formatMultilineHtml(appState.supplementaryInfo)}</div>
    </section>
  `;
}

function fetchTargetSheetCsvLegacy(url) {
  const spreadsheetId = getSpreadsheetId(url);
  if (!spreadsheetId) {
    throw new Error('Invalid Google Sheet URL');
  }

  const htmlViewUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`;

  return fetch(htmlViewUrl)
    .then(response => {
      if (!response.ok) throw new Error('CORS or Network error on htmlview');
      return response.text();
    })
    .then(htmlText => {
      const regex = /items\.push\(\{name:\s*"([^"]+)",\s*pageUrl:\s*"[^"]*",\s*gid:\s*"([^"]+)"/g;
      let match;
      const tabs = [];
      while ((match = regex.exec(htmlText)) !== null) {
        tabs.push({ name: match[1], gid: match[2] });
      }

      const targetTab = findTargetSheetTab(tabs);
      if (!targetTab) {
        throw new Error(`Google Sheet 找不到名稱為 "${TARGET_SHEET_TAB_NAME}" 的工作表`);
      }

      const resolvedSheetUrl = updateUrlGid(url, targetTab.gid);
      const csvUrl = `${getGoogleSheetCsvUrl(resolvedSheetUrl, targetTab.gid)}&t=${Date.now()}`;

      return fetch(csvUrl)
        .then(response => {
          if (!response.ok) throw new Error('Failed to fetch CSV');
          return response.text();
        })
        .then(csvText => ({
          csvText,
          targetTab,
          resolvedSheetUrl
        }));
    });
}

function fetchSheetTabs(url) {
  const spreadsheetId = getSpreadsheetId(url);
  if (!spreadsheetId) {
    throw new Error('Invalid Google Sheet URL');
  }

  const htmlViewUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`;

  return fetch(htmlViewUrl)
    .then((response) => {
      if (!response.ok) throw new Error('CORS or Network error on htmlview');
      return response.text();
    })
    .then((htmlText) => {
      const regex = /items\.push\(\{name:\s*"([^"]+)",\s*pageUrl:\s*"[^"]*",\s*gid:\s*"([^"]+)"/g;
      let match;
      const tabs = [];
      while ((match = regex.exec(htmlText)) !== null) {
        tabs.push({ name: match[1], gid: match[2] });
      }
      return tabs;
    });
}

function fetchSheetTabCsv(url, tab) {
  if (!tab?.gid) return Promise.resolve('');

  const resolvedSheetUrl = updateUrlGid(url, tab.gid);
  const csvUrl = `${getGoogleSheetCsvUrl(resolvedSheetUrl, tab.gid)}&t=${Date.now()}`;

  return fetch(csvUrl)
    .then((response) => {
      if (!response.ok) throw new Error('Failed to fetch CSV');
      return response.text();
    });
}

function fetchTargetSheetCsv(url) {
  return fetchSheetTabs(url)
    .then((tabs) => {
      const targetTab = findTargetSheetTab(tabs);
      if (!targetTab) {
        throw new Error(`Google Sheet missing required "${TARGET_SHEET_TAB_NAME}" tab`);
      }

      const supplementaryTab = findSupplementarySheetTab(tabs);
      const resolvedSheetUrl = updateUrlGid(url, targetTab.gid);

      return Promise.all([
        fetchSheetTabCsv(url, targetTab),
        supplementaryTab ? fetchSheetTabCsv(url, supplementaryTab) : Promise.resolve(null),
      ]).then(([csvText, supplementaryCsvText]) => ({
        csvText,
        supplementaryCsvText,
        targetTab,
        resolvedSheetUrl,
      }));
    });
}

function refreshSheetDataIfNeeded() {
  if (!isSheetAutoRefreshEnabled || !appState.sheetUrl || isSheetAutoRefreshInFlight) return;

  isSheetAutoRefreshInFlight = true;
  fetchTargetSheetCsv(appState.sheetUrl)
    .then(({ csvText, supplementaryCsvText, targetTab, resolvedSheetUrl }) => {
      appState.sheetTabs = [];
      appState.activeGid = targetTab.gid;
      appState.sheetUrl = resolvedSheetUrl;

      if (csvText !== appState.rawCSV) {
        applySheetCsv(csvText);
      }
      if (supplementaryCsvText !== null) {
        const nextSupplementaryInfo = parseSupplementaryCsv(supplementaryCsvText);
        if (nextSupplementaryInfo !== appState.supplementaryInfo) {
          applySupplementaryInfo(nextSupplementaryInfo);
        }
      }
    })
    .catch(error => {
      console.warn('Auto refresh skipped:', error.message);
    })
    .finally(() => {
      isSheetAutoRefreshInFlight = false;
    });
}

async function ensureHandRaiseSubscription() {
  const sessionId = getHandRaiseSessionId();
  if (!sessionId) {
    handRaiseUnsubscribe();
    handRaiseUnsubscribe = () => {};
    activeHandRaiseSessionId = '';
    handRaiseEntries = [];
    handRaiseHasHydrated = false;
    handRaiseKnownEntryIds = new Set();
    renderTeacherHandRaisePanel();
    return;
  }

  if (activeHandRaiseSessionId === sessionId && handRaiseStoreRef) return;

  handRaiseUnsubscribe();
  handRaiseUnsubscribe = () => {};
  activeHandRaiseSessionId = sessionId;
  handRaiseHasHydrated = false;
  handRaiseKnownEntryIds = new Set();
  handRaiseStoreRef = await getHandRaiseStore();
  handRaiseUnsubscribe = handRaiseStoreRef.subscribe(sessionId, (entries) => {
    syncTeacherHandRaiseAlerts(entries);
    handRaiseEntries = entries;
    renderTeacherHandRaisePanel();
  });
}

function formatHandRaiseTime(entry) {
  const timestamp = entry.createdAtMs || Date.now();
  return new Date(timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
}

function getFilteredHandRaiseEntries() {
  let entries = handRaiseEntries;
  entries = entries.filter((entry) => entry.status !== 'resolved');
  if (!teacherHandRaiseRecentOnly || appState.currentMode !== 'teacher') return entries;
  const cutoff = Date.now() - HAND_RAISE_RECENT_WINDOW_MS;
  return entries.filter((entry) => (entry.createdAtMs || 0) >= cutoff);
}

function getTeacherHandRaiseListMarkup(filteredEntries, emptyMessage, mode = 'teacher') {
  const isTeacher = mode === 'teacher';
  if (filteredEntries.length === 0) {
    return `<div class="teacher-live-empty">${emptyMessage}</div>`;
  }

  return filteredEntries.slice(0, 20).map((entry) => `
    <article class="teacher-live-item ${isTeacher ? 'teacher-live-item-compact' : 'teacher-live-item student-readonly-item'}">
      <div class="teacher-live-item-header">
        <span class="teacher-live-type">${entry.status === 'resolved' ? '已處理' : '待處理'}</span>
        <span class="teacher-live-time">${formatHandRaiseTime(entry)}</span>
      </div>
      <div class="teacher-live-item-message teacher-live-item-message-compact">${entry.message || '無訊息內容'}</div>
      <div class="teacher-live-item-footer">
        <span class="teacher-live-status ${entry.status === 'resolved' ? 'resolved' : 'pending'}">${entry.status === 'resolved' ? '已處理' : '待處理'}</span>
        ${isTeacher ? `
        <div class="teacher-live-status-actions">
          <button class="teacher-live-status-btn" type="button" data-hand-raise-id="${entry.id}" data-hand-raise-action="pending">標為待處理</button>
          <button class="teacher-live-status-btn" type="button" data-hand-raise-id="${entry.id}" data-hand-raise-action="resolved">標為已處理</button>
        </div>` : ''}
      </div>
    </article>
  `).join('');
}

function renderTeacherHandRaisePanel() {
  const totalEl = document.getElementById('teacher-hand-raise-total');
  const repeatEl = document.getElementById('teacher-hand-raise-repeat');
  const stuckEl = document.getElementById('teacher-hand-raise-stuck');
  const listEl = document.getElementById('teacher-hand-raise-list');
  const detailListEl = document.getElementById('teacher-hand-raise-detail-list');
  const studentDetailListEl = document.getElementById('student-hand-raise-detail-list');
  const filteredEntries = getFilteredHandRaiseEntries();
  const emptyMessage = teacherHandRaiseRecentOnly && appState.currentMode === 'teacher'
    ? '最近 5 分鐘內沒有新的學生提問。'
    : '目前還沒有學生提問。';

  if (totalEl) totalEl.innerText = String(filteredEntries.length);
  if (repeatEl) repeatEl.innerText = String(filteredEntries.filter((item) => item.type === 'repeat').length);
  if (stuckEl) stuckEl.innerText = String(filteredEntries.filter((item) => item.type === 'stuck').length);
  if (listEl) listEl.innerHTML = getTeacherHandRaiseListMarkup(filteredEntries, emptyMessage, 'teacher');
  if (detailListEl) detailListEl.innerHTML = getTeacherHandRaiseListMarkup(filteredEntries, emptyMessage, 'teacher');
  if (studentDetailListEl) studentDetailListEl.innerHTML = getTeacherHandRaiseListMarkup(filteredEntries, '目前還沒有學生提問結果。', 'student');
}

function getTeacherHandRaiseDetailMarkup() {
  if (appState.currentMode !== 'teacher') return '';
  return `
    <section class="detail-section teacher-hand-raise-detail-panel">
      <h4>學生提問結果</h4>
      <div id="teacher-hand-raise-detail-list" class="teacher-live-list">
        <div class="teacher-live-empty">目前還沒有學生提問。</div>
      </div>
    </section>
  `;
}

function getStudentHandRaiseDetailMarkup() {
  if (appState.currentMode !== 'student') return '';
  return `
    <section class="detail-section teacher-hand-raise-detail-panel">
      <h4>學生提問結果</h4>
      <div class="student-hand-raise-readonly-note">學生端只能查看提問結果，不能修改處理狀態。</div>
      <div id="student-hand-raise-detail-list" class="teacher-live-list">
        <div class="teacher-live-empty">目前還沒有學生提問結果。</div>
      </div>
    </section>
  `;
}

function getHandRaisePanelMarkup(item) {
  if (appState.currentMode !== 'student') return '';
  const chips = HAND_RAISE_PRESETS.map((preset) => `
    <button class="hand-raise-chip" type="button" data-hand-raise-type="${preset.type}" data-hand-raise-label="${preset.label}" data-hand-raise-message="${preset.message}">
      ${preset.label}
    </button>
  `).join('');

  return `
    <section class="detail-section hand-raise-panel">
      <h4>舉手 / 提問</h4>
      <p>學生只需要輸入想說的文字內容，送出後老師端會即時看到。</p>
      <div class="hand-raise-quick-actions">${chips}</div>
      <textarea id="hand-raise-message" class="hand-raise-textarea" placeholder="請直接輸入學生想提問的文字內容。"></textarea>
      <div class="hand-raise-footer">
        <span id="hand-raise-status" class="hand-raise-status">送出後老師端會即時收到。</span>
        <button id="btn-submit-hand-raise" class="action-btn" type="button">送出提問</button>
      </div>
    </section>
  `;
}

function wireHandRaiseComposer(item) {
  const submitBtn = document.getElementById('btn-submit-hand-raise');
  const textarea = document.getElementById('hand-raise-message');
  const statusEl = document.getElementById('hand-raise-status');
  const chips = Array.from(document.querySelectorAll('[data-hand-raise-type]'));

  if (!submitBtn || !textarea || !statusEl) return;

  let selectedPreset = null;

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      selectedPreset = {
        type: chip.dataset.handRaiseType,
        label: chip.dataset.handRaiseLabel,
        message: chip.dataset.handRaiseMessage,
      };
      textarea.value = selectedPreset.message || '';
      statusEl.innerText = `已帶入「${selectedPreset.label}」，可直接送出或自行修改文字。`;
    });
  });

  submitBtn.addEventListener('click', async () => {
    const message = textarea.value.trim();
    if (!message && !selectedPreset) {
      statusEl.innerText = '請先輸入想提問的文字內容。';
      return;
    }

    try {
      await ensureHandRaiseSubscription();
      if (!handRaiseStoreRef || !activeHandRaiseSessionId) {
        throw new Error('尚未連線到提問資料');
      }

      const payload = {
        type: selectedPreset?.type || 'question',
        label: selectedPreset?.label || '自由提問',
        message: message || selectedPreset?.message || '',
        status: 'pending',
      };

      submitBtn.disabled = true;
      await handRaiseStoreRef.submit(activeHandRaiseSessionId, payload);
      textarea.value = '';
      selectedPreset = null;
      statusEl.innerText = '已送出，老師端會即時看到。';
    } catch (error) {
      console.error(error);
      statusEl.innerText = `送出失敗：${error.message}`;
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// Fetch CSV data from Google Sheet and only use the worksheet tab named "now"
function fetchSheetData(url, targetGid = null) {
  const spreadsheetId = getSpreadsheetId(url);
  if (!spreadsheetId) {
    alert('無效的 Google Sheet 網址，請確認格式是否正確！');
    return;
  }

  showLoader(true);
  
  const htmlViewUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`;

  // Fetch worksheets/tabs list first, then lock to the tab named "now"
  fetch(htmlViewUrl)
    .then(response => {
      if (!response.ok) throw new Error('CORS or Network error on htmlview');
      return response.text();
    })
    .then(htmlText => {
      // Parse tabs using regex
      const regex = /items\.push\(\{name:\s*"([^"]+)",\s*pageUrl:\s*"[^"]*",\s*gid:\s*"([^"]+)"/g;
      let match;
      const tabs = [];
      while ((match = regex.exec(htmlText)) !== null) {
        tabs.push({ name: match[1], gid: match[2] });
      }

      const targetTab = findTargetSheetTab(tabs);
      if (!targetTab) {
        throw new Error(`Google Sheet 中找不到名稱為 "${TARGET_SHEET_TAB_NAME}" 的工作表`);
      }

      appState.sheetTabs = [];
      appState.activeGid = targetTab.gid;
      appState.sheetUrl = updateUrlGid(url, targetTab.gid);
      
      const sheetInput = document.getElementById('input-sheet-url');
      if (sheetInput) sheetInput.value = appState.sheetUrl;

      // Update Tab Selection UI
      renderSheetTabsUI();

      // Fetch active tab CSV
      const csvUrl = getGoogleSheetCsvUrl(appState.sheetUrl, targetTab.gid);
      return fetch(csvUrl);
    })
    .catch(error => {
      throw error;
    })
    .then(response => {
      if (!response.ok) throw new Error('連線失敗，請確認該試算表是否已公開分享！');
      return response.text();
    })
    .then(csvText => {
      appState.rawCSV = csvText;
      const csvRawInput = document.getElementById('input-csv-raw');
      if (csvRawInput) csvRawInput.value = csvText;
      
      saveStateToLocalStorage();
      parseAndRender(csvText);
      updateShareLinkInput();
    })
    .catch(error => {
      console.error(error);
      alert(`載入 Google Sheet 失敗: ${error.message}\n\n提醒：請在試算表點選右上角「共用」，將權限設為「知道連結的任何人均可檢視」；或者您也可以使用「上傳本機 CSV」或「載入本地範例」來測試。`);
    })
    .finally(() => {
      showLoader(false);
    });
}

// Override sheet loading to enable automatic polling-based refresh for the "now" tab
function fetchSheetData(url, targetGid = null) {
  showLoader(true);

  fetchTargetSheetCsv(url)
    .then(({ csvText, supplementaryCsvText, targetTab, resolvedSheetUrl }) => {
      appState.sheetTabs = [];
      appState.activeGid = targetTab.gid;
      appState.sheetUrl = resolvedSheetUrl;

      const sheetInput = document.getElementById('input-sheet-url');
      if (sheetInput) sheetInput.value = appState.sheetUrl;

      renderSheetTabsUI();
      applySheetCsv(csvText);
      if (supplementaryCsvText !== null) {
        applySupplementaryInfo(parseSupplementaryCsv(supplementaryCsvText));
      }
      startSheetAutoRefresh();
      ensureHandRaiseSubscription();
    })
    .catch(error => {
      console.error(error);
      alert(`頛 Google Sheet 憭望?: ${error.message}`);
    })
    .finally(() => {
      showLoader(false);
    });
}

// Helper to extract spreadsheet ID
function getSpreadsheetId(url) {
  if (!url) return null;
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// Helper to append or replace gid in Google Sheet URLs safely
function updateUrlGid(url, gid) {
  if (!url) return url;

  const spreadsheetId = getSpreadsheetId(url);
  if (spreadsheetId) {
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${gid}`;
  }

  let baseUrl = url.split('#')[0].replace(/[?&]gid=\d+/g, '');
  return baseUrl + (baseUrl.includes('?') ? '&' : '?') + `gid=${gid}`;
}

// Render dynamic tab selectors in both Left Settings Panel and Right Details Panel mascot empty state
function renderSheetTabsUI() {
  const tabs = appState.sheetTabs || [];
  const leftTabsGrp = document.getElementById('group-sheet-tabs');
  const leftTabsList = document.getElementById('sheet-tabs-list');
  const rightTabsContainer = document.getElementById('right-sheet-tabs-container');
  const rightTabsList = document.getElementById('right-sheet-tabs-list');

  if (tabs.length === 0) {
    hideSheetTabsUI();
    return;
  }

  // Show containers
  if (leftTabsGrp) leftTabsGrp.style.display = 'block';
  if (rightTabsContainer) {
    // Only display right tabs list if we are currently not displaying specific node details (empty detail state)
    rightTabsContainer.style.display = appState.selectedItem ? 'none' : 'block';
  }

  // Populate left panel list
  if (leftTabsList) {
    leftTabsList.innerHTML = '';
    tabs.forEach(tab => {
      const btn = document.createElement('button');
      btn.className = `sheet-tab-btn ${tab.gid === appState.activeGid ? 'active' : ''}`;
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="9" y1="3" x2="9" y2="21"></line>
        </svg>
        <span>${tab.name}</span>
      `;
      btn.onclick = () => selectSheetTab(tab.gid);
      leftTabsList.appendChild(btn);
    });
  }

  // Populate right panel list
  if (rightTabsList) {
    rightTabsList.innerHTML = '';
    tabs.forEach(tab => {
      const btn = document.createElement('button');
      btn.className = `sheet-tab-btn ${tab.gid === appState.activeGid ? 'active' : ''}`;
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="9" y1="3" x2="9" y2="21"></line>
        </svg>
        <span>${tab.name}</span>
      `;
      btn.onclick = () => selectSheetTab(tab.gid);
      rightTabsList.appendChild(btn);
    });
  }
}

// Clear sheet tab DOM lists and hide containers
function hideSheetTabsUI() {
  const leftTabsGrp = document.getElementById('group-sheet-tabs');
  if (leftTabsGrp) leftTabsGrp.style.display = 'none';

  const rightTabsContainer = document.getElementById('right-sheet-tabs-container');
  if (rightTabsContainer) rightTabsContainer.style.display = 'none';
}

function showUnboundStudentState(message) {
  appState.rawCSV = '';
  appState.parsedItems = [];
  appState.selectedItem = null;
  appState.checkedRanks.clear();
  appState.sheetTabs = [];
  hideSheetTabsUI();

  const treeContainer = document.getElementById('tree-container');
  if (treeContainer) {
    treeContainer.innerHTML = `<div class="empty-state"><p>${message}</p></div>`;
  }

  const itemCount = document.getElementById('item-count');
  if (itemCount) itemCount.innerText = '0 個項目';

  showItemDetail(null);
}

// User clicked a tab to load a different sheet tab
function selectSheetTab(gid) {
  if (appState.activeGid === gid) return;
  
  appState.activeGid = gid;
  appState.sheetUrl = updateUrlGid(appState.sheetUrl, gid);
  
  const sheetInput = document.getElementById('input-sheet-url');
  if (sheetInput) sheetInput.value = appState.sheetUrl;
  
  showLoader(true);
  const csvUrl = getGoogleSheetCsvUrl(appState.sheetUrl, gid);
  
  fetch(csvUrl)
    .then(response => {
      if (!response.ok) throw new Error('載入分頁 CSV 失敗，請確認該分頁是否存在且已公開！');
      return response.text();
    })
    .then(csvText => {
      appState.rawCSV = csvText;
      const csvRawInput = document.getElementById('input-csv-raw');
      if (csvRawInput) csvRawInput.value = csvText;
      
      saveStateToLocalStorage();
      parseAndRender(csvText);
      
      // Update UI active buttons & share link input
      renderSheetTabsUI();
      updateShareLinkInput();
    })
    .catch(error => {
      console.error(error);
      alert(`切換分頁失敗: ${error.message}`);
    })
    .finally(() => {
      showLoader(false);
    });
}

// Parse Raw Text CSV manually to support quotes and commas safely
function parseCSV(text) {
  const lines = [];
  let row = [""];
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        row[row.length - 1] += '"';
        i++; // skip next quote
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      row.push("");
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n
      }
      if (row.length > 1 || row[0] !== "") {
        lines.push(row);
      }
      row = [""];
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row);
  }

  if (lines.length === 0) return [];

  // Extract headers
  const headers = lines[0].map(h => h.trim().toLowerCase());
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i];
    // Ignore empty lines
    if (values.length === 1 && values[0] === "") continue;
    
    const item = {};
    headers.forEach((header, idx) => {
      item[header] = values[idx] ? values[idx].trim() : "";
    });
    
    // Ensure vital fields are present
    if (item.name || item.category) {
      data.push(item);
    }
  }
  return data;
}

// Parse CSV content and render tree UI
function parseAndRender(csvText) {
  try {
    const items = parseCSV(csvText);
    if (!items || items.length === 0) {
      throw new Error("無效的 CSV 內容，無法解析出任何項目");
    }

    appState.parsedItems = items;
    appState.checkedRanks.clear(); // Reset checkboxes on reload
    
    // Update badge item count
    document.getElementById('item-count').innerText = `${items.length} 個項目`;

    // Build hierarchical tree
    const treeData = buildTreeStructure(items);

    // Render tree UI
    renderTree(treeData);

    // Update supplementary notes section
    updateSupplementaryDisplay();

    // Reset Selected view
    showItemDetail(null);
    updatePdfDropdownUI();
  } catch (err) {
    alert(`解析 CSV 錯誤: ${err.message}`);
  }
}

// Build hierarchical structure out of flat items list
function buildTreeStructure(items) {
  const root = { name: "Root", type: "root", children: [] };

  function getOrCreateCategory(parentList, categoryPath) {
    let currentList = parentList;
    let currentCategory = null;

    for (let segment of categoryPath) {
      segment = segment.trim();
      if (!segment) continue;

      let found = currentList.find(c => c.type === 'category' && c.name === segment);
      if (!found) {
        found = {
          name: segment,
          type: 'category',
          children: [],
          minRank: Infinity
        };
        currentList.push(found);
      }
      currentCategory = found;
      currentList = found.children;
    }
    return currentCategory || root;
  }

  // 1. Traverse and insert items
  items.forEach(item => {
    const rankVal = parseInt(item.rank) || 999;
    const categoryPath = item.category ? item.category.split('/') : ['未分類'];

    const parentNode = getOrCreateCategory(root.children, categoryPath);

    const leafNode = {
      name: item.name,
      type: 'item',
      rank: rankVal,
      url: item.url,
      description: item.description,
      categoryPath: item.category
    };

    parentNode.children.push(leafNode);

    // Propagate minimum rank up to categories
    let tempPathList = root.children;
    for (let segment of categoryPath) {
      segment = segment.trim();
      if (!segment) continue;
      let cat = tempPathList.find(c => c.type === 'category' && c.name === segment);
      if (cat) {
        if (rankVal < cat.minRank) {
          cat.minRank = rankVal;
        }
        tempPathList = cat.children;
      }
    }
  });

  // 2. Recursive sorting by Rank
  function sortTreeNodes(node) {
    node.children.sort((a, b) => {
      const rankA = a.type === 'category' ? a.minRank : a.rank;
      const rankB = b.type === 'category' ? b.minRank : b.rank;
      return rankA - rankB;
    });

    node.children.forEach(child => {
      if (child.type === 'category') {
        sortTreeNodes(child);
      }
    });
  }

  sortTreeNodes(root);
  return root;
}

// Render Tree DOM
function renderTree(treeData) {
  const container = document.getElementById('tree-container');
  container.innerHTML = '';

  if (treeData.children.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>無資料，請上傳或貼上 CSV 資料</p></div>`;
    return;
  }

  const rootList = document.createElement('ul');
  rootList.className = 'tree-list';

  treeData.children.forEach(child => {
    rootList.appendChild(createTreeNodeDOM(child));
  });

  container.appendChild(rootList);
}

// Recursively create list nodes with checkboxes
function createTreeNodeDOM(node) {
  const li = document.createElement('li');
  li.className = 'tree-item';

  const row = document.createElement('div');
  row.className = 'node-row';

  // Checkbox insertion
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'node-checkbox no-print';
  
  if (node.type === 'item') {
    checkbox.dataset.rank = node.rank;
    checkbox.dataset.type = 'item';
    checkbox.checked = appState.checkedRanks.has(node.rank);
  } else {
    checkbox.dataset.type = 'category';
  }

  row.appendChild(checkbox);

  if (node.type === 'category') {
    row.classList.add('category-node');
    
    // Toggle Collapse arrow
    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'node-toggle-icon expanded';
    toggleIcon.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    `;
    row.appendChild(toggleIcon);

    // Folder Icon
    const folderIcon = document.createElement('span');
    folderIcon.className = 'node-icon folder-icon';
    folderIcon.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
    row.appendChild(folderIcon);

    // Label
    const label = document.createElement('span');
    label.className = 'node-label';
    label.innerText = node.name;
    row.appendChild(label);

    // Inner items badge
    const count = countLeafItems(node);
    const badge = document.createElement('span');
    badge.className = 'node-badge rank-badge';
    badge.innerText = `${count} 個資源`;
    row.appendChild(badge);

    li.appendChild(row);

    // Subtree container
    const subtree = document.createElement('ul');
    subtree.className = 'tree-list tree-subtree show'; // expanded by default
    node.children.forEach(child => {
      subtree.appendChild(createTreeNodeDOM(child));
    });
    li.appendChild(subtree);

    // Click trigger to toggle expand/collapse (but avoid clicking on checkbox)
    row.addEventListener('click', (e) => {
      if (e.target === checkbox) return;
      e.stopPropagation();
      const isExpanded = subtree.classList.toggle('show');
      toggleIcon.classList.toggle('expanded', isExpanded);
    });

    // Checkbox cascading select
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      const checked = checkbox.checked;
      
      // Select all descendent checkboxes
      subtree.querySelectorAll('.node-checkbox').forEach(cb => {
        cb.checked = checked;
        cb.indeterminate = false;
        
        if (cb.dataset.type === 'item') {
          const rankVal = parseInt(cb.dataset.rank);
          if (checked) {
            appState.checkedRanks.add(rankVal);
          } else {
            appState.checkedRanks.delete(rankVal);
          }
        }
      });
      
      updateParentCheckboxes(checkbox);
      updatePdfDropdownUI();
    });

  } else {
    // Leaf node item
    row.classList.add('leaf-node');
    
    // Placeholder space for indent alignment with folders
    const spacer = document.createElement('span');
    spacer.style.width = '16px';
    row.appendChild(spacer);

    // Link/File Icon
    const itemIcon = document.createElement('span');
    itemIcon.className = 'node-icon leaf-icon';
    itemIcon.innerHTML = node.url ? `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
      </svg>
    ` : `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
      </svg>
    `;
    row.appendChild(itemIcon);

    // Label
    const label = document.createElement('span');
    label.className = 'node-label';
    label.innerText = node.name;
    row.appendChild(label);

    // Rank index badge
    const badge = document.createElement('span');
    badge.className = 'node-badge rank-badge';
    badge.innerText = `Rank ${node.rank}`;
    row.appendChild(badge);

    li.appendChild(row);

    // Select node handler (avoid triggering when clicking checkbox)
    row.addEventListener('click', (e) => {
      if (e.target === checkbox) return;
      e.stopPropagation();
      
      // Clear active highlights
      document.querySelectorAll('.leaf-node').forEach(el => el.classList.remove('active'));
      row.classList.add('active');

      showItemDetail(node);
    });

    // Checkbox item event listener
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      const rankVal = parseInt(node.rank);
      if (checkbox.checked) {
        appState.checkedRanks.add(rankVal);
      } else {
        appState.checkedRanks.delete(rankVal);
      }
      
      updateParentCheckboxes(checkbox);
      updatePdfDropdownUI();
    });
  }

  return li;
}

// Traverse upwards to set parent checked & indeterminate states recursively
function updateParentCheckboxes(checkbox) {
  let parentLi = checkbox.closest('li').parentElement.closest('li');
  
  while (parentLi) {
    const parentRow = parentLi.querySelector('.node-row');
    const parentCB = parentRow.querySelector('.node-checkbox');
    const siblingSubtree = parentLi.querySelector('.tree-subtree');
    
    if (parentCB && siblingSubtree) {
      // Find direct child checkboxes inside the immediate subtree
      const childCBs = Array.from(siblingSubtree.querySelectorAll(':scope > .tree-item > .node-row > .node-checkbox'));
      
      const allChecked = childCBs.every(cb => cb.checked);
      const noneChecked = childCBs.every(cb => !cb.checked && !cb.indeterminate);
      
      if (allChecked) {
        parentCB.checked = true;
        parentCB.indeterminate = false;
      } else if (noneChecked) {
        parentCB.checked = false;
        parentCB.indeterminate = false;
      } else {
        parentCB.checked = false;
        parentCB.indeterminate = true;
      }
    }
    
    parentLi = parentLi.parentElement.closest('li');
  }
}

// Count total leaf items nested under a category
function countLeafItems(categoryNode) {
  let count = 0;
  function recurse(n) {
    n.children.forEach(c => {
      if (c.type === 'item') count++;
      else recurse(c);
    });
  }
  recurse(categoryNode);
  return count;
}

// Display Detail of selected Item
function showItemDetail(item) {
  const container = document.getElementById('detail-container');
  appState.selectedItem = item;

  // Sync details PDF label in dropdown menu
  const selectedDesc = document.getElementById('pdf-selected-name');
  if (selectedDesc) {
    if (item) {
      selectedDesc.innerText = `僅匯出：「${item.name}」`;
      document.getElementById('btn-pdf-selected').disabled = false;
    } else {
      selectedDesc.innerText = `僅匯出當前選取的項目 (尚未選取)`;
      document.getElementById('btn-pdf-selected').disabled = true;
    }
  }

  if (!item && appState.currentMode === 'student') {
    container.innerHTML = `
      <div class="detail-card">
        ${getSupplementaryDetailMarkup()}
        ${getHandRaisePanelMarkup(null)}
        ${getStudentHandRaiseDetailMarkup()}
        <div id="right-sheet-tabs-container" style="display: none; margin-top: 24px; padding-top: 20px; border-top: 1px dashed rgba(255, 255, 255, 0.15); width: 100%;">
          <h4 style="font-size: 0.95rem; margin-bottom: 12px; color: var(--text-color); font-weight: 500; text-align: center;">
            撌乩?銵典??翰????
          </h4>
          <div id="right-sheet-tabs-list" class="sheet-tabs-container" style="justify-content: center;">
            <!-- Will be filled dynamically -->
          </div>
        </div>
      </div>
    `;
    setTimeout(() => {
      renderSheetTabsUI();
      wireHandRaiseComposer(null);
      renderTeacherHandRaisePanel();
    }, 0);
    return;
  }

  if (!item) {
    if (appState.currentMode === 'teacher') {
      container.innerHTML = `
        <div class="detail-card">
          ${getSupplementaryDetailMarkup()}
          ${getTeacherHandRaiseDetailMarkup()}
          <div id="right-sheet-tabs-container" style="display: none; margin-top: 24px; padding-top: 20px; border-top: 1px dashed rgba(255, 255, 255, 0.15); width: 100%;">
            <h4 style="font-size: 0.95rem; margin-bottom: 12px; color: var(--text-color); font-weight: 500; text-align: center;">
              撌乩?銵典??翰????
            </h4>
            <div id="right-sheet-tabs-list" class="sheet-tabs-container" style="justify-content: center;">
              <!-- Will be filled dynamically -->
            </div>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
      <div class="detail-empty-state">
        <div class="cute-mascot-container">
          <svg class="cute-mascot" viewBox="0 0 100 100" width="120" height="120">
            <!-- Shadow -->
            <ellipse cx="50" cy="85" rx="20" ry="4" fill="rgba(99, 102, 241, 0.15)" class="mascot-shadow" />
            <!-- Floating group -->
            <g class="mascot-float">
              <!-- Waving Left Arm -->
              <path d="M25,55 C15,50 15,35 22,35 C25,35 28,45 28,50" fill="none" stroke="#6366f1" stroke-width="4" stroke-linecap="round" class="mascot-left-arm" style="transform-origin: 28px 50px;" />
              <!-- Right Arm -->
              <path d="M75,55 C85,55 85,45 78,40" fill="none" stroke="#6366f1" stroke-width="4" stroke-linecap="round" class="mascot-right-arm" />
              <!-- Body -->
              <rect x="30" y="38" width="40" height="35" rx="10" fill="#1e1b4b" stroke="#6366f1" stroke-width="3" />
              <rect x="35" y="43" width="30" height="20" rx="5" fill="#312e81" />
              <!-- Head -->
              <rect x="35" y="18" width="30" height="22" rx="8" fill="#1e1b4b" stroke="#6366f1" stroke-width="3" />
              <!-- Antenna -->
              <line x1="50" y1="18" x2="50" y2="10" stroke="#8b5cf6" stroke-width="3" stroke-linecap="round" />
              <circle cx="50" cy="8" r="3" fill="#ec4899" class="mascot-light" />
              <!-- Blinking Eyes -->
              <circle cx="44" cy="28" r="3" fill="#60a5fa" class="mascot-eye" style="transform-origin: 44px 28px;" />
              <circle cx="56" cy="28" r="3" fill="#60a5fa" class="mascot-eye" style="transform-origin: 56px 28px;" />
              <!-- Smile -->
              <path d="M46,33 Q50,36 54,33" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" />
              <!-- Heart Badge -->
              <path d="M50,55 C50,55 47,52 47,50 C47,48.5 48.5,47 50,48.5 C51.5,47 53,48.5 53,50 C53,52 50,55 50,55 Z" fill="#ec4899" />
            </g>
          </svg>
        </div>
        <h3>請點選左側目錄中的學習物件</h3>
        <p>點選後在此處將會顯示詳細下載連結與學習描述說明。</p>
        ${getTeacherHandRaiseDetailMarkup()}${getStudentHandRaiseDetailMarkup()}
        ${getHandRaisePanelMarkup(null)}
        <div id="right-sheet-tabs-container" style="display: none; margin-top: 24px; padding-top: 20px; border-top: 1px dashed rgba(255, 255, 255, 0.15); width: 100%;">
          <h4 style="font-size: 0.95rem; margin-bottom: 12px; color: var(--text-color); font-weight: 500; text-align: center;">
            工作表分頁快速切換
          </h4>
          <div id="right-sheet-tabs-list" class="sheet-tabs-container" style="justify-content: center;">
            <!-- Will be filled dynamically -->
          </div>
        </div>
      </div>
      `;
    }
    setTimeout(() => {
      renderSheetTabsUI();
      wireHandRaiseComposer(null);
      renderTeacherHandRaisePanel();
    }, 0);
    return;
  }

  container.innerHTML = `
    <div class="detail-card">
      ${getHandRaisePanelMarkup(item)}
      ${getSupplementaryDetailMarkup()}
      <div class="detail-header-section">
        <span class="detail-category-path">${item.categoryPath.replace(/\//g, ' › ')}</span>
        <h3 class="detail-title">${item.name}</h3>
        <div class="meta-badges-row">
          <span class="badge">順序: ${item.rank}</span>
          ${item.url ? '<span class="badge" style="background:var(--success-light);color:#6ee7b7;border-color:rgba(16,185,129,0.3)">附下載資源</span>' : ''}
        </div>
      </div>

      <div class="detail-section">
        <h4>學習描述與說明</h4>
        <div class="detail-desc">
          ${item.description ? item.description.replace(/\n/g, '<br>') : '此項目無特別說明。'}
        </div>
      </div>

      ${item.url ? `
        <div class="detail-section">
          <h4>下載連結 / 線上資源</h4>
          <div class="download-link-box">
            <p>${item.url}</p>
            <a href="${item.url}" target="_blank" class="action-btn download-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              前往下載 / 瀏覽資源
            </a>
          </div>
        </div>
      ` : ''}
      ${getTeacherHandRaiseDetailMarkup()}${getStudentHandRaiseDetailMarkup()}
    </div>
  `;
  wireHandRaiseComposer(item);
  renderTeacherHandRaisePanel();
}

// Update Supplementary Section display
function updateSupplementaryDisplay() {
  const displaySection = document.getElementById('supplementary-info-display');
  const textDisplay = document.getElementById('supplement-text-display');
  const printSuppSection = document.getElementById('print-supplement-section');
  const printSuppContent = document.getElementById('print-supplement-content');

  if (displaySection) displaySection.classList.add('hidden');
  if (textDisplay) textDisplay.innerText = appState.supplementaryInfo;

  if (appState.supplementaryInfo.trim() !== '') {
    if (printSuppSection) printSuppSection.classList.remove('hidden');
    if (printSuppContent) printSuppContent.innerText = appState.supplementaryInfo;
  } else if (printSuppSection) {
    printSuppSection.classList.add('hidden');
  }

  if (document.getElementById('detail-container')) {
    showItemDetail(appState.selectedItem);
  }
}

// PDF Export drop menu toggler
function togglePdfDropdown(e) {
  e.stopPropagation();
  const menu = document.getElementById('pdf-dropdown-menu');
  menu.classList.toggle('hidden');
  updatePdfDropdownUI();
}

// Refresh dynamic texts in the PDF dropdown selector
function updatePdfDropdownUI() {
  const count = appState.checkedRanks.size;
  const checkedDesc = document.getElementById('pdf-checked-count');
  if (checkedDesc) checkedDesc.innerText = `僅匯出勾選項目 (${count} 個)`;

  const btnChecked = document.getElementById('btn-pdf-checked');
  if (btnChecked) btnChecked.disabled = (count === 0);

  const btnSelected = document.getElementById('btn-pdf-selected');
  const selectedNameDesc = document.getElementById('pdf-selected-name');
  if (btnSelected && selectedNameDesc) {
    if (appState.selectedItem) {
      selectedNameDesc.innerText = `僅匯出：「${appState.selectedItem.name}」`;
      btnSelected.disabled = false;
    } else {
      selectedNameDesc.innerText = `僅匯出當前選取的項目 (尚未選取)`;
      btnSelected.disabled = true;
    }
  }
}

// Setup print layouts dynamically, then call print
function triggerPdfExport(type) {
  // Hide dropdown
  document.getElementById('pdf-dropdown-menu').classList.add('hidden');

  let itemsToPrint = [];

  if (type === 'all') {
    itemsToPrint = appState.parsedItems;
  } else if (type === 'checked') {
    itemsToPrint = appState.parsedItems.filter(item => appState.checkedRanks.has(parseInt(item.rank)));
  } else if (type === 'selected') {
    if (appState.selectedItem) {
      itemsToPrint = [appState.selectedItem];
    }
  }

  if (itemsToPrint.length === 0) {
    alert('沒有符合條件的項目可供匯出！');
    return;
  }

  // Populate print container
  renderPrintableList(itemsToPrint);

  // Trigger print
  window.print();
}

// Render Printable List for PDF Generation
function renderPrintableList(items) {
  const container = document.getElementById('print-tree-list');
  const printTitle = document.getElementById('print-workshop-title');
  
  if (printTitle) printTitle.innerText = appState.workshopTitle;
  container.innerHTML = '';

  // Sort flat list by rank
  const sortedItems = [...items].sort((a, b) => (parseInt(a.rank) || 999) - (parseInt(b.rank) || 999));

  sortedItems.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = 'print-item';

    const cleanCategory = item.category ? item.category.replace(/\//g, ' › ') : '未分類';
    
    itemEl.innerHTML = `
      <div class="print-item-path">${cleanCategory} [順序 ${item.rank}]</div>
      <div class="print-item-header">
        <span>${item.name}</span>
      </div>
      <p class="print-item-desc">${item.description || '無描述說明。'}</p>
      ${item.url ? `<div class="print-item-link">資源網址: ${item.url}</div>` : ''}
    `;
    container.appendChild(itemEl);
  });
}

// Action Trigger handlers for Teacher controls

function loadGoogleSheet() {
  const url = document.getElementById('input-sheet-url').value.trim();
  if (!url) {
    alert('請輸入 Google Sheet 網址！');
    return;
  }
  fetchSheetData(url);
}

function loadSampleCSV() {
  const sampleCSV = `rank,category,name,url,description
1,AI 核心觀念/機器學習基礎,機器學習簡介投影片,https://example.com/ml-intro-slides,介紹什麼是機器學習、監督式與非監督式學習的區別。
2,AI 核心觀念/機器學習基礎,線性回歸與分類實作,https://example.com/ml-basic-colab,Google Colab 實作：使用 Scikit-Learn 進行房價預測與鳶尾花分類。
3,AI 核心觀念/深度學習導論,神經網路基礎觀念,https://example.com/nn-basics,理解神經元、激活函數（ReLU, Sigmoid）以及前向與反向傳播。
4,AI 核心觀念/深度學習導論,第一個 PyTorch 模型,https://example.com/pytorch-model,建立並訓練一個簡單的多層感知器（MLP）分類器。
5,Karpathy 準則實踐/模型建構,微梯度下降引擎 Micrograd,https://github.com/karpathy/micrograd,Andrej Karpathy 開源的超輕量反向傳播引擎，非常適合學習 Autograd 機制。
6,Karpathy 準則實踐/模型建構,模型訓練 Debug 檢核表,https://example.com/debug-checklist,Karpathy 提出的模型訓練排錯指南：先從小資料集 Overfit 開始。
7,Karpathy 準則實踐/模型建構,學習率調整策略 (LR Finder),https://example.com/lr-finder-guide,說明如何使用 Learning Rate Finder 尋找最適合的初始學習率。
8,Karpathy 準則實踐/生成式 AI,字元級 GPT 訓練實作,https://example.com/char-gpt-colab,使用 nanoGPT 的概念，在 Colab 上從零訓練一個莎士比亞風格的字元級 GPT。
9,Karpathy 準則實踐/生成式 AI,Tokenization 斷詞原理,https://example.com/tokenization-video,Karpathy 講解的大語言模型斷詞（Byte Pair Encoding, BPE）教學影片。
10,補充資源/進階學習,LLM.c 從零用 C 寫 GPT-2,https://github.com/karpathy/llm.c,Karpathy 最新力作：不使用 PyTorch，純 C 語言與 CUDA 撰寫 GPT-2 訓練代碼。`;

  appState.sheetTabs = [];
  appState.activeGid = '0';
  stopSheetAutoRefresh();
  clearHandRaiseSubscription();
  appState.rawCSV = sampleCSV;
  const csvRawInput = document.getElementById('input-csv-raw');
  if (csvRawInput) csvRawInput.value = sampleCSV;
  saveStateToLocalStorage();
  parseAndRender(sampleCSV);
  renderSheetTabsUI();
}

function parseRawCSV() {
  const csvText = document.getElementById('input-csv-raw').value;
  if (!csvText.trim()) {
    alert('貼上區無任何內容！');
    return;
  }
  appState.sheetTabs = [];
  appState.activeGid = '0';
  stopSheetAutoRefresh();
  clearHandRaiseSubscription();
  appState.rawCSV = csvText;
  saveStateToLocalStorage();
  parseAndRender(csvText);
  renderSheetTabsUI();
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const csvText = e.target.result;
    appState.sheetTabs = [];
    appState.activeGid = '0';
    stopSheetAutoRefresh();
    clearHandRaiseSubscription();
    appState.rawCSV = csvText;
    const csvRawInput = document.getElementById('input-csv-raw');
    if (csvRawInput) csvRawInput.value = csvText;
    saveStateToLocalStorage();
    parseAndRender(csvText);
    renderSheetTabsUI();
  };
  reader.readAsText(file);
}

// Generate a sharing link encoding the current state
function generateShareLink() {
  const currentUrl = new URL(window.location.href);
  const baseUrl = new URL('./student/', currentUrl).toString();
  const params = new URLSearchParams();
  params.set('title', appState.workshopTitle);
  params.set('sheet', appState.sheetUrl);
  return `${baseUrl}?${params.toString()}`;
}

function openStudentPage() {
  window.location.href = generateShareLink();
}

// Update the readonly link input inside the teacher panel
function updateShareLinkInput() {
  const shareInput = document.getElementById('input-share-url');
  const studentLink = document.getElementById('link-open-student');
  if (shareInput) {
    const shareUrl = generateShareLink();
    shareInput.value = shareUrl;
    if (studentLink) studentLink.href = shareUrl;
  }
}

// Copy the sharing link to clipboard
function copyShareLink() {
  const shareInput = document.getElementById('input-share-url');
  if (!shareInput) return;

  shareInput.select();
  navigator.clipboard.writeText(shareInput.value)
    .then(() => {
      const copyBtn = document.getElementById('btn-copy-share');
      const originalText = copyBtn.innerText;
      copyBtn.innerText = '已複製！';
      copyBtn.style.background = 'var(--success-color)';
      copyBtn.style.borderColor = 'var(--success-color)';
      copyBtn.style.color = '#fff';
      
      setTimeout(() => {
        copyBtn.innerText = originalText;
        copyBtn.style.background = '';
        copyBtn.style.borderColor = '';
        copyBtn.style.color = '';
      }, 2000);
    })
    .catch(err => {
      console.error('無法複製連結', err);
      alert('複製失敗，請手動全選複製輸入框內的連結。');
    });
}

// Expand or collapse all folder subtrees at once
function expandAllNodes(expand) {
  const subtrees = document.querySelectorAll('.tree-subtree');
  const toggleIcons = document.querySelectorAll('.node-toggle-icon');
  
  subtrees.forEach(subtree => {
    if (expand) {
      subtree.classList.add('show');
    } else {
      subtree.classList.remove('show');
    }
  });
  
  toggleIcons.forEach(icon => {
    if (expand) {
      icon.classList.add('expanded');
    } else {
      icon.classList.remove('expanded');
    }
  });
}

// Utilities
function showLoader(show) {
  const btn = document.getElementById('btn-load-sheet');
  if (show) {
    btn.disabled = true;
    btn.innerText = '載入中...';
  } else {
    btn.disabled = false;
    btn.innerText = '載入';
  }
}
