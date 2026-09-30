# Xboard 安卓客户端在线打包

独立于 Windows 打包站点的 Node.js 服务。访客输入 Xboard HTTPS 根地址、软件名和 PNG 图标后排队生成 APK。构建记录永久保存在 `data/history.jsonl`，APK 在成功构建 **5 分钟后**删除。下载链接只允许提交时的同一浏览器会话访问。

## 宝塔 Ubuntu x86_64 部署

建议至少 4 核、8 GB 内存及 12 GB 可用磁盘。每个构建包含一次完整 apktool 解包和重编译，不适合低内存机器。该流程不需要 Wine/NSIS/Gradle/Go。

1. 在宝塔安装 Node.js 20+，或使用系统 Node.js 20+。安装 Java 17 和 Android SDK Build Tools 35（需要 `zipalign`、`apksigner`），以及 `unzip`。确认 `node -v`、`java -version`、`zipalign -h`、`apksigner --version` 都可运行。Ubuntu 可安装 `openjdk-17-jdk-headless`，Build Tools 从 Android 官方 SDK command-line tools 安装，或从宝塔已安装的 Android SDK 中指定绝对路径。
2. 上传整个 `xboard-android-builder` 文件夹到 `/www/wwwroot/xboard-android-builder`，目录只用英文。将已验证的 `original-client-mihomo-xboard-networkfix.apk` 放到 `private/template.apk`；将 apktool 2.12.1 的 jar 放到 `private/apktool.jar`。`private` 和 `data` 不得作为宝塔静态站点根目录。
3. 在 `private` 中只生成一次签名密钥（请离线备份，丢失后新包不能覆盖安装旧包）：

   ```bash
   cd /www/wwwroot/xboard-android-builder
   mkdir -p private data
   keytool -genkeypair -keystore private/signing.jks -alias xboard-builder -keyalg RSA -keysize 3072 -validity 36500
   chmod 700 private data
   chmod 600 private/signing.jks
   ```

4. 在宝塔 Node 项目中选择该目录，启动文件 `server.js`，端口 `8788`。配置环境变量 `SIGN_STORE_PASS` 和 `SIGN_KEY_PASS` 为上一步设置的口令。若 SDK 命令不在 PATH，另配 `ZIPALIGN_BIN` 和 `APKSIGNER_BIN` 为可执行文件绝对路径；Java 可配置 `JAVA_BIN`。运行 `node preflight.js`，全部显示 OK 再启动。不要把口令写到网页或公开配置文件。
5. 宝塔网站启用 HTTPS，以 Nginx 反向代理到 `http://127.0.0.1:8788`。设置请求体上限 `client_max_body_size 2m;`，代理读取超时至少 600 秒。Node 服务仅监听本机。设置环境变量 `PUBLIC_HTTPS=1`，让会话 cookie 只经 HTTPS 发送。只有反向代理确实位于本机并且传递真实 IP 时才设置 `TRUST_PROXY=1`；Nginx 建议配置 `proxy_set_header X-Forwarded-For $remote_addr;`，不要原样信任用户发送的头。
6. 检查宝塔进程可写 `data`，但不可从网站直接下载 `private` 或 `data`。不要把整个服务目录配置成静态站点根目录，也不要将模板、签名密钥上传到 Git 仓库。每日备份 `data/history.jsonl` 和签名密钥（分别安全保存）。

`node server.js` 可在机器本地试运行，访问 `http://127.0.0.1:8788/`。若需要迁移到另一机器，复制目录及密钥、配置相同的签名口令。每次服务器重启会清理未完成或未过期的临时 APK，历史记录不会清除；请在无人构建时重启。

## 使用及限制

- 网站地址填写 `https://example.com/`，末尾斜杠可省略，不要填 `/api/v1`、在线 JSON 或订阅地址。
- 所有 APK 使用模板的 Android 包名与版本号，改动的是展示名称、图标与 API 根地址。签名密钥和原客户端不同的情况下必须先卸载旧版；覆盖安装还受 Android 版本号限制。
- 当前仅从已验证的 Android 客户端模板定制；不重新编译 Mihomo 内核，也不自动更新内核。更换模板前务必检查 `getBaseUrl()`、`app_name`、图标路径与客户端实际功能。
- 公开服务有基本限流（每 IP 每小时五次、最多八个排队任务），不能替代系统级流量与资源隔离。请在宝塔/Nginx 额外限制并发与访问频率。管理员可编辑 `blocked-words.json` 增补禁用词。
- 永久构建记录可能包含访客填写的软件名；请按所在地隐私法规告知访客。服务不记录 Xboard 密码、图标或 API 地址到历史文件。
