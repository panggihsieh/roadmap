const graphContainer = document.getElementById('graph')
const addCauseButton = document.getElementById('addCauseButton')
const selectionHint = document.getElementById('selectionHint')
const selectionBadge = document.getElementById('selectionBadge')
const actionStatus = document.getElementById('actionStatus')
const nodeLabelInput = document.getElementById('nodeLabel')
const nodeDescriptionInput = document.getElementById('nodeDescription')

const TEXT = {
  defaultTheme: '\u6838\u5fc3\u4e3b\u984c',
  defaultThemeDescription: '\u9ede\u9078\u9019\u500b\u4e3b\u984c\u7bc0\u9ede\u5f8c\uff0c\u53ef\u5728\u53f3\u5074\u8f38\u5165\u66f4\u5b8c\u6574\u7684\u8aaa\u660e\u3002',
  addCause: '\u56e0\u679c',
  addCauseDescription: '\u65b0\u7684\u56e0\u679c\u63cf\u8ff0',
  unnamed: '\u672a\u547d\u540d',
  selectHint: '\u8acb\u5148\u9ede\u9078\u5716\u4e0a\u7684\u7bc0\u9ede\u3002',
  defaultBadge: '\u62d6\u62c9\u7bc0\u9ede\u8abf\u6574\u4f4d\u7f6e\uff0c\u9ede\u9078\u7bc0\u9ede\u7de8\u8f2f\u5167\u5bb9',
  defaultStatus: '\u5c1a\u672a\u57f7\u884c\u65b0\u589e\u64cd\u4f5c',
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

const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
svg.classList.add('graph-svg')

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
  state.nodes = [
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

  state.causeCount = 4
  render()
  selectNode('effect')
  bindEvents()
}

function bindEvents() {
  addCauseButton.addEventListener('click', () => {
    const index = state.causeCount
    const slot = state.addSlots[index % state.addSlots.length]
    const newNode = makeNode({
      id: `cause-${index + 1}`,
      x: slot.x,
      y: slot.y,
      label: `${TEXT.addCause} ${index + 1}`,
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
  graphContainer.addEventListener('pointerleave', stopDragging)
  graphContainer.addEventListener('click', (event) => {
    if (event.target === graphContainer || event.target === board || event.target === svg || event.target === linesLayer) {
      clearSelection()
    }
  })

  window.addEventListener('resize', render)
}

function render() {
  renderLines()
  renderNodes()
}

function renderLines() {
  linesLayer.innerHTML = ''

  const spine = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  spine.setAttribute('x1', '120')
  spine.setAttribute('y1', '305')
  spine.setAttribute('x2', '670')
  spine.setAttribute('y2', '305')
  spine.setAttribute('stroke', '#2f241f')
  spine.setAttribute('stroke-width', '4')
  linesLayer.appendChild(spine)

  const effectNode = state.nodes.find((node) => node.role === 'effect')
  if (effectNode) {
    linesLayer.appendChild(createLine(670, 305, effectNode.x, effectNode.y + effectNode.height / 2, '#7b6b63', 2))
  }

  state.nodes
    .filter((node) => node.role !== 'effect')
    .forEach((node) => {
      const startX = node.x + node.width / 2
      const startY = node.role === 'cause-top' ? node.y + node.height : node.y
      linesLayer.appendChild(createLine(startX, startY, 670, 305, '#7b6b63', 2))
    })
}

function renderNodes() {
  nodesLayer.innerHTML = ''

  state.nodes.forEach((node) => {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = `fish-node ${state.selectedNodeId === node.id ? 'is-selected' : ''}`
    element.dataset.nodeId = node.id
    element.style.left = `${node.x}px`
    element.style.top = `${node.y}px`
    element.style.width = `${node.width}px`
    element.style.height = `${node.height}px`
    element.style.background = node.fill
    element.style.borderColor = node.stroke
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

  state.graphRect = graphContainer.getBoundingClientRect()
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

  const maxX = graphContainer.clientWidth - node.width
  const maxY = graphContainer.clientHeight - node.height
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
    return
  }

  renderNodes()
  selectionHint.textContent = `\u5df2\u9078\u53d6\u7bc0\u9ede\uff1a${node.label}`
  updateSelectionBadge(`\u5df2\u9078\u53d6\u7bc0\u9ede\uff1a${node.label}`)
  updateActionStatus(`\u76ee\u524d\u9078\u53d6\uff1a${node.label}`)
  nodeLabelInput.disabled = false
  nodeDescriptionInput.disabled = false
  nodeLabelInput.value = node.label
  nodeDescriptionInput.value = node.description
}

function clearSelection() {
  state.selectedNodeId = null
  renderNodes()
  selectionHint.textContent = TEXT.selectHint
  updateSelectionBadge(TEXT.defaultBadge)
  updateActionStatus(TEXT.defaultStatus)
  nodeLabelInput.disabled = true
  nodeDescriptionInput.disabled = true
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
