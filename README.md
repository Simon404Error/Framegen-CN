<div align="center">

<img src="docs/media/logo.png" width="96" alt="Framegen">

# Framegen-CN

**[English](#smooth-video-in-your-browser) | [简体中文](#中文说明)**

---

<a id="smooth-video-in-your-browser"></a>
**Smooth video in your browser.** An extension that turns 24 to 30 fps video into 60 to 240 fps in real time, with a
neural network running on your GPU. No servers, no accounts, nothing leaves your computer.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/hpdpcjakhclhljfdkpjolonjlopbdhfk?label=chrome%20web%20store&color=19c37d)](https://chromewebstore.google.com/detail/framegen-frame-interpolat/hpdpcjakhclhljfdkpjolonjlopbdhfk)
[![License](https://img.shields.io/badge/code-MIT-blue)](LICENSE)
[![Built on FlyHigh](https://img.shields.io/badge/built%20on-FlyHigh%20engine-7c5cff)](https://github.com/getflyhigh/flyhigh-engine)
[![Ko-fi](https://img.shields.io/badge/support-ko--fi-ff5e5b)](https://ko-fi.com/monzikxd)

<img src="docs/media/hero.gif" width="880" alt="15 fps source vs Framegen x4 interpolation, side by side">

</div>

> This fork adds a Simplified Chinese localization of the extension UI on top of the upstream
> [MONZikWasTaken/Framegen](https://github.com/MONZikWasTaken/Framegen) project. Install instructions are unchanged.

## What it does

- **2x to 6x more frames** on any `<video>`: movies, series, sports, anime, screen recordings; YouTube and most video
  sites
- **Auto mode** picks the highest factor your GPU and display sustain and backs off before you see a stutter
- **Anime mode** detects drawings held on twos and threes and interpolates the real motion; the optional cadence
  smoothing spreads each drawing step evenly over the frames it is held for
- **Match display and Custom FPS** place the output on an exact grid at your monitor's rate or any rate you ask for
- **Compare slider**: original on the left, Framegen on the right
- **Private by construction**: the whole pipeline runs on your GPU; nothing is collected

Since 2.0 the generation runs on the [FlyHigh engine](https://github.com/getflyhigh/flyhigh-engine): the FlyHighFG
network (0.78 M parameters) and its WGSL kernels compiled to WebAssembly, with the engine's Pacer deciding what to show
on every display tick. A generated frame costs about a millisecond on a mid-range GPU.

## Install

**[Add to Chrome from the Web Store](https://chromewebstore.google.com/detail/framegen-frame-interpolat/hpdpcjakhclhljfdkpjolonjlopbdhfk)**.

Manual install: download `framegen-extension.zip` from the
[latest release](https://github.com/MONZikWasTaken/Framegen/releases/latest), extract it, open `chrome://extensions`,
enable **Developer mode**, click **Load unpacked** and select the extracted folder. Firefox: `framegen-firefox.zip`
from the same release, loaded through `about:debugging` until it is listed on AMO.

To get the Chinese UI, load the `extension/` folder of this repository instead of the release zip.

Requirements: **Chrome or Edge 121+** (Windows, macOS with Apple Silicon, Linux) or **Firefox 141+ on Windows**, and
a GPU with WebGPU support. GPUs without `shader-f16` run the engine's f32 kernels, slower but the same picture.

## How to use

1. Open any video and hover over it: the **FG** button appears at the left edge of the player.
2. Click it. The button turns green, the fps readout appears, and the video is now interpolated. Click again to turn
   it off.
3. The two buttons under it open the panels inside the player: **Picture** (looks, sharpness, upscale, HDR) and
   the quick settings. **Advanced settings** there or in the extension popup opens the full page with profiles.

| Setting | What it does |
|---|---|
| **Output rate** | `Auto` fits your GPU and display, with an optional FPS limit. `Match display` and `Custom FPS` pace on an exact grid; fixed 2x to 6x multiply the source. **Limit to display refresh rate** (on) makes the screen a ceiling; off, the GPU generates as many frames as its budget allows. **Motion-adaptive Auto** (on) generates fewer frames on fast scenes |
| **Quality** | The size the network runs at. `Balanced` is the model's native scale; higher costs more GPU time and rarely looks better |
| **Anime mode** | Held-frame detection and the aggressive periodic-structure repair; keep on for anime |
| **Anime cadence smoothing** | Experimental, off by default. Drawings on twos slide instead of stepping; every frame becomes a generated in-between, so big steps look softer; one source frame of lookahead |
| **Picture mode** | A color and detail look on top of the video: Cinema, Cinema Home, Noir, Vivid, Sports, Detail Boost. `Original` changes nothing |
| **Upscale** | 2x neural upscaling of every presented frame when the player is larger than the video |
| **Static protection** | Pixels that did not change over the last frames (burnt-in subtitles, a logo) are taken from the source |
| **Compare** | The split slider |

Profiles on the full settings page keep any number of setups; existing settings migrate without losing values.

**Good first test:** anything shot at 24 fps: a film scene with a slow pan, an anime opening. On a 60 Hz screen you
see 24 to 60; on a 144 to 240 Hz screen, considerably more.

## FAQ

**It says "no video found" / the button does not appear.** Make sure the video is playing. On some players the button
appears only when the mouse is over the video itself.

**Does it work on Netflix or Crunchyroll?** No: DRM-protected video is invisible to extensions by design; the browser
hands over black frames. YouTube and most other sites work.

**The fps counter shows less than the factor I chose.** Auto adapts to the GPU's real headroom and never stutters to
hit a number; a fixed factor is capped the same way. Lower the quality or the factor if you want more.

**The panel says the site forbids WebAssembly.** A few sites (reddit.com among the ones checked) send a security
policy that Chrome also applies to extensions' WebAssembly. Framegen cannot run there; Firefox is not affected.

**Does it phone home?** No. There is no server, no telemetry, no analytics; the code is here to check.

## Development

```pwsh
node --test tools/*.test.mjs
pwsh tools/build_extension.ps1                      # validates every payload, writes the three release zips
pwsh tools/build_extension.ps1 -EngineRepo <path>   # also refreshes extension/engine from an engine checkout
```

`extension/` is directly loadable (Load unpacked). [docs/architecture.md](docs/architecture.md) explains how the host
maps onto the engine. The previous engine stays in
`web/rt` and on npm as [`framegen`](https://www.npmjs.com/package/framegen) ([packages/rt](packages/rt)); its notes are
in [docs/TECHNICAL.md](docs/TECHNICAL.md). New integrations should use the engine directly.

## Support the project

Framegen is built by one person with one mid-range GPU. The extension is free and will stay free; the models behind it
are trained on rented cloud GPUs paid out of pocket. If Framegen made your video smoother:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/monzikxd)

## License

Code: **MIT** ([LICENSE](LICENSE)). Model weights: the FlyHighFG weights under
[CC BY-NC 4.0](extension/engine/WEIGHTS_LICENSE.md); the previous engine's weights for personal and research use
([WEIGHTS_LICENSE.md](WEIGHTS_LICENSE.md)).

---

<a id="中文说明"></a>

<div align="center">

# Framegen-CN（简体中文版）

**让浏览器中的视频更流畅。** 这是一个把 24–30 fps 视频实时补帧到 60–240 fps 的浏览器扩展，神经网络在你的 GPU 上运行。
无服务器、无账号，任何数据都不会离开你的电脑。

</div>

> 本 fork 在上游 [MONZikWasTaken/Framegen](https://github.com/MONZikWasTaken/Framegen) 的基础上对扩展界面做了简体中文汉化。

## 功能

- 为任意 `<video>` 提供 **2–6 倍补帧**：电影、剧集、体育、动画、录屏；支持 YouTube 和大多数视频网站
- **自动模式**：自动选择 GPU 和显示器能承受的最高倍率，并在出现卡顿前自动回落
- **动画模式**：识别"一拍二/一拍三"的手绘帧并对真实运动插帧；可选的节奏平滑把每张原画的步进均匀分布到其停留的所有帧上
- **匹配显示器与自定义 FPS**：让输出精确落在显示器刷新率或你指定帧率的网格上
- **对比滑块**：左侧原始画面，右侧补帧画面
- **隐私安全**：整个流程都在你的 GPU 上运行，不收集任何数据

自 2.0 起，补帧由 [FlyHigh 引擎](https://github.com/getflyhigh/flyhigh-engine)驱动：FlyHighFG 网络（78 万参数）
及其 WGSL 内核编译为 WebAssembly，由引擎的 Pacer 决定每个显示时钟呈现哪一帧。在中端 GPU 上，生成一帧约需 1 毫秒。

## 安装

手动安装：打开 `chrome://extensions`，开启**开发者模式**，点击**加载已解压的扩展程序**，选择本仓库的 `extension/` 文件夹（即中文界面版本）。
也可从[上游最新 Release](https://github.com/MONZikWasTaken/Framegen/releases/latest) 下载 `framegen-extension.zip`（英文界面）。

系统要求：**Chrome 或 Edge 121+**（Windows、Apple Silicon macOS、Linux）或 **Windows 上的 Firefox 141+**，
以及支持 WebGPU 的显卡。不支持 `shader-f16` 的 GPU 会回退到 f32 内核，速度更慢但画质相同。

## 使用方法

1. 打开任意视频并把鼠标悬停上去：播放器左缘会出现 **FG** 按钮。
2. 点击它。按钮变绿、出现帧率读数，视频开始补帧；再次点击关闭。
3. 其下两个按钮打开播放器内的面板：**画面**（滤镜、锐化、超分、HDR）和快速设置。**高级设置**（或扩展弹窗中）可打开带配置档案的完整设置页。

| 设置 | 说明 |
|---|---|
| **输出帧率** | `自动` 适配 GPU 与显示器，可设 FPS 上限。`匹配显示器` 和 `自定义 FPS` 精确对齐帧率网格；固定 2–6 倍直接乘以源帧率。**限制为显示器刷新率**（默认开）把屏幕刷新率作为上限，关闭后 GPU 按其算力尽量生成。**运动自适应自动**（默认开）在快速场景减少生成帧数 |
| **画质** | 网络运行分辨率。`均衡` 是模型原生规格；更高占用更多 GPU 时间且画质很少更好 |
| **动画模式** | 停留帧检测与强化的重复图案修复；看动画建议保持开启 |
| **动画节奏平滑** | 实验性，默认关。一拍二/一拍三的步进变为滑动；每一帧都成为生成的中间帧，大步进看起来更柔和；需要一帧源前瞻 |
| **画面模式** | 叠加在视频上的色彩与细节风格：影院、影院（明亮）、黑色电影、鲜艳、运动、细节增强。`原画` 不做任何修改 |
| **超分辨率** | 播放器大于视频时，对每个呈现帧做 2 倍神经超分 |
| **字幕保护** | 最近几帧未变化的像素（内嵌字幕、台标）直接取自源帧 |
| **对比** | 分屏对比滑块 |

完整设置页的配置档案可保存任意多套设置；已有设置会无损迁移。

**首次测试建议**：任何 24 fps 片源——缓慢摇镜头的电影场景、动画 OP。60 Hz 屏幕上是 24 到 60；
144–240 Hz 屏幕上提升更多。

## 常见问题

**提示"未找到视频" / 按钮不出现。** 确认视频正在播放。部分播放器上按钮只在鼠标位于视频上方时出现。

**Netflix、Crunchyroll 上能用吗？** 不能：DRM 保护的视频对扩展天然不可见，浏览器只会给出黑帧。YouTube 和大多数其他站点正常。

**帧率计数低于我选的倍率。** 自动模式会适配 GPU 的真实算力余量，绝不为凑数字而卡顿；固定倍率同样会被限制。
想要更高请降低画质或倍率。

**面板提示该网站禁止 WebAssembly。** 少数站点（已核实的有 reddit.com）下发的安全策略会被 Chrome 同样应用到扩展的
WebAssembly 上，Framegen 无法在此运行；Firefox 不受影响。

**会偷偷联网吗？** 不会。没有服务器、没有遥测、没有统计；代码就在这里供你检查。

## 支持项目

Framegen 由一位开发者用一块中端 GPU 构建。扩展免费且将一直免费；背后的模型是在自费租用的云端 GPU 上训练的。
如果 Framegen 让你的视频更流畅，欢迎支持原作者：

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/monzikxd)

## 许可证

代码：**MIT**（[LICENSE](LICENSE)）。模型权重：FlyHighFG 权重遵循
[CC BY-NC 4.0](extension/engine/WEIGHTS_LICENSE.md)；上一代引擎权重供个人与研究使用
（[WEIGHTS_LICENSE.md](WEIGHTS_LICENSE.md)）。
