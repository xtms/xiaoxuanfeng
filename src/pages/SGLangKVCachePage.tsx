import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, CodeBlock, ResourceTable } from '../components/CodeBlock';

export function SGLangKVCachePage() {
  return (
    <div className="prose max-w-none">
      <h1>SGLang KV Cache 机制</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-09</span>
        <span className="page-meta-item">⏱️ 阅读约 25 分钟</span>
        <span className="page-meta-item">🏷️ SGLang · KV Cache · P/D 分离</span>
      </div>
      <p>
        SGLang 的 KV Cache 机制由 <strong>Radix Tree 前缀缓存</strong>、<strong>P/D 分离传输协议</strong>、
        <strong>HiCache 分层存储</strong> 三大支柱构成。其中 P/D 分离场景下的 KV 传输安全机制是其最精妙的设计之一。
      </p>

      {/* ==================== 1. Radix Tree 前缀缓存 ==================== */}
      <div className="section-divider"><span>Radix Tree 前缀缓存</span></div>

      <h3>1.1 为什么用 Radix Tree</h3>
      <p>
        SGLang 使用 <strong>Radix Tree（基数树）</strong>结构管理 KV Cache，自动检测和复用请求之间的共享前缀。
        与 vLLM 的 PagedAttention + 显式前缀缓存不同，Radix Tree 的共享前缀检测是<strong>全自动</strong>的，无需手动配置。
      </p>

      <MermaidDiagram chart={`
graph TB
    subgraph RT["Radix Tree 结构"]
        ROOT["Root"]
        N1[""The""]
        N2[""cat""]
        N3[""sat""]
        N4[""dog""]
        N5[""on""]
        N6[""the""]
        N7[""mat""]
        N8[""floor""]
    end

    ROOT --> N1
    N1 --> N2
    N2 --> N3
    N2 --> N4
    N3 --> N8
    N4 --> N5
    N5 --> N6
    N6 --> N7

    Q1[""请求1: The cat sat on the floor"" --> N8]
    Q2[""请求2: The dog sat on the mat"" --> N7]
    PREFIX[""共享前缀: The + sat on the""]
      `} />

      <Callout type="info">
        <strong>前缀匹配策略：</strong>SGLang 支持 <code>LPM</code>（Longest Prefix Match，最长前缀匹配）和
        <code>DFS_WEIGHT</code>（基于 Radix Tree 深度的带权调度）两种 Cache-Aware 调度策略，
        优先调度与缓存前缀匹配最长的请求，最大化缓存命中率。
      </Callout>

      <h3>1.2 Radix Tree 的 KV 管理</h3>
      <CodeBlock language="python" title="Radix Tree 核心操作" code={`class RadixTreeCache:
    """基于 Radix Tree 的 KV Cache 管理"""

    def match_prefix(self, token_ids: list[int]) -> tuple[int, TreeNode]:
        """最长前缀匹配 — O(prefix_len) 时间复杂度"""
        node = self.root
        matched_len = 0
        for i, tid in enumerate(token_ids):
            if tid not in node.children:
                break
            node = node.children[tid]
            matched_len = i + 1
        return matched_len, node

    def lock_ref(self, node: TreeNode, length: int):
        """增加引用计数，防止 eviction"""
        node.lock_ref += 1

    def unlock_ref(self, node: TreeNode):
        """减少引用计数"""
        node.lock_ref -= 1

    def evict(self, num_tokens: int) -> EvictResult:
        """叶子优先 + LRU/priority 淘汰"""
        # 1. 仅考虑 lock_ref == 0 的叶子节点
        # 2. 按 last_access_time 排序（LRU）
        # 3. 从最久未访问的叶子开始逐出
        pass`} />

      <h3>1.3 引用计数保护机制</h3>
      <p>
        Radix Tree 中每个节点维护 <code>lock_ref</code> 引用计数。正在被活跃请求使用的节点
        <strong>不会被淘汰</strong>。KV Cache 只有在节点 <code>lock_ref == 0</code> 且成为叶子节点时，
        才是可淘汰的候选。
      </p>

      <MermaidDiagram chart={`
stateDiagram-v2
    [*] --> Free: 初始化
    Free --> Allocated: match_prefix + lock_ref++
    Allocated --> InUse: Prefill/Decode 使用中
    InUse --> Evictable: unlock_ref (ref_cnt=0)
    Evictable --> Free: LRU 淘汰
    Evictable --> Allocated: 新请求命中 (lock_ref++)
    InUse --> InUse: lock_ref++ (多个请求共享)
      `} />

      {/* ==================== 2. P/D 分离 KV 传输 ==================== */}
      <div className="section-divider"><span>P/D 分离 KV 传输</span></div>

      <h3>2.1 核心架构：Push 模型</h3>
      <p>
        SGLang 的 P/D 分离 KV 传输采用 <strong>Push 模型</strong> —— P（Prefill）节点主动推送 KV Cache 到 D（Decode）节点，
        而非 D 节点主动拉取。这是理解其安全机制的关键前提。
      </p>

      <Callout type="warning">
        <strong>Push vs Pull 的根本差异：</strong>
        <ul>
          <li><strong>Pull 模型</strong>：D 节点主动拉取 → 存在"P 已释放 KV，D 还不知道"的竞态条件</li>
          <li><strong>Push 模型</strong>：P 节点主动推送 → P 在确认 D 接收成功后才释放 KV，从根本上杜绝了竞态</li>
        </ul>
      </Callout>

      <h3>2.2 四阶段传输协议</h3>
      <MermaidDiagram chart={`
sequenceDiagram
    participant P as Prefill (P 节点)
    participant TE as Transfer Engine
    participant D as Decode (D 节点)

    Note over P,D: Phase 1: Bootstrap 握手
    P->>D: create_sender() → aiohttp HTTP 连接
    D->>P: 元数据交换 (预分配槽位)
    D->>P: pop_decode_prefix_len() 返回已缓存前缀长度

    Note over P,D: Phase 2: Prefill 计算
    P->>P: 执行 forward pass
    P->>P: 生成 KV Cache → 写入 Radix Tree

    Note over P,D: Phase 3: KV 传输
    P->>TE: send_kv_chunk(req, last_chunk=True)
    TE->>D: RDMA/Mooncake 推送 KV 页
    D->>D: 接收并写入本地 KV 池

    Note over P,D: Phase 4: 完成确认
    P->>P: poll_and_all_reduce() 跨 TP rank 共识
    D->>P: KVPoll 状态回传
    alt KVPoll.Success
        P->>P: release_kv_cache() 释放 KV
        P->>P: clear() 清理传输引擎
        D->>D: 进入 WaitingQueue → RunningBatch
    else KVPoll.Failed
        P->>P: handle_inflight_transfer_failure()
        D->>D: prepare_abort() 终止请求
    end
      `} />

      <h3>2.3 KVPoll 状态机</h3>
      <table>
        <thead><tr><th>状态</th><th>P 端行为</th><th>D 端行为</th><th>含义</th></tr></thead>
        <tbody>
          <tr><td><code>KVPoll.Bootstrapping</code></td><td>等待握手完成；可触发 optimistic prefill</td><td>无操作，继续等待</td><td>握手进行中</td></tr>
          <tr><td><code>KVPoll.WaitingForInput</code></td><td>finalize_bootstrap()，准备传输</td><td>设置 waiting_for_input=True</td><td>接收端就绪</td></tr>
          <tr><td><code>KVPoll.Transferring</code></td><td>继续等待传输完成</td><td>继续等待</td><td>KV 传输进行中</td></tr>
          <tr><td><code>KVPoll.Success</code></td><td><strong>release_kv_cache()</strong> → 释放 KV</td><td>构造 PrebuiltExtendBatch</td><td>传输成功</td></tr>
          <tr><td><code>KVPoll.Failed</code></td><td>handle_inflight_transfer_failure()</td><td>prepare_abort()</td><td>传输失败</td></tr>
        </tbody>
      </table>

      <h3>2.4 跨 Rank 共识机制</h3>
      <p>
        SGLang 使用 <code>poll_and_all_reduce_attn_cp_tp_group()</code> 在所有 TP/CP rank 间做
        <strong>MIN-reduce</strong> 轮询结果。只有<strong>所有 rank 都确认传输成功</strong>，才会返回
        <code>KVPoll.Success</code>。任何 rank 返回失败，整个请求都被视为失败。
      </p>

      <CodeBlock language="python" title="跨 rank 共识的关键代码（prefill.py）" code={`def process_disagg_prefill_inflight_queue(self):
    """处理 inflight 队列中的 KV 传输状态"""
    for req in self.disagg_prefill_inflight_queue:
        poll = self.poll_and_all_reduce_attn_cp_tp_group(req)

        if poll == KVPoll.Success:
            # ⚠️ 关键：只有 Success 后才释放 KV
            release_kv_cache(req, self.tree_cache)  # 解锁 Radix Tree
            req.disagg_kv_sender.clear()             # 清理传输引擎
            maybe_release_metadata_buffer(req)        # 释放元数据缓冲
            done_reqs.append(req)

        elif poll == KVPoll.Failed:
            # 传输失败，直接 abort
            handle_inflight_transfer_failure(req)
            done_reqs.append(req)

        elif poll == KVPoll.Transferring:
            # 仍在传输中，保持不动
            undone_reqs.append(req)`} />

      {/* ==================== 3. 过期/释放场景处理 ==================== */}
      <div className="section-divider"><span>过期/释放场景处理</span></div>

      <h3>3.1 核心安全保障</h3>
      <p>
        P 节点只有在 <code>poll_and_all_reduce</code> 跨所有 rank 返回 <code>KVPoll.Success</code> 后
        <strong>才释放 KV Cache</strong>。这意味着在任何情况下，D 节点都不可能遇到"去拉取已释放的 KV"这个场景：
      </p>
      <ul>
        <li><strong>传输成功</strong>：KV 已安全送达 D 端 → P 端释放</li>
        <li><strong>传输失败</strong>：P 端和 D 端同时感知到 Failure → 双方 abort，请求重新调度</li>
        <li><strong>不存在中间状态</strong>：不存在"KV 已释放但 D 不知道"的窗口</li>
      </ul>

      <h3>3.2 五种失败场景详解</h3>

      <table>
        <thead><tr><th>场景</th><th>触发条件</th><th>P 端处理</th><th>D 端处理</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>Bootstrap 握手失败</strong></td>
            <td>网络不可达 / 端口不通 / 容量不足</td>
            <td><code>handle_bootstrap_failure()</code> → 加入 failed_reqs → 此时 KV 尚未分配，无需释放</td>
            <td><code>prepare_abort(HTTPStatus.INTERNAL_SERVER_ERROR)</code> → 流式输出错误</td>
          </tr>
          <tr>
            <td><strong>KV 传输中失败</strong></td>
            <td>RDMA 链路中断 / 内存故障 / 网络超时</td>
            <td><code>handle_inflight_transfer_failure()</code> → 获取底层异常 → abort</td>
            <td><code>poll → KVPoll.Failed</code> → <code>failure_exception()</code> → abort</td>
          </tr>
          <tr>
            <td><strong>P 端 KV 在传输前被淘汰</strong></td>
            <td>Radix Tree 内存压力淘汰叶子节点</td>
            <td><code>optimistic_release_and_requeue()</code> → 释放已分配资源 → 重新入队</td>
            <td>尚未感知，等待 P 端重新发起 bootstrap</td>
          </tr>
          <tr>
            <td><strong>D 端主动 abort 但 P 端正写入</strong></td>
            <td>D 端超时 / 客户端断开</td>
            <td>继续写入（未感知）</td>
            <td><strong>Deferred KV Release</strong>：延迟释放，等待 P 端 ack 排空或超时</td>
          </tr>
          <tr>
            <td><strong>D 端 bootstrap 信息获取失败</strong></td>
            <td>P 节点 DP 信息不可达</td>
            <td>无感知</td>
            <td>15 次重试（每次间隔 1s），耗尽后 <code>kv_receiver.abort()</code></td>
          </tr>
        </tbody>
      </table>

      <h3>3.3 延迟 KV 释放（Deferred KV Release）</h3>
      <p>
        这是 SGLang 处理 <strong>D 端发起 abort 但 P 端可能仍在写入</strong> 这一竞态场景的精妙设计。
      </p>

      <CodeBlock language="python" title="decode.py: Deferred KV Release 机制" code={`# 当 D 端主动 abort 时，区分两种场景：

if enable_deferred_kv_release and decode_req.kv_receiver.abort_notified:
    # 场景 1: D 端发起 abort → P 端可能还在写
    # → 不立即释放 KV，加入延迟释放队列
    self._deferred_releases.append(
        (decode_req, deadline, metadata_idx, required_acks)
    )
    # 等待两种条件之一触发释放：
    #   条件 A: is_abort_release_safe() → P 端所有写入 ack 已排空
    #   条件 B: deferred_kv_release_timeout → 超时强制释放
    #          （会打 warning: "releasing anyway"）

else:
    # 场景 2: P 端发起 abort → P 已停止写入，安全立即释放
    release_kv_cache(req, tree_cache, is_insert=False)

# 后台定期检查
def resolve_deferred_releases(self):
    for decode_req, deadline, metadata_idx, acks in self._deferred_releases:
        if is_abort_release_safe(decode_req):
            release_kv_cache(decode_req.req, self.tree_cache)
        elif time.time() > deadline:
            logger.warning("Deferred KV release timeout, releasing anyway")
            release_kv_cache(decode_req.req, self.tree_cache)`} />

      <MermaidDiagram maxWidth={680} chart={`
flowchart TB
    ABORT["请求 Abort"] --> WHO{"谁发起的 abort?"}
    WHO -->|"D 端发起"| DEFERRED["Deferred KV Release<br/>延迟释放"]
    WHO -->|"P 端发起"| IMMEDIATE["立即释放 KV"]
    DEFERRED --> POLL["轮询检查"]
    POLL --> CHECK1{"ack 排空?"}
    CHECK1 -->|"✅ 是"| RELEASE["release_kv_cache()"]
    CHECK1 -->|"❌ 否"| CHECK2{"超过 timeout?"}
    CHECK2 -->|"否"| POLL
    CHECK2 -->|"是"| WARN["⚠️ warning + 强制释放"]
    WARN --> RELEASE
    IMMEDIATE --> RELEASE
      `} />

      <h3>3.4 Optimistic Prefill 与重试机制</h3>
      <p>
        SGLang 支持 <strong>Optimistic Prefill</strong>：请求在 bootstrap 完成前就进入 waiting queue 进行 prefill 计算。
        如果 bootstrap 后续失败，或 KV 在传输前被淘汰，走 <code>optimistic_release_and_requeue()</code> 路径：
      </p>

      <CodeBlock language="python" title="Optimistic Prefill 失败恢复" code={`def optimistic_release_and_requeue(self, req):
    """释放乐观 prefill 的资源并重新入队"""
    # 1. 释放已分配的 KV Cache（从 Radix Tree 中解锁）
    release_kv_cache(req, self.tree_cache)

    # 2. 释放元数据缓冲区
    if req.metadata_buffer_index >= 0:
        maybe_release_metadata_buffer(req, self.req_to_metadata_idx_allocator)

    # 3. 重置请求状态
    req.pending_bootstrap = True
    req.prefill_attempt_count += 1

    # 4. 重新加入 bootstrap 队列
    self.bootstrap_queue.append(req)`} />

      <table>
        <thead><tr><th>参数</th><th>默认值</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><code>_max_ensure_retries</code></td><td>15</td><td>D 端获取 P 端 DP 信息的最大重试次数</td></tr>
          <tr><td><code>_ensure_retry_interval</code></td><td>1.0s</td><td>每次重试间隔</td></tr>
          <tr><td><code>optimistic_prefill_attempts</code></td><td>配置项</td><td>乐观 prefill 最大尝试次数</td></tr>
          <tr><td><code>deferred_kv_release_timeout</code></td><td>配置项</td><td>延迟 KV 释放的超时时间</td></tr>
          <tr><td><code>prefill_delayer_timeout</code></td><td>5s</td><td>Prefill 延迟准入的超时时间</td></tr>
        </tbody>
      </table>

      {/* ==================== 4. HiCache 分层存储 ==================== */}
      <div className="section-divider"><span>HiCache 分层存储</span></div>

      <h3>4.1 三层存储架构</h3>
      <MermaidDiagram maxWidth={480} chart={`
flowchart TB
    subgraph GPU["GPU HBM (L1)"]
        G1["KV Block 1"]
        G2["KV Block 2"]
        G3["KV Block 3"]
        G4["..."]
    end
    subgraph CPU["CPU DRAM (L2)"]
        C1["KV Block 4"]
        C2["KV Block 5"]
        C3["..."]
    end
    subgraph SSD["SSD / NVMe (L3)"]
        S1["KV Block 6"]
        S2["KV Block 7"]
        S3["..."]
    end
    GPU -->|"evict (LRU)"| CPU
    CPU -->|"prefetch"| GPU
    CPU -->|"evict (LRU)"| SSD
    SSD -->|"prefetch"| CPU
    EVENTS["KV Events 系统 (ZMQ)"]
    GPU -.-> EVENTS
    CPU -.-> EVENTS
    SSD -.-> EVENTS
      `} />

      <h3>4.2 写入穿透策略</h3>
      <p>
        KV Cache 写入采用 <strong>穿透写入（Write-Through）</strong>策略：新生成的 KV 同时写入 GPU HBM 和 CPU DRAM。
        淘汰采用 <strong>LRU</strong> 策略，从 GPU → CPU → SSD 逐级降级。
      </p>

      <table>
        <thead><tr><th>层级</th><th>介质</th><th>容量</th><th>延迟</th><th>策略</th></tr></thead>
        <tbody>
          <tr><td><strong>L1</strong></td><td>GPU HBM</td><td>~80 GB (H100)</td><td>~1 TB/s</td><td>热数据，LRU 淘汰到 L2</td></tr>
          <tr><td><strong>L2</strong></td><td>CPU DRAM</td><td>~512 GB</td><td>~50 GB/s (PCIe)</td><td>温数据，LRU 淘汰到 L3</td></tr>
          <tr><td><strong>L3</strong></td><td>SSD / NVMe</td><td>~TB 级</td><td>~7 GB/s</td><td>冷数据，按需 prefetch</td></tr>
        </tbody>
      </table>

      <h3>4.3 KV Events 系统</h3>
      <p>
        独立于 P/D 传输路径的可选系统。通过 ZMQ 发布 KV 缓存占用事件
        （<code>BlockStored</code> / <code>BlockRemoved</code> / <code>AllBlocksCleared</code>），
        支持 GPU / CPU / DISK / EXTERNAL 四层存储介质，使外部路由器可实现前缀感知负载均衡。
      </p>

      {/* ==================== 5. 传输后端 ==================== */}
      <div className="section-divider"><span>传输后端</span></div>

      <h3>5.1 五种传输后端对比</h3>
      <table>
        <thead><tr><th>后端</th><th>传输方式</th><th>故障恢复</th><th>适用场景</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>NIXL</strong></td>
            <td>NVIDIA NIXL agent，异步句柄轮询</td>
            <td>基础：预构建描述符列表</td>
            <td>NVIDIA GPU 同构集群</td>
          </tr>
          <tr>
            <td><strong>Mooncake</strong></td>
            <td>基于会话的 RDMA</td>
            <td><strong>最稳健</strong>：会话黑名单 + 后台探测</td>
            <td>跨节点 RDMA 高性能场景</td>
          </tr>
          <tr>
            <td><strong>Ascend</strong></td>
            <td>Mooncake 子类 + memfabric_hybrid</td>
            <td>处理 NPU MLA C4/C128 压缩布局</td>
            <td>华为昇腾 NPU 集群</td>
          </tr>
          <tr>
            <td><strong>Mori</strong></td>
            <td>Mori IOEngine + MemoryDesc</td>
            <td>连续索引分组，无 staging</td>
            <td>高性能 KV 传输</td>
          </tr>
          <tr>
            <td><strong>Fake</strong></td>
            <td>无操作</td>
            <td>跳过整个传输机制</td>
            <td>预热 / 测试</td>
          </tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>Mooncake 后端的故障恢复优势：</strong>
        <ul>
          <li><strong>会话黑名单</strong>：失败的 RDMA 会话自动加入黑名单，避免重复尝试</li>
          <li><strong>后台探测</strong>：定期探测黑名单中的会话，恢复后自动移除</li>
          <li><strong>拓扑感知</strong>：自动选择最优 RDMA 传输路径</li>
        </ul>
        这使得 Mooncake 成为 SGLang 五种后端中故障恢复能力最强的选项。
      </Callout>

      {/* ==================== 6. 完整流程总结 ==================== */}
      <div className="section-divider"><span>完整流程总结</span></div>

      <MermaidDiagram chart={`
flowchart TB
    START(["请求到达 P 节点"]) --> CREATE["create_sender()<br/>创建 KV 发送器"]
    CREATE --> CAP{"容量检查<br/>exceed_kv_capacity?"}
    CAP -->|"超出"| ABORT1["abort (BAD_REQUEST)"]
    CAP -->|"通过"| BOOT["Bootstrap 握手"]

    BOOT --> BOOT_POLL{"poll 状态?"}
    BOOT_POLL -->|"Failed"| BOOT_FAIL["handle_bootstrap_failure()<br/>→ 请求终止"]
    BOOT_POLL -->|"Bootstrapping"| OPT["Optimistic Prefill<br/>提前进入 Waiting Queue"]
    BOOT_POLL -->|"WaitingForInput"| FINAL["finalize_bootstrap()<br/>预分配元数据缓冲"]

    OPT --> PREFILL["Prefill 计算<br/>生成 KV Cache"]
    FINAL --> PREFILL

    PREFILL --> SEND["send_kv_chunk()<br/>推送 KV 到 D 节点"]

    SEND --> INFL_POLL{"poll_and_all_reduce<br/>跨 TP rank 共识"}

    INFL_POLL -->|"Success"| RELEASE["release_kv_cache()<br/>✅ 释放 KV，传输完成"]
    INFL_POLL -->|"Failed"| INFL_FAIL["handle_inflight_transfer_failure()<br/>❌ 传输失败，终止请求"]
    INFL_POLL -->|"Transferring"| SEND

    OPT -.->|"bootstrap 失败"| REQUEUE["optimistic_release_and_requeue()<br/>释放 KV → 重新入队"]
    REQUEUE -.-> BOOT

    RELEASE --> DONE(["请求完成"])
    INFL_FAIL --> DONE
    BOOT_FAIL --> DONE

    style RELEASE fill:#2e7d32,color:#fff
    style INFL_FAIL fill:#c62828,color:#fff
    style BOOT_FAIL fill:#c62828,color:#fff
    style ABORT1 fill:#c62828,color:#fff
      `} />

      <Callout type="warning">
        <strong>关键设计原则：</strong>
        <ol>
          <li><strong>Push 模型</strong>：P 节点主动推送 KV，D 节点被动接收。不存在"D 拉取已释放 KV"的竞态。</li>
          <li><strong>Success 后才释放</strong>：KV 在跨 rank 共识确认传输成功后才释放，不存在中间状态。</li>
          <li><strong>Deferred Release</strong>：D 端 abort 时，如果 P 端可能仍在写入，延迟释放 KV 直到 ack 排空或超时。</li>
          <li><strong>引用计数保护</strong>：Radix Tree 中被活跃请求引用的节点不会被淘汰，防止正在使用的 KV 被误删。</li>
          <li><strong>Optimistic Retry</strong>：乐观 prefill 失败后自动释放 KV 并重新入队，不会产生泄漏。</li>
        </ol>
      </Callout>

      <ResourceTable resources={[
        { name: 'SGLang GitHub', url: 'https://github.com/sgl-project/sglang', desc: 'SGLang 官方仓库，RadixAttention 与 KV Cache 管理的完整实现' },
        { name: 'SGLang 分离式服务文档', url: 'https://docs.sglang.io/advanced_features/disaggregated_serving.html', desc: 'SGLang P/D 分离的官方文档' },
        { name: 'SGLang scheduler.py', url: 'https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/managers/scheduler.py', desc: '调度器核心实现，包含 Mixin 组合' },
        { name: 'SGLang prefill.py', url: 'https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/disaggregation/prefill.py', desc: 'P 端 KV 传输实现，含 inflight 队列管理' },
        { name: 'SGLang decode.py', url: 'https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/disaggregation/decode.py', desc: 'D 端 KV 接收实现，含 Deferred KV Release' },
        { name: 'Mooncake', url: 'https://github.com/kvcache-ai/Mooncake', desc: '月之暗面开源的 KV Cache 传输框架，SGLang 最稳健的传输后端' },
      ]} />
    </div>
  );
}