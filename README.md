# 企鹅鹅 Peng · 环岛骑行（Peng the Goose — Island Circuit）

用 **Three.js** 手写的影片式 3D 演示：一只名叫 **Peng** 的白鹅骑着自行车，绕一座大型、细节丰富的海岛骑行。
**全部几何、贴图、天空、水面都是程序化生成的，不依赖任何外部素材**（无模型、无贴图、无 HDR、无字体文件）。
金色的黄昏光照 + 电影级后期（泛光 / 分级 / 暗角 / 颗粒 / 色差），镜头由「导演」系统自动运镜。

> 名字致敬微信小游戏《Peng the Goose》，但这里是完全独立实现的作品，与原作者无关。

## 运行

ES 模块需要 `http` 协议，**不能用 `file://` 直接打开**。需要 Node 跑无头自检时才要 `npm install`（只为 `three`）。

```bash
cd goose-peng-island
npm install            # 只为装 three（浏览器端依赖；首次才需要）
npm run serve          # 起本地静态服务器 → http://127.0.0.1:8123/
# 浏览器打开 http://127.0.0.1:8123/
```

不装 npm 依赖也能跑：只要 `node_modules/three/` 存在（`importmap` 指向它）即可。服务器就是
`python3 -m http.server`（见 `scripts/serve.sh`），零第三方依赖。

## 操作

| 键 | 作用 |
|---|---|
| `1` – `8` | 切换 8 个预设机位 |
| `←` / `→` | 上一个 / 下一个机位 |
| `[` / `]`（或 `-` / `=`） | 减速 / 加速（倍率 0.1×–6×，每步 ×1.25） |
| `0` | 速度倍率复位为 ×1.0 |
| `Space` | 暂停 / 继续 |
| `F` | 自由视角（OrbitControls，鼠标拖拽/滚轮） |
| `H` | 隐藏 / 显示界面 |

8 个机位：`追随`、`低位轨道`、`正面迎拍`、`环绕`、`升空远景`、`过肩主观`、`俯瞰越肩`、`岛屿全景`。
每个机位「停留」一段时间后由导演自动切换，机位参数在 `src/director.js` 的 `SHOTS`。

## 目录结构

```
index.html            # 页面骨架 + importmap（three → node_modules）+ HUD
src/
  config.js           # 世界参数（岛半径/公路/太阳/雾）与调色板，调参从这里开始
  main.js             # 装配世界、主循环；导出 window.__app 供无头自检
  director.js         # 8 个机位 + 自动运镜 + 平滑（局部偏移空间）
  postfx.js           # EffectComposer：MSAA RT → Bloom → OutputPass → 分级着色
  ui.js / styles.css  # 载入进度、HUD、致命错误面板
  util/
    noise.js          # 种子化 Perlin / fbm / ridged 噪声
    geo.js            # 几何合并、随机分布等工具
  world/
    sky.js            # 渐变天穹 + 太阳 + 云 + 光照（含 PMREM 环境反射源）
    terrain.js        # 高度场岛屿 + 顶点色（沙滩/草/岩/雪）+ 道路整形 + 高度图纹理
    water.js          # 海面着色器（波法线/菲涅尔/高光/岸线泡沫）+ 内陆水塘
    road.js           # 环岛公路曲线、路面、虚线、路肩、护栏、路灯
    vegetation.js     # 松树/阔叶树/灌木/花海（实例化）
    props.js          # 村庄、灯塔、风车、码头、长椅、终点门等
    creatures.js      # 飞鸟、蝴蝶、鱼群等动态点缀
  actors/goose.js     # 主角：鹅 + 自行车模型与骑行动画
scripts/
  serve.sh            # 本地静态服务器
  shot.mjs            # 无头 Chrome：加载/收集控制台错误/按机位截图
  eval.mjs            # 无头 Chrome：在页面里求值表达式（可截图）
build/shots/          # 自检截图输出（生成物，勿手改）
```

## 自检 / 截图（无头 Chrome）

改完画面后建议跑一遍无头自检：它会加载页面、等 `window.__APP_READY__`、逐机位截图并回报控制台错误。

```bash
npm run serve &            # 先起服务器（8123）
npm run shots              # 渲染 shot00..shot07 到 build/shots/
node scripts/shot.mjs http://127.0.0.1:8123/ build/shots 3 5   # 只渲染指定机位
node scripts/eval.mjs http://127.0.0.1:8123/ "window.__app.camera.position.toArray()"
```

`scripts/shot.mjs` 退出码非 0 表示有异常。Chrome 路径写死在脚本里
（`/Applications/Google Chrome.app/...`），换机器要改。用 `--use-angle=metal`，
无头下若黑屏可去掉该行让 Chrome 走软件渲染。

页面导出了 `window.__app`，便于在控制台或 `eval.mjs` 里探针调试：
`THREE / scene / camera / renderer / director / cyclist / terrain / water / road`，
以及 `setShot(i)`、`seek(dist)`、`setPaused(v)`、`render()`。

## 设计要点

- **纯程序化**：地形是种子化 fbm 高度场；天空是渐变穹顶 + 程序化云；水面是自定义 GLSL；
  树木/花草走 `InstancedMesh`；鹅和自行车都是基础几何体拼装。改主题基本只动 `config.js` 与各 `world/*.js`。
- **水面稳定性**：远场水面很容易出摩尔纹/棋盘格。做法是——高频波按距离 LOD 淡出（`addWaveLod`）、
  中尺度起伏用多倍频噪声（无方向性，避免平行条纹）、掠射角下按视线夹角淡出法线扰动
  （`graze`，屏幕压缩导致的横向条纹）、远处高光指数放软。**不要**在大坐标上直接用噪声（`fract` 丢精度）。
- **运镜平滑在「局部偏移空间」**：`Director` 保存的是相对鹅的偏移（`curPos`/`curTarget`），
  平滑后再叠加到鹅的位置上。若在**世界空间**平滑，会因速度产生约 `v·τ` 的稳态滞后，把主角甩到画面外。
- **后期链**：`WebGLRenderTarget({samples:4, HalfFloat})` 做 MSAA（因为关掉了 canvas 的 `antialias`），
  Bloom 强度/阈值取得较克制（0.26 / 0.90），曝光 0.92，避免背光处白鹅过曝成一片死白。
- **阴影**：只有太阳投影，阴影相机跟随主角，保证近处阴影清晰。
- **车轮转动可见性**：轮子转角**直接取「行进里程 / 轮半径」**（`wheelAngle = dist / WHEEL_R`，
  曲柄再乘齿比），因此严格随速度与里程变化，且不依赖每帧 `dt`——掉帧、变速、暂停都不会让轮子
  与地面打滑或跳变。轮辐均匀对称，只看轮辐会因频闪/混叠「看不出在转」，所以每个轮子上另有
  三个不对称标记：一根**红色轮辐** + **红色反光片**（同在 `MARK_A`）与**气门嘴**（0°）。
  骑行速度可实时调（`[` / `]`，见 `Cyclist.setSpeedMul`），想看清转动就减速。

## 调参速查

| 想改 | 去哪 |
|---|---|
| 岛屿大小、公路半径、太阳角度、雾、车速 | `src/config.js` 的 `WORLD` |
| 地表/植被配色 | `src/config.js` 的 `PALETTE` |
| 机位构图与切换节奏 | `src/director.js` 的 `SHOTS` |
| 水面观感（波长/高光/泡沫） | `src/world/water.js` 的片元着色器 |
| 泛光/曝光/分级 | `src/postfx.js`、`src/main.js` 的 `toneMappingExposure` |
