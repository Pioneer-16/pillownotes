import React, { memo, useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';

const TimelineLine = memo(({ data, id }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    title: '',
    time: '',
    description: ''
  });

  const handleDoubleClick = useCallback((e) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditData({
      title: data.title || '',
      time: data.time || '',
      description: data.description || ''
    });
  }, [data.title, data.time, data.description]);

  const handleSave = useCallback(() => {
    if (data.onUpdate) {
      data.onUpdate(id, editData);
    }
    setIsEditing(false);
  }, [data.onUpdate, id, editData]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
    }
  }, [handleSave]);

  return (
    <div
      style={{
        width: '200px',
        minHeight: '400px',
        position: 'relative'
      }}
    >
      {/* 垂直时间线（CSS 伪元素绘制顶部圆点） */}
      <div
        className="timeline-line"
        style={{ backgroundColor: data.color || '#2d5a3d' }}
      />

      {/* 时间线信息卡片 */}
      <div
        className="huajian-card"
        style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '160px',
          padding: '12px',
          zIndex: 10
        }}
        onDoubleClick={handleDoubleClick}
      >
        {isEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              type="text"
              value={editData.title}
              onChange={(e) => setEditData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="时间线标题"
              style={{
                width: '100%', padding: '4px 6px', fontSize: '13px',
                border: '1px solid #d1d5db', borderRadius: '4px', outline: 'none'
              }}
              autoFocus
            />
            <input
              type="text"
              value={editData.time}
              onChange={(e) => setEditData(prev => ({ ...prev, time: e.target.value }))}
              placeholder="时间（如：公元前221年）"
              style={{
                width: '100%', padding: '4px 6px', fontSize: '12px',
                border: '1px solid #d1d5db', borderRadius: '4px', outline: 'none'
              }}
            />
            <textarea
              value={editData.description}
              onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="详情描述..."
              rows="2"
              onKeyDown={handleKeyDown}
              style={{
                width: '100%', padding: '4px 6px', fontSize: '12px',
                border: '1px solid #d1d5db', borderRadius: '4px', outline: 'none',
                resize: 'none', fontFamily: 'inherit'
              }}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={handleSave}
                style={{
                  flex: 1, padding: '4px', fontSize: '12px',
                  background: '#2d5a3d', color: 'white', border: 'none',
                  borderRadius: '4px', cursor: 'pointer'
                }}
              >
                保存
              </button>
              <button
                onClick={() => setIsEditing(false)}
                style={{
                  flex: 1, padding: '4px', fontSize: '12px',
                  background: '#d1d5db', color: '#374151', border: 'none',
                  borderRadius: '4px', cursor: 'pointer'
                }}
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{
              fontFamily: '"Noto Serif SC", serif',
              fontWeight: 600, fontSize: '14px',
              color: '#1a1a18', marginBottom: '4px'
            }}>
              {data.title || '双击编辑'}
            </div>
            {data.time && (
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                {data.time}
              </div>
            )}
            {data.description && (
              <div style={{
                fontSize: '12px', color: '#6b7280',
                display: '-webkit-box', WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical', overflow: 'hidden'
              }}>
                {data.description}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 连接点 */}
      <Handle
        type="target"
        id="right"
        position={Position.Right}
        style={{
          background: data.color || '#2d5a3d',
          width: '10px', height: '10px',
          border: '2.5px solid white',
          right: '-5px'
        }}
      />
      <Handle
        type="source"
        id="left"
        position={Position.Left}
        style={{
          background: data.color || '#2d5a3d',
          width: '10px', height: '10px',
          border: '2.5px solid white',
          left: '-5px'
        }}
      />
    </div>
  );
});

TimelineLine.displayName = 'TimelineLine';

export default TimelineLine;
