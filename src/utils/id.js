// ID 生成器
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// 格式化时间
export function formatTime(time) {
  if (!time) return '';
  return time;
}

// 防抖函数
export function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
