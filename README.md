# 枕书阁 · PillowNotes

一个轻量的本地读书笔记管理工具，支持自定义模板、多笔记本分类、卡片式展示。

## ✨ 特性

- 📝 自定义卡片模板 — 自由组合字段，适配不同笔记场景
- 📚 多笔记本管理 — 按主题分类，独立模板
- 🎨 卡片式展示 — 书名、朝代、页码一目了然
- 🔍 全文搜索 — 快速定位笔记内容
- 📋 筛选功能 — 按字段精确过滤
- 🖼️ 图片粘贴 — 直接粘贴图片到笔记
- 📥 导入导出 — JSON 格式备份恢复
- 🔒 纯本地部署 — 数据在自己电脑上，无需注册

## 📦 内置模板

| 模板 | 适用场景 |
|------|----------|
| 古籍笔记 | 古文阅读、文献摘录 |
| 诗词赏析 | 诗词鉴赏、文学分析 |
| 学习笔记 | 课堂笔记、知识点整理 |
| 技术文档 | 技术学习、代码记录 |
| 漫画绘本 | 阅读记录、画风评价 |
| 哲学摘录 | 经典原文、个人感悟 |
| 书法碑帖 | 碑帖临摹、书法家评析 |

## 🚀 快速开始

```bash
# 克隆项目
git clone https://github.com/Pioneer-16/pillownotes.git
cd pillownotes

# 安装依赖
npm install

# 启动服务
npm start
```

然后打开浏览器访问 http://localhost:3000

或者直接双击 `start.bat`（Windows）。

## ⚙️ 配置

复制 `.env.example` 为 `.env`，可自定义端口和访问密码：

```env
PORT=3000
AUTH_PASSWORD=your_password
```

## 🗂️ 项目结构

```
├── app/web/          # 前端 + 服务端
│   ├── index.html    # 页面结构
│   ├── app.js        # 前端逻辑
│   ├── style.css     # 样式
│   └── server.js     # Node.js 服务端
├── data/             # 数据目录（自动创建）
│   ├── _globals.json # 全局配置
│   ├── notes.json    # 笔记数据
│   └── images/       # 图片存储
└── data/sample/      # 样例数据
```

## 🛠️ 技术栈

- 前端：原生 HTML/CSS/JS，无框架依赖
- 后端：Node.js + 原生 HTTP
- 存储：本地 JSON 文件
- 依赖：仅 `dotenv`

## 📄 许可证

[MIT License](LICENSE)

## 💬 反馈

如果觉得有用，欢迎 star ⭐ 或[赞助支持](https://ifdian.net/a/yztyzhen)！
