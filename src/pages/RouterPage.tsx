import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, CodeBlock, ResourceTable } from '../components/CodeBlock';

export function RouterPage() {
  return (
    <div className="prose max-w-none">
      <h1>服务调度器 (Router)</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-08</span>
        <span className="page-meta-item">⏱️ 阅读约 20 分钟</span>
        <span className="page-meta-item">🏷️ 专题 · 路由网关</span>
      </div>
      <p>服务调度器（Router）是 LLM 推理集群的<strong>流量入口</strong>，负责请求路由、负载均衡、前缀感知分发和故障转移。本文分析 sgl-router 及同类路由框架的架构设计与实现。</p>

      {/* ==================== 1. 路由层定位 ==================== */}
      <div className="section-divider"><span>路由层定位</span></div>

      <p>在 LLM 推理架构中，Router 位于客户端和推理引擎之间，作为<strong>统一的流量网关</strong>：</p>

      <MermaidDiagram chart={`
graph TB
    subgraph Clients["客户端"]
        C1["Chat UI"]
        C2["API Client"]
        C3["SDK"]
    end

    subgraph Router["Router 路由层"]
        R1["请求路由"]
        R2["负载均衡"]
        R3["前缀感知分发"]
        R4["故障转移"]
        R5["限流/鉴权"]
    end

    subgraph Backend["推理后端"]
        B1["vLLM 实例"]
        B2["SGLang 实例"]
        B3["TGI 实例"]
        B4["vLLM-Ascend"]
    end

    C1 --> Router
    C2 --> Router
    C3 --> Router
    Router --> Backend
      `} />

      <table>
        <thead><tr><th>功能</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><strong>请求路由</strong></td><td>根据模型名、请求类型将请求分发到对应后端</td></tr>
          <tr><td><strong>负载均衡</strong></td><td>均衡分发请求到多个实例，避免热点</td></tr>
          <tr><td><strong>前缀感知分发</strong></td><td>将相同前缀的请求路由到同一实例，最大化 KV Cache 命中率</td></tr>
          <tr><td><strong>故障转移</strong></td><td>实例不可用时自动切换到健康实例</td></tr>
          <tr><td><strong>限流/鉴权</strong></td><td>API Key 验证、速率限制、配额管理</td></tr>
        </tbody>
      </table>

      {/* ==================== 2. sgl-router 详解 ==================== */}
      <div className="section-divider"><span>sgl-router 详解</span></div>

      <h3>核心架构</h3>
      <p>sgl-router 是 SGLang 项目的<strong>高性能请求路由器</strong>，用 Rust 编写，支持前缀感知路由和多种负载均衡策略。</p>

      <MermaidDiagram chart={`
graph TB
    subgraph sgl["sgl-router"]
        HTTP["HTTP Server<br/>(OpenAI 兼容)"]
        CACHE["Prefix Cache<br/>Worker↔Prefix 映射"]
        POLICY["Load Balancer<br/>策略引擎"]
        HEALTH["Health Checker<br/>故障检测"]
        HTTP --> CACHE
        HTTP --> POLICY
        HTTP --> HEALTH
    end

    subgraph Workers["Worker 池"]
        W1["SGLang Worker 1<br/>GPU 0-3"]
        W2["SGLang Worker 2<br/>GPU 4-7"]
        W3["vLLM Worker<br/>GPU 8-11"]
    end

    POLICY --> W1
    POLICY --> W2
    POLICY --> W3
      `} />

      <h3>启动方式</h3>
      <CodeBlock language="bash" title="sgl-router 启动" code={`# 方式 1: 启动 router + worker 一体化
python -m sglang.launch_server \\
  --model meta-llama/Llama-3-70B \\
  --dp-size 2 \\
  --enable-router

# 方式 2: 独立启动 router
python -m sglang.router.launch_router \\
  --worker-urls http://worker1:30000 http://worker2:30000 \\
  --policy cache-aware \\
  --host 0.0.0.0 --port 8080

# 方式 3: 动态添加 worker
curl -X POST http://router:8080/workers \\
  -H "Content-Type: application/json" \\
  -d '{"url": "http://worker3:30000"}'`} />

      <h3>路由策略</h3>
      <table>
        <thead><tr><th>策略</th><th>原理</th><th>适用场景</th></tr></thead>
        <tbody>
          <tr><td><strong>cache-aware</strong></td><td>基于请求前缀哈希，相同前缀路由到同一 Worker，最大化 KV Cache 命中</td><td>多轮对话、Agent 工作负载</td></tr>
          <tr><td><strong>round-robin</strong></td><td>轮询分发，每个 Worker 依次接收请求</td><td>无前缀复用需求，简单均衡</td></tr>
          <tr><td><strong>least-connections</strong></td><td>分发到当前活跃连接最少的 Worker</td><td>请求耗时差异大</td></tr>
          <tr><td><strong>power-of-two</strong></td><td>随机选 2 个 Worker，选负载更低的</td><td>大规模集群，避免惊群效应</td></tr>
          <tr><td><strong>prefix-tree</strong></td><td>维护前缀树，精确匹配最优 Worker</td><td>前缀结构复杂，需要精确匹配</td></tr>
        </tbody>
      </table>

      <h3>前缀感知路由核心实现</h3>
      <CodeBlock language="python" title="Cache-Aware 路由逻辑" code={`class CacheAwareRouter:
    """前缀感知路由器: 将相同前缀请求路由到同一 Worker"""

    def __init__(self):
        # prefix_hash -> worker_id 映射
        self.prefix_map: dict[str, str] = {}
        # worker_id -> current_load 负载跟踪
        self.worker_loads: dict[str, int] = {}

    def route(self, prompt: str) -> str:
        """根据 prompt 前缀选择 Worker"""
        # 1. 计算前缀哈希
        prefix = self._extract_prefix(prompt, n_tokens=64)
        prefix_hash = hashlib.md5(prefix.encode()).hexdigest()[:16]

        # 2. 查找已有映射
        if prefix_hash in self.prefix_map:
            worker = self.prefix_map[prefix_hash]
            if self._is_healthy(worker):
                return worker
            # Worker 不可用，清除映射
            del self.prefix_map[prefix_hash]

        # 3. 选择负载最低的 Worker
        worker = min(self.worker_loads.items(), key=lambda x: x[1])[0]

        # 4. 记录映射
        self.prefix_map[prefix_hash] = worker
        self.worker_loads[worker] += 1
        return worker

    def _extract_prefix(self, prompt: str, n_tokens: int) -> str:
        """提取 prompt 前 n 个 token 作为前缀"""
        tokens = self.tokenizer.encode(prompt)[:n_tokens]
        return self.tokenizer.decode(tokens)`} />

      <h3>Health Check 机制</h3>
      <CodeBlock language="python" title="Worker 健康检查" code={`class HealthChecker:
    """定期检查 Worker 健康状态"""

    def __init__(self, workers: list[str], interval: float = 5.0):
        self.workers = workers
        self.interval = interval
        self.status: dict[str, bool] = {}  # worker_url -> healthy

    async def check_loop(self):
        """后台循环检查"""
        while True:
            for worker in self.workers:
                try:
                    # 检查 /health 端点
                    resp = await http_get(f"{worker}/health", timeout=2)
                    self.status[worker] = resp.status == 200
                except Exception:
                    self.status[worker] = False

            # 通知 router 更新路由表
            await self.router.update_health(self.status)
            await asyncio.sleep(self.interval)`} />

      <Callout type="tip">
        <strong>sgl-router 的关键设计：</strong>
        <ul>
          <li><strong>Rust 实现</strong>：HTTP 解析和路由决策在 Rust 中完成，零 GIL 开销</li>
          <li><strong>前缀缓存亲和性</strong>：cache-aware 策略将相同前缀请求绑定到同一 Worker，与 SGLang 的 RadixAttention 天然配合</li>
          <li><strong>动态 Worker 管理</strong>：支持运行时添加/移除 Worker，无需重启</li>
          <li><strong>OpenAI 兼容</strong>：对外暴露标准 OpenAI API，客户端无需修改</li>
        </ul>
      </Callout>

      {/* ==================== 3. 同类框架对比 ==================== */}
      <div className="section-divider"><span>同类框架对比</span></div>

      <h3>3.1 LiteLLM (Proxy)</h3>
      <p>LiteLLM 是最流行的<strong>LLM API 代理/网关</strong>，支持 100+ LLM 提供商统一接入，提供负载均衡、速率限制、预算管理和可观测性。</p>

      <CodeBlock language="yaml" title="LiteLLM Proxy 配置" code={`# litellm_config.yaml
model_list:
  - model_name: gpt-4o
    litellm_params:
      model: azure/gpt-4o
      api_key: os.environ/AZURE_API_KEY
      api_base: https://my-endpoint.openai.azure.com
    tpm: 1000000    # tokens per minute 限制
    rpm: 10000      # requests per minute 限制

  - model_name: llama-3-70b
    litellm_params:
      model: openai/llama-3-70b
      api_base: http://vllm-server:8000/v1
    tpm: 500000

router_settings:
  routing_strategy: "usage-based"  # 基于使用量的负载均衡
  allowed_fails: 3                 # 失败 3 次后标记为不可用
  num_retries: 2                   # 重试次数
  fallbacks:                       # 故障转移
    - gpt-4o: ["claude-sonnet-5"]`} />

      <h3>3.2 NVIDIA Triton Inference Server</h3>
      <p>Triton 是 NVIDIA 的<strong>通用推理服务器</strong>，支持多种模型类型（LLM、CV、NLP），内置模型编排（Ensemble）和动态批处理。</p>

      <MermaidDiagram chart={`
graph TB
    subgraph Triton["Triton Inference Server"]
        HTTP2["HTTP/gRPC API"]
        SCHED["Model Scheduler<br/>Dynamic Batching"]
        QUEUE["Request Queue<br/>优先级队列"]
        MODEL["Model Backend<br/>TensorRT-LLM / vLLM / ONNX"]
    end

    HTTP2 --> SCHED
    SCHED --> QUEUE
    QUEUE --> MODEL
    MODEL --> BACKEND["GPU 0..N"]
      `} />

      <table>
        <thead><tr><th>特性</th><th>Triton</th><th>sgl-router</th><th>LiteLLM</th></tr></thead>
        <tbody>
          <tr><td><strong>定位</strong></td><td>通用推理服务器</td><td>LLM 专用 Router</td><td>LLM API 网关</td></tr>
          <tr><td><strong>实现语言</strong></td><td>C++ / Python</td><td>Rust</td><td>Python</td></tr>
          <tr><td><strong>模型支持</strong></td><td>LLM + CV + 语音 + 表格</td><td>仅 LLM (SGLang/vLLM)</td><td>100+ LLM 提供商</td></tr>
          <tr><td><strong>动态批处理</strong></td><td>✅ 内置</td><td>❌ 由后端处理</td><td>❌ 由后端处理</td></tr>
          <tr><td><strong>前缀感知路由</strong></td><td>❌</td><td>✅ cache-aware</td><td>❌</td></tr>
          <tr><td><strong>负载均衡</strong></td><td>✅ 多种策略</td><td>✅ 5 种策略</td><td>✅ usage-based</td></tr>
          <tr><td><strong>模型编排</strong></td><td>✅ Ensemble (DAG)</td><td>❌</td><td>❌</td></tr>
          <tr><td><strong>速率限制</strong></td><td>✅</td><td>❌</td><td>✅ RPM/TPM</td></tr>
          <tr><td><strong>可观测性</strong></td><td>✅ Prometheus</td><td>✅ 内置 metrics</td><td>✅ 支持多后端</td></tr>
        </tbody>
      </table>

      <h3>3.3 HuggingFace TGI Router</h3>
      <p>HuggingFace Text Generation Inference (TGI) 内置 Router，支持<strong>多种路由策略</strong>和 Watermark 批处理。</p>

      <CodeBlock language="bash" title="TGI Router 启动" code={`# TGI 启动时自动启用 Router
text-generation-launcher \\
  --model-id meta-llama/Llama-3-70B \\
  --num-shard 4 \\
  --max-concurrent-requests 128

# TGI Router 特性:
# 1. Watermark Batching: 到达 watermark 阈值后立即批处理
# 2. 最长等待时间: 请求等待超过阈值，即使不足 watermark 也处理
# 3. 基于 token 的负载均衡: 按实际 token 数而非请求数分配`} />

      <h3>3.4 vLLM Proxy/Router</h3>
      <p>vLLM 本身不内置独立 Router，但支持<strong>通过 Nginx/Envoy 或自定义 proxy 实现</strong>路由。vLLM V1 的 Disaggregated Serving 需要 Router 协调 Prefill 和 Decode 节点。</p>

      <CodeBlock language="python" title="vLLM Proxy 示例" code={`# vLLM 多实例 + Nginx 负载均衡
# nginx.conf
upstream vllm_backend {
    # 轮询策略
    server 10.0.0.1:8000 weight=1 max_fails=3;
    server 10.0.0.2:8000 weight=1 max_fails=3;
    server 10.0.0.3:8000 weight=2;  # 更高权重
}

# 前缀感知路由 (Nginx 不支持原生前缀哈希，需要 Lua 扩展)
# 可通过 OpenResty + Lua 实现:
# 1. 提取请求 body 中的 prompt 前 64 tokens
# 2. 计算哈希
# 3. 根据哈希选择 upstream server`} />

      <h3>3.5 Mooncake Router</h3>
      <p>Mooncake（月之暗面/Kimi）的 Router 专注于<strong>P/D 分离场景下的 KV Cache 传输路由</strong>，拓扑感知调度是核心能力。</p>

      <table>
        <thead><tr><th>特性</th><th>Mooncake Router</th><th>sgl-router</th></tr></thead>
        <tbody>
          <tr><td><strong>核心职责</strong></td><td>KV Cache 传输路由 + P/D 协调</td><td>请求路由 + 前缀感知分发</td></tr>
          <tr><td><strong>拓扑感知</strong></td><td>✅ 自动选择最优传输路径</td><td>❌</td></tr>
          <tr><td><strong>传输协议</strong></td><td>RDMA + TCP 混合</td><td>HTTP (不涉及 KV 传输)</td></tr>
          <tr><td><strong>P/D 分离</strong></td><td>✅ 核心场景</td><td>✅ 通过 SGLang 后端</td></tr>
          <tr><td><strong>开源</strong></td><td>✅</td><td>✅</td></tr>
        </tbody>
      </table>

      {/* ==================== 4. 路由策略深度对比 ==================== */}
      <div className="section-divider"><span>路由策略深度对比</span></div>

      <h3>前缀感知路由 vs 普通负载均衡</h3>
      <MermaidDiagram chart={`
graph TB
    subgraph Normal["普通负载均衡"]
        R1["Router"] --> W1["Worker 1<br/>请求 A (前缀 X)"]
        R1 --> W2["Worker 2<br/>请求 B (前缀 X)"]
        R1 --> W3["Worker 3<br/>请求 C (前缀 X)"]
    end
    subgraph Cache["前缀感知路由"]
        R2["Router"] --> WA["Worker 1<br/>请求 A,B,C (前缀 X)"]
    end
    Normal --> Cache
    Note["相同前缀请求分散 → 缓存命中率低"]
    Note2["相同前缀请求聚合 → 缓存命中率 100%"]
    Normal --> Note
    Cache --> Note2
      `} />

      <h3>各策略缓存命中率对比</h3>
      <table>
        <thead><tr><th>策略</th><th>多轮对话命中率</th><th>Few-shot 命中率</th><th>通用场景命中率</th></tr></thead>
        <tbody>
          <tr><td><strong>Round-Robin</strong></td><td>~20% (随机)</td><td>~25%</td><td>~10%</td></tr>
          <tr><td><strong>Least-Connections</strong></td><td>~30%</td><td>~35%</td><td>~15%</td></tr>
          <tr><td><strong>Power-of-Two</strong></td><td>~25%</td><td>~30%</td><td>~12%</td></tr>
          <tr><td><strong>Cache-Aware</strong></td><td>~90%</td><td>~85%</td><td>~60%</td></tr>
          <tr><td><strong>Prefix-Tree</strong></td><td>~95%</td><td>~90%</td><td>~65%</td></tr>
        </tbody>
      </table>

      {/* ==================== 5. 故障转移与高可用 ==================== */}
      <div className="section-divider"><span>故障转移与高可用</span></div>

      <h3>故障转移模式</h3>
      <table>
        <thead><tr><th>模式</th><th>描述</th><th>恢复时间</th><th>适用场景</th></tr></thead>
        <tbody>
          <tr><td><strong>Active-Passive</strong></td><td>主 Router + 备用 Router，主故障时切换</td><td>秒级</td><td>小规模部署</td></tr>
          <tr><td><strong>Active-Active</strong></td><td>多个 Router 同时服务，任一故障不影响</td><td>无感知</td><td>大规模集群</td></tr>
          <tr><td><strong>客户端重试</strong></td><td>Router 不可用时客户端自动重试其他 Router</td><td>毫秒级</td><td>SDK 集成</td></tr>
          <tr><td><strong>DNS 轮询</strong></td><td>DNS 返回多个 Router IP，客户端自动切换</td><td>DNS TTL 级</td><td>简单部署</td></tr>
        </tbody>
      </table>

      <h3>Worker 故障处理</h3>
      <MermaidDiagram chart={`
sequenceDiagram
    participant C as Client
    participant R as Router
    participant W1 as Worker 1 (健康)
    participant W2 as Worker 2 (故障)

    C->>R: POST /v1/completions
    R->>R: 路由到 Worker 2
    R->>W2: 转发请求
    W2--xR: 超时/连接拒绝
    R->>R: 标记 Worker 2 为不可用
    R->>R: 选择新 Worker (Worker 1)
    R->>W1: 重试请求
    W1-->>R: 200 OK
    R-->>C: 返回结果

    Note over R,W2: 后台健康检查恢复 Worker 2
    R->>W2: GET /health
    W2-->>R: 200 OK
    R->>R: 标记 Worker 2 为可用
      `} />

      {/* ==================== 6. 部署架构 ==================== */}
      <div className="section-divider"><span>部署架构</span></div>

      <h3>推荐部署拓扑</h3>
      <MermaidDiagram chart={`
graph TB
    subgraph LB["负载均衡层"]
        N["Nginx / Envoy<br/>SSL 终止 + 限流"]
    end

    subgraph Router["Router 层 (Active-Active)"]
        R1["sgl-router 1<br/>cache-aware"]
        R2["sgl-router 2<br/>cache-aware"]
    end

    subgraph Workers["推理 Worker 层"]
        subgraph Pool1["Pool A: Llama-3-70B"]
            W1["SGLang 1"]
            W2["SGLang 2"]
        end
        subgraph Pool2["Pool B: Qwen2-72B"]
            W3["vLLM 1"]
            W4["vLLM 2"]
        end
    end

    N --> R1
    N --> R2
    R1 --> Pool1
    R1 --> Pool2
    R2 --> Pool1
    R2 --> Pool2
      `} />

      <Callout type="warning">
        <strong>部署注意事项：</strong>
        <ul>
          <li><strong>前缀亲和性保持</strong>：使用 Active-Active Router 时，需确保相同前缀的请求路由到同一 Worker。可通过共享前缀映射表（Redis）实现</li>
          <li><strong>WebSocket 支持</strong>：流式响应需要 Router 支持 WebSocket 代理（大部分 LLM Router 支持 SSE）</li>
          <li><strong>超时配置</strong>：LLM 推理耗时可能很长（数十秒），Router 的超时时间需配置足够大（{'>= 300s'}）</li>
          <li><strong>健康检查间隔</strong>：过于频繁的检查会加重 Worker 负担，建议 5-10 秒间隔</li>
        </ul>
      </Callout>

      {/* ==================== 7. 框架选型建议 ==================== */}
      <div className="section-divider"><span>框架选型建议</span></div>

      <table>
        <thead><tr><th>场景</th><th>推荐方案</th><th>原因</th></tr></thead>
        <tbody>
          <tr><td><strong>SGLang 后端 + 多轮对话</strong></td><td>sgl-router (cache-aware)</td><td>前缀感知路由与 RadixAttention 天然配合</td></tr>
          <tr><td><strong>多 LLM 提供商统一接入</strong></td><td>LiteLLM Proxy</td><td>100+ 提供商支持，成本追踪，预算管理</td></tr>
          <tr><td><strong>多模态 + LLM 混合推理</strong></td><td>Triton Inference Server</td><td>通用推理平台，支持模型编排</td></tr>
          <tr><td><strong>简单多实例负载均衡</strong></td><td>Nginx / Envoy</td><td>成熟稳定，运维成本低</td></tr>
          <tr><td><strong>P/D 分离场景</strong></td><td>Mooncake Router</td><td>KV Cache 传输路由，拓扑感知</td></tr>
          <tr><td><strong>vLLM 后端</strong></td><td>Nginx + 自定义 Proxy</td><td>vLLM 无内置 Router，需外部方案</td></tr>
        </tbody>
      </table>

      <ResourceTable resources={[
        { name: 'sgl-router 源码', url: 'https://github.com/sgl-project/sglang/tree/main/sgl-router', desc: 'SGLang Router 完整源码，Rust 实现' },
        { name: 'sgl-router 文档', url: 'https://docs.sglang.io/advanced_features/router.html', desc: 'sgl-router 官方文档，路由策略详解' },
        { name: 'LiteLLM', url: 'https://github.com/BerriAI/litellm', desc: 'LLM API 代理/网关，100+ 提供商统一接入' },
        { name: 'Triton Inference Server', url: 'https://github.com/triton-inference-server/server', desc: 'NVIDIA 通用推理服务器，支持多模型编排' },
        { name: 'Mooncake', url: 'https://github.com/kvcache-ai/Mooncake', desc: '月之暗面 KV Cache 传输路由框架' },
        { name: 'HuggingFace TGI', url: 'https://github.com/huggingface/text-generation-inference', desc: 'TGI 内置 Router，Watermark 批处理' },
        { name: 'Envoy Proxy', url: 'https://github.com/envoyproxy/envoy', desc: '高性能 L7 代理，可自定义负载均衡' },
      ]} />
    </div>
  );
}