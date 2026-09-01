import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, CodeBlock, ResourceTable } from '../components/CodeBlock';

export function VLLMKVCachePage() {
  return (
    <div className="prose max-w-none">
      <h1>vLLM KV Cache 机制</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-09</span>
        <span className="page-meta-item">⏱️ 阅读约 25 分钟</span>
        <span className="page-meta-item">🏷️ vLLM · KV Cache · P/D 分离</span>
      </div>
      <p>
        vLLM 的 KV Cache 机制由 <strong>PagedAttention</strong>、<strong>KVConnector 抽象层</strong>、
        <strong>V1 调度器重构</strong> 三大支柱构成。其中 P/D 分离场景下的 KV 传输采用
        <strong>连接器（Connector）模式</strong>，与 SGLang 的 Push 模型有本质区别。
      </p>

      {/* ==================== 1. PagedAttention ==================== */}
      <div className="section-divider"><span>PagedAttention 分页管理</span></div>

      <h3>1.1 核心思想</h3>
      <p>
        vLLM 的 PagedAttention 将 KV Cache 划分为固定大小的 <strong>Block</strong>（类似 OS 的虚拟内存页），
        通过页表映射实现非连续物理存储、逻辑连续访问。这是 vLLM 最核心的创新，解决了 KV Cache 的
        <strong>碎片化</strong>和<strong>内存浪费</strong>问题。
      </p>

      <MermaidDiagram maxWidth={480} chart={`
flowchart TB
    subgraph LOGICAL["逻辑视图（请求视角）"]
        L1["Token 0: KV"]
        L2["Token 1: KV"]
        L3["Token 2: KV"]
        L4["Token 3: KV"]
        L5["Token 4: KV"]
        L1 --> L2 --> L3 --> L4 --> L5
    end
    subgraph PHYSICAL["物理存储（GPU 显存）"]
        B0["Block 0<br/>(Token 0,1)"]
        B3["Block 3<br/>(Token 2,3)"]
        B7["Block 7<br/>(Token 4,?)"]
    end
    subgraph TABLE["页表映射"]
        PT["Block Table<br/>[0, 3, 7]"]
    end
    LOGICAL --> TABLE
    TABLE --> PHYSICAL
      `} />

      <h3>1.2 Block 管理</h3>
      <CodeBlock language="python" title="PagedAttention Block 管理" code={`class BlockTable:
    """每个请求维护一个 Block Table，记录逻辑位置到物理 Block 的映射"""
    block_ids: list[int]  # 物理 Block ID 列表

class BlockAllocator:
    """全局 Block 分配器，管理自由 Block 池"""
    free_blocks: list[int]   # 空闲 Block 列表
    block_size: int          # 每个 Block 的 token 数（默认 16）

    def allocate(self) -> int:
        """分配一个 Block，返回物理 Block ID"""
        return self.free_blocks.pop()

    def free(self, block_id: int):
        """释放 Block 回自由池"""
        self.free_blocks.append(block_id)

class CacheManager:
    """KV Cache 管理器，协调分配和前缀匹配"""
    def get_computed_blocks(self, request) -> tuple[list[int], int]:
        """返回已缓存的 Block 列表和共享前缀边界"""
        # 1. 前缀匹配: 查找与历史请求共享的 token 前缀
        # 2. 返回已缓存的 block_ids 和 shared_prefix_boundary`} />

      <Callout type="info">
        <strong>PagedAttention 的优势：</strong>
        <ul>
          <li><strong>零碎片</strong>：Block 固定大小，不存在外部碎片</li>
          <li><strong>按需分配</strong>：只分配实际使用的 Block，内存利用率从 ~20% 提升到 ~80%</li>
          <li><strong>灵活共享</strong>：多个请求可通过 Block Table 共享相同物理 Block（如相同前缀）</li>
          <li><strong>Copy-on-Write</strong>：共享 Block 写入时触发复制，保护其他请求的数据</li>
        </ul>
      </Callout>

      {/* ==================== 2. P/D 分离 KV 传输 ==================== */}
      <div className="section-divider"><span>P/D 分离 KV 传输</span></div>

      <h3>2.1 核心架构：Connector 模式</h3>
      <p>
        vLLM 的 P/D 分离采用 <strong>Connector 模式</strong>——P 和 D 各自运行完整的 vLLM 实例，
        通过可插拔的 KVConnector 在两者间传输 KV Cache。与 SGLang 的 Push 模型不同，
        vLLM 的设计是 <strong>双向 Connector</strong>：P 端 Save（保存），D 端 Load（加载）。
      </p>

      <Callout type="warning">
        <strong>vLLM vs SGLang 架构差异：</strong>
        <ul>
          <li><strong>SGLang</strong>：P 端主动 Push → D 端被动接收。P 在确认 D 接收成功后才释放 KV。不存在"D 拉取已释放 KV"的竞态。</li>
          <li><strong>vLLM</strong>：P 端 Save KV → D 端 Load KV。D 端通过 Connector 主动查询和加载远程 KV。
          存在 <strong>"D 端 Load 时 P 端 KV 已释放"的潜在竞态</strong>，需要专门的失效处理机制。</li>
        </ul>
      </Callout>

      <h3>2.2 双层 Connector 架构</h3>
      <MermaidDiagram maxWidth={680} chart={`
flowchart TB
    subgraph P_INSTANCE["P 端 vLLM 实例"]
        PS["SchedulerConnector<br/>(SCHEDULER 角色)"]
        PW["WorkerConnector<br/>(WORKER 角色)"]
        PS -->|"build_connector_meta()"| PW
    end

    subgraph D_INSTANCE["D 端 vLLM 实例"]
        DS["SchedulerConnector<br/>(SCHEDULER 角色)"]
        DW["WorkerConnector<br/>(WORKER 角色)"]
        DS -->|"build_connector_meta()"| DW
    end

    subgraph TRANSFER["传输层"]
        NIXL["NIXL / Mooncake<br/>RDMA / TCP"]
    end

    PW -->|"save_kv_layer()<br/>逐层保存"| TRANSFER
    TRANSFER -->|"start_load_kv()<br/>逐层加载"| DW
    DW -->|"build_connector_worker_meta()"| DS
    PS <-->|"握手元数据<br/>get_handshake_metadata()"| DS
      `} />

      <h3>2.3 逐层传输协议</h3>
      <p>
        vLLM 的 KV 传输是 <strong>逐层（Layer-by-Layer）</strong>的流水线：
      </p>
      <ol>
        <li><strong>P 端</strong>：每层 Attention 计算完后，<code>save_kv_layer(layer_name, kv_layer)</code> 异步保存该层 KV</li>
        <li><strong>D 端</strong>：<code>start_load_kv()</code> 启动异步加载，<code>wait_for_layer_load(layer_name)</code> 在每层 Attention 前阻塞等待该层 KV 就绪</li>
        <li><strong>P 端</strong>：<code>wait_for_save()</code> 在 forward 结束时阻塞等待所有保存操作完成，防止 KV buffer 被覆盖</li>
      </ol>

      <CodeBlock language="python" title="vLLM 逐层传输流程" code={`# ===== P 端 Worker =====
def forward(self, batch):
    for layer_name, layer in self.model.layers():
        # 1. Attention 计算
        kv_layer = layer.attention(q, k, v)

        # 2. 异步保存当前层 KV 到 Connector
        self.connector.save_kv_layer(layer_name, kv_layer, attn_metadata)

    # 3. Forward 结束后，等待所有保存完成
    self.connector.wait_for_save()  # 防止 KV buffer 被覆盖

# ===== D 端 Worker =====
def forward(self, batch):
    # 1. 启动异步 KV 加载
    self.connector.start_load_kv(forward_context)

    for layer_name, layer in self.model.layers():
        # 2. 阻塞等待当前层 KV 就绪
        self.connector.wait_for_layer_load(layer_name)

        # 3. 使用已加载的 KV 执行 Attention
        output = layer.attention(q, k, v, kv_cache=loaded_kv)

    # 4. 清理
    self.connector.clear_connector_metadata()`} />

      <h3>2.4 请求状态机</h3>
      <MermaidDiagram maxWidth={680} chart={`
stateDiagram-v2
    [*] --> WAITING: 请求到达 D 端
    WAITING --> PREFIX_CHECK: 调度器检查缓存
    PREFIX_CHECK --> WAITING_FOR_REMOTE_KVS: 远程 KV 命中 (async)
    PREFIX_CHECK --> RUNNING: 本地缓存命中
    PREFIX_CHECK --> WAITING: 无缓存命中

    WAITING_FOR_REMOTE_KVS --> RUNNING: load 成功
    WAITING_FOR_REMOTE_KVS --> RECOMPUTE: load 失败
    RECOMPUTE --> RUNNING: 重新计算
    RUNNING --> [*]: 请求完成

    note right of WAITING_FOR_REMOTE_KVS
        Block 已分配 (delay_cache_blocks=True)
        num_new_tokens=0 (不做 forward)
        等待外部 KV 加载完成
    end note

    note right of RECOMPUTE
        invalid_block_ids 标记失败 Block
        num_computed_tokens 回退到有效位置
        重新调度计算
    end note
      `} />

      {/* ==================== 3. 过期/释放场景处理 ==================== */}
      <div className="section-divider"><span>过期/释放场景处理</span></div>

      <h3>3.1 核心问题：D 端 Load 时 P 端 KV 已被释放</h3>
      <p>
        这是 vLLM Connector 模式面临的<strong>核心挑战</strong>。由于 P 端和 D 端是独立的 vLLM 实例，
        P 端的 KV Cache 可能因以下原因在 D 端 Load 前被释放：
      </p>
      <ul>
        <li><strong>P 端内存压力</strong>：新请求到达触发 Block 淘汰，释放了 D 端尚未加载的 KV</li>
        <li><strong>P 端请求完成</strong>：P 端完成 prefill 后立即释放 KV（如果未配置 save 策略）</li>
        <li><strong>P 端崩溃/重启</strong>：P 节点故障导致所有 KV Cache 丢失</li>
        <li><strong>网络延迟</strong>：D 端查询时 P 端 KV 还在，但实际 Load 时已被淘汰</li>
      </ul>

      <h3>3.2 多层防护机制</h3>

      <table>
        <thead><tr><th>防护层</th><th>机制</th><th>触发时机</th><th>处理逻辑</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>L1: 查询时检查</strong></td>
            <td><code>get_num_new_matched_tokens()</code></td>
            <td>D 端调度器每次调度前</td>
            <td>Connector 只返回<strong>当前实际可用的</strong>缓存 token 数。如果 KV 已被释放，返回 0 或更少</td>
          </tr>
          <tr>
            <td><strong>L2: 异步加载失败</strong></td>
            <td><code>invalid_block_ids</code></td>
            <td>Worker 加载 KV 时</td>
            <td>加载失败的 Block ID 通过 <code>get_block_ids_with_load_errors()</code> 返回给调度器</td>
          </tr>
          <tr>
            <td><strong>L3: 失效 Block 重建</strong></td>
            <td><code>_handle_invalid_blocks()</code></td>
            <td>调度器收到失败 Block 后</td>
            <td>回退 <code>num_computed_tokens</code>，触发<strong>重新计算</strong>失效 Block</td>
          </tr>
          <tr>
            <td><strong>L4: 延迟 Block 释放</strong></td>
            <td><code>defer_block_free</code></td>
            <td>P 端 KV 消费场景</td>
            <td>使用 Fence 序列号延迟释放 Block，等待写入完成</td>
          </tr>
          <tr>
            <td><strong>L5: Block 零化竞争保护</strong></td>
            <td><code>_skip_zero_block_ids</code></td>
            <td>KV 异步加载时</td>
            <td>跳过异步加载目标 Block 的零化操作，防止零化与写入竞争</td>
          </tr>
        </tbody>
      </table>

      <h3>3.3 失效 Block 检测与重建（核心机制）</h3>
      <p>
        当 D 端 Worker 尝试加载 KV 但发现 Block 数据不可用时：
      </p>

      <CodeBlock language="python" title="vLLM V1: 失效 Block 处理流程" code={`# ===== 调度器端 =====
class Scheduler:
    finished_recving_kv_req_ids: set[str]   # 传输成功的请求
    failed_recving_kv_req_ids: set[str]      # 传输失败的请求
    recompute_kv_load_failures: bool         # 配置项: 失败时是否重新计算

    def _handle_invalid_blocks(self, kv_connector_output):
        """处理 Worker 上报的失效 Block"""
        for block_id in kv_connector_output.invalid_block_ids:
            # 1. 找到受影响的请求
            affected_req = self._find_request_by_block(block_id)

            # 2. 回退 computed_tokens 到有效位置
            # "These blocks contain externally computed tokens that failed to load"
            affected_req.num_computed_tokens = self._last_valid_position(affected_req)

            # 3. 标记失败
            self.failed_recving_kv_req_ids.add(affected_req.request_id)

        if self.recompute_kv_load_failures:
            # 4. 重新调度: 从 num_computed_tokens 位置重新计算
            self._reschedule_for_recompute(affected_req)

# ===== Worker 端 =====
class KVConnectorWorker:
    def start_load_kv(self, forward_context):
        for block_id in self.pending_loads:
            try:
                self._load_block_from_remote(block_id)
            except LoadFailure:
                # 标记失效 Block，返回给调度器
                self._failed_blocks.add(block_id)

    def get_block_ids_with_load_errors(self) -> set[int]:
        """返回加载失败的 Block ID，调度器据此触发重建"""
        return self._failed_blocks`} />

      <Callout type="tip">
        <strong>关键设计：重算而非重试</strong><br/>
        vLLM 不重试失败的 KV 加载（因为 P 端 KV 可能已永久丢失），而是直接
        <strong>回退到有效位置重新计算</strong>。这是与 SGLang 的根本区别：
        <ul>
          <li><strong>SGLang</strong>：Push 模型，KV 只在传输成功后释放 → 不重试，直接 abort</li>
          <li><strong>vLLM</strong>：Connector 模型，KV 可能已释放 → 重算（Recompute）而非重试</li>
        </ul>
      </Callout>

      <h3>3.4 延迟 Block 释放（Fence 机制）</h3>
      <p>
        vLLM V1 引入了 <strong>Fence 序列号</strong>机制来解决"D 端正在 Load 但 P 端已释放 Block"的竞态：
      </p>

      <CodeBlock language="python" title="vLLM V1: Fence 延迟释放机制" code={`class Scheduler:
    deferred_frees: deque[tuple[int, list[int]]]  # (fence_seq, block_ids)
    sched_step_seq: int      # 每次调度递增
    processed_step_seq: int  # 每次结果处理递增

    def _free_blocks_deferred(self, block_ids: list[int]):
        """延迟释放 Block，等待消费者完成写入"""
        fence_seq = self.sched_step_seq
        self.deferred_frees.append((fence_seq, block_ids))

    def _process_deferred_frees(self):
        """处理延迟释放: 只释放安全的 Block"""
        while self.deferred_frees:
            fence_seq, block_ids = self.deferred_frees[0]
            if self.processed_step_seq >= fence_seq:
                # 安全: 所有在此之前调度的步骤已完成
                self.block_allocator.free_batch(block_ids)
                self.deferred_frees.popleft()
            else:
                break  # 不安全，等待

    # 触发条件: max_concurrent_batches > 1 且为 KV consumer
    # "a step may still be writing a freed request's KV blocks"
    # "a consumer KV Connector can reallocate and fill those blocks
    #  via a load that isn't ordered against that write"`} />

      <h3>3.5 抢占（Preemption）时的 KV 保护</h3>
      <p>
        当请求被抢占时，vLLM 有两层保护：
      </p>
      <ul>
        <li><strong>KV 交付保护</strong>：如果 Connector 的 <code>requires_kv_delivery=True</code>，
          抢占时使用 <code>drop_stale_output=True</code>——"pending KV hand-off...the preemption's block free would leave without valid KV"</li>
        <li><strong>Stale Output 排空</strong>：抢占后标记 <code>num_stale_output_tokens</code>，
          在后续步骤中逐步排空失效输出，确保 token 流的一致性</li>
      </ul>

      <MermaidDiagram maxWidth={680} chart={`
flowchart TB
    REQ["D 端请求调度"] --> CHECK{"get_num_new_matched_tokens()"}
    CHECK -->|"返回 > 0"| ASYNC{"load_kv_async?"}
    CHECK -->|"返回 0"| NOCACHE["无远程缓存<br/>本地计算"]

    ASYNC -->|"是"| ALLOC["分配 Block<br/>delay_cache_blocks=True"]
    ASYNC -->|"否"| SYNC["同步加载"]

    ALLOC --> WAIT["WAITING_FOR_REMOTE_KVS"]
    WAIT --> LOAD["Worker 逐层加载 KV"]

    LOAD --> RESULT{"加载结果?"}
    RESULT -->|"成功"| RUNNING["进入 RUNNING"]
    RESULT -->|"失败"| INVALID["invalid_block_ids<br/>上报调度器"]

    INVALID --> RECOMPUTE{"kv_load_failure_policy?"}
    RECOMPUTE -->|"recompute"| BACK["回退 num_computed_tokens<br/>重新计算"]
    RECOMPUTE -->|"其他"| ABORT["abort 请求"]

    BACK --> RUNNING
    SYNC --> RUNNING

    RUNNING --> DONE(["请求完成"])

    style INVALID fill:#e65100,color:#fff
    style RECOMPUTE fill:#e65100,color:#fff
    style BACK fill:#2e7d32,color:#fff
      `} />

      {/* ==================== 4. Connector 类型 ==================== */}
      <div className="section-divider"><span>Connector 类型</span></div>

      <h3>4.1 九种 KV Connector</h3>
      <table>
        <thead><tr><th>Connector</th><th>传输方式</th><th>关键特性</th></tr></thead>
        <tbody>
          <tr><td><strong>NixlConnector</strong></td><td>NVIDIA NIXL agent</td><td>全异步 send/recv，GPU Direct RDMA</td></tr>
          <tr><td><strong>MooncakeConnector</strong></td><td>Mooncake RDMA</td><td>基于会话的 RDMA，故障恢复最强</td></tr>
          <tr><td><strong>LMCacheConnectorV1</strong></td><td>LMCache 分布式缓存</td><td>远程 KV 存储，支持多节点共享</td></tr>
          <tr><td><strong>OffloadingConnector</strong></td><td>CPU 内存</td><td>KV 卸载到 CPU DRAM，减少 GPU 显存压力</td></tr>
          <tr><td><strong>FlexKVConnectorV1</strong></td><td>分布式 KV 存储</td><td>弹性 KV 存储，支持动态扩缩</td></tr>
          <tr><td><strong>MultiConnector</strong></td><td>多 Connector 链式</td><td>有序组合多个 Connector，如 L1→L2 缓存</td></tr>
          <tr><td><strong>ECConnector</strong></td><td>Encoder Cache</td><td>多模态模型编码器缓存传输</td></tr>
          <tr><td><strong>OffloadingConnectorV2</strong></td><td>CPU 内存 (V2)</td><td>改进的 KV 卸载策略</td></tr>
          <tr><td><strong>P2PConnectorV1</strong></td><td>P2P 直连</td><td>点对点 KV 传输</td></tr>
        </tbody>
      </table>

      <h3>4.2 NIXL Connector 详解</h3>
      <p>
        NIXL (NVIDIA In-Network Compute Library) 是 vLLM 默认推荐的 P/D 分离 Connector，通过
        <strong>GPU Direct RDMA</strong> 实现零拷贝 KV 传输。
      </p>

      <CodeBlock language="bash" title="vLLM P/D 分离启动" code={`# P 端 (Prefill)
vllm serve meta-llama/Llama-3-70B \\
  --disaggregation-role prefill \\
  --kv-transfer-config '{"backend":"nixl","port":12345}'

# D 端 (Decode)
vllm serve meta-llama/Llama-3-70B \\
  --disaggregation-role decode \\
  --kv-transfer-config '{"backend":"nixl","port":12345}'`} />

      {/* ==================== 5. 与 SGLang 对比 ==================== */}
      <div className="section-divider"><span>vLLM vs SGLang KV 传输对比</span></div>

      <h3>5.1 核心架构差异</h3>
      <table>
        <thead><tr><th>维度</th><th>vLLM</th><th>SGLang</th></tr></thead>
        <tbody>
          <tr><td><strong>传输模型</strong></td><td>Connector 模式（P Save + D Load）</td><td>Push 模型（P 主动推送）</td></tr>
          <tr><td><strong>KV 管理</strong></td><td>PagedAttention + Block Table</td><td>Radix Tree 前缀缓存</td></tr>
          <tr><td><strong>传输粒度</strong></td><td>逐层（Layer-by-Layer）流水线</td><td>逐 Chunk 推送</td></tr>
          <tr><td><strong>D 端查询</strong></td><td><code>get_num_new_matched_tokens()</code> 主动查询</td><td>Bootstrap 握手 + 被动接收</td></tr>
          <tr><td><strong>失效处理</strong></td><td>重算（Recompute）失效 Block</td><td>Abort + 重新调度</td></tr>
          <tr><td><strong>KV 释放安全</strong></td><td>Fence 延迟释放 + Deferred Block Free</td><td>Success 后才释放 + Deferred KV Release</td></tr>
          <tr><td><strong>竞态窗口</strong></td><td><strong>存在</strong>：D 查询到 D 加载之间</td><td><strong>不存在</strong>：Push 模型天然消除</td></tr>
          <tr><td><strong>Connector 数量</strong></td><td>9 种可插拔 Connector</td><td>5 种传输后端</td></tr>
          <tr><td><strong>抢占保护</strong></td><td>requires_kv_delivery + stale output</td><td>引用计数 + lock_ref 保护</td></tr>
        </tbody>
      </table>

      <h3>5.2 竞态窗口对比</h3>
      <MermaidDiagram maxWidth={680} chart={`
sequenceDiagram
    participant P as P 节点
    participant D as D 节点

    Note over P,D: === vLLM: 存在竞态窗口 ===
    D->>P: get_num_new_matched_tokens() → 返回 100
    Note over P: ⚠️ 此时 P 端内存压力，淘汰了 Block 5-7
    D->>P: start_load_kv(block_ids=[0..9])
    P-->>D: Block 5-7 加载失败！
    D->>D: invalid_block_ids → 回退重算

    Note over P,D: === SGLang: 无竞态窗口 ===
    P->>D: send_kv_chunk(last_chunk=True)
    D->>P: KVPoll 状态回传
    P->>P: 仅在 Success 后释放 KV
    Note over P: 不存在"D 加载时 KV 已释放"的时间窗口
      `} />

      <Callout type="warning">
        <strong>关键结论：</strong>
        <ul>
          <li><strong>vLLM</strong>：Connector 模式更灵活（9 种后端），但有 <strong>查询-加载竞态窗口</strong>。
          通过 <strong>invalid_block_ids + 重算</strong> 来兜底，代价是重算开销。</li>
          <li><strong>SGLang</strong>：Push 模型从架构上消除了竞态窗口，但灵活度略低（5 种后端）。
          通过 <strong>KVPoll 共识 + 延迟释放</strong> 保证正确性，代价是网络依赖更强。</li>
        </ul>
      </Callout>

      <ResourceTable resources={[
        { name: 'vLLM GitHub', url: 'https://github.com/vllm-project/vllm', desc: 'vLLM 官方仓库，PagedAttention 与 V1 调度器的完整实现' },
        { name: 'vLLM Disaggregated Prefilling 文档', url: 'https://docs.vllm.ai/en/latest/features/disagg_prefill.html', desc: 'vLLM P/D 分离的官方文档' },
        { name: 'vLLM KV Connector 源码', url: 'https://github.com/vllm-project/vllm/tree/main/vllm/distributed/kv_transfer', desc: 'KV Connector 实现，含 NIXL/Mooncake/LMCache 等' },
        { name: 'vLLM V1 Scheduler', url: 'https://github.com/vllm-project/vllm/blob/main/vllm/v1/core/sched/scheduler.py', desc: 'V1 调度器，含 P/D 分离完整状态机' },
        { name: 'PagedAttention (SOSP 2023)', url: 'https://arxiv.org/abs/2309.06180', desc: 'Efficient Memory Management for LLM Serving，vLLM 核心论文' },
        { name: 'SGLang KV Cache 机制', url: '/sglang-kv-cache', desc: 'SGLang RadixAttention + Push 模型 KV 传输机制' },
      ]} />
    </div>
  );
}