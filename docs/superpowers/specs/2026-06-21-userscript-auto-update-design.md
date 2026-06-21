# Tampermonkey 自动更新元数据

## 目标

让 Tampermonkey 能够从 GitHub 检测并下载 `ikanbot-player-enhancer.user.js` 的后续版本。

## 方案

将用户脚本元数据中的版本从 `1.2.0` 提升到 `1.2.1`，并新增以下两个固定地址：

- `@updateURL https://cdn.jsdelivr.net/gh/gem000908/ikan-pro@main/ikanbot-player-enhancer.user.js`
- `@downloadURL https://cdn.jsdelivr.net/gh/gem000908/ikan-pro@main/ikanbot-player-enhancer.user.js`

版本字段用于比较新旧版本；更新地址用于读取元数据，下载地址用于取得完整的新脚本。两个地址均通过 jsDelivr 跟随仓库 `main` 分支，避开当前网络无法连接 `raw.githubusercontent.com` 的问题。

## 安全边界

- 不修改播放器功能、权限、匹配范围或运行时机。
- 不增加新的用户脚本权限。
- 不删除任何文件。

## 验证

- 自动化测试读取真实脚本文件，断言版本为 `1.2.1`。
- 自动化测试断言 `@updateURL` 和 `@downloadURL` 均为预期的 jsDelivr 地址。
- 通过 HTTP 请求验证更新地址返回成功状态。
- 运行完整测试和 JavaScript 语法检查。

