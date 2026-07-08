import React, { memo, useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';

const CardNode = memo(({ data, id, selected }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});

  const handleDoubleClick = useCallback((e) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditData(data.content || {});
  }, [data.content]);

  const handleSave = useCallback(() => {
    if (data.onUpdate) {
      data.onUpdate(id, { data: editData });
    }
    setIsEditing(false);
  }, [data.onUpdate, id, editData]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setIsEditing(false);
    }
  }, []);

  // 渲染展示内容
  const renderFields = () => {
    const content = data.content || {};
    const template = data.template;
    const components = data.components || [];

    if (!template || !template.fieldIds) {
      return (
        <div style={{ fontSize: '14px', color: '#4a4a48' }}>
          {content.content || '双击编辑卡片内容'}
        </div>
      );
    }

    return template.fieldIds.map(fieldId => {
      const comp = components.find(c => c.id === fieldId);
      if (!comp) return null;
      const value = content[fieldId];
      if (!value && fieldId !== 'content') return null;

      if (fieldId === 'content') {
        return (
          <div key={fieldId} style={{
            fontSize: '14px', color: '#1a1a18',
            fontFamily: '"Noto Serif SC", serif',
            lineHeight: 1.6, marginBottom: '8px'
          }}>
            {value || '双击编辑卡片内容'}
          </div>
        );
      }
      if (fieldId === 'quote') {
        return (
          <div key={fieldId} style={{
            fontSize: '12px', color: '#6b7280', fontStyle: 'italic',
            borderLeft: '2px solid #d1d5db', paddingLeft: '8px',
            marginTop: '8px', marginBottom: '4px'
          }}>
            {value}
          </div>
        );
      }
      if (fieldId === 'rating') {
        return (
          <div key={fieldId} style={{ display: 'flex', gap: '2px', marginTop: '4px' }}>
            {[1, 2, 3, 4, 5].map(star => (
              <span key={star} style={{
                fontSize: '14px',
                color: star <= value ? '#f59e0b' : '#d1d5db'
              }}>★</span>
            ))}
          </div>
        );
      }
      return (
        <div key={fieldId} style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>
          <span style={{ fontWeight: 500 }}>{comp.label}:</span> {value}
        </div>
      );
    });
  };

  // 渲染编辑表单
  const renderEditForm = () => {
    const content = data.content || {};
    const template = data.template;
    const components = data.components || [];

    if (!template || !template.fieldIds) {
      return (
        <textarea
          value={editData.content || ''}
          onChange={(e) => setEditData(prev => ({ ...prev, content: e.target.value }))}
          placeholder="卡片内容..."
          rows="3"
          onKeyDown={handleKeyDown}
          autoFocus
          style={{
            width: '100%', padding: '6px 8px', fontSize: '13px',
            border: '1px solid #d1d5db', borderRadius: '4px',
            outline: 'none', resize: 'none', fontFamily: 'inherit'
          }}
        />
      );
    }

    return template.fieldIds.map(fieldId => {
      const comp = components.find(c => c.id === fieldId);
      if (!comp) return null;

      const value = editData[fieldId] || '';

      return (
        <div key={fieldId} style={{ marginBottom: '8px' }}>
          <label style={{
            display: 'block', fontSize: '11px', fontWeight: 500,
            color: '#6b7280', marginBottom: '3px'
          }}>
            {comp.label}
          </label>
          {comp.type === 'textarea' ? (
            <textarea
              value={value}
              onChange={(e) => setEditData(prev => ({ ...prev, [fieldId]: e.target.value }))}
              placeholder={comp.placeholder}
              rows="2"
              onKeyDown={handleKeyDown}
              style={{
                width: '100%', padding: '5px 7px', fontSize: '12px',
                border: '1px solid #d1d5db', borderRadius: '4px',
                outline: 'none', resize: 'none', fontFamily: 'inherit'
              }}
            />
          ) : comp.type === 'rating' ? (
            <div style={{ display: 'flex', gap: '4px' }}>
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => setEditData(prev => ({ ...prev, [fieldId]: star }))}
                  style={{
                    background: 'none', border: 'none', fontSize: '18px', padding: 0,
                    color: star <= value ? '#f59e0b' : '#d1d5db', cursor: 'pointer'
                  }}
                >★</button>
              ))}
            </div>
          ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => setEditData(prev => ({ ...prev, [fieldId]: e.target.value }))}
              placeholder={comp.placeholder}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%', padding: '5px 7px', fontSize: '12px',
                border: '1px solid #d1d5db', borderRadius: '4px', outline: 'none'
              }}
            />
          )}
        </div>
      );
    });
  };

  return (
    <div
      className={`huajian-card${selected ? ' selected' : ''}`}
      style={{ width: '220px', minHeight: '80px', padding: '14px 16px', position: 'relative' }}
      onDoubleClick={handleDoubleClick}
    >
      <Handle
        type="target"
        id="left"
        position={Position.Left}
        style={{
          background: '#2d5a3d',
          width: '10px', height: '10px',
          border: '2.5px solid white',
          left: '-5px'
        }}
      />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {isEditing ? (
          <div>
            {renderEditForm()}
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              <button
                onClick={handleSave}
                style={{
                  flex: 1, padding: '5px', fontSize: '12px',
                  background: '#2d5a3d', color: 'white', border: 'none',
                  borderRadius: '4px', cursor: 'pointer'
                }}
              >
                保存
              </button>
              <button
                onClick={() => setIsEditing(false)}
                style={{
                  flex: 1, padding: '5px', fontSize: '12px',
                  background: '#d1d5db', color: '#374151', border: 'none',
                  borderRadius: '4px', cursor: 'pointer'
                }}
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          renderFields()
        )}
      </div>

      <Handle
        type="source"
        id="right"
        position={Position.Right}
        style={{
          background: '#2d5a3d',
          width: '10px', height: '10px',
          border: '2.5px solid white',
          right: '-5px'
        }}
      />

      {selected && data.onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); data.onDelete(id); }}
          style={{
            position: 'absolute', top: '6px', right: '6px',
            width: '20px', height: '20px', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', color: '#9ca3af',
            cursor: 'pointer', borderRadius: '50%', fontSize: '14px',
            lineHeight: 1
          }}
          title="删除节点"
        >
          ×
        </button>
      )}
    </div>
  );
});

CardNode.displayName = 'CardNode';

export default CardNode;
