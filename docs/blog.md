# 从零写一个可视化智能体编排引擎：拖拽画布 + 流式执行

> 一个 6 年经验前端的复盘：不套现成库，从画布坐标系一路踩到流式渲染。
>
> 在线体验：https://agent-studio-canvas.app.workbuddy.host/ （打开即用，无需 API Key）

## 一、为什么要造这个轮子

市面上的 LLM 应用有个共同点：**界面决定它能不能被用起来**。

一个只会输出文字的聊天框，用户看不到"模型在想什么"；而一个能把「检索 → 推理 → 分支 → 工具 → 输出」画出来的界面，用户能一眼看懂这条链路为什么给出这个答案。这正是 Dify、Coze 这类产品的核心价值。

我想验证一件事：**这套交互到底难在哪**。所以我给自己定了个约束——不引入 React Flow，画布、连线、执行引擎全部手写。

理由有两个：

1. 套库只能证明我会读文档，手写能证明我理解坐标系、事件模型和渲染边界；
2. 手写的东西才敢在生产里改。React Flow 一旦要定制布局算法，改源码的成本比自研高得多。

最终产物体积也很克制：**169 KB / gzip 58 KB**，没有任何图形库。

## 二、整体架构

```
┌─────────────── 浏览器 ───────────────┐
│  Palette   →   Canvas   →  Config    │
│      （节点库）（画布）（配置面板）    │
│                    ↓                  │
│            runFlow 执行引擎            │
│     变量插值 / 分支路由 / 工具调用      │
│                    ↓                  │
│              streamChat               │
│        （演示模式走本地模拟）           │
└───────────────┬──────────────────────┘
                │  SSE（仅真实模型模式）
        ┌───────▼────────┐
        │  Node HTTP 服务 │  零依赖
        │  转发 + 静态托管 │
        └───────┬────────┘
                │
        OpenAI 兼容接口
```

三个设计决策值得展开：

**决策一：后端只做代理，不做业务。**

后端是零依赖的 `node:http` 服务，职责只有两件：托管静态文件、把 `/api/chat` 的请求以 SSE 形式转发给上游。为什么不让前端直连模型接口？

- **CORS**：多数厂商的 API 不允许浏览器跨域直连；
- **Key 暴露**：就算允许，Key 也会被打进前端产物。

Key 存在浏览器 `localStorage`，随请求转发即用即弃，服务端不留存。这样部署一次，任何人都能用自己的 Key 跑。

**决策二：演示模式放在前端。**

这是我考虑最久的一点。常规做法是后端返回一段假数据，但我把它放到了前端（`src/lib/mock.ts`），原因是：

> 模拟回复需要**完整上下文** —— 原始输入、上一步输出、知识库召回内容。而这些数据本来就在前端。绕一圈网络回来，既慢，又拿不到这些上下文，生成的回复跟真实链路对不上。

结果就是：**知识库检索是真的在跑**（bigram + IDF 打分），只有 LLM 生成环节被替换成剧本。用户看到的执行轨迹里，检索结果真实有效，而生成部分是标注清楚的模拟内容。这比全假演示可信得多。

**决策三：执行引擎不预排序，用边驱动。**

初学者容易这样写：先对图做拓扑排序，再按顺序执行。问题是——**条件分支会让拓扑序失效**，因为一半节点根本不该被执行。

所以我改成"边驱动"：从 `start` 出发，每执行完一个节点，就找出边决定下一步去哪。

```ts
const outgoing = flow.edges.filter(e => e.source === current.id)
const nextEdge = branch
  ? outgoing.find(e => e.branch === branch) ?? outgoing.find(e => !e.branch)
  : outgoing[0]
if (!nextEdge) break            // 无后继，自然结束
current = flow.nodes.find(n => n.id === nextEdge.target)
```

配一个 40 步的步数上限兜底环路，就够了。

## 三、画布：坐标系统才是真正的难点

拖拽本身很简单，难的是**缩放之后**。

### 3.1 屏幕坐标 → 画布逻辑坐标

节点位置是逻辑坐标（比如 `x=350`），但鼠标事件给的是屏幕坐标。中间隔着容器滚动和 `transform: scale`。第一版我没处理这个，缩放后拖拽节点会"飞"。

正确做法是拿**内层缩放元素**的 `getBoundingClientRect()`，再除以缩放比：

