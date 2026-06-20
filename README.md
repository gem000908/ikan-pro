# ikanbot 播放器增强

适用于 Chrome / Edge + Tampermonkey 的用户脚本，仅在 `https://www1.ikanbot.com/play/*` 播放页运行。

## 安装

1. 安装 Tampermonkey 浏览器扩展。
2. 打开 Tampermonkey 管理面板，选择“添加新脚本”。
3. 删除编辑器中的模板内容，将 `ikanbot-player-enhancer.user.js` 全部复制进去并保存。
4. 打开或刷新 ikanbot 播放页。

## 功能

- 播放按钮后新增 `−10` 和 `+10` 按钮。
- 键盘 `←` / `→` 后退或前进 10 秒。
- 输入框、文本域、选择框或可编辑区域聚焦时不响应方向键。
- 每部影片独立保存观看进度，约每 5 秒更新；暂停、隐藏或离开页面时补充保存。
- 再次进入同一影片自动恢复进度；小于 5 秒不恢复，距离片尾不足 30 秒或播放结束后清除。
- 支持播放器延迟出现和切换线路后的 DOM 重建，不重复创建按钮。

进度仅保存在当前网站来源的浏览器 `localStorage` 中。脚本不抓取影片或线路，不逆向播放令牌，不读取、解析或导出媒体地址，也不发送网络请求。

## 测试

需要 Node.js 24（测试只使用 Node 内置模块，无需安装依赖）：

```powershell
node --test --test-isolation=none
node --check ikanbot-player-enhancer.user.js
```
