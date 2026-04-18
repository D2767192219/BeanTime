# 拼豆管理 - 桌面应用

基于 Electron 的拼豆计时计费管理桌面应用，支持 Windows 和 macOS。

## 功能特点

- 桌台管理：新增、编辑、删除桌台
- 状态追踪：空闲、已预约、选豆中、使用中、暂停
- 实时计时：秒级精度，费用实时计算
- 区域管理：按区域分组，支持多区域
- 数据本地存储：JSON 文件持久化，不依赖浏览器
- 系统托盘：最小化到托盘
- 数据导出/导入：可备份和恢复数据

## 开发运行

```bash
# 安装依赖
cd electron
npm install

# 开发运行
npm run dev

# 打包应用
npm run dist        # 打包 Windows + macOS
npm run dist:win    # 仅打包 Windows
npm run dist:mac    # 仅打包 macOS
```

打包后文件在 `electron/dist/` 目录下。

## 数据存储

数据存储在系统用户数据目录下：
- **macOS**: `~/Library/Application Support/jgdz/data/db.json`
- **Windows**: `C:\Users\<用户名>\AppData\Roaming\jgdz\data\db.json`

可通过菜单「文件 → 打开数据文件夹」快速定位。

## 技术栈

- Electron 33
- electron-builder 25
- 原生 HTML/CSS/JS（无框架依赖）

启动

cd /Users/ren/Documents/GitHub/jgdz/electron && npm run start 2>&1 &

cd /Users/ren/Documents/GitHub/jgdz/electron
npm run dev