const graphContainer = document.getElementById('graph')
const addCauseButton = document.getElementById('addCauseButton')
const removeNodeButton = document.getElementById('removeNodeButton')
const selectionHint = document.getElementById('selectionHint')
const selectionBadge = document.getElementById('selectionBadge')
const actionStatus = document.getElementById('actionStatus')
const sheetUrlInput = document.getElementById('sheetUrlInput')
const loadSheetButton = document.getElementById('loadSheetButton')
const downloadCsvButton = document.getElementById('downloadCsvButton')
const downloadPngButton = document.getElementById('downloadPngButton')
const sheetStatus = document.getElementById('sheetStatus')
const studentSchoolInput = document.getElementById('studentSchool')
const studentClassInput = document.getElementById('studentClass')
const studentNameInput = document.getElementById('studentName')
const studentSeatInput = document.getElementById('studentSeat')
const nodeLabelInput = document.getElementById('nodeLabel')
const nodeDescriptionInput = document.getElementById('nodeDescription')

const STORAGE_KEY_SHEET_URL = 'fishbones_sheet_url'
const SHEET_TAB_NAME = 'fishbones'
const SAMPLE_CSV_FILENAME = 'fishbones-sample.csv'
const PNG_FILENAME = 'fishbone-diagram.png'
const BOARD_WIDTH = 900
const BOARD_HEIGHT = 620
const LASER_CUT_COLOR = 'rgb(255, 0, 0)'
const FISH_SPINE_Y = 305
const FISH_SPINE_START_X = 128
const FISH_SPINE_END_X = 700
const FISH_BONE_JOINT_X = 670
const FISH_OUTLINE_PATHS = [
  'M72 278 C88 288 108 298 128 305 C108 312 88 322 72 332 C82 314 82 296 72 278',
  `M${FISH_SPINE_END_X} ${FISH_SPINE_Y} C${FISH_SPINE_END_X} 220 708 180 728 170 C785 172 835 210 865 250 C882 275 875 296 845 ${FISH_SPINE_Y} C872 315 875 336 848 360 C815 400 775 430 728 425 C708 410 ${FISH_SPINE_END_X} 385 ${FISH_SPINE_END_X} ${FISH_SPINE_Y}`,
]
const SAMPLE_CSV_ROWS = [
  ['theme', 'theme_description', 'label', 'description', 'role', 'x', 'y'],
  ['如何提高 Scratch 編寫能力', '從基礎概念、練習方法、除錯習慣與作品分享四個面向提升 Scratch 創作能力。', '基礎概念', '熟悉角色、舞台、事件、迴圈與條件判斷。', 'cause-top', '190', '172'],
  ['如何提高 Scratch 編寫能力', '從基礎概念、練習方法、除錯習慣與作品分享四個面向提升 Scratch 創作能力。', '專案練習', '每週完成一個小遊戲或互動動畫，累積實作經驗。', 'cause-bottom', '312', '390'],
  ['如何提高 Scratch 編寫能力', '從基礎概念、練習方法、除錯習慣與作品分享四個面向提升 Scratch 創作能力。', '除錯習慣', '分段測試積木，觀察變數與角色行為是否符合預期。', 'cause-top', '420', '172'],
  ['如何提高 Scratch 編寫能力', '從基礎概念、練習方法、除錯習慣與作品分享四個面向提升 Scratch 創作能力。', '作品分享', '觀看他人作品、改編範例，並請同學提供回饋。', 'cause-bottom', '540', '390'],
]

