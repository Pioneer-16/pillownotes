import React, { useCallback, useMemo, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  Panel,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import CardNode from './CardNode';
import Toolbar from './Toolbar';
import Sidebar from './Sidebar';
import TimelineRuler, { RULER_HEIGHT } from './TimelineRuler';
import { useCanvas } from '../hooks/useCanvas';
import { useTemplates } from '../hooks/useTemplates';
import { exportToJSON } from '../utils/storage';

const nodeTypes = { card: CardNode };
const SNAP_THRESHOLD = 120; // 卡片 Y < 此值时吸附到标尺下方
const SNAP_Y = RULER_HEIGHT + 40; // 吸附后的 Y 坐标

function CanvasInner() {
  const canvas = useCanvas();
  const { templates, getTemplate, getTemplateComponents, error: tplError } = useTemplates();
  const { getViewport } = useReactFlow();

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

  // 节点数据（只有卡片，没有时间线节点）
  const nodes = useMemo(() => {
    return canvas.state.nodes.map(n => ({
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
  }, [canvas.state.nodes, getTemplate, getTemplateComponents]);

  // 边数据（贝塞尔曲线）
  const edges = useMemo(() => {
    return canvas.state.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'default', // 贝塞尔曲线
      animated: true,
      style: { stroke: '#2d5a3d', strokeWidth: 2 },
    }));
  }, [canvas.state.edges]);

  // 视口变化回调
  const onMove = useCallback((_, vp) => {
    setViewport(vp);
  }, []);

  // onNodesChange — 处理拖拽 + 吸附 + 删除
  const onNodesChange = useCallback((changes) => {
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        let { x, y } = change.position;
        // 吸附逻辑：卡片靠近标尺时自动吸附
        if (y < SNAP_THRESHOLD) {
          y = SNAP_Y;
        }
        canvas.updateCardNode(change.id, { x, y });
      }
      if (change.type === 'remove') {
        canvas.deleteCardNode(change.id);
      }
    }
  }, [canvas]);

  const onEdgesChange = useCallback((changes) => {
    for (const change of changes) {
      if (change.type === 'remove') {
        canvas.deleteEdge(change.id);
      }
    }
  }, [canvas]);

  const onConnect = useCallback((params) => {
    canvas.addEdge(params.source, params.target);
  }, [canvas]);

  const onNodeClick = useCallback((_, node) => {
    setSelectedNodeId(node.id);
    setSidebarOpen(true);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSidebarOpen(false);
  }, []);

  const selectedNode = selectedNodeId
    ? nodes.find(n => n.id === selectedNodeId) || null
    : null;

  // 工具栏操作
  const handleAddTimeline = useCallback(() => {
    const x = 300 + canvas.state.timelines.length * 200;
    canvas.addTimeline(x);
  }, [canvas]);

  const handleAddCard = useCallback(() => {
    const x = 200 + Math.random() * 400;
    const y = SNAP_Y + 50 + Math.random() * 200;
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
  }, [canvas]);

  const handleCloseSidebar = useCallback(() => {
    setSelectedNodeId(null);
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
        {/* 水平标尺栏 */}
        <TimelineRuler
          timelines={canvas.state.timelines}
          onUpdateTimeline={handleUpdateTimeline}
          onDeleteTimeline={handleDeleteTimeline}
          viewportX={viewport.x}
          zoom={viewport.zoom}
        />

        {/* React Flow 画布 */}
        <div style={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onMove={onMove}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[20, 20]}
            defaultViewport={{ x: 0, y: -RULER_HEIGHT, zoom: 1 }}
            minZoom={0.1}
            maxZoom={3}
            deleteKeyCode="Delete"
            selectionOnDrag
            panOnScroll
            zoomOnDoubleClick={false}
          >
            <Background
              variant="dots"
              gap={20}
              size={1}
              color="#c8c4bb"
              style={{ opacity: 0.4 }}
            />
            <Controls />
            <MiniMap
              nodeColor={() => '#c9a96e'}
              maskColor="rgba(0,0,0,0.08)"
            />
            <Panel position="bottom-center">
              <div className="canvas-hint">
                📜 标尺上拖拽时间标记 · 📝 卡片拖到顶部吸附 · 拖拽连接点画贝塞尔连线 · Delete 删除
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {sidebarOpen && (
          <Sidebar
            selectedNode={selectedNode}
            selectedTimeline={null}
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
