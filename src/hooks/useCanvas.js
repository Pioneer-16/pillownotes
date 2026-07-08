import { useState, useCallback, useEffect, useRef } from 'react';
import { generateId } from '../utils/id';
import { saveCanvasState, loadCanvasState } from '../utils/storage';

const DEFAULT_STATE = {
  timelines: [],
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 }
};

export function useCanvas() {
  const [state, setState] = useState(() => {
    const saved = loadCanvasState();
    return saved || DEFAULT_STATE;
  });

  // 防抖保存
  const saveTimerRef = useRef(null);
  useEffect(() => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveCanvasState(state);
    }, 500);
    return () => clearTimeout(saveTimerRef.current);
  }, [state]);

  // 添加时间线
  const addTimeline = useCallback((x = 200) => {
    const newTimeline = {
      id: generateId(),
      x,
      title: '新时间线',
      time: '',
      description: '',
      color: getRandomColor()
    };
    setState(prev => ({
      ...prev,
      timelines: [...prev.timelines, newTimeline]
    }));
    return newTimeline;
  }, []);

  // 更新时间线
  const updateTimeline = useCallback((id, updates) => {
    setState(prev => ({
      ...prev,
      timelines: prev.timelines.map(t =>
        t.id === id ? { ...t, ...updates } : t
      )
    }));
  }, []);

  // 删除时间线 + 清理关联节点和边
  const deleteTimeline = useCallback((id) => {
    setState(prev => {
      const orphanNodeIds = prev.nodes
        .filter(n => n.timelineId === id)
        .map(n => n.id);
      return {
        ...prev,
        timelines: prev.timelines.filter(t => t.id !== id),
        nodes: prev.nodes.filter(n => n.timelineId !== id),
        edges: prev.edges.filter(e =>
          !orphanNodeIds.includes(e.source) &&
          !orphanNodeIds.includes(e.target) &&
          e.source !== id &&
          e.target !== id
        )
      };
    });
  }, []);

  // 添加卡片节点
  const addCardNode = useCallback((x, y, templateId = 'default', timelineId = undefined) => {
    const newNode = {
      id: generateId(),
      x,
      y,
      timelineId,
      templateId,
      data: {}
    };
    setState(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));
    return newNode;
  }, []);

  // 更新卡片节点
  const updateCardNode = useCallback((id, updates) => {
    setState(prev => ({
      ...prev,
      nodes: prev.nodes.map(n =>
        n.id === id ? { ...n, ...updates } : n
      )
    }));
  }, []);

  // 删除卡片节点 + 清理关联边
  const deleteCardNode = useCallback((id) => {
    setState(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== id),
      edges: prev.edges.filter(e => e.source !== id && e.target !== id)
    }));
  }, []);

  // 添加连线
  const addEdge = useCallback((source, target, label = '') => {
    const newEdge = {
      id: generateId(),
      source,
      target,
      label
    };
    setState(prev => ({
      ...prev,
      edges: [...prev.edges, newEdge]
    }));
    return newEdge;
  }, []);

  // 删除连线
  const deleteEdge = useCallback((id) => {
    setState(prev => ({
      ...prev,
      edges: prev.edges.filter(e => e.id !== id)
    }));
  }, []);

  // 更新视口
  const updateViewport = useCallback((viewport) => {
    setState(prev => ({
      ...prev,
      viewport
    }));
  }, []);

  // 重置画布
  const resetCanvas = useCallback(() => {
    setState(DEFAULT_STATE);
  }, []);

  // 导入状态
  const importState = useCallback((newState) => {
    setState(newState);
  }, []);

  return {
    state,
    addTimeline,
    updateTimeline,
    deleteTimeline,
    addCardNode,
    updateCardNode,
    deleteCardNode,
    addEdge,
    deleteEdge,
    updateViewport,
    resetCanvas,
    importState
  };
}

function getRandomColor() {
  const colors = [
    '#2d5a3d', '#8b4513', '#c9a96e', '#4a8c6a',
    '#6b4423', '#3d7a5a', '#a0522d', '#556b2f',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}
