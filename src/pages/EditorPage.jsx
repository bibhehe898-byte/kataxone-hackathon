import { CloudDownload, CloudUpload, Layers, MousePointer2, Plus, RotateCcw, Save, ScanEye, Trash2, Workflow, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import VsmNode from '../components/VsmNode'
import { useVsmStore } from '../store/useVsmStore'
import { useEnterpriseStore } from '../store/useEnterpriseStore'
import { computeTakt } from '../utils/metrics'
import './EditorPage.css'

// Типы узлов вынесены на уровень модуля: объект создаётся ровно один раз и не
// пересоздаётся при рендерах (React Flow ругается на новую ссылку nodeTypes).
const NODE_TYPES = { vsm: VsmNode }

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  background: 'rgba(5, 9, 14, 0.72)',
  backdropFilter: 'blur(3px)',
  zIndex: 100,
}

const cardStyle = {
  width: '100%',
  maxWidth: 360,
  padding: 22,
  borderRadius: 16,
  border: '1px solid var(--border-strong)',
  background: 'var(--surface)',
  boxShadow: '0 24px 70px rgba(0, 0, 0, 0.5)',
}

const fieldStyle = {
  display: 'block',
  marginBottom: 14,
}

const labelStyle = {
  display: 'block',
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-2)',
}

const inputStyle = {
  width: '100%',
  height: 40,
  padding: '0 12px',
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'rgba(255, 255, 255, 0.03)',
  color: 'var(--text)',
  font: 'inherit',
  fontSize: 14,
  outline: 'none',
}

const toValidNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function FlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
}) {
  const { setCenter } = useReactFlow()
  const selectedNodeId = useVsmStore((state) => state.selectedNodeId)
  const setSelectedNodeId = useVsmStore((state) => state.setSelectedNodeId)
  const [highlightedId, setHighlightedId] = useState(null)

  // Синхронизация «Тур -> Редактор»: центрируемся и подсвечиваем выбранный узел.
  useEffect(() => {
    if (!selectedNodeId) return
    const node = nodes.find((item) => item.id === selectedNodeId)
    if (node) {
      const x = node.position.x + (node.width ?? 0) / 2
      const y = node.position.y + (node.height ?? 0) / 2
      setCenter(x, y, { zoom: 1, duration: 800 })
      setHighlightedId(node.id)
    }
    setSelectedNodeId(null)
  }, [selectedNodeId, nodes, setCenter, setSelectedNodeId])

  // Автосброс подсветки, чтобы она не «залипала» после ручных действий.
  useEffect(() => {
    if (!highlightedId) return
    const timer = setTimeout(() => setHighlightedId(null), 2500)
    return () => clearTimeout(timer)
  }, [highlightedId])

  const displayNodes = useMemo(() => {
    if (!highlightedId) return nodes
    return nodes.map((node) =>
      node.id === highlightedId ? { ...node, selected: true } : node,
    )
  }, [nodes, highlightedId])

  const handleNodeClick = (event, node) => {
    setHighlightedId(null)
    const x = node.position.x + (node.width ?? 0) / 2
    const y = node.position.y + (node.height ?? 0) / 2
    setCenter(x, y, { zoom: 1, duration: 800 })
    onNodeClick(node)
  }

  return (
    <div className="editor-canvas">
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.22, minZoom: 0.25, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.8}
        deleteKeyCode={['Backspace', 'Delete']}
        className="vsm-flow"
      >
        <Background variant="dots" gap={22} size={1.4} color="rgba(148, 178, 204, 0.2)" />
        <MiniMap
          pannable
          zoomable
          maskColor="rgba(5, 9, 14, 0.72)"
          nodeColor={() => '#38bdf8'}
          nodeStrokeWidth={0}
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

export default function EditorPage() {
  const navigate = useNavigate()
  const workshops = useVsmStore((state) => state.workshops)
  const activeWorkshopId = useVsmStore((state) => state.activeWorkshopId)
  const setActiveWorkshop = useVsmStore((state) => state.setActiveWorkshop)
  const addWorkshop = useVsmStore((state) => state.addWorkshop)
  const deleteWorkshop = useVsmStore((state) => state.deleteWorkshop)
  const onNodesChange = useVsmStore((state) => state.onNodesChange)
  const onEdgesChange = useVsmStore((state) => state.onEdgesChange)
  const addStep = useVsmStore((state) => state.addStep)
  const resetFlow = useVsmStore((state) => state.resetFlow)
  const onConnect = useVsmStore((state) => state.onConnect)
  const updateNode = useVsmStore((state) => state.updateNode)
  const setSelectedNodeId = useVsmStore((state) => state.setSelectedNodeId)
  const saveFlowToServer = useVsmStore((state) => state.saveFlowToServer)
  const loadFlowFromServer = useVsmStore((state) => state.loadFlowFromServer)

  const [editing, setEditing] = useState(null)
  const [workshopModal, setWorkshopModal] = useState(false)
  const [workshopName, setWorkshopName] = useState('')

  const activeWorkshop =
    workshops.find((workshop) => workshop.id === activeWorkshopId) ?? workshops[0] ?? null
  const nodes = activeWorkshop?.nodes ?? []
  const edges = activeWorkshop?.edges ?? []

  const activeEnterprise = useEnterpriseStore(
    (state) => state.enterprises.find((e) => e.id === state.activeEnterpriseId) ?? null,
  )
  const editorTakt = computeTakt(activeEnterprise ?? { shift_duration_sec: 1200, target_output: 10 })

  const handleSelectWorkshop = (id) => {
    if (!id) return
    setEditing(null)
    setActiveWorkshop(id)
  }

  const openAddWorkshop = () => {
    setEditing(null)
    setWorkshopName('')
    setWorkshopModal(true)
  }

  const submitWorkshop = (event) => {
    event.preventDefault()
    // addWorkshop сам подставит имя по умолчанию, если поле пустое.
    addWorkshop(workshopName)
    setWorkshopModal(false)
    setWorkshopName('')
  }

  const handleSaveToServer = async () => {
    try {
      await saveFlowToServer()
      window.alert('Цеха сохранены на сервер')
    } catch (error) {
      console.error('Не удалось сохранить цеха на сервер', error)
      window.alert('Не удалось сохранить цеха на сервер')
    }
  }

  const handleLoadFromServer = async () => {
    try {
      await loadFlowFromServer()
    } catch (error) {
      console.error('Не удалось загрузить цеха с сервера', error)
      window.alert('Не удалось загрузить цеха с сервера')
    }
  }

  const handleResetFlow = () => {
    const confirmed = window.confirm(
      'Вы уверены, что хотите сбросить этот цех? Все добавленные этапы будут удалены.',
    )
    if (!confirmed) return
    resetFlow()
  }

  const handleDeleteWorkshop = () => {
    if (workshops.length <= 1) return
    const confirmed = window.confirm('Удалить этот цех?')
    if (!confirmed) return
    deleteWorkshop(activeWorkshopId)
  }

  const handleNodeClick = (node) => {
    setEditing({
      id: node.id,
      label: node.data.label ?? '',
      cycleTime: node.data.cycleTime ?? 0,
      load: node.data.load ?? 0,
      cost: node.data.cost ?? 0,
    })
  }

  const handleSave = (event) => {
    event.preventDefault()
    const cycleTime = Math.max(0, toValidNumber(editing.cycleTime))
    const load = Math.max(0, toValidNumber(editing.load))
    updateNode(editing.id, {
      label: editing.label,
      cycleTime,
      load,
      cost: Math.max(0, toValidNumber(editing.cost)),
      bottleneck: false,
    })
    // Обратная синхронизация: граф -> предприятие -> 3D-тур.
    // Узлы предприятия имеют id `n-<id>`, поэтому снимаем префикс.
    const enterpriseStore = useEnterpriseStore.getState()
    const ent = enterpriseStore.getActiveEnterprise()
    const rawId = String(editing.id).replace(/^n-/, '')
    if (ent && editing.id.startsWith('n-')) {
      const ws = ent.workshops.find((w) => w.nodes.some((n) => String(n.id) === rawId))
      if (ws) enterpriseStore.updateNodeCycle(ws.id, rawId, cycleTime)
    }
    setEditing(null)
  }

  const handleShowIn3D = () => {
    setSelectedNodeId(editing.id)
    useEnterpriseStore.getState().setTourFocusNodeId(String(editing.id).replace(/^n-/, ''))
    setEditing(null)
    navigate('/tour')
  }

  return (
    <ReactFlowProvider key={activeWorkshop?.id ?? 'empty'}>
      <div className="page editor-page">
        <header className="page-header">
          <div>
            <span className="page-eyebrow">
              <Workflow size={14} aria-hidden="true" />
              Редактор КПСЦ
            </span>
            <h1 className="page-title">Карта потока создания ценности</h1>
            <p className="page-subtitle">
              Динамический список цехов. Перетаскивайте этапы, добавляйте и удаляйте их —
              каждый цех хранит свою карту потока.
            </p>
          </div>

          <div className="page-actions">
            <div className="segmented" role="tablist" aria-label="Цеха">
              {workshops.map((workshop, index) => (
                <button
                  key={workshop.id || index}
                  type="button"
                  role="tab"
                  className={workshop.id === activeWorkshopId ? 'is-active' : ''}
                  onClick={() => handleSelectWorkshop(workshop.id)}
                  aria-selected={workshop.id === activeWorkshopId}
                >
                  {workshop.name || `Цех ${index + 1}`}
                </button>
              ))}
            </div>
            <button type="button" className="btn" onClick={openAddWorkshop}>
              <Plus size={16} aria-hidden="true" />
              Добавить цех
            </button>
            <button type="button" className="btn" onClick={handleSaveToServer}>
              <CloudUpload size={16} aria-hidden="true" />
              Сохранить на сервер
            </button>
            <button type="button" className="btn" onClick={handleLoadFromServer}>
              <CloudDownload size={16} aria-hidden="true" />
              Загрузить с сервера
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleDeleteWorkshop}
              disabled={workshops.length <= 1}
            >
              <Trash2 size={15} aria-hidden="true" />
              Удалить цех
            </button>
            <button type="button" className="btn" onClick={handleResetFlow}>
              <RotateCcw size={15} aria-hidden="true" />
              Сбросить
            </button>
            <button type="button" className="btn btn--primary" onClick={addStep} disabled={!activeWorkshop}>
              <Plus size={16} aria-hidden="true" />
              Добавить этап
            </button>
          </div>
        </header>

        <div className="editor-meta" aria-live="polite">
          <span className="editor-chip">
            <span className="editor-chip__dot" style={{ background: 'var(--accent)' }} aria-hidden="true" />
            {activeWorkshop?.name || 'Цех'}
          </span>
          <span className="editor-chip">
            <Layers size={13} aria-hidden="true" />
            {nodes.length} этапов
          </span>
          <span className="editor-chip">
            <Workflow size={13} aria-hidden="true" />
            {edges.length} связей
          </span>
          <span className="editor-hint">
            <MousePointer2 size={13} aria-hidden="true" />
            Перетаскивайте этапы, добавляйте и удаляйте их. Delete — удалить выбранное.
          </span>
        </div>

        {!activeWorkshop && (
          <p className="ent-muted" style={{ padding: 24 }}>
            Нет цехов. Создайте цех кнопкой «Добавить цех» или выберите предприятие на Дашборде.
          </p>
        )}
        {activeWorkshop && nodes.length === 0 && (
          <p className="ent-muted" style={{ padding: '0 24px' }}>В цехе нет этапов — нажмите «Добавить этап».</p>
        )}
        <FlowCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
        />

        {workshopModal && (
          <div style={overlayStyle} onClick={() => setWorkshopModal(false)}>
            <form style={cardStyle} onClick={(event) => event.stopPropagation()} onSubmit={submitWorkshop}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 16,
                }}
              >
                <h2 style={{ fontSize: 17, fontWeight: 650 }}>Новый цех</h2>
                <button
                  type="button"
                  onClick={() => setWorkshopModal(false)}
                  aria-label="Закрыть"
                  style={{
                    display: 'inline-flex',
                    padding: 4,
                    border: 0,
                    borderRadius: 8,
                    background: 'transparent',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>

              <label style={fieldStyle}>
                <span style={labelStyle}>Название цеха</span>
                <input
                  type="text"
                  autoFocus
                  value={workshopName}
                  onChange={(event) => setWorkshopName(event.target.value)}
                  placeholder="Например: Цех 3"
                  style={inputStyle}
                />
              </label>

              <button
                type="submit"
                className="btn btn--primary"
                style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
              >
                <Plus size={15} aria-hidden="true" />
                Создать цех
              </button>
            </form>
          </div>
        )}

        {editing && (
          <div style={overlayStyle} onClick={() => setEditing(null)}>
            <form style={cardStyle} onClick={(event) => event.stopPropagation()} onSubmit={handleSave}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 16,
                }}
              >
                <h2 style={{ fontSize: 17, fontWeight: 650 }}>Редактировать этап</h2>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  aria-label="Закрыть"
                  style={{
                    display: 'inline-flex',
                    padding: 4,
                    border: 0,
                    borderRadius: 8,
                    background: 'transparent',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>

              <label style={fieldStyle}>
                <span style={labelStyle}>Название</span>
                <input
                  type="text"
                  value={editing.label}
                  onChange={(event) => setEditing((prev) => ({ ...prev, label: event.target.value }))}
                  style={inputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={labelStyle}>Время цикла, с</span>
                <input
                  type="number"
                  min="0"
                  value={editing.cycleTime}
                  onChange={(event) => {
                    const cycleTime = event.target.value
                    const numCycleTime = Math.max(0, toValidNumber(cycleTime))
                    const load = editorTakt ? Math.round((numCycleTime / editorTakt) * 1000) / 10 : 0
                    setEditing((prev) => ({ ...prev, cycleTime, load }))
                  }}
                  style={inputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={labelStyle}>Загрузка, %</span>
                <input
                  type="number"
                  min="0"
                  value={editing.load}
                  onChange={(event) => {
                    const load = event.target.value
                    const numLoad = Math.max(0, toValidNumber(load))
                    const cycleTime = editorTakt ? Math.round((numLoad / 100) * editorTakt) : 0
                    setEditing((prev) => ({ ...prev, load, cycleTime }))
                  }}
                  style={inputStyle}
                />
              </label>

              <label style={fieldStyle}>
                <span style={labelStyle}>Стоимость, ₽</span>
                <input
                  type="number"
                  min="0"
                  value={editing.cost}
                  onChange={(event) => setEditing((prev) => ({ ...prev, cost: event.target.value }))}
                  style={inputStyle}
                />
              </label>

              <button
                type="button"
                className="btn"
                style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
                onClick={handleShowIn3D}
              >
                <ScanEye size={15} aria-hidden="true" />
                Показать в 3D
              </button>

              <button
                type="submit"
                className="btn btn--primary"
                style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
              >
                <Save size={15} aria-hidden="true" />
                Сохранить
              </button>
            </form>
          </div>
        )}
      </div>
    </ReactFlowProvider>
  )
}
