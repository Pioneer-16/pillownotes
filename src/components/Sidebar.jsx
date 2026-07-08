import React, { memo, useState, useCallback } from 'react';

const Sidebar = memo(({ 
  selectedNode, 
  selectedTimeline,
  templates,
  onUpdateNode,
  onUpdateTimeline,
  onDeleteNode,
  onDeleteTimeline,
  onClose 
}) => {
  const [activeTab, setActiveTab] = useState('properties');

  // 编辑节点数据
  const handleNodeFieldChange = useCallback((fieldId, value) => {
    if (!selectedNode) return;
    const newContent = { ...selectedNode.data.content, [fieldId]: value };
    onUpdateNode(selectedNode.id, { data: newContent });
  }, [selectedNode, onUpdateNode]);

  // 编辑时间线数据
  const handleTimelineFieldChange = useCallback((field, value) => {
    if (!selectedTimeline) return;
    onUpdateTimeline(selectedTimeline.id, { [field]: value });
  }, [selectedTimeline, onUpdateTimeline]);

  // 渲染节点属性面板
  const renderNodeProperties = () => {
    if (!selectedNode) return null;

    const template = selectedNode.data.template;
    const components = selectedNode.data.components || [];

    return (
      <div className="sidebar-section">
        <div className="sidebar-header">
          <h3>卡片属性</h3>
          <button 
            className="sidebar-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* 模板选择 */}
        <div className="sidebar-field">
          <label>卡片模板</label>
          <select
            value={selectedNode.data.templateId || 'default'}
            onChange={(e) => {
              const templateId = e.target.value;
              const template = templates.find(t => t.id === templateId);
              onUpdateNode(selectedNode.id, { 
                templateId,
                template 
              });
            }}
            className="sidebar-select"
          >
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* 模板字段 */}
        {template && template.fieldIds.map(fieldId => {
          const component = components.find(c => c.id === fieldId);
          if (!component) return null;

          const value = selectedNode.data.content?.[fieldId] || '';

          return (
            <div key={fieldId} className="sidebar-field">
              <label>{component.label}</label>
              {component.type === 'textarea' ? (
                <textarea
                  value={value}
                  onChange={(e) => handleNodeFieldChange(fieldId, e.target.value)}
                  placeholder={component.placeholder}
                  className="sidebar-textarea"
                  rows="3"
                />
              ) : component.type === 'rating' ? (
                <div className="sidebar-rating">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => handleNodeFieldChange(fieldId, star)}
                      className={`rating-star ${star <= value ? 'active' : ''}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => handleNodeFieldChange(fieldId, e.target.value)}
                  placeholder={component.placeholder}
                  className="sidebar-input"
                />
              )}
            </div>
          );
        })}

        {/* 坐标信息 */}
        <div className="sidebar-field">
          <label>坐标</label>
          <div className="sidebar-coords">
            <span>X: {Math.round(selectedNode.position?.x || 0)}</span>
            <span>Y: {Math.round(selectedNode.position?.y || 0)}</span>
          </div>
        </div>

        {/* 删除按钮 */}
        <div className="sidebar-field">
          <button 
            className="sidebar-btn danger"
            onClick={() => onDeleteNode(selectedNode.id)}
          >
            删除卡片
          </button>
        </div>
      </div>
    );
  };

  // 渲染时间线属性面板
  const renderTimelineProperties = () => {
    if (!selectedTimeline) return null;

    return (
      <div className="sidebar-section">
        <div className="sidebar-header">
          <h3>时间线属性</h3>
          <button 
            className="sidebar-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="sidebar-field">
          <label>标题</label>
          <input
            type="text"
            value={selectedTimeline.title || ''}
            onChange={(e) => handleTimelineFieldChange('title', e.target.value)}
            placeholder="时间线标题（如人物名）"
            className="sidebar-input"
          />
        </div>

        <div className="sidebar-field">
          <label>时间</label>
          <input
            type="text"
            value={selectedTimeline.time || ''}
            onChange={(e) => handleTimelineFieldChange('time', e.target.value)}
            placeholder="时间（如：公元前221年）"
            className="sidebar-input"
          />
        </div>

        <div className="sidebar-field">
          <label>描述</label>
          <textarea
            value={selectedTimeline.description || ''}
            onChange={(e) => handleTimelineFieldChange('description', e.target.value)}
            placeholder="详情描述..."
            className="sidebar-textarea"
            rows="3"
          />
        </div>

        <div className="sidebar-field">
          <label>颜色</label>
          <input
            type="color"
            value={selectedTimeline.color || '#2d5a3d'}
            onChange={(e) => handleTimelineFieldChange('color', e.target.value)}
            className="sidebar-color"
          />
        </div>

        {/* 坐标信息 */}
        <div className="sidebar-field">
          <label>水平位置</label>
          <div className="sidebar-coords">
            <span>X: {Math.round(selectedTimeline.x || 0)}</span>
          </div>
        </div>

        {/* 删除按钮 */}
        <div className="sidebar-field">
          <button 
            className="sidebar-btn danger"
            onClick={() => onDeleteTimeline(selectedTimeline.id)}
          >
            删除时间线
          </button>
        </div>
      </div>
    );
  };

  // 无选中状态
  if (!selectedNode && !selectedTimeline) {
    return (
      <div className="sidebar">
        <div className="sidebar-empty">
          <div className="sidebar-empty-icon">🎋</div>
          <p>点击选中节点或时间线</p>
          <p className="text-xs text-gray-400 mt-2">
            双击可快速编辑
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar">
      {/* 标签页切换 */}
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === 'properties' ? 'active' : ''}`}
          onClick={() => setActiveTab('properties')}
        >
          属性
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'help' ? 'active' : ''}`}
          onClick={() => setActiveTab('help')}
        >
          帮助
        </button>
      </div>

      {/* 内容区域 */}
      <div className="sidebar-content">
        {activeTab === 'properties' && (
          <>
            {selectedNode && renderNodeProperties()}
            {selectedTimeline && renderTimelineProperties()}
          </>
        )}
        
        {activeTab === 'help' && (
          <div className="sidebar-section">
            <div className="sidebar-header">
              <h3>操作指南</h3>
            </div>
            <div className="sidebar-help">
              <div className="help-item">
                <span className="help-icon">🎋</span>
                <div>
                  <strong>添加时间线</strong>
                  <p>创建垂直的时间线（竹签）</p>
                </div>
              </div>
              <div className="help-item">
                <span className="help-icon">📝</span>
                <div>
                  <strong>添加卡片</strong>
                  <p>创建可拖动的卡片节点（肉）</p>
                </div>
              </div>
              <div className="help-item">
                <span className="help-icon">🔗</span>
                <div>
                  <strong>连接节点</strong>
                  <p>拖拽节点边缘的连接点</p>
                </div>
              </div>
              <div className="help-item">
                <span className="help-icon">🎋</span>
                <div>
                  <strong>绑定时间线</strong>
                  <p>将卡片拖到时间线上</p>
                </div>
              </div>
              <div className="help-item">
                <span className="help-icon">✏️</span>
                <div>
                  <strong>编辑</strong>
                  <p>双击节点或时间线快速编辑</p>
                </div>
              </div>
              <div className="help-item">
                <span className="help-icon">💾</span>
                <div>
                  <strong>保存</strong>
                  <p>自动保存到浏览器，也可导出 JSON</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;
