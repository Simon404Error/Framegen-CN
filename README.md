# Framegen CN

浏览器视频实时补帧扩展的简体中文版。基于 [Framegen](https://github.com/MONZikWasTaken/Framegen) 汉化并增强。

## 功能

- 为任意网页视频实时补帧，2× 到 6×，由 GPU（WebGPU）本地运算
- 支持自动 / 匹配显示器 / 自定义 FPS 三种输出模式
- 动画模式：识别一拍二、一拍三的手绘帧，并对真实运动插帧
- 画面模式、锐化、2× 神经超分、HDR
- 字幕保护：内嵌字幕、台标不参与插值
- 对比滑块：左侧原始画面，右侧补帧画面

## 中文版新增

- **全界面汉化**：弹窗、设置页、播放器内控制面板、状态与警告提示
- **按站点记住开关**：在某个网站开启补帧后，该网站下所有视频自动补帧；关闭后不再自动开启
- **站点管理**：设置页可查看、添加、单独移除、一键清空已记忆的网站
- **信息流适配**：竖滑换视频后自动切换补帧目标，不再出现按键消失或无补帧
- **进度条开关**：可隐藏插件自带的播放进度条

## 安装

1. 下载发行版中的 `framegen-CN-extension.zip` 并解压
2. 打开 `chrome://extensions`，开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择解压后的文件夹

## 系统要求

- Chrome 或 Edge 121+（Windows、Apple Silicon macOS、Linux）
- 或 Windows 上的 Firefox 141+
- 支持 WebGPU 的显卡（约 2016 年及以后）

## 使用

1. 打开视频并悬停，播放器左缘出现补帧按钮
2. 点击开启，按钮变绿并显示帧率
3. 齿轮按钮打开设置面板，画面按钮调整滤镜与超分
4. 首次在某个网站开启后，该网站后续视频将自动补帧

## 已知限制

- 不能与 RTX VSR 同时使用，因此开启插帧时会自动禁用 RTX VSR ，关闭插帧后自动恢复
- Netflix、Crunchyroll 等 DRM 站点无法使用：浏览器不提供其画面像素
- 少数站点（如 reddit.com）的安全策略禁止扩展运行 WebAssembly，无法补帧

## 许可证

代码遵循 MIT 许可证。模型权重遵循其原始许可（见 `extension/engine/WEIGHTS_LICENSE.md` 与 `WEIGHTS_LICENSE.md`）。

原项目版权归 [MONZikWasTaken/Framegen](https://github.com/MONZikWasTaken/Framegen) 所有。