const TEXT = {
  defaultTheme: '\u6838\u5fc3\u4e3b\u984c',
  defaultThemeDescription: '\u9ede\u9078\u9019\u500b\u4e3b\u984c\u7bc0\u9ede\u5f8c\uff0c\u53ef\u5728\u53f3\u5074\u8f38\u5165\u66f4\u5b8c\u6574\u7684\u8aaa\u660e\u3002',
  addCause: '\u56e0\u679c',
  addCauseDescription: '\u65b0\u7684\u56e0\u679c\u63cf\u8ff0',
  unnamed: '\u672a\u547d\u540d',
  selectHint: '\u8acb\u5148\u9ede\u9078\u5716\u4e0a\u7684\u7bc0\u9ede\u3002',
  defaultBadge: '\u62d6\u62c9\u7bc0\u9ede\u8abf\u6574\u4f4d\u7f6e\uff0c\u9ede\u9078\u7bc0\u9ede\u7de8\u8f2f\u5167\u5bb9',
  defaultStatus: '\u5c1a\u672a\u57f7\u884c\u65b0\u589e\u64cd\u4f5c',
  keepEffect: '\u6838\u5fc3\u4e3b\u984c\u9700\u8981\u4fdd\u7559\uff0c\u53ef\u4ee5\u7de8\u8f2f\u4f46\u4e0d\u80fd\u79fb\u9664\u3002',
}

const state = {
  selectedNodeId: null,
  causeCount: 0,
  nodes: [],
  dragging: null,
  graphRect: null,
  addSlots: [
    { x: 70, y: 70, role: 'cause-top' },
    { x: 70, y: 470, role: 'cause-bottom' },
    { x: 250, y: 70, role: 'cause-top' },
    { x: 250, y: 470, role: 'cause-bottom' },
    { x: 430, y: 70, role: 'cause-top' },
    { x: 430, y: 470, role: 'cause-bottom' },
  ],
}

const board = document.createElement('div')
board.className = 'graph-board'
board.style.width = `${BOARD_WIDTH}px`
board.style.height = `${BOARD_HEIGHT}px`

const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
svg.classList.add('graph-svg')
svg.setAttribute('viewBox', `0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`)
svg.setAttribute('preserveAspectRatio', 'none')

const linesLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
linesLayer.classList.add('graph-lines')

const nodesLayer = document.createElement('div')
nodesLayer.className = 'graph-nodes'

svg.appendChild(linesLayer)
graphContainer.append(board)
board.append(svg, nodesLayer)

function makeNode(config) {
  return {
    id: config.id,
    label: config.label,
    description: config.description || '',
    role: config.role,
    x: config.x,
    y: config.y,
    width: config.width || 160,
    height: config.height || 56,
    fill: config.fill || '#fff7ef',
    stroke: config.stroke || '#cf7a50',
  }
}

function initialize() {
  setNodes(buildDefaultNodes())
  render()
  selectNode('effect')
  bindEvents()
  restoreSheetUrl()

  if (sheetUrlInput.value) {
    loadSheetData(sheetUrlInput.value)
  }
}

function bindEvents() {
  addCauseButton.addEventListener('click', () => {
    const nextIndex = getNextCauseIndex()
    const slot = state.addSlots[state.causeCount % state.addSlots.length]
    const newNode = makeNode({
      id: `cause-${nextIndex}`,
      x: slot.x,
      y: slot.y,
      label: `${TEXT.addCause} ${nextIndex}`,
      description: TEXT.addCauseDescription,
      role: slot.role,
      fill: '#ffe7d6',
      stroke: '#c85018',
    })

    state.nodes.push(newNode)
    state.causeCount += 1
    render()
    selectNode(newNode.id)
    updateActionStatus(`\u6309\u9215\u5df2\u89f8\u767c\uff0c\u5df2\u65b0\u589e\uff1a${newNode.label}`)
  })

  removeNodeButton.addEventListener('click', removeSelectedNode)

  loadSheetButton.addEventListener('click', () => {
    loadSheetData(sheetUrlInput.value.trim())
  })

  downloadCsvButton.addEventListener('click', downloadSampleCsv)
  downloadPngButton.addEventListener('click', downloadFishbonePng)

  nodeLabelInput.addEventListener('input', (event) => {
    const node = getSelectedNode()
    if (!node) {
      return
    }

    node.label = event.target.value || TEXT.unnamed
    render()
    selectNode(node.id)
  })

  nodeDescriptionInput.addEventListener('input', (event) => {
    const node = getSelectedNode()
    if (!node) {
      return
    }

    node.description = event.target.value
    updateActionStatus(`\u76ee\u524d\u9078\u53d6\uff1a${node.label}`)
  })

  graphContainer.addEventListener('pointermove', onPointerMove)
  graphContainer.addEventListener('pointerup', stopDragging)
  graphContainer.addEventListener('pointercancel', stopDragging)
  graphContainer.addEventListener('pointerleave', stopDragging)
  graphContainer.addEventListener('click', (event) => {
    if (event.target === graphContainer || event.target === board || event.target === svg || event.target === linesLayer) {
      clearSelection()
    }
  })

  window.addEventListener('resize', render)
}

