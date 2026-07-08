import { useState, useEffect, useCallback } from 'react';

const DEFAULT_TEMPLATES = [
  {
    id: 'default',
    name: '古籍笔记',
    fieldIds: ['content', 'book', 'page', 'dynasty', 'quote']
  },
  {
    id: 'tpl_poetry',
    name: '诗词赏析',
    fieldIds: ['content', 'author', 'dynasty', 'source', 'analysis', 'rating']
  },
  {
    id: 'tpl_study',
    name: '学习笔记',
    fieldIds: ['content', 'course_name', 'chapter', 'knowledge_point', 'exercises', 'rating']
  }
];

const DEFAULT_COMPONENTS = [
  { id: 'content', type: 'textarea', label: '正文', placeholder: '笔记正文…' },
  { id: 'book', type: 'dropdown', label: '书名', placeholder: '选择或输入书名' },
  { id: 'page', type: 'number', label: '页码', placeholder: 'P000' },
  { id: 'dynasty', type: 'dropdown', label: '朝代', placeholder: '选择朝代' },
  { id: 'quote', type: 'textarea', label: '引用', placeholder: '引用原文…', config: { isQuote: true } },
  { id: 'author', type: 'input', label: '作者', placeholder: '作者姓名' },
  { id: 'source', type: 'input', label: '出处', placeholder: '诗词出处' },
  { id: 'analysis', type: 'textarea', label: '赏析', placeholder: '赏析内容…' },
  { id: 'rating', type: 'rating', label: '评分', placeholder: '1-5星' },
  { id: 'course_name', type: 'input', label: '课程名', placeholder: '课程名称' },
  { id: 'chapter', type: 'input', label: '章节', placeholder: '章节名称' },
  { id: 'knowledge_point', type: 'input', label: '知识点', placeholder: '知识点' },
  { id: 'exercises', type: 'textarea', label: '练习', placeholder: '练习题…' }
];

export function useTemplates() {
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [components, setComponents] = useState(DEFAULT_COMPONENTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchTemplates() {
      setLoading(true);
      try {
        const response = await fetch('/notes/api/globals');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (cancelled) return;
        if (Array.isArray(data.cardTemplates) && data.cardTemplates.length > 0) {
          setTemplates(data.cardTemplates);
        }
        if (Array.isArray(data.fieldComponents) && data.fieldComponents.length > 0) {
          setComponents(data.fieldComponents);
        }
        setError(null);
      } catch (err) {
        if (!cancelled) {
          console.warn('枕书阁模板加载失败，使用默认模板:', err.message);
          setError('枕书阁模板加载失败，使用默认模板');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchTemplates();
    return () => { cancelled = true; };
  }, []);

  const getTemplate = useCallback((templateId) => {
    return templates.find(t => t.id === templateId) || templates[0];
  }, [templates]);

  const getComponent = useCallback((componentId) => {
    return components.find(c => c.id === componentId);
  }, [components]);

  const getTemplateComponents = useCallback((templateId) => {
    const template = templates.find(t => t.id === templateId) || templates[0];
    if (!template) return [];
    return template.fieldIds.map(id => components.find(c => c.id === id)).filter(Boolean);
  }, [templates, components]);

  return {
    templates,
    components,
    loading,
    error,
    getTemplate,
    getComponent,
    getTemplateComponents
  };
}
