import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, CodeBlock, ResourceTable } from '../components/CodeBlock';

export function KVCacheComparePage() {
  return (
    <div className="prose max-w-none">
      <h1>SGLang vs vLLM KV Cache 机制对比</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-09</span>
        <span className="page-meta-item">⏱️ 阅读约 30 分钟</span>
        <span className="page-meta-item">🏷️ 对比 · KV Cache · P/D 分离</span>
      </div>
      <p>
        SGLang 和 vLLM 在 P/D 分离 KV Cache 传输上采用了<strong>截然不同的架构哲学</strong>：
        SGLang 使用 <strong>Push 模型</strong>（P 主动推送，D 被动接收），vLLM 使用 <strong>Connector 模型</strong>（P Save + D Load）。
        两种模型在"P 节点 KV Cache 过期释放、D 节点拉取"这一场景下的处理逻辑有本质差异。
      </p>

      {/* ==================== 1. 架构对比 ==================== */}
      <div className="section-divider"><span>架构对比</span></div>

      <h3>1.1 传输模型</h3>
      <MermaidDiagram maxWidth={680} chart={`
flowchart LR
    subgraph SGLANG["SGLang: Push 模型"]
        PS["P 节点"] -->|"send_kv_chunk()<br/>主动推送"| PD["D 节点"]
        PD -->|"KVPoll 状态回传"| PS
        PS -->|"仅 Success 后释放 KV"| PS_KV["释放 KV Cache"]
    end
    subgraph VLLM["vLLM: Connector 模型"]
        VP["P 节点"] -->|"save_kv_layer()<br/>逐层保存"| VCONN["Connector<br/>传输层"]
        VCONN -->|"start_load_kv()<br/>D 主动加载"| VD["D 节点"]
        VD -->|"get_num_new_matched_tokens()<br/>查询可用缓存"| VCONN
    end
      `} />

      <h3>1.2 核心差异一览</h3>
      <table>
        <thead><tr><th>维度</th><th>SGLang</th><th>vLLM</th></tr></thead>
        <tbody>
          <tr><td><strong>传输模型</strong></td><td>Push — P 主动推送 KV 到 D</td><td>Connector — P Save + D Load，双向</td></tr>
          <tr><td><strong>D 端角色</strong></td><td>被动接收，创建 Receiver</td><td>主动加载，查询 + 加载两步</td></tr>
          <tr><td><strong>P 端角色</strong></td><td>主动发送，创建 Sender</td><td>保存到 Connector，不关心 D 状态</td></tr>
          <tr><td><strong>KV 管理</strong></td><td>Radix Tree 前缀缓存</td><td>PagedAttention + Block Table</td></tr>
          <tr><td><strong>传输粒度</strong></td><td>逐 Chunk 推送</td><td>逐层（Layer-by-Layer）流水线</td></tr>
          <tr><td><strong>握手协议</strong></td><td>4 阶段：Bootstrap → Waiting → Inflight → 轮询确认</td><td>Handshake 元数据交换 + Scheduler/Worker 双层</td></tr>
          <tr><td><strong>传输后端</strong></td><td>5 种 (NIXL/Mooncake/Ascend/Mori/Fake)</td><td>9 种 Connector (NIXL/Mooncake/LMCache/FlexKV/...)</td></tr>
          <tr><td><strong>共识机制</strong></td><td><code>poll_and_all_reduce</code> 跨 TP rank MIN-reduce</td><td>Worker → Scheduler 反馈，<code>KVConnectorWorkerMetadata.aggregate()</code></td></tr>
        </tbody>
      </table>

      {/* ==================== 2. 核心问题：P 端 KV 过期，D 端拉取 ==================== */}
      <div className="section-divider"><span>核心问题：P 端 KV 过期，D 端拉取</span></div>

      <h3>2.1 问题场景</h3>
      <p>
        在 P/D 分离架构中，P 节点和 D 节点是独立的 GPU 实例。P 节点完成 prefill 后，KV Cache
        可能因以下原因在 D 节点加载前被释放：
      </p>
      <ul>
        <li><strong>内存压力</strong>：新请求到达触发 Block 淘汰</li>
        <li><strong>请求完成</strong>：P 端完成 prefill 后立即释放</li>
        <li><strong>节点故障</strong>：P 节点崩溃导致所有 KV Cache 丢失</li>
        <li><strong>网络延迟</strong>：D 端查询时 KV 还在，加载时已被淘汰</li>
      </ul>

      <Callout type="warning">
        <strong>关键差异：SGLang 从架构上消除了竞态窗口，vLLM 则通过 Recompute 兜底。</strong>
      </Callout>

      <h3>2.2 SGLang 处理逻辑</h3>
      <MermaidDiagram maxWidth={680} chart={`
flowchart TB
    START(["P 端生成 KV Cache"]) --> SEND["send_kv_chunk()<br/>推送到 D 端"]
    SEND --> POLL["poll_and_all_reduce()<br/>跨 TP rank 共识"]
    POLL --> RESULT{"轮询结果?"}

    RESULT -->|"KVPoll.Success"| RELEASE["release_kv_cache()<br/>✅ 释放 KV，传输完成"]
    RESULT -->|"KVPoll.Failed"| FAIL_P["handle_inflight_transfer_failure()<br/>❌ 双方 abort，请求终止"]
    RESULT -->|"KVPoll.Transferring"| SEND

    D_ABORT["D 端主动 abort<br/>(P 可能仍在写入)"] --> DEFER["Deferred KV Release<br/>加入 _deferred_releases 队列"]
    DEFER --> DRAIN{"is_abort_release_safe?"}
    DRAIN -->|"✅ ack 排空"| RELEASE
    DRAIN -->|"❌ 超时"| WARN["⚠️ warning + 强制释放"]
    WARN --> RELEASE

    P_ABORT["P 端主动 abort<br/>(P 已停止写入)"] --> IMMED["立即 release_kv_cache()<br/>is_insert=False"]

    style RELEASE fill:#2e7d32,color:#fff
    style FAIL_P fill:#c62828,color:#fff
    style WARN fill:#e65100,color:#fff
      `} />

      <p><strong>SGLang 的核心安全保障：</strong></p>
      <ol>
        <li><strong>Push 模型消除竞态</strong>：P 主动推送，P 在确认 D 接收成功后才释放 KV。D 从不"拉取"，不存在"D 拉取时 P 已释放"的窗口。</li>
        <li><strong>Success 后才释放</strong>：KV 在 <code>poll_and_all_reduce</code> 跨所有 TP rank 返回 <code>KVPoll.Success</code> 后才释放，任何 rank 失败都会 abort。</li>
        <li><strong>Deferred KV Release</strong>：D 端发起 abort 时，如果 P 可能仍在写入，KV 页被延迟释放，直到 <code>is_abort_release_safe(room, required_acks)</code> 确认所有 P 端 rank 的写入 ack 已排空，或超时后强制释放（打 warning）。</li>
        <li><strong>引用计数保护</strong>：Radix Tree 节点被活跃请求引用时 <code>lock_ref &gt; 0</code>，不会被淘汰。</li>
      </ol>

      <CodeBlock language="python" title="SGLang: 关键代码路径 (prefill.py + decode.py)" code={`# ===== P 端 (prefill.py) =====
# KV 仅在 Success 后释放
elif poll == KVPoll.Success:
    release_kv_cache(req, self.tree_cache)  # 解锁 Radix Tree
    req.disagg_kv_sender.clear()
    maybe_release_metadata_buffer(req)

# ===== D 端 (decode.py) =====
# 传输失败 + D 端发起 abort → 延迟释放
if (self.enable_deferred_kv_release
    and decode_req.kv_receiver.abort_notified):
    # P 端可能还在写这些页，延迟释放
    self._defer_release(decode_req)
else:
    # P 端发起 abort → 立即释放
    release_kv_cache(decode_req.req, self.tree_cache, is_insert=False)

# resolve_deferred_releases() 在每次调度循环中调用
# 等待 ack 排空或超时
drained = kv_mgr.is_abort_release_safe(room, required_acks)
if not drained and now < deadline:
    still_held.append(...)  # 继续等待
else:
    if not drained:
        logger.warning("Deferred KV release ... timed out ... releasing anyway")
    self._do_release(decode_req, idx)`} />

      <h3>2.3 vLLM 处理逻辑</h3>
      <MermaidDiagram maxWidth={680} chart={`
flowchart TB
    START(["D 端请求到达"]) --> QUERY["get_num_new_matched_tokens()<br/>查询可用远程缓存"]
    QUERY --> CHECK{"返回值?"}
    CHECK -->|"返回 0"| LOCAL["无远程缓存<br/>本地计算"]
    CHECK -->|"返回 > 0"| ASYNC{"load_kv_async?"}

    ASYNC -->|"是"| ALLOC["分配 Block<br/>delay_cache_blocks=True"]
    ALLOC --> WAIT["WAITING_FOR_REMOTE_KVS"]
    WAIT --> LOAD["Worker 逐层加载 KV"]

    ASYNC -->|"否"| SYNC_LOAD["同步加载"]
    SYNC_LOAD --> RUNNING

    LOAD --> RESULT{"加载结果?"}
    RESULT -->|"成功"| RUNNING["进入 RUNNING"]
    RESULT -->|"部分 Block 失败"| INVALID["invalid_block_ids<br/>上报调度器"]

    INVALID --> POLICY{"kv_load_failure_policy?"}
    POLICY -->|"recompute (默认)"| ROLLBACK["回退 num_computed_tokens<br/>触发重新计算"]
    POLICY -->|"fail"| ABORT["abort 请求"]

    ROLLBACK --> RUNNING

    style INVALID fill:#e65100,color:#fff
    style ROLLBACK fill:#2e7d32,color:#fff
    style ABORT fill:#c62828,color:#fff
      `} />

      <p><strong>vLLM 的处理策略：</strong></p>
      <ol>
        <li><strong>查询时检查</strong>：<code>get_num_new_matched_tokens()</code> 只返回<strong>当前实际可用</strong>的缓存 token 数。如果 KV 已被释放，返回 0 或更少。<em>"The connector should only consider the largest prefix of prompt-tokens for which KV cache is actually available at the time of the call."</em></li>
        <li><strong>竞态窗口存在</strong>：D 端查询到 D 端加载之间，P 端 KV 可能被淘汰。vLLM 承认这个窗口存在，通过 <strong>invalid_block_ids + Recompute</strong> 兜底。</li>
        <li><strong>失效 Block 检测</strong>：Worker 端 <code>get_block_ids_with_load_errors()</code> 返回加载失败的 Block ID。调度器 <code>_handle_invalid_blocks()</code> 处理：回退 <code>num_computed_tokens</code> 到第一个有效 Block 位置，触发重新计算。</li>
        <li><strong>重算而非重试</strong>：vLLM 不重试失败的 KV 加载（因为 P 端 KV 可能已永久丢失），而是直接回退到有效位置重新计算。这是与 SGLang abort 策略的根本区别。</li>
        <li><strong>同步 vs 异步加载</strong>：异步加载的请求 Block 尚未缓存（<code>evict_blocks=False</code>），失败后标记为 <code>failed_recving_kv_req_ids</code>；同步加载的请求 Block 已缓存，失败后需要 <code>evict_blocks</code> 清理无效 Block。</li>
      </ol>

      <CodeBlock language="python" title="vLLM: 关键代码路径 (scheduler.py)" code={`# ===== D 端调度器 =====
# 1. 查询可用缓存
ext_tokens, load_kv_async = self.connector.get_num_new_matched_tokens(
    request, num_new_local_computed_tokens
)
# 若 ext_tokens is None: 连接器需要更多时间，稍后重试

# 2. 异步加载: 进入 WAITING_FOR_REMOTE_KVS 状态
if load_kv_async:
    request.status = RequestStatus.WAITING_FOR_REMOTE_KVS
    # Block 已分配但 delay_cache_blocks=True

# 3. Worker 加载失败 → 上报 invalid_block_ids
# _handle_invalid_blocks() 处理:
async_failed_req_ids, num_failed_tokens, _ = (
    self._update_requests_with_invalid_blocks(
        async_load_reqs, invalid_block_ids, ...,
        evict_blocks=False  # 异步加载的 Block 尚未缓存
    )
)

# 4. 回退 num_computed_tokens 到第一个有效 Block
# "Truncate the computed tokens at the first failed block"
request.num_computed_tokens = idx * self.block_size

# 5. kv_load_failure_policy 决定最终行为
if self.recompute_kv_load_failures:
    # 默认: 重新计算失效 Block
    logger.warning("Recovered from KV load failure: ...")
else:
    # 配置为 fail: 直接 abort
    logger.error("Failing %d request(s) due to KV load failure ...")`} />

      {/* ==================== 3. 场景对比 ==================== */}
      <div className="section-divider"><span>场景对比</span></div>

      <h3>3.1 同一场景的两条路径</h3>
      <MermaidDiagram maxWidth={680} chart={`
sequenceDiagram
    participant P as P 节点
    participant D as D 节点

    Note over P,D: === SGLang: Push 模型，无竞态窗口 ===
    P->>D: send_kv_chunk(last_chunk=True) 推送 KV
    D->>P: KVPoll 状态回传
    P->>P: poll_and_all_reduce → Success
    P->>P: release_kv_cache() ✅ 释放

    Note over P,D: ❌ D 端不会遇到"拉取已释放 KV"的场景
    Note over P,D: 因为 D 从不主动拉取，P 在 Success 后才释放

    Note over P,D: === vLLM: Connector 模型，存在竞态窗口 ===
    D->>P: get_num_new_matched_tokens() → 返回 100 tokens
    Note over P: ⚠️ 此时 P 端内存压力，淘汰了 Block 5-7
    D->>P: start_load_kv(block_ids=[0..9])
    P-->>D: Block 5-7 加载失败！
    D->>D: invalid_block_ids → num_computed_tokens 回退
    D->>D: 🔄 重新计算 Block 5-7 对应的 tokens
      `} />

      <h3>3.2 逐场景对比</h3>
      <table>
        <thead><tr><th>场景</th><th>SGLang</th><th>vLLM</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>正常传输</strong></td>
            <td>P 推送 → poll → Success → P 释放 KV</td>
            <td>P Save → D Load → Transfer 完成 → D 进入 RUNNING</td>
          </tr>
          <tr>
            <td><strong>P 端 KV 在传输前被淘汰</strong></td>
            <td>Optimistic retry + 重新入队，或直接 <code>KVPoll.Failed</code></td>
            <td><code>get_num_new_matched_tokens()</code> 返回 0 → 本地计算</td>
          </tr>
          <tr>
            <td><strong>传输中 P 端 KV 不可用</strong></td>
            <td>底层 RDMA 报错 → <code>KVPoll.Failed</code> → abort</td>
            <td><code>invalid_block_ids</code> → 回退重算</td>
          </tr>
          <tr>
            <td><strong>D 端 abort 但 P 端正写入</strong></td>
            <td><strong>Deferred KV Release</strong>：等 ack 排空或超时</td>
            <td><strong>delay_free_blocks</strong>：等待 Connector 完成</td>
          </tr>
          <tr>
            <td><strong>P 端 abort</strong></td>
            <td>立即 <code>release_kv_cache(is_insert=False)</code></td>
            <td>P 端停止写入，D 端检测到后走 recompute 或 abort</td>
          </tr>
          <tr>
            <td><strong>网络分区 / P 节点故障</strong></td>
            <td>Bootstrap 失败或 Transfer 超时 → abort</td>
            <td><code>get_num_new_matched_tokens()</code> 返回 None → 重试后 abort</td>
          </tr>
          <tr>
            <td><strong>KV 被其他请求淘汰</strong></td>
            <td><code>lock_ref</code> 引用计数保护，不会淘汰活跃请求</td>
            <td>PagedAttention Block 可能被 LRU 淘汰，触发 recompute</td>
          </tr>
        </tbody>
      </table>

      {/* ==================== 4. 设计哲学对比 ==================== */}
      <div className="section-divider"><span>设计哲学对比</span></div>

      <h3>4.1 安全 vs 灵活</h3>
      <table>
        <thead><tr><th>维度</th><th>SGLang (安全优先)</th><th>vLLM (灵活优先)</th></tr></thead>
        <tbody>
          <tr><td><strong>竞态处理</strong></td><td>从架构上消除竞态窗口</td><td>接受竞态，通过 Recompute 兜底</td></tr>
          <tr><td><strong>KV 释放时机</strong></td><td>仅在跨 rank 共识 Success 后</td><td>P 端独立决策，不等待 D 端确认</td></tr>
          <tr><td><strong>失败恢复</strong></td><td>Abort + 重新调度（让客户端重试）</td><td>Recompute 失效 Block（框架内部恢复）</td></tr>
          <tr><td><strong>传输后端</strong></td><td>5 种，Mooncake 故障恢复最强</td><td>9 种，可插拔 Connector 生态</td></tr>
          <tr><td><strong>P/D 耦合度</strong></td><td>紧耦合：P 和 D 通过 KVPoll 实时同步</td><td>松耦合：P 和 D 通过 Connector 异步交互</td></tr>
          <tr><td><strong>网络依赖</strong></td><td>高：需要稳定的双向通信</td><td>中：Connector 可缓冲，容忍短暂中断</td></tr>
          <tr><td><strong>重算开销</strong></td><td>无重算（失败直接 abort）</td><td>有重算（recompute 模式）或 abort（fail 模式）</td></tr>
        </tbody>
      </table>

      <h3>4.2 延迟释放机制对比</h3>
      <table>
        <thead><tr><th>维度</th><th>SGLang Deferred KV Release</th><th>vLLM delay_free_blocks</th></tr></thead>
        <tbody>
          <tr><td><strong>触发条件</strong></td><td>D 端 abort + <code>abort_notified</code> + P 可能仍在写入</td><td>请求在 <code>WAITING_FOR_REMOTE_KVS</code> 状态 + 未完成接收</td></tr>
          <tr><td><strong>释放条件</strong></td><td><code>is_abort_release_safe(room, required_acks)</code> 或超时</td><td><code>finished_recving_kv_req_ids</code> 中包含该请求</td></tr>
          <tr><td><strong>安全保证</strong></td><td>等待所有 P 端 rank 的写入 ack 排空</td><td>等待 Connector 确认异步接收完成</td></tr>
          <tr><td><strong>超时行为</strong></td><td>打 warning + 强制释放</td><td>无超时：等待 Connector 明确通知</td></tr>
          <tr><td><strong>适用场景</strong></td><td>D 端主动 abort（如客户端断开）</td><td>请求完成/abort 但 KV 异步传输未完成</td></tr>
        </tbody>
      </table>

      {/* ==================== 5. 总结 ==================== */}
      <div className="section-divider"><span>总结</span></div>

      <Callout type="tip">
        <strong>当 P 节点 KV Cache 过期释放了，D 节点又去拉取：</strong>
        <br/><br/>
        <strong>SGLang：这个场景不会发生。</strong>因为 SGLang 采用 Push 模型，D 节点从不主动拉取 KV。
        P 节点在通过 <code>poll_and_all_reduce</code> 跨所有 TP rank 确认 <code>KVPoll.Success</code> 之后才释放 KV。
        如果传输失败（<code>KVPoll.Failed</code>），双方同时 abort，请求重新调度。
        如果 D 端主动 abort 但 P 端可能仍在写入，使用 Deferred KV Release 延迟释放直到 ack 排空或超时。
        <br/><br/>
        <strong>vLLM：这个场景会发生，通过 Recompute 兜底。</strong>因为 vLLM 的 Connector 模型中，
        D 端先查询（<code>get_num_new_matched_tokens</code>）再加载（<code>start_load_kv</code>），
        查询和加载之间存在竞态窗口。当加载时发现 Block 已失效，Worker 上报 <code>invalid_block_ids</code>，
        调度器回退 <code>num_computed_tokens</code> 到有效位置，触发重新计算。
        默认的 <code>kv_load_failure_policy="recompute"</code> 使框架内部透明恢复，对客户端无感知。
        也可配置为 <code>"fail"</code> 直接 abort。
      </Callout>

      <MermaidDiagram maxWidth={680} chart={`
flowchart LR
    subgraph SGLANG_PATH["SGLang 路径"]
        A1["P 推送 KV"] --> A2["poll_and_all_reduce"]
        A2 --> A3["Success → 释放 KV"]
        A2 --> A4["Failed → abort"]
        A4 --> A5["D 端 abort: Deferred Release"]
        A4 --> A6["P 端 abort: 立即释放"]
    end
    subgraph VLLM_PATH["vLLM 路径"]
        B1["D 查询 KV"] --> B2["D 加载 KV"]
        B2 --> B3["成功 → RUNNING"]
        B2 --> B4["Block 失效 → invalid_block_ids"]
        B4 --> B5["回退 num_computed_tokens"]
        B5 --> B6["Recompute (默认) / abort (fail)"]
    end
    A1 -.->|"架构差异"| B1

    style A3 fill:#2e7d32,color:#fff
    style A4 fill:#c62828,color:#fff
    style B3 fill:#2e7d32,color:#fff
    style B4 fill:#e65100,color:#fff
    style B6 fill:#2e7d32,color:#fff
      `} />

      <ResourceTable resources={[
        { name: 'SGLang KV Cache 机制', url: '/sglang-kv-cache', desc: 'SGLang RadixAttention + Push 模型 KV 传输详细分析' },
        { name: 'vLLM KV Cache 机制', url: '/vllm-kv-cache', desc: 'vLLM PagedAttention + Connector 模型 KV 传输详细分析' },
        { name: 'SGLang prefill.py', url: 'https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/disaggregation/prefill.py', desc: 'P 端 KV 传输实现，含 inflight 队列和 KVPoll 处理' },
        { name: 'SGLang decode.py', url: 'https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/disaggregation/decode.py', desc: 'D 端 KV 接收实现，含 Deferred KV Release' },
        { name: 'vLLM V1 Scheduler', url: 'https://github.com/vllm-project/vllm/blob/main/vllm/v1/core/sched/scheduler.py', desc: 'V1 调度器，含 _handle_invalid_blocks 和 recompute 逻辑' },
        { name: 'vLLM KVConnector Base', url: 'https://github.com/vllm-project/vllm/blob/main/vllm/distributed/kv_transfer/kv_connector/v1/base.py', desc: 'KVConnector 基类，含完整接口定义' },
        { name: 'PagedAttention 论文', url: 'https://arxiv.org/abs/2309.06180', desc: 'vLLM PagedAttention 原始论文 (SOSP 2023)' },
        { name: 'SGLang GitHub', url: 'https://github.com/sgl-project/sglang', desc: 'SGLang 官方仓库' },
      ]} />
    </div>
  );
}