function buildDefaultNodes() {
  return [
    makeNode({
      id: 'effect',
      x: 700,
      y: 258,
      width: 190,
      height: 82,
      label: TEXT.defaultTheme,
      description: TEXT.defaultThemeDescription,
      role: 'effect',
      fill: '#fff0e3',
      stroke: '#d46a3a',
    }),
    makeNode({
      id: 'cause-1',
      x: 190,
      y: 172,
      label: '\u4eba\u54e1',
      description: '\u7bc4\u4f8b\uff1a\u8a13\u7df4\u4e0d\u8db3\u3001\u5354\u4f5c\u843d\u5dee',
      role: 'cause-top',
    }),
    makeNode({
      id: 'cause-2',
      x: 312,
      y: 390,
      label: '\u6d41\u7a0b',
      description: '\u7bc4\u4f8b\uff1a\u6d41\u7a0b\u7e41\u7463\u3001\u4ea4\u63a5\u4e0d\u6e05',
      role: 'cause-bottom',
    }),
    makeNode({
      id: 'cause-3',
      x: 420,
      y: 172,
      label: '\u5de5\u5177',
      description: '\u7bc4\u4f8b\uff1a\u7cfb\u7d71\u9650\u5236\u3001\u8cc7\u6599\u5206\u6563',
      role: 'cause-top',
    }),
    makeNode({
      id: 'cause-4',
      x: 540,
      y: 390,
      label: '\u74b0\u5883',
      description: '\u7bc4\u4f8b\uff1a\u6642\u7a0b\u58d3\u529b\u3001\u5916\u90e8\u9650\u5236',
      role: 'cause-bottom',
    }),
  ]
}

function setNodes(nodes) {
  state.nodes = nodes
  state.causeCount = nodes.filter((node) => node.role !== 'effect').length
}

