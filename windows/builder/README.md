# 宝塔部署：Windows 客户端打包器

## 名称审核与界面更新

必须一起上传 `server.js`、`moderation.js`、`blocked-words.json` 和 `index.html`，然后重启 Node 项目。服务端按词库拒绝不合适的名称，公开旧记录命中词库时显示“名称已隐藏”，不删除统计。编辑 `blocked-words.json` 中的 `words` 数组可以增加词条，保存后自动生效；更新部署时保留自己的词库和 `build-history.jsonl`。词库损坏时新提交会被拒绝，公开名称会隐藏，不会绕过审核。

预置词库只是有限的示例，不是完整的法律或内容审核标准；可被谐音、图片等形式绕过，也可能误判。这里仅审核软件名称，不审核上传图片或配置地址的内容。请按运营要求维护词库，违规旧名称仍可能存在于服务器的原始历史文件中。浏览器显示内容均使用文本节点，不会把名称当作 HTML 执行。

界面包含响应式双栏布局、文件预览、连接状态、编译阶段动效；遵循浏览器“减少动态效果”设置。`npm test` 可以验证名称过滤和 HTTP 拦截。

构建结果有两种：单文件 `setup.exe` 安装包，以及带完整运行文件的便携 ZIP。安装包在 Windows 上双击安装；便携版必须解压整个目录，不能只复制里面的客户端 EXE。两者都包含 Mihomo v1.19.31。

## 环境

- 宝塔 Linux 服务器（以下以 Debian/Ubuntu 为例），建议至少 2 GB 内存和 3 GB 空闲磁盘。
- 宝塔 Node 项目管理器中的 Node.js 20 或更新版本。
- 服务器 shell 安装 `wine`、`wine64`、`nsis`、`zip`。Debian/Ubuntu 可运行：`sudo apt update`，然后 `sudo apt install -y wine wine64 nsis zip`。
- 用打包服务运行账号执行 `wineboot -u` 一次以初始化 Wine；`winepath`、`wine`、`makensis`、`zip` 均需在该账号的 PATH 中。

其他 Linux 发行版须通过对应软件源安装这些工具。`rcedit` 的 MIT 许可证位于 `vendor/LICENSE.rcedit`；不要删除 `vendor/rcedit-x64.exe`。

## 启动

将整个上传包解压到服务器的非公开目录，例如 `/opt/xboard-client-builder`。目录内应有 `builder/package.json`、`client-template/resources/app.asar` 和 `main-fixed.js`，三者的相对位置不能改变。所有部署文件夹都使用英文名。不要把模板或 `build-output` 放进静态网站目录。

在宝塔的 Node 项目管理器中设置：

- 项目目录：`/opt/xboard-client-builder/builder`
- 启动命令：`npm start`（或启动文件 `server.js`）
- 端口：`8787`
- 环境变量 `BUILDER_HOST=127.0.0.1`、`BUILDER_PORT=8787`

设置完成后先在项目目录执行 `node preflight.js`，确认所有项目为 `OK`，再启动服务。项目的 `package.json` 不依赖第三方 npm 包，无需 `npm install`；宝塔界面要求安装依赖时可执行一次 `npm install --ignore-scripts`。

命令行启动等效为在配置好上述环境变量后执行 `node server.js`。无需 `npm install`。

在宝塔创建专用域名的网站，启用 HTTPS，反向代理到 `http://127.0.0.1:8787`。Nginx 站点配置应允许 `client_max_body_size 16m`。仅让反向代理访问 8787，不要在安全组或防火墙中对公网直接开放该端口。网页不需要构建令牌，访问者均可提交任务；服务端限制同时只编译一个、最多等待 8 个，每个来源每分钟最多提交 5 次。公网部署仍建议在宝塔配置 IP 白名单或基础认证，防止陌生人占用 CPU 和磁盘。

打开站点后填写软件名、在线 JSON URL 和备用 Xboard API；可上传 ICO 图标（不超过 1 MB）。封面可选择上传 PNG（不超过 8 MB）或填写 HTTPS 在线图片网址。点击生成后网页显示排队位置，完成后提供 `setup.exe` 和便携 ZIP。文件从生成完成起保存 5 分钟，过期自动删除（正在下载的传输结束后删除）。在线 JSON 内容需是 `{ "api": "https://你的Xboard域名" }`；客户端启动时优先使用它，读取失败时使用备用 API。改在线 JSON 的 API 地址不用重新打包；改在线 JSON 的**网址本身**需要在打包器重新构建，或修改客户端 `resources/backend.json` 后重启。在线封面网址不变时，替换该网址的图片也不用重新打包。

公开队列显示当前排位和阶段；公开编译记录分页保留全部任务的名称、提交时间与结果，不包含配置网址、任务 ID 或下载地址。按北京时间列出每天的提交次数、成功次数和使用浏览器数。浏览器本地保留自己提交的任务 ID，才能在“我的编译”看到下载链接。浏览器数按提交任务的匿名浏览器标识估算，并非精确人数；更换浏览器或清除本地数据会重复计数。记录在首次提交时创建于 `builder/build-history.jsonl`，更新部署时必须保留此文件；删除它将清空历史与统计。历史记录和统计不会随 5 分钟文件清理而删除。更新时须同时替换 `builder/index.html` 和 `builder/server.js` 并重启 Node 服务；若显示历史接口不存在，在服务运行的同一环境执行 `curl -i http://127.0.0.1:8787/history?page=1`，应返回 HTTP 200。

构建任务在 `builder/build-output` 中使用临时目录；新版本任务会自动清理。旧版本生成的目录不带新任务标记，不会被新版本自动删除，需单独检查后处理。更换应用名称会改变 Electron 的用户数据目录，旧应用的登录状态不会自动迁移。Windows SmartScreen 可能提示未签名安装包；正式分发建议使用自己的代码签名证书。

## 本地验证

命令行测试时先在 `config.example.json` 中填写自己的名称和地址，再用 `node build.js config.example.json 输出目录` 生成便携客户端。网页构建额外调用 `makensis` 生成安装包。若报 `ENOENT`，先检查上面的四个命令是否能由 Node 项目运行账号执行。
