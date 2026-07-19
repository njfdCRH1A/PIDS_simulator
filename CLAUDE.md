# PIDS 模拟器 项目规范指南

## 1. 编辑纪律

### 1.1 嵌套结构禁逐块 Edit

嵌套深度 ≥3 层的函数、循环体、条件链，**直接 Write 整个函数**，不准用 Edit 逐块替换。

- 经验阈值：改动 > 单文件 30%、或涉及首尾配对（`{}`、`()`、`if/else` 链），直接用 Write
- 函数边界就是天然锚点——`function xxx() {` 到配对的 `}`
- 小改动（±10 行内）才用 Edit

### 1.2 多位置改动先列 plan 再执行

修改前，先用 Read 确认各目标块的行号和唯一上下文，列出清单：

```
Block A: renderPIDSDisplay 站点生成逻辑 (行 105-126) → 确认 → Edit
Block B: resizePIDS 宽高计算 (行 61-90) → 确认 → Edit
Block C: createStationItem 事件绑定 (行 158-175) → 确认 → Edit
```

- 任一步 Edit 失败 → 停，不准跳，不准用脚本"自动找"
- 所有失败必须回到 Read → 确认 → Edit 循环

### 1.3 不改无关

- 不改没坏的东西
- 不"改进"相邻未要求的代码/注释/格式/变量名
- 不擅自修复相邻的 linter warning
- 发现孤儿代码（因本次改动变无用）→ 可删，在改动汇报中说明
- 原本就死的代码（如 `resources/` 中未引用的 SVG）→ 先告知用户，不擅自删

### 1.4 改完自验

每改完一个文件，立即 Read 文件末尾 10 行，核对：

1. 最后一个函数/块是否有闭合的括号 `}`
2. 缩进是否与上下文一致
3. 新增/删除的 `{}` 数量是否匹配（每个 `if/for/function` 都应有配对的 `}`）
4. 浏览器 Console 是否有红色报错

---

## 2. 函数头注释规范（JSDoc）

```javascript
/**
 * functionName - 功能简述
 *
 * 详细描述，说明函数做了什么、为什么这么做。
 *
 * @param  {Type}   paramName - 参数说明
 * @returns {Type}  返回值说明
 *
 * 依赖:
 *   - 全局变量或外部函数
 *
 * 使用示例:
 *   functionName(args);
 *
 * 注意事项:
 *   1. 特殊情况说明
 */
```

---

## 3. Debug 日志开关

每个模块保留独立的 debug 开关，方便定位问题：

```javascript
// 模块级 debug 开关
const DEBUG = false;
const DEBUG_RENDER = false;   // SVG 渲染相关
const DEBUG_STATION = false;  // 车站管理相关
const DEBUG_RESIZE = false;   // 自适应尺寸相关

function log(moduleDebug, ...args) {
    if (moduleDebug || DEBUG) console.log('[PIDS]', ...args);
}

// 使用
log(DEBUG_RENDER, '重新生成SVG, 车站数:', stations.length);
```

- 子模块 debug 可独立开启，也可被 `DEBUG` 一键开启
- 发布前确保 `DEBUG = false`

---

## 4. 改动汇报模板

每次代码修改完成后，输出结构化汇报：

```markdown
## 改动汇报: {标题}

**目标**: {一句话描述修改目的}

**文件改动**:
- `path/file.js`: +新增xxx, -删除xxx, ~修改xxx

**逻辑对比**:
| 维度 | 旧行为 | 新行为 |
|------|--------|--------|

**验收**: 浏览器打开 index.html，检查 {具体现象}
```

---

## 5. 项目技术约束

| 约束 | 说明 |
|------|------|
| 零依赖 | 不引入任何 npm 包、CDN 链接、第三方库 |
| 纯静态 | 无需构建工具，浏览器直接打开 `index.html` |
| ES6+ | 使用 `const`/`let`、箭头函数、模板字符串 |
| 无模块化 | 所有 JS 代码在 `main.js` 单文件中，通过全局对象 `window.PIDS` 暴露接口 |
| CSS 无预处理器 | 原生 CSS3，Flexbox 布局 |

---

## 6. 文件结构约束

```
g:\PIDS_simulator\
├── index.html          # 入口页面（唯一 HTML）
├── main.js             # 全部 JS 逻辑
├── style.css           # 全部样式
├── resources/          # 静态资源（SVG 图标等）
│   ├── arrow/          # 方向箭头动画帧
│   └── running/        # 运行状态图标
└── CLAUDE.md           # 本文件
```

- 新建 JS/CSS 文件需先讨论，优先考虑在现有文件中扩展
- 新建资源文件放入 `resources/` 对应子目录
- 预览截图等临时文件放项目根目录

---

## 7. 验收方式

由于项目无测试框架，改动验收方式为：

1. 浏览器打开 `index.html`
2. 操作左侧控制面板（颜色/长度/粗细/位置/尺寸滑块）
3. 添加/编辑/删除车站
4. 缩放浏览器窗口验证响应式布局
5. 打开 DevTools Console 确认无红色报错