function downloadSampleCsv() {
  const csvText = SAMPLE_CSV_ROWS.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')
  const blob = new Blob([`\ufeff${csvText}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = SAMPLE_CSV_FILENAME
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  updateSheetStatus('已下載 CSV 範例，請匯入 Google Sheet 並將分頁命名為 fishbones。')
}

function downloadFishbonePng() {
  const canvas = createFishboneCanvas()
  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = PNG_FILENAME
  document.body.appendChild(link)
  link.click()
  link.remove()
  updateActionStatus('已下載 PNG 圖檔。')
}

function createFishboneCanvas() {
  const padding = 36
  const maxNodeX = Math.max(...state.nodes.map((node) => node.x + node.width), 900)
  const maxNodeY = Math.max(...state.nodes.map((node) => node.y + node.height), 620)
  const width = Math.max(board.scrollWidth, maxNodeX + padding)
  const height = Math.max(board.scrollHeight, maxNodeY + padding)
  const scale = Math.max(window.devicePixelRatio || 1, 2)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const context = canvas.getContext('2d')
  context.scale(scale, scale)
  context.fillStyle = '#fffaf2'
  context.fillRect(0, 0, width, height)
  drawGrid(context, width, height)
  drawExportLines(context)
  state.nodes.forEach((node) => drawExportNode(context, node))
  drawExportStudentInfo(context, width)
  return canvas
}

function drawGrid(context, width, height) {
  context.strokeStyle = 'rgba(216, 195, 178, 0.36)'
  context.lineWidth = 1

  for (let x = 0; x <= width; x += 28) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, height)
    context.stroke()
  }

  for (let y = 0; y <= height; y += 28) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(width, y)
    context.stroke()
  }
}

function drawExportLines(context) {
  context.lineCap = 'round'
  drawExportFishOutline(context)
  context.strokeStyle = LASER_CUT_COLOR
  context.lineWidth = 8
  drawCanvasLine(context, FISH_SPINE_START_X, FISH_SPINE_Y, FISH_SPINE_END_X, FISH_SPINE_Y)

  const effectNode = state.nodes.find((node) => node.role === 'effect')
  if (effectNode) {
    context.strokeStyle = LASER_CUT_COLOR
    context.lineWidth = 2
    drawCanvasLine(context, FISH_BONE_JOINT_X, FISH_SPINE_Y, effectNode.x, effectNode.y + effectNode.height / 2)
  }

  state.nodes
    .filter((node) => node.role !== 'effect')
    .forEach((node) => {
      const startX = node.x + node.width / 2
      const startY = node.role === 'cause-top' ? node.y + node.height : node.y
      context.strokeStyle = LASER_CUT_COLOR
      context.lineWidth = 2
      drawCanvasLine(context, startX, startY, FISH_BONE_JOINT_X, FISH_SPINE_Y)
    })
}

function drawExportFishOutline(context) {
  context.save()
  context.strokeStyle = LASER_CUT_COLOR
  context.lineWidth = 8
  context.lineJoin = 'round'
  context.lineCap = 'round'
  FISH_OUTLINE_PATHS.forEach((path) => {
    context.stroke(new Path2D(path))
  })
  context.restore()
}

function drawCanvasLine(context, x1, y1, x2, y2) {
  context.beginPath()
  context.moveTo(x1, y1)
  context.lineTo(x2, y2)
  context.stroke()
}

function drawExportNode(context, node) {
  context.save()
  context.fillStyle = node.fill
  context.strokeStyle = node.stroke
  context.lineWidth = state.selectedNodeId === node.id ? 4 : 2
  context.shadowColor = 'rgba(92, 60, 36, 0.14)'
  context.shadowBlur = 18
  context.shadowOffsetY = 8

  if (node.role === 'effect') {
    drawFishEffectNode(context, node)
  } else {
    drawRoundedRect(context, node.x, node.y, node.width, node.height, 18)
  }

  context.shadowColor = 'transparent'
  context.fillStyle = '#2f241f'
  context.font = '700 18px "Segoe UI", "Noto Sans TC", sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  drawWrappedText(context, node.label, node.x + node.width / 2, node.y + node.height / 2, node.width - 28, 24)
  context.restore()
}

function drawExportStudentInfo(context, width) {
  const infoRows = [
    ['學校', studentSchoolInput?.value || ''],
    ['班級', studentClassInput?.value || ''],
    ['姓名', studentNameInput?.value || ''],
    ['座號', studentSeatInput?.value || ''],
  ].filter(([, value]) => String(value).trim() !== '')

  if (infoRows.length === 0) {
    return
  }

  const blockWidth = 188
  const startX = width - blockWidth - 20
  const startY = 18
  const lineHeight = 28

  context.save()
  context.fillStyle = '#111'
  context.font = '700 16px "Segoe UI", "Noto Sans TC", sans-serif'
  context.textAlign = 'left'
  context.textBaseline = 'middle'

  infoRows.forEach(([label, value], index) => {
    const rowY = startY + (index * lineHeight)
    context.fillText(`${label}:`, startX, rowY)
    context.fillText(String(value), startX + 52, rowY)
  })

  context.restore()
}

function drawFishEffectNode(context, node) {
  const tailWidth = 28
  const radius = node.height / 2
  context.beginPath()
  context.moveTo(node.x, node.y + node.height / 2)
  context.lineTo(node.x - tailWidth, node.y + node.height / 2 - 22)
  context.lineTo(node.x - tailWidth, node.y + node.height / 2 + 22)
  context.closePath()
  context.fill()
  context.stroke()
  drawRoundedRect(context, node.x, node.y, node.width, node.height, radius)
  context.beginPath()
  context.arc(node.x + node.width - 18, node.y + 22, 3, 0, Math.PI * 2)
  context.fillStyle = node.stroke
  context.fill()
}

function drawRoundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
  context.fill()
  context.stroke()
}

function drawWrappedText(context, text, centerX, centerY, maxWidth, lineHeight) {
  const chars = Array.from(String(text))
  const lines = []
  let line = ''

  chars.forEach((char) => {
    const nextLine = `${line}${char}`
    if (line && context.measureText(nextLine).width > maxWidth) {
      lines.push(line)
      line = char
    } else {
      line = nextLine
    }
  })

  if (line) {
    lines.push(line)
  }

  const startY = centerY - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((item, index) => {
    context.fillText(item, centerX, startY + index * lineHeight)
  })
}

function escapeCsvCell(value) {
  const text = String(value)
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

function getNextCauseIndex() {
  const causeIndexes = state.nodes
    .map((node) => String(node.id).match(/^cause-(\d+)$/))
    .filter(Boolean)
    .map((match) => Number(match[1]))

  return causeIndexes.length > 0 ? Math.max(...causeIndexes) + 1 : 1
}

async function loadSheetData(url) {
  if (!isGoogleSheetUrl(url)) {
    updateSheetStatus('\u8acb\u8f38\u5165\u6709\u6548\u7684 Google Sheet \u9023\u7d50\u3002')
    return
  }

  loadSheetButton.disabled = true
  updateSheetStatus(`\u6b63\u5728\u8f09\u5165 ${SHEET_TAB_NAME} tab...`)

  try {
    const { csvText, resolvedSheetUrl } = await fetchFishbonesCsv(url)
    const nodes = buildNodesFromSheetCsv(csvText)
    setNodes(nodes)
    sheetUrlInput.value = resolvedSheetUrl
    localStorage.setItem(STORAGE_KEY_SHEET_URL, resolvedSheetUrl)
    render()
    selectNode('effect')
    updateSheetStatus(`\u5df2\u8f09\u5165 ${state.causeCount} \u500b\u56e0\u679c\u7bc0\u9ede\u3002`)
    updateActionStatus(`\u5df2\u5f9e Google Sheet \u8f09\u5165 ${state.causeCount} \u500b\u56e0\u679c\u7bc0\u9ede`)
  } catch (error) {
    updateSheetStatus(`\u8f09\u5165\u5931\u6557\uff1a${error.message}`)
  } finally {
    loadSheetButton.disabled = false
  }
}

function restoreSheetUrl() {
  const urlParams = new URLSearchParams(window.location.search)
  const urlParam = urlParams.get('sheet')
  const savedUrl = localStorage.getItem(STORAGE_KEY_SHEET_URL)
  sheetUrlInput.value = urlParam || savedUrl || ''
}

function updateSheetStatus(text) {
  if (sheetStatus) {
    sheetStatus.textContent = text
  }
}

function isGoogleSheetUrl(url) {
  return typeof url === 'string' && /docs\.google\.com\/spreadsheets\/d\//.test(url)
}

function getSpreadsheetId(url) {
  const match = String(url || '').match(/\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : ''
}

function getGoogleSheetCsvUrl(url, gid) {
  const spreadsheetId = getSpreadsheetId(url)
  if (!spreadsheetId) {
    return ''
  }

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid || '0'}`
}

function updateUrlGid(url, gid) {
  const spreadsheetId = getSpreadsheetId(url)
  if (!spreadsheetId) {
    return url
  }

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${gid}`
}

async function fetchFishbonesCsv(url) {
  const spreadsheetId = getSpreadsheetId(url)
  if (!spreadsheetId) {
    throw new Error('Google Sheet \u9023\u7d50\u683c\u5f0f\u932f\u8aa4')
  }

  const htmlViewUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`
  const htmlResponse = await fetch(htmlViewUrl)
  if (!htmlResponse.ok) {
    throw new Error('Google Sheet htmlview \u8f09\u5165\u5931\u6557')
  }

  const htmlText = await htmlResponse.text()
  const tabs = extractSheetTabs(htmlText)
  const targetTab = tabs.find((tab) => tab.name.trim().toLowerCase() === SHEET_TAB_NAME)
  if (!targetTab) {
    throw new Error(`Google Sheet \u627e\u4e0d\u5230 "${SHEET_TAB_NAME}" tab`)
  }

  const resolvedSheetUrl = updateUrlGid(url, targetTab.gid)
  const csvUrl = `${getGoogleSheetCsvUrl(resolvedSheetUrl, targetTab.gid)}&t=${Date.now()}`
  const csvResponse = await fetch(csvUrl)
  if (!csvResponse.ok) {
    throw new Error('fishbones CSV \u8f09\u5165\u5931\u6557')
  }

  return {
    csvText: await csvResponse.text(),
    resolvedSheetUrl,
  }
}

function extractSheetTabs(htmlText) {
  const tabs = []
  const regex = /items\.push\(\{name:\s*"([^"]+)",\s*pageUrl:\s*"[^"]*",\s*gid:\s*"([^"]+)"/g
  let match

  while ((match = regex.exec(htmlText)) !== null) {
    tabs.push({ name: match[1], gid: match[2] })
  }

  return tabs
}

function buildNodesFromSheetCsv(csvText) {
  const rows = parseCsv(csvText)
  if (rows.length === 0) {
    throw new Error('fishbones tab \u6c92\u6709\u8cc7\u6599')
  }

  const headers = rows[0].map((cell) => normalizeHeader(cell))
  const dataRows = rows.slice(1).filter((cells) => cells.some((cell) => String(cell || '').trim() !== ''))
  const labelIndex = findHeaderIndex(headers, ['label', '\u56e0\u679c', 'cause'])
  if (labelIndex < 0) {
    throw new Error('fishbones tab \u7f3a\u5c11 label \u6216 \u56e0\u679c \u6b04\u4f4d')
  }

  const descriptionIndex = findHeaderIndex(headers, ['description', '\u63cf\u8ff0'])
  const roleIndex = findHeaderIndex(headers, ['role', '\u4f4d\u7f6e'])
  const xIndex = findHeaderIndex(headers, ['x'])
  const yIndex = findHeaderIndex(headers, ['y'])
  const themeIndex = findHeaderIndex(headers, ['theme', '\u4e3b\u984c'])
  const themeDescriptionIndex = findHeaderIndex(headers, ['theme_description', '\u4e3b\u984c\u63cf\u8ff0'])

  const themeLabel = firstNonEmptyValue(dataRows, themeIndex) || TEXT.defaultTheme
  const themeDescription = firstNonEmptyValue(dataRows, themeDescriptionIndex) || TEXT.defaultThemeDescription

  const nodes = [
    makeNode({
      id: 'effect',
      x: 700,
      y: 258,
      width: 190,
      height: 82,
      label: themeLabel,
      description: themeDescription,
      role: 'effect',
      fill: '#fff0e3',
      stroke: '#d46a3a',
    }),
  ]

  dataRows.forEach((cells, index) => {
    const label = String(cells[labelIndex] || '').trim()
    if (!label) {
      return
    }

    const slot = state.addSlots[index % state.addSlots.length]
    const roleValue = normalizeRole(cells[roleIndex], slot.role)
    const xValue = toNumber(cells[xIndex], slot.x)
    const yValue = toNumber(cells[yIndex], slot.y)

    nodes.push(makeNode({
      id: `cause-${index + 1}`,
      x: xValue,
      y: yValue,
      label,
      description: descriptionIndex >= 0 ? String(cells[descriptionIndex] || '').trim() : '',
      role: roleValue,
    }))
  })

  if (nodes.length === 1) {
    throw new Error('fishbones tab \u6c92\u6709\u53ef\u7528\u7684\u56e0\u679c\u8cc7\u6599')
  }

  return nodes
}

function parseCsv(text) {
  const rows = []
  let currentRow = ['']
  let insideQuote = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        currentRow[currentRow.length - 1] += '"'
        index += 1
      } else {
        insideQuote = !insideQuote
      }
    } else if (char === ',' && !insideQuote) {
      currentRow.push('')
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        index += 1
      }
      rows.push(currentRow.map((cell) => cell.trim()))
      currentRow = ['']
    } else {
      currentRow[currentRow.length - 1] += char
    }
  }

  if (currentRow.some((cell) => cell !== '')) {
    rows.push(currentRow.map((cell) => cell.trim()))
  }

  return rows.filter((row) => row.some((cell) => cell !== ''))
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase()
}

