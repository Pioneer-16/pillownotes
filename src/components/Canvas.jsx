import React, { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  Panel,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import TimelineLine from './TimelineLine';
import CardNode from './CardNode';
import Toolbar from './Toolbar';
import Sidebar from './Sidebar';
import { useCanvas } from '../hooks/useCanvas';
import { useTemplates } from '../hooks/useTemplates';
import { exportToJSON } from '../utils/storage';

const nodeTypes = { timeline: TimelineLine, card: CardNode };

function CanvasInner() {
  const canvas = useCanvas();
  const { templates, getTemplate, getTemplateComponents, error: tplError } = useTemplates();

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedTimelineId, setSelectedTimelineId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 唯一状态源：从 canvas.state 转换为 React Flow 格式
  const nodes = useMemo(() => {
    const tlNodes = canvas.state.timelines.map(t => ({
      id: t.id,
      type: 'timeline',
      position: { x: t.x, y: 100 },
      data: { ...t },
      style: { width: '200px', height: '400px', overflow: 'visible' },
    }));
    const cardNodes = canvas.state.nodes.map(n => ({
      id: n.id,
      type: 'card',
      position: { x: n.x, y: n.y },
      data: {
        ...n,
        templateId: n.templateId,
        template: getTemplate(n.templateId),
        components: getTemplateComponents(n.templateId),
        content: n.data,
      },
    }));
    return [...tlNodes, ...cardNodes];
  }, [canvas.state.timelines, canvas.state.nodes, getTemplate, getTemplateComponents]);

  const edges = useMemo(() => {
    return canvas.state.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#2d5a3d', strokeWidth: 2 },
    }));
  }, [canvas.state.edges]);

  // onNodesChange 直接驱动 useCanvas
  const onNodesChange = useCallback((changes) => {
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        const isTimeline = canvas.state.timelines.some(t => t.id === change.id);
        if (isTimeline) {
          canvas.updateTimeline(change.id, { x: change.position.x });
        } else {
          canvas.updateCardNode(change.id, { x: change.position.x, y: change.position.y });
        }
      }
      if (change.type === 'remove') {
        const isTimeline = canvas.state.timelines.some(t => t.id === change.id);
        if (isTimeline) {
          canvas.deleteTimeline(change.id);
        } else {
          canvas.deleteCardNode(change.id);
        }
      }
    }
  }, [canvas]);

  // onEdgesChange 直接驱动 useCanvas
  const onEdgesChange = useCallback((changes) => {
    for (const change of changes) {
      if (change.type === 'remove') {
        canvas.deleteEdge(change.id);
      }
    }
  }, [canvas]);

  // onConnect 统一写入 useCanvas
  const onConnect = useCallback((params) => {
    canvas.addEdge(params.source, params.target);
  }, [canvas]);

  // 节点点击
  const onNodeClick = useCallback((_, node) => {
    if (node.type === 'timeline') {
      setSelectedTimelineId(node.id);
      setSelectedNodeId(null);
    } else {
      setSelectedNodeId(node.id);
      setSelectedTimelineId(null);
    }
    setSidebarOpen(true);
  }, []);

  // 画布点击取消选中
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedTimelineId(null);
    setSidebarOpen(false);
  }, []);

  // 获取选中对象
  const selectedNode = selectedNodeId
    ? nodes.find(n => n.id === selectedNodeId) || null
    : null;
  const selectedTimeline = selectedTimelineId
    ? canvas.state.timelines.find(t => t.id === selectedTimelineId) || null
    : null;

  // 工具栏操作
  const handleAddTimeline = useCallback(() => {
    const x = 200 + canvas.state.timelines.length * 250;
    canvas.addTimeline(x);
  }, [canvas]);

  const handleAddCard = useCallback(() => {
    const x = 300 + Math.random() * 200;
    const y = 200 + Math.random() * 200;
    canvas.addCardNode(x, y, 'default');
  }, [canvas]);

  const handleExport = useCallback(() => {
    exportToJSON(canvas.state);
  }, [canvas.state]);

  const handleImport = useCallback((newState) => {
    canvas.importState(newState);
  }, [canvas]);

  const handleReset = useCallback(() => {
    if (window.confirm('确定要清空画布吗？此操作不可撤销。')) {
      canvas.resetCanvas();
      setSelectedNodeId(null);
      setSelectedTimelineId(null);
      setSidebarOpen(false);
    }
  }, [canvas]);

  const handleUpdateNode = useCallback((id, updates) => {
    canvas.updateCardNode(id, updates);
  }, [canvas]);

  const handleUpdateTimeline = useCallback((id, updates) => {
    canvas.updateTimeline(id, updates);
  }, [canvas]);

  const handleDeleteNode = useCallback((id) => {
    canvas.deleteCardNode(id);
    setSelectedNodeId(null);
    setSidebarOpen(false);
  }, [canvas]);

  const handleDeleteTimeline = useCallback((id) => {
    canvas.deleteTimeline(id);
    setSelectedTimelineId(null);
    setSidebarOpen(false);
  }, [canvas]);

  const handleCloseSidebar = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedTimelineId(null);
    setSidebarOpen(false);
  }, []);

  return (
    <div className="canvas-container">
      <Toolbar
        onAddTimeline={handleAddTimeline}
        onAddCard={handleAddCard}
        onExport={handleExport}
        onImport={handleImport}
        onReset={handleReset}
        templateCount={templates.length}
      />

      {tplError && (
        <div className="tpl-error-banner">
          {tplError}
        </div>
      )}

      <div className="canvas-main">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[20, 20]}
          defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          minZoom={0.1}
          maxZoom={2}
          deleteKeyCode="Delete"
          selectionOnDrag
          panOnScroll
          zoomOnDoubleClick={false}
        >
          <Background
            variant="lines"
            gap={20}
            size={1}
            color="#c8c4bb"
            style={{ opacity: 0.5 }}
          />
          <Controls />
          <MiniMap
            nodeColor={(node) => node.type === 'timeline' ? '#2d5a3d' : '#c9a96e'}
            maskColor="rgba(0,0,0,0.08)"
          />
          <Panel position="bottom-center">
            <div className="canvas-hint">
              🎋 添加时间线（竹签） · 📝 添加卡片（肉） · 拖拽连接点连线 · 双击快速编辑 · Delete 删除
            </div>
          </Panel>
        </ReactFlow>

        {sidebarOpen && (
          <Sidebar
            selectedNode={selectedNode}
            selectedTimeline={selectedTimeline}
            templates={templates}
            onUpdateNode={handleUpdateNode}
            onUpdateTimeline={handleUpdateTimeline}
            onDeleteNode={handleDeleteNode}
            onDeleteTimeline={handleDeleteTimeline}
            onClose={handleCloseSidebar}
          />
        )}
      </div>
    </div>
  );
}

function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

export default Canvas;
