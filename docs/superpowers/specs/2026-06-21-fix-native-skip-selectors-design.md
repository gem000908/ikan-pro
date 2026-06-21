# 修复 Video.js 原版跳转按钮隐藏规则

## 根因

现有样式只隐藏旧 `videojs-seek-buttons` 插件的 `.vjs-seek-button`。当前页面使用 Video.js 8 内置控件，截图中的按钮实际使用 `.vjs-skip-backward-10` 和 `.vjs-skip-forward-10`，因此旧规则没有命中。

## 方案

保留旧插件兼容规则，并增加 Video.js 内置后退/前进控件规则：

- `[class*="vjs-skip-backward-"]`
- `[class*="vjs-skip-forward-"]`

所有规则限定在 `.video-js .vjs-control-bar` 下，并使用 `:not([data-ikanbot-seek])` 保护脚本自己的 `−10/+10` 按钮。脚本版本提升到 `1.2.2`，使 Tampermonkey 能检测本次修复。

## 验证

- 回归测试断言注入样式同时包含新版内置控件和旧插件选择器。
- 元数据测试断言版本为 `1.2.2`。
- 运行完整测试和语法检查。
- 推送后清理 jsDelivr 单文件缓存，并确认更新地址返回 `1.2.2`。

## 安全边界

- 保留脚本新增的 `−10/+10` 和键盘跳转功能。
- 不修改其他播放器控件。
- 不删除任何文件或目录。