function findHeaderIndex(headers, candidates) {
  return headers.findIndex((header) => candidates.includes(header))
}

function firstNonEmptyValue(rows, index) {
  if (index < 0) {
    return ''
  }

  for (const row of rows) {
    const value = String(row[index] || '').trim()
    if (value) {
      return value
    }
  }

  return ''
}

function normalizeRole(value, fallback) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'cause-top' || normalized === 'top' || normalized === '\u4e0a') {
    return 'cause-top'
  }
  if (normalized === 'cause-bottom' || normalized === 'bottom' || normalized === '\u4e0b') {
    return 'cause-bottom'
  }
  return fallback
}

function toNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function render() {
  renderLines()
  renderNodes()
}

function renderLines() {
  linesLayer.innerHTML = ''
  renderFishOutline()

  const spine = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  spine.setAttribute('x1', String(FISH_SPINE_START_X))
  spine.setAttribute('y1', String(FISH_SPINE_Y))
  spine.setAttribute('x2', String(FISH_SPINE_END_X))
  spine.setAttribute('y2', String(FISH_SPINE_Y))
  spine.setAttribute('stroke', LASER_CUT_COLOR)
  spine.setAttribute('stroke-width', '8')
  spine.setAttribute('stroke-linecap', 'round')
  linesLayer.appendChild(spine)

  const effectNode = state.nodes.find((node) => node.role === 'effect')
  if (effectNode) {
    linesLayer.appendChild(createLine(FISH_BONE_JOINT_X, FISH_SPINE_Y, effectNode.x, effectNode.y + effectNode.height / 2, LASER_CUT_COLOR, 2))
  }

  state.nodes
    .filter((node) => node.role !== 'effect')
    .forEach((node) => {
      const startX = node.x + node.width / 2
      const startY = node.role === 'cause-top' ? node.y + node.height : node.y
      linesLayer.appendChild(createLine(startX, startY, FISH_BONE_JOINT_X, FISH_SPINE_Y, LASER_CUT_COLOR, 2))
    })
}

