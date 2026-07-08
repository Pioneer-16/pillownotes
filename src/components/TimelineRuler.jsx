import React, { memo, useState, useCallback, useRef } from 'react';

const RULER_HEIGHT = 56;

const TimelineRuler = memo(({ timelines, onUpdateTimeline, onDeleteTimeline, viewportX = 0, zoom = 1 }) => {
  const rulerRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartMarkerX, setDragStartMarkerX] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({ title: '', time: '', description: '' });

  // 标尺刻度 — 根据缩放级别自适应
  const getTickInterval = () => {
    if (zoom >= 2) return 20;
    if (zoom >= 1) return 40;
    if (zoom >= 0.5) return 80;
    return 160;
  };

  const tickInterval = getTickInterval();

  // 渲染刻度线
  const renderTicks = () => {
    const ticks = [];
    const width = window.innerWidth || 2000;
    const offsetX = (viewportX * zoom) % tickInterval;
    for (let i = -1; i < width / tickInterval + 2; i++) {
      const x = i * tickInterval - offsetX;
      const isMajor = Math.round((i * tickInterval - (viewportX * zoom % tickInterval)) / tickInterval) % 5 === 0;
      ticks.push(
        <div
          key={i}
          className={`ruler-tick ${isMajor ? 'ruler-tick-major' : ''}`}
          style={{ left: `${x}px` }}
        />
      );
    }
    return ticks;
  };

  // 开始拖拽标记
  const handleMouseDown = useCallback((e, timeline) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingId(timeline.id);
    setDragStartX(e.clientX);
    setDragStartMarkerX(timeline.x);

    const handleMouseMove = (moveE) => {
      const dx = (moveE.clientX - dragStartX) / zoom;
      onUpdateTimeline(timeline.id, { x: dragStartMarkerX + dx });
    };

    const handleMouseUp = () => {
      setDraggingId(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [zoom, onUpdateTimeline]);

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
        const screenX = (tl.x - viewportX) * zoom;
        const isEditing = editingId === tl.id;
        const isDragging = draggingId === tl.id;

        return (
          <div
            key={tl.id}
            className={`ruler-marker ${isDragging ? 'ruler-marker-dragging' : ''}`}
            style={{
              left: `${screenX}px`,
              borderColor: tl.color || '#2d5a3d'
            }}
            onMouseDown={(e) => handleMouseDown(e, tl)}
            onDoubleClick={(e) => handleDoubleClick(e, tl)}
          >
            {/* 标记线 */}
            <div
              className="ruler-marker-line"
              style={{ backgroundColor: tl.color || '#2d5a3d' }}
            />

            {/* 标记内容 */}
            <div className="ruler-marker-content">
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
                </>
              )}
            </div>

            {/* 删除按钮 */}
            {!isEditing && (
              <button
                className="ruler-marker-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`删除时间线「${tl.title}」？`)) {
                    onDeleteTimeline(tl.id);
                  }
                }}
                title="删除"
              >
                ×
              </button>
            )}
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
