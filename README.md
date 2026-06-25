# 枕书阁

读书笔记管理 Web 应用，用于记录和管理中国古代文化相关的读书笔记。

## 功能特性

- 笔记管理：创建、编辑、删除笔记
- 笔记本分类：按笔记本组织笔记
- 搜索功能：快速查找笔记内容
- 图片上传：支持粘贴上传图片
- 暗色/亮色主题切换
- 自定义卡片模板
- 导入/导出功能

## 技术栈

- **后端**：Node.js（原生 http 模块）
- **前端**：原生 JavaScript + HTML + CSS
- **数据存储**：JSON 文件

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/your-username/zhenshuge.git
cd zhenshuge
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，设置访问密码：

```
AUTH_PASSWORD=your_password_here
PORT=3000
```

### 4. 启动服务

```bash
npm start
```

### 5. 打开浏览器

访问 http://localhost:3000

## 项目结构

```
books/
├── app/                    # 应用程序
│   ├── web/
│   │   ├── server.js       # Node.js 后端
│   │   ├── app.js          # 前端逻辑
│   │   ├── index.html      # 主页面
│   │   ├── style.css       # 样式
│   │   └── start.bat       # Windows 启动脚本
│   └── docs/               # 文档
├── data/                   # 数据目录（运行时自动创建）
│   └── sample/             # 示例数据
├── .env.example            # 环境变量示例
├── .gitignore
├── package.json
└── README.md
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AUTH_PASSWORD` | 访问密码（必填） | - |
| `PORT` | 服务端口 | 3000 |

## Windows 用户

可以直接双击 `app/web/start.bat` 启动服务（需先配置 `.env` 文件）。

## License

MIT