function renderFishOutline() {
  FISH_OUTLINE_PATHS.forEach((path) => {
    linesLayer.appendChild(createPath(path, LASER_CUT_COLOR, 8))
  })
}

function renderNodes() {
  nodesLayer.innerHTML = ''

  state.nodes.forEach((node) => {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = [
      'fish-node',
      node.role === 'effect' ? 'is-effect' : '',
      state.selectedNodeId === node.id ? 'is-selected' : '',
    ].filter(Boolean).join(' ')
    element.dataset.nodeId = node.id
    element.style.left = `${node.x}px`
    element.style.top = `${node.y}px`
    element.style.width = `${node.width}px`
    element.style.height = `${node.height}px`
    element.style.background = node.fill
    element.style.borderColor = node.stroke
    element.style.setProperty('--node-fill', node.fill)
    element.style.setProperty('--node-stroke', node.stroke)
    element.innerHTML = `<span>${escapeHtml(node.label)}</span>`

    element.addEventListener('click', (event) => {
      event.stopPropagation()
      selectNode(node.id)
    })

    element.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
      startDragging(event, node.id)
    })

    nodesLayer.appendChild(element)
  })
}

function startDragging(event, nodeId) {
  const node = state.nodes.find((item) => item.id === nodeId)
  if (!node) {
    return
  }

  event.preventDefault()
  event.currentTarget.setPointerCapture?.(event.pointerId)
  state.graphRect = board.getBoundingClientRect()
  state.dragging = {
    nodeId,
    offsetX: event.clientX - state.graphRect.left - node.x,
    offsetY: event.clientY - state.graphRect.top - node.y,
  }
}

