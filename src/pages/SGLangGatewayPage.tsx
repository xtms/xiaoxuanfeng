import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, CodeBlock, ResourceTable } from '../components/CodeBlock';

const GH = 'https://github.com/sgl-project/sglang/blob/main/sgl-model-gateway';

function SrcLink({ path }: { path: string }) {
  return (
    <a href={`${GH}/${path}`} target="_blank" rel="noopener noreferrer">
      <code>{path}</code>
    </a>
  );
}

export function SGLangGatewayPage() {
  return (
    <div className="prose max-w-none">
      <h1>SGLang Model Gateway — 纯 Rust 模型调度与数据面网关</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-09</span>
        <span className="page-meta-item">⏱️ 阅读约 45 分钟</span>
        <span className="page-meta-item">🏷️ 专题 · 调度器</span>
      </div>
      <p>
        <strong>SGLang Model Gateway</strong> 是 SGLang 项目以 Rust 从零实现的高性能推理网关（63K 行），
        同时承担 <strong>控制平面</strong>（worker 注册/健康检查/服务发现）与 <strong>数据面</strong>（HTTP / PD / gRPC / OpenAI
        多协议路由）双重职责，对外暴露 OpenAI 兼容 API。它与 <strong>AIBrix</strong>（K8s 控制平面 + Envoy 数据面）
        共同构成当前 LLM 调度器生态的两条技术路线：<em>进程内 Rust 数据面</em> vs <em>K8s 原生控制平面</em>。
      </p>

      <Callout type="tip">
        <strong>与 AIBrix 的合并视角：</strong>本文把 <strong>SGLang Model Gateway</strong> 与 <strong>AIBrix</strong> 放在同一个「调度器」主题下对比分析。
        AIBrix 定位为 LLM 推理的 <strong>Kubernetes 控制平面</strong>（管理部署、伸缩、HTTPRoute），
        Gateway 定位为 <strong>推理数据面</strong>（每请求级的负载均衡、熔断、流控）。两者能力互补而非互斥——
        可部署为 AIBrix 路由到 SGLang，也可在 Gateway 之上叠加 K8s 伸缩。
      </Callout>

      {/* ==================== 1. 定位与生态 ==================== */}
      <div className="section-divider"><span>定位：调度器生态中的两派</span></div>

      <h3>1.1 两条技术路线</h3>
      <MermaidDiagram scale={0.7} chart={`
graph TB
    subgraph Sched["调度器生态"]
        subgraph RouteA["路线 A：进程内数据面（SGLang Model Gateway）"]
            A1["Rust 单二进制<br/>smg / sgl-model-gateway"]
            A2["HTTP / PD / gRPC / OpenAI 四协议"]
            A3["每请求级：负载均衡+熔断+限流+重试"]
            A4["K8s 服务发现（可选，非核心）"]
            A1 --> A2 --> A3 --> A4
        end
        subgraph RouteB["路线 B：K8s 控制平面（AIBrix）"]
            B1["Go Operator 多控制器"]
            B2["Envoy Gateway + ExtProc 数据面"]
            B3["弹性伸缩 / LoRA / KV Cache / P/D 编排"]
            B4["K8s 一等公民（CRD + HTTPRoute）"]
            B1 --> B2 --> B3 --> B4
        end
    end
    Sched --> S["两种实现语言 / 两种交付形态"]
    S --> S1["Rust：低延迟、单进程、可内嵌 Python 绑定"]
    S --> S2["Go+K8s：云原生、声明式、生态完整"]
      `} />

      <h3>1.2 能力矩阵</h3>
      <table>
        <thead><tr><th>维度</th><th>SGLang Model Gateway</th><th>AIBrix</th></tr></thead>
        <tbody>
          <tr><td><strong>实现语言</strong></td><td>Rust（~63K 行）+ pyo3 Python 绑定</td><td>Go（Operator 模式）+ Envoy 插件</td></tr>
          <tr><td><strong>交付形态</strong></td><td>单二进制 <code>smg</code>，可独立/内嵌部署</td><td>K8s CRD + Controller Manager + Envoy Gateway</td></tr>
          <tr><td><strong>负载均衡</strong></td><td>cache_aware / power_of_two / round_robin / random / bucket / prefix_hash / manual</td><td>prefix-cache / load-balance / least-request / least-latency / power-of-two / 多策略加权混合</td></tr>
          <tr><td><strong>前缀感知</strong></td><td>✅ Radix 前缀树（cache_aware，~2310 行 tree.rs）</td><td>✅ 前缀树 + 分布式 KV 同步（prefix-cache）</td></tr>
          <tr><td><strong>P/D 分离</strong></td><td>✅ 内建 PD 路由器 + cache-aware 合并</td><td>✅ pd 路由 + SHFS/NIXL/Mooncake KV 传输</td></tr>
          <tr><td><strong>gRPC 后端</strong></td><td>✅ 行业首创纯 Rust SRT gRPC 管线</td><td>❌（以 HTTP/OpenAI 为主）</td></tr>
          <tr><td><strong>弹性伸缩</strong></td><td>❌（控制面聚焦 worker 生命周期，非副本伸缩）</td><td>✅ HPA / KPA / APA</td></tr>
          <tr><td><strong>可靠性</strong></td><td>✅ 熔断 + 重试 + 令牌桶限流 + 请求队列</td><td>✅ 限流（Redis）+ 队列</td></tr>
          <tr><td><strong>可观测性</strong></td><td>✅ 40+ Prometheus 指标 + OTel + 结构化日志</td><td>✅ Prometheus 指标采集</td></tr>
          <tr><td><strong>多模型</strong></td><td>✅ IGW 模式 + per-model 策略</td><td>✅ 多模型 Pool + HTTPRoute</td></tr>
          <tr><td><strong>MCP / Agent</strong></td><td>✅ 原生 MCP 客户端 + tool 执行循环</td><td>❌</td></tr>
          <tr><td><strong>安全</strong></td><td>✅ API Key + JWT/OIDC RBAC + TLS/mTLS + 审计</td><td>✅ API Key 鉴权 + Envoy mTLS</td></tr>
        </tbody>
      </table>

      <Callout type="info">
        <strong>如何阅读本文：</strong>第 2-9 节以 <strong>Pi-0.5 粒度</strong>逐步拆解 SGLang Model Gateway 的真实源码
        （每个关键点附代码 + 文件:行号 + GitHub 可点击跳转），第 10 节回到 AIBrix 对比，给出统一调度视角下的选型建议。
      </Callout>

      {/* ==================== 2. 整体架构 ==================== */}
      <div className="section-divider"><span>整体架构：控制面 + 数据面</span></div>

      <h3>2.1 系统全景</h3>
      <MermaidDiagram chart={`
graph TB
    subgraph ControlPlane["控制平面 (Control Plane)"]
        WM["WorkerManager<br/>注册/校验/能力发现"]
        JQ["JobQueue<br/>异步串行化 worker 操作"]
        HC["后台健康检查 + LoadMonitor"]
        SD["K8s Service Discovery<br/>(可选)"]
        WR["WorkerRegistry + HashRing"]
        WM --> JQ
        WM --> WR
        HC --> WR
        SD --> WR
    end

    subgraph DataPlane["数据平面 (Data Plane)"]
        subgraph Routers["RouterManager 协调多路由器"]
            HR["HTTP Router<br/>regular"]
            PR["PD Router<br/>prefill/decode"]
            GR["gRPC Router<br/>纯 Rust 管线"]
            OR["OpenAI Router<br/>远程厂商代理"]
        end
        subgraph Resilience["可靠性层"]
            CB["熔断器 per-worker"]
            RET["重试执行器"]
            TB["令牌桶限流 + 队列"]
        end
        subgraph Policies["负载均衡策略"]
            CA["cache_aware"]
            P2["power_of_two"]
            RR["round_robin"]
            BK["bucket"]
        end
    end

    Clients["Client / OpenAI SDK"] --> HR
    Clients --> PR
    Clients --> GR
    Clients --> OR
    HR --> Policies
    PR --> Policies
    GR --> Policies
    Routers --> Resilience
    Policies --> WR
      `} />

      <h3>2.2 模块划分</h3>
      <table>
        <thead><tr><th>模块</th><th>源码目录</th><th>行数</th><th>职责</th></tr></thead>
        <tbody>
          <tr><td><strong>核心抽象</strong></td><td><code>src/core/</code></td><td>~13K</td><td>Worker / Registry / CircuitBreaker / Retry / JobQueue / Workflow steps</td></tr>
          <tr><td><strong>负载均衡</strong></td><td><code>src/policies/</code></td><td>~10K</td><td>7 种策略 + Radix 前缀树 + PolicyRegistry</td></tr>
          <tr><td><strong>路由器</strong></td><td><code>src/routers/</code></td><td>~30K</td><td>HTTP / PD / gRPC / OpenAI / mesh / tokenize / parse</td></tr>
          <tr><td><strong>中间件</strong></td><td><SrcLink path="src/middleware.rs" /></td><td>1049</td><td>认证 / 并发限制 / 请求ID / 指标</td></tr>
          <tr><td><strong>可观测性</strong></td><td><code>src/observability/</code></td><td>~4K</td><td>Prometheus / OTel / 结构化日志</td></tr>
          <tr><td><strong>服务发现</strong></td><td><SrcLink path="src/service_discovery.rs" /></td><td>1590</td><td>K8s pod 自动对齐</td></tr>
          <tr><td><strong>配置</strong></td><td><code>src/config/</code></td><td>~4K</td><td>RouterConfig builder + 校验</td></tr>
        </tbody>
      </table>

      <h3>2.3 启动时序</h3>
      <MermaidDiagram chart={`
sequenceDiagram
    participant Main as main.rs
    participant Cfg as RouterConfig::builder()
    participant Srv as server::startup()
    participant Ctx as AppContext
    participant JQ as JobQueue
    participant RM as RouterManager

    Main->>Main: 解析 CLI (clap 派生)
    Main->>Cfg: to_router_config(prefill_urls)
    Main->>Cfg: validate()
    Main->>Srv: startup(ServerConfig)

    Srv->>Srv: otel_tracing_init / init_logging / start_prometheus
    Srv->>Ctx: AppContext::from_config()
    Srv->>JQ: 初始化 JobQueue + WorkflowEngines
    Srv->>JQ: submit(AddTokenizer)  异步加载 tokenizer
    Srv->>JQ: submit(InitializeWorkersFromConfig) 异步注册 workers
    Srv->>JQ: submit(InitializeMcpServers) 异步连接 MCP
    Srv->>RM: RouterManager::from_config() → 多路由器就绪
    Srv->>Srv: 启动健康检查 / LoadMonitor / ConcurrencyLimiter
    Srv->>Srv: build_app() 挂载全部路由 + 中间件
    Srv->>Srv: axum_server::bind 监听 :30000
      `} />

      <CodeBlock language="rust" title="启动骨架 (src/main.rs)" code={`// main.rs: 三个二进制别名指向同一入口
#[command(name = "sglang-router", alias = "smg", alias = "amg")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
    #[command(flatten)]
    router_args: CliArgs,   // 全部 120+ 个 CLI 参数
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse_from(filtered_args);

    // 服务发现开启时自动启用 IGW（多模型推理网关）
    if cli_args.service_discovery && !cli_args.enable_igw {
        cli_args.enable_igw = true;
    }

    let router_config = cli_args.to_router_config(prefill_urls)?;
    router_config.validate()?;
    let server_config = cli_args.to_server_config(router_config);

    let runtime = tokio::runtime::Runtime::new()?;
    runtime.block_on(async move { server::startup(server_config).await })?;
    Ok(())
}`} />

      {/* ==================== 3. Worker 模型 ==================== */}
      <div className="section-divider"><span>Worker 模型与控制平面</span></div>
      <p>控制平面的核心是把<strong>异构推理 worker</strong>（HTTP / gRPC、regular / prefill / decode、不同模型）抽象成统一对象，
      然后通过<strong>异步任务队列</strong>串行化注册 / 更新 / 移除操作，避免阻塞请求数据面。</p>

      <h3>3.1 Worker 抽象</h3>
      <h3>3.1 Worker trait：统一异构 worker</h3>
      <p><SrcLink path="src/core/worker.rs" /> 定义 <code>Worker</code> trait（2224 行），把 HTTP / gRPC、regular / prefill / decode、
      不同模型的推理后端统一成一个对象：</p>
      <CodeBlock language="rust" title="Worker trait 关键方法 (src/core/worker.rs:142-420)" code={`#[async_trait]
pub trait Worker: Send + Sync + fmt::Debug {
    fn url(&self) -> &str;                      // worker 地址
    fn worker_type(&self) -> &WorkerType;       // Regular | Prefill | Decode
    fn connection_mode(&self) -> &ConnectionMode; // Http | Grpc
    fn is_healthy(&self) -> bool;
    fn set_healthy(&self, healthy: bool);
    async fn check_health_async(&self) -> WorkerResult<()>;
    fn load(&self) -> usize;                    // 原子请求计数
    fn increment_load(&self);                   // 请求进入时 +1
    fn decrement_load(&self);                   // 请求完成时 -1
    fn circuit_breaker(&self) -> &CircuitBreaker;
    fn model_id(&self) -> &str;
    // 双重可用性判断：健康 且 熔断器未完全打开
    fn is_available(&self) -> bool {
        self.is_healthy() && self.circuit_breaker().can_execute()
    }
    fn is_dp_aware(&self) -> bool { false }     // DP 感知（数据并行）
    fn dp_rank(&self) -> Option<usize>;
    fn dp_size(&self) -> Option<usize>;
    async fn get_grpc_client(&self) -> WorkerResult<Option<Arc<GrpcClient>>>;
}`} />
      <p><strong>三个值得注意的设计点：</strong></p>
      <ul>
        <li><strong>返回引用而非 clone</strong>：<code>worker_type()</code> / <code>connection_mode()</code> 返回 <code>&amp;T</code>，
        因为它们在路由热路径上被高频调用，避免每次分配（worker.rs:149-153）</li>
        <li><strong><code>is_available()</code> 双保险</strong>：<code>健康状态 &amp;&amp; 熔断器允许执行</code>，二者任一为假即不可路由——
        健康检查负责「探活」，熔断器负责「按失败率自动摘除」（worker.rs:229-231）</li>
        <li><strong><code>model_id()</code> 优先 ModelCard</strong>：worker 通过 <code>get_model_info</code> 发现的模型卡片优先，labels 兜底，
        保证与 SGLang worker 实际加载的模型一致（worker.rs:275-286）</li>
      </ul>

      <h3>3.2 Worker 实现：BasicWorker / DPAwareWorker</h3>
      <p>trait 有两种具体实现。普通 worker 是 <code>BasicWorker</code>；开启 <code>--dp-aware</code> 后，一个物理 worker
      会拆成 <code>dp_size</code> 个 <code>DPAwareWorker</code>（共享同一进程，但带 rank 标记）：</p>
      <CodeBlock language="rust" title="BasicWorker 字段 (src/core/worker.rs:650-666)" code={`pub struct BasicWorker {
    pub metadata: WorkerMetadata,
    pub load_counter: Arc<AtomicUsize>,           // 活跃请求数
    pub worker_routing_key_load: Arc<WorkerRoutingKeyLoad>,
    pub processed_counter: Arc<AtomicUsize>,      // 累计处理请求数
    pub healthy: Arc<AtomicBool>,
    pub consecutive_failures: Arc<AtomicUsize>,   // 健康检查连续失败次数
    pub consecutive_successes: Arc<AtomicUsize>,  // 健康检查连续成功次数
    pub circuit_breaker: CircuitBreaker,
    pub grpc_client: Arc<OnceCell<Arc<GrpcClient>>>, // 锁无关 gRPC client 缓存
    pub models_override: Arc<StdRwLock<Option<Vec<ModelCard>>>>,
}`} />
      <CodeBlock language="rust" title="DPAwareWorker (src/core/worker.rs:987-998)" code={`pub struct DPAwareWorker {
    base_worker: BasicWorker,      // 委托所有基础方法
    dp_rank: usize,                // 数据并行 rank
    dp_size: usize,                // 数据并行大小
    base_url: String,              // 不含 @rank 后缀的 URL
    bootstrap_host: String,        // 从 base_url 解析
}
// 关键差异：is_dp_aware()=true；prepare_request() 注入 "data_parallel_rank": rank；
// endpoint_url() 用 base_url（不带 rank 后缀）`} />
      <p>DP 模式下 worker URL 约定为 <code>{'{base}@rank'}</code>（如 <code>http://host:30000@1</code>），
      网关用 <code>HashRing</code> 把同一模型的 <code>dp_size</code> 个副本散到环上，请求按前缀命中率优先选到
      持有缓存的副本，同时把 <code>data_parallel_rank</code> 注入请求体，让 SGLang worker 内部做正确的 KV 对齐。</p>
      <p><code>HealthConfig</code> 决定健康检查行为（默认 <code>timeout=5s</code>，<code>interval=30s</code>，
      连续失败 <code>3</code> 次标记 unhealthy，连续成功 <code>2</code> 次恢复 healthy，即「非对称阈值」防止抖动）：</p>
      <CodeBlock language="rust" title="HealthConfig (src/core/worker.rs:552-579)" code={`pub struct HealthConfig {
    pub timeout_secs: u64,            // 默认 5
    pub check_interval_secs: u64,     // 默认 30
    pub endpoint: String,             // 默认 "/health"
    pub failure_threshold: u32,       // 默认 3  — 连续失败 N 次 → unhealthy
    pub success_threshold: u32,       // 默认 2  — 连续成功 N 次 → healthy
    pub disable_health_check: bool,   // 默认 false
}`} />

      <h3>3.3 WorkerRegistry 六重索引 + 一致性 HashRing</h3>
      <p><SrcLink path="src/core/worker_registry.rs" />（835 行）管理全部 worker。真正的实现不是单哈希表，而是<strong>六重索引</strong>，
      支持 O(1) 按 ID / URL / model / 类型 / 连接方式查找：</p>
      <CodeBlock language="rust" title="WorkerRegistry 六重索引 (src/core/worker_registry.rs:179-204)" code={`pub struct WorkerRegistry {
    workers: Arc<DashMap<WorkerId, Arc<dyn Worker>>>,        // 主索引：ID -> worker
    model_index: ModelIndex,                                 // model -> Arc<[Arc<dyn Worker>]> 不可变快照
    hash_rings: Arc<DashMap<String, Arc<HashRing>>>,         // 每个 model 一个一致性哈希环
    type_workers: Arc<DashMap<WorkerType, Vec<WorkerId>>>,   // 按类型索引
    connection_workers: Arc<DashMap<ConnectionMode, Vec<WorkerId>>>, // 按连接方式索引
    url_to_id: Arc<DashMap<String, WorkerId>>,               // URL -> ID 映射
    mesh_sync: Arc<RwLock<OptionalMeshSyncManager>>,
}`} />
      <p><strong>关键设计：</strong></p>
      <ul>
        <li><strong>model_index 用不可变快照</strong>：<code>Arc&lt;[Arc&lt;dyn Worker&gt;]&gt;</code> + copy-on-write，
        注册/移除时重建快照，读取时零锁直接 load 一个 Arc——路由热路径不吃任何读写锁</li>
        <li><strong>HashRing 用 blake3 + 150 虚拟节点</strong>：每个物理 worker 生成 150 个虚拟节点
        <code>blake3(url + "#" + vnode_index)</code>，排序后存 <code>Arc&lt;[(u64, Arc&lt;str&gt;)]&gt;</code>；
        查询用 <code>partition_point</code> 二分定位后顺时针扫描，用 HashSet 去重同一 worker 的多个虚拟节点</li>
        <li><strong>一致性哈希</strong>：新增/下线 worker 只影响环上相邻节点，适合 manual / consistent_hashing 会话粘性路由</li>
      </ul>
      <p>健康检查由独立的 <code>start_health_checker</code> 后台任务驱动：每轮 <code>join_all</code> 并行探测所有 worker，
      连续失败 ≥ <code>failure_threshold</code>（默认 3）标记 unhealthy，连续成功 ≥ <code>success_threshold</code>（默认 2）恢复 healthy，
      并把结果同步给熔断器。</p>

      <h3>3.4 JobQueue：异步串行化 worker 操作</h3>
      <p><SrcLink path="src/core/job_queue.rs" />（798 行）把增删改查变成后台任务，控制平面 API 立即返回 <code>202 Accepted</code>。
      <code>Job</code> 枚举覆盖 10 种控制平面操作，大结构用 <code>Box&lt;&gt;</code> 包装避免枚举膨胀：</p>
      <CodeBlock language="rust" title="Job 枚举 (src/core/job_queue.rs:34-66)" code={`pub enum Job {
    AddWorker { config: Box<WorkerConfigRequest> },                // 注册 worker
    UpdateWorker { url: String, update: Box<WorkerUpdateRequest> }, // 更新
    RemoveWorker { url: String },                                  // 移除
    InitializeWorkersFromConfig { router_config: Box<RouterConfig> }, // 启动初始化
    InitializeMcpServers { mcp_config: Box<McpConfig> },           // MCP 初始化
    RegisterMcpServer { config: Box<McpServerConfigRequest> },     // 注册 MCP server
    AddWasmModule { config: Box<WasmModuleConfigRequest> },        // WASM 模块
    RemoveWasmModule { request: Box<WasmModuleRemovalRequest> },
    AddTokenizer { config: Box<TokenizerConfigRequest> },          // 加载 tokenizer
    RemoveTokenizer { request: Box<TokenizerRemovalRequest> },
}`} />
      <CodeBlock language="rust" title="JobQueue 内部结构 (src/core/job_queue.rs:121-131)" code={`pub struct JobQueue {
    tx: mpsc::Sender<Job>,                 // 有界 channel（capacity=1000）
    context: Weak<AppContext>,             // Weak 引用，避免循环依赖
    status_map: Arc<DashMap<String, JobStatus>>, // 按 URL 跟踪作业状态
    concurrency_limit: Arc<Semaphore>,     // 并发上限（默认 200）
}
// 单 dispatcher 串行接收 → spawn 独立 task 处理，信号量限流
// 独立 cleanup task 每 5 分钟清理过期状态
// 状态机：pending → processing → (成功删除 / 失败保留) → TTL 清理`} />
      <p><strong>三种任务执行器</strong>：<code>AddWorker</code> 按 <code>runtime_type</code> 分流到
      <code>local_worker</code> 或 <code>external_worker</code> workflow engine；<code>InitializeWorkersFromConfig</code>
      会拆解成多个 <code>AddWorker</code> 重新入队；worker 元数据发现失败（<code>FailureAction::ContinueNextStep</code>）
      不阻塞整体注册流程。</p>

      <h3>3.5 Worker 生命周期工作流</h3>
      <p><code>src/core/steps/</code> 用<strong>类型化 DAG 工作流</strong>（<code>WorkflowEngine&lt;D, Store&gt;</code>）编排注册流程，
      每步一个文件、编译期保证 step 与数据类型匹配。8 种 workflow engine 各管一类任务：</p>
      <MermaidDiagram chart={`
flowchart LR
    A["detect_connection.rs<br/>并行探测 HTTP + gRPC<br/>(tokio::join!)"] --> B["discover_metadata.rs<br/>GET /server_info + /model_info<br/>识别模型ID/worker类型"]
    B --> C["discover_dp.rs<br/>DP 感知：<br/>dp_size + model_id"]
    C --> D["create_worker.rs<br/>构造 BasicWorker/DPAwareWorker<br/>初始 set_healthy(false)"]
    D --> E["register_workers.rs<br/>写入六重索引"]
    E --> F["submit_tokenizer_job.rs<br/>异步加载 tokenizer"]
    E --> G["update_policies.rs<br/>cache_aware 初始化前缀树<br/>检查 P/D 配置冲突"]
    E --> H["activate.rs<br/>set_healthy(true)<br/>FailWorkflow 语义"]
      `} />
      <p><strong>三个值得注意的细节：</strong></p>
      <ul>
        <li><strong>连接探测</strong>：<code>tokio::join!</code> 并行发 HTTP 健康检查与 gRPC 健康检查，
        先成功者胜出（HTTP 优先）；对慢启动 worker 用 <code>worker_startup_timeout_secs</code>（默认 1800s）
        动态计算重试次数、线性退避 1s~5s</li>
        <li><strong>元数据发现可失败继续</strong>：HTTP 模式依次尝试 <code>/server_info</code> →
        <code>/model_info</code> → <code>/v1/models</code>（并兼容旧的 <code>/get_*</code> 端点），全部失败用
        <code>FailureAction::ContinueNextStep</code> 不阻塞注册</li>
        <li><strong>激活是 FailWorkflow</strong>：<code>update_policies</code> 与 <code>activate</code> 都依赖 register 可并行，
        但 activate 失败会让整个流程失败——worker 只有全部就绪才会被标记健康、开始接流量</li>
      </ul>

      <h3>3.6 LoadMonitor：按需采集的负载探针</h3>
      <p><SrcLink path="src/core/worker_manager.rs" />（269-394 行）的 <code>LoadMonitor</code> 是 power_of_two 策略的数据源，
      一个很克制的设计——<strong>只有存在 power_of_two 策略时才采集</strong>：</p>
      <CodeBlock language="rust" title="LoadMonitor 采集循环 (src/core/worker_manager.rs:338-378)" code={`async fn monitor_loop(...) {
    let mut interval_timer = tokio::time::interval(interval);
    loop {
        interval_timer.tick().await;
        // 1. 只采集 PowerOfTwo 策略相关的 worker 负载
        let power_of_two_policies = policy_registry.get_all_power_of_two_policies();
        if power_of_two_policies.is_empty() { continue; }

        // 2. 并发请求所有 worker 的 /v1/loads?include=core
        let result = WorkerManager::get_all_worker_loads(&worker_registry, &client).await;

        // 3. 解析 aggregate.total_tokens 作为负载值
        let mut loads = HashMap::new();
        for load_info in result.loads {
            loads.insert(load_info.worker, load_info.load);
        }

        // 4. 喂给所有 PowerOfTwo 策略 + watch channel 广播
        for policy in &power_of_two_policies {
            policy.update_loads(&loads);
        }
        let _ = tx.send(loads);
    }
}`} />
      <p><code>fan_out</code> 工具（worker_manager.rs:36-68）用 <code>buffer_unordered(MAX_CONCURRENT=32)</code>
      并发扇出请求，同样复用于 <code>flush_cache_all</code>（只扇出 HTTP worker，gRPC 不支持刷缓存）与
      <code>get_engine_metrics</code>（并发抓取所有 worker 的 <code>/metrics</code> 并聚合 Prometheus 文本）。</p>

      <p>值得注意的细节：<strong>发现元数据</strong>阶段会调用 worker 的 <code>/get_model_info</code> 拿到真实模型 ID 与 worker 类型，
      确保注册的 <code>model_id</code> 与实际加载的模型一致；<strong>DP 感知</strong>阶段按模型分组并记录同一模型有多少副本，
      供 DP-aware 调度把请求打散到同一模型的所有副本。</p>

      <Callout type="info">
        <strong>控制平面 API 一览（src/server.rs:633-638）：</strong>
        <code>POST/GET /workers</code> 注册与列举（202 异步）、<code>GET/PUT/DELETE /workers/{'{id}'}</code> 查看/更新/移除、
        <code>POST /flush_cache</code> 触发缓存刷除、<code>GET /get_loads</code> 采样负载。
        开启 <code>--enable-igw</code> 后，同一进程可注册多个模型 worker，按模型走不同策略。
      </Callout>

      {/* ==================== 4. 负载均衡策略 ==================== */}
      <div className="section-divider"><span>负载均衡策略：7 种策略的工程实现</span></div>
      <p>这是网关的灵魂。所有策略实现统一的 <code>LoadBalancingPolicy</code> trait，可运行在 regular 单 worker 选择和 PD 双 worker 选择两种模式。</p>

      <h3>4.1 统一抽象</h3>
      <CodeBlock language="rust" title="LoadBalancingPolicy trait (src/policies/mod.rs:42-94)" code={`#[async_trait]
pub trait LoadBalancingPolicy: Send + Sync + Debug {
    /// 核心方法：从可用 worker 列表中选择一个
    async fn select_worker(
        &self,
        workers: &[Arc<dyn Worker>],
        info: &SelectWorkerInfo<'_>,
    ) -> Option<usize>;

    /// 请求完成后的回调（用于有状态策略）
    fn on_request_complete(&self, _worker_url: &str, _success: bool) {}

    fn name(&self) -> &'static str;
    /// 是否需要请求文本（缓存感知类策略需要）
    fn needs_request_text(&self) -> bool { false }
    /// 更新 worker 负载信息（由 LoadMonitor 周期性调用）
    fn update_loads(&self, _loads: &HashMap<String, isize>) {}
    fn reset(&self) {}
    fn as_any(&self) -> &dyn std::any::Any;
}

// 决策输入：把路由所需的一切信息打包传进策略
pub struct SelectWorkerInfo<'a> {
    pub request_text: Option<&'a str>,   // cache_aware / bucket 用
    pub tokens: Option<&'a [u32]>,       // prefix_hash 用
    pub headers: Option<&'a http::HeaderMap>, // consistent_hashing / manual 用
    pub hash_ring: Option<Arc<HashRing>>,     // 预计算避免每请求重建
}`} />

      <h3>4.2 cache_aware：前缀感知路由（核心策略，默认）</h3>
      <p><SrcLink path="src/policies/cache_aware.rs" />（1641 行）是默认策略。核心思路：<strong>每个模型一张前缀树</strong>，
      请求命中缓存则路由到持有最长前缀的 worker；否则负载均衡。同时用「负载不均衡检测」在两条路径间切换：</p>
      <CodeBlock language="rust" title="CacheAwarePolicy.select_worker (src/policies/cache_aware.rs)" code={`pub struct CacheAwarePolicy {
    config: CacheAwareConfig,
    trees: Arc<DashMap<String, Arc<Tree>>>,  // (pool, model) -> Tree
    mesh_sync: OptionalMeshSyncManager,
    _eviction_task: Option<PeriodicTask>,
}

async fn select_worker(&self, workers: &[Arc<dyn Worker>], info: &SelectWorkerInfo<'_>)
    -> Option<usize> {
    // 1. 单次遍历算 min/max 负载（零分配）
    let (min_load, max_load) = workers.iter().fold(
        (usize::MAX, 0usize),
        |(min, max), w| (min.min(w.load()), max.max(w.load())));

    // 2. 负载不均衡检测：绝对差 > 阈值 AND 相对比 > 阈值，才切到最短队列
    let is_imbalanced = max_load.saturating_sub(min_load) > self.config.balance_abs_threshold
        && (max_load as f32) > (min_load as f32 * self.config.balance_rel_threshold);

    if is_imbalanced {
        return self.select_worker_min_load(workers, &healthy_indices);
    }

    // 3. 前缀匹配，算命中率
    let result = tree.prefix_match_with_counts(text);
    let match_rate = result.matched_char_count as f32 / result.input_char_count as f32;

    let selected_idx = if match_rate > self.config.cache_threshold {
        // 缓存命中：路由到拥有最长前缀的 worker（tenant）
        workers.iter().position(|w| w.url() == result.tenant)
            .filter(|&idx| workers[idx].is_healthy())
    } else {
        // 缓存未命中：路由到负载最小的 worker（平局随机）
        ...
    };

    // 4. 无论走哪条路，都更新树，记录这次路由决策
    if let Some(idx) = selected_idx {
        tree.insert(text, workers[idx].url());
    }
    selected_idx
}`} />

      <p><strong>关键设计：</strong></p>
      <ul>
        <li><strong>cache_threshold（默认 0.5）</strong>：命中率超过 50% 才走缓存路由，否则退化负载均衡——避免低命中率时把流量全部打到同一个「最长前缀」worker 造成热点</li>
        <li><strong>双阈值负载均衡触发</strong>：必须同时满足 <code>max-min &gt; 32</code>（绝对）与 <code>max &gt; min×1.1</code>（相对），防止单一阈值误触发</li>
        <li><strong>Pool 隔离</strong>：树 key 为 <code>{'"{pool}::{model}"'}</code>（如 <code>prefill::llama-3</code>），防止 prefill/decode/regular 池互相驱逐租户</li>
        <li><strong>树更新实时性</strong>：每次路由决策后立即 <code>tree.insert(text, worker_url)</code>，近似树保持新鲜</li>
      </ul>

      <h3>4.3 前缀树 tree.rs：多租户并发 Radix Tree</h3>
      <p><SrcLink path="src/policies/tree.rs" />（2310 行）是 cache_aware 的地基，做了大量极致优化：</p>
      <CodeBlock language="rust" title="Node 结构 (src/policies/tree.rs:229-243)" code={`struct Node {
    children: DashMap<char, NodeRef, CharHasherBuilder>,  // 分片锁 + char identity hasher
    text: RwLock<NodeText>,          // 缓存 char_count，O(1) 长度
    tenant_last_access_time: DashMap<TenantId, u64>,  // 每租户 LRU 时间戳
    parent: RwLock<Option<NodeRef>>, // 父指针（向上更新时间戳）
    last_tenant: parking_lot::RwLock<Option<TenantId>>, // O(1) 租户缓存
}

// 全局 epoch 计数器：用 AtomicU64 代替 SystemTime，无系统调用
static EPOCH: AtomicU64 = ...;
fn get_epoch() -> u64 { EPOCH.fetch_add(1, Ordering::Relaxed) }`} />

      <p><strong>五类极致优化：</strong></p>
      <table>
        <thead><tr><th>优化</th><th>做法</th><th>收益</th></tr></thead>
        <tbody>
          <tr><td><strong>TenantId = Arc&lt;str&gt;</strong></td><td>租户 URL 去重后共享，避免每请求分配 String</td><td>廉价克隆</td></tr>
          <tr><td><strong>NodeText 缓存长度</strong></td><td>UTF-8 的 <code>chars().count()</code> 是 O(n)，缓存成 O(1)</td><td>前缀比较提速</td></tr>
          <tr><td><strong>CharHasher</strong></td><td>针对 char 键的 identity hasher + 黄金比例混合</td><td>哈希更快</td></tr>
          <tr><td><strong>last_tenant 缓存</strong></td><td>避免每次 prefix_match 遍历 DashMap 全部分片找租户</td><td>O(shards) → O(1)</td></tr>
          <tr><td><strong>概率性时间戳</strong></td><td><code>if epoch &amp; 0x7 == 0</code> 每 8 次匹配才更新 LRU 时间戳</td><td>减少 DashMap 竞争</td></tr>
        </tbody>
      </table>

      <p><strong>插入算法</strong>是标准 radix 分裂：无子节点 → 创建叶子；部分匹配 → 分裂中间节点；完全匹配 → 继续下行。
      <strong>驱逐算法</strong>按「租户大小 LRU」：收集每个租户的叶子进最小堆，从最久未访问的开始驱逐，
      直到该租户字符数 ≤ <code>max_tree_size</code>；节点清空后自底向上删除，父节点变新叶子重新入堆。</p>

      <h3>4.4 power_of_two：二选一负载均衡</h3>
      <CodeBlock language="rust" title="PowerOfTwoPolicy (src/policies/power_of_two.rs)" code={`pub struct PowerOfTwoPolicy {
    cached_loads: RwLock<HashMap<String, isize>>,  // LoadMonitor 喂入的 token 级负载
}

async fn select_worker(&self, workers: &[Arc<dyn Worker>], _info: &SelectWorkerInfo<'_>)
    -> Option<usize> {
    let healthy = get_healthy_worker_indices(workers);
    if healthy.len() <= 1 { return healthy.first().copied(); }

    // O(1) 选两个不同随机下标
    let idx1 = rng.random_range(0..healthy.len());
    let idx2 = (idx1 + 1 + rng.random_range(0..healthy.len() - 1)) % healthy.len();

    // 高保真 token 负载；若任一 worker 缺 token 数据，两者一起降级到请求计数
    let (load1, load2) = match (t1, t2) {
        (Some(t1), Some(t2)) => (t1, t2),
        _ => (worker1.load() as isize, worker2.load() as isize),  // 量纲必须一致！
    };
    let selected = if load1 <= load2 { worker_idx1 } else { worker_idx2 };
    Some(selected)
}`} />
      <p>理论保证：最大负载不超过最优选择的 2 倍。代码里特别修了一个 bug——<strong>token 数与请求计数量纲不同</strong>，
      若一个 worker 有 token 数据另一个没有，直接比较会产生误导，必须同时降级。</p>

      <h3>4.5 bucket：为 P/D 分离设计的长度分桶</h3>
      <p><SrcLink path="src/policies/bucket.rs" />（1405 行）专为 PD 架构设计：把请求<strong>按 prompt 字符长度分到不同 prefill 节点</strong>，
      使每个 prefill 的 KV cache 用量相近，并支持动态调整桶边界：</p>
      <CodeBlock language="rust" title="桶边界动态调整 (src/policies/bucket.rs)" code={`// 初始边界：3 个节点，l_max=4096 → gap=1365
// Bucket 0: [0, 1364]    → worker_0
// Bucket 1: [1365, 2729] → worker_1
// Bucket 2: [2730, MAX]  → worker_2
pub fn init_prefill_worker_urls(&mut self, urls: Vec<String>) {
    let worker_cnt = urls.len();
    let gap = self.l_max / worker_cnt;
    self.l_max = usize::MAX;   // 初始化后上界设为无穷
    self.boundary = urls.iter().enumerate().map(|(i, url)| {
        Boundary::new(url.clone(), [i * gap, if i == worker_cnt - 1 { self.l_max } else { (i + 1) * gap - 1 }])
    }).collect();
}

// 后台线程每 5 秒检查：总负载变化超过 2x 才重算边界，避免抖动
fn adjust_boundary(&mut self) {
    let new_per_bucket = self.get_total_load() / self.bucket_cnt;
    if new_per_bucket <= 2 * self.bucket_load
        && self.bucket_load <= 2 * new_per_bucket && self.bucket_load != 0 {
        return;  // 无需调整
    }
    // 按历史请求长度分布重新划边界，使每桶负载接近 new_per_bucket
}`} />

      <h3>4.6 PolicyRegistry：按模型组织策略</h3>
      <p><SrcLink path="src/policies/registry.rs" /> 以 <code>model_id → 策略</code> 的 DashMap 组织，支持 IGW 多模型下每个模型独立策略，
      并允许 worker 通过 <code>labels</code> 携带 <code>policy</code> 提示覆盖默认策略。CacheAware 需要特殊初始化：
      首次注册 worker 时就用全部 worker URL 初始化前缀树，否则第一次 <code>prefix_match</code> 会找不到租户。</p>

      <h3>4.7 策略选型速查</h3>
      <table>
        <thead><tr><th>策略</th><th>需要文本</th><th>适用场景</th><th>复杂度</th></tr></thead>
        <tbody>
          <tr><td><strong>cache_aware</strong>（默认）</td><td>✅ request_text</td><td>多轮对话 / RAG / 前缀复用高</td><td>O(prefix_len)</td></tr>
          <tr><td><strong>power_of_two</strong></td><td>❌</td><td>大规模集群，负载均衡</td><td>O(1)</td></tr>
          <tr><td><strong>bucket</strong></td><td>✅ request_text</td><td>P/D 分离，均衡 prefill 的 KV 用量</td><td>O(log n)</td></tr>
          <tr><td><strong>round_robin</strong></td><td>❌</td><td>均匀分发、无缓存需求</td><td>O(1)</td></tr>
          <tr><td><strong>random</strong></td><td>❌</td><td>快速降级兜底</td><td>O(1)</td></tr>
          <tr><td><strong>prefix_hash</strong></td><td>❌（用 tokens）</td><td>轻量级 cache 感知</td><td>O(log n)</td></tr>
          <tr><td><strong>manual / consistent_hashing</strong></td><td>❌（用 headers）</td><td>会话粘性（X-SMG-Routing-Key）</td><td>O(log n)</td></tr>
        </tbody>
      </table>

      {/* ==================== 5. gRPC 推理管线 ==================== */}
      <div className="section-divider"><span>gRPC 推理管线：行业首个纯 Rust 实现</span></div>
      <p>当 <code>connection_mode=grpc</code> 时，网关用 <strong>tonic</strong> 直接以 gRPC 协议连 SGLang / vLLM worker，
      绕过 HTTP 层，并首次把 <strong>tokenizer / reasoning parser / tool parser 全部搬进 Rust 进程</strong>——
      这是相对 AIBrix（纯 HTTP 数据面）最大的差异化能力。</p>
      <p>核心文件：<SrcLink path="src/routers/grpc/pipeline.rs" />（六种管线工厂，868 行）、<SrcLink path="src/routers/grpc/client.rs" />（SGLang/vLLM 双后端）、<SrcLink path="src/routers/grpc/proto_wrapper.rs" />（proto 统一抽象）、<SrcLink path="src/routers/grpc/common/stages/mod.rs" />（PipelineStage trait）。</p>

      <h3>5.1 七阶段请求管线</h3>
      <p>一个 chat 请求从进入 <code>GrpcRouter</code> 到返回 SSE 流，走 <strong>7 个 Pipeline Stage</strong>。
      所有阶段共享同一个 <code>RequestContext</code>，用 <code>Option&lt;T&gt;</code> 字段在阶段间传递数据：</p>
      <MermaidDiagram scale={0.5} chart={`
flowchart TB
    R["HTTP 请求 (Axum)"] --> D["HarmonyDetector<br/>识别 GPT-OSS 模型?"]
    D --> P1["Stage1 Preparation<br/>resolve_tokenizer + chat template<br/>进程内 encode + 工具约束"]
    P1 --> P2["Stage2 WorkerSelection<br/>LoadBalancingPolicy 选 worker"]
    P2 --> P3["Stage3 ClientAcquisition<br/>获取/缓存 GrpcClient"]
    P3 --> P4["Stage4 RequestBuilding<br/>token_ids + 约束 → Proto<br/>(PD 模式注入 bootstrap 元数据)"]
    P4 --> P5["Stage5 DispatchMetadata<br/>request_id / model / created"]
    P5 --> P6["Stage6 RequestExecution<br/>gRPC 流式生成<br/>AbortOnDropStream"]
    P6 --> P7["Stage7 ResponseProcessing<br/>token→text 增量解码<br/>reasoning/tool 增量解析 → SSE"]
      `} />
      <CodeBlock language="rust" title="PipelineStage trait (common/stages/mod.rs:15-27)" code={`#[async_trait]
pub trait PipelineStage: Send + Sync {
    /// Ok(None) 继续下一个阶段；Ok(Some(Response)) 提前返回（流式）；
    /// Err(Response) 返回错误响应
    async fn execute(&self, ctx: &mut RequestContext) -> Result<Option<Response>, Response>;
    fn name(&self) -> &'static str;   // 日志 / 指标用
}

// RequestContext = 不可变输入 + 共享组件 + 各阶段输出的状态机
pub(crate) struct ProcessingState {
    pub preparation: Option<PreparationOutput>,  // Stage1 输出
    pub workers: Option<WorkerSelection>,        // Stage2
    pub clients: Option<ClientSelection>,        // Stage3
    pub proto_request: Option<ProtoRequest>,     // Stage4
    pub load_guards: Option<LoadGuards>,         // Stage6 RAII
    pub response: ResponseState,                 // Stage7
}`} />
      <CodeBlock language="rust" title="七阶段编排 (pipeline.rs:82-94)" code={`let stages: Vec<Box<dyn PipelineStage>> = vec![
    Box::new(PreparationStage::new()),
    Box::new(WorkerSelectionStage::new(worker_registry, policy_registry,
        WorkerSelectionMode::Regular)),
    Box::new(ClientAcquisitionStage),
    Box::new(RequestBuildingStage::new(false)),  // false = 无 PD 元数据
    Box::new(DispatchMetadataStage),
    Box::new(RequestExecutionStage::new(ExecutionMode::Single)),
    Box::new(ResponseProcessingStage::new(processor, streaming_processor)),
];

for stage in self.stages.iter() {
    match stage.execute(&mut ctx).await {
        Ok(Some(response)) => return response,   // 流式提前返回
        Ok(None) => continue,
        Err(response) => return response,
    }
}`} />

      <h3>5.2 进程内 tokenizer / parser：为什么是行业首创</h3>
      <p>传统方案里，tokenizer 跑在 Python worker 端，每个请求都要多走一次网络往返
      （文本 → Python encode → token_ids，生成完 token 流再传回 Python detokenize）。
      加上 Python GIL 限制并发吞吐，reasoning/tool parser 也无法与 Rust 网关共享状态。</p>
      <p>Gateway 用三个 crate 把这一切进程内化：</p>
      <table>
        <thead><tr><th>crate</th><th>版本</th><th>职责</th></tr></thead>
        <tbody>
          <tr><td><code>llm-tokenizer</code></td><td>=1.3.2</td><td>HuggingFace 兼容 tokenizer，进程内 <code>apply_chat_template</code> + <code>encode</code></td></tr>
          <tr><td><code>reasoning-parser</code></td><td>=1.0.0</td><td>think/thinking 标签推理内容解析，支持 <code>parse_reasoning_streaming_incremental</code> 增量</td></tr>
          <tr><td><code>tool-parser</code></td><td>=1.0.0</td><td>增量 tool call 解析（JSON / DSML / XML 等 8 种格式）</td></tr>
          <tr><td><code>openai-harmony</code></td><td>v0.0.4</td><td>GPT-OSS Harmony 编码（tiktoken 风格）与流式解析</td></tr>
        </tbody>
      </table>
      <CodeBlock language="rust" title="进程内 tokenize（chat/preparation.rs:46-74）" code={`// Step 0: 从 Registry 解析 tokenizer
let tokenizer = utils::resolve_tokenizer(ctx, "ChatPreparationStage")?;
// Step 1: 按 tool_choice 过滤 tools
let body_ref = utils::filter_chat_request_by_tool_choice(request);
// Step 2: 进程内应用 chat template（HuggingFace tokenizer）
let processed_messages = utils::process_chat_messages(&body_ref, &*tokenizer)?;
// Step 3: 进程内 encode——不走网络！
let encoding = tokenizer.encode(&processed_messages.text, false)?;
let token_ids = encoding.token_ids().to_vec();
// Step 4: 构建 JSON schema 工具约束 + stop sequence 解码器
let tool_call_constraint = utils::generate_tool_constraints(tools, &request.tool_choice, ...)?;
let stop_decoder = utils::create_stop_decoder(&tokenizer, ...);
ctx.state.preparation = Some(PreparationOutput { token_ids, tool_constraints, ... });`} />
      <p><strong>收益</strong>：token_ids 直接构建 gRPC proto（零拷贝）；worker 返回 token 流后 Rust 进程内
      增量 decode 成文本，每个 chunk 不再走网络；reasoning/tool parser 以增量方式逐 chunk 解析，
      边收边发 SSE。入口在 <SrcLink path="src/routers/grpc/regular/stages/chat/preparation.rs" />，流式解析在
      <SrcLink path="src/routers/grpc/regular/streaming.rs" />（1346 行）。</p>

      <h3>5.3 Regular / Harmony 双管线</h3>
      <p>同一套 7 阶段骨架可组装出 6 种管线（Regular / PD / Harmony / Harmony-PD / Embedding / Classify）。
      入口用 <code>HarmonyDetector</code> 判断模型是否 GPT-OSS：</p>
      <CodeBlock language="rust" title="HarmonyDetector 三重检测 (harmony/detector.rs:17-43)" code={`pub fn is_harmony_worker(worker: &dyn Worker) -> bool {
    for model_card in worker.models() {
        // 1. architectures 包含 "GptOssForCausalLM"
        if model_card.architectures.iter().any(|a| a == "GptOssForCausalLM") { return true; }
        // 2. hf_model_type == "gpt_oss"
        if model_card.hf_model_type.as_deref() == Some("gpt_oss") { return true; }
        // 3. model_id 包含 "gpt-oss"
        if is_harmony_model(&model_card.id) { return true; }
    }
    is_harmony_model(worker.model_id())
}`} />
      <table>
        <thead><tr><th>维度</th><th>Regular 管线</th><th>Harmony 管线</th></tr></thead>
        <tbody>
          <tr><td><strong>请求编码</strong></td><td>HuggingFace chat template + tokenizer.encode()</td><td>openai-harmony <code>HarmonyEncoding</code>（tiktoken 风格）</td></tr>
          <tr><td><strong>响应解析</strong></td><td>token→text + reasoning_parser + tool_parser</td><td>channel-based（analysis / commentary / final）</td></tr>
          <tr><td><strong>Tool call 发现</strong></td><td>tool_parser 增量解析 JSON</td><td>Harmony 消息 <code>recipient</code> 字段以 <code>functions.</code> 开头</td></tr>
          <tr><td><strong>Reasoning</strong></td><td>独立 reasoning_parser（think 标签）</td><td>Harmony <code>analysis</code> channel</td></tr>
          <tr><td><strong>Responses API</strong></td><td>不支持（需外部 tool loop）</td><td>原生支持 MCP tool loop</td></tr>
          <tr><td><strong>复用</strong></td><td colSpan={2}>Stage 2/3/5/6 完全共用，只有 Preparation / RequestBuilding / ResponseProcessing 不同</td></tr>
        </tbody>
      </table>
      <p>Harmony 细节（<SrcLink path="src/routers/grpc/harmony/builder.rs" />、<SrcLink path="src/routers/grpc/harmony/parser.rs" />）：
      工具约束用 <code>triggered_tags</code> 结构标签格式（如触发器 <code>&lt;|start|&gt;assistant&lt;|channel|&gt;commentary</code>），
      每个 tag 的 content 是 JSON schema 参数约束；<code>&lt;|return|&gt;</code> / <code>&lt;|call|&gt;</code> 作为 stop token
      注入采样参数。<strong>Harmony 仅支持 SGLang 后端</strong>（request_building.rs 明确拒绝 vLLM），
      且 Responses API 原生支持多轮 MCP tool loop。</p>

      <h3>5.4 流式 SSE 组装与 PD 双路分发</h3>
      <p><code>StreamingProcessor</code> 把 token 流增量解码为文本，并用 <code>mpsc::unbounded_channel</code>
      组装 SSE，每个 chunk 复用同一 buffer（零分配格式化）。三路解析并行推进：</p>
      <ul>
        <li><strong>token→text</strong>：<code>StopSequenceDecoder.process_token</code> 增量解码，识别 stop 序列后截断</li>
        <li><strong>reasoning 流</strong>：每个 output index 独立 parser（<code>parse_reasoning_streaming_incremental</code>），
        产出 <code>reasoning_text</code> 与 <code>normal_text</code> 分开发 SSE</li>
        <li><strong>tool call 流</strong>：每 index 独立 tool parser，<code>parse_incremental</code> 产出工具名 + 增量参数 delta</li>
      </ul>
      <CodeBlock language="rust" title="SSE 零分配格式化 (regular/streaming.rs:1314-1325)" code={`fn format_sse_chunk_into(buffer: &mut Vec<u8>, chunk: &ChatCompletionStreamResponse) {
    buffer.clear();
    buffer.extend_from_slice(b"data: ");
    serde_json::to_writer(&mut *buffer, chunk).unwrap();
    buffer.extend_from_slice(b"\n\n");
}`} />
      <p><strong>双后端抽象</strong>：<code>GrpcClient</code> 是 <code>{'enum { Sglang, Vllm }'}</code> 多态客户端，
      <code>ProtoStream</code> / <code>ProtoGenerateRequest</code> 用 enum 屏蔽两家的 proto 差异。
      <code>AbortOnDropStream</code> 是关键资源管理：客户端断连时 stream 被 Drop，自动向 worker 发 abort 请求释放 GPU。</p>
      <p><strong>PD 模式双路分发</strong>（<code>GrpcPDRouter</code> + <code>ExecutionMode::DualDispatch</code>）：
      <code>tokio::join!</code> 并发向 prefill 和 decode worker 发起 gRPC 调用，两个熔断器独立记录结果；
      注入 <code>bootstrap_host/port/room</code> 让 decode 知道去哪取 KV cache。</p>

      {/* ==================== 6. HTTP 数据面路由 ==================== */}
      <div className="section-divider"><span>HTTP 数据面：路由转发、重试与断路器</span></div>
      <p>默认 <code>connection_mode=http</code> 时走 <code>src/routers/http/</code>。所有路由器实现统一的
      <code>RouterTrait</code>（<SrcLink path="src/routers/mod.rs" />:47），收到的是<strong>已反序列化的 typed body</strong>——
      协议校验在 axum 层完成，路由器只关心「转发给谁、怎么重试」。</p>
      <p>核心文件：<SrcLink path="src/routers/router_manager.rs" />（多路由器分发）、<SrcLink path="src/routers/http/router.rs" />（Regular）、<SrcLink path="src/routers/http/pd_router.rs" />（PD，2025 行）。</p>

      <h3>6.1 RouterManager：多路由器按需分发</h3>
      <p>IGW 多模型模式下，RouterManager 同时持有 5 个路由器（HTTP regular / HTTP PD / gRPC regular / gRPC PD / OpenAI），
      每请求按 model 的 worker 类型打分选一个：</p>
      <CodeBlock language="rust" title="按 model 选路由器 (src/routers/router_manager.rs:280-326)" code={`pub fn get_router_for_model(&self, model_id: &str) -> Option<Arc<dyn RouterTrait>> {
    let workers = self.worker_registry.get_by_model(model_id);
    let best = workers.iter().map(|w| {
        let is_pd = matches!(w.worker_type(), WorkerType::Prefill{..} | WorkerType::Decode);
        let is_grpc = matches!(w.connection_mode(), ConnectionMode::Grpc{..});
        let is_external = matches!(w.metadata().runtime_type, RuntimeType::External);
        if is_external { return (4, HTTP_OPENAI); }
        match (is_grpc, is_pd) {
            (true,  true)  => (3, GRPC_PD),
            (false, true)  => (2, HTTP_PD),
            (true,  false) => (1, GRPC_REGULAR),
            (false, false) => (0, HTTP_REGULAR),
        }
    }).max_by_key(|(score, _)| *score);
    ...
}`} />
      <p><strong>无锁快照</strong>：路由表存 <code>ArcSwap&lt;Vec&lt;Arc&lt;dyn RouterTrait&gt;&gt;&gt;</code>，
      热路径 atomic load 一个 Arc 即可遍历，不吃 DashMap 分片锁。客户端可用 <code>x-prefer-pd</code> header
      显式优先选 PD 路由器。</p>

      <h3>6.2 请求转发：重试外壳 + RAII 负载计数</h3>
      <p>三个端点（chat / completion / generate）只差 URL 字符串，统一走 <code>route_typed_request</code>：
      外层 <code>RetryExecutor</code> 包一层 attempt 循环，每次 attempt 重新选 worker（天然避开临时故障节点）：</p>
      <CodeBlock language="rust" title="选 worker + 发送 (src/routers/http/router.rs:273-337)" code={`async fn route_typed_request_once(...) -> Response {
    // ① 选一个可用 worker（含熔断器感知）
    let worker = match self.select_worker_for_model(model_id, Some(text), headers).await {
        Some(w) => w, None => return error::service_unavailable("no_available_workers", ...),
    };
    // ② cache_aware / manual 策略给负载加 RAII guard
    let policy = self.policy_registry.get_policy_or_default(model_id);
    let load_guard = ["cache_aware", "manual"].contains(&policy.name())
        .then(|| WorkerLoadGuard::new(worker.clone(), headers));
    // ③ 注入 trace context 后真正发送
    inject_trace_context_http(&mut headers_with_trace);
    let response = self.send_typed_request(Some(&headers_with_trace), typed_req,
        route, &worker, is_stream, load_guard).await;
    // ④ 非流式立即记断路器结果；流式由 BreakerTrackedStream 在 drop 时记
    if !is_stream { worker.record_outcome(response.status().is_success()); }
    response
}`} />
      <p><strong>RAII 生命周期管理</strong>是本节核心思想：</p>
      <ul>
        <li><strong><code>WorkerLoadGuard</code></strong>：持有 <code>Arc&lt;dyn Worker&gt;</code>，Drop 时自动
        <code>decrement_load()</code>——把「负载计数」绑定到变量生命周期</li>
        <li><strong><code>AttachedBody</code></strong>：把 guard 挂到 axum response body 上，
        流式响应被客户端读完或断连 drop 时自动 -load</li>
        <li><strong><code>BreakerTrackedStream</code></strong>：包装 reqwest 字节流，在 Drop 时按
        <code>Terminal</code> 状态（Active/Completed/Errored）记一次熔断器结果——
        修复了「200-then-broken」的 worker 被误判健康的经典问题</li>
      </ul>

      <h3>6.3 PD 路由器：并发双路 + 精细熔断归因</h3>
      <p><code>PDRouter</code>（src/routers/http/pd_router.rs，2025 行）把请求拆给 prefill + decode 两个独立 worker，
      prefill 和 decode 可用<strong>不同策略</strong>（如 prefill 用 cache_aware、decode 用 round_robin）：</p>
      <CodeBlock language="rust" title="tokio::select! 并发双路（pd_router.rs:646-710）" code={`let prefill_fut = prefill_request.send();
let decode_fut  = decode_request.send();
tokio::pin!(prefill_fut);
tokio::pin!(decode_fut);
loop {
    tokio::select! {
        biased;                             // 优先处理 prefill 完成
        pr = &mut prefill_fut => { prefill_result = pr; break; }
        dr = &mut decode_fut, if decode_early.is_none() => { decode_early = Some(dr); }
    }
}
// prefill 失败 → 放弃 decode（没有 KV 就无法生成）
if prefill_failed {
    // drop decode_fut 关连接，decode engine 4-8s 内感知并 abort
    response.extensions_mut().insert(BreakerOutcomesRecorded);
    return response;
}`} />
      <ul>
        <li><strong>bootstrap 三件套注入</strong>：<code>bootstrap_host / bootstrap_port / bootstrap_room</code>，
        room 是 <code>rand::random::&lt;u64&gt;() &amp; (i64::MAX)</code>，与 Python 端 <code>random.randint(0, 2^63-1)</code> 对齐，
        供 decode↔prefill 之间的 NCCL/KV 传输配对</li>
        <li><strong><code>BreakerOutcomesRecorded</code> 标记</strong>：放在 Response extensions 里，
        防止外层 dispatcher 再按状态码误记——decode 的 5xx 不应拖累 prefill 的熔断器</li>
        <li><strong>不 spawn 独立 task</strong>：两个 Future pin 在当前 task，客户端断连时整个 future chain drop，
        两个上游连接同步关闭，引擎及时 abort</li>
        <li><strong>DP-aware 注入</strong>：decode 请求额外注入 <code>disagg_prefill_dp_rank</code>，
        让 decode 知道 prefill 是哪个 DP rank，做 KV 对齐；非 DP 路径用 <code>Cow::Borrowed</code> 全程零分配</li>
      </ul>

      {/* ==================== 7. OpenAI 路由与 MCP ==================== */}
      <div className="section-divider"><span>OpenAI 路由 / Responses API 与 MCP Agent</span></div>
      <p>Gateway 不止代理本地 SGLang worker——它还能把 OpenAI / Anthropic / xAI / Gemini 当远程后端代理，
      以及原生支持 OpenAI Responses API 的 <strong>MCP tool loop</strong>，这是 AIBrix 完全不具备的 Agent 能力。</p>
      <p>核心文件：<SrcLink path="src/routers/openai/router.rs" />（Responses 路由）、<SrcLink path="src/routers/openai/provider.rs" />（Provider trait）、<SrcLink path="src/routers/openai/responses/tool_handler.rs" />（流式 tool loop）、<SrcLink path="src/routers/openai/responses/mcp.rs" />（MCP 客户端接入）。</p>

      <h3>7.1 Provider 抽象：抹平厂商差异</h3>
      <CodeBlock language="rust" title="Provider trait（openai/provider.rs:55-78）" code={`pub trait Provider: Send + Sync {
    fn provider_type(&self) -> ProviderType;
    fn transform_request(&self, payload: &mut Value, _endpoint: Endpoint)
        -> Result<(), ProviderError> {
        strip_sglang_fields(payload);   // 默认剥掉 SGLang 私有字段
        Ok(())
    }
    fn transform_response(&self, _response: &mut Value, _endpoint: Endpoint)
        -> Result<(), ProviderError> { Ok(()) }
    fn apply_headers(&self, builder: RequestBuilder) -> RequestBuilder { builder }
}`} />
      <p><code>strip_sglang_fields</code> 剥掉 23 个 SGLang 私有字段（<code>request_id</code> / <code>priority</code> /
      <code>regex</code> / <code>lora_path</code> / <code>separate_reasoning</code> 等），避免泄漏给远程厂商。
      按 model 名前缀自动选 provider（<code>gpt-</code>→OpenAI、<code>claude-</code>→Anthropic、
      <code>gemini-</code>→Gemini、<code>grok-</code>→xAI）；xAI 在 /v1/responses 上把 <code>output_text</code>
      改写成 <code>input_text</code> 并删 <code>id</code>/<code>status</code>，Gemini 在 <code>logprobs=false</code>
      时移除该字段（它不接受）。</p>

      <h3>7.2 Responses API：持久化 + 后台任务</h3>
      <p><code>/v1/responses</code> 比 chat 复杂得多：要沿 <code>previous_response_id</code> 链加载历史、
      持久化 response/conversation 到后端、在 SSE 流里拦截 tool call 并循环执行。核心是 <code>StreamingToolHandler</code>：</p>
      <CodeBlock language="rust" title="流式 tool 拦截（responses/tool_handler.rs:77-115）" code={`pub(super) struct StreamingToolHandler {
    pub accumulator: StreamingResponseAccumulator,   // 攒出最终 response
    pub pending_calls: Vec<FunctionCallInProgress>,
    in_function_call: bool,
    output_index_mapper: OutputIndexMapper,          // 上游可能跳 index，对外要连续
    pub original_response_id: Option<String>,
}
pub(super) enum StreamAction {
    Forward,       // 直接转发给客户端
    Buffer,        // 攒着（function_call arguments delta 期间）
    ExecuteTools,  // 所有 pending call 完成，跳出流循环去执行工具
}`} />
      <p><strong>Accumulator fallback</strong>：即使上游流中途断掉没有 <code>response.completed</code>，
      也能用 <code>initial_response</code> + 按 output_index 排序的 <code>output_items</code> 合成可持久化的 response。
      <strong>OutputIndexMapper</strong> 把上游可能跳号的 index 重映射为对外连续递增的 index。</p>

      <h3>7.3 MCP 客户端与工具循环</h3>
      <p>请求级按需连接（<code>ensure_request_mcp_client</code>）：请求里带 <code>{'type: "mcp", server_url'}</code>
      工具时，网关按 URL 是否含 <code>/sse</code> 选 SSE transport 或 MCP 最新的 <strong>Streamable HTTP</strong> transport，
      <code>get_or_create_client</code> 按 (name+url+transport) 去重复用连接。工具调用循环用默认
      <code>max_iterations=10</code> 防死循环，超限构造 <code>{'incomplete_details: {reason: "max_tool_calls"}'}</code>：</p>
      <CodeBlock language="rust" title="工具循环（responses/mcp.rs:502-667）" code={`loop {
    let response_json = client.post(url).json(&current_payload).send().await?.json().await?;
    if let Some((call_id, tool_name, args_json_str)) = extract_function_call(&response_json) {
        state.iteration += 1; state.total_calls += 1;
        if state.total_calls > effective_limit {
            return build_incomplete_response(response_json, state, "max_tool_calls", ...);
        }
        let call_result = active_mcp.call_tool(&tool_name, args_json_str).await;
        // 失败也包装成 JSON 输出，让模型决定如何处理
        state.record_call(call_id, tool_name, args_json_str, output_str);
        current_payload = build_resume_payload(&base_payload, &state.conversation_history, ...)?;
    } else {
        // 没有更多 tool call，注入 mcp_list_tools + mcp_call items 后返回
        return Ok(response_json);
    }
}`} />
      <p>启动期 MCP server 注册走 4 步 workflow：<code>connect</code>（100 次重试 + 2 小时超时处理慢启动）→
      <code>discover_inventory</code>（拉 tools/prompts/resources）→ <code>register</code> → <code>validate</code>；
      <code>required</code> 字段决定 fail-fast 还是 best-effort。</p>

      <h3>7.4 tokenize / parse / 会话存储</h3>
      <ul>
        <li><strong><code>POST /v1/tokenize</code> / <code>/v1/detokenize</code></strong>：进程内 tokenizer，
        支持 batch，返回 tokens / count / char_count</li>
        <li><strong><code>POST /v1/parse/function_call</code> 与 <code>/parse/reasoning</code></strong>：
        <code>ParserFactory</code> 池化 parser，避免每请求重建状态；tool parser 支持 8 种格式
        （deepseek_dsml / glm_xml / hy_v3 / kimi_k2 / minimax_m2 / gemma4 / json 等），
        reasoning parser 支持 deepseek_r1 / qwen3 / kimi / cohere_cmd / gemma4 / delimited</li>
        <li><strong>会话存储</strong>：<code>history_backend</code> 在 Memory / Oracle / Postgres / Redis / None 间切换，
        通过三个 <code>Arc&lt;dyn Trait&gt;</code>（ResponseStorage / ConversationStorage / ConversationItemStorage）注入，
        路由代码完全无分支</li>
      </ul>

      {/* ==================== 8. 可靠性 / 中间件 / 可观测性 ==================== */}
      <div className="section-divider"><span>可靠性、中间件与可观测性</span></div>
      <p>网关的可靠性层围绕 <strong>无锁热路径</strong> 设计——熔断器全原子、指标字符串 intern、
      令牌回补 Drop 安全，在毫秒级数据面上把同步开销压到最低。</p>
      <p>核心文件：<SrcLink path="src/core/circuit_breaker.rs" />、<SrcLink path="src/core/retry.rs" />（重试/退避）、<SrcLink path="src/core/token_bucket.rs" />、<SrcLink path="src/observability/metrics.rs" />。</p>

      <h3>8.1 熔断器：原子 u8 状态机</h3>
      <CodeBlock language="rust" title="CircuitBreaker（circuit_breaker.rs:102-116）" code={`pub struct CircuitBreaker {
    state: AtomicU8,                     // 0=Closed 1=Open 2=HalfOpen
    consecutive_failures: AtomicU32,     // 连续失败计数
    consecutive_successes: AtomicU32,
    total_failures: AtomicU64,
    total_successes: AtomicU64,
    last_failure_time_ms: AtomicU64,     // 单调时钟 ms
    last_state_change_ms: AtomicU64,
    config: CircuitBreakerConfig,        // failure=5, success=2, timeout=30s, window=60s
    metric_label: String,
}`} />
      <p><strong>无锁</strong>：<code>can_execute()</code> 只读原子值，零竞争。Open → HalfOpen 不是后台定时器推动，
      而是每次 <code>state()</code> 调用时<strong>惰性</strong>检查 elapsed 并用 <code>compare_exchange</code> 原子切换
      （多个线程同时尝试时只有一个能成功）。<code>now_ms()</code> 用 <code>OnceLock&lt;Instant&gt;</code> 作单调基准，
      避免 SystemTime 跳变。关键语义：<strong>成功会清零连续失败</strong>，间歇性抖动不会误触发熔断。</p>

      <h3>8.2 重试：指数退避 + 双向 jitter</h3>
      <CodeBlock language="rust" title="可重试状态码与退避（retry.rs:10-45）" code={`pub fn is_retryable_status(status: StatusCode) -> bool {
    matches!(status,
        StatusCode::REQUEST_TIMEOUT       // 408
        | StatusCode::TOO_MANY_REQUESTS   // 429
        | StatusCode::INTERNAL_SERVER_ERROR // 500
        | StatusCode::BAD_GATEWAY         // 502
        | StatusCode::SERVICE_UNAVAILABLE // 503
        | StatusCode::GATEWAY_TIMEOUT     // 504
    )   // 注意：400/401/403/404 客户端错误绝不重试
}
// delay = min(initial * multiplier^attempt, max) 再叠加 [-jitter, +jitter] 对称抖动
// 默认 initial=50ms, max=30000ms, multiplier=1.5, jitter=0.2`} />
      <p>重试与熔断通过闭包松耦合：每次 attempt 内部调 <code>worker.record_outcome()</code> 推进熔断器；
      熔断器 open 时 <code>is_available()</code> 返回 false，选 worker 阶段直接跳过该节点——无效请求不发。</p>

      <h3>8.3 令牌桶 + FIFO 队列限流</h3>
      <p><code>TokenBucket</code> 两种模式：<code>refill_rate &gt; 0</code> 经典令牌桶；<code>=0</code>
      退化为纯并发限制器（等价 semaphore）。<strong>令牌回补发生在 body 完全消费后</strong>（对 streaming 至关重要）——
      <code>TokenGuardBody</code> 的 Drop 调 <code>return_tokens_sync()</code>，即使 tokio runtime 关闭也能保证归还。
      <code>ConcurrencyLimiter</code> 用 <code>mpsc</code> 提供有界 FIFO 队列（默认 100）+ 队列超时（默认 60s），
      支持 mesh 集群全局速率限制（跨网关共享配额）。</p>

      <h3>8.4 中间件栈与认证分层</h3>
      <table>
        <thead><tr><th>中间件</th><th>职责</th></tr></thead>
        <tbody>
          <tr><td><code>auth_middleware</code></td><td>API Key 校验，<code>subtle::ConstantTimeEq</code> 常量时间比较防 timing attack</td></tr>
          <tr><td><code>control_plane_auth_middleware</code></td><td>JWT/OIDC RBAC（smg-auth crate），<strong>只覆盖 admin/worker 管理面路由，不覆盖数据面</strong>——控制面/数据面分离认证</td></tr>
          <tr><td><code>RequestIdLayer</code></td><td>从配置 header 提取或生成 OpenAI 风格 request_id（chatcmpl-/cmpl-/req- + 24 位随机），响应写 x-request-id</td></tr>
          <tr><td><code>HttpMetricsLayer</code></td><td><code>normalize_path_for_metrics</code> 把动态段（UUID / 数字 ID）归一成 <code>{'{id}'}</code>，防指标 label 高基数</td></tr>
          <tr><td><code>concurrency_limit_middleware</code></td><td>先查 mesh 全局限速 → try_acquire → 满则入队 / 队满 429</td></tr>
          <tr><td><code>wasm_middleware</code></td><td>请求/响应两阶段 WASM 钩子（OnRequest 改 headers/body / OnResponse 改 status），模块注册时拒绝 <code>/etc/ /proc/ /sys/</code> 等敏感路径</td></tr>
        </tbody>
      </table>

      <h3>8.5 可观测性：字符串 intern + 分层指标</h3>
      <p><code>metrics.rs</code>（1516 行）的指标前缀分 6 层：<code>smg_http_*</code>（网关黑盒）→
      <code>smg_router_*</code>（路由层，含 <code>ttft_seconds</code> / <code>tpot_seconds</code>）→
      <code>smg_worker_*</code>（worker 池 + 熔断 + 重试）→ <code>smg_discovery_*</code> →
      <code>smg_mcp_*</code> → <code>smg_db_*</code>。</p>
      <CodeBlock language="rust" title="热路径零分配：字符串 intern（metrics.rs:28-47）" code={`static STRING_INTERNER: Lazy<DashMap<String, Arc<str>>> = Lazy::new(DashMap::new);
pub(crate) fn intern_string(s: &str) -> Arc<str> {
    if let Some(entry) = STRING_INTERNER.get(s) { return Arc::clone(entry.value()); }
    STRING_INTERNER.entry(s.to_string()).or_insert_with(|| Arc::from(s)).clone()
}
// 动态 label（model_id / worker URL / path）首次分配后只 Arc::clone；
// 静态 label（HTTP method / status）用 const &str —— 热路径零堆分配`} />
      <p><strong>TTFT / TPOT 精确计算</strong>：<code>TPOT = (总时长 - TTFT) / (输出token数 - 1)</code>，
      20 个 duration 桶（1ms ~ 4min）共享；<code>GaugeHistogram</code> 预注册句柄直接原子写，
      in-flight 请求按年龄分桶（30s ~ 24h）供 Grafana heatmap。OpenTelemetry 用自定义 filter 只导出
      <code>smg::otel-trace</code> 层 span，并把 W3C Trace Context 注入下游 HTTP/gRPC 跨服务追踪。</p>

      {/* ==================== 9. 服务发现与配置 ==================== */}
      <div className="section-divider"><span>K8s 服务发现与配置体系</span></div>

      <h3>9.1 K8s Service Discovery：Informer 模式自动对齐</h3>
      <p><code>service_discovery.rs</code>（1590 行）用 <code>kube::runtime::watcher</code> 订阅 Pod 的 Applied 事件，
      断开时指数退避重连（1s → 300s），发现到新 Pod 就构造 <code>Job::AddWorker</code> 提交 JobQueue 异步注册：
      <strong>发现与控制面解耦</strong>。</p>
      <CodeBlock language="rust" title="标签选择器与 Pod 类型推断（service_discovery.rs:103-217）" code={`fn matches_selector(pod: &Pod, selector: &HashMap<String, String>) -> bool {
    pod.metadata.labels.as_ref().is_some_and(|labels|
        selector.iter().all(|(k, v)| labels.get(k) == Some(v)))
}
pub fn should_include(pod: &Pod, config: &ServiceDiscoveryConfig) -> bool {
    if config.pd_mode {
        matches_selector(pod, &config.prefill_selector)
            || matches_selector(pod, &config.decode_selector)
            || (config.igw_mode && matches_selector(pod, &config.selector))
    } else {
        matches_selector(pod, &config.selector)
    }
}
// PD 模式：从注解 sglang.ai/bootstrap-port 读 prefill 的 bootstrap 端口（Mooncake 传输协商用）`} />
      <p>regular / prefill / decode 三种 Pod 类型按 selector 区分；IGW 模式下 regular worker 也能在 PD 模式被发现。
      另有独立的 <code>start_router_discovery</code> 用 <code>router_selector</code> 维护 mesh 集群节点状态
      （Alive / Suspected / Down，版本号递增驱动 gossip）。</p>

      <h3>9.2 配置体系：CLI → Builder → 校验</h3>
      <p>120+ 个 CLI 参数经 <code>RouterConfig::builder()</code>（<SrcLink path="src/config/types.rs" />）链式构建，<code>build_with_validation()</code>
      在 build 时读取 mTLS 证书与 MCP 配置（文件→字节字段），最后跑 <code>validate()</code>（<SrcLink path="src/config/validation.rs" />）：</p>
      <CodeBlock language="rust" title="校验关键项（config/validation.rs:442-651）" code={`// URL 必须以 http:// / https:// / grpc:// 开头且可解析
// cache_threshold ∈ [0,1]，balance_rel_threshold >= 1.0，eviction/max_tree > 0
// Retry: max_retries >= 1，initial_backoff > 0，max >= initial，multiplier >= 1.0，jitter ∈ [0,1]
// CircuitBreaker: 两个阈值 >= 1，两个时长 > 0
// Discovery: Regular 模式必须配 selector；PD 至少 prefill/decode 其一；OpenAI 不支持 discovery
// Compatibility: PowerOfTwo 至少 2 worker；PD decode 不能用 Bucket 策略
// mTLS: identity 不能为空，CA 列表无空白项
// OTLP endpoint: host:port 格式，port 在 1-65535`} />

      <h3>9.3 安全纵深</h3>
      <ul>
        <li><strong>TLS</strong>：<code>rustls</code> + <code>ring</code> crypto provider，<strong>不依赖 OpenSSL</strong>，
        服务器证书 <code>RustlsConfig::from_pem</code> 支持运行时热加载</li>
        <li><strong>mTLS</strong>：<code>--client-cert-path/--client-key-path</code> 必须成对出现，合并成单一 PEM
        给 <code>reqwest::Identity</code>；<code>ca_certificates</code> 用于校验 worker 证书</li>
        <li><strong>RBAC</strong>：JWT/OIDC（<code>--jwt-issuer/--jwt-audience/--jwt-jwks-uri/--jwt-role-claim</code>）
        只保护管理面；数据面走 API Key</li>
        <li><strong>WASM 沙箱</strong>：模块注册拒绝 <code>/etc/ /proc/ /sys/ /dev/ /boot/ /root/ /var/log/ /var/run/</code>
        敏感路径</li>
      </ul>

      {/* ==================== 10. 与 AIBrix 合并对比 ==================== */}
      <div className="section-divider"><span>与 AIBrix 的合并对比与统一调度视角</span></div>

      <h3>10.1 前缀感知实现对比：Radix Tree vs Prefix Hash Table</h3>
      <p>两者都做「缓存感知路由」，但数据结构不同。SGLang Model Gateway 在 Rust 里维护<strong>字符级 Radix Tree</strong>
      （<SrcLink path="src/policies/tree.rs" />），AIBrix 在 Go 里用 <strong>PrefixHashTable</strong>（<code>pkg/plugins/gateway/algorithms/prefix_cache.go</code>）：</p>
      <table>
        <thead><tr><th>维度</th><th>SGLang Model Gateway</th><th>AIBrix prefix-cache</th></tr></thead>
        <tbody>
          <tr><td><strong>数据结构</strong></td><td>字符级 Radix Tree（共享前缀压缩，多租户 LRU 驱逐）</td><td>Token 级 PrefixHashTable（<code>pkg/cache/prefixcache</code>）</td></tr>
          <tr><td><strong>tokenizer</strong></td><td>进程内 Rust tokenizer（llm-tokenizer crate）</td><td>character / tiktoken tokenizer，可远程 tokenizer pool</td></tr>
          <tr><td><strong>缓存一致性</strong></td><td>单节点内存树 + 可选 mesh 同步</td><td>本地 <code>cache.Cache</code> + 可选 KV Event Sync（远端 tokenizer 前置）</td></tr>
          <tr><td><strong>命中判定</strong></td><td>匹配字符占比 vs <code>cache_threshold</code>（默认 0.5）</td><td>前缀匹配率 + 标准差过滤</td></tr>
          <tr><td><strong>命中后选 pod</strong></td><td>路由到树中「最长前缀租户」（该 worker URL）</td><td><code>getTargetPodFromMatchedPods</code> 从命中 pod 集合按请求计数选目标</td></tr>
          <tr><td><strong>负载保护</strong></td><td>绝对+相对双阈值检测不均衡 → 切最短队列</td><td>自动混合 load-balance 权重（AIBRIX_ROUTING_AUTO_BLEND_PREFIX_CACHE_WEIGHT=5）</td></tr>
        </tbody>
      </table>

      <h3>10.2 两者能合体：K8s 控制面 + Rust 数据面</h3>
      <MermaidDiagram chart={`
flowchart TB
    subgraph K8s["Kubernetes 集群"]
        subgraph Ctrl["AIBrix 控制平面"]
            PA["PodAutoscaler<br/>LLM 感知弹性伸缩"]
            MR["ModelRouter<br/>自动 HTTPRoute"]
            SS["StormService<br/>P/D 编排"]
        end
        subgraph GW["AIBrix Gateway (Envoy + ExtProc)"]
            AUTH["鉴权 / 限流"]
            RT["多策略路由评分"]
        end
        subgraph MG["SGLang Model Gateway Pod"]
            SMG["smg --worker-urls ...<br/>Rust 数据面"]
            subgraph Workers["SGLang Worker Pods"]
                W1["prefill workers"]
                W2["decode workers"]
            end
            SMG --> W1
            SMG --> W2
        end
    end
    Client["Client"] --> GW --> SMG
    PA --> MG
    PA --> Workers
    Ctrl -->|"伸缩决策"| MG
      `} />
      <p>这是一种可行的部署形态：<strong>AIBrix 负责集群级资源编排与伸缩</strong>（Envoy 网关做入口与鉴权），
      <strong>SGLang Model Gateway 作为 Pod 内的数据面</strong>，把流量在 SGLang worker 间做细粒度负载均衡与 P/D 路由。
      两者分别解决了「集群怎么调度资源」和「请求怎么选 worker」两个不同尺度的问题。</p>

      <h3>10.3 统一调度视角：调度器分层</h3>
      <table>
        <thead><tr><th>层级</th><th>决策频率</th><th>代表实现</th><th>决策内容</th></tr></thead>
        <tbody>
          <tr><td><strong>集群调度器</strong></td><td>秒级 ~ 分钟级</td><td>K8s Scheduler、AIBrix PodAutoscaler</td><td>部署多少个副本、放哪个节点、用什么 GPU</td></tr>
          <tr><td><strong>请求调度器</strong></td><td>每请求</td><td>SGLang Model Gateway、AIBrix Gateway</td><td>这个请求发给哪个 worker 能最大化缓存命中 / 最低延迟</td></tr>
          <tr><td><strong>引擎内调度器</strong></td><td>每 step</td><td>vLLM Scheduler、SGLang Scheduler</td><td>同一 worker 内 batch 怎么组、KV block 怎么分配、preempt 谁</td></tr>
        </tbody>
      </table>
      <p><code>服务调度</code>页讲的是第三层（引擎内 batch 调度）；本文与前一篇 <code>AIBrix</code> 页共同补全了第二层
      （请求级网关调度）。调度器生态的三层缺一不可。</p>

      <Callout type="warning">
        <strong>选型提醒：</strong>
        <ul>
          <li>想要<strong>零依赖单进程</strong>的请求级路由、gRPC 直连 SGLang worker、进程内 tokenize → 选 <strong>SGLang Model Gateway</strong></li>
          <li>想要<strong>K8s 原生</strong>的资源编排、弹性伸缩、LoRA/KV Cache 生命周期管理 → 选 <strong>AIBrix</strong></li>
          <li>两者不冲突：AIBrix 管「有多少 Pod」，Gateway 管「请求进哪个 Pod」</li>
        </ul>
      </Callout>

      <ResourceTable resources={[
        { name: 'sgl-model-gateway 源码', url: 'https://github.com/sgl-project/sglang/tree/main/sgl-model-gateway', desc: 'SGLang Model Gateway Rust 源码（63K 行，src/ 下 8 大模块）' },
        { name: 'SGLang Model Gateway 文档', url: 'https://docs.sglang.io/advanced_features/sgl_model_gateway.html', desc: '官方用户指南，安装/快速开始/完整参数' },
        { name: 'AIBrix 源码', url: 'https://github.com/vllm-project/aibrix', desc: 'vLLM 团队云原生 LLM 推理基础设施（Go Operator + Envoy）' },
        { name: 'AIBrix 白皮书', url: 'https://arxiv.org/abs/2504.03648', desc: 'AIBrix 架构设计与实现论文' },
        { name: 'SGLang 调度器源码', url: 'https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/managers/scheduler.py', desc: '引擎内 Radix 感知调度器（服务调度页第三层）' },
        { name: 'Splitwise (OSDI 2024)', url: 'https://arxiv.org/abs/2311.18677', desc: 'P/D 分离调度论文，PD 路由的理论基础' },
      ]} />
    </div>
  );
}
