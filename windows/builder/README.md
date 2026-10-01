# Windows 构建组件

此目录是整合站点的 Windows 构建组件，不需要单独创建宝塔项目。

Windows 客户端基于潮汐客户端开发，适配 Xboard 并升级 Mihomo 内核，支持在线 JSON 配置和品牌定制。

请按根目录的 [全新部署教程](../../README.md) 安装 Wine、NSIS、zip 并启动统一入口 `server.js`。统一网站端口为 `8790`。

客户端模板位于 `../client-template/`，完整模板仅在 GitHub Release 部署 ZIP 中提供。构建输出为 EXE 安装包和便携 ZIP，历史记录为本目录的 `build-history.jsonl`。
