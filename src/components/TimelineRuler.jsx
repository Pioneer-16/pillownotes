import React, { memo, useState, useCallback, useRef } from 'react';
import { useStore } from '@xyflow/react';

const RULER_HEIGHT = 32;

const transformSelector = (s) => s.transform;

const TimelineRuler = memo(({
  timelines,
  onUpdateTimeline,
  onMoveTimeline,
  onDeleteTimeline,
  onSelectTimeline,
  selectedTimelineId,
}) => {
  // 直接订阅 xyflow store 的 transform，任何 pan/zoom 帧都会立刻触发重渲染
  const [viewportX, viewportY, zoom] = useStore(transformSelector);

  const rulerRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({ title: '', time: '', description: '' });

  // 与画布网格保持同一跨度：细 20 world / 粗 100 world
  // 缩得太小时，跳过密到看不清的细刻度
  const getTickSpacing = () => {
    if (zoom < 0.15) return { minor: 500, major: 2500 };
    if (zoom < 0.4) return { minor: 100, major: 500 };
    return { minor: 20, major: 100 };
  };

  const { minor: minorSpacing, major: majorSpacing } = getTickSpacing();

  // 渲染刻度线（世界坐标 → 屏幕：worldX * zoom + viewportX）
  const renderTicks = () => {
    const ticks = [];
    const width = window.innerWidth || 2000;
    // 屏幕左边缘对应的世界坐标 x
    const worldLeft = -viewportX / zoom;
    const worldRight = worldLeft + width / zoom;
    const firstIdx = Math.floor(worldLeft / minorSpacing) - 1;
    const lastIdx = Math.ceil(worldRight / minorSpacing) + 1;
    for (let idx = firstIdx; idx <= lastIdx; idx++) {
      const worldX = idx * minorSpacing;
      const screenX = worldX * zoom + viewportX;
      const isMajor = worldX % majorSpacing === 0;
      ticks.push(
        <div
          key={idx}
          className={`ruler-tick ${isMajor ? 'ruler-tick-major' : ''}`}
          style={{ left: `${screenX - 0.5}px` }}
        />
      );
    }
    return ticks;
  };

  // 开始拖拽标记
  const handleMouseDown = useCallback((e, timeline) => {
    e.stopPropagation();
    e.preventDefault();
    if (onSelectTimeline) onSelectTimeline(timeline.id);
    setDraggingId(timeline.id);

    const startClientX = e.clientX;
    const startMarkerX = timeline.x;
    const SNAP = 20;

    const handleMouseMove = (moveE) => {
      const dx = (moveE.clientX - startClientX) / zoom;
      const rawX = startMarkerX + dx;
      const snapX = Math.round(rawX / SNAP) * SNAP;   // 20px 网格吸附
      if (onMoveTimeline) {
        onMoveTimeline(timeline.id, snapX);
      } else {
        onUpdateTimeline(timeline.id, { x: snapX });
      }
    };

    const handleMouseUp = () => {
      setDraggingId(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [zoom, onUpdateTimeline, onMoveTimeline, onSelectTimeline]);

  // 双击编辑
  const handleDoubleClick = useCallback((e, timeline) => {
    e.stopPropagation();
    setEditingId(timeline.id);
    setEditData({
      title: timeline.title || '',
      time: timeline.time || '',
      description: timeline.description || ''
    });
  }, []);

  // 保存编辑
  const handleSave = useCallback(() => {
    if (editingId) {
      onUpdateTimeline(editingId, editData);
      setEditingId(null);
    }
  }, [editingId, editData, onUpdateTimeline]);

  // 键盘事件
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setEditingId(null);
    }
  }, [handleSave]);

  return (
    <div
      ref={rulerRef}
      className="timeline-ruler"
      style={{ height: `${RULER_HEIGHT}px` }}
    >
      {/* 刻度区域 */}
      <div className="ruler-ticks">
        {renderTicks()}
      </div>

      {/* 时间标记 */}
      {timelines.map(tl => {
        const screenX = tl.x * zoom + viewportX;
        const isEditing = editingId === tl.id;
        const isDragging = draggingId === tl.id;
        const isSelected = selectedTimelineId === tl.id;

        return (
          <div
            key={tl.id}
            className={`ruler-marker${isDragging ? ' ruler-marker-dragging' : ''}${isSelected ? ' ruler-marker-selected' : ''}`}
            style={{ left: `${screenX}px` }}
            onMouseDown={(e) => handleMouseDown(e, tl)}
            onDoubleClick={(e) => handleDoubleClick(e, tl)}
          >
            {/* 标尺内的短竖线段（宽度随 zoom 变化，视觉上和画布贯穿线一致） */}
            <div
              className="ruler-marker-stem"
              style={{
                background: tl.color || '#2d5a3d',
                width: `${2 * zoom}px`,
                left: `${-zoom}px`,
              }}
            />

            {/* 小旗子（悬浮在标尺上方，居中对齐时间线） */}
            <div
              className="ruler-marker-flag"
              style={{ borderColor: tl.color || '#2d5a3d' }}
            >
              {isEditing ? (
                <div className="ruler-marker-edit" onClick={e => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editData.title}
                    onChange={e => setEditData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="标题"
                    autoFocus
                    onKeyDown={handleKeyDown}
                  />
                  <input
                    type="text"
                    value={editData.time}
                    onChange={e => setEditData(prev => ({ ...prev, time: e.target.value }))}
                    placeholder="时间"
                    onKeyDown={handleKeyDown}
                  />
                  <textarea
                    value={editData.description}
                    onChange={e => setEditData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="描述"
                    rows="2"
                    onKeyDown={handleKeyDown}
                  />
                  <div className="ruler-marker-edit-btns">
                    <button onClick={handleSave}>保存</button>
                    <button onClick={() => setEditingId(null)}>取消</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="ruler-marker-title">{tl.title || '未命名'}</div>
                  {tl.time && <div className="ruler-marker-time">{tl.time}</div>}
                  <button
                    className="ruler-marker-delete"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`删除时间线「${tl.title || '未命名'}」？`)) {
                        onDeleteTimeline(tl.id);
                      }
                    }}
                    title="删除"
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}

      {/* 空提示 */}
      {timelines.length === 0 && (
        <div className="ruler-empty-hint">
          点击工具栏「添加时间线」创建时间标记
        </div>
      )}
    </div>
  );
});

TimelineRuler.displayName = 'TimelineRuler';

export { RULER_HEIGHT };
export default TimelineRuler;
