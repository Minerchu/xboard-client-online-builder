# Xboard Windows + Android 客户端在线打包

一个网站、一个 Node 项目、一张网页，分别生成 Windows EXE/便携 ZIP 和 Android APK。两套构建队列独立处理，产物完成后保留 5 分钟，构建记录长期保存。

## 客户端来源

- **Windows 客户端基于潮汐客户端开发**：适配 Xboard，升级 Mihomo 内核，支持在线 JSON 配置、软件名称、图标和封面定制。
- **安卓客户端基于萌通客户端开发**：保留原客户端界面与账号密码登录方式，适配 Xboard，集成 Mihomo 内核，支持软件名称和图标定制。

本项目是上述客户端的适配与在线打包工具，并非从零开发的客户端。原客户端及第三方组件的版权和许可证归各自权利人所有。

## 下载完整部署包

从 [GitHub Releases](https://github.com/Minerchu/xboard-client-online-builder/releases) 下载 Assets 中的 `xboard-unified-builder-baota.zip`，**不要下载 Source code ZIP 来部署**。源码仓库不包含大型客户端模板；完整部署包包含 Windows 模板、已修复的安卓 APK 模板和 apktool，不包含签名私钥和运行数据。

## 全新部署到宝塔

以下以 **Ubuntu 22.04 x86_64/amd64 + 宝塔** 为例，无需已经有 Windows 或安卓旧站。建议至少 4 核、8 GB 内存和 12 GB 可用磁盘。Windows 构建需要 Wine，不适用于 ARM64 主机。

### 1. 上传部署包

在宝塔文件管理器上传 ZIP 到 `/www/wwwroot/` 并解压。检查下列文件都存在，避免多套一层目录：

```text
/www/wwwroot/xboard-unified-builder/
  server.js
  package.json
  windows/client-template/resources/app.asar
  android/private/template.apk
  android/private/apktool.jar
```

项目目录不能作为 Nginx 静态网站根目录，模板、密钥和运行数据都不能直接暴露给公网。后面通过反向代理提供网页。

### 2. 安装 Node 和系统依赖

在宝塔「网站 → Node 项目」安装 Node.js 20 或更高版本。后面创建项目也选择同一版本。终端运行 `node -v` 检查；若终端找不到 Node，在宝塔版本管理中查看安装路径并将该版本的 `bin` 目录加入 PATH。

在宝塔终端执行：

```bash
uname -m
apt update
apt install -y wine wine64 nsis zip openjdk-17-jdk-headless wget unzip
java -version
wine --version
makensis -VERSION
```

`uname -m` 应为 `x86_64`。如果 apt 报依赖或文件权限错误，先解决报错，不要跳过继续部署。Wine 必须在**实际运行 Node 项目的同一用户**下初始化：

```bash
wineboot -u
winepath -w .
```

### 3. 安装 Android Build Tools

以下命令要求 `/opt/android-sdk/cmdline-tools/latest` 尚未安装；如果已有 Android SDK，可直接使用现有工具的绝对路径。

```bash
mkdir -p /opt/android-sdk/cmdline-tools
cd /opt/android-sdk/cmdline-tools
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-11076708_latest.zip
mv cmdline-tools latest
/opt/android-sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root=/opt/android-sdk "build-tools;35.0.0"
```

出现许可确认时输入 `y`。下载需要服务器能访问 Google。安装完成后检查：

```bash
/opt/android-sdk/build-tools/35.0.0/zipalign -h
/opt/android-sdk/build-tools/35.0.0/apksigner --version
```

### 4. 首次生成安卓签名密钥

仅执行一次，并设置自己的密码，不要使用示例或公开密码：

```bash
cd /www/wwwroot/xboard-unified-builder
mkdir -p android/data
keytool -genkeypair -keystore android/private/signing.jks -alias xboard-builder -keyalg RSA -keysize 3072 -validity 36500
chmod 700 android/private android/data
chmod 600 android/private/signing.jks
```

妥善备份密钥和密码，不要上传到 GitHub。项目运行用户必须能读取密钥、写入 `android/data` 和 `windows/builder`。以后保持同一密钥；换密钥会导致新 APK 无法覆盖安装同包名的旧 APK。

### 5. 创建宝塔 Node 项目

在「网站 → Node 项目」添加项目：

| 项目项 | 填写内容 |
| --- | --- |
| 项目目录 | `/www/wwwroot/xboard-unified-builder` |
| Node 版本 | 20 或更高 |
| 启动命令 | `node server.js` 或 `npm start` |
| 启动文件（如果界面要求） | `server.js` |
| 项目端口 | `8790` |

项目无第三方 npm 依赖，无需 `npm install`。设置环境变量：

```text
SIGN_STORE_PASS=刚才的密钥密码
SIGN_KEY_PASS=刚才的私钥密码（通常与密钥密码相同）
ZIPALIGN_BIN=/opt/android-sdk/build-tools/35.0.0/zipalign
APKSIGNER_BIN=/opt/android-sdk/build-tools/35.0.0/apksigner
JAVA_BIN=/usr/bin/java
PUBLIC_HTTPS=1
```

确保项目用户的 PATH 里能找到 `wine`、`winepath`、`makensis`、`zip`。在**相同用户和上述环境变量**下运行 `node preflight.js`，所有检查为 OK 后启动项目。不要把密码写进网页或公开文件。

### 6. 创建网站并绑定域名

宝塔新建网站，绑定自己的域名并配置 HTTPS 证书。网站用单独的空目录作为根目录，不要使用构建项目目录。添加反向代理，目标 URL 填：

```text
http://127.0.0.1:8790
```

代理必须覆盖 `/` 及所有子路径。在 Nginx 网站配置的 `server` 块中设置 `client_max_body_size 16m;`，避免封面上传被拦截。只通过反代访问项目，不要将 8790 端口开放给公网。

在服务器终端验证：

```bash
curl http://127.0.0.1:8790/windows/queue
curl http://127.0.0.1:8790/android/api/state
```

返回 JSON 后打开自己的 HTTPS 域名，分别提交一个 Windows 和 Android 任务，核对下载、安装和登录。

## 网页使用

- Windows：软件名、在线 JSON 完整网址、备用 Xboard HTTPS 根地址；图标和封面可选。JSON 标准内容为 `{ "api": "https://your-xboard.example.com" }`，换行不影响解析。
- Android：软件名、Xboard HTTPS 根地址、图标。根地址末尾 `/` 可写可不写，不要填写 `/api/v1`、订阅或在线 JSON 链接。
- 图标：两端均可上传 JPG、PNG、WebP、GIF、ICO（原图不超过 10 MB）。网页居中裁切为方形并显示预览，自动生成 Windows ICO 或 Android PNG。GIF 使用静态帧，HEIC 等浏览器无法解码的格式需先转为常见图片格式。
- Android 下载绑定提交时的浏览器会话；Windows 任务 ID 保存在浏览器本地。公开队列不提供他人的下载链接。

## 数据与限制

Windows 记录为 `windows/builder/build-history.jsonl`，安卓记录为 `android/data/history.jsonl`，首次提交后自动创建。记录不会随 5 分钟产物清理删除；建议定期备份。用户名称会进入历史记录，请勿填个人敏感信息。可在各端 `blocked-words.json` 中维护名称禁用词。

安卓重打包保留模板的包名和版本号，签名不同的旧客户端需要先卸载。Windows 成品没有代码签名证书，SmartScreen 可能提示未知发布者。模板基于已验证的客户端，不会自动更新 Mihomo。请仅为自己有权使用的站点构建，公网部署还应在宝塔/Nginx 加访问频率限制并监控 CPU、内存和磁盘。
