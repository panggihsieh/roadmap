const graphContainer = document.getElementById('graph')
const addCauseButton = document.getElementById('addCauseButton')
const selectionHint = document.getElementById('selectionHint')
const nodeLabelInput = document.getElementById('nodeLabel')
const nodeDescriptionInput = document.getElementById('nodeDescription')

const TEXT = {
  defaultTheme: '\u6838\u5fc3\u4e3b\u984c',
  defaultThemeDescription: '\u9ede\u9078\u9019\u500b\u4e3b\u984c\u7bc0\u9ede\u5f8c\uff0c\u53ef\u5728\u53f3\u5074\u8f38\u5165\u66f4\u5b8c\u6574\u7684\u8aaa\u660e\u3002',
  addCause: '\u56e0\u679c',
  addCauseDescription: '\u65b0\u7684\u56e0\u679c\u63cf\u8ff0',
  unnamed: '\u672a\u547d\u540d',
  selectHint: '\u8acb\u5148\u9ede\u9078\u5716\u4e0a\u7684\u7bc0\u9ede\u3002',
  selectedPrefix: '\u5df2\u9078\u53d6\u7bc0\u9ede\uff1a',
}

const fishboneState = {
  graph: null,
  selectedNode: null,
  causeCount: 0,
  spineTarget: null,
}

function buildGraph() {
  const { Graph } = X6

  fishboneState.graph = new Graph({
    container: graphContainer,
    background: {
      color: 'transparent',
    },
    panning: true,
    mousewheel: {
      enabled: true,
      modifiers: ['ctrl', 'meta'],
      factor: 1.1,
      minScale: 0.7,
      maxScale: 1.5,
    },
    connecting: {
      allowBlank: false,
      allowLoop: false,
      allowNode: false,
      allowEdge: false,
      snap: true,
    },
    interacting(cellView) {
      const role = cellView.cell.getData()?.role
      if (role === 'anchor') {
        return false
      }

      return {
        edgeMovable: false,
      }
    },
  })

  drawSkeleton()
  bindEvents()
}

function createNode(config) {
  return fishboneState.graph.addNode({
    shape: 'rect',
    x: config.x,
    y: config.y,
    width: config.width || 160,
    height: config.height || 56,
    attrs: {
      body: {
        rx: 18,
        ry: 18,
        fill: config.fill || '#fff7ef',
        stroke: config.stroke || '#cf7a50',
        strokeWidth: 2,
      },
      label: {
        text: config.label,
        fill: '#2f241f',
        fontSize: 14,
        fontWeight: 700,
      },
    },
    data: {
      description: config.description || '',
      role: config.role || 'cause',
    },
  })
}

function connect(source, target, strokeWidth = 2) {
  fishboneState.graph.addEdge({
    source: { cell: source.id },
    target: { cell: target.id },
    attrs: {
      line: {
        stroke: '#7b6b63',
        strokeWidth,
        targetMarker: null,
      },
    },
    zIndex: 0,
  })
}

function drawSkeleton() {
  const spineStart = fishboneState.graph.addNode({
    shape: 'circle',
    x: 110,
    y: 300,
    width: 10,
    height: 10,
    attrs: {
      body: {
        fill: '#d46a3a',
        stroke: '#d46a3a',
      },
    },
    data: { role: 'anchor' },
  })

  const spineEnd = fishboneState.graph.addNode({
    shape: 'circle',
    x: 660,
    y: 300,
    width: 10,
    height: 10,
    attrs: {
      body: {
        fill: '#d46a3a',
        stroke: '#d46a3a',
      },
    },
    data: { role: 'anchor' },
  })

  fishboneState.spineTarget = spineEnd
  connect(spineStart, spineEnd, 4)

  const effectNode = createNode({
    x: 705,
    y: 260,
    width: 190,
    height: 82,
    label: TEXT.defaultTheme,
    description: TEXT.defaultThemeDescription,
    role: 'effect',
    fill: '#fff0e3',
    stroke: '#d46a3a',
  })

  connect(spineEnd, effectNode)

  const presets = [
    {
      label: '\u4eba\u54e1',
      description: '\u7bc4\u4f8b\uff1a\u8a13\u7df4\u4e0d\u8db3\u3001\u5354\u4f5c\u843d\u5dee',
      x: 190,
      y: 172,
    },
    {
      label: '\u6d41\u7a0b',
      description: '\u7bc4\u4f8b\uff1a\u6d41\u7a0b\u7e41\u7463\u3001\u4ea4\u63a5\u4e0d\u6e05',
      x: 312,
      y: 390,
    },
    {
      label: '\u5de5\u5177',
      description: '\u7bc4\u4f8b\uff1a\u7cfb\u7d71\u9650\u5236\u3001\u8cc7\u6599\u5206\u6563',
      x: 420,
      y: 172,
    },
    {
      label: '\u74b0\u5883',
      description: '\u7bc4\u4f8b\uff1a\u6642\u7a0b\u58d3\u529b\u3001\u5916\u90e8\u9650\u5236',
      x: 540,
      y: 390,
    },
  ]

  presets.forEach((item, index) => {
    const node = createNode({
      x: item.x,
      y: item.y,
      label: item.label,
      description: item.description,
      role: index % 2 === 0 ? 'cause-top' : 'cause-bottom',
    })

    fishboneState.causeCount += 1
    connect(node, fishboneState.spineTarget)
  })
}

function bindEvents() {
  fishboneState.graph.on('node:click', ({ node }) => {
    const role = node.getData()?.role
    if (role === 'anchor') {
      return
    }

    selectNode(node)
  })

  fishboneState.graph.on('blank:click', () => {
    clearSelection()
  })

  addCauseButton.addEventListener('click', () => {
    const index = fishboneState.causeCount
    const isTop = index % 2 === 0
    const node = createNode({
      x: 160 + (index * 90),
      y: isTop ? 150 : 410,
      label: `${TEXT.addCause} ${index + 1}`,
      description: TEXT.addCauseDescription,
      role: isTop ? 'cause-top' : 'cause-bottom',
    })

    fishboneState.causeCount += 1
    connect(node, fishboneState.spineTarget)
    selectNode(node)
  })

  nodeLabelInput.addEventListener('input', (event) => {
    if (!fishboneState.selectedNode) {
      return
    }

    fishboneState.selectedNode.attr('label/text', event.target.value || TEXT.unnamed)
  })

  nodeDescriptionInput.addEventListener('input', (event) => {
    if (!fishboneState.selectedNode) {
      return
    }

    const currentData = fishboneState.selectedNode.getData() || {}
    fishboneState.selectedNode.setData({
      ...currentData,
      description: event.target.value,
    })
  })
}

function selectNode(node) {
  fishboneState.selectedNode = node

  const data = node.getData() || {}
  selectionHint.textContent = `${TEXT.selectedPrefix}${node.attr('label/text')}`
  nodeLabelInput.disabled = false
  nodeDescriptionInput.disabled = false
  nodeLabelInput.value = node.attr('label/text') || ''
  nodeDescriptionInput.value = data.description || ''
}

function clearSelection() {
  fishboneState.selectedNode = null
  selectionHint.textContent = TEXT.selectHint
  nodeLabelInput.disabled = true
  nodeDescriptionInput.disabled = true
  nodeLabelInput.value = ''
  nodeDescriptionInput.value = ''
}

buildGraph()