function onPointerMove(event) {
  if (!state.dragging) {
    return
  }

  const node = state.nodes.find((item) => item.id === state.dragging.nodeId)
  if (!node) {
    return
  }

  const maxX = board.clientWidth - node.width
  const maxY = board.clientHeight - node.height
  node.x = clamp(event.clientX - state.graphRect.left - state.dragging.offsetX, 0, maxX)
  node.y = clamp(event.clientY - state.graphRect.top - state.dragging.offsetY, 0, maxY)
  render()
  if (state.selectedNodeId === node.id) {
    updateActionStatus(`\u6b63\u5728\u79fb\u52d5\uff1a${node.label}`)
  }
}

function stopDragging() {
  if (!state.dragging) {
    return
  }

  const node = state.nodes.find((item) => item.id === state.dragging.nodeId)
  if (node) {
    updateActionStatus(`\u5df2\u79fb\u52d5\uff1a${node.label}`)
  }

  state.dragging = null
}

function selectNode(nodeId) {
  state.selectedNodeId = nodeId
  const node = getSelectedNode()
  if (!node) {
    clearSelection()
    return
  }

  renderNodes()
  selectionHint.textContent = `\u5df2\u9078\u53d6\u7bc0\u9ede\uff1a${node.label}`
  updateSelectionBadge(`\u5df2\u9078\u53d6\u7bc0\u9ede\uff1a${node.label}`)
  updateActionStatus(`\u76ee\u524d\u9078\u53d6\uff1a${node.label}`)
  nodeLabelInput.disabled = false
  nodeDescriptionInput.disabled = false
  removeNodeButton.disabled = node.role === 'effect'
  nodeLabelInput.value = node.label
  nodeDescriptionInput.value = node.description
}

