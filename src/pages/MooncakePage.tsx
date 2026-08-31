import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, CodeBlock, ResourceTable } from '../components/CodeBlock';

export function MooncakePage() {
  return (
    <div className="prose max-w-none">
      <h1>Mooncake</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-08</span>
        <span className="page-meta-item">⏱️ 阅读约 25 分钟</span>
        <span className="page-meta-item">🏷️ 专题 · Mooncake · P/D 分离</span>
      </div>
      <p>Mooncake 是月之暗面（Kimi）开源的<strong>以 KV Cache 为中心的分离式 LLM 推理架构</strong>，核心创新是将 Prefill 和 Decode 解耦到独立 GPU 集群，通过高速 KV Cache 传输层实现高效协同。已部署在 40 万+ GPU 的 Kimi 生产环境。</p>

      {/* ==================== 1. 核心设计理念 ==================== */}
      <div className="section-divider"><span>核心设计理念</span></div>

      <h3>KVCache-Centric 架构</h3>
      <p>Mooncake 的设计围绕一个核心洞察：<strong>KV Cache 是连接 Prefill 和 Decode 的唯一桥梁</strong>。将 KV Cache 的存储、传输和调度作为一等公民，而非附属功能。</p>

      <MermaidDiagram chart={`
graph TB
    subgraph Mooncake["Mooncake 架构"]
        Master["Master Server<br/>全局调度 + 元数据"]

        subgraph P_Pool["Prefill Pool"]
            P1["Prefill GPU 0"]
            P2["Prefill GPU 1"]
        end

        subgraph KV["KV Cache 传输层"]
            T Engine["Transfer Engine<br/>RDMA/TCP 混合"]
            Meta["元数据索引<br/>block 位置映射"]
        end

        subgraph D_Pool["Decode Pool"]
            D1["Decode GPU 0"]
            D2["Decode GPU 1"]
            D3["Decode GPU 2"]
        end
    end

    Master --> P_Pool
    Master --> D_Pool
    P_Pool --> KV
    KV --> D_Pool
      `} maxWidth={520} />

      <table>
        <thead><tr><th>设计原则</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><strong>KVCache 为中心</strong></td><td>KV Cache 的存储、传输、调度是系统核心，而非附属优化</td></tr>
          <tr><td><strong>P/D 解耦</strong></td><td>Prefill 和 Decode 使用独立 GPU 池，各自优化，独立扩缩</td></tr>
          <tr><td><strong>GPU 异构</strong></td><td>Prefill 用高算力 GPU（H100），Decode 用低成本 GPU（L40S）</td></tr>
          <tr><td><strong>拓扑感知传输</strong></td><td>根据网络拓扑自动选择最优 KV Cache 传输路径</td></tr>
          <tr><td><strong>弹性调度</strong></td><td>Prefill/Decode Pool 独立扩缩容，按负载动态调整</td></tr>
        </tbody>
      </table>

      {/* ==================== 2. 核心组件 ==================== */}
      <div className="section-divider"><span>核心组件</span></div>

      <h3>Master Server</h3>
      <p>Master Server 是 Mooncake 的<strong>全局调度中枢</strong>，负责：</p>
      <ul>
        <li><strong>全局页表管理</strong>：维护 block_hash → PhysicalLocation 映射</li>
        <li><strong>Pool 调度</strong>：分配 Prefill/Decode 任务到最优节点</li>
        <li><strong>负载均衡</strong>：跟踪各 GPU 的负载和 KV Cache 分布</li>
        <li><strong>故障恢复</strong>：检测节点故障并重新调度</li>
      </ul>

      <CodeBlock language="python" title="Master Server 调度逻辑" code={`class MooncakeMaster:
    """Mooncake Master: 全局调度 + KV Cache 元数据管理"""

    def __init__(self):
        # 全局 KV Cache 页表
        self.page_table: dict[str, BlockLocation] = {}
        # Prefill Pool 状态
        self.prefill_nodes: dict[str, NodeState] = {}
        # Decode Pool 状态
        self.decode_nodes: dict[str, NodeState] = {}

    def schedule_prefill(self, request: Request) -> str:
        """为 Prefill 请求分配节点"""
        # 1. 检查前缀缓存命中
        prefix_hits = self._lookup_prefix(request.prompt_tokens)

        # 2. 选择 Prefill 节点
        if prefix_hits:
            # 优先选择已有相关 KV Cache 的节点
            node = self._select_node_with_cache(prefix_hits)
        else:
            # 选择负载最低的节点
            node = self._select_least_loaded(self.prefill_nodes)

        return node

    def schedule_decode(self, session_id: str, block_hashes: list[str]) -> str:
        """为 Decode 请求分配节点"""
        # 1. 查询 block 物理位置
        locations = self._lookup_blocks(block_hashes)

        # 2. 拓扑感知选择: 优先选择网络距离最近的节点
        node = self._select_topology_nearest(locations, self.decode_nodes)

        return node

    def commit_blocks(self, session_id: str, block_hashes: list[str],
                      locations: list[BlockLocation]):
        """提交 KV Cache 元数据"""
        for h, loc in zip(block_hashes, locations):
            self.page_table[h] = loc`} />

      <h3>Transfer Engine</h3>
      <p>Transfer Engine 负责 KV Cache 的<strong>高速跨节点传输</strong>，支持多种传输协议：</p>

      <table>
        <thead><tr><th>协议</th><th>带宽</th><th>场景</th><th>平台</th></tr></thead>
        <tbody>
          <tr><td><strong>RDMA (InfiniBand)</strong></td><td>400 GB/s</td><td>跨节点 GPU 直传</td><td>NVIDIA</td></tr>
          <tr><td><strong>TCP/IP</strong></td><td>100 GbE</td><td>跨节点低成本传输</td><td>通用</td></tr>
          <tr><td><strong>NVLink</strong></td><td>900 GB/s</td><td>同节点 GPU 间</td><td>NVIDIA</td></tr>
          <tr><td><strong>HCCS (HIXL)</strong></td><td>119 GB/s</td><td>同节点 NPU 间</td><td>Ascend</td></tr>
          <tr><td><strong>RDMA (HIXL)</strong></td><td>22 GB/s</td><td>跨节点 NPU 间</td><td>Ascend</td></tr>
        </tbody>
      </table>

      <h3>Transfer Engine 核心实现</h3>
      <CodeBlock language="python" title="Transfer Engine" code={`class MooncakeTransferEngine:
    """Mooncake KV Cache 传输引擎"""

    def __init__(self, topology: Topology):
        self.topology = topology
        # 根据拓扑自动选择最优协议
        self.protocol = self._select_protocol()

    def transfer_kv_cache(self, blocks: list[Block],
                          src_node: str, dst_node: str):
        """传输 KV Cache blocks"""
        # 1. 拓扑感知: 选择最优传输路径
        path = self.topology.find_best_path(src_node, dst_node)
        protocol = self._select_protocol_for_path(path)

        # 2. Layer-wise Pipeline: 逐层传输，隐藏延迟
        for layer_id in range(blocks[0].num_layers):
            for block in blocks:
                # 异步传输当前层
                self._async_send(
                    data=block.get_layer(layer_id),
                    dst=dst_node,
                    protocol=protocol,
                )
            # 传输期间 Prefill 继续计算下一层

        # 3. 等待所有传输完成
        self._wait_all()

    def _select_protocol(self) -> str:
        """自动选择传输协议"""
        if self.topology.is_same_node():
            return "nvlink"  # 或 "hccs" (Ascend)
        elif self.topology.has_rdma():
            return "rdma"
        else:
            return "tcp"`} />

      {/* ==================== 3. 请求生命周期 ==================== */}
      <div className="section-divider"><span>请求生命周期</span></div>

      <MermaidDiagram chart={`
sequenceDiagram
    participant Client
    participant Master
    participant Prefill as Prefill GPU
    participant Transfer as Transfer Engine
    participant Decode as Decode GPU

    Client->>Master: POST /v1/completions
    Master->>Master: 调度决策 (前缀检查)
    Master->>Prefill: 分配 Prefill 任务

    Note over Prefill: Phase 1: Prefill
    Prefill->>Prefill: Tokenize + Forward
    Prefill->>Master: 申请存储位置
    Master-->>Prefill: 返回 PhysicalLocation

    Note over Prefill,Transfer: Phase 2: KV 传输
    Prefill->>Transfer: Layer-wise RDMA Write
    Transfer-->>Prefill: 传输完成
    Prefill->>Master: commit 元数据

    Note over Decode: Phase 3: Decode
    Master->>Decode: 分配 Decode 任务
    Decode->>Master: lookup block 位置
    Master-->>Decode: 返回 PhysicalLocation
    Decode->>Transfer: RDMA Read (分批预取)
    Transfer-->>Decode: KV Cache 就绪

    loop Decode Loop
        Decode->>Decode: 生成 token
        Decode-->>Client: SSE: token
    end
    Decode-->>Client: [DONE]
      `} maxWidth={520} />

      {/* ==================== 4. P/D 分离调度 ==================== */}
      <div className="section-divider"><span>P/D 分离调度</span></div>

      <h3>为什么 P/D 分离</h3>
      <table>
        <thead><tr><th>维度</th><th>Prefill</th><th>Decode</th></tr></thead>
        <tbody>
          <tr><td><strong>计算模式</strong></td><td>Compute-bound</td><td>Memory-bound</td></tr>
          <tr><td><strong>GPU 利用率</strong></td><td>80-90%</td><td>20-30%</td></tr>
          <tr><td><strong>并行度</strong></td><td>高（一次处理全部 tokens）</td><td>低（每次 1 token）</td></tr>
          <tr><td><strong>推荐 GPU</strong></td><td>高算力（H100/A100）</td><td>低成本（L40S/A10）</td></tr>
          <tr><td><strong>Batch 效率</strong></td><td>大 batch 高效</td><td>小 batch 即可饱和</td></tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>核心价值：</strong>一体式架构中 Decode 阶段 GPU 算力大量闲置（20-30% 利用率）。
        P/D 分离后，Decode 使用低成本 GPU，总成本降低 30-50%，同时 Prefill 和 Decode 可独立扩缩容。
      </Callout>

      <h3>Mooncake 在 P/D 分离中的核心作用</h3>
      <p>Mooncake 不仅仅是实现了 P/D 分离，而是将 <strong>KV Cache 的存储、传输、调度</strong> 作为整个系统的核心基础设施。在一体式架构中，Prefill 和 Decode 在同一 GPU 上共享 KV Cache，无需传输；而在 P/D 分离架构下，<strong>KV Cache 必须从 Prefill 节点高效传输到 Decode 节点</strong>，这成为系统性能的关键瓶颈。</p>

      <h4>Mooncake 解决的三大核心问题</h4>

      <table>
        <thead><tr><th>问题</th><th>一体式架构</th><th>Mooncake P/D 分离方案</th></tr></thead>
        <tbody>
          <tr><td><strong>KV Cache 传输</strong></td><td>无需传输（同 GPU 内存）</td><td>Transfer Engine: RDMA/TCP/NVLink 多协议高速传输</td></tr>
          <tr><td><strong>节点选择</strong></td><td>无选择（本地唯一）</td><td>Master Server: 拓扑感知调度，选择网络距离最近的 Decode 节点</td></tr>
          <tr><td><strong>前缀缓存共享</strong></td><td>仅限本 GPU 内</td><td>全局页表: 跨节点、跨 Pool 的 block 级去重与共享</td></tr>
        </tbody>
      </table>

      <h4>P/D 分离全流程详解</h4>
      <p>以下是一个完整请求在 Mooncake P/D 分离架构下的端到端流程：</p>

      <MermaidDiagram maxWidth={520} chart={`
sequenceDiagram
    participant Client
    participant Router as Mooncake Router
    participant Master
    participant P as Prefill GPU (H100)
    participant TE as Transfer Engine
    participant D as Decode GPU (L40S)

    Note over Client,D: === Phase 1: 请求接入 ===
    Client->>Router: POST /v1/chat/completions
    Router->>Master: 查询可用资源 + 前缀缓存命中
    Master-->>Router: 返回 Prefill 节点候选列表

    Note over Router: 选择最优 Prefill 节点<br/>(有缓存命中优先)

    Note over Client,D: === Phase 2: Prefill 阶段 ===
    Router->>P: 分配 Prefill 任务
    P->>P: Tokenize + Embedding
    loop 逐层 Forward
        P->>P: Layer i Attention + FFN
        Note over P: 产生 layer i 的 K,V
    end
    P->>Master: 申请 KV Cache 存储位置
    Master-->>P: 返回 PhysicalLocation<br/>(偏好就近 Decode Pool)

    Note over Client,D: === Phase 3: KV Cache 传输 ===
    P->>TE: Layer-wise RDMA Write<br/>(Prefill 还在计算后续层)
    Note over TE: 利用 Layer-wise Pipeline<br/>隐藏传输延迟
    TE-->>P: 传输完成
    P->>Master: commit 元数据<br/>(block_hash → location)

    Note over Client,D: === Phase 4: Decode 阶段 ===
    Master->>D: 分配 Decode 任务<br/>(拓扑感知: 优先选 KV Cache 最近的节点)
    D->>Master: lookup block 位置
    Master-->>D: 返回 PhysicalLocation
    D->>TE: RDMA Read (分批预取)
    TE-->>D: KV Cache 就绪

    loop Decode Loop
        D->>D: Attention + FFN (1 token)
        D-->>Client: SSE: {"token": "..."}
        Note over D: 新 token 的 K,V 追加到本地 block
    end
    D-->>Client: [DONE]
      `} />

      <h4>拓扑感知的 P/D 节点配对</h4>
      <p>Mooncake Master 在做 P/D 配对时，综合考虑以下因素：</p>

      <CodeBlock language="python" title="拓扑感知 P/D 配对算法" code={`class TopologyAwarePDMatcher:
    """Mooncake 拓扑感知的 P/D 节点配对"""

    def match_decode_node(self, block_locations: list[BlockLocation],
                          decode_pool: dict[str, NodeState]) -> str:
        """为 KV Cache blocks 选择最优 Decode 节点"""

        candidates = []
        for node_id, node_state in decode_pool.items():
            # 1. 计算总传输成本
            transfer_cost = 0
            for blk_loc in block_locations:
                # 网络距离: 同节点(1) < 同机架(10) < 跨机架(100)
                distance = self.topology.distance(
                    blk_loc.node_id, node_id
                )
                # 传输量: block_size × num_layers × 2 (K+V)
                transfer_cost += distance * blk_loc.block_size

            # 2. 考虑节点当前负载
            load_penalty = node_state.active_requests * 0.1

            candidates.append({
                'node_id': node_id,
                'cost': transfer_cost + load_penalty,
                'load': node_state.active_requests,
            })

        # 3. 选择成本最低的节点
        best = min(candidates, key=lambda c: c['cost'])
        return best['node_id']`} />

      <h4>多轮对话场景下的 P/D 优化</h4>
      <p>多轮对话是 Mooncake P/D 分离架构最能发挥优势的场景。由于所有轮次共享 system prompt 和历史对话的 KV Cache，Mooncake 通过以下机制最大化缓存命中率：</p>

      <MermaidDiagram maxWidth={520} chart={`
sequenceDiagram
    participant Client
    participant Master
    participant P1 as Prefill A
    participant D1 as Decode A
    participant D2 as Decode B

    Note over Client,D2: Round 1: 完整 Prefill + Decode
    Client->>Master: Round 1: "system + Q1"
    Master->>P1: Prefill (system + Q1)
    P1->>P1: 产生 KV Cache blocks
    P1->>Master: commit: block_sys, block_q1
    Master->>D1: Decode Round 1
    D1->>D1: 生成 A1 tokens

    Note over Client,D2: Round 2: 仅 Prefill Q2, 复用 system+Q1
    Client->>Master: Round 2: "system + Q1 + A1 + Q2"
    Master->>Master: 前缀匹配:<br/>block_sys ✅ (命中)<br/>block_q1 ✅ (命中)
    Master->>P1: 仅 Prefill (A1 + Q2)<br/>无需重算 system + Q1
    Note over P1: 节省 60-80% Prefill 计算
    P1->>P1: 产生 block_a1, block_q2
    Master->>D2: Decode Round 2<br/>(可选新节点, 拓扑感知)
    D2->>Master: lookup: block_sys, block_q1
    Master-->>D2: 返回位置 (可能在 D1 所在节点)
    D2->>D2: RDMA Read 已有 blocks + 本地新 block
      `} />

      <Callout type="tip">
        <strong>多轮对话收益：</strong>假设 system prompt 占用 4096 tokens，每轮对话 512 tokens，3 轮对话：
        <ul>
          <li>一体式：3 轮 × (4096+512) = 13,824 tokens Prefill</li>
          <li>Mooncake P/D 分离 + 前缀缓存：4096 + 3×512 = 5,632 tokens Prefill</li>
          <li><strong>节省 59% Prefill 计算量</strong>，且 Decode Pool 可独立扩缩容应对多轮并发</li>
        </ul>
      </Callout>

      <h4>P/D 分离下的故障恢复</h4>
      <p>Mooncake 在 P/D 分离场景下需要处理两类故障：</p>

      <table>
        <thead><tr><th>故障类型</th><th>影响</th><th>Mooncake 恢复策略</th></tr></thead>
        <tbody>
          <tr><td><strong>Prefill 节点故障</strong></td><td>正在进行的 Prefill 请求失败</td><td>Master 检测心跳超时 → 将请求重新分配到其他 Prefill 节点 → 重新 Prefill（无 KV Cache 状态需要恢复）</td></tr>
          <tr><td><strong>Decode 节点故障</strong></td><td>正在进行的 Decode 会话中断</td><td>Master 检测心跳超时 → 从全局页表查找该会话的 KV Cache 副本位置 → 在新 Decode 节点通过 RDMA 恢复 KV Cache → 继续生成</td></tr>
          <tr><td><strong>Transfer Engine 异常</strong></td><td>KV Cache 传输中断</td><td>自动降级到 TCP 协议重传 → 若持续失败，重新调度到同节点 P/D 配对（通过 NVLink/HCCS 传输）</td></tr>
        </tbody>
      </table>

      <CodeBlock language="python" title="Decode 节点故障恢复" code={`class MooncakeFailover:
    """Mooncake P/D 分离故障恢复"""

    def handle_decode_node_failure(self, failed_node: str):
        # 1. 获取故障节点上所有活跃会话
        affected_sessions = self.master.get_sessions_on_node(failed_node)

        for session in affected_sessions:
            # 2. 查找 KV Cache 副本位置
            block_locations = self.master.lookup_blocks(
                session.block_hashes
            )

            # 3. 判断是否有副本
            if len(block_locations) == 0:
                # 无副本: 需要从最近的 Prefill 节点重新生成
                self._restart_from_prefill(session)
                continue

            # 4. 选择新 Decode 节点 (拓扑感知)
            new_node = self._select_topology_nearest(
                block_locations,
                exclude=[failed_node],
            )

            # 5. 恢复 KV Cache 到新节点
            self.transfer_engine.transfer_kv_cache(
                blocks=session.blocks,
                src_node=block_locations[0].node_id,
                dst_node=new_node,
            )

            # 6. 在新节点继续 Decode
            self.master.schedule_decode(
                session_id=session.id,
                node=new_node,
                resume_from=session.last_token_id,
            )`} />

      {/* ==================== 5. KV Cache 传输优化 ==================== */}
      <div className="section-divider"><span>KV Cache 传输优化</span></div>

      <h3>Layer-wise Pipeline</h3>
      <p>Prefill 还在进行时就开始传输已完成层的 KV Cache，将传输延迟隐藏在计算中：</p>

      <MermaidDiagram chart={`
gantt
    title Layer-wise Pipeline
    dateFormat X
    axisFormat %s

    section Prefill
    Layer 0-7  :p0, 0, 2
    Layer 8-15 :p1, 2, 4
    Layer 16-23:p2, 4, 6
    Layer 24-31:p3, 6, 8

    section Transfer
    L0-7 传输  :t0, 2, 4
    L8-15 传输 :t1, 4, 6
    L16-23 传输:t2, 6, 8
    L24-31 传输:t3, 8, 10

    section Decode
    预取+等待  :d0, 2, 5
    Decode     :d1, 5, 8
      `} maxWidth={520} />

      <h3>去重传输</h3>
      <p>相同前缀的 KV Cache 只传输一次，后续请求通过引用计数共享：</p>

      <CodeBlock language="python" title="去重传输" code={`class DedupTransfer:
    """KV Cache 去重传输"""

    def __init__(self):
        self.transferred: set[str] = set()  # 已传输的 block hash

    def transfer_if_needed(self, block: Block, dst: str) -> bool:
        """仅在未传输过时才传输"""
        if block.hash in self.transferred:
            # 已传输过，只增加引用计数
            self.master.increment_ref(block.hash, dst)
            return False
        else:
            # 首次传输
            self.engine.send(block, dst)
            self.transferred.add(block.hash)
            return True

# 效果: 3 个请求共享 system prompt
# 传输量: 1 × KV_size (而非 3 × KV_size)`} />

      {/* ==================== 6. 两种传输引擎 ==================== */}
      <div className="section-divider"><span>两种传输引擎</span></div>

      <p>Mooncake 在 P/D 分离场景下，提供<strong>两套传输引擎</strong>以适配不同硬件平台。两者都实现了 KV Cache 从 Prefill 到 Decode 的高效传输，但底层机制、通信模型和适用场景有本质差异。</p>

      <h3>架构定位</h3>

      <MermaidDiagram maxWidth={520} chart={`
graph TB
    subgraph Apps["推理框架"]
        VLLM["vLLM"]
        SGL["SGLang"]
    end

    subgraph MooncakeCore["Mooncake 核心"]
        Master2["Master Server"]
        Router2["Router"]
    end

    subgraph Connectors["传输引擎 (Connector)"]
        subgraph TE["Transfer Engine &#40;NVIDIA&#41;"]
            RDMA_LIB["RDMA 库"]
            TCP_LIB["TCP 库"]
            NVLink_LIB["NVLink 库"]
        end
        subgraph HIXL["HIXL Engine &#40;Ascend&#41;"]
            HCCS_LIB["HCCS 库"]
            RDMA_ASC["RDMA 库"]
            UB_LIB["UB 库"]
        end
    end

    subgraph HW["硬件"]
        NVIDIA["NVIDIA GPU<br/>H100/A100/L40S"]
        Ascend["Ascend NPU<br/>A3/A5"]
    end

    Apps --> MooncakeCore
    MooncakeCore --> TE
    MooncakeCore --> HIXL
    TE --> NVIDIA
    HIXL --> Ascend
      `} />

      <Callout type="info">
        <strong>统一接口，底层异构：</strong>Mooncake 对上暴露统一的 <code>TransferEngine</code> 接口，推理框架无需关心底层是 NVIDIA 还是 Ascend。
        实际传输由对应的 Connector 完成，Master Server 根据节点硬件类型自动选择。
      </Callout>

      {/* ==================== 6.1 Transfer Engine (NVIDIA) ==================== */}
      <h3>Transfer Engine（NVIDIA 平台）</h3>

      <p>Mooncake Transfer Engine 是 Mooncake <strong>自研的 KV Cache 传输引擎</strong>，专为 NVIDIA GPU 集群设计，已在 Kimi 40 万+ GPU 生产环境中验证。其核心设计思想是：<strong>将 KV Cache 的传输与 GPU 计算完全解耦，通过 RDMA 实现 GPU 显存到 GPU 显存的直接传输</strong>。</p>

      <h4>P/D 分离下的数据传输机制</h4>

      <MermaidDiagram maxWidth={520} chart={`
sequenceDiagram
    participant P_GPU as Prefill GPU (H100)
    participant P_MEM as GPU HBM
    participant NIC as RDMA NIC (IB)
    participant D_NIC as RDMA NIC (IB)
    participant D_MEM as GPU HBM
    participant D_GPU as Decode GPU (L40S)

    Note over P_GPU,D_GPU: === Transfer Engine (NVIDIA) P/D 数据传输 ===

    rect rgb(230, 240, 255)
        Note over P_GPU,P_MEM: Step 1: GPU 注册内存
        P_GPU->>P_MEM: 注册 KV Cache buffer 为 RDMA MR
        Note over P_MEM: cudaMalloc + cuMemGetAddressRange<br/>→ ibv_reg_mr
    end

    rect rgb(230, 255, 230)
        Note over P_GPU,NIC: Step 2: Prefill 产生 KV Cache
        P_GPU->>P_GPU: Layer i Forward Pass
        P_GPU->>P_MEM: 写入 K_i, V_i 到 HBM
        Note over P_GPU: Layer i 完成后立即触发传输<br/>(Layer-wise Pipeline)
    end

    rect rgb(255, 245, 230)
        Note over NIC,D_MEM: Step 3: GPU Direct RDMA Write
        P_GPU->>NIC: 触发 RDMA Write<br/>(GPU 直接控制 NIC)
        Note over NIC: GPU Direct RDMA:<br/>数据从 GPU HBM → NIC<br/>不经 CPU/系统内存
        NIC->>D_NIC: InfiniBand 400 GB/s
        D_NIC->>D_MEM: 直接写入远端 GPU HBM
        Note over D_MEM: 远端 GPU 无感知<br/>数据已到达 HBM
    end

    rect rgb(255, 230, 245)
        Note over D_GPU,D_MEM: Step 4: Decode 读取 KV Cache
        D_GPU->>D_MEM: 从本地 HBM 读取 K,V
        D_GPU->>D_GPU: Attention 计算
    end
      `} />

      <h4>GPU Direct RDMA 原理</h4>
      <p>Transfer Engine 的核心优势在于 <strong>GPU Direct RDMA</strong>：数据从源 GPU 显存直接通过 RDMA 网卡到达目标 GPU 显存，全程不经过 CPU 和系统内存。这消除了传统网络传输中的两次内存拷贝（GPU→CPU→NIC / NIC→CPU→GPU）。</p>

      <table>
        <thead><tr><th>传输路径</th><th>数据流</th><th>延迟</th><th>带宽</th></tr></thead>
        <tbody>
          <tr><td><strong>传统 Socket 传输</strong></td><td>GPU HBM → CPU DDR → NIC → 网络 → NIC → CPU DDR → GPU HBM</td><td>高（2 次 cudaMemcpy）</td><td>受 PCIe 带宽限制</td></tr>
          <tr><td><strong>GPUDirect RDMA</strong></td><td>GPU HBM → NIC → 网络 → NIC → GPU HBM</td><td>低（0 次 cudaMemcpy）</td><td>400 GB/s (IB NDR)</td></tr>
        </tbody>
      </table>

      <h4>Transfer Engine 传输协议选择</h4>
      <table>
        <thead><tr><th>协议</th><th>触发条件</th><th>带宽</th><th>P/D 分离场景</th></tr></thead>
        <tbody>
          <tr><td><strong>NVLink</strong></td><td>同节点内 P → D（同一台机器的不同 GPU）</td><td>900 GB/s</td><td>Prefill GPU 0 → Decode GPU 1（同节点）</td></tr>
          <tr><td><strong>RDMA (IB)</strong></td><td>跨节点 P → D（不同机器，有 InfiniBand）</td><td>400 GB/s</td><td>Prefill 节点 A → Decode 节点 B（跨节点）</td></tr>
          <tr><td><strong>TCP/IP</strong></td><td>跨节点 P → D（无 RDMA，降级方案）</td><td>100 GbE</td><td>无 IB 网络的低成本集群</td></tr>
        </tbody>
      </table>

      <CodeBlock language="python" title="Transfer Engine P/D 数据传输核心实现" code={`class MooncakeTransferEngine:
    """Mooncake Transfer Engine: NVIDIA 平台 P/D 数据传输"""

    def __init__(self, metadata_server: str):
        self.metadata_server = metadata_server
        self.registered_buffers: dict[str, RDMAContext] = {}

    # ===== P/D 分离核心流程 =====

    def register_kv_buffer(self, gpu_ptr: int, size: int) -> str:
        """注册 GPU HBM 为 RDMA 可访问内存 (MR)"""
        # 1. 通过 cudaGetDevice 获取当前 GPU
        cuda_ctx = cuda_get_current_context()

        # 2. 注册为 RDMA Memory Region
        mr = ibv_reg_mr(
            pd=self.rdma_pd,
            addr=gpu_ptr,
            length=size,
            access=(IBV_ACCESS_LOCAL_WRITE |
                    IBV_ACCESS_REMOTE_WRITE |
                    IBV_ACCESS_REMOTE_READ),
        )

        # 3. 获取远程访问密钥
        rkey = mr.rkey
        handle = self._allocate_handle()
        self.registered_buffers[handle] = {
            'mr': mr, 'rkey': rkey, 'addr': gpu_ptr, 'size': size
        }
        return handle

    def prefill_to_decode_transfer(self, blocks: list[KVBlock],
                                    src_gpu: int, dst_node: str):
        """P/D 分离: Prefill GPU → Decode GPU 传输"""
        # 1. 获取远端 Decode GPU 的 RDMA 信息
        remote_info = self.metadata_server.get_remote_info(dst_node)
        # remote_info = {'addr': 0x..., 'rkey': 0x..., 'qp': ...}

        # 2. 建立 RDMA 连接
        qp = self._connect_qp(src_gpu, remote_info['qp'])

        # 3. Layer-wise Pipeline 传输
        for layer_id in range(blocks[0].num_layers):
            for block in blocks:
                kv_layer = block.get_kv_layer(layer_id)
                # GPU Direct RDMA Write:
                #   数据从 src GPU HBM → NIC → 网络 → dst GPU HBM
                #   全程不经过 CPU
                self._rdma_write(
                    qp=qp,
                    src_addr=kv_layer.gpu_ptr,      # 源 GPU HBM 地址
                    dst_addr=remote_info['addr'],    # 目标 GPU HBM 地址
                    dst_rkey=remote_info['rkey'],    # 远端 MR 密钥
                    size=kv_layer.byte_size,
                )
            # 传输 layer_id 的同时，Prefill 继续计算 layer_id+1

        # 4. 等待所有 RDMA 操作完成
        self._poll_completion(qp)

    def _rdma_write(self, qp, src_addr, dst_addr, dst_rkey, size):
        """GPU Direct RDMA Write: 绕过 CPU 直接写入远端 GPU HBM"""
        # 构造 RDMA Work Request
        wr = ibv_send_wr()
        wr.opcode = IBV_WR_RDMA_WRITE        # 单边写入
        wr.send_flags = IBV_SEND_SIGNALED     # 完成后通知
        wr.wr.rdma.remote_addr = dst_addr     # 远端目标地址
        wr.wr.rdma.rkey = dst_rkey            # 远端访问密钥

        # 提交到 Send Queue → GPU 直接控制 NIC 执行
        ibv_post_send(qp, wr)`} />

      {/* ==================== 6.2 HIXL Engine (Ascend) ==================== */}
      <h3>HIXL Engine（Ascend 平台）</h3>

      <p>HIXL（Huawei Interconnect Acceleration Library）是华为昇腾平台的<strong>单边零拷贝通信库</strong>，在 Mooncake 架构中作为 Ascend NPU 的传输引擎。与 Transfer Engine 不同，HIXL 采用<strong>单边通信模型</strong>：本地 NPU 准备好数据后，通过单边操作直接写入远端 NPU 内存，无需远端节点参与。</p>

      <h4>P/D 分离下的数据传输机制</h4>

      <MermaidDiagram maxWidth={520} chart={`
sequenceDiagram
    participant P_NPU as Prefill NPU (A3)
    participant P_HBM as NPU HBM
    participant HIXL as HIXL Engine
    participant NIC as RNIC
    participant D_NIC as RNIC
    participant D_HIXL as HIXL Engine
    participant D_HBM as NPU HBM
    participant D_NPU as Decode NPU (A3)

    Note over P_NPU,D_NPU: === HIXL Engine (Ascend) P/D 数据传输 ===

    rect rgb(230, 240, 255)
        Note over P_NPU,HIXL: Step 1: 内存注册
        P_NPU->>HIXL: register_memory(NPU_HBM_ptr, size)
        HIXL->>HIXL: 分配 Memory Handle
        Note over HIXL: 注册为远端可访问内存<br/>(类似 RDMA MR)
    end

    rect rgb(230, 255, 230)
        Note over P_NPU,P_HBM: Step 2: Prefill 产生 KV Cache
        P_NPU->>P_NPU: Layer i Forward Pass
        P_NPU->>P_HBM: 写入 K_i, V_i 到 HBM
    end

    rect rgb(255, 245, 230)
        Note over HIXL,D_HBM: Step 3: 单边零拷贝传输
        P_NPU->>HIXL: transfer_async(src, dst, size)
        HIXL->>HIXL: 协议选择: HCCS / RDMA / UB
        alt 同节点 (HCCS 119 GB/s)
            HIXL->>P_HBM: 读取 K,V
            HIXL->>D_HBM: HCCS 片间直连写入
        else 跨节点 (RDMA 22 GB/s)
            HIXL->>P_HBM: 读取 K,V
            HIXL->>NIC: 通过 RNIC 发送
            NIC->>D_NIC: RDMA 网络
            D_NIC->>D_HBM: 直接写入远端 HBM
        end
        Note over D_NPU: 远端 NPU 无感知<br/>数据已到达 HBM
    end

    rect rgb(255, 230, 245)
        Note over D_NPU,D_HBM: Step 4: Decode 读取 KV Cache
        D_NPU->>D_HBM: 从本地 HBM 读取 K,V
        D_NPU->>D_NPU: Attention 计算
    end
      `} />

      <h4>单边通信 vs 双边通信</h4>
      <p>HIXL 的核心优势在于<strong>单边通信模型</strong>，与传统双边通信有本质区别：</p>

      <table>
        <thead><tr><th>维度</th><th>传统双边通信</th><th>HIXL 单边通信</th></tr></thead>
        <tbody>
          <tr><td><strong>通信握手</strong></td><td>发送方发起 → 接收方确认 → 开始传输</td><td>发送方直接写入远端内存，无需确认</td></tr>
          <tr><td><strong>远端 CPU 参与</strong></td><td>需要远端 CPU 处理接收请求</td><td>远端 CPU 零参与</td></tr>
          <tr><td><strong>内存拷贝</strong></td><td>至少 2 次（发送缓冲 → 网络 → 接收缓冲）</td><td>0 次（直接写入远端 HBM）</td></tr>
          <tr><td><strong>延迟</strong></td><td>高（握手 + 拷贝）</td><td>低（仅传输延迟）</td></tr>
          <tr><td><strong>适用场景</strong></td><td>通用数据传输</td><td>KV Cache 等确定性大块传输</td></tr>
        </tbody>
      </table>

      <h4>HIXL 多协议传输</h4>
      <table>
        <thead><tr><th>协议</th><th>带宽</th><th>触发条件</th><th>P/D 分离场景</th></tr></thead>
        <tbody>
          <tr><td><strong>HCCS</strong></td><td>119 GB/s</td><td>同节点内 P → D（同节点不同 NPU）</td><td>Prefill NPU 0 → Decode NPU 1（同节点，片间直连）</td></tr>
          <tr><td><strong>RDMA</strong></td><td>22 GB/s</td><td>跨节点 P → D（不同节点，有 RNIC）</td><td>Prefill 节点 A → Decode 节点 B（跨节点）</td></tr>
          <tr><td><strong>UB (URMA)</strong></td><td>取决于配置</td><td>A5 芯片跨节点 P → D</td><td>下一代 A5 芯片跨节点传输</td></tr>
        </tbody>
      </table>

      <CodeBlock language="python" title="HIXL Engine P/D 数据传输核心实现" code={`class HIXLEngine:
    """HIXL Engine: Ascend 平台 P/D 数据传输 (单边零拷贝)"""

    def __init__(self):
        self.engine = hixl.Engine()
        self.registered: dict[int, MemoryHandle] = {}

    # ===== P/D 分离核心流程 =====

    def init_pd_transfer(self, local_dev: int, remote_dev: int,
                         protocol: str = "hccs"):
        """初始化 P/D 传输通道"""
        self.engine.init({
            "devices": [local_dev, remote_dev],
            "protocol": protocol,  # hccs / rdma / ub
            "links_per_dev": 4,    # 多链路并行
        })

    def register_kv_buffer(self, dev_id: int, npu_ptr: int,
                           size: int) -> MemoryHandle:
        """注册 NPU HBM 为远端可访问内存"""
        handle = self.engine.register_memory(
            ptr=npu_ptr,
            size=size,
            flags=hixl.MEM_DEVICE,  # 设备内存 (HBM)
        )
        self.registered[dev_id] = handle
        return handle

    def prefill_to_decode_transfer_async(self, blocks: list[KVBlock],
                                          src_dev: int, dst_dev: int):
        """P/D 分离: Prefill NPU → Decode NPU (单边异步)"""
        remote_handle = self.registered[dst_dev]

        futures = []
        for layer_id in range(blocks[0].num_layers):
            for block in blocks:
                kv_layer = block.get_kv_layer(layer_id)

                # 单边异步传输:
                #   源 NPU → HIXL Engine → 直接写入远端 NPU HBM
                #   远端 NPU 无需 CPU 参与
                future = self.engine.transfer_async(
                    link=self._get_link(src_dev, dst_dev),
                    src=kv_layer.npu_ptr,           # 源 NPU HBM 地址
                    dst=remote_handle.remote_addr,  # 目标 NPU HBM 地址
                    size=kv_layer.byte_size,
                )
                futures.append(future)

            # 传输 layer_id 的同时计算 layer_id+1
            # (Layer-wise Pipeline)

        # 等待所有传输完成
        for f in futures:
            f.wait()

    def _get_link(self, src_dev: int, dst_dev: int):
        """获取设备间链路"""
        # 首次调用时建立连接
        return self.engine.connect(
            local_dev=src_dev,
            remote_dev=dst_dev,
            remote_mem=self.registered[dst_dev],
        )`} />

      {/* ==================== 6.3 两种引擎对比 ==================== */}
      <h3>两种传输引擎全面对比</h3>

      <h4>P/D 分离数据传输流程对比</h4>

      <MermaidDiagram maxWidth={520} chart={`
graph TB
    subgraph NVIDIA["Transfer Engine &#40;NVIDIA&#41;"]
        direction TB
        N1["Prefill GPU<br/>H100/A100"]
        N2["GPU Direct RDMA<br/>GPU HBM → NIC → 网络"]
        N3["Decode GPU<br/>L40S/A10"]
        N4["特点: GPU 直接控制 NIC<br/>全程不经过 CPU"]
    end

    subgraph Ascend["HIXL Engine &#40;Ascend&#41;"]
        direction TB
        A1["Prefill NPU<br/>A3/A5"]
        A2["单边零拷贝<br/>NPU HBM → HIXL → 远端 HBM"]
        A3["Decode NPU<br/>A3/A5"]
        A4["特点: 远端 NPU CPU 零参与<br/>零内存拷贝"]
    end

    N1 --> N2 --> N3
    A1 --> A2 --> A3
      `} />

      <table>
        <thead><tr><th>对比维度</th><th>Transfer Engine (NVIDIA)</th><th>HIXL Engine (Ascend)</th></tr></thead>
        <tbody>
          <tr><td><strong>通信模型</strong></td><td>GPU Direct RDMA（GPU 控制 NIC）</td><td>单边零拷贝（HIXL Engine 控制）</td></tr>
          <tr><td><strong>CPU 参与</strong></td><td>仅初始化，传输过程不参与</td><td>完全不需要 CPU 参与</td></tr>
          <tr><td><strong>内存拷贝次数</strong></td><td>0 次（GPU HBM → NIC → GPU HBM）</td><td>0 次（HBM → HIXL → HBM）</td></tr>
          <tr><td><strong>同节点最高带宽</strong></td><td>NVLink: 900 GB/s</td><td>HCCS: 119 GB/s</td></tr>
          <tr><td><strong>跨节点最高带宽</strong></td><td>InfiniBand NDR: 400 GB/s</td><td>RDMA: 22 GB/s</td></tr>
          <tr><td><strong>传输协议</strong></td><td>NVLink / RDMA (IB) / TCP</td><td>HCCS / RDMA / UB (URMA)</td></tr>
          <tr><td><strong>多链路并行</strong></td><td>单链路（依赖硬件多 QP）</td><td>多链路（HIXL_E2E_LINKS_PER_DEV=4）</td></tr>
          <tr><td><strong>Layer-wise Pipeline</strong></td><td>✅ 逐层异步传输</td><td>✅ 逐层异步传输</td></tr>
          <tr><td><strong>去重传输</strong></td><td>✅ 内置</td><td>✅ 通过 LLM-DataDist V2</td></tr>
          <tr><td><strong>硬件抽象</strong></td><td>绑定 NVIDIA GPU</td><td>屏蔽 A2/A3/A5 代际差异</td></tr>
          <tr><td><strong>跨代兼容</strong></td><td>H100/A100/L40S 混用</td><td>A2/A3/A5 异构混合部署</td></tr>
          <tr><td><strong>D2H/H2D 支持</strong></td><td>通过 cudaMemcpy</td><td>原生 D2D / D2H / H2D 三模式</td></tr>
          <tr><td><strong>FabricMem</strong></td><td>❌ 无</td><td>✅ 超节点全局内存池</td></tr>
          <tr><td><strong>Host RoCE</strong></td><td>❌ 无</td><td>✅ 下一代芯片支持</td></tr>
          <tr><td><strong>通知机制</strong></td><td>RDMA Completion Queue</td><td>engine.notify() + signal</td></tr>
          <tr><td><strong>Python API</strong></td><td>✅ 通过 pybind11</td><td>✅ 原生 pybind11</td></tr>
          <tr><td><strong>适用硬件</strong></td><td>NVIDIA GPU (H100/A100/L40S)</td><td>Ascend NPU (A2/A3/A5)</td></tr>
          <tr><td><strong>生产验证</strong></td><td>Kimi 40万+ GPU</td><td>vllm-ascend / sglang</td></tr>
        </tbody>
      </table>

      <h4>P/D 分离场景下的选型建议</h4>

      <table>
        <thead><tr><th>场景</th><th>推荐引擎</th><th>原因</th></tr></thead>
        <tbody>
          <tr><td><strong>NVIDIA GPU 集群</strong></td><td>Transfer Engine</td><td>GPU Direct RDMA 400 GB/s，配套生态最成熟</td></tr>
          <tr><td><strong>Ascend NPU 集群</strong></td><td>HIXL Engine</td><td>单边零拷贝，原生适配 Ascend 硬件</td></tr>
          <tr><td><strong>NVIDIA + Ascend 混合</strong></td><td>两者共存</td><td>Master Server 根据节点类型自动选择 Connector</td></tr>
          <tr><td><strong>同节点 P/D 配对</strong></td><td>Transfer Engine (NVLink) / HIXL (HCCS)</td><td>同节点带宽最高，延迟最低，P/D 分离最优解</td></tr>
          <tr><td><strong>超大规模跨节点</strong></td><td>Transfer Engine (RDMA)</td><td>InfiniBand 400 GB/s 优势明显</td></tr>
          <tr><td><strong>需要 D2H/H2D 分层存储</strong></td><td>HIXL Engine</td><td>原生 D2H/H2D 支持，方便 KV Cache 下沉到 CPU DDR</td></tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>关键差异总结：</strong>
        <ul>
          <li><strong>Transfer Engine</strong> 依赖 GPU Direct RDMA，需要 NVIDIA GPU + InfiniBand 网卡，带宽高但硬件绑定强</li>
          <li><strong>HIXL Engine</strong> 单边零拷贝通信，支持跨代硬件混用，灵活性更高但跨节点带宽受限于 Ascend 硬件</li>
          <li>两者在 P/D 分离场景下的<strong>逻辑流程一致</strong>：Prefill 产生 KV Cache → 逐层传输 → Decode 读取，差异仅在底层传输机制</li>
          <li>Mooncake Master Server 通过统一的 <code>TransferEngine</code> 接口屏蔽底层差异，实现<strong>一次开发，多平台部署</strong></li>
        </ul>
      </Callout>

      {/* ==================== 7. 与 vLLM P/D 分离对比 ==================== */}
      <div className="section-divider"><span>与 vLLM P/D 分离对比</span></div>

      <table>
        <thead><tr><th>维度</th><th>Mooncake</th><th>vLLM Disaggregated</th></tr></thead>
        <tbody>
          <tr><td><strong>设计哲学</strong></td><td>KVCache 为中心，传输优先</td><td>调度为中心，兼容优先</td></tr>
          <tr><td><strong>传输引擎</strong></td><td>自研 Transfer Engine (RDMA/TCP)</td><td>NIXL / NCCL / Mooncake 可插拔</td></tr>
          <tr><td><strong>Master 调度</strong></td><td>全局 Master + 拓扑感知</td><td>KVTransferAgent + 分布式协调</td></tr>
          <tr><td><strong>GPU 异构</strong></td><td>✅ 原生支持</td><td>✅ 支持</td></tr>
          <tr><td><strong>去重传输</strong></td><td>✅ 内置</td><td>❌</td></tr>
          <tr><td><strong>Layer-wise Pipeline</strong></td><td>✅ 内置</td><td>✅ 支持</td></tr>
          <tr><td><strong>生产规模</strong></td><td>40 万+ GPU (Kimi)</td><td>大规模部署</td></tr>
          <tr><td><strong>开源协议</strong></td><td>Apache 2.0</td><td>Apache 2.0</td></tr>
        </tbody>
      </table>

      <ResourceTable resources={[
        { name: 'Mooncake 论文', url: 'https://arxiv.org/abs/2407.00079', desc: 'Mooncake: A KVCache-Centric Disaggregated Architecture for LLM Serving' },
        { name: 'Mooncake 源码', url: 'https://github.com/kvcache-ai/Mooncake', desc: 'Mooncake 社区版 KV Cache 传输框架' },
        { name: 'HIXL (Ascend 适配)', url: 'https://gitcode.com/cann/hixl', desc: '昇腾单边通信库，Mooncake Ascend 传输引擎' },
        { name: 'Mooncake KVPool 指南', url: 'https://gitcode.com/cann/hixl/wiki/Mooncake-KVPool%E6%8C%87%E5%8D%97', desc: 'Mooncake KVPool Ascend 部署指南' },
        { name: 'Splitwise 论文', url: 'https://arxiv.org/abs/2311.18677', desc: 'P/D 分离架构先驱，Mooncake 参考设计' },
        { name: 'DistServe 论文', url: 'https://arxiv.org/abs/2401.09670', desc: 'Disaggregated Prefill and Decoding for LLM Serving' },
      ]} />
    </div>
  );
}