```ts
const toLocal = useCallback((clientX: number, clientY: number) => {
  const rect = innerRef.current?.getBoundingClientRect()
  return {
    x: (clientX - (rect?.left ?? 0)) / scale,
    y: (clientY - (rect?.top ?? 0)) / scale
  }
}, [scale])
```

关键在于对 `innerRef`（应用了 `transform: scale` 的那层）取 rect——它返回的已经是缩放后的视觉矩形，所以除以 `scale` 就还原成逻辑坐标。对 `.canvas` 取 rect 是错的，那层没有 transform。

### 3.2 连线的点击命中

连线是 SVG `<path>`，1.5px 宽，鼠标根本点不中。常规解法是叠一条透明的粗路径专门用来接事件：

```tsx
<path className="edge-hit" d={d} onClick={() => onDeleteEdge(edge.id)} />
<path className="edge-line" d={d} />
```

```css
.edge-hit { stroke: transparent; stroke-width: 16; pointer-events: stroke; }
```

这里有个细节：`fill: none` 的路径，`pointer-events` 必须设成 `stroke`，否则整条路径都不是命中区。而父级 `<svg>` 我设了 `pointer-events: none`，避免遮挡画布拖拽——所以每条可交互路径要单独把事件打开。

### 3.3 端口对齐：CSS 和计算必须用同一个公式

连线端点由 JS 算，端口圆点由 CSS 定位。这两处一旦不一致，线就会"飘出"圆点。

我把偏移抽成了唯一的真源：

```ts
export function portOutPos(node: { x: number; y: number }, branch?: Branch) {
  if (branch) {
    return { x: node.x + NODE_W * BRANCH_RATIO[branch], y: node.y + NODE_H }
  }
  return { x: node.x + NODE_W / 2, y: node.y + NODE_H }
}
```

CSS 里对应写成百分比：

```css
.port-out { bottom: -7px; left: calc(50% - 6px); }
.port-true { left: calc(30% - 6px); }
.port-false { left: calc(70% - 6px); }
```

`BRANCH_RATIO = { true: 0.3, false: 0.7 }` 和 CSS 的 30% / 70% 是同一个数。改布局时只改一处，两边同步。

### 3.4 一个被截图逼出来的版式重构

第一版我照搬了桌面流程图的主流做法：**从左到右横向排布**。7 个节点铺开，逻辑宽度 1880px。

在 1560 宽的窗口里，可视画布区只有约 968px。自适应缩放算下来是 **51%** —— 我把截图放大一看，节点文字已经糊得认不出来了。

**能看见全貌但看不清字，等于没看见。**

于是我做了个反直觉的改动：**把流程改成自上而下纵向流动**，端口从"左进右出"改成"上进下出"，分支节点在底部按 30%/70% 分出两个出口。

效果是逻辑宽度从 1880px 降到 940px，自适应缩放从 51% 提到 **91%** —— 文字几乎保持原尺寸，同时全貌仍然一屏可见。

代价是要同时改四处：端口计算、CSS 定位、贝塞尔曲线方向、以及示例流程的坐标。但这笔账很划算：

```ts
// 水平版本
const dx = Math.max(48, Math.abs(x2 - x1) * 0.5)
return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`

// 垂直版本：只换方向，思路不变
const dy = Math.max(38, Math.abs(y2 - y1) * 0.5)
return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`
```

**教训：排版宽度是产品需求，不是实现细节。** 一个"能用"的引擎，如果默认视图看不清，用户会直接判定它不可用。

## 四、流式渲染：每帧一次 setState

SSE 的 token 来得又快又碎，一句话可能推来上百个 chunk。如果每个 chunk 都 `setMessages`，React 会重渲染整个消息列表一百次。真机测试时能明显感到打字卡顿。

解法是用 `requestAnimationFrame` 把同一帧内的所有 token 合并成一次更新：

```ts
const pendingRef = useRef('')
const rafRef = useRef<number | null>(null)

function scheduleFlush() {
  if (rafRef.current != null) return        // 本帧已排队，直接累积
  rafRef.current = requestAnimationFrame(() => {
    rafRef.current = null
    const chunk = pendingRef.current
    pendingRef.current = ''
    const id = activeIdRef.current
    if (!id || !chunk) return
    setMessages(prev => prev.map(m =>
      m.id === id ? { ...m, content: m.content + chunk } : m
    ))
  })
}
```

