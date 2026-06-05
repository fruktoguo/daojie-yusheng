# 美术风格规范

本文档是当前项目生成和接入游戏美术资产的统一口径。后续 NPC、怪物、地图 tile、道具 icon、UI 小图标和音视频概念稿默认按本文档执行；只有用户明确要求试验新方向时才临时偏离。

## 核心风格

项目主风格定为：**克制写实的俯视像素仙侠**。

关键词：

- 俯视 2D 像素地图
- 低饱和、旧色调、边镇尘土感
- 清晰轮廓、硬边像素、少量手绘纹理
- 东方边镇、残阵、废墟、旧灾余波
- 克制仙侠，不走高亮玄幻、不走厚涂立绘、不走纯可爱 Q 版

叙事匹配：

- 玩家是乱世边地的外乡人，不是高光天命主角。
- 世界观靠残痕、误读、口供、遗物和现场痕迹推进，不靠华丽奇观解释。
- 画面应该体现“秩序还在勉力维持，灾劫余波从边角漏出”，而不是全屏特效和神仙大战。

## 资产层级

### 地图 Tile

- 视角：正俯视或轻微俯视，不做斜 45 度等距地图。
- 格式：dual-grid tileset，当前基准为 `256x256`、`4x4` atlas。
- 用途：terrain、surface、structure 分层渲染。
- 风格：纹理简洁、边界可读、局部有破损和旧痕，但不能过度细碎。
- 禁止：格线、文字、水印、摄影质感、厚涂光影、强透视建筑。

推荐生成词：

```text
top-down pixel art dual-grid 15-tile atlas, restrained xianxia frontier MUD, low saturation, weathered old surface, readable tile edges, simple uniform texture, no objects, no characters, no text, no grid lines
```

### NPC

- 默认尺寸：`128x128` RGBA 透明 PNG。
- 视角：地图表现用正面站姿或四方向站姿；当前单体试样先用正面。
- 模板：优先 `pixel_char_1` 或同系 `pixel_char_*`，避免混入高清 HD 模板。
- 造型：边镇职能和身份优先，服装有旧感，配饰要服务角色职业。
- 情绪：克制、沉稳、带生活痕迹；不做夸张卖萌表情。
- 轮廓：深色硬边，人物和地图底色能区分。

推荐生成词骨架：

```text
single adult NPC, full-body front standing pose, restrained xianxia frontier town style, low-saturation old cloth, clear dark pixel outline, calm expression, subtle worn details, transparent background, no weapon unless required, no other characters
```

### 怪物

- 普通怪默认尺寸：`64x64` 或 `128x128`，按战斗可读性决定。
- 精英、Boss 默认尺寸：`128x128`，必要时允许更大但必须单独接入规则。
- 模板：优先 `monster` 或带方向的像素怪物模板。
- 设计方向：妖兽不是卡通宠物，要克制、写实、仙侠，并带轻微克苏鲁污染感；局部特征来自“异变、残阵污染、地貌侵蚀”，不做全身触手堆叠。
- 朝向：当前运行时怪物只区分 `left` / `right`。生产默认做左向全身图；竖向移动和待机不额外要求前后图。
- 右向：无专用右向资源时，客户端会自动把基础图水平镜像。只有镜像后轮廓、武器、文字性符号或残阵结构明显不自然时，才补专用右向图。
- 禁止：血腥写实、高清厚涂、过度 Q 版、复杂到小尺寸不可读。

推荐生成词骨架：

```text
single pixel monster sprite, full-body left-facing side view, restrained realistic xianxia monster, subtle eldritch corruption, corrupted by old array residue and weathered terrain, readable silhouette, low saturation, clear dark outline, compact game sprite, transparent background, no text, no extra creatures
```

### 道具和 Icon

- 默认尺寸：`64x64` RGBA 透明 PNG。
- 模板：像素道具优先 `object`、`weapon`、`food` 等 pixel-gen 模板。
- 风格：形状先可读，再表现材质；不要为了细节牺牲小图标识别度。
- 色彩：每个 icon 可有一个识别主色，但整体不能高饱和霓虹化。

### UI

- UI 本体优先用代码实现，贴图只用于 icon、边框纹理、特殊符号。
- UI 色调应与现有深色/浅色主题兼容，不把游戏界面改成重装饰国风皮肤。
- 图标保持像素或扁平小图标风，不混入插画大图。

