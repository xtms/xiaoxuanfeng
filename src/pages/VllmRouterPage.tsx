import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, CodeBlock, ResourceTable } from '../components/CodeBlock';

const GH = 'https://github.com/vllm-project/router/blob/main';

function SrcLink({ path }: { path: string }) {
  return (
    <a href={`${GH}/${path}`} target="_blank" rel="noopener noreferrer">
      <code>{path}</code>
    </a>
  );
}

export function VllmRouterPage() {
  return (
    <div className="prose max-w-none">
      <h1>vLLM Router — vllm-project/router 调度网关</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-09</span>
        <span className="page-meta-item">⏱️ 阅读约 40 分钟</span>
        <span className="page-meta-item">🏷️ 专题 · 调度器</span>
      </div>
      <p>
        深入分析 <code>vllm-project/router</code>（Rust 纯代码调度网关，~36K 行），它是 SGLang Model Gateway 的官方 fork，为 vLLM 后端做了深度适配：两阶段 Prefill/Decode 路由、NIXL / Mooncake / MoRI-IO 三种 KV Connector、ZMQ 服务发现、OpenTelemetry 可观测性。本节按 <strong>Pi-0.5 粒度</strong>逐步分析——每个关键点附真实源码 + 逐行解释 + 可点击跳转 GitHub 的文件路径。
      </p>

      <Callout type="tip">
        <strong>与母体的合并视角：</strong>本文把 <strong>vLLM Router</strong> 与它的母体 <strong>SGLang Model Gateway</strong> 放在同一个「调度器」主题下对比分析。
        vLLM Router 是 SGLang Model Gateway 的 <strong>官方 fork</strong>——保留了母体「进程内 Rust 数据面」的骨架（策略注册表 / Radix 树 / 熔断重试 / K8s 发现），
        删除了与 SGLang 绑定的部分（gRPC 管线 / Harmony / MCP），并为 vLLM 生态新增了两阶段 P/D 路由、ZMQ 服务发现、rendezvous_hash、tokenizer 多后端抽象等。理解它的正确姿势是「对照母体读差异」。
      </Callout>

      <Callout type="info">
        源码位置：<code>/data/sd/router</code>（本地克隆），GitHub 上游：<a href="https://github.com/vllm-project/router" target="_blank" rel="noopener noreferrer">vllm-project/router</a>。页面内所有 <code>SrcLink</code> 均指向 <code>{'{'}GH{'}'}/&lt;path&gt;</code>（GH = <code>https://github.com/vllm-project/router/blob/main</code>）。
      </Callout>

      {/* ===================== 1 定位与生态 ===================== */}
      <div className="section-divider"><span>定位与生态：SGLang Model Gateway 的 vLLM 特化 fork</span></div>

      <p>
        在「调度器」专题里，我们已经分析了 <strong>AIBrix</strong>（K8s 控制面 + Envoy 数据面）和 <strong>SGLang Model Gateway</strong>（纯 Rust 调度网关）。
        <strong>vLLM Router</strong>（即 <code>vllm-project/router</code>）是 SGLang Model Gateway 的官方 fork：README 第一句就写着{' '}
        <code>{"\"This project is a fork of SGLang Model Gateway\""}</code>。
        它的目标是：把 SGLang 团队积累的「纯 Rust 高性能网关」经验搬到 vLLM 生态，为 vLLM 的 <strong>disaggregated prefill/decode</strong>{' '}
        （vLLM 0.10+ 原生两阶段部署）提供专用路由层。
      </p>

      <h3>1.1 三条技术路线</h3>
      <p>
        三条技术路线各自主导一个部署形态：
      </p>
      <ul>
        <li><strong>vLLM 原生</strong>：自带 API Server 负载均衡能力有限，P/D 分离靠 <code>vllm disaggregation</code> 模块 + NCCL/Mooncake KV 传输，路由层由调用方自建。</li>
        <li><strong>SGLang Model Gateway</strong>：通用网关，面向 SGLang 后端（gRPC pipeline、Harmony 前缀树、Radix 缓存），vLLM 只能走 OpenAI 兼容路径。</li>
        <li><strong>vLLM Router</strong>：专为 vLLM 后端设计，深度支持 vLLM 原生两阶段协议（<code>/generate</code>、<code>/inference/v1/generate</code>）、KV 传输注入、vLLM 风格的 load 上报。</li>
      </ul>

      <MermaidDiagram
        chart={`flowchart LR
    subgraph 上游生态
        S[<b>SGLang Model Gateway</b><br/>sgl-project / sglang<br/>通用 Rust 网关<br/>gRPC + Radix + Harmony]
    end
    subgraph 技术路线
        V[<b>vLLM 原生</b><br/>vllm-project / vllm<br/>Python + 自带 API Server<br/>disagg 模块 + NCCL/Mooncake]
        R[<b>vLLM Router</b><br/>vllm-project / router<br/>Rust 36K 行<br/>fork of SGLang MG]
    end
    S -->|"fork + vLLM 适配"| R
    V -.->|"OpenAI 兼容 (降级)"| R
    V -.->|"原生态路 (无专用网关)"| S
    R -->|"P/D 两阶段路由"| PD[Prefill 池 + Decode 池]
    R -->|"KV 传输注入"| KV[NIXL / Mooncake / MoRI-IO]
`}
      />

      <h3>1.2 fork 改动三类</h3>
      <p>
        对照本地 clone（<code>git log</code>），本 fork 在保留母体「控制面 + 数据面」骨架的基础上做了三类改动：<strong>保留</strong>策略注册表 / Radix 树 / K8s 服务发现 / 熔断重试；<strong>删除</strong>与 SGLang 绑定的 gRPC 管线、Harmony、MCP 集成；<strong>新增</strong> vLLM 两阶段路由器、ZMQ 服务发现、rendezvous_hash、OpenAI 后端代理、响应数据连接器、tokenizer 多后端抽象。详细对照见第 3 节。
      </p>

      {/* ===================== 2 双入口架构 ===================== */}
      <div className="section-divider"><span>整体架构：一个 Rust 内核 + 双入口（bin / PyO3）</span></div>

      <p>
        仓库只有一个 Rust crate，但暴露两条入口：
      </p>
      <ul>
        <li><strong>Rust 二进制</strong>：三个 <code>[[bin]]</code> 别名（<code>router</code> / <code>sglang-gateway</code> / <code>sglang_router</code>）指向同一个 <SrcLink path="src/main.rs" />——继承自母体，让老 SGLang Gateway 用户无感迁移。</li>
        <li><strong>Python 绑定</strong>：<SrcLink path="src/lib.rs" /> 用 <strong>PyO3 0.26</strong> 把核心配置逻辑暴露为 <code>vllm_router_rs</code> Python 模块，供 <SrcLink path="py_src/vllm_router/router.py" /> 调用——纯 Python 的用户可以用熟悉的 dict 配置驱动 Rust 内核。</li>
      </ul>

      <CodeBlock language="rust" title="双入口声明 (Cargo.toml)" code={`# 三个 bin 别名指向同一 main.rs，兼容 SGLang 网关的启动名
[[bin]]
name = "router"
path = "src/main.rs"

[[bin]]
name = "sglang-gateway"
path = "src/main.rs"

[[bin]]
name = "sglang_router"
path = "src/main.rs"

[dependencies]
pyo3 = { version = "0.26", features = ["extension-module"] }   # Python 绑定
axum = "0.8"           # HTTP 框架
reqwest = "0.13"       # HTTP client
tokio = "1.42"         # 异步运行时
zmq = "0.10"           # ZMQ 服务发现
rmp-serde = "1"        # msgpack 编解码（ZMQ 载荷）
tokenizers = "0.22.2"  # HuggingFace tokenizer
tiktoken-rs = "0.7.0"  # OpenAI tiktoken
minijinja = "2.0"      # chat template 渲染
kube = "1.1"           # K8s 客户端
opentelemetry = "0.27" # 可观测性
deadpool = "0.12"      # 连接池
backoff = "0.4"        # 退避重试
hf-hub = "0.4.3"       # 模型下载`}
      />

      <CodeBlock language="python" title="Python 入口 (py_src/vllm_router/router.py)" code={`from vllm_router_rs import Router as RustRouter   # PyO3 导入 Rust 内核

class Router:
    """Python 包装：Rust 内核 + Python 便捷 API"""
    def __init__(self, config: dict):
        # 把 dict 转成 Rust RouterConfig（见 lib.rs 的 to_router_config）
        self._router = RustRouter.from_dict(config)

    def route(self, request: dict, route: str, model_id: str | None = None):
        return self._router.route(request, route, model_id)

    # 同步暴露 add_worker / remove_worker / flush_cache ...
`}
      />

      <CodeBlock language="rust" title="PyO3 绑定 (src/lib.rs)" code={`#[pyclass]
pub struct Router { inner: RouterCore }

#[pymethods]
impl Router {
    #[staticmethod]
    fn from_dict(config: Py<PyAny>) -> PyResult<Self> {
        // 将 Python dict 反序列化为 RouterConfig
        let cfg = py.extract::<RouterConfig>()?;
        Ok(Self { inner: RouterCore::new(cfg)? })
    }

    fn route(&self, req: Py<PyAny>, route: &str, model_id: Option<String>) -> PyResult<PyObject> { ... }
    fn add_worker(&self, url: &str) -> PyResult<String> { ... }
    fn flush_cache(&self) { ... }
}`}
      />

      <h3>2.1 配置层：RoutingMode 三态</h3>

      <p>
        <SrcLink path="src/main.rs" /> 的 <code>CliArgs</code> 把 CLI 参数组装成 <code>RouterConfig</code>，核心是 <code>RoutingMode</code> 枚举。母体只有 <code>Regular</code> / <code>OpenAI</code> 两种；本 fork <strong>新增了第三种</strong> <code>VllmPrefillDecode</code>，专门承载 vLLM P/D 分离：
      </p>

      <CodeBlock language="rust" title="RoutingMode 定义 (src/config/types.rs:148-163)" code={`pub enum RoutingMode {
    #[serde(rename = "regular")]
    Regular,
    #[serde(rename = "openai")]
    OpenAI,
    // ====== fork 新增：vLLM disaggregated prefill/decode ======
    #[serde(rename = "vllm_prefill_decode")]
    VllmPrefillDecode {
        prefill_urls: Vec<(String, Option<u16>)>,   // prefill worker 列表（可带 bootstrap port）
        decode_urls: Vec<String>,                   // decode worker 列表
        prefill_policy: Option<PolicyConfig>,       // prefill 池独立负载均衡策略
        decode_policy: Option<PolicyConfig>,        // decode 池独立策略
        #[serde(skip_serializing_if = "Option::is_none")]
        discovery_address: Option<String>,          // fork 新增：ZMQ 服务发现地址
    },
}`}
      />

      <p>
        从 <code>RoutingMode</code> 到具体路由器实例的桥接在 <SrcLink path="src/routers/factory.rs" />：<code>Regular → Router</code>、<code>OpenAI → OpenAIRouter</code>、<code>VllmPrefillDecode → VllmPDRouter</code>。其中 <code>VllmPDRouter</code> 是本 fork 的核心新增（第 5 节详解）。
      </p>

      <CodeBlock language="rust" title="路由工厂 (src/routers/factory.rs)" code={`pub async fn create_router(ctx: &AppContext) -> RouterFactoryResult {
    match &ctx.router_config.routing_mode {
        RoutingMode::Regular => {
            Ok(RouterFactory::create_regular_router(&[], ctx).await?)
        }
        RoutingMode::OpenAI => {
            Ok(RouterFactory::create_openai_router(ctx).await?)
        }
        RoutingMode::VllmPrefillDecode { prefill_urls, decode_urls, .. } => {
            Ok(RouterFactory::create_vllm_pd_router(prefill_urls, decode_urls, ctx).await?)
        }
    }
}`}
      />

      <h3>2.2 目录全景</h3>

      <CodeBlock language="text" title="仓库结构（fork 后）" code={`src/
├── lib.rs                      # PyO3 绑定 + to_router_config（Python 入口）
├── main.rs                     # CliArgs + 三种 bin 别名（Rust 入口）
├── server.rs                   # axum 路由表 + 中间件栈 + startup
├── service_discovery.rs        # K8s Pod watcher（fork 扩展 PD 分支）
├── middleware.rs               # RequestId / 并发限流 / 队列
├── metrics.rs                  # Prometheus 指标（50+）
├── otel_trace.rs / otel_http.rs # OpenTelemetry（fork 新增）
├── config/
│   ├── types.rs                # RouterConfig / RoutingMode / DiscoveryConfig
│   ├── cli.rs                  # CLI 参数解析
│   └── validation.rs
├── core/
│   ├── worker.rs               # Worker trait + BasicWorker + DPAwareWorker
│   ├── worker_registry.rs      # DashMap 多索引注册表
│   ├── circuit_breaker.rs      # 熔断器三态状态机
│   └── retry.rs                # 指数退避 + jitter
├── routers/
│   ├── factory.rs              # 路由器工厂
│   ├── router_manager.rs       # IGW 多路由器协调（fork 新增）
│   └── http/
│       ├── router.rs           # Regular 路由分发骨架
│       ├── vllm_pd_router.rs   # ★ 两阶段 P/D 路由（fork 新增，~1600 行）
│       ├── vllm_service_discovery.rs # ★ ZMQ 服务发现（fork 新增）
│       ├── openai_router.rs    # ★ OpenAI/Anthropic 后端代理（fork 新增）
│       ├── logprobs_merge.rs   # ★ prefill/decode logprobs 拼接（fork 新增）
│       └── pd_router.rs        # 通用 PD 路由（继承自母体）
├── policies/
│   ├── registry.rs             # 策略注册表
│   ├── rendezvous_hash.rs      # ★ HRW 哈希（fork 新增）
│   ├── hash_key.rs             # ★ 一致性哈希取 key（fork 新增）
│   ├── consistent_hash.rs      # 一致性哈希（虚节点 160）
│   ├── cache_aware.rs          # Radix 前缀感知
│   └── tree.rs                 # Radix 前缀树（继承，2320 行）
├── tokenizer/                  # ★ 多后端 tokenizer 抽象（fork 重写）
│   ├── traits.rs               # Encoder / Decoder 分离 + Encoding enum
│   ├── stop.rs                 # StopSequenceDecoder + jail_buffer
│   ├── sequence.rs             # 增量解码 Sequence
│   ├── factory.rs              # 自动探测（json→HF，否则 tiktoken）
│   └── chat_template.rs        # minijinja 模板
├── data_connector/             # ★ 响应存储（fork 新增）
│   ├── responses.rs            # ResponseStorage trait + ResponseChain
│   └── response_memory_store.rs # 内存存储
└── protocols/
    └── spec.rs                 # 协议结构体（OpenAI + vLLM 扩展）
py_src/vllm_router/
├── router.py                   # Python 包装
├── mini_lb.py                  # 395 行纯 Python 迷你负载均衡器（测试用）
└── router_args.py              # Python 参数解析`}
      />

      {/* ===================== 3 fork 差异 ===================== */}
      <div className="section-divider"><span>fork 差异总览：保留 / 删除 / 新增</span></div>

      <h3>3.1 保留 / 删除 / 新增一览</h3>
      <p>
        与母体 <code>sgl-project/sglang/sgl-model-gateway</code> 对比目录与符号，本 fork 的三类改动如下：
      </p>

      <table>
        <thead>
          <tr>
            <th style={{ width: '16%' }}>类别</th>
            <th>模块</th>
            <th style={{ width: '44%' }}>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td rowSpan={5} style={{ verticalAlign: 'top', fontWeight: 600, color: '#15803d' }}>保留（继承）</td>
            <td>控制面骨架</td>
            <td>WorkerRegistry / PolicyRegistry / HealthChecker / CLI 三 bin 别名</td>
          </tr>
          <tr>
            <td>数据面骨架</td>
            <td><code>route_typed_request</code> 泛型分发骨架、SSE 流式转发</td>
          </tr>
          <tr>
            <td>负载均衡策略</td>
            <td>round_robin / random / cache_aware / power_of_two / consistent_hash + Radix 树</td>
          </tr>
          <tr>
            <td>K8s 服务发现</td>
            <td><code>service_discovery.rs</code> 的 kube watcher + <code>PodInfo::should_include</code></td>
          </tr>
          <tr>
            <td>可靠性</td>
            <td>CircuitBreaker 三态、指数退避重试、双阈值健康检查</td>
          </tr>
          <tr>
            <td rowSpan={4} style={{ verticalAlign: 'top', fontWeight: 600, color: '#b91c1c' }}>删除</td>
            <td>gRPC 管线</td>
            <td>母体面向 SGLang 的 gRPC worker 管线、七阶段 pipeline 编排</td>
          </tr>
          <tr>
            <td>Harmony 前缀树</td>
            <td>母体 HarmonyDetector / 前缀优化（SGLang 专用）</td>
          </tr>
          <tr>
            <td>OpenAI Responses / MCP</td>
            <td>母体的 Responses API 全能力 + MCP（Model Context Protocol）服务器集成</td>
          </tr>
          <tr>
            <td>job_queue / worker_manager 队列</td>
            <td>母体的 JobQueue 调度队列重构为 middleware 并发限流 + IGW 队列</td>
          </tr>
          <tr>
            <td rowSpan={7} style={{ verticalAlign: 'top', fontWeight: 600, color: '#1d4ed8' }}>新增</td>
            <td><code>vllm_pd_router.rs</code></td>
            <td>vLLM 两阶段（prefill→decode）请求路由 + KV 传输参数注入</td>
          </tr>
          <tr>
            <td><code>vllm_service_discovery.rs</code></td>
            <td>ZMQ ROUTER socket 服务发现（vLLM worker 主动注册 HTTP/ZMQ 地址）</td>
          </tr>
          <tr>
            <td><code>rendezvous_hash.rs</code> + <code>hash_key.rs</code></td>
            <td>HRW（最高随机权重）负载均衡 + 一致性哈希取 key 的优先级链</td>
          </tr>
          <tr>
            <td><code>openai_router.rs</code></td>
            <td>把 OpenAI/Anthropic 当后端代理（剥离 vLLM-only 字段后转发）</td>
          </tr>
          <tr>
            <td><code>tokenizer/</code></td>
            <td>多后端 tokenizer 抽象（HF / sentencepiece / tiktoken）+ 自研 stop-sequence 解码</td>
          </tr>
          <tr>
            <td><code>data_connector/</code></td>
            <td>响应存储（ULID 主键 + ResponseChain 对话记忆）</td>
          </tr>
          <tr>
            <td><code>otel_trace.rs</code> + IGW</td>
            <td>OpenTelemetry tracing + <code>enable_igw</code> 多路由器协调模式</td>
          </tr>
        </tbody>
      </table>

      <Callout type="tip">
        分析本 fork 的正确姿势是「对照母体读差异」：凡是标 ★ 的文件都是 SGLang Model Gateway 里没有的，属于 vLLM 适配的核心资产。下面各节按「新增重点」优先展开。
      </Callout>

      {/* ===================== 4 负载均衡 ===================== */}
      <div className="section-divider"><span>负载均衡：六策略 + 一个 fork 新增</span></div>

      <p>
        母体已有 5 种策略，本 fork 新增了第 6 种 <code>rendezvous_hash</code>（最高随机权重 HRW），并配套实现了 <SrcLink path="src/policies/hash_key.rs" />（一致性/rendezvous 策略取 key 的统一入口）。策略选择由 <code>PolicyRegistry</code> 集中管理。
      </p>

      <table>
        <thead>
          <tr>
            <th>策略</th>
            <th>源码文件</th>
            <th>核心思路</th>
            <th>是否 fork 新增</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>round_robin</code></td><td>round_robin.rs</td><td>轮询分配，简单公平</td><td>—</td></tr>
          <tr><td><code>random</code></td><td>random.rs</td><td>随机选择，无状态</td><td>—</td></tr>
          <tr><td><code>cache_aware</code></td><td>cache_aware.rs + tree.rs</td><td>Radix 前缀树统计 match_rate，路由到缓存命中率高的 worker</td><td>—</td></tr>
          <tr><td><code>power_of_two</code></td><td>power_of_two.rs</td><td>随机取两个 worker 选负载更低者</td><td>—</td></tr>
          <tr><td><code>consistent_hash</code></td><td>consistent_hash.rs</td><td>一致性哈希环（每 worker 160 个虚节点）</td><td>—</td></tr>
          <tr><td><code>rendezvous_hash</code></td><td>rendezvous_hash.rs</td><td>HRW：对每个健康 worker 算哈希取最大</td><td style={{ color: '#1d4ed8', fontWeight: 600 }}>★ 新增</td></tr>
        </tbody>
      </table>

      <h3>4.1 策略注册表：首个 worker 定策略</h3>

      <p>
        <code>PolicyRegistry</code> 的关键设计：<strong>该 model 的第一个 worker 决定其策略</strong>，后续同一 model 的 worker 必须复用同一个策略实例（保持哈希环 / Radix 树状态一致）。P/D 分离模式下 prefill 与 decode 各有独立的策略槽位：
      </p>

      <CodeBlock language="rust" title="PolicyRegistry (src/policies/registry.rs:17-33, 51-96)" code={`pub struct PolicyRegistry {
    policies: Arc<DashMap<String, Arc<dyn LoadBalancingPolicy>>>,  // model_id -> 策略
    prefill_policies: Arc<DashMap<String, Arc<dyn LoadBalancingPolicy>>>,
    decode_policies: Arc<DashMap<String, Arc<dyn LoadBalancingPolicy>>>,
    default_policy: Arc<dyn LoadBalancingPolicy>,
    policy_factory: PolicyFactory,
}

pub async fn on_worker_added(&self, worker: &Arc<dyn Worker>) {
    for model in worker.metadata().model_ids() {
        // 该 model 还没有策略 -> 用 worker 请求的策略类型创建
        if !self.policies.contains_key(model) {
            let policy = self.create_policy_for_model(worker, model);
            self.policies.insert(model.to_string(), policy);
        }
        // 已经存在 -> 只是把 worker 挂到该策略下
        // （保证同一 model 的所有 worker 共享同一份哈希环 / Radix 树）
    }
}`}
      />

      <h3>4.2 rendezvous_hash：无状态 HRW</h3>

      <p>
        HRW（Highest Random Weight）是对一致性哈希的简化替代：不维护环，每次对每个健康 worker 计算 <code>hash(key, worker_url)</code> 取最大者。它天生无状态（worker 增删不影响结果稳定性），且天然均匀。本 fork 用 <code>fbi_hash</code>（FurcHash 23-bit 桶 + MurmurHash64A 双重混合）作为哈希函数：
      </p>

      <CodeBlock language="rust" title="rendezvous_hash 选择主路径 (src/policies/rendezvous_hash.rs:42-78)" code={`async fn select_worker_with_headers(
    &self, _ctx: &SelectionContext, headers: Option<&HeaderMap>, model: Option<&str>,
) -> Option<Arc<dyn Worker>> {
    let key = extract_hash_key(headers, model, &self.body_hash_fn);  // hash_key.rs
    let workers = self.worker_registry.get_by_model(model.unwrap_or(""))?;

    // 过滤健康 + 熔断器未开的 worker
    let candidates: Vec<_> = workers.iter()
        .filter(|w| w.is_available())
        .collect();
    if candidates.is_empty() { return None; }

    // HRW：对每个候选算 fbi_hash(key, worker_url)，取最大值
    let mut best: Option<(&Arc<dyn Worker>, u64)> = None;
    for worker in &candidates {
        let hash = fbi_hash(key.as_bytes(), worker.url().as_bytes());
        if best.as_ref().map(|(_, h)| hash > *h).unwrap_or(true) {
            best = Some((worker, hash));
        }
    }
    best.map(|(w, _)| w.clone())
}`}
      />

      <CodeBlock language="rust" title="fbi_hash = FurcHash 23-bit + MurmurHash64A (src/policies/consistent_hash.rs:151-200)" code={`/// FurcHash：23-bit bucket + MurmurHash64A 的组合哈希
fn fbi_hash(input: &[u8], second_input: &[u8]) -> u64 {
    // 第一步：对 key 做 MurmurHash64A，得到 64 位种子
    let h1 = murmurhash64a(input, 0);

    // 第二步：混合 worker_url（second_input），得到最终 64 位哈希
    let h2 = murmurhash64a(second_input, h1 as u32);

    // FurcHash 特性：截取 23 bit（对应 2^23 = 8388608 个虚拟桶）
    h2 & 0x7FFFFF
}`}
      />

      <h3>4.3 consistent_hash：160 虚节点 + BTreeMap 环</h3>

      <p>
        与 rendezvous 互补的是保留自母体的一致性哈希：每个 worker 在环上布 160 个虚节点（<code>worker_url#i</code>），查找时用 <code>range(hash..)</code> 取第一个后继，环尾回绕到环头：
      </p>

      <CodeBlock language="rust" title="一致性哈希环查找 (src/policies/consistent_hash.rs:290-314)" code={`const VIRTUAL_NODES_PER_WORKER: usize = 160;

fn find_worker_by_hash(&self, hash_value: u64) -> Option<String> {
    let ring = self.hash_ring.read().unwrap();   // BTreeMap<u64, String>
    // 从 hash_value 开始的第一个后继（>= hash_value）
    if let Some((_, worker_url)) = ring.range(hash_value..).next() {
        return Some(worker_url.clone());
    }
    // 回绕：取环上第一个节点（最小的 key）
    ring.iter().next().map(|(_, worker_url)| worker_url.clone())
}`}
      />

      <h3>4.4 hash_key：取 key 的优先级链</h3>

      <p>
        一致性/rendezvous 都需要一个稳定 key。本 fork 的 <SrcLink path="src/policies/hash_key.rs" /> 定义了一条优先级链：<strong>请求头 → 会话字段 → 文本字段 → 请求体哈希</strong>。特别值得注意的是它<strong>没有用 serde_json 解析请求体</strong>，而是手写 JSON substring 匹配（性能优先），并给每类 key 加前缀防止跨类型碰撞：
      </p>

      <CodeBlock language="rust" title="哈希 key 提取 (src/policies/hash_key.rs:11-52, 73-105)" code={`const SESSION_HEADER_NAMES: [&str; 6] = [
    "x-session-id", "x-user-id", "x-tenant-id",
    "x-correlation-id", "x-request-id", "x-trace-id",
];

pub fn extract_hash_key(
    headers: Option<&HeaderMap>, model: Option<&str>, body_hash_fn: &dyn Fn() -> u64,
) -> String {
    // 1) 请求头优先
    if let Some(headers) = headers {
        for name in SESSION_HEADER_NAMES {
            if let Some(v) = headers.get(name).and_then(|v| v.to_str().ok()) {
                return format!("header:{}:{}", name, v);
            }
        }
    }
    // 2) body 内字段（手写 JSON 子串匹配，避免 serde_json 反序列化开销）
    match extract_hash_key_from_body() {
        Some(k) => k,
        None => format!("request_hash:{}", body_hash_fn()),
    }
}

fn extract_hash_key_from_body() -> Option<String> {
    let body = BODY.with(|b| b.borrow().clone());   // 线程局部缓存请求体
    // 优先级：session_params.session_id > user > session_id > user_id
    for (prefix, field) in [
        ("session", "\"session_id\""),
        ("user",    "\"user\""),
        ("session", "\"session_id\""),
        ("user",    "\"user_id\""),
    ] {
        if let Some(v) = find_json_field(&body, field) {   // 手工 substring 查找
            return Some(format!("{}:{}", prefix, v));
        }
    }
    None
}`}
      />

      <h3>4.5 cache_aware：Radix 前缀树 + 双重阈值</h3>

      <p>
        <code>cache_aware</code> 是默认策略之一，它维护一棵 per-model Radix 前缀树（<SrcLink path="src/policies/tree.rs" />，2320 行），跟踪每个请求前缀在哪个 worker 命中过 KV cache。选择 worker 时：
      </p>
      <ul>
        <li>计算各 worker 的 <code>match_rate</code>（前缀命中率）；</li>
        <li>若某 worker <code>match_rate &gt; cache_threshold</code>（CLI 默认 0.3，policy 默认 0.5）则路由到该「cache-hit worker」；</li>
        <li>否则路由到负载最小的 worker。</li>
      </ul>

      <CodeBlock language="rust" title="cache_aware 双重阈值 (src/policies/cache_aware.rs:519)" code={`// CLI 默认 cache_threshold = 0.3；policy 结构体默认 = 0.5
// 关键逻辑：只有当某个 worker 的 match_rate 显著超过阈值时，
// 才牺牲负载均衡去命中缓存；否则一律走 min-load。
// 另有 imbalance 双阈值：abs > 64 AND rel > 1.5 时触发再平衡
fn select_worker_with_headers(...) -> Option<Arc<dyn Worker>> {
    let (candidate, cache_hit_worker) = self.find_cache_hit_worker(text, model);
    if let Some(w) = cache_hit_worker {
        if w.match_rate() > self.cache_threshold {
            return Some(w);
        }
    }
    self.select_min_load_worker(model)   // 兜底：最小负载
}`}
      />

      {/* ===================== 5 P/D 分离 ===================== */}
      <div className="section-divider"><span>vLLM P/D 分离：两阶段请求路由（fork 核心）</span></div>

      <p>
        这是本 fork 存在的主要理由。vLLM 的 disaggregated prefill/decode（vLLM 0.10+）把请求拆成两个阶段跑在不同 GPU 池上，中间通过 <code>kv_transfer_params</code> 传递 KV cache 地址。SGLang Model Gateway 的母体 <code>pd_router.rs</code> 是按 SGLang 的协议做的；本 fork 为 vLLM 重写了 <SrcLink path="src/routers/http/vllm_pd_router.rs" />（~1600 行），核心是 <code>process_vllm_two_stage_request</code>（1160-1570 行）。
      </p>

      <MermaidDiagram
        chart={`sequenceDiagram
    participant C as Client
    participant R as VllmPDRouter
    participant P as Prefill Worker
    participant D as Decode Worker
    C->>R: POST /v1/chat/completions (stream)
    Note over R: extract_hash_key → 选 prefill worker<br/>(prefill_policy)
    R->>P: POST {prefill}/generate<br/>max_tokens=1, stream=false<br/>注入 kv_transfer_params
    P-->>R: JSON 响应<br/>包含 return_value (KV 句柄) + logprobs
    Note over R: 提取返回参数<br/>构造成新请求体 + kv_transfer_params
    R->>D: POST {decode}/generate<br/>回传 stream=true<br/>注入 kv_transfer_params
    D-->>R: SSE 流 (含完整 logprobs)
    R->>C: 回传 SSE 流<br/>(merge logprobs if 请求要求)
`}
      />

      <h3>5.1 两阶段请求处理</h3>

      <CodeBlock language="rust" title="process_vllm_two_stage_request (src/routers/http/vllm_pd_router.rs:1160-1250 摘要)" code={`async fn process_vllm_two_stage_request(
    &self,
    headers: Option<&HeaderMap>,
    body: &GenerateRequest,
) -> Response {
    // 1) 按 prefill_policy 从 prefill 池选 worker
    let (prefill_worker, url) = self.select_prefill_worker(headers, body).await
        .unwrap_or_else(|| (default_prefill(), default_prefill_url()));

    // 2) 构造 prefill 请求：强制 max_tokens=1、强制非流式
    let mut prefill_req = body.clone();
    prefill_req.parameters.as_mut().map(|p| {
        p.max_new_tokens = Some(1);
        p.stop_token_ids = vec![];   // 不允许 stop
    });
    prefill_req.stream = false;

    // 3) 注入 KV 传输参数
    let transfer_id = self.generate_transfer_id(kv_connector, &body.prompt);
    let kv_params = build_prefill_kv_transfer_params(&kv_connector, transfer_id, prefill_worker);
    let prefill_json = add_kv_transfer_params(&prefill_req_json, kv_params);

    // 4) 发送 prefill，拿到返回参数
    let prefill_response = self.send_request(prefill_worker, "/generate", prefill_json, headers).await;
    let (extracted, prefill_return) = extract_return_params(&prefill_response).await;

    // 5) 构造 decode 请求：回传 stream + KV 参数
    let mut decode_req = prefill_req;
    decode_req.stream = true;
    let decode_kv_params = build_decode_kv_transfer_params(&kv_connector, transfer_id, &prefill_return);
    let decode_json = add_kv_transfer_params(&decode_req_json, decode_kv_params);

    // 6) 选 decode worker → 发送 → 回传 SSE 流
    let (decode_worker, _) = self.select_decode_worker(headers, body).await ...;
    let resp = self.send_request(decode_worker, "/generate", decode_json, headers).await;
    stream_response(resp).await
}`}
      />

      <h3>5.2 三种 KV Connector：NIXL / Mooncake / MoRI-IO</h3>

      <p>
        KV 传输的承载方式由 <code>KvConnector</code> 枚举决定。fork 从 vLLM 生态引入了三种，其中 <strong>MoRI-IO 的 WRITE 模式用了 <code>tokio::join!</code> 并发 dispatch</strong>（push 型，prefill 同时推给所有 decode）：
      </p>

      <CodeBlock language="rust" title="KvConnector 定义与传输 id (src/routers/http/vllm_pd_router.rs:192-206, 30-35)" code={`pub enum KvConnector {
    Nixl,           // pull 型（默认）：decode 侧去拉
    Mooncake,       // push 型：需要先 bootstrap query 拿 engine_id（按 dp_rank）
    MoriIO,         // push 型：WRITE=并发 dispatch，READ=顺序
}

// transfer_id 按 connector 区分：
//   NIXL    -> None（不注入）
//   Mooncake-> "xfer-{uuid}"
//   MoriIO  -> "tx-{uuid去掉连字符}"
fn generate_transfer_id(connector: &KvConnector, prompt: &str) -> Option<String> {
    let uuid = uuid::Uuid::new_v4().to_string();
    match connector {
        KvConnector::Nixl => None,
        KvConnector::Mooncake => Some(format!("xfer-{}", uuid)),
        KvConnector::MoriIO => Some(format!("tx-{}", uuid.replace('-', ""))),
    }
}`}
      />

      <table>
        <thead>
          <tr>
            <th>Connector</th>
            <th>方向</th>
            <th>传输 id 前缀</th>
            <th>关键流程</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>Nixl</code></td>
            <td>pull（decode 拉）</td>
            <td><code>None</code></td>
            <td>默认。decode 侧根据 prefill 返回的地址自行拉取 KV</td>
          </tr>
          <tr>
            <td><code>Mooncake</code></td>
            <td>push（prefill 推）</td>
            <td><code>xfer-&lt;uuid&gt;</code></td>
            <td>需 bootstrap query（<code>vllm.ai/bootstrap-port</code> 注解端口）获得 <code>engine_id per dp_rank</code>，再按 dp_rank 绑定</td>
          </tr>
          <tr>
            <td><code>MoriIO</code></td>
            <td>push</td>
            <td><code>tx-&lt;uuid-nodashes&gt;</code></td>
            <td>WRITE 模式用 <code>tokio::join!</code> 并发 dispatch 给所有 decode；READ 模式顺序逐个读</td>
          </tr>
        </tbody>
      </table>

      <Callout type="tip">
        为什么要强制 prefill <code>max_tokens=1</code>？因为 prefill 阶段只需要「把输入算一遍并落盘 KV cache」，真正的输出 token 全在 decode 阶段生成。传 1 个占位 token 是为了让 vLLM 引擎把 input 的 KV 写进传输层，同时把 logprobs 结构带回来。两阶段靠 <code>kv_transfer_params</code>（内含 prefill worker 的 ZMQ/NCCL 地址）串起来。
      </Callout>

      <h3>5.3 vLLM request-id 约定</h3>

      <CodeBlock language="rust" title="两阶段 request-id 格式（vllm 侧识别用）" code={`// 两阶段请求在 decode 段使用特殊格式的 request-id，
// 供 vLLM 引擎把 decode 关联回 prefill 阶段的 KV 缓存：
//   ___prefill_addr_{zmq_prefill}___decode_addr_{zmq_decode}_{uuid}
// 其中 zmq_prefill / zmq_decode 是两端 worker 的 ZMQ 地址（host:port），
// 该地址来自 ZMQ 服务发现（第 6 节），而不是 HTTP 地址。

let request_id = format!(
    "___prefill_addr_{}___decode_addr_{}_{}",
    prefill_zmq_addr, decode_zmq_addr, uuid
);`}
      />

      <h3>5.4 logprobs 合并</h3>

      <p>
        若客户端请求 <code>logprobs</code>，prefill 阶段产生的「第一个占位 token」的 logprobs 会污染结果。fork 新增 <SrcLink path="src/routers/http/logprobs_merge.rs" /> 在回传前把两者拼接：从 prefill 的 <code>prompt_logprobs</code> 中截掉末尾 1 个 token，再与 decode 的 logprobs 衔接，并调整 <code>text_offset</code>：
      </p>

      <CodeBlock language="rust" title="merge_logprobs_in_json (src/routers/http/logprobs_merge.rs:27)" code={`/// 规则（docstring 9-26）：
///  - 只对 response["logprobs"] 为数组的场景生效
///  - prefill 贡献 prompt_logprobs.len() 个，需截掉最后 1 个占位 token
///  - decode 贡献的 logprobs 数组整体追加到末尾
///  - 拼接后重新计算 text_offset = base_offset + index
fn merge_logprobs_in_json(prefill_json: &mut Value, decode_json: &mut Value) {
    if let (Some(prefill_lp), Some(decode_lp)) = (
        prefill_json.pointer("/logprobs").and_then(|v| v.as_array_mut()),
        decode_json.pointer("/logprobs").and_then(|v| v.as_array_mut()),
    ) {
        // 截掉 prefill 的最后一个 token（占位 token）
        prefill_lp.truncate(prefill_lp.len().saturating_sub(1));
        // decode 的 text_offset 整体平移（以 prefill 截断后的长度为基准）
        let base_offset = prefill_lp.last().map(|t| t["text_offset"].as_u64()).flatten().unwrap_or(0);
        for t in decode_lp.iter_mut() {
            if let Some(off) = t["text_offset"].as_u64() {
                t["text_offset"] = (base_offset + off).into();
            }
        }
        prefill_lp.extend(decode_lp.drain(..));
    }
}`}
      />

      <h3>5.5 响应数据连接器（fork 新增）</h3>

      <p>
        为支持 OpenAI Responses API 风格（先拿到 id 再查询内容），fork 新增 <code>data_connector/</code>：<code>ResponseStorage</code> trait 抽象存储，<code>ResponseId</code> 用 <strong>ULID</strong>（时间有序），<code>ResponseChain</code> 维护对话上下文供多轮会话使用：
      </p>

      <CodeBlock language="rust" title="data_connector (src/data_connector/responses.rs)" code={`/// ResponseId 基于 ULID：单调时间有序 + 随机后缀
///   = 时间戳(48bit) + 随机性(80bit)，适合作为 REST 资源主键
pub struct ResponseId(ulid::Ulid);

impl ResponseId {
    pub fn new() -> Self { Self(ulid::Ulid::new()) }
    pub fn as_str(&self) -> &str { ... }
}

/// ResponseChain：把一次多轮对话的多个 Response 串成链，
/// 每轮可携带上一轮的 id / 输出 token，用于 build_context 会话记忆
pub struct ResponseChain {
    head: ResponseId,
    entries: Vec<ChainEntry>,   // 每轮 {input_id, output_id, tokens}
}`}
      />

      {/* ===================== 6 服务发现 ===================== */}
      <div className="section-divider"><span>服务发现：双通道（K8s watcher + ZMQ）</span></div>

      <p>
        母体只有 K8s Pod watcher 一种发现方式；vLLM P/D 分离需要知道每个 worker 的 <strong>ZMQ 地址</strong>（用于 NCCL / Mooncake / MoRI-IO 控制面），因此 fork 新增了第二条通道——<SrcLink path="src/routers/http/vllm_service_discovery.rs" />，让 vLLM worker 通过 ZMQ 主动注册。两条通道可以叠加，<code>main.rs</code> 据此组合出四种部署模式。
      </p>

      <table>
        <thead>
          <tr>
            <th>模式</th>
            <th>worker 来源</th>
            <th>适用场景</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>静态 URL</td><td>CLI 的 <code>--prefill-urls</code> / <code>--decode-urls</code></td><td>裸机 / 固定拓扑</td></tr>
          <tr><td>纯 ZMQ</td><td>仅 <code>discovery_address</code>（vLLM worker 主动注册）</td><td>vLLM P/D 分离 + 已知 ZMQ 通道</td></tr>
          <tr><td>K8s</td><td>仅 <code>--service-discovery</code>（Pod watcher）</td><td>云原生 + 标准部署</td></tr>
          <tr><td>混合</td><td>静态 + ZMQ / K8s 并存</td><td>灰度 / 部分 worker 动态</td></tr>
        </tbody>
      </table>

      <h3>6.1 ZMQ 服务发现：push 模型 + TTL 心跳</h3>

      <p>
        <SrcLink path="src/routers/http/vllm_service_discovery.rs" /> 用 <code>zmq::ROUTER</code> socket 监听（CLI <code>--vllm-discovery-address 0.0.0.0:30001</code>），worker 以 msgpack 格式周期性发送 <code>ServiceRegistration</code>。这是 <strong>push 模型</strong>（worker 主动上报），不是轮询。注册后 5 秒内没再上报即被 TTL 清理：
      </p>

      <CodeBlock language="rust" title="ZMQ 注册载荷与注册表 (src/routers/http/vllm_service_discovery.rs:32-91)" code={`/// worker 上报的消息（msgpack 编码）
#[derive(Serialize, Deserialize)]
pub struct ServiceRegistration {
    #[serde(rename = "type")]
    pub service_type: String,      // "P"（prefill）或 "D"（decode）
    pub http_address: String,      // host:port（不含 http://）
    pub zmq_address: String,       // vLLM 侧 ZMQ 控制面地址
}

/// 两张独立表：prefill / decode，各实例带 TTL
pub struct ServiceRegistry {
    prefill_instances: Arc<Mutex<HashMap<String, ServiceInstance>>>,
    decode_instances: Arc<Mutex<HashMap<String, ServiceInstance>>>,
    pub moriio_transfer_mode: Arc<OnceLock<MoriIOTransferMode>>,
}

pub struct ServiceInstance {
    pub zmq_address: String,
    pub expires_at: u64,   // Unix 秒；注册时 = now + 5（DEFAULT_PING_SECONDS）
    pub tp_size: usize,
    pub dp_size: usize,
}`}
      />

      <CodeBlock language="rust" title="监听主循环 + 过期清理 (src/routers/http/vllm_service_discovery.rs:170-244, 336-382)" code={`loop {
    if shutdown_rx.try_recv().is_ok() { break; }
    match router_socket.recv_multipart(zmq::DONTWAIT) {
        Ok(parts) if parts.len() >= 2 => {
            // parts[0] = 对端地址（ROUTER 首帧），parts[1] = msgpack 载荷
            let data: ServiceRegistration = rmp_serde::from_slice(&parts[1])?;
            match data.service_type.as_str() {
                "P" => { prefill.insert(data.http_address.clone(), instance); }
                "D" => { decode.insert(data.http_address.clone(), instance); }
                _   => warn!("Unknown service type"),
            }
        }
        Err(zmq::Error::EAGAIN) => sleep(50ms),   // 无消息
        ...
    }
    // 每轮末尾清理过期实例（TTL 心跳）
    cleanup_expired_instances(&prefill, &decode).await;
}`}
      />

      <h3>6.2 K8s：PD 双 selector + bootstrap-port 注解</h3>

      <p>
        继承的 K8s watcher 被扩展出 PD 分支：<code>DiscoveryConfig</code> 新增 <code>prefill_selector</code> / <code>decode_selector</code>，<code>PodInfo::from_pod</code> 按 label 命中情况把 Pod 归为 <code>Prefill</code> / <code>Decode</code> / <code>Regular</code>；对 Prefill Pod 额外读取 <code>vllm.ai/bootstrap-port</code> 注解（vLLM Mooncake bootstrap 端口，默认 8998）：
      </p>

      <CodeBlock language="rust" title="DiscoveryConfig + pod 类型推断 (src/config/types.rs:264-298, src/service_discovery.rs:86-104, 141-154)" code={`pub struct DiscoveryConfig {
    pub enabled: bool,
    pub namespace: Option<String>,
    pub port: u16,                      // 默认 8000
    pub check_interval_secs: u64,       // watcher 重连间隔，默认 120
    pub selector: HashMap<String, String>,         // regular 模式
    pub prefill_selector: HashMap<String, String>, // ★ PD：prefill Pod
    pub decode_selector: HashMap<String, String>,  // ★ PD：decode Pod
    pub bootstrap_port_annotation: String,         // ★ "vllm.ai/bootstrap-port"
}

// 只对 Prefill Pod 读 bootstrap 注解（decode 节点没有）
let bootstrap_port = if matches!(pod_type, Some(PodType::Prefill)) {
    pod.metadata.annotations.as_ref()
        .and_then(|ann| ann.get(&config.bootstrap_port_annotation))
        .and_then(|p| p.parse::<u16>().ok())
} else { None };`}
      />

      <p>
        Pod 加入后，K8s watcher 用 <code>as_any().downcast_ref::&lt;VllmPDRouter&gt;()</code> 识别 PD 路由器，按 PodType 调用 <code>add_prefill_server(url, bootstrap_port)</code> 或 <code>add_decode_server(url)</code>。bootstrap_port 最终存进 <code>WorkerType::Prefill {'{'} bootstrap_port {'}'}</code> 枚举变体，供 Mooncake 的 <code>query_mooncake_bootstrap</code>（<SrcLink path="src/routers/http/vllm_pd_router.rs" />:1659-1695）按 dp_rank 查询 engine_id。
      </p>

      <CodeBlock language="rust" title="Pod 分流注入 (src/service_discovery.rs:385-403)" code={`if pd_mode && pod_info.pod_type.is_some() {
    let vllm_pd_router = router.as_any().downcast_ref::<VllmPDRouter>()?;
    match &pod_info.pod_type {
        Some(PodType::Prefill) => vllm_pd_router
            .add_prefill_server(worker_url.clone(), pod_info.bootstrap_port).await?,
        Some(PodType::Decode) => vllm_pd_router
            .add_decode_server(worker_url.clone()).await?,
        Some(PodType::Regular) | None => router.add_worker(&worker_url).await?,
    }
}`}
      />

      {/* ===================== 7 HTTP 数据面 ===================== */}
      <div className="section-divider"><span>HTTP 数据面与协议</span></div>

      <h3>7.1 端点总表（src/server.rs:721-773）</h3>

      <table>
        <thead>
          <tr>
            <th>分类</th>
            <th>路径</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td rowSpan={8} style={{ verticalAlign: 'top', fontWeight: 600 }}>protected（推理）</td>
            <td><code>POST /generate</code></td>
            <td>vLLM 原生生成</td>
          </tr>
          <tr><td><code>POST /inference/v1/generate</code></td><td>vLLM disaggregated prefill 原生接口</td></tr>
          <tr><td><code>POST /v1/chat/completions</code></td><td>OpenAI chat</td></tr>
          <tr><td><code>POST /v1/completions</code></td><td>OpenAI completion</td></tr>
          <tr><td><code>POST /v1/responses</code></td><td>OpenAI Responses API</td></tr>
          <tr><td><code>POST /v1/embeddings</code></td><td>Embeddings</td></tr>
          <tr><td><code>POST /rerank</code> / <code>/v1/rerank</code></td><td>重排序（双别名）</td></tr>
          <tr><td><code>POST /v1/responses/{'{'}id{'}'}*</code></td><td>Responses 管理：GET/DELETE/cancel/input</td></tr>
          <tr>
            <td rowSpan={3} style={{ verticalAlign: 'top', fontWeight: 600 }}>public（运维）</td>
            <td><code>GET /health</code> / <code>/health_generate</code> / <code>/liveness</code> / <code>/readiness</code></td>
            <td>健康检查（统一 <code>/health</code>，无 <code>/v1/health</code>）</td>
          </tr>
          <tr><td><code>GET /v1/models</code></td><td>模型列表</td></tr>
          <tr><td><code>GET /get_server_info</code> / <code>/get_model_info</code></td><td>路由信息</td></tr>
          <tr>
            <td rowSpan={2} style={{ verticalAlign: 'top', fontWeight: 600 }}>admin</td>
            <td><code>POST /add_worker</code> / <code>/remove_worker</code> / <code>/flush_cache</code></td>
            <td>动态增删 worker</td>
          </tr>
          <tr><td><code>GET /list_workers</code> / <code>/get_loads</code></td><td>状态查看</td></tr>
          <tr>
            <td style={{ verticalAlign: 'top', fontWeight: 600 }}>REST / 透传</td>
            <td><code>POST/GET /workers</code>、<code>GET/DELETE /workers/{'{'}url{'}'}</code>；任意未匹配路径 → <code>route_transparent</code></td>
            <td>IGW 模式动态管理 + 兜底反向代理</td>
          </tr>
        </tbody>
      </table>

      <h3>7.2 Regular 分发骨架（route_typed_request）</h3>

      <p>
        所有 protected 推理端点共享同一个泛型分发骨架 <code>route_typed_request</code>。三个值得注意的设计：
      </p>
      <ul>
        <li><strong>泛型约束</strong> <code>T: GenerationRequest + Serialize + Clone</code>，chat/completion/generate/embedding/rerank 复用同一骨架；</li>
        <li><strong>只有 cache_aware 策略做实时 load 跟踪</strong>（<code>increment_load</code>），其它策略不追踪；</li>
        <li><strong>内置 RetryExecutor</strong>，仅对 6 个可重试状态码（408/429/500/502/503/504）重试，4xx 客户端错误直接返回。</li>
      </ul>

      <CodeBlock language="rust" title="route_typed_request 骨架 (src/routers/http/router.rs:540-640)" code={`pub async fn route_typed_request<T: GenerationRequest + serde::Serialize + Clone>(
    &self, headers: Option<&HeaderMap>, typed_req: &T, route: &str, model_id: Option<&str>,
) -> Response {
    let start = Instant::now();
    let is_stream = typed_req.is_stream();
    let text = typed_req.extract_text_for_routing();   // cache_aware 一致性哈希的 key

    let response = RetryExecutor::execute_response_with_retry(&self.retry_config,
        |_attempt| async {
            let worker = match self.select_worker_for_model(model_id, Some(&text), headers) {
                Some(w) => w,
                None => return (StatusCode::SERVICE_UNAVAILABLE,
                    "No available workers (all circuits open or unhealthy)").into_response(),
            };
            let policy = match model_id {
                Some(m) => self.policy_registry.get_policy_or_default(m),
                None => self.policy_registry.get_default_policy(),
            };
            let load_incremented = if policy.name() == "cache_aware" {
                worker.increment_load();
                RouterMetrics::set_running_requests(worker.url(), worker.load());
                true
            } else { false };

            let response = self.send_typed_request(headers, typed_req, route,
                worker.url(), is_stream, load_incremented).await;
            worker.record_outcome(response.status().is_success() || response.status().is_client_error());
            response
        },
        |res, _attempt| is_retryable_status(res.status()),
        ...
    ).await;
    ...
}`}
      />

      <h3>7.3 流式：扫到 SSE [DONE] 才归还 load</h3>

      <p>
        流式响应时，load 计数不是请求发出就归还，而是 spawn 一个 task 一直扫数据流，直到看见 <code>data: [DONE]</code> 才 <code>decrement_load</code>——防止长尾请求在流结束前「逃逸」出 cache_aware 的负载统计：
      </p>

      <CodeBlock language="rust" title="send_typed_request 流式 load 归还 (src/routers/http/router.rs:767-1005)" code={`if !is_stream {
    // 非流式：一次性 bytes，发完即减（或由上层统一处理）
} else if load_incremented {
    tokio::spawn(async move {
        while let Some(chunk) = stream.next().await {
            if bytes.contains(b"data: [DONE]") {
                worker.decrement_load();
                break;   // 流结束，归还并发槽位
            }
            tx.send(Ok(bytes));
        }
    });
}`}
      />

      <h3>7.4 OpenAIRouter：把 SaaS 当后端（fork 新增）</h3>

      <p>
        <SrcLink path="src/routers/http/openai_router.rs" /> 只指向一个固定 <code>base_url</code>（如 <code>https://api.openai.com</code>），没有 worker 池。它唯一真正实现的推理端点是 <code>/v1/chat/completions</code>：把 <code>ChatCompletionRequest</code> 序列化后，<strong>剥离 17 个 vLLM-only 字段</strong>（否则 OpenAI 严格 schema 校验会拒绝），再透传上游。其它端点（<code>/generate</code>、<code>/v1/completions</code>、<code>/v1/embeddings</code> 等）一律返回 501。
      </p>

      <CodeBlock language="rust" title="剥离 vLLM-only 字段 (src/routers/http/openai_router.rs:226-363)" code={`// 序列化请求后剔除 vLLM 扩展字段，保证通过 OpenAI 严格 schema
for key in [
    "top_k", "min_p", "min_tokens", "regex", "ebnf", "stop_token_ids",
    "no_stop_trim", "ignore_eos", "continue_final_message",
    "skip_special_tokens", "lora_path", "session_params",
    "separate_reasoning", "stream_reasoning", "chat_template_kwargs",
    "return_hidden_states", "repetition_penalty",
] {
    obj.remove(key);
}
let url = format!("{}/v1/chat/completions", self.base_url);
let mut req = self.client.post(&url).json(&payload);
// 透传下游 Authorization（API key）
if let Some(auth) = headers.and_then(|h| h.get("authorization")
    .or_else(|| h.get("Authorization"))) {
    req = req.header("Authorization", auth);
}`}
      />

      <Callout type="warning">
        注意 OpenAIRouter 目前<strong>只支持 chat</strong>，不能当通用 OpenAI 代理。它的定位是「统一网关入口 + 熔断 + 观测」，让内部服务可以用同一套 SDK 同时打 vLLM 池和 OpenAI SaaS。
      </Callout>

      <h3>7.5 RouterManager：IGW 多路由器协调（fork 新增）</h3>

      <p>
        <code>enable_igw=true</code>（默认 false）时启用 <code>RouterManager</code>：它持有唯一事实源 <code>WorkerRegistry</code>，多个路由器（如 <code>http-regular</code>、<code>http-pd</code>）按 <code>RouterId</code> 注册。按 model 选路由的规则非常直白——<strong>该 model 下只要有任一 worker 是 Prefill/Decode 类型就走 PD 路由器，否则走 regular</strong>：
      </p>

      <CodeBlock language="rust" title="get_router_for_model (src/routers/router_manager.rs:109-141)" code={`pub fn get_router_for_model(&self, model_id: &str) -> Option<Arc<dyn RouterTrait>> {
    let workers = self.worker_registry.get_by_model(model_id);
    if !workers.is_empty() {
        let has_pd_workers = workers.iter().any(|w| {
            matches!(w.worker_type(), WorkerType::Prefill { .. } | WorkerType::Decode)
        });
        let router_id = if has_pd_workers {
            RouterId::new("http-pd")
        } else {
            RouterId::new("http-regular")
        };
        return self.routers.get(&router_id).map(|r| r.clone());
    }
    self.default_router.read().unwrap().clone()
        .and_then(|id| self.routers.get(&id).map(|r| r.clone()))
}`}
      />

      <h3>7.6 协议结构体与校验</h3>

      <p>
        <SrcLink path="src/protocols/spec.rs" /> 的 <code>ChatCompletionRequest</code> 是「OpenAI 标准字段 + vLLM 扩展字段」的混合体，并且有一个 <code>#[serde(flatten)] other</code> 透传字段——router 不认识但 vLLM 后端认识的字段原样透传，保证前向兼容。校验层（<SrcLink path="src/protocols/validation.rs" />）用 <strong>provider trait 组合</strong>让每个请求类型复用同一套校验流水线：
      </p>

      <CodeBlock language="rust" title="组合式校验 (src/protocols/validation.rs:459-538)" code={`pub trait SamplingOptionsProvider { fn get_temperature(&self) -> Option<f32>; ... }
pub trait StopConditionsProvider { fn get_stop_sequences(&self) -> Option<&StringOrArray>; }
pub trait TokenLimitsProvider { fn get_max_tokens(&self) -> Option<u32>; ... }
pub trait LogProbsProvider { fn get_logprobs(&self) -> Option<u32>; ... }
pub trait VLLMExtensionsProvider { fn get_top_k(&self) -> Option<i32>; ... }

pub fn validate_common_request_params<T>(request: &T) -> Result<(), ValidationError>
where T: SamplingOptionsProvider + StopConditionsProvider + TokenLimitsProvider
        + LogProbsProvider + VLLMExtensionsProvider + CompletionCountProvider + ?Sized,
{
    validate_sampling_options(request)?;   // temperature∈[0,2] top_p∈[0,1]
    validate_stop_conditions(request)?;    // stop ≤ 4 条
    validate_token_limits(request)?;
    validate_logprobs(request)?;           // logprobs∈[0,5] top_logprobs∈[0,20]
    validate_vllm_extensions(request)?;    // top_k≥-1, min_p∈[0,1], rep_penalty∈[0,2]
    validate_completion_count(request)?;   // n ≥ 1
    validate_cross_parameters(request)?;
    Ok(())
}`}
      />

      {/* ===================== 8 可靠性 ===================== */}
      <div className="section-divider"><span>可靠性 / 可观测性</span></div>

      <p>
        fork 继承了母体的熔断 / 重试 / 健康检查骨架，并新增了 <strong>OpenTelemetry</strong> 与 <strong>IGW 队列</strong>。可靠性内核围绕 <code>Worker</code> trait 展开。
      </p>

      <h3>8.1 Worker trait：available = healthy + 熔断器可执行</h3>

      <CodeBlock language="rust" title="Worker trait (src/core/worker.rs:19-82)" code={`#[async_trait]
pub trait Worker: Send + Sync + fmt::Debug {
    fn url(&self) -> &str;
    fn worker_type(&self) -> WorkerType;       // Regular / Prefill / Decode
    fn is_healthy(&self) -> bool;
    fn set_healthy(&self, healthy: bool);
    async fn check_health_async(&self) -> WorkerResult<()>;
    fn load(&self) -> usize;
    fn increment_load(&self);
    fn decrement_load(&self);
    fn processed_requests(&self) -> usize;
    fn circuit_breaker(&self) -> &CircuitBreaker;

    // 默认方法：健康 AND 熔断器未打开 才可接入请求
    fn is_available(&self) -> bool {
        self.is_healthy() && self.circuit_breaker().can_execute()
    }
}

pub struct BasicWorker {
    metadata: WorkerMetadata,
    load_counter: Arc<AtomicUsize>,
    processed_counter: Arc<AtomicUsize>,
    healthy: Arc<AtomicBool>,
    consecutive_failures: Arc<AtomicUsize>,
    consecutive_successes: Arc<AtomicUsize>,
    circuit_breaker: CircuitBreaker,
}`}
      />

      <h3>8.2 熔断器：三态状态机（RwLock，非 CAS）</h3>

      <CodeBlock language="rust" title="CircuitBreaker (src/core/circuit_breaker.rs:19-28, 104-168)" code={`// 默认配置
impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,                // Closed 下连续失败 5 次 → Open
            success_threshold: 2,                // HalfOpen 下连续成功 2 次 → Closed
            timeout_duration: Duration::from_secs(30),  // Open 30s 后进入 HalfOpen
            window_duration: Duration::from_secs(60),
        }
    }
}

pub fn record_failure(&self) {
    self.consecutive_successes.store(0, Ordering::Release);
    let failures = self.consecutive_failures.fetch_add(1, Ordering::AcqRel) + 1;
    match *self.state.read().unwrap() {          // RwLock 状态容器（非 AtomicU8+CAS）
        CircuitState::Closed => if failures >= self.config.failure_threshold {
            self.transition_to(CircuitState::Open);
        },
        CircuitState::HalfOpen => self.transition_to(CircuitState::Open), // 半开失败立即复开
        CircuitState::Open => {}
    }
}`}
      />

      <h3>8.3 重试：6 个可重试码 + 指数退避 + jitter</h3>

      <CodeBlock language="rust" title="retry.rs (src/core/retry.rs:9-48)" code={`pub fn is_retryable_status(status: StatusCode) -> bool {
    matches!(status,
        StatusCode::REQUEST_TIMEOUT     // 408
        | StatusCode::TOO_MANY_REQUESTS // 429
        | StatusCode::INTERNAL_SERVER_ERROR // 500
        | StatusCode::BAD_GATEWAY       // 502
        | StatusCode::SERVICE_UNAVAILABLE // 503
        | StatusCode::GATEWAY_TIMEOUT)  // 504
}

// delay = min(initial * multiplier^attempt, max) * (1 + U[-jitter, +jitter])
pub fn calculate_delay(config: &RetryConfig, attempt: u32) -> Duration {
    let pow = config.backoff_multiplier.powi(attempt as i32);
    let mut delay_ms = (config.initial_backoff_ms as f32 * pow) as u64;
    if delay_ms > config.max_backoff_ms { delay_ms = config.max_backoff_ms; }
    let jitter = config.jitter_factor.clamp(0.0, 1.0);
    if jitter > 0.0 {
        let scale: f32 = rand::rng().random_range(-jitter..=jitter);
        let jitter_ms = (delay_ms as f32 * scale).round();
        return Duration::from_millis((delay_ms as i64 + jitter_ms as i64).max(0) as u64);
    }
    Duration::from_millis(delay_ms)
}`}
      />

      <h3>8.4 中间件栈 + 并发限流队列</h3>

      <p>
        外层 → 内层的完整中间件栈：<code>CORS → RequestId → TraceLayer(OTel span + 请求日志) → BodyLimit → ConcurrencyLimit(含队列) → Handler</code>。注意 <code>concurrency_limit</code> 是 <strong>route 级</strong>，只作用于 protected 推理端点；public/admin/worker 路由不受限。
      </p>

      <CodeBlock language="rust" title="中间件栈 (src/server.rs:768-798)" code={`let base_app = Router::new()
    .merge(protected_routes)     // 已挂 concurrency_limit_middleware
    .merge(public_routes)
    .merge(admin_routes)
    .merge(worker_routes)
    .layer(DefaultBodyLimit::max(max_payload_size))
    .layer(RequestBodyLimitLayer::new(max_payload_size));
let base_app = base_app
    .layer(RequestIdLayer::new(request_id_headers))
    .layer(create_cors_layer(cors_allowed_origins));

// ConcurrencyLimiter：TokenBucket（并发+速率双限） + 等待队列
let (limiter, processor) = middleware::ConcurrencyLimiter::new(
    app_context.rate_limiter.clone(),
    config.router_config.queue_size,          // 默认 100
    Duration::from_secs(config.router_config.queue_timeout_secs));  // 默认 60s`}
      />

      <CodeBlock language="rust" title="队列处理（IGW 队列）(src/middleware.rs:400-463)" code={`pub async fn run(mut self) {
    while let Some(queued) = self.queue_rx.recv().await {
        let elapsed = queued.queued_at.elapsed();
        if elapsed >= self.queue_timeout {          // 入队超过 60s
            let _ = queued.permit_tx.send(Err(StatusCode::REQUEST_TIMEOUT));
            continue;
        }
        let remaining_timeout = self.queue_timeout - elapsed;
        if self.token_bucket.try_acquire(1.0).await.is_ok() {
            let _ = queued.permit_tx.send(Ok(()));
        } else {
            // 排队等待剩余时间窗口内的令牌
            tokio::spawn(async move {
                if token_bucket.acquire_timeout(1.0, remaining_timeout).await.is_ok() {
                    let _ = queued.permit_tx.send(Ok(()));
                } else {
                    let _ = queued.permit_tx.send(Err(StatusCode::REQUEST_TIMEOUT));
                }
            });
        }
    }
}`}
      />

      <h3>8.5 可观测性：OTel（fork 新增）+ Prometheus</h3>

      <ul>
        <li><strong>OTel</strong>（<SrcLink path="src/otel_trace.rs" />，280 行）：OTLP gRPC 导出（默认 <code>localhost:4317</code>），<code>BatchSpanProcessor</code> 500ms / 64 条一批。资源属性 <code>service.name=vllm-router</code> + 版本 + 实例 ID。</li>
        <li><strong>关键设计</strong>：<code>CustomOtelFilter</code> 只允许 <code>target="otel_trace"</code> 的 span 进 OTel，其余 tracing 输出只走日志——避免全量 span 打爆 collector。</li>
        <li><strong>W3C trace 传播</strong>：入站从 header 提取 <code>traceparent</code>；出站 <code>inject_trace_context_http</code> 注入下游，让 router span 成为 worker span 的父 span。</li>
        <li><strong>Prometheus</strong>（默认端口 <code>29000</code>）：50+ 指标，前缀 <code>vllm_router_*</code>（请求/重试/熔断/PD/发现）与 <code>vllm_tokenizer_*</code>（编解码/stop 检测）。</li>
      </ul>

      <CodeBlock language="rust" title="OTel provider (src/otel_trace.rs:142-197)" code={`let mut exporter = opentelemetry_otlp::SpanExporter::builder()
    .with_tonic()
    .with_protocol(opentelemetry_otlp::Protocol::Grpc)
    .with_endpoint(&trace_config.endpoint)   // 默认 localhost:4317
    .build()?;

let span_processor = BatchSpanProcessor::builder(exporter, runtime::Tokio)
    .with_batch_config(BatchConfigBuilder::default()
        .with_scheduled_delay(Duration::from_millis(500))
        .with_max_export_batch_size(64)
        .build())
    .build();

let resource = Resource::new(vec![
    KeyValue::new("service.name", "vllm-router"),
    KeyValue::new("service.version", env!("CARGO_PKG_VERSION")),
    KeyValue::new("service.instance.id", service_instance_id()),
]);
let provider = TracerProvider::builder()
    .with_sampler(parent_based_sampler(trace_config.sampling_ratio))
    .with_span_processor(span_processor)
    .with_resource(resource)
    .build();`}
      />

      <h3>8.6 认证：远程 API Key 校验 + 内存缓存</h3>

      <CodeBlock language="rust" title="authorize_request (src/server.rs:401-463)" code={`// 并非本地比对：把客户端 Bearer token 透传到 api_key_validation_urls 远程校验
if validation_urls.is_empty() { return Ok(()); }
let token = auth_header.strip_prefix("Bearer ")...;
// 先查内存缓存 HashMap<String, bool>
if let Some(valid) = state.context.api_key_cache.read().await.get(token).copied() {
    return if valid { Ok(()) } else { Err(UNAUTHORIZED.into()) };
}
for url in validation_urls {
    match state.context.client.get(url)
        .header(AUTHORIZATION, format!("Bearer {token}")).send().await
    {
        Ok(r) if r.status() == StatusCode::OK => { validated = true; break; }
        ...
    }
}
state.context.api_key_cache.write().await.insert(token.to_string(), validated);`}
      />

      {/* ===================== 9 Tokenizer ===================== */}
      <div className="section-divider"><span>Tokenizer：多后端抽象（fork 重写）</span></div>

      <p>
        母体依赖 SGLang 的 Python tokenizer；fork 用 Rust 完全重写 <code>tokenizer/</code>，抽象出 <code>Encoder</code> / <code>Decoder</code> 两个 trait 分离的接口，统一 4 种后端，并自研了 stop-sequence 增量解码。这是 gateway 能在纯 Rust 进程内完成「tokenize → 路由 → 生成 → detokenize」整条链的基础。
      </p>

      <CodeBlock language="rust" title="trait 分离 + Encoding 枚举 (src/tokenizer/traits.rs)" code={`/// 编码侧：不同后端各自实现 encode
pub trait Encoder: Send + Sync {
    fn encode(&self, text: &str) -> Result<Encoding>;
    fn vocab_size(&self) -> usize;
    fn special_token_id(&self, tok: SpecialTokens) -> Option<u32>;
    fn token_to_id(&self, token: &str) -> Option<u32>;
}

/// 解码侧：单独 trait，方便做缓存 / 增量解码
pub trait Decoder: Send + Sync {
    fn decode(&self, ids: &[u32]) -> Result<String>;
    fn convert_tokens_to_string(&self, tokens: &[u32]) -> Result<String>;
}

/// 统一输出：不同后端的编码表示
pub enum Encoding {
    Hf(Box<tokenizers::Encoding>),   // HuggingFace tokenizers（完整 offsets/特殊 token）
    Sp(Vec<u32>),                    // sentencepiece（纯 id 序列）
    Tiktoken(Vec<u32>),              // OpenAI tiktoken（纯 id 序列）
}`}
      />

      <CodeBlock language="rust" title="Tokenizer 门面 (src/tokenizer/mod.rs)" code={`/// Tokenizer 门面：内部持有一个具体后端，暴露统一 API
pub struct Tokenizer {
    inner: Arc<dyn TokenizerTrait>,   // 多态派发到具体后端
}

impl Tokenizer {
    pub fn encode(&self, text: &str) -> TokenizerResult<Vec<u32>> { ... }
    pub fn decode(&self, ids: &[u32]) -> TokenizerResult<String> { ... }
    pub fn stop_sequence_decoder(&self, seqs: &[String])
        -> Result<StopSequenceDecoder> { ... }
}`}
      />

      <h3>9.1 StopSequenceDecoder：jail_buffer 部分匹配暂存</h3>

      <p>
        流式生成时遇到 <code>stop</code> 序列，若当前 token 只匹配了 stop 串的<strong>前缀</strong>，不能立刻判定停止（后一个 token 可能不匹配）。<code>jail_buffer</code> 把部分匹配的字节「暂押」，等下一个 token 确认：匹配上则停止，不匹配则把暂押内容吐出来：
      </p>

      <CodeBlock language="rust" title="stop.rs (src/tokenizer/stop.rs:95)" code={`pub enum SequenceDecoderOutput {
    Text(String),            // 普通增量文本
    Held(Vec<u8>),           // 押住的部分匹配字节
    Stopped,                 // 命中完整 stop 序列
    StoppedWithText(String), // 命中 + 附带未吐完文本
}

/// 增量喂 token，返回四类结果之一
pub fn process_token(&mut self, token: u32, encoding: &Encoding) -> SequenceDecoderOutput {
    // 1) 先把 token 解码成字节
    // 2) 追加到 jail_buffer，与 stop 序列逐个前缀匹配
    // 3) 若 jail_buffer 前缀不再是任何 stop 序列的前缀 -> 释放为 Text
    // 4) 若完全命中 -> Stopped
    // 关键：jail_buffer 保证「部分匹配」不误判，同时不丢失已生成的字节
}`}
      />

      <h3>9.2 Sequence：prefix_offset / read_offset 增量解码</h3>

      <CodeBlock language="rust" title="sequence.rs 增量解码" code={`pub struct Sequence {
    ids: Vec<u32>,
    prefix_offset: usize,   // 已确认稳定解码的偏移
    read_offset: usize,     // 当前已读偏移
    text: String,           // 已解码文本
}

impl Sequence {
    /// 只对 [read_offset, len) 新增的 id 增量解码，
    /// 解出的字符串接到 text 后面；
    /// 多 token 边界处的字节不完整时回退到 prefix_offset 重解，
    /// 保证 UTF-8 不产生乱码。
    pub fn append(&mut self, new_ids: &[u32]) -> &str { ... }
}`}
      />

      <h3>9.3 工厂自动探测 + chat template</h3>

      <CodeBlock language="rust" title="factory.rs 自动探测" code={`/// 从模型文件自动探测后端：
///   - 有 .json 结构（tokenizer.json / config.json）→ HuggingFace tokenizers
///   - 否则按文件后缀回退 tiktoken（cl100k / p50k / r50k）
pub fn create_tokenizer_from_file(path: &Path) -> Result<Tokenizer> {
    if path.ends_with(".json") {
        Ok(Tokenizer::from_hf_file(path)?)
    } else {
        Ok(Tokenizer::from_tiktoken(detect_tiktoken_model(path)?))
    }
}`}
      />

      <CodeBlock language="rust" title="chat_template.rs (minijinja)" code={`// 用 minijinja 渲染 HuggingFace chat_template：
//   {"{{messages}}"} → 把 ChatMessage 列表渲染成模型期望的 prompt 格式
// 支持 variable_is_undefined 等 Jinja 特性，与 Python jinja2 语义对齐
let tmpl = minijinja::Template::from_str(chat_template)?;
let rendered = tmpl.render(minijinja::context! {
    messages => &messages,      // [{role, content, tool_calls?}]
    add_generation_prompt => true,
})?;`}
      />

      {/* ===================== 10 三方对比 ===================== */}
      <div className="section-divider"><span>三方对比：vLLM Router vs SGLang Model Gateway vs AIBrix</span></div>

      <h3>10.1 三方能力矩阵</h3>
      <table>
        <thead>
          <tr>
            <th style={{ width: '20%' }}>维度</th>
            <th>vLLM Router<br/><span style={{ fontWeight: 400, fontSize: '0.8rem' }}>vllm-project/router（Rust）</span></th>
            <th>SGLang Model Gateway<br/><span style={{ fontWeight: 400, fontSize: '0.8rem' }}>sglang / sgl-model-gateway（Rust）</span></th>
            <th>AIBrix<br/><span style={{ fontWeight: 400, fontSize: '0.8rem' }}>vllm-project/aibrix（Go+Envoy）</span></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ fontWeight: 600 }}>血缘</td>
            <td>== SGLang Model Gateway 的 fork</td>
            <td>SGLang 团队自研（本 fork 的母体）</td>
            <td>独立项目（vLLM 生态）</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 600 }}>后端</td>
            <td>vLLM（原生两阶段协议）</td>
            <td>SGLang（gRPC + Radix）</td>
            <td>vLLM / SGLang / 其它 OpenAI 兼容</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 600 }}>数据面</td>
            <td>Rust（axum + reqwest）进程内</td>
            <td>Rust（axum + reqwest）进程内</td>
            <td>Envoy（C++）sidecar / 中心化</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 600 }}>P/D 分离</td>
            <td>★ 专用 <code>VllmPDRouter</code>：两阶段 + 3 种 KV Connector + logprobs 合并</td>
            <td>通用 <code>pd_router</code>（面向 SGLang 协议）</td>
            <td>P/D 分离路由（<code>pd_selector</code> + 加权）</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 600 }}>负载均衡</td>
            <td>6 策略（含 fork 新增 rendezvous_hash）</td>
            <td>5 策略（round_robin/random/cache_aware/power_of_two/consistent_hash）</td>
            <td>加权（round_robin / random / least_loaded / weighted）</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 600 }}>前缀缓存路由</td>
            <td>cache_aware + Radix 树（2320 行）</td>
            <td>cache_aware + Radix 树（同源）</td>
            <td>KV Cache 管理 + 前缀感知</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 600 }}>服务发现</td>
            <td>K8s watcher（PD 双 selector）+ ★ ZMQ push</td>
            <td>K8s watcher（单 selector）</td>
            <td>K8s 原生（控制面）</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 600 }}>tokenizer</td>
            <td>★ Rust 多后端（HF/Sp/tiktoken）+ stop 增量解码</td>
            <td>依赖 SGLang Python 侧</td>
            <td>—（只做 HTTP 转发）</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 600 }}>可观测性</td>
            <td>★ OTel tracing + Prometheus 50+ 指标</td>
            <td>Prometheus（少量）</td>
            <td>Prometheus + Envoy access log</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 600 }}>部署模型</td>
            <td>单二进制（bin 别名兼容）+ PyO3 Python 库</td>
            <td>单二进制</td>
            <td>K8s 控制面 + Envoy DaemonSet</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 600 }}>典型场景</td>
            <td>vLLM disaggregated prefill/decode 集群的统一网关</td>
            <td>SGLang 集群统一网关</td>
            <td>K8s 原生多模型 + 动态扩缩容</td>
          </tr>
        </tbody>
      </table>

      {/* ===================== 资源 ===================== */}
      <div className="section-divider"><span>选型参考与资源</span></div>

      <Callout type="warning">
        <strong>选型提醒：</strong>
        <ul>
          <li>想要 <strong>vLLM disaggregated prefill/decode</strong> 的原生两阶段路由、KV 传输注入（NIXL / Mooncake / MoRI-IO）→ 选 <strong>vLLM Router</strong></li>
          <li>想要 <strong>SGLang 后端</strong>（gRPC 管线 / Harmony / MCP）的通用网关 → 选 <strong>SGLang Model Gateway</strong></li>
          <li>想要 <strong>K8s 原生</strong>的资源编排、弹性伸缩、LoRA/KV Cache 生命周期管理 → 选 <strong>AIBrix</strong></li>
          <li>三者不冲突：AIBrix 管「有多少 Pod」，vLLM Router / Gateway 管「请求进哪个 worker」</li>
        </ul>
      </Callout>

      <ResourceTable resources={[
        { name: 'vllm-project/router', url: 'https://github.com/vllm-project/router', desc: '上游仓库（本 fork 就是它）' },
        { name: 'SGLang Model Gateway', url: 'https://github.com/sgl-project/sglang/tree/main/sgl-model-gateway', desc: '母体（sgl-model-gateway 目录）' },
        { name: 'vLLM Disaggregated Prefill', url: 'https://docs.vllm.ai/en/latest/features/disagg_prefill.html', desc: 'vLLM 官方 P/D 分离文档' },
        { name: 'Mooncake', url: 'https://github.com/kvcache-ai/Mooncake', desc: 'KV 传输后端之一（push 型）' },
        { name: 'AIBrix', url: 'https://github.com/vllm-project/aibrix', desc: 'K8s 原生调度器（对比对象）' },
      ]} />

    </div>
  );
}