关键点是 `if (rafRef.current != null) return` 这个早退：**一帧内无论来多少 token，只排一次队**，其余全部累加到 `pendingRef`。

另外流结束时要补一次 `finishFlush()`，清掉未提交的残余和待执行的 rAF，否则最后几个字会丢。

## 五、执行可视化：让每一步都能被追问

编排产品最容易忽略的体验是"**出错时用户看不到错在哪**"。

所以我让引擎全程以事件流的形式往外吐状态：

```ts
export type RunEvent = {
  type: 'node:start' | 'node:chunk' | 'node:end' | 'error' | 'done'
  nodeId?: string
  text?: string
  message?: string
}
```

UI 层据此同时做三件事：把正在执行的节点高亮成脉冲态、把对应连线加粗、把每个节点的输出和耗时收集成可展开的"执行轨迹"。

这个设计还有个附带好处：**分支路由变得可见**。用户问"我要投诉"，能直接在轨迹里看到条件节点判定为 `是`、以及工单登记节点输出的时间戳。这比任何文档都能说明"这个流程在干什么"。

## 六、变量作用域：一个让示例流程说得通的设计

节点的输出默认写进 `ctx.prev`（上一步结果），同时支持自定义 `outputKey`：

```ts
ctx.prev = output
if (node.config.outputKey) ctx[current.config.outputKey] = output
```

这个看似多余的机制，解决了一个真实问题。看示例流程：

```
条件节点 ──是──→ 登记工单 ──→ [答复 + 工单回执]
         └─否──→ [直接答复]
```

如果只有 `prev`，那么走"是"分支时 `prev` 会变成工单的时间戳，最终的答复节点就取不到 LLM 的输出了。

而给 LLM 节点设 `outputKey: "answer"` 之后，无论走哪条路径，`{{answer}}` 始终指向推理结果：

```
{{answer}}

（已为您登记工单，受理时间：{{prev}}，人工客服将在 2 小时内联系您。）
```

**变量系统的价值不在功能多，而在让用户能表达"我需要从这个分支合并回来的那份数据"。**

## 七、测试：Playwright 帮我逮到的两个真实时序坑

我用 Playwright 写了个冒烟脚本（`scripts/smoke.py`），覆盖渲染、选中、执行、分支路由、控制台报错五项。

写的过程中，测试连续给我报了三次"失败"，但**没有一个是产品 bug，全是测试自己的时序问题**：

1. **在流式输出中途做断言**。我看到气泡有 20 个字符就以为跑完了，实际上那是流式的开头几个字，自然匹配不到关键词。正确做法是等一个"流程结束"的信号 —— 我选择了等 `.stop-btn` 从 DOM 消失。
2. **轨迹折叠状态下数步骤**。执行轨迹默认是折叠的，`.steps-list li` 当然是 0。得先点开再断言。
3. **用 `count()` 判断元素存在**。`count()` 不做自动等待，而 `inner_text()` 会。所以出现了"判断为不存在、打印却拿到内容"的诡异现象。

这三次误报反过来证明了一件事：**流式 UI 的测试必须绑定明确的状态信号，不能靠"看起来有内容了"**。写在博客里，是因为我猜很多人会踩同样的坑。

## 八、如果继续做

目前是可用状态，下一步优先级排序：

1. **流程持久化到服务端**，支持多人协作编辑——现在只存在 `localStorage`；
2. **节点级重试**，某一步失败时从该节点续跑，而不是整条流程重来；
3. **子流程与循环节点**，现在的引擎是单向无环的；
4. **真实向量检索**，把 bigram + IDF 换成 embedding，检索质量会有一个台阶。

## 九、小结

这个项目让我重新理解了一件事：

> 前端工程师在 AI 应用里最值钱的能力，不是调通 API，而是**把不可见的推理过程变成可操作的界面**。

坐标系、事件模型、渲染性能、状态编排——这些没有一样是新东西，但它们组合起来，就决定了这个 AI 产品用户敢不敢信、会不会用。

而"自研"的意义也不在于证明能写，而在于：**当截图告诉我 51% 看不清时，我有能力推翻整个版式重做。**

---

**技术栈**：React 18 · TypeScript · Vite 5 · `node:http`（零依赖后端）
**代码规模**：约 1800 行（含样式），产物 gzip 58 KB
**在线体验**：https://agent-studio-canvas.app.workbuddy.host/
