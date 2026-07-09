import React, { useCallback, useMemo, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  Panel,
  ViewportPortal,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import CardNode from './CardNode';
import RerouteNode from './RerouteNode';
import BlueprintEdge from './BlueprintEdge';
import Toolbar from './Toolbar';
import Sidebar from './Sidebar';
import TimelineRuler, { RULER_HEIGHT } from './TimelineRuler';
import { useCanvas } from '../hooks/useCanvas';
import { useTemplates } from '../hooks/useTemplates';
import { exportToJSON } from '../utils/storage';

const nodeTypes = { card: CardNode, reroute: RerouteNode };
const edgeTypes = { blueprint: BlueprintEdge };
const SNAP_THRESHOLD = 120;
const SNAP_Y = RULER_HEIGHT + 40;
const TIMELINE_BIND_RADIUS = 60;
const INITIAL_VIEWPORT = { x: 0, y: 0, zoom: 0.65 };
// 世界坐标的可视范围：上边缘卡到 y=0，其它方向不限
const TRANSLATE_EXTENT = [
  [-Infinity, 0],
  [Infinity, Infinity],
];

function CanvasInner() {
  const canvas = useCanvas();
  const { templates, getTemplate, getTemplateComponents, error: tplError } = useTemplates();
  const { getViewport } = useReactFlow();

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedTimelineId, setSelectedTimelineId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 节点回调（在这里定义，避免闭包/循环依赖）
  const handleUpdateNode = useCallback((id, updates) => {
    canvas.updateCardNode(id, updates);
  }, [canvas]);

  const handleDeleteNode = useCallback((id) => {
    canvas.deleteCardNode(id);
    setSelectedNodeId(null);
    setSidebarOpen(false);
  }, [canvas]);

  // 节点数据（卡片 + reroute 中断点）
  const nodes = useMemo(() => {
    return canvas.state.nodes.map(n => {
      if (n.isReroute) {
        return {
          id: n.id,
          type: 'reroute',
          position: { x: n.x, y: n.y },
          selected: n.id === selectedNodeId,
          data: {},
        };
      }
      const boundTl = n.timelineId
        ? canvas.state.timelines.find(t => t.id === n.timelineId)
        : null;
      // 判断卡片是否已被作为 source/target 连接（用于 UE pin 的填充态）
      const hasIncoming = canvas.state.edges.some(e => e.target === n.id);
      const hasOutgoing = canvas.state.edges.some(e => e.source === n.id);
      return {
        id: n.id,
        type: 'card',
        position: { x: n.x, y: n.y },
        selected: n.id === selectedNodeId,
        data: {
          ...n,
          templateId: n.templateId,
          template: getTemplate(n.templateId),
          components: getTemplateComponents(n.templateId),
          content: n.data,
          boundColor: boundTl?.color || null,
          boundTitle: boundTl?.title || null,
          hasIncoming,
          hasOutgoing,
          onUpdate: handleUpdateNode,
          onDelete: handleDeleteNode,
        },
      };
    });
  }, [canvas.state.nodes, canvas.state.timelines, canvas.state.edges, selectedNodeId, getTemplate, getTemplateComponents, handleUpdateNode, handleDeleteNode]);

  // 边数据
  const edges = useMemo(() => {
    return canvas.state.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'blueprint',
      animated: false,
      style: { stroke: '#2d5a3d', strokeWidth: 2 },
      data: {
        onSplit: (edgeId, x, y) => canvas.splitEdgeWithReroute(edgeId, x, y),
      },
    }));
  }, [canvas.state.edges, canvas.splitEdgeWithReroute]);

  const onMove = useCallback(() => {}, []);

  const onNodesChange = useCallback((changes) => {
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        const orig = canvas.state.nodes.find(n => n.id === change.id);
        if (!orig) continue;
        // reroute 节点：只更新坐标，不做吸附/绑定
        if (orig.isReroute) {
          canvas.updateCardNode(change.id, {
            x: change.position.x,
            y: Math.max(0, change.position.y),
          });
          continue;
        }
        let { x, y } = change.position;
        if (y < SNAP_THRESHOLD) {
          y = SNAP_Y;
        }
        const centerX = x + 110;
        let bindId = undefined;
        let snapX = x;
        let minDist = TIMELINE_BIND_RADIUS;
        for (const tl of canvas.state.timelines) {
          const dist = Math.abs(tl.x - centerX);
          if (dist < minDist) {
            minDist = dist;
            bindId = tl.id;
            snapX = tl.x - 110;
          }
        }
        const updates = { x: snapX, y };
        if (change.dragging === false) {
          updates.timelineId = bindId;
        }
        canvas.updateCardNode(change.id, updates);
      }
      if (change.type === 'remove') {
        const orig = canvas.state.nodes.find(n => n.id === change.id);
        if (orig?.isReroute) {
          canvas.deleteRerouteNode(change.id);
        } else {
          canvas.deleteCardNode(change.id);
          if (selectedNodeId === change.id) {
            setSelectedNodeId(null);
            setSidebarOpen(false);
          }
        }
      }
    }
  }, [canvas, selectedNodeId]);

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
    setSelectedTimelineId(null);
    setSidebarOpen(true);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedTimelineId(null);
    setSidebarOpen(false);
  }, []);

  const selectedNode = selectedNodeId
    ? nodes.find(n => n.id === selectedNodeId) || null
    : null;

  const selectedTimeline = selectedTimelineId
    ? canvas.state.timelines.find(t => t.id === selectedTimelineId) || null
    : null;

  const handleAddTimeline = useCallback(() => {
    const vp = getViewport();
    const worldX = (-vp.x + window.innerWidth / 2) / vp.zoom;
    const snapX = Math.round(worldX / 20) * 20;
    const newTl = canvas.addTimeline(snapX);
    setSelectedTimelineId(newTl.id);
    setSelectedNodeId(null);
    setSidebarOpen(true);
  }, [canvas, getViewport]);

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
    setSelectedNodeId(null);
    setSelectedTimelineId(null);
    setSidebarOpen(false);
  }, [canvas]);

  const handleReset = useCallback(() => {
    if (window.confirm('确定要清空画布吗？此操作不可撤销。')) {
      canvas.resetCanvas();
      setSelectedNodeId(null);
      setSelectedTimelineId(null);
      setSidebarOpen(false);
    }
  }, [canvas]);

  const handleUpdateTimeline = useCallback((id, updates) => {
    canvas.updateTimeline(id, updates);
  }, [canvas]);

  const handleMoveTimeline = useCallback((id, newX) => {
    canvas.moveTimelineWithBoundCards(id, newX);
  }, [canvas]);

  const handleSelectTimeline = useCallback((id) => {
    setSelectedTimelineId(id);
    setSelectedNodeId(null);
    setSidebarOpen(true);
  }, []);

  const handleDeleteTimeline = useCallback((id) => {
    canvas.deleteTimeline(id);
    if (selectedTimelineId === id) {
      setSelectedTimelineId(null);
      setSidebarOpen(false);
    }
  }, [canvas, selectedTimelineId]);

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
        {/* 水平标尺栏（横跨） */}
        <TimelineRuler
          timelines={canvas.state.timelines}
          onUpdateTimeline={handleUpdateTimeline}
          onMoveTimeline={handleMoveTimeline}
          onDeleteTimeline={handleDeleteTimeline}
          onSelectTimeline={handleSelectTimeline}
          selectedTimelineId={selectedTimelineId}
        />

        {/* 画布 + 侧栏（横向） */}
        <div className="canvas-body">
          <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
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
              edgeTypes={edgeTypes}
              fitView={false}
              snapToGrid
              snapGrid={[20, 20]}
              defaultViewport={INITIAL_VIEWPORT}
              translateExtent={TRANSLATE_EXTENT}
              minZoom={0.1}
              maxZoom={3}
              deleteKeyCode="Delete"
              selectionOnDrag
              panOnScroll
              zoomOnDoubleClick={false}
            >
              {/* 双层网格：细网格 + 粗辅助线 */}
              <Background
                id="grid-fine"
                variant="lines"
                gap={20}
                lineWidth={1}
                color="#e6e0d3"
              />
              <Background
                id="grid-coarse"
                variant="lines"
                gap={100}
                lineWidth={1}
                color="#d4cdbb"
              />

              {/* 时间线贯穿竖线（世界坐标，随视口平移缩放） */}
              <ViewportPortal>
                {/* 原点参考线 x=0 */}
                <div
                  className="world-origin-line"
                  style={{ transform: 'translate(0px, -10000px)' }}
                  aria-hidden="true"
                />
                {canvas.state.timelines.map(tl => (
                  <div
                    key={`vline-${tl.id}`}
                    className={`timeline-vline${tl.id === selectedTimelineId ? ' timeline-vline-selected' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectTimeline(tl.id);
                    }}
                    style={{
                      transform: `translate(${tl.x}px, -10000px)`,
                      borderLeftColor: tl.color || '#2d5a3d',
                    }}
                  />
                ))}
              </ViewportPortal>
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