function removeSelectedNode() {
  const node = getSelectedNode()
  if (!node) {
    clearSelection()
    return
  }

  if (node.role === 'effect') {
    updateActionStatus(TEXT.keepEffect)
    return
  }

  state.nodes = state.nodes.filter((item) => item.id !== node.id)
  state.causeCount = state.nodes.filter((item) => item.role !== 'effect').length
  render()
  clearSelection()
  updateActionStatus(`\u5df2\u79fb\u9664\uff1a${node.label}`)
}

function clearSelection() {
  state.selectedNodeId = null
  renderNodes()
  selectionHint.textContent = TEXT.selectHint
  updateSelectionBadge(TEXT.defaultBadge)
  updateActionStatus(TEXT.defaultStatus)
  nodeLabelInput.disabled = true
  nodeDescriptionInput.disabled = true
  removeNodeButton.disabled = true
  nodeLabelInput.value = ''
  nodeDescriptionInput.value = ''
}

function getSelectedNode() {
  return state.nodes.find((node) => node.id === state.selectedNodeId) || null
}

function updateSelectionBadge(text) {
  if (selectionBadge) {
    selectionBadge.textContent = text
  }
}

function updateActionStatus(text) {
  if (actionStatus) {
    actionStatus.textContent = text
  }
}

function createLine(x1, y1, x2, y2, stroke, strokeWidth) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  line.setAttribute('x1', String(x1))
  line.setAttribute('y1', String(y1))
  line.setAttribute('x2', String(x2))
  line.setAttribute('y2', String(y2))
  line.setAttribute('stroke', stroke)
  line.setAttribute('stroke-width', String(strokeWidth))
  return line
}

function createPath(d, stroke, strokeWidth) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d)
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', stroke)
  path.setAttribute('stroke-width', String(strokeWidth))
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  return path
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

initialize()
