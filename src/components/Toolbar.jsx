import React, { memo, useCallback, useRef } from 'react';

const Toolbar = memo(({ 
  onAddTimeline, 
  onAddCard, 
  onExport, 
  onImport, 
  onReset,
  templateCount 
}) => {
  const fileInputRef = useRef(null);

  const handleImport = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const state = JSON.parse(text);
      onImport(state);
    } catch (error) {
      alert('导入失败：无效的 JSON 文件');
    }
    
    // 重置 input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onImport]);

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <h1 className="toolbar-title">
          <span className="toolbar-icon">📜</span>
          时间线蓝图
        </h1>
        <span className="toolbar-subtitle">枕书阁</span>
      </div>
      
      <div className="toolbar-center">
        <button 
          className="toolbar-btn primary"
          onClick={onAddTimeline}
          title="添加时间线（竹签）"
        >
          <span className="btn-icon">🎋</span>
          <span className="btn-text">添加时间线</span>
        </button>
        
        <button 
          className="toolbar-btn"
          onClick={onAddCard}
          title="添加卡片节点（肉）"
        >
          <span className="btn-icon">📝</span>
          <span className="btn-text">添加卡片</span>
        </button>
        
        <div className="toolbar-divider" />
        
        <button 
          className="toolbar-btn"
          onClick={onExport}
          title="导出画布为 JSON 文件"
        >
          <span className="btn-icon">💾</span>
          <span className="btn-text">导出</span>
        </button>
        
        <button 
          className="toolbar-btn"
          onClick={() => fileInputRef.current?.click()}
          title="从 JSON 文件导入画布"
        >
          <span className="btn-icon">📂</span>
          <span className="btn-text">导入</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          style={{ display: 'none' }}
        />
        
        <div className="toolbar-divider" />
        
        <button 
          className="toolbar-btn danger"
          onClick={onReset}
          title="清空画布，重新开始"
        >
          <span className="btn-icon">🗑️</span>
          <span className="btn-text">清空</span>
        </button>
      </div>
      
      <div className="toolbar-right">
        <div className="toolbar-info">
          <span className="info-label">模板数</span>
          <span className="info-value">{templateCount}</span>
        </div>
      </div>
    </div>
  );
});

Toolbar.displayName = 'Toolbar';

export default Toolbar;
