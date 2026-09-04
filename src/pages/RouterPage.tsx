import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, CodeBlock, ResourceTable } from '../components/CodeBlock';

export function RouterPage() {
  return (
    <div className="prose max-w-none">
      <h1>AIBrix — 云原生 LLM 推理基础设施</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-09</span>
        <span className="page-meta-item">⏱️ 阅读约 35 分钟</span>
        <span className="page-meta-item">🏷️ 专题 · 服务调度器</span>
      </div>
      <p>
        <strong>AIBrix</strong> 是 vLLM 团队开源的云原生 LLM 推理基础设施平台，运行在 Kubernetes 之上，提供从<strong>流量路由、弹性伸缩、KV Cache 管理、P/D 分离</strong>到<strong>异构 GPU 调度</strong>的完整推理栈。项目基于 Go 语言实现，采用 Kubernetes Operator 模式，通过一系列 CRD 和控制器实现声明式管理。
      </p>

      <Callout type="tip">
        <strong>核心定位：</strong>AIBrix 是 LLM 推理的 <strong>Kubernetes 控制平面</strong>，不是推理引擎本身。它管理 vLLM/SGLang 等推理引擎的部署、路由、扩缩容和 KV Cache 生命周期，让推理引擎专注于模型计算。
      </Callout>

      {/* ==================== 1. 整体架构 ==================== */}
      <div className="section-divider"><span>整体架构</span></div>

      <h3>1.1 系统全景</h3>
      <MermaidDiagram chart={`
graph TB
    subgraph Clients["客户端层"]
        C1["Chat UI"]
        C2["SDK / API"]
    end

    subgraph Gateway["Gateway 层"]
        EG["Envoy Gateway<br/>(K8s Gateway API)"]
        EP["Envoy ExtProc<br/>(AIBrix Gateway Plugin)"]
        EG --> EP
    end

    subgraph ControlPlane["AIBrix Control Plane"]
        subgraph Controllers["Controller Manager"]
            MC["ModelRouter<br/>HTTPRoute 管理"]
            MA["ModelAdapter<br/>LoRA 适配器"]
            PA["PodAutoscaler<br/>弹性伸缩"]
            SS["StormService<br/>分布式推理"]
            KV["KVCache<br/>KV Cache 管理"]
            MCL["ModelClaim<br/>模型声明"]
        end
        subgraph Infra["基础设施"]
            Redis["Redis<br/>路由状态 / 限流"]
            Prometheus["Prometheus<br/>指标采集"]
        end
    end

    subgraph DataPlane["数据平面"]
        subgraph Pool1["Model Pool A"]
            W1["vLLM Pod 1"]
            W2["vLLM Pod 2"]
        end
        subgraph Pool2["Model Pool B"]
            W3["SGLang Pod 1"]
            W4["SGLang Pod 2"]
        end
        subgraph KVCache["KV Cache 集群"]
            KV1["HPKV / Infinistore"]
            KV2["Vineyard"]
        end
    end

    Clients --> EG
    EP -->|"路由决策"| MC
    EP -->|"指标采集"| Prometheus
    PA -->|"缩扩容"| Pool1
    PA -->|"缩扩容"| Pool2
    KV --> KVCache
    SS -->|"编排"| Pool1
    SS -->|"编排"| Pool2
    Controllers -->|"状态同步"| Redis
      `} />

      <h3>1.2 核心 CRD 资源</h3>
      <table>
        <thead><tr><th>CRD</th><th>API Group</th><th>职责</th></tr></thead>
        <tbody>
          <tr><td><strong>PodAutoscaler</strong></td><td>autoscaling.aibrix.ai</td><td>LLM 感知的弹性伸缩，支持 HPA/KPA/APA 三种策略</td></tr>
          <tr><td><strong>ModelAdapter</strong></td><td>model.aibrix.ai</td><td>LoRA 适配器生命周期管理，调度到推理 Pod</td></tr>
          <tr><td><strong>ModelClaim</strong></td><td>model.aibrix.ai</td><td>模型声明式分配，支持池化策略</td></tr>
          <tr><td><strong>KVCache</strong></td><td>orchestration.aibrix.ai</td><td>分布式 KV Cache 集群的声明式管理</td></tr>
          <tr><td><strong>StormService</strong></td><td>orchestration.aibrix.ai</td><td>多角色分布式推理编排（如 P/D 分离）</td></tr>
          <tr><td><strong>RoleSet</strong></td><td>orchestration.aibrix.ai</td><td>StormService 内部角色（prefill/decode）管理</td></tr>
          <tr><td><strong>RayClusterFleet</strong></td><td>orchestration.aibrix.ai</td><td>RayCluster 的滚动更新和版本管理</td></tr>
          <tr><td><strong>RayClusterReplicaSet</strong></td><td>orchestration.aibrix.ai</td><td>RayCluster 副本集管理</td></tr>
        </tbody>
      </table>

      <h3>1.3 Controller Manager 启动流程</h3>
      <MermaidDiagram chart={`
sequenceDiagram
    participant Main as main.go
    participant Init as controller.Initialize()
    participant Setup as controller.SetupWithManager()
    participant Ctrl as 各 Controller

    Main->>Main: 解析 --controllers 参数
    Main->>Main: features.InitControllers("*")
    Main->>Main: RegisterSchemas (CRD 注册)
    Main->>Main: ctrl.NewManager (K8s Manager)
    Main->>Main: cache.Init (若 ModelAdapter 启用)
    Main->>Init: controller.Initialize(mgr)
    Init->>Init: 根据 features 开关添加 Controller
    Init-->>Main: controllerAddFuncs 列表
    Main->>Main: go setupControllers(mgr, ...)
    Main->>Main: mgr.Start() → 启动所有 Controller
    Note over Main,Ctrl: setupControllers 等待证书就绪
    Setup->>Ctrl: podautoscaler.Add(mgr)
    Setup->>Ctrl: modeladapter.Add(mgr)
    Setup->>Ctrl: modelrouter.Add(mgr)
    Setup->>Ctrl: modelclaim.Add(mgr)
    Setup->>Ctrl: kvcache.Add(mgr)
    Setup->>Ctrl: stormservice/roleset/podset.Add(mgr)
      `} />

      <CodeBlock language="go" title="Controller 插件化注册机制" code={`// pkg/controller/controller.go
var controllerAddFuncs []func(manager.Manager, config.RuntimeConfig) error

func Initialize(mgr manager.Manager) error {
    if features.IsControllerEnabled(features.PodAutoscalerController) {
        controllerAddFuncs = append(controllerAddFuncs, podautoscaler.Add)
    }
    if features.IsControllerEnabled(features.ModelAdapterController) {
        controllerAddFuncs = append(controllerAddFuncs, modeladapter.Add)
    }
    if features.IsControllerEnabled(features.ModelRouteController) {
        controllerAddFuncs = append(controllerAddFuncs, modelrouter.Add)
    }
    if features.IsControllerEnabled(features.KVCacheController) {
        controllerAddFuncs = append(controllerAddFuncs, kvcache.Add)
    }
    if features.IsControllerEnabled(features.StormServiceController) {
        controllerAddFuncs = append(controllerAddFuncs, roleset.Add)
        controllerAddFuncs = append(controllerAddFuncs, stormservice.Add)
        controllerAddFuncs = append(controllerAddFuncs, podset.Add)
    }
    return nil
}

// 按需启用/禁用: --controllers="*" 或 --controllers="pod-autoscaler-controller,-kv-cache-controller"`} />

      {/* ==================== 2. Gateway 与路由 ==================== */}
      <div className="section-divider"><span>Gateway 与多策略路由</span></div>

      <h3>2.1 架构设计</h3>
      <p>AIBrix Gateway 基于 <strong>Envoy Proxy + ExtProc 插件</strong> 实现，是 LLM 推理集群的统一流量入口。它作为 Envoy 的外部处理插件运行，在请求/响应生命周期中插入路由决策、限流、鉴权等逻辑。</p>

      <MermaidDiagram chart={`
graph TB
    subgraph Envoy["Envoy Proxy"]
        L1["Listener"]
        F1["HTTP Filter Chain"]
        L1 --> F1
    end

    subgraph ExtProc["AIBrix Gateway Plugin (ExtProc)"]
        subgraph ReqPhase["Request Phase"]
            RH["请求头处理<br/>Header Processing"]
            RB["请求体处理<br/>Body Processing"]
            Auth["API Key 鉴权"]
            RL["速率限制<br/>Rate Limiter"]
        end
        subgraph RoutePhase["Route Phase"]
            Router["多策略路由器<br/>RouterManager"]
            Select["Select(ctx) → Router"]
            Validate["Validate(alg) → ok"]
        end
        subgraph RspPhase["Response Phase"]
            RspH["响应头处理"]
            RspB["响应体处理<br/>Streaming支持"]
        end
    end

    subgraph Backend["路由算法"]
        PC["prefix-cache"]
        LB["load-balance"]
        LR["least-request"]
        LL["least-latency"]
        PD["pd (P/D分离)"]
        SLO["slo-*"]
    end

    F1 --> ExtProc
    Router --> Backend
    Router -->|"Redis 状态同步"| Redis["Redis"]
      `} />

      <h3>2.2 多策略路由引擎</h3>
      <p>AIBrix 的路由引擎支持<strong>多策略加权组合</strong>，每个策略独立打分，最终按权重系数合成最终分数。这是其相比传统单一策略路由的核心优势。</p>

      <MermaidDiagram chart={`
flowchart TB
    A["请求到达"] --> B["ParseMultiRouterConfig<br/>解析算法配置"]
    B --> C["appendLoadBalanceBlend<br/>自动混合 load-balance"]
    C --> D{"独占策略?<br/>(pd, slo*)"}
    D -->|"是"| E["直接使用独占策略路由"]
    D -->|"否"| F["多策略路由<br/>multiStrategyRouter"]
    F --> G["每个策略独立 ScoreAll()"]
    G --> H["Winsorize 异常值裁剪"]
    H --> I["Min-Max 归一化到 [0,1]"]
    I --> J["加权求和: Σ(score × weight/totalWeight)"]
    J --> K["按最终分数排序"]
    K --> L["选择最高分 Pod"]
    L --> M["setTargetPort<br/>(多端口支持)"]
    M --> N["返回路由目标"]
      `} />

      <CodeBlock language="go" title="多策略路由核心算法 (router.go)" code={`// 路由配置格式: "prefix-cache:2,load-balance:1,least-request"
// 权重系数范围 [0, 1000000]，默认 1

func (m *multiStrategyRouter) scoreAndRank(ctx *types.RoutingContext, pods types.PodList) (*v1.Pod, ...) {
    totalWeight := 0.0
    for _, item := range m.config.Items {
        totalWeight += float64(item.Coefficient)
    }

    finalScores := make(map[*v1.Pod]float64)
    for _, item := range m.config.Items {
        scorer := m.scorers[item.Name]

        // 1. 各策略独立打分
        scores, scored, _ := scorer.ScoreAll(ctx, pods)

        // 2. Winsorize 异常值裁剪 + Min-Max 归一化到 [0,1]
        normScores := m.normalizeScoresArray(scores, scored, scorer.Polarity())

        // 3. 加权累加
        weightFraction := float64(item.Coefficient) / totalWeight
        for i, pod := range pods {
            finalScores[pod] += normScores[i] * weightFraction
        }
    }

    // 4. 选最高分 Pod（平局按 Pod 名称字典序）
    sort.Slice(topPods, func(i, j int) bool {
        return topPods[i].Name < topPods[j].Name
    })
    return topPods[0], finalScores, nil
}`} />

      <h3>2.3 路由算法一览</h3>
      <table>
        <thead><tr><th>算法</th><th>类型</th><th>评分维度</th><th>适用场景</th></tr></thead>
        <tbody>
          <tr><td><strong>prefix-cache</strong></td><td>PodScorer</td><td>请求前缀与 Pod 缓存匹配度</td><td>多轮对话、Agent 工作负载</td></tr>
          <tr><td><strong>load-balance</strong></td><td>PodScorer</td><td>Pod 容量感知的 pending_time</td><td>通用负载均衡（自动混合）</td></tr>
          <tr><td><strong>least-request</strong></td><td>PodScorer</td><td>当前活跃请求数最少</td><td>多端口/数据并行 Pod</td></tr>
          <tr><td><strong>least-latency</strong></td><td>PodScorer</td><td>历史延迟最低</td><td>延迟敏感场景</td></tr>
          <tr><td><strong>least-kv-cache</strong></td><td>PodScorer</td><td>KV Cache 使用率最低</td><td>长序列，KV Cache 压力大</td></tr>
          <tr><td><strong>least-gpu-cache</strong></td><td>PodScorer</td><td>GPU Cache 利用率最低</td><td>GPU 显存敏感</td></tr>
          <tr><td><strong>throughput</strong></td><td>PodScorer</td><td>吞吐量最高</td><td>批量推理</td></tr>
          <tr><td><strong>pd</strong></td><td>独占</td><td>P/D 分离：prefill→decode 路由</td><td>P/D 分离架构</td></tr>
          <tr><td><strong>slo-*</strong></td><td>独占</td><td>SLA 感知路由</td><td>有延迟 SLA 要求的场景</td></tr>
          <tr><td><strong>random</strong></td><td>Router</td><td>随机选择</td><td>降级兜底</td></tr>
          <tr><td><strong>power-of-two</strong></td><td>Router</td><td>随机选 2 个，选负载更低的</td><td>大规模集群</td></tr>
          <tr><td><strong>prefix-cache-preble</strong></td><td>PodScorer</td><td>前缀缓存 + 可抢占特性</td><td>需要缓存驱逐的场景</td></tr>
        </tbody>
      </table>

      <h3>2.4 自动负载均衡混合 (Auto-Blend)</h3>
      <p>AIBrix 路由引擎的一个关键设计是<strong>自动在用户选择的路由策略后混合 load-balance 策略</strong>（用户无感知），防止单一策略持续将流量导向已过载的 Pod。</p>

      <CodeBlock language="go" title="Auto-Blend 负载均衡混合" code={`// 自动混合策略 — 用户选择 "prefix-cache" 时，实际执行:
// "prefix-cache:5,load-balance:4" (可配置权重比例)

func appendLoadBalanceBlend(algStr string, cfg *MultiRouterConfig) (string, bool) {
    // 独占策略 (pd, slo*) 不混合 —— 它们有自己的 Pod 选择逻辑
    if len(cfg.Items) == 1 && isExclusiveStrategyName(cfg.Items[0].Name) {
        return "", false
    }

    // 裸 "prefix-cache" 使用专用混合比例 (5:4)
    if prefixCacheOnly {
        blended = fmt.Sprintf("%s:%d,%s:%d",
            RouterPrefixCache, autoBlendPrefixCacheWeight,      // 5
            RouterLoadBalance, autoBlendPrefixCacheLoadBalanceWeight) // 4
    } else {
        blended += fmt.Sprintf(",%s:%d", RouterLoadBalance, autoBlendLoadBalanceWeight)
    }

    // 非 prefix-cache 策略还需混合 least-request (多端口支持)
    if !includesPrefixCache && !mentioned["least-request"] {
        blended += fmt.Sprintf(",%s:%d", RouterLeastRequest, autoBlendLeastRequestWeight)
    }
    return blended, true
}`} />

      <h3>2.5 请求处理完整流程</h3>
      <MermaidDiagram chart={`
sequenceDiagram
    participant C as Client
    participant E as Envoy Proxy
    participant G as Gateway Plugin
    participant Auth as Auth Module
    participant RL as Rate Limiter
    participant Router as RouterManager
    participant Pod as vLLM/SGLang Pod

    C->>E: POST /v1/chat/completions
    E->>G: ExtProc: RequestHeaders

    G->>G: 提取 model, stream, headers
    G->>Auth: API Key 验证
    Auth-->>G: User 身份

    G->>RL: 速率检查
    RL-->>G: 允许/拒绝

    G->>G: 解析 X-Aibrix-Routing-Strategy
    G->>Router: Validate(routingAlg)
    Router-->>G: 支持的算法?

    E->>G: ExtProc: RequestBody
    G->>G: 解析 prompt, token 数
    G->>Router: Select(ctx)
    Router->>Router: 多策略评分
    Router-->>G: Target Pod IP:Port

    G->>G: 设置 X-Target-Pod 头
    G-->>E: 修改请求头 (添加路由目标)

    E->>Pod: 转发请求到目标 Pod
    Pod-->>E: 流式响应 (SSE)

    E->>G: ExtProc: ResponseBody
    G->>G: 记录延迟、token 统计
    G->>G: 更新 Prometheus 指标
    G-->>E: 透传响应
    E-->>C: 流式响应
      `} />

      {/* ==================== 3. PodAutoscaler ==================== */}
      <div className="section-divider"><span>弹性伸缩 (PodAutoscaler)</span></div>

      <h3>3.1 三种伸缩策略</h3>
      <p>PodAutoscaler 是 AIBrix 的<strong>LLM 感知弹性伸缩控制器</strong>，支持三种策略：</p>

      <table>
        <thead><tr><th>策略</th><th>原理</th><th>实现方式</th><th>适用场景</th></tr></thead>
        <tbody>
          <tr><td><strong>HPA</strong></td><td>创建并管理 K8s 原生 HorizontalPodAutoscaler</td><td>Wrapper 模式，自动生成 HPA 对象</td><td>标准 K8s 场景，CPU/内存/自定义指标</td></tr>
          <tr><td><strong>KPA</strong></td><td>Knative 风格，Panic/Stable 双窗口</td><td>直接计算并应用扩缩容决策</td><td>流量波动大，需要快速响应</td></tr>
          <tr><td><strong>APA</strong></td><td>应用自定义指标伸缩</td><td>自定义指标采集 + 直接扩缩容</td><td>LLM 特定指标（QPS、延迟、KV Cache 使用率）</td></tr>
        </tbody>
      </table>

      <h3>3.2 伸缩决策流程</h3>
      <MermaidDiagram chart={`
flowchart TB
    A["定时触发 (10s)"] --> B["Reconcile PodAutoscaler"]
    B --> C{"策略类型?"}
    C -->|"HPA"| D["生成/更新 K8s HPA 对象"]
    D --> E["K8s HPA 自动扩缩容"]
    C -->|"KPA/APA"| F["获取 Scale 资源"]
    F --> G["获取当前 Pod 列表"]
    G --> H["采集指标<br/>(POD/EXTERNAL/RESOURCE/CUSTOM)"]
    H --> I["computeScaleDecision()"]
    I --> J{"边界检查"}
    J -->|"current > max"| K["缩容到 max"]
    J -->|"current < min"| L["扩容到 min"]
    J -->|"正常范围"| M["metricBasedReplicas()"]
    M --> N["stabilizeRecommendation()<br/>冷却窗口平滑"]
    N --> O{"desired ≠ current?"}
    O -->|"是"| P["SetDesiredReplicas()"]
    O -->|"否"| Q["记录 Stable 状态"]
    P --> R["更新 Status + Event"]
      `} />

      <h3>3.3 指标源类型</h3>
      <CodeBlock language="go" title="MetricSource 类型定义" code={`// 支持四种指标源类型
type MetricSourceType string
const (
    POD      MetricSourceType = "pod"      // Pod 内 HTTP 端点 (如 /metrics)
    EXTERNAL MetricSourceType = "external" // 外部 HTTP 端点 或 K8s external.metrics API
    RESOURCE MetricSourceType = "resource" // K8s 资源指标 (cpu/memory)
    CUSTOM   MetricSourceType = "custom"   // K8s 自定义指标 (custom.metrics.k8s.io)
)

// PodAutoscaler 指标配置示例:
// metricsSources:
//   - metricSourceType: pod
//     protocolType: http
//     port: "8000"
//     path: "/metrics"
//     targetMetric: "num_running_requests"
//     targetValue: "10"`} />

      <h3>3.4 冷却窗口与稳定化</h3>
      <CodeBlock language="go" title="推荐值稳定化" code={`// 类似 K8s HPA 的冷却窗口机制，防止抖动
func (r *PodAutoscalerReconciler) stabilizeRecommendation(
    pa *PodAutoscaler, ctx ScalingContext,
    recommendation, current int32,
) int32 {
    scaleUpWindow := ctx.GetScaleUpCooldownWindow()    // 扩容冷却窗口
    scaleDownWindow := ctx.GetScaleDownCooldownWindow() // 缩容冷却窗口

    // 扩容方向: 取窗口内最大值 (激进扩容)
    // 缩容方向: 取窗口内最小值 (保守缩容)
    if recommendation > current {
        windowDuration = scaleUpWindow
        selectMax = true
    } else if recommendation < current {
        windowDuration = scaleDownWindow
        selectMax = false
    }
    // ... 在窗口内选择 max/min
    return stabilized
}`} />

      {/* ==================== 4. ModelRouter ==================== */}
      <div className="section-divider"><span>ModelRouter — HTTPRoute 自动管理</span></div>

      <h3>4.1 工作原理</h3>
      <p>ModelRouter 控制器<strong>自动为每个模型部署创建 Kubernetes Gateway API HTTPRoute</strong>，通过 Envoy Gateway 实现模型级别的流量路由。它监听 Deployment、ModelAdapter、RayClusterFleet 等资源的创建/删除事件。</p>

      <MermaidDiagram chart={`
sequenceDiagram
    participant User as 用户
    participant K8s as Kubernetes API
    participant MR as ModelRouter Controller
    participant EG as Envoy Gateway

    User->>K8s: kubectl apply -f deployment.yaml
    Note over K8s: labels: model.aibrix.ai/name=llama-70b
    K8s->>MR: AddEvent: Deployment Created

    MR->>MR: 提取 model name (labels)
    MR->>MR: 生成 HTTPRoute 对象
    Note over MR: Route: /v1/chat/completions<br/>Header: model=llama-70b<br/>Backend: llama-70b Service

    MR->>K8s: Create HTTPRoute (aibrix-system ns)
    MR->>K8s: Create ReferenceGrant (跨 ns 引用)

    K8s->>EG: HTTPRoute 生效
    Note over EG: 带 model=llama-70b header 的请求<br/>自动路由到对应 Service
      `} />

      <CodeBlock language="go" title="HTTPRoute 自动生成" code={`// 自动生成的 HTTPRoute 结构
func (m *ModelRouter) createHTTPRoute(namespace string, labels, annotations map[string]string) {
    modelName, _ := constants.ModelNameFromMetadata(labels, annotations)

    httpRoute := gatewayv1.HTTPRoute{
        ObjectMeta: metav1.ObjectMeta{
            Name:      utils.ModelRouterName(modelName),
            Namespace: "aibrix-system",  // 统一在 Gateway 命名空间
        },
        Spec: gatewayv1.HTTPRouteSpec{
            ParentRefs: []gatewayv1.ParentReference{{
                Name: "aibrix-eg",  // 绑定到 AIBrix Envoy Gateway
            }},
            Rules: []gatewayv1.HTTPRouteRule{{
                Matches: []gatewayv1.HTTPRouteMatch{
                    // 匹配 OpenAI 兼容路径 + model header
                    {Path: "/v1/chat/completions", Headers: [model=llama-70b]},
                    {Path: "/v1/completions",       Headers: [model=llama-70b]},
                    {Path: "/v1/embeddings",        Headers: [model=llama-70b]},
                    // ... 支持 11 种标准路径
                },
                BackendRefs: [{Name: serviceName, Port: 8000}],
                Timeouts:    {Request: "120s"},
            }},
        },
    }
    m.Client.Create(ctx, &httpRoute)
}`} />

      {/* ==================== 5. KV Cache 管理 ==================== */}
      <div className="section-divider"><span>分布式 KV Cache 管理</span></div>

      <h3>5.1 架构设计</h3>
      <p>AIBrix 的 KVCache 控制器管理<strong>分布式 KV Cache 集群</strong>，支持多种后端存储引擎，实现跨推理引擎的 KV Cache 共享和复用。</p>

      <MermaidDiagram chart={`
graph TB
    subgraph KVCacheCRD["KVCache CRD"]
        Spec["Spec<br/>mode: distributed<br/>backend: hpkv/infinistore/vineyard"]
        Status["Status<br/>readyReplicas, conditions"]
    end

    subgraph Controller["KVCache Controller"]
        Reconciler["KVCacheReconciler"]
        Backends["Backend 适配层"]
    end

    subgraph Backends["支持的 KV Cache 后端"]
        HPKV["HPKV<br/>(分布式)"]
        Infinistore["Infinistore<br/>(分布式)"]
        Vineyard["Vineyard<br/>(集中式)"]
    end

    subgraph Runtime["运行时组件"]
        Watcher["KVCache Watcher<br/>成员注册/发现"]
        Metadata["Metadata Service<br/>Redis / Etcd"]
        Cache["Cache Dataplane<br/>KV 数据传输"]
    end

    KVCacheCRD --> Controller
    Controller --> Backends
    Backends --> Runtime
    Reconciler -->|"创建"| Watcher
    Reconciler -->|"部署"| Metadata
    Reconciler -->|"部署"| Cache
      `} />

      <CodeBlock language="go" title="KVCache 后端注册" code={`// 后端插件化注册
func newReconciler(mgr manager.Manager, runtimeConfig config.RuntimeConfig) {
    reconciler := &KVCacheReconciler{
        Backends: map[string]backends.BackendReconciler{
            constants.KVCacheBackendVineyard:    backends.NewVineyardReconciler(client),
            constants.KVCacheBackendHPKV:        backends.NewDistributedReconciler(client, "hpkv"),
            constants.KVCacheBackendInfinistore: backends.NewDistributedReconciler(client, "infinistore"),
        },
    }
}

// KVCache CRD 示例:
// apiVersion: orchestration.aibrix.ai/v1alpha1
// kind: KVCache
// metadata:
//   name: my-kvcache
// spec:
//   mode: distributed
//   cache:
//     image: aibrix/kvcache:latest
//     replicas: 3
//   metadata:
//     redis:
//       runtime:
//         replicas: 1`} />

      {/* ==================== 6. P/D 分离路由 ==================== */}
      <div className="section-divider"><span>P/D 分离路由 (pd Router)</span></div>

      <h3>6.1 核心原理</h3>
      <p>AIBrix 的 <strong>pd (Prefill/Decode Disaggregation)</strong> 路由策略是独占策略，将请求的 Prefill 和 Decode 阶段分离到不同的 Pod 上执行，通过 KV Cache 传输实现跨 Pod 的推理流水线。</p>

      <MermaidDiagram chart={`
sequenceDiagram
    participant G as Gateway
    participant P as Prefill Pod
    participant KV as KV Transfer
    participant D as Decode Pod

    G->>G: 路由策略 = "pd"
    G->>G: 选择 Prefill Pod (prefix-cache 感知)
    G->>P: POST /v1/chat/completions

    Note over P: 执行 Prefill 阶段
    P->>P: 计算 KV Cache
    P->>P: 生成第一个 token

    P->>KV: 传输 KV Cache 到 Decode Pod
    Note over KV: SHFS / NIXL / Mooncake

    P-->>G: 返回第一个 token

    G->>G: 选择 Decode Pod
    G->>D: 后续 Decode 请求 (携带 KV Cache 引用)

    Note over D: 执行 Decode 阶段
    D->>D: 从 KV Cache 恢复状态
    D->>D: 逐 token 生成

    D-->>G: 流式返回剩余 tokens
    G-->>G: 合并响应
      `} />

      <h3>6.2 Prefill Pod 选择策略</h3>
      <CodeBlock language="go" title="P/D 路由核心逻辑" code={`// pd 路由是独占策略，接管完整的 Pod 选择流程
const (
    RouterPD      types.RoutingAlgorithm = "pd"
    PDRolePrefill = "prefill"
    PDRoleDecode  = "decode"
)

// KV 传输后端
const (
    KVConnectorTypeSHFS     = "shfs"     // AIBrix 内置 GPU 直传
    KVConnectorTypeNIXL     = "nixl"     // NVIDIA NIXL
    KVConnectorTypeMooncake = "mooncake" // Mooncake RDMA
)

// 引擎适配: vllm / sglang / trtllm
// 每种引擎有独立的 Prefill 请求构造和 Decode 响应处理逻辑`} />

      <h3>6.3 KV 传输后端对比</h3>
      <table>
        <thead><tr><th>后端</th><th>传输方式</th><th>延迟</th><th>适用场景</th></tr></thead>
        <tbody>
          <tr><td><strong>SHFS</strong></td><td>GPU 显存直传 (GPU Direct)</td><td>极低</td><td>同节点或高速网络</td></tr>
          <tr><td><strong>NIXL</strong></td><td>NVIDIA NIXL (NVLink + InfiniBand)</td><td>极低</td><td>NVIDIA GPU 集群</td></tr>
          <tr><td><strong>Mooncake</strong></td><td>RDMA (RoCE/InfiniBand)</td><td>低</td><td>高性能 RDMA 网络</td></tr>
        </tbody>
      </table>

      {/* ==================== 7. StormService ==================== */}
      <div className="section-divider"><span>StormService — 分布式推理编排</span></div>

      <h3>7.1 设计理念</h3>
      <p>StormService 是 AIBrix 的<strong>多角色分布式推理编排器</strong>，将推理工作负载拆分为多个角色（Role），每个角色独立管理 Pod 副本、滚动更新和拓扑策略。典型场景是 P/D 分离部署。</p>

      <MermaidDiagram chart={`
graph TB
    subgraph SS["StormService CRD"]
        SS_Spec["Spec<br/>roles: [prefill, decode]<br/>revisionHistoryLimit"]
        SS_Status["Status<br/>conditions, revisions"]
    end

    subgraph RS["RoleSet (每个 Role 一个)"]
        RS1["RoleSet: prefill<br/>replicas, template,<br/>rollingUpdate, topologyPolicy"]
        RS2["RoleSet: decode<br/>replicas, template,<br/>rollingUpdate, topologyPolicy"]
    end

    subgraph PS["PodSet (每个 Role 一个)"]
        PS1["PodSet: prefill<br/>管理实际 Pod 生命周期"]
        PS2["PodSet: decode<br/>管理实际 Pod 生命周期"]
    end

    SS --> RS1
    SS --> RS2
    RS1 --> PS1
    RS2 --> PS2
    PS1 --> P1["prefill Pod 1"]
    PS1 --> P2["prefill Pod 2"]
    PS2 --> D1["decode Pod 1"]
    PS2 --> D2["decode Pod 2"]
      `} />

      <CodeBlock language="yaml" title="StormService CRD 示例" code={`apiVersion: orchestration.aibrix.ai/v1alpha1
kind: StormService
metadata:
  name: llama-70b-pd
spec:
  roles:
    - name: prefill
      replicas: 2
      template:
        spec:
          containers:
            - name: engine
              image: vllm/vllm-openai:latest
              args: ["--model", "llama-70b", "--role", "prefill"]
              resources:
                nvidia.com/gpu: 4
      rollingUpdate:
        maxUnavailable: 1
      topologyPolicy:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: node.kubernetes.io/instance-type
                    operator: In
                    values: ["a100-80gb"]
    - name: decode
      replicas: 4
      template:
        spec:
          containers:
            - name: engine
              image: vllm/vllm-openai:latest
              args: ["--model", "llama-70b", "--role", "decode"]
              resources:
                nvidia.com/gpu: 1
      topologyPolicy:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchLabels:
                    role: decode
                topologyKey: kubernetes.io/hostname`} />

      {/* ==================== 8. ModelAdapter ==================== */}
      <div className="section-divider"><span>ModelAdapter — LoRA 管理</span></div>

      <h3>8.1 高密度 LoRA 部署</h3>
      <p>ModelAdapter 控制器管理<strong>LoRA 适配器的生命周期</strong>，将适配器调度到推理 Pod 上加载/卸载，支持多种调度策略。</p>

      <MermaidDiagram chart={`
flowchart TB
    A["ModelAdapter CRD 创建/更新"] --> B["Reconcile"]
    B --> C{"适配器状态?"}
    C -->|"Pending"| D["选择目标 Pod<br/>(调度策略)"]
    D --> E["发送 LoadAdapter 请求"]
    E --> F{"加载成功?"}
    F -->|"是"| G["更新状态为 Ready"]
    F -->|"否 (重试 < 5)"| D
    F -->|"否 (重试耗尽)"| H["标记为 Failed"]
    C -->|"Ready"| I["健康检查"]
    C -->|"Deleting"| J["发送 UnloadAdapter"]
    J --> K["移除 Finalizer"]
      `} />

      <h3>8.2 调度策略</h3>
      <table>
        <thead><tr><th>策略</th><th>描述</th></tr></thead>
        <tbody>
          <tr><td><strong>bin_pack</strong></td><td>优先将适配器加载到已有适配器的 Pod，最大化 Pod 利用率</td></tr>
          <tr><td><strong>least_adapters</strong></td><td>选择当前适配器数量最少的 Pod</td></tr>
          <tr><td><strong>least_latency</strong></td><td>选择延迟最低的 Pod</td></tr>
          <tr><td><strong>least_throughput</strong></td><td>选择吞吐量最低的 Pod（均衡负载）</td></tr>
          <tr><td><strong>random</strong></td><td>随机选择</td></tr>
        </tbody>
      </table>

      {/* ==================== 9. 部署架构 ==================== */}
      <div className="section-divider"><span>部署架构</span></div>

      <h3>9.1 生产部署拓扑</h3>
      <MermaidDiagram chart={`
graph TB
    subgraph Internet["外部流量"]
        Client["Client"]
    end

    subgraph Cluster["Kubernetes Cluster"]
        subgraph LB["负载均衡"]
            SLB["Service LoadBalancer<br/>或 Ingress"]
        end

        subgraph AibrixNS["aibrix-system Namespace"]
            EG["Envoy Gateway<br/>(Gateway API)"]
            GW["AIBrix Gateway Plugin<br/>(ExtProc)"]
            CM["Controller Manager<br/>(所有 Controller)"]
            Redis["Redis<br/>(路由状态/限流)"]
        end

        subgraph ModelNS["model-ns Namespace"]
            subgraph Models["模型部署"]
                M1_1["vLLM Pod 1"]
                M1_2["vLLM Pod 2"]
                M1_3["vLLM Pod 3"]
            end
            KVC["KV Cache 集群"]
        end
    end

    Client --> SLB
    SLB --> EG
    EG --> GW
    GW -->|"路由决策"| M1_1
    GW -->|"路由决策"| M1_2
    GW -->|"路由决策"| M1_3
    CM -->|"管理"| Models
    CM -->|"管理"| KVC
    GW -->|"状态同步"| Redis
      `} />

      <h3>9.2 关键环境变量</h3>
      <table>
        <thead><tr><th>环境变量</th><th>默认值</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><strong>AIBRIX_ROUTING_AUTO_BLEND_LOAD_BALANCE_WEIGHT</strong></td><td>1</td><td>自动混合负载均衡权重</td></tr>
          <tr><td><strong>AIBRIX_ROUTING_AUTO_BLEND_PREFIX_CACHE_WEIGHT</strong></td><td>5</td><td>前缀缓存专用混合权重</td></tr>
          <tr><td><strong>AIBRIX_PREFIX_CACHE_STANDARD_DEVIATION_FACTOR</strong></td><td>1</td><td>前缀缓存标准差过滤因子</td></tr>
          <tr><td><strong>AIBRIX_LOAD_BALANCE_IMBALANCE_FACTOR</strong></td><td>2.0</td><td>负载不均衡触发阈值</td></tr>
          <tr><td><strong>AIBRIX_GATEWAY_TIMEOUT_SECONDS</strong></td><td>120</td><td>Gateway 请求超时</td></tr>
          <tr><td><strong>AIBRIX_HTTPROUTE_CACHE_TTL</strong></td><td>30s</td><td>HTTPRoute 缓存 TTL</td></tr>
          <tr><td><strong>AIBRIX_ROUTER_MAX_CACHED_ALGORITHM_STRINGS</strong></td><td>4096</td><td>最大缓存算法字符串数量</td></tr>
        </tbody>
      </table>

      {/* ==================== 10. 与同类框架对比 ==================== */}
      <div className="section-divider"><span>与同类框架对比</span></div>

      <table>
        <thead><tr><th>特性</th><th>AIBrix</th><th>sgl-router</th><th>LiteLLM</th><th>Triton</th></tr></thead>
        <tbody>
          <tr><td><strong>定位</strong></td><td>K8s 原生推理平台</td><td>LLM 专用 Router</td><td>LLM API 网关</td><td>通用推理服务器</td></tr>
          <tr><td><strong>实现语言</strong></td><td>Go</td><td>Rust</td><td>Python</td><td>C++/Python</td></tr>
          <tr><td><strong>路由策略</strong></td><td>多策略加权组合 (12+)</td><td>5 种策略</td><td>usage-based</td><td>动态批处理</td></tr>
          <tr><td><strong>前缀感知路由</strong></td><td>✅ prefix-cache</td><td>✅ cache-aware</td><td>❌</td><td>❌</td></tr>
          <tr><td><strong>P/D 分离</strong></td><td>✅ pd 路由 + KV 传输</td><td>❌</td><td>❌</td><td>❌</td></tr>
          <tr><td><strong>弹性伸缩</strong></td><td>✅ HPA/KPA/APA</td><td>❌</td><td>❌</td><td>✅</td></tr>
          <tr><td><strong>KV Cache 管理</strong></td><td>✅ 多后端 (HPKV/Infinistore/Vineyard)</td><td>❌</td><td>❌</td><td>❌</td></tr>
          <tr><td><strong>LoRA 管理</strong></td><td>✅ 多策略调度</td><td>❌</td><td>❌</td><td>✅</td></tr>
          <tr><td><strong>K8s 原生</strong></td><td>✅ Operator 模式</td><td>❌</td><td>❌</td><td>部分</td></tr>
          <tr><td><strong>自动 HTTPRoute</strong></td><td>✅ ModelRouter</td><td>❌</td><td>❌</td><td>❌</td></tr>
          <tr><td><strong>异构 GPU</strong></td><td>✅</td><td>❌</td><td>❌</td><td>✅</td></tr>
          <tr><td><strong>速率限制</strong></td><td>✅ Redis 后端</td><td>❌</td><td>✅ RPM/TPM</td><td>✅</td></tr>
        </tbody>
      </table>

      {/* ==================== 11. 核心设计总结 ==================== */}
      <div className="section-divider"><span>核心设计总结</span></div>

      <h3>AIBrix 的架构优势</h3>
      <ul>
        <li><strong>Kubernetes 原生</strong>：完全基于 K8s Operator 模式，所有功能通过 CRD 声明式管理，与 K8s 生态无缝集成</li>
        <li><strong>多策略加权路由</strong>：不是简单的二选一，而是多个路由策略<strong>加权组合</strong>，通过 Min-Max 归一化 + Winsorize 异常值裁剪实现鲁棒评分</li>
        <li><strong>自动负载均衡混合</strong>：用户选择任何路由策略，系统<strong>自动在后台混合 load-balance</strong> 策略，防止单一策略将流量导向已过载的 Pod</li>
        <li><strong>P/D 分离一等公民</strong>：pd 路由作为独占策略，支持 SHFS/NIXL/Mooncake 三种 KV 传输后端，适配不同硬件环境</li>
        <li><strong>LLM 感知伸缩</strong>：PodAutoscaler 支持自定义指标源（如 Pod HTTP 端点），可以用 <code>num_running_requests</code> 等 LLM 特有指标驱动伸缩</li>
        <li><strong>插件化架构</strong>：Controller 可按需启用/禁用，路由算法可注册/扩展，KV Cache 后端可插拔</li>
        <li><strong>Envoy 集成</strong>：基于 Envoy ExtProc 实现网关，无需自建 HTTP 服务器，复用 Envoy 的高性能和高可用能力</li>
      </ul>

      <Callout type="warning">
        <strong>注意事项：</strong>
        <ul>
          <li>AIBrix 是 <strong>控制平面</strong>，不执行模型推理，需要配合 vLLM/SGLang 等推理引擎使用</li>
          <li>Gateway 路由决策会增加约 1-2ms 延迟（ExtProc gRPC 调用），但相比推理延迟（秒级）可忽略</li>
          <li>多策略路由的加权评分依赖指标采集的准确性，需要确保 Prometheus 指标管道健康</li>
          <li>P/D 分离需要推理引擎支持对应模式（vLLM/SGLang），且 KV Cache 传输需要高性能网络</li>
        </ul>
      </Callout>

      <ResourceTable resources={[
        { name: 'AIBrix 源码', url: 'https://github.com/vllm-project/aibrix', desc: 'vLLM 项目开源的云原生 LLM 推理基础设施' },
        { name: 'AIBrix 白皮书', url: 'https://arxiv.org/abs/2504.03648', desc: 'AIBrix 架构设计与实现论文' },
        { name: 'AIBrix 文档', url: 'https://aibrix.readthedocs.io/latest/', desc: '官方文档，安装、配置、使用指南' },
        { name: 'KubeCon NA 2025 Keynote', url: 'https://www.youtube.com/watch?v=7KHenRXNGAw', desc: 'AIBrix: Kubernetes-native GenAI Inference Infrastructure' },
        { name: 'KubeCon EU 2025 Keynote', url: 'https://kccnceu2025.sched.com/event/1txC7', desc: 'LLM-Aware Load Balancing in Kubernetes (Google + ByteDance)' },
        { name: 'Gateway API', url: 'https://gateway-api.sigs.k8s.io/', desc: 'Kubernetes Gateway API 规范' },
        { name: 'Envoy ExtProc', url: 'https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/ext_proc_filter', desc: 'Envoy External Processing Filter 文档' },
      ]} />
    </div>
  );
}