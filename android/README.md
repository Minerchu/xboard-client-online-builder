# Android 构建组件

此目录是整合站点的安卓构建组件，不需要单独创建宝塔项目。

安卓客户端基于萌通客户端开发，保留原界面与账号密码登录方式，适配 Xboard 并集成 Mihomo 内核。

请按根目录的 [全新部署教程](../README.md) 安装 Java/Android 工具、首次生成签名密钥并启动统一入口 `server.js`。统一网站端口为 `8790`。

模板位于 `private/template.apk`，apktool 位于 `private/apktool.jar`，签名密钥由部署者首次创建。完整模板仅在 GitHub Release 部署 ZIP 中提供。