## 色彩与光影

全局色彩基调：

- 地面：灰绿、灰褐、石灰、泥土、暗青。
- 建筑：旧木、灰瓦、夯土、暗石。
- 异常区域：深紫、暗红、冷青、苍白云光，只作为局部主题色。
- 人物：低饱和衣物为主，用一两个小面积颜色标识身份。

光影规则：

- 地图 tile 只保留轻量方向感，不做强投影。
- NPC 和怪物用简洁明暗块表达体积。
- 特效和异常色不能压过格子可读性。

## 尺寸与文件规则

默认目标：

| 类型 | 尺寸 | 格式 | 背景 |
| --- | --- | --- | --- |
| dual-grid tile atlas | `256x256` | PNG | RGBA |
| NPC | `128x128` | PNG | RGBA 透明 |
| 普通怪 | `64x64` 或 `128x128` | PNG | RGBA 透明 |
| Boss / 关键怪 | `128x128` 起 | PNG | RGBA 透明 |
| 道具 / icon | `64x64` | PNG | RGBA 透明 |

缩放规则：

- 像素图只能用邻近采样。
- 只做整数倍缩放，例如 `2x`、`3x`。
- 禁止非整数缩放和平滑插值。

落盘规则：

- 试验资产放 `assets/generated/<task_slug>/`。
- 正式运行资产放 `packages/client/public/assets/runtime-image-packs/default/` 下对应目录。
- NPC 放 `npcs/`，怪物放 `monsters/`，地图 tile 放 `tiles/`。
- 文件名使用稳定业务 id，例如 `npc_qingxuan.png`、`m_bamboo_sprite.png`。
- 怪物基础图在 `manifest.json` 的实体 key 使用 `monster:<id>`；可选方向覆盖使用 `monster:<id>:left`、`monster:<id>:right`。查找顺序优先方向 key，再回退基础 key。
- 如果只有基础 key，右向显示会镜像基础图；因此基础图应按左向全身图制作，避免在图内放不可镜像的字形或强方向标识。

## MeowArt 生成规则

优先级：

1. 像素 NPC、怪物、道具、icon：`pixel-gen-template-info` 选模板后用 `pixel-gen-run`。
2. 地表纹理：`texture-gen-run`。
3. dual-grid 地形过渡：`tileset-gen-run`。
4. 只有概念图、整体 UI 视觉稿、大背景草案才使用 `gemini-generate-content`。
5. 像素资产如果 fallback 到通用生图，必须继续 `pixelate-run`，需要透明图时再 `remove-background-run --method pixel`。

当前推荐模板：

| 资产 | 模板 |
| --- | --- |
| 常规 NPC | `pixel_char_1` |
| 温和 NPC | `pixel_char_2` 或 `pixel_char_5` |
| 怪物 | `monster` |
| 道具 | `object` |
| 武器 | `weapon` |
| 植物 / 树 | `植物`、`树木` |

生成前检查：

- 是否属于像素资产。
- 是否需要单个对象还是批量对象。
- 是否需要方向。
- 输出目录是否是本次任务专用目录。

生成后检查：

- PNG 尺寸符合目标。
- `RGBA` 且透明通道正常。
- 轮廓在浅色和深色地图上都可读。
- 无多余人物、文字、水印、白底残边。
- 不与现有 tile 风格明显割裂。

## 禁止项

- 不把高清插画、厚涂、二次元立绘直接接入地图单位。
- 不混用高饱和 Q 版萌系和克制边镇像素风。
- 不生成带文字的 tile、icon、NPC 图。
- 不生成复杂背景包进 sprite。
- 不让怪物或 NPC 的细节密度超过游戏内显示尺寸可读范围。
- 不批量生成大量正式资产前跳过小批试样确认。

## 当前基准样例

- 地图 tile：`packages/client/public/assets/runtime-image-packs/default/tiles/*.png`
- NPC 试样：`assets/generated/npc_qingxuan_pixel/npc_qingxuan_pixel_front/sprite_00.png`

清玄试样可以作为“克制边镇修行执事”的方向参考，但后续若正式接入，应按稳定文件名复制到 runtime image pack，并在 manifest 中挂接。
