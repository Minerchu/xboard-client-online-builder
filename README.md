# 宝塔部署：Windows + Android 在线打包

仓库只跟踪网站代码；完整部署 ZIP 放在 GitHub Releases 中。`windows/client-template/`、`android/private/template.apk` 和 `android/private/apktool.jar` 均包含在部署 ZIP 中，不作为普通 Git 文件上传。签名密钥、构建历史和临时文件不进入公开发布包。请从 Release 下载完整 ZIP 部署，单独下载源码不能直接启动构建服务。

这是一个网站、一个 Node 项目、一张网页、两套独立的构建队列。入口 `server.js` 默认只监听服务器本机 `127.0.0.1:8790`，页面上方直接选择 Windows 或 Android，不使用 iframe；两种配置、下载与历史互不混用。项目不依赖第三方 npm 包。

## 重新部署

1. **先备份旧数据，不要直接覆盖旧目录。** 上传整合 ZIP 到宝塔，解压后目录应为 `/www/wwwroot/xboard-unified-builder/`，内含 `server.js`、`windows/client-template/`、`android/private/template.apk`。这些都是非公开文件，**不要**把整个目录设为 Nginx 静态网站根目录。
2. 服务器需要 Node.js 20+、Wine/winepath、NSIS/makensis、zip（Windows），以及 Java 17+、Android SDK Build Tools 35 的 zipalign/apksigner（Android）。在新目录运行 `node preflight.js` 检查。两套依赖都装齐才可上线双端打包。
3. 安卓签名密钥必须只创建一次。若之前的安卓独立站已有 `private/signing.jks`，复制到 `android/private/signing.jks`，保留原密码；否则在新目录执行：

   ```bash
   cd /www/wwwroot/xboard-unified-builder
   keytool -genkeypair -keystore android/private/signing.jks -alias xboard-builder -keyalg RSA -keysize 3072 -validity 36500
   chmod 700 android/private
   chmod 600 android/private/signing.jks
   ```

   若原密钥用了别的 alias，也要设置 `SIGN_ALIAS`。请离线备份密钥和口令；丢失后新 APK 无法覆盖安装旧 APK。
4. 如需继续保留旧站统计记录，复制**具体文件**到新位置，不要替换新目录的模板和代码。示例（先按你服务器的旧路径核实）：

   ```bash
   cp -n /www/wwwroot/xbexe/xboard-client-builder/builder/build-history.jsonl /www/wwwroot/xboard-unified-builder/windows/builder/build-history.jsonl
   cp -n /www/wwwroot/xboard-android-builder/data/history.jsonl /www/wwwroot/xboard-unified-builder/android/data/history.jsonl
   ```

   文件不存在就跳过相应命令。`cp -n` 不会覆盖新目录里已有的记录。若要保留旧的构建文件，可等它们过期；迁移不需要复制 `build-output`。
5. 宝塔「网站 → Node 项目」创建新项目：目录 `/www/wwwroot/xboard-unified-builder`、启动命令 `node server.js`（或 `npm start`）、端口 `8790`。环境变量填写 `SIGN_STORE_PASS`、`SIGN_KEY_PASS`（安卓密钥密码），`PUBLIC_HTTPS=1`；Android 工具不在 PATH 时再填写 `ZIPALIGN_BIN=/opt/android-sdk/build-tools/35.0.0/zipalign`、`APKSIGNER_BIN=/opt/android-sdk/build-tools/35.0.0/apksigner`。如果宝塔找不到 Java，填写 `JAVA_BIN=/usr/bin/java`。Windows 构建进程需能执行 `wine`、`winepath`、`makensis`、`zip`。
6. 先在服务器验证 `curl -I http://127.0.0.1:8790/`、`curl http://127.0.0.1:8790/windows/history?page=1`、`curl http://127.0.0.1:8790/android/api/state`，再把现有宝塔网站的**反向代理目标**从旧站改为 `http://127.0.0.1:8790`，继续使用 HTTPS。Nginx 配 `client_max_body_size 16m;`，反向代理应支持大文件下载。旧服务等新站验证完毕后再停止，避免中断在途构建。

下载与记录：Windows 产出 EXE 和 ZIP，安卓产出 APK；两种成品在成功后 5 分钟自动删除，各自历史数据继续保存。Android 下载绑定提交时的浏览器会话，Windows 任务 ID 保存在浏览器本地。Windows 原有在线 JSON、备用 Xboard 地址、图标、封面功能保持不变；安卓填写的是 Xboard HTTPS 根地址，不用在线 JSON。

注意：重打包后的安卓 APK 仍使用模板的包名和版本号；与旧 APK 签名不一致时须先卸载旧版。每个构建站都很占 CPU/磁盘，公网使用时建议在宝塔/Nginx 另加访问与请求频率限制，并监视可用磁盘空间。
