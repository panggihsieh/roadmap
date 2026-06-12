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

// Initialize Application
window.addEventListener('DOMContentLoaded', () => {
  // Load data from LocalStorage if available
  loadStateFromLocalStorage();

  // Bind inputs to state
  initDOMBindings();

  // Check query string parameters for student link quick setup
  const isLocked = checkURLParameters();

  if (!isLocked) {
    // Initial load: Load sample data if no cached raw CSV
    if (appState.rawCSV) {
      parseAndRender(appState.rawCSV);
      renderSheetTabsUI();
    } else {
      // Default to sample CSV for initial preview
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
});

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
    if (suppParam) {
      appState.supplementaryInfo = suppParam;
      updateSupplementaryDisplay();
    }

    const sheetParam = urlParams.get('sheet');
    if (sheetParam) {
      appState.sheetUrl = sheetParam;
      fetchSheetData(sheetParam);
    } else {
      loadSampleCSV();
    }
    return true;
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

// Fetch CSV data from Google Sheet with automatic Tab detection and selection
function fetchSheetData(url, targetGid = null) {
  const spreadsheetId = getSpreadsheetId(url);
  if (!spreadsheetId) {
    alert('無效的 Google Sheet 網址，請確認格式是否正確！');
    return;
  }

  showLoader(true);
  
  // Parse target Gid
  let activeGid = targetGid;
  if (!activeGid) {
    const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
    activeGid = gidMatch ? gidMatch[1] : (appState.activeGid || '0');
  }

  const htmlViewUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`;

  // Fetch worksheets/tabs list first
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

      if (tabs.length > 0) {
        appState.sheetTabs = tabs;
        
        // Check if activeGid exists in detected tabs
        const exists = tabs.some(t => t.gid === activeGid);
        if (!exists) {
          activeGid = tabs[0].gid; // default to first tab if activeGid not found
        }
      } else {
        appState.sheetTabs = [];
      }
      
      appState.activeGid = activeGid;
      appState.sheetUrl = updateUrlGid(url, activeGid);
      
      const sheetInput = document.getElementById('input-sheet-url');
      if (sheetInput) sheetInput.value = appState.sheetUrl;

      // Update Tab Selection UI
      renderSheetTabsUI();

      // Fetch active tab CSV
      const csvUrl = getGoogleSheetCsvUrl(appState.sheetUrl, activeGid);
      return fetch(csvUrl);
    })
    .catch(error => {
      console.warn('Tab detection failed, attempting direct CSV load fallback:', error.message);
      
      appState.sheetTabs = [];
      appState.activeGid = activeGid;
      appState.sheetUrl = updateUrlGid(url, activeGid);
      
      const sheetInput = document.getElementById('input-sheet-url');
      if (sheetInput) sheetInput.value = appState.sheetUrl;
      
      renderSheetTabsUI();

      const csvUrl = getGoogleSheetCsvUrl(appState.sheetUrl, activeGid);
      return fetch(csvUrl);
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

// Helper to extract spreadsheet ID
function getSpreadsheetId(url) {
  if (!url) return null;
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// Helper to append or replace gid in Google Sheet URLs safely
function updateUrlGid(url, gid) {
  if (!url) return url;
  
  let baseUrl = url;
  if (baseUrl.includes('#')) {
    const parts = baseUrl.split('#');
    if (parts[1].startsWith('gid=')) {
      baseUrl = parts[0];
    }
  }
  
  if (baseUrl.includes('?')) {
    const parts = baseUrl.split('?');
    const params = new URLSearchParams(parts[1]);
    if (params.has('gid')) {
      params.delete('gid');
      const paramStr = params.toString();
      baseUrl = parts[0] + (paramStr ? '?' + paramStr : '');
    }
  } else if (baseUrl.includes('&')) {
    baseUrl = baseUrl.replace(/[&?]gid=\d+/, '');
  }
  
  if (baseUrl.includes('/edit')) {
    const beforeEdit = baseUrl.split('/edit')[0];
    return beforeEdit + `/edit#gid=${gid}`;
  }
  
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
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
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

  if (!item) {
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
    setTimeout(() => {
      renderSheetTabsUI();
    }, 0);
    return;
  }

  container.innerHTML = `
    <div class="detail-card">
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
    </div>
  `;
}

// Update Supplementary Section display
function updateSupplementaryDisplay() {
  const displaySection = document.getElementById('supplementary-info-display');
  const textDisplay = document.getElementById('supplement-text-display');
  const printSuppSection = document.getElementById('print-supplement-section');
  const printSuppContent = document.getElementById('print-supplement-content');

  if (appState.supplementaryInfo.trim() !== '') {
    if (displaySection) displaySection.classList.remove('hidden');
    if (textDisplay) textDisplay.innerText = appState.supplementaryInfo;
    
    // Print views
    if (printSuppSection) printSuppSection.classList.remove('hidden');
    if (printSuppContent) printSuppContent.innerText = appState.supplementaryInfo;
  } else {
    if (displaySection) displaySection.classList.add('hidden');
    
    // Print views
    if (printSuppSection) printSuppSection.classList.add('hidden');
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
  const baseUrl = window.location.origin + window.location.pathname;
  const params = new URLSearchParams();
  params.set('view', 'student');
  params.set('title', appState.workshopTitle);
  params.set('sheet', appState.sheetUrl);
  params.set('supp', appState.supplementaryInfo);
  return `${baseUrl}?${params.toString()}`;
}

// Update the readonly link input inside the teacher panel
function updateShareLinkInput() {
  const shareInput = document.getElementById('input-share-url');
  if (shareInput) {
    shareInput.value = generateShareLink();
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
