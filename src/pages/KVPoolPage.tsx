import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, CodeBlock, ResourceTable } from '../components/CodeBlock';

export function KVPoolPage() {
  return (
    <div className="prose max-w-none">
      <h1>KV Pool</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-08</span>
        <span className="page-meta-item">⏱️ 阅读约 35 分钟</span>
        <span className="page-meta-item">🏷️ 专题 · 缓存池化</span>
      </div>
      <p>KV Pool 是将 KV Cache 从<strong>单请求独占</strong>升级为<strong>跨请求/跨节点共享</strong>的缓存池化技术。通过中心化存储、分布式传输和智能淘汰，实现 KV Cache 的高效复用，降低重复计算和显存浪费。</p>

      {/* ==================== 1. 概念与动机 ==================== */}
      <div className="section-divider"><span>概念与动机</span></div>

      <h3>从单请求 KV Cache 到 KV Pool</h3>
      <MermaidDiagram chart={`
graph TB
    subgraph Single["传统: 单请求独占"]
        R1["请求 A → KV Cache A"]
        R2["请求 B → KV Cache B"]
        R3["请求 C → KV Cache C"]
    end
    subgraph Pool["KV Pool: 共享池化"]
        P["KV Pool 共享池"]
        R4["请求 A → 复用前缀"]
        R5["请求 B → 复用前缀"]
        R6["请求 C → 复用前缀"]
        P --> R4
        P --> R5
        P --> R6
    end
    Single --> Pool
    Note1["相同前缀重复计算"]
    Note2["一次计算，多次复用"]
    Single --> Note1
    Pool --> Note2
      `} />

      <h3>核心问题</h3>
      <table>
        <thead><tr><th>问题</th><th>传统方案</th><th>KV Pool 方案</th></tr></thead>
        <tbody>
          <tr><td><strong>跨请求复用</strong></td><td>仅同进程内前缀缓存</td><td>跨请求、跨节点共享</td></tr>
          <tr><td><strong>显存利用率</strong></td><td>每 GPU 独立管理，碎片化</td><td>池化统一管理，按需分配</td></tr>
          <tr><td><strong>P/D 分离传输</strong></td><td>全量拷贝 KV Cache</td><td>增量传输 + 去重</td></tr>
          <tr><td><strong>弹性扩缩</strong></td><td>新实例冷启动，无缓存</td><td>从 KV Pool 预热加载</td></tr>
          <tr><td><strong>跨模型共享</strong></td><td>不支持</td><td>同架构模型可共享部分层</td></tr>
        </tbody>
      </table>

      {/* ==================== 2. Mooncake KV Pool ==================== */}
      <div className="section-divider"><span>Mooncake KV Pool</span></div>

      <h3>核心架构</h3>
      <p>Mooncake（月之暗面/Kimi）以<strong>分布式 KV Cache 传输和池化</strong>为核心，通过 RDMA 实现 GPU 间零拷贝 KV Cache 传输。</p>

      <MermaidDiagram chart={`
graph TB
    subgraph Mooncake["Mooncake KV Pool 架构"]
        MS["Master Server<br/>全局元数据管理"]
        TS["Transfer Server<br/>RDMA 传输引擎"]
        MS["Metadata Store<br/>KV 块位置索引"]

        subgraph Pool["KV Pool 存储层"]
            CPU["CPU Memory Pool<br/>大容量 DRAM"]
            SSD["NVMe SSD Pool<br/>冷数据持久化"]
        end

        subgraph GPU["GPU 计算层"]
            G1["GPU 0<br/>Prefill"]
            G2["GPU 1<br/>Prefill"]
            G3["GPU 2<br/>Decode"]
            G4["GPU 3<br/>Decode"]
        end
    end

    G1 --> TS
    G2 --> TS
    TS --> Pool
    Pool --> G3
    Pool --> G4
      `} />

      <h3>传输机制</h3>
      <CodeBlock language="python" title="Mooncake Transfer Engine 核心" code={`class MooncakeTransferEngine:
    """Mooncake KV Cache 传输引擎"""

    def __init__(self, metadata_server: str):
        # 连接全局元数据服务器
        self.master = connect_to_master(metadata_server)
        # RDMA 注册 GPU 显存区域
        self.rdma_ctx = register_rdma_memory()

    def put_kv_cache(self, session_id: str, blocks: list[Block]):
        """将 KV Cache 写入分布式 KV Pool"""
        # 1. 向 Master 申请存储位置
        locations = self.master.allocate(session_id, len(blocks))

        # 2. RDMA Write 直接写入目标节点内存 (GPU Direct)
        for block, loc in zip(blocks, locations):
            self.rdma_ctx.write(
                src=block.gpu_ptr,        # GPU 显存地址
                dst=loc.remote_addr,      # 远程 CPU/GPU 地址
                size=block.size_bytes,
            )

        # 3. 更新元数据索引
        self.master.commit(session_id, locations)

    def get_kv_cache(self, session_id: str) -> list[Block]:
        """从 KV Pool 读取 KV Cache"""
        # 1. 查询 block 位置
        locations = self.master.lookup(session_id)

        # 2. RDMA Read 直接读取到本地 GPU 显存
        blocks = []
        for loc in locations:
            gpu_buf = allocate_gpu_buffer(loc.size)
            self.rdma_ctx.read(
                src=loc.remote_addr,
                dst=gpu_buf,
                size=loc.size,
            )
            blocks.append(Block(gpu_buf))

        return blocks`} />

      <h3>存储层级</h3>
      <table>
        <thead><tr><th>层级</th><th>介质</th><th>容量</th><th>延迟</th><th>用途</th></tr></thead>
        <tbody>
          <tr><td><strong>L1: GPU HBM</strong></td><td>HBM3e</td><td>80 GB/GPU</td><td>~1 μs</td><td>当前活跃请求的 KV Cache</td></tr>
          <tr><td><strong>L2: CPU DRAM</strong></td><td>DDR5</td><td>TB 级/节点</td><td>~100 ns (本地)</td><td>热数据缓存，跨请求复用</td></tr>
          <tr><td><strong>L3: NVMe SSD</strong></td><td>NVMe SSD</td><td>数十 TB</td><td>~10 μs</td><td>冷数据持久化，跨会话复用</td></tr>
          <tr><td><strong>L4: 分布式 KV Pool</strong></td><td>远程 DRAM</td><td>PB 级</td><td>~1-5 μs (RDMA)</td><td>跨节点共享，全局前缀缓存</td></tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>Mooncake 的核心创新：</strong>
        <ul>
          <li><strong>GPU Direct RDMA</strong>：KV Cache 直接从 GPU HBM 传输到远程 GPU HBM，无需经过 CPU，零拷贝</li>
          <li><strong>拓扑感知调度</strong>：根据网络拓扑（NVLink/NVSwitch/IB）自动选择最优传输路径</li>
          <li><strong>Layer-wise 传输</strong>：Prefill 还在进行时就开始传输已完成层的 KV Cache，Pipeline 隐藏传输延迟</li>
          <li><strong>去重存储</strong>：相同前缀的 KV Cache 只存一份，通过引用计数管理</li>
        </ul>
      </Callout>

      {/* ==================== 2.5. 内存共享机制详解 ==================== */}
      <div className="section-divider"><span>内存共享机制详解</span></div>

      <h3>核心问题：多 GPU/多节点如何看到同一块 KV Cache</h3>
      <p>在 KV Pool 中，<strong>多个推理实例（GPU/节点）需要共享同一份 KV Cache 数据</strong>。这需要解决三个核心问题：寻址（如何找到数据）、访问（如何读取数据）、一致性（如何保证数据正确）。</p>

      <h3>全局页表 (Global Page Table)</h3>
      <p>KV Pool 维护一个<strong>全局页表</strong>，将逻辑 block ID 映射到物理存储位置：</p>

      <MermaidDiagram chart={`
graph TB
    subgraph GPT["全局页表 (Master Server)"]
        PT["Page Table Map<br/>block_hash → PhysicalLocation"]
    end

    subgraph Logical["逻辑视图 (每个请求)"]
        L1["Request A<br/>BlockTable: [hash_a1, hash_a2, hash_a3]"]
        L2["Request B<br/>BlockTable: [hash_a1, hash_b2, hash_b3]"]
    end

    subgraph Physical["物理存储 (多节点)"]
        P1["Node 0 GPU HBM<br/>block_a1: ref_cnt=2"]
        P2["Node 0 CPU DRAM<br/>block_a2, block_b2"]
        P3["Node 1 GPU HBM<br/>block_a3, block_b3"]
    end

    L1 --> PT
    L2 --> PT
    PT --> Physical
    Note1["block_a1 被两个请求共享<br/>ref_cnt=2，不可淘汰"]
    L1 --> Note1
    L2 --> Note1
      `} />

      <CodeBlock language="python" title="全局页表实现" code={`class GlobalPageTable:
    """分布式 KV Pool 的全局页表

    核心数据结构：PageTable 将 block_hash 映射到物理存储位置。
    多个推理实例通过查询页表定位所需 KV block 的物理地址，
    然后通过 RDMA 直接读取，无需经过 Master 中转数据。
    """

    def __init__(self):
        # block_hash → PageTableEntry
        self.page_table: dict[int, PageTableEntry] = {}
        # 每个物理节点的存储容量和负载
        self.nodes: dict[str, NodeInfo] = {}

    def allocate(self, block_hashes: list[int],
                 preferred_node: str = None) -> list[PhysicalLocation]:
        """为新 block 分配物理存储位置"""
        locations = []
        for h in block_hashes:
            # 1. 去重检查：如果已存在，增加引用计数
            if h in self.page_table:
                entry = self.page_table[h]
                entry.ref_count += 1
                locations.append(entry.location)
                continue

            # 2. 选择存储节点 (负载均衡 + 拓扑感知)
            node = self._select_node(preferred_node)

            # 3. 在目标节点上分配内存
            location = self.nodes[node].allocator.allocate(
                size=BLOCK_SIZE_BYTES,
                tier=MemoryTier.CPU_DRAM  # 默认写入 CPU DRAM
            )

            # 4. 创建页表项
            self.page_table[h] = PageTableEntry(
                location=location,
                ref_count=1,
                create_time=time.time(),
                last_access=time.time(),
            )
            locations.append(location)
        return locations

    def lookup(self, block_hashes: list[int]) -> list[PhysicalLocation]:
        """查找 block 物理位置（读操作）"""
        locations = []
        for h in block_hashes:
            if h not in self.page_table:
                raise CacheMissError(f"Block {h} not found")
            entry = self.page_table[h]
            entry.last_access = time.time()  # 更新访问时间 (LRU)
            locations.append(entry.location)
        return locations

    def release(self, block_hashes: list[int]):
        """释放引用"""
        for h in block_hashes:
            if h in self.page_table:
                entry = self.page_table[h]
                entry.ref_count -= 1
                if entry.ref_count == 0:
                    # 引用计数归零，标记为可淘汰
                    self._mark_evictable(h)

    def _select_node(self, preferred: str = None) -> str:
        """选择最优存储节点"""
        if preferred and self.nodes[preferred].free_space > BLOCK_SIZE_BYTES:
            return preferred
        # 选择空闲空间最多的节点
        return max(self.nodes.items(), key=lambda n: n[1].free_space)[0]


@dataclass
class PageTableEntry:
    """页表项"""
    location: PhysicalLocation   # 物理地址
    ref_count: int               # 引用计数 (共享此 block 的请求数)
    create_time: float           # 创建时间
    last_access: float           # 最后访问时间 (LRU 淘汰依据)


@dataclass
class PhysicalLocation:
    """物理存储位置"""
    node_id: str                 # 节点 ID
    memory_tier: MemoryTier      # 存储层级 (HBM / DRAM / SSD)
    base_addr: int               # 内存基地址 (RDMA 可寻址)
    size_bytes: int              # Block 大小
    block_hash: int              # 对应的 block hash`} />

      <h3>引用计数共享模型</h3>
      <p>多个请求共享同一个 block 时，通过<strong>引用计数</strong>管理生命周期。这是 KV Pool 内存共享的<strong>最核心机制</strong>：</p>

      <MermaidDiagram chart={`
stateDiagram-v2
    [*] --> Free: 初始化
    Free --> Allocated: allocate(ref_cnt=1)
    Allocated --> Shared: 新请求命中 (ref_cnt++)
    Shared --> Shared: 更多请求命中 (ref_cnt++)
    Shared --> Allocated: 请求完成 (ref_cnt--)
    Allocated --> Evictable: ref_cnt=0
    Evictable --> Free: LRU 淘汰
    Evictable --> Allocated: 新请求命中 (ref_cnt=1)
    Free --> Allocated: 重新分配
      `} />

      <CodeBlock language="python" title="引用计数共享示例" code={`# ===== 场景：3 个请求共享 system prompt 的 KV Cache =====

# 请求 A 到达，计算 system prompt 的 KV Cache
pool = DistributedKVPool()
block_hashes = [hash(tokens_0_15), hash(tokens_16_31), hash(tokens_32_47)]
# 分配: ref_cnt=1 for each block
locations = pool.allocate(block_hashes)
pool.store(locations, kv_cache_blocks)

# 请求 B 到达，system prompt 相同
# lookup 命中 → ref_cnt=2 (共享！)
locations = pool.lookup(block_hashes)  # 不分配新空间，只增加引用
pool.page_table[block_hashes[0]].ref_count  # = 2

# 请求 C 到达，system prompt 相同
# lookup 命中 → ref_cnt=3
locations = pool.lookup(block_hashes)
pool.page_table[block_hashes[0]].ref_count  # = 3

# 请求 A 完成
pool.release(block_hashes)
pool.page_table[block_hashes[0]].ref_count  # = 2

# 请求 B 完成
pool.release(block_hashes)
pool.page_table[block_hashes[0]].ref_count  # = 1

# 请求 C 完成
pool.release(block_hashes)
pool.page_table[block_hashes[0]].ref_count  # = 0 → 可淘汰

# 关键：3 个请求共享同一份 KV Cache，内存只占用 1 份
# 物理内存占用 = 1 × (3 blocks × 16 tokens × KV_size)
# 而非 3 × ...`} />

      <h3>不同共享模式对比</h3>
      <table>
        <thead><tr><th>共享模式</th><th>数据位置</th><th>访问方式</th><th>一致性</th><th>适用场景</th></tr></thead>
        <tbody>
          <tr><td><strong>同 GPU 共享</strong></td><td>同一 GPU HBM</td><td>直接指针引用</td><td>天然一致</td><td>同进程内多请求 (vLLM PagedAttention)</td></tr>
          <tr><td><strong>同节点跨 GPU 共享</strong></td><td>GPU HBM (NVLink)</td><td>NVLink P2P 访问</td><td>硬件保证</td><td>TP 多卡推理</td></tr>
          <tr><td><strong>跨节点 GPU 共享</strong></td><td>远程 GPU HBM</td><td>RDMA Read/Write</td><td>需引用计数保护</td><td>Mooncake 分布式 KV Pool</td></tr>
          <tr><td><strong>CPU DRAM 共享</strong></td><td>节点 CPU DRAM</td><td>RDMA / GPU Direct</td><td>只读共享 (KV Cache 不可变)</td><td>热数据缓存池</td></tr>
          <tr><td><strong>SSD 持久化共享</strong></td><td>NVMe SSD</td><td>PCIe DMA → GPU</td><td>只读</td><td>冷数据 / 跨会话复用</td></tr>
        </tbody>
      </table>

      <Callout type="info">
        <strong>为什么 KV Cache 天然适合共享？</strong>KV Cache 一旦写入就<strong>不可变</strong>（immutable）。
        在 Decode 阶段，每步新增的 K、V 追加到新 block，历史 block 内容不变。
        这意味着不需要复杂的读写锁或 MVCC，只需引用计数管理生命周期即可。
      </Callout>

      {/* ==================== 2.6. 分层存储 HBM→DRAM→SSD ==================== */}
      <div className="section-divider"><span>分层存储：HBM → DRAM → SSD</span></div>

      <h3>为什么需要分层存储</h3>
      <p>GPU HBM 容量有限（80GB/卡）但延迟极低（~1μs），CPU DRAM 容量大（TB 级/节点）但需通过 PCIe 访问（~10μs），NVMe SSD 容量更大（数十 TB）但延迟更高（~100μs）。分层存储<strong>按访问热度自动迁移数据</strong>，在容量和延迟之间取得平衡。</p>

      <h3>分层架构总览</h3>
      <MermaidDiagram chart={`
graph TB
    subgraph L1["L1: GPU HBM (80GB/GPU)"]
        ACTIVE["活跃 KV Cache<br/>当前正在 decode 的请求"]
        PREFETCH["预取 Buffer<br/>预测即将需要的 block"]
    end

    subgraph L2["L2: CPU DRAM (TB 级/节点)"]
        HOT["热数据<br/>近期访问过的 KV Cache"]
        SHARED["共享前缀<br/>多请求共用的 system prompt"]
    end

    subgraph L3["L3: NVMe SSD (数十 TB)"]
        COLD["冷数据<br/>历史会话的 KV Cache"]
        CHECKPOINT["会话快照<br/>长会话持久化"]
    end

    L1 -->|"evict (LRU)"| L2
    L2 -->|"prefetch (投机)"| L1
    L2 -->|"swap out (冷数据下沉)"| L3
    L3 -->|"swap in (会话恢复)"| L2
    L3 -->|"direct load (大块)"| L1
      `} />

      <h3>数据迁移策略</h3>
      <CodeBlock language="python" title="分层存储管理器" code={`class TieredStorageManager:
    """管理 HBM → DRAM → SSD 三级存储的数据迁移"""

    def __init__(self):
        self.tiers = {
            MemoryTier.GPU_HBM:  GPUTier(capacity_gb=80),
            MemoryTier.CPU_DRAM: CPUTier(capacity_gb=512),
            MemoryTier.NVME_SSD: SSDTier(capacity_gb=2000),
        }
        # 访问热度追踪
        self.access_tracker = AccessTracker(window_seconds=60)

    # ===== 晋升 (Promotion): 低层 → 高层 =====

    def promote_to_gpu(self, block_hash: int) -> int:
        """将 block 从 DRAM/SSD 提升到 GPU HBM"""
        entry = self.page_table[block_hash]

        if entry.location.tier == MemoryTier.GPU_HBM:
            return entry.location.base_addr  # 已在 GPU

        # 1. 在 GPU HBM 分配空间
        gpu_addr = self.tiers[GPU_HBM].allocate(BLOCK_SIZE)

        # 2. 从当前层读取数据
        if entry.location.tier == MemoryTier.CPU_DRAM:
            # CPU DRAM → GPU HBM (PCIe DMA)
            self._dma_transfer(
                src=entry.location.base_addr,  # CPU 物理地址
                dst=gpu_addr,                   # GPU 虚拟地址
                size=BLOCK_SIZE,
                direction='HOST_TO_DEVICE'
            )
        elif entry.location.tier == MemoryTier.NVME_SSD:
            # SSD → GPU HBM (GPUDirect Storage)
            self._gds_read(
                file_offset=entry.location.base_addr,
                dst=gpu_addr,
                size=BLOCK_SIZE
            )

        # 3. 更新页表
        entry.location = PhysicalLocation(
            node_id=local_node(),
            memory_tier=MemoryTier.GPU_HBM,
            base_addr=gpu_addr,
            size_bytes=BLOCK_SIZE,
            block_hash=block_hash,
        )
        return gpu_addr

    # ===== 降级 (Demotion/Eviction): 高层 → 低层 =====

    def evict_from_gpu(self, block_hash: int):
        """GPU HBM 空间不足时，将 block 降级到 CPU DRAM"""
        entry = self.page_table[block_hash]

        if entry.ref_count > 0:
            raise BlockInUseError("Cannot evict block with active references")

        # 1. 在 CPU DRAM 分配空间
        cpu_addr = self.tiers[CPU_DRAM].allocate(BLOCK_SIZE)

        # 2. GPU HBM → CPU DRAM (PCIe DMA)
        self._dma_transfer(
            src=entry.location.base_addr,
            dst=cpu_addr,
            size=BLOCK_SIZE,
            direction='DEVICE_TO_HOST'
        )

        # 3. 释放 GPU 空间，更新页表
        self.tiers[GPU_HBM].free(entry.location.base_addr)
        entry.location = PhysicalLocation(
            node_id=local_node(),
            memory_tier=MemoryTier.CPU_DRAM,
            base_addr=cpu_addr,
            size_bytes=BLOCK_SIZE,
            block_hash=block_hash,
        )

    def swap_to_ssd(self, block_hash: int):
        """CPU DRAM 空间不足时，下沉到 NVMe SSD"""
        entry = self.page_table[block_hash]
        # 写入 SSD，释放 DRAM
        ssd_offset = self.tiers[NVME_SSD].allocate(BLOCK_SIZE)
        self._write_ssd(entry.location.base_addr, ssd_offset, BLOCK_SIZE)
        self.tiers[CPU_DRAM].free(entry.location.base_addr)
        entry.location = PhysicalLocation(
            node_id=local_node(),
            memory_tier=MemoryTier.NVME_SSD,
            base_addr=ssd_offset,
            size_bytes=BLOCK_SIZE,
            block_hash=block_hash,
        )`} />

      <h3>各级存储的迁徙触发条件</h3>
      <table>
        <thead><tr><th>迁徙方向</th><th>触发条件</th><th>延迟</th><th>带宽</th></tr></thead>
        <tbody>
          <tr><td><strong>SSD → DRAM</strong></td><td>请求命中冷数据，需恢复会话</td><td>~100 μs</td><td>~7 GB/s (NVMe Gen4)</td></tr>
          <tr><td><strong>DRAM → GPU HBM</strong></td><td>Prefill 开始前预取 / Decode 需要访问</td><td>~10 μs</td><td>~64 GB/s (PCIe 4.0 x16)</td></tr>
          <tr><td><strong>GPU HBM → DRAM</strong></td><td>GPU HBM 水位超过 80% / 请求完成且 ref_cnt=0</td><td>~10 μs</td><td>~64 GB/s (PCIe 4.0 x16)</td></tr>
          <tr><td><strong>DRAM → SSD</strong></td><td>DRAM 水位超过 80% / 超过 TTL 未访问</td><td>~100 μs</td><td>~7 GB/s (NVMe Gen4)</td></tr>
          <tr><td><strong>GPU HBM → GPU HBM</strong></td><td>跨节点传输 (RDMA)</td><td>~1-5 μs</td><td>~400 GB/s (IB NDR)</td></tr>
        </tbody>
      </table>

      <h3>投机预取 (Speculative Prefetch)</h3>
      <p>为避免 Decode 阶段等待数据从 DRAM/SSD 加载到 GPU HBM，KV Pool 使用<strong>投机预取</strong>提前加载可能需要的 block：</p>

      <CodeBlock language="python" title="投机预取策略" code={`class PrefetchStrategies:
    """KV block 投机预取策略"""

    def prefetch_for_decode(self, request: Request):
        """为 Decode 阶段预取 KV block"""
        # 策略 1: 顺序预取
        # Decode 按顺序访问 block，预取下一个 block
        next_block = request.current_block + 1
        if next_block in request.block_table:
            self.pool.async_promote_to_gpu(next_block)

        # 策略 2: 注意力分数预取 (InfiniGen)
        # 用最后几层的 Attention 分数预测哪些 block 最相关
        scores = self._compute_attention_scores(request.last_query)
        top_blocks = torch.topk(scores, k=5).indices
        for b in top_blocks:
            self.pool.async_promote_to_gpu(b)

        # 策略 3: 前缀延伸预取
        # 如果当前请求的前缀被多个请求共享，
        # 预取这些请求后续用到的 block
        sibling_blocks = self._find_sibling_blocks(request.prefix_hash)
        for b in sibling_blocks[:3]:
            self.pool.async_promote_to_gpu(b)

    def prefetch_for_prefill(self, request: Request):
        """为 Prefill 阶段预取 KV block"""
        # 策略: 前缀匹配预取
        # 计算新请求的 prompt 前缀哈希
        prefix_hashes = self._compute_prefix_hashes(request.prompt_tokens)
        # 查找最长匹配前缀
        hit_hashes = self.pool.batch_lookup(prefix_hashes)
        # 预取所有命中的 block 到 GPU HBM
        for h in hit_hashes:
            self.pool.async_promote_to_gpu(h)`} />

      <Callout type="warning">
        <strong>分层存储的关键权衡：</strong>
        <ul>
          <li><strong>GPU HBM 容量</strong>：决定同时可服务的活跃请求数。80GB HBM 中约 60% 给 KV Cache，约 48GB</li>
          <li><strong>DRAM 容量</strong>：决定热数据缓存命中率。DRAM 越大，命中率越高，但成本也越高</li>
          <li><strong>SSD 容量</strong>：决定跨会话复用能力。SSD 持久化可实现"关闭浏览器后回来，对话上下文还在"</li>
          <li><strong>PCIe 带宽</strong>：DRAM ↔ GPU 的瓶颈。64 GB/s 意味着加载 1GB KV Cache 需要 ~16ms，可能超过 TTFT SLA</li>
        </ul>
      </Callout>

      {/* ==================== 2.7. P/D分离模式下的 KV Pool 交互 ==================== */}
      <div className="section-divider"><span>P/D 分离模式下的 KV Pool 交互</span></div>

      <h3>完整交互流程</h3>
      <p>在 P/D 分离架构中，Prefill 节点负责计算 KV Cache 并写入 KV Pool，Decode 节点从 KV Pool 读取 KV Cache 进行逐 token 生成。KV Pool 是两者的<strong>数据桥梁</strong>。</p>

      <MermaidDiagram chart={`
sequenceDiagram
    participant Client as Client
    participant Router as Router
    participant Master as Master Server (元数据)
    participant Prefill as Prefill GPU (计算)
    participant Pool as KV Pool (存储)
    participant Decode as Decode GPU (生成)

    Client->>Router: POST /v1/completions
    Router->>Router: 路由决策
    Router->>Master: 请求 Prefill 节点
    Master-->>Router: 分配 Prefill GPU 2

    Note over Prefill,Pool: === Phase 1: Prefill + 写入 KV Pool ===
    Router->>Prefill: 发送 prefill 请求
    Prefill->>Prefill: Tokenize + Prefill (计算所有层)
    Prefill->>Master: 申请 KV Pool 存储位置
    Master-->>Prefill: 返回 PhysicalLocation 列表
    Prefill->>Pool: Layer-wise RDMA Write (GPU Direct)
    Note over Pool: 每层 Prefill 完成后立即传输<br/>Pipeline: 层 N 传输时层 N+1 正在计算
    Prefill->>Master: commit (元数据写入完成)

    Note over Decode,Pool: === Phase 2: Decode 从 Pool 读取 ===
    Master->>Router: 通知 KV Cache 就绪
    Router->>Master: 请求 Decode 节点
    Master-->>Router: 分配 Decode GPU 5 (拓扑最近)
    Router->>Decode: 发送 decode 请求 + block 元数据

    Decode->>Master: lookup(block_hashes)
    Master-->>Decode: 返回 PhysicalLocation 列表
    Decode->>Decode: 投机预取：提前加载前几个 block
    Decode->>Pool: RDMA Read (分批预取)

    loop Decode Loop (逐 token 生成)
        Decode->>Decode: Step 1: 生成 token
        Decode-->>Client: SSE: token
        Decode->>Decode: 追加新 KV block (本地 GPU HBM)
        Note over Decode: 新生成的 token 写入本地<br/>不从 Pool 读取
    end

    Decode-->>Client: SSE: [DONE]
    Decode->>Master: release(block_hashes) (ref_cnt--)
    Note over Pool: ref_cnt=0 的 block 标记为可淘汰
      `} />

      <h3>Layer-wise Pipeline 传输</h3>
      <p>P/D 分离的核心优化：<strong>Prefill 还在进行时就开始传输已完成层的 KV Cache</strong>，将传输延迟隐藏在计算中。</p>

      <MermaidDiagram chart={`
gantt
    title Layer-wise Pipeline: Prefill 计算 + KV 传输 重叠
    dateFormat X
    axisFormat %s

    section Prefill GPU
    Layer 0-7 计算  :p0, 0, 2
    Layer 8-15 计算 :p1, 2, 4
    Layer 16-23 计算:p2, 4, 6
    Layer 24-31 计算:p3, 6, 8

    section KV Pool
    接收 Layer 0-7  :t0, 2, 4
    接收 Layer 8-15 :t1, 4, 6
    接收 Layer 16-23:t2, 6, 8
    接收 Layer 24-31:t3, 8, 10

    section Decode GPU
    等待+预取       :d0, 2, 4
    预取 Layer 0-15 :d1, 4, 6
    Decode Step 1   :d2, 6, 7
    Decode Step 2   :d3, 7, 8
      `} />

      <CodeBlock language="python" title="Layer-wise Pipeline 传输实现" code={`class LayerWiseTransferPipeline:
    """分层的 KV Cache 传输 Pipeline

    核心思想：不等待所有层 Prefill 完成，而是每完成一层就传输一层。
    传输时间被隐藏在后续层的 Prefill 计算中，显著降低端到端延迟。
    """

    def __init__(self, transfer_engine: TransferEngine):
        self.engine = transfer_engine
        self.pending_transfers: dict[int, Future] = {}  # layer_id → Future

    async def prefill_with_pipeline(self, request: Request):
        """Pipeline 式 Prefill: 计算 + 传输重叠"""
        block_hashes = request.block_hashes  # 预先计算好的 block 哈希

        for layer_id in range(self.num_layers):
            # Step 1: 计算当前层的 KV Cache
            kv_cache = self.model.run_layer(layer_id, request.hidden_states)

            # Step 2: 获取当前层对应的 block 信息
            layer_blocks = self._get_layer_blocks(layer_id, block_hashes)

            # Step 3: 异步传输当前层 KV Cache 到 KV Pool
            # 不等待传输完成，立即开始计算下一层
            future = self.engine.async_send(
                blocks=layer_blocks,
                kv_data=kv_cache,
                dst_locations=request.pool_locations[layer_id],
            )
            self.pending_transfers[layer_id] = future

            # Step 4: 更新 hidden_states 供下一层使用
            request.hidden_states = kv_cache.output

        # Step 5: 等待所有传输完成
        for layer_id, future in self.pending_transfers.items():
            await future
            # 传输完成后通知 Master
            await self.master.mark_layer_ready(request.id, layer_id)

    async def decode_with_prefetch(self, request: Request):
        """Decode 端：边预取边生成"""
        # 分批预取 KV block
        batch_size = 4  # 每批预取 4 个 block

        for i in range(0, len(request.block_hashes), batch_size):
            batch = request.block_hashes[i:i + batch_size]

            # 查找物理位置
            locations = await self.master.lookup(batch)

            # 异步预取到 GPU HBM
            prefetch_futures = []
            for loc in locations:
                f = self.engine.async_recv(loc)
                prefetch_futures.append(f)

            # 如果这是第一批，等待预取完成后再开始 decode
            if i == 0:
                for f in prefetch_futures:
                    await f
                # 开始 decode
                self.model.start_decode(request)
            # 后续批次在后台预取，不阻塞 decode
            else:
                # 注册回调，预取完成后更新 block table
                for j, f in enumerate(prefetch_futures):
                    f.add_done_callback(
                        lambda b=batch[j]: self._on_block_ready(b)
                    )

# 性能收益:
# 无 Pipeline: Prefill(100ms) + 传输(20ms) + Decode(500ms) = 620ms
# 有 Pipeline: Prefill(100ms) + Decode(500ms) = 600ms
# 传输 20ms 被完全隐藏 (重叠在 Prefill 计算中)`} />

      <h3>Decode 节点如何发现并获取 KV Cache</h3>
      <p>Decode 节点不直接知道 KV Cache 存储在哪个物理节点。它通过以下流程获取：</p>

      <table>
        <thead><tr><th>步骤</th><th>操作</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><strong>1. 接收元数据</strong></td><td>Router 转发 block_hashes 列表</td><td>Decode 节点收到 token 序列的 block 哈希列表，不需要知道物理位置</td></tr>
          <tr><td><strong>2. 查询 Master</strong></td><td><code>lookup(block_hashes)</code> → PhysicalLocation[]</td><td>Master 返回每个 block 的物理存储位置（节点+地址+层级）</td></tr>
          <tr><td><strong>3. 拓扑排序</strong></td><td>按网络距离对 locations 排序</td><td>优先从 NVLink 直连节点读取，其次 IB 同交换机，最后跨交换机</td></tr>
          <tr><td><strong>4. 分批预取</strong></td><td>RDMA Read 分批加载到 GPU HBM</td><td>前 4 个 block 同步加载（启动 decode），其余异步预取</td></tr>
          <tr><td><strong>5. 构建 Block Table</strong></td><td>将 GPU HBM 地址映射到本地 block table</td><td>Decode 的 Attention 算子通过 block table 间接访问 KV Cache</td></tr>
          <tr><td><strong>6. 开始 Decode</strong></td><td>逐 token 生成，追加本地 KV block</td><td>新生成的 token 的 KV Cache 存储在本地 GPU HBM，不写入 KV Pool</td></tr>
        </tbody>
      </table>

      <h3>多 Prefill / 多 Decode 的负载均衡</h3>
      <MermaidDiagram chart={`
graph TB
    subgraph Router2["Router"]
        R["Cache-Aware Router"]
    end

    subgraph PrefillPool["Prefill Pool (3 GPU)"]
        P1["Prefill GPU 0<br/>负责 hash 前缀 0x0-0x5"]
        P2["Prefill GPU 1<br/>负责 hash 前缀 0x6-0xA"]
        P3["Prefill GPU 2<br/>负责 hash 前缀 0xB-0xF"]
    end

    subgraph DecodePool["Decode Pool (5 GPU)"]
        D1["Decode GPU 0<br/>会话 1, 4"]
        D2["Decode GPU 1<br/>会话 2, 5"]
        D3["Decode GPU 2<br/>会话 3"]
        D4["Decode GPU 3<br/>空闲"]
        D5["Decode GPU 4<br/>空闲"]
    end

    R -->|"前缀路由"| PrefillPool
    PrefillPool -->|"写入"| Pool2["KV Pool"]
    Pool2 -->|"拓扑感知分发"| DecodePool
    Note["Decode 节点选择策略:<br/>1. 优先空闲 GPU<br/>2. 优先靠近 KV Pool 数据的 GPU<br/>3. 优先已有同会话上下文的 GPU"]
    Pool2 --> Note
      `} />

      <Callout type="tip">
        <strong>P/D 分离 + KV Pool 的核心收益：</strong>
        <ul>
          <li><strong>GPU 异构</strong>：Prefill 用高算力 GPU (H100)，Decode 用低成本 GPU (L40S)，总成本降低 30-50%</li>
          <li><strong>独立扩缩</strong>：长 prompt 场景扩容 Prefill Pool，长生成场景扩容 Decode Pool</li>
          <li><strong>故障隔离</strong>：Prefill 节点故障不影响正在 Decode 的请求（KV Cache 已在 Pool 中）</li>
          <li><strong>预热加速</strong>：新 Decode 节点启动时从 KV Pool 加载热门前缀，快速达到高缓存命中率</li>
          <li><strong>跨会话复用</strong>：SSD 持久化的 KV Cache 可在数小时/数天后仍被复用</li>
        </ul>
      </Callout>

      {/* ==================== 3. Ascend MemCache ==================== */}
      <div className="section-divider"><span>Ascend MemCache</span></div>

      <h3>项目定位</h3>
      <p>MemCache 是华为 Ascend 开源的<strong>高性能分布式 KV Cache 存储引擎</strong>，专为 AI 推理场景（LLM 推理 + GR 生成式推理）设计，已集成到 vllm-ascend、sglang 和 mindie 等推理框架中。2025 年 11 月开源，基于 MulanPSL2 协议。</p>

      <Callout type="info">
        <strong>与 Redis/Memcached 的本质区别：</strong>MemCache 不是通用缓存，而是专为 GPU 张量 KV Cache 设计的存储引擎。
        底层依赖 MemFabric 实现<strong>跨机器、跨介质直访（OneCopy）</strong>，支持 GPU Direct RDMA、SDMA 等硬件加速路径，而非传统 TCP 传输。
      </Callout>

      {/* ==================== 3.1. 核心架构 ==================== */}
      <h3>核心架构：MetaService + LocalService</h3>
      <p>MemCache 由<strong>两个核心组件</strong>组成，采用分离式管控架构：</p>

      <MermaidDiagram chart={`
graph TB
    subgraph Meta["MetaService (管控面)"]
        MS["集群元数据管理<br/>内存池分配/回收"]
        HA["HA 模式<br/>K8s ClusterIP + Lease"]
        META_API["RESTful API<br/>metrics 监控"]
    end

    subgraph Local["LocalService (数据面)"]
        subgraph Client["Client 角色"]
            API["C++ / Python API<br/>put/get/exist/remove"]
            BATCH["批量操作<br/>KV Block 读写"]
        end
        subgraph Provider["Memory Provider 角色"]
            POOL["提供连续内存区域<br/>纳入全局 KV Pool"]
            TIER["多级存储<br/>HBM → DDR → SSD"]
        end
    end

    subgraph Frameworks["推理框架集成"]
        VLLM["vllm-ascend<br/>KV Pool 后端"]
        SGL["sglang<br/>KV Cache 加速"]
        MD["mindie<br/>Ascend 推理"]
    end

    Meta --> Local
    Local --> Frameworks
    MS --> HA
      `} />

      <table>
        <thead><tr><th>组件</th><th>角色</th><th>运行方式</th><th>职责</th></tr></thead>
        <tbody>
          <tr><td><strong>MetaService</strong></td><td>管控面</td><td>独立进程 (Python API / 二进制)</td><td>集群内存池全局分配、LocalService 加入/退出管理、元数据恢复</td></tr>
          <tr><td><strong>LocalService</strong></td><td>数据面</td><td>共享库 (whl/so) 加载到应用进程</td><td>双重角色：Client（API 接入）+ Memory Provider（提供内存区域）</td></tr>
        </tbody>
      </table>

      <h3>两种部署模式</h3>
      <table>
        <thead><tr><th>模式</th><th>架构</th><th>优点</th><th>缺点</th></tr></thead>
        <tbody>
          <tr><td><strong>单点模式</strong></td><td>1 个 MetaService 实例</td><td>部署简单，适合小规模测试</td><td>单点故障风险</td></tr>
          <tr><td><strong>HA 模式</strong></td><td>K8s ClusterIP Service + Lease 多实例</td><td>高可用，元数据恢复</td><td>依赖 K8s 集群</td></tr>
        </tbody>
      </table>

      {/* ==================== 3.2. 多级存储与 MemFabric ==================== */}
      <h3>多级存储：HBM → DDR → SSD</h3>
      <p>MemCache 实现<strong>三级缓存池</strong>，通过 MemFabric 底层实现跨介质数据迁移：</p>

      <MermaidDiagram chart={`
graph TB
    subgraph MemCache["MemCache 多级 KV Pool"]
        subgraph HBM["L1: HBM (NPU 片上)"]
            H1["热 KV Cache<br/>当前活跃请求"]
            H2["预取 Buffer<br/>投机预取 block"]
        end
        subgraph DDR["L2: DDR (主机内存)"]
            D1["温数据<br/>近期访问的 block"]
            D2["共享前缀池<br/>system prompt 等"]
        end
        subgraph SSD["L3: NVMe SSD"]
            S1["冷数据<br/>历史会话 KV Cache"]
            S2["会话快照<br/>跨会话持久化"]
        end
    end

    subgraph MemFabric["MemFabric 传输层"]
        OC["OneCopy 直访<br/>跨机器 + 跨介质"]
        RH2D["RH2D: Host→Device 直访"]
        D2RH["D2RH: Device→Host 直访"]
    end

    HBM -->|"evict 降级"| DDR
    DDR -->|"prefetch 晋升"| HBM
    DDR -->|"swap out 下沉"| SSD
    SSD -->|"swap in 恢复"| DDR
    HBM --> MemFabric
    DDR --> MemFabric
    SSD --> MemFabric
      `} />

      <h3>MemFabric：OneCopy 跨介质直访</h3>
      <p>MemFabric 是 MemCache 的底层传输基座，核心创新是 <strong>OneCopy</strong>：跨机器、跨介质直接数据访问，消除中间拷贝。不同 Ascend 芯片支持不同的硬件加速路径：</p>

      <table>
        <thead><tr><th>硬件路径</th><th>支持芯片</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><code>device_rdma</code></td><td>A2 (Ascend 910B)</td><td>NPU 设备间 RDMA 直传</td></tr>
          <tr><td><code>device_sdma</code></td><td>A3 (Ascend 910C)</td><td>NPU 设备间 SDMA 直传</td></tr>
          <tr><td><code>host_rdma</code></td><td>A2 / A3</td><td>主机侧 RDMA 传输</td></tr>
          <tr><td><code>device_urma</code></td><td>A5 (下一代)</td><td>NPU 设备间 URMA 直传</td></tr>
          <tr><td><code>device_uboe</code></td><td>A5 (下一代)</td><td>NPU 设备间 UBoE 直传</td></tr>
          <tr><td><code>host_urma</code></td><td>K5 (鲲鹏)</td><td>鲲鹏 CPU 侧 URMA 传输</td></tr>
          <tr><td><code>host_shm</code></td><td>全部</td><td>同节点共享内存通信</td></tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>RH2D / D2RH 的关键价值：</strong>传统跨节点传输需要 GPU→CPU→NIC→NIC→CPU→GPU 六次拷贝。
        <strong>RH2D (Remote Host to Device)</strong> 和 <strong>D2RH (Device to Remote Host)</strong> 实现远端主机内存到本地 NPU 显存的直接访问，
        消除中间 CPU 中转，延迟降低 3-5x。
      </Callout>

      {/* ==================== 3.3. 内存共享实现 ==================== */}
      <h3>内存共享实现</h3>
      <p>MemCache 的内存共享基于<strong>LocalService 双角色</strong>设计：每个推理进程加载 LocalService 共享库，既是 Client 也是 Memory Provider。</p>

      <CodeBlock language="python" title="MemCache LocalService 内存共享" code={`# ===== MemCache 内存共享架构 =====
# 每个推理进程 = 1 个 LocalService 实例
# LocalService 同时扮演 Client 和 Memory Provider

class MemCacheLocalService:
    """MemCache 本地服务：双重角色"""

    def __init__(self, meta_addr: str, memory_pool_gb: int = 100):
        # 1. 连接 MetaService，注册本节点
        self.meta = connect_to_meta(meta_addr)

        # 2. Memory Provider 角色：提供本地内存区域
        #    注册到全局 KV Pool，供其他节点远程访问
        self.provider = MemoryProvider(
            hbm_gb=40,      # NPU HBM 贡献 40GB
            ddr_gb=80,      # CPU DDR 贡献 80GB
            ssd_gb=500,     # NVMe SSD 贡献 500GB
        )
        self.node_id = self.meta.register_provider(self.provider)

        # 3. Client 角色：提供 API 接口
        self.client = MemCacheClient(self.meta, self.node_id)

    # ===== Memory Provider 角色 =====

    def serve_memory_region(self) -> MemoryRegion:
        """提供本节点的连续内存区域，纳入全局 KV Pool"""
        return self.provider.get_region()

    def handle_remote_read(self, addr: int, size: int) -> bytes:
        """响应远程读取请求 (通过 MemFabric OneCopy)"""
        # 数据直接从本地 HBM/DDR/SSD 读取
        # 通过 MemFabric 硬件路径直传给远端
        return self.provider.read(addr, size)

    def handle_remote_write(self, addr: int, data: bytes):
        """响应远程写入请求"""
        self.provider.write(addr, data)

    # ===== Client 角色 =====

    def put(self, key: str, value: Tensor, tier: str = "auto"):
        """写入 KV Cache 到全局 KV Pool"""
        # 1. MetaService 分配存储位置
        location = self.meta.allocate(key, value.nbytes, tier)

        # 2. 通过 MemFabric 直写目标节点
        #    若目标在本地: 直接内存拷贝
        #    若目标在远端: MemFabric OneCopy (RH2D)
        self._write_by_fabric(location, value)

        # 3. 更新元数据
        self.meta.commit(key, location)

    def get(self, key: str) -> Tensor:
        """从全局 KV Pool 读取 KV Cache"""
        # 1. 查询 MetaService 获取物理位置
        location = self.meta.lookup(key)

        # 2. 通过 MemFabric 直读
        #    若在本地: 直接内存读取
        #    若在远端: MemFabric OneCopy (D2RH)
        data = self._read_by_fabric(location)

        return Tensor(data)

    def exist(self, key: str) -> bool:
        """检查 key 是否存在"""
        return self.meta.exists(key)

    def remove(self, key: str):
        """删除 KV Cache"""
        self.meta.deallocate(key)`} />

      <h3>共享模式：本地直访 vs 远端 OneCopy</h3>
      <MermaidDiagram chart={`
sequenceDiagram
    participant Proc1 as 推理进程 1 (Node A)
    participant LS1 as LocalService 1<br/>(Client + Provider)
    participant Meta as MetaService
    participant LS2 as LocalService 2<br/>(Provider)
    participant Proc2 as 推理进程 2 (Node B)

    Note over Proc1,Proc2: 场景：进程 1 写入 KV Cache，进程 2 读取

    Proc1->>LS1: put(key="sys_prompt_hash", value=KV_tensor)
    LS1->>Meta: allocate(key, size, tier="auto")
    Meta->>Meta: 选择最优存储节点 (负载均衡)
    Meta-->>LS1: location = Node B, DDR, addr=0x7000

    rect rgb(200, 230, 255)
        Note over LS1,LS2: MemFabric OneCopy: D2RH 直传
        LS1->>LS2: MemFabric Write (NPU HBM → Remote DDR)
        Note over LS2: 数据直接写入 Node B 的 DDR<br/>无需经过 CPU 中转
    end

    LS1->>Meta: commit(key, location)

    Proc2->>LS2: get(key="sys_prompt_hash")
    LS2->>Meta: lookup(key)
    Meta-->>LS2: location = Node B, DDR, addr=0x7000

    rect rgb(200, 255, 200)
        Note over LS2: 数据在本地 DDR → 直接读取
        LS2->>LS2: 本地 DDR 读取 (host_shm)
    end

    LS2-->>Proc2: KV_tensor
      `} />

      {/* ==================== 3.4. KV Block 操作接口 ==================== */}
      <h3>KV Block 操作接口</h3>
      <p>MemCache 提供<strong>面向对象的 KV Block 操作 API</strong>，支持批量和非批量操作。KV Cache 被抽象为多级 block 结构（layer → block → tensor）：</p>

      <CodeBlock language="python" title="MemCache KV Block API" code={`# ===== MemCache Python API (memcache-hybrid) =====
# 安装: pip install memcache-hybrid

from memcache import MemCacheClient, KVTensor

# 1. 初始化客户端
client = MemCacheClient(
    meta_addr="192.168.1.1:50051",
    local_memory_gb=100,  # 本节点贡献的内存
)

# 2. 批量写入 KV Block (Put)
#    每个 block 包含多层的 K、V 张量
blocks = {
    "block_hash_001": {
        "layer_0": KVTensor(k=torch.randn(16, 8, 128), v=torch.randn(16, 8, 128)),
        "layer_1": KVTensor(k=torch.randn(16, 8, 128), v=torch.randn(16, 8, 128)),
        # ... 更多层
    },
    "block_hash_002": { ... },
}
# 批量写入，MemFabric 自动选择硬件路径
client.put_batch(blocks)

# 3. 批量读取 KV Block (Get)
hashes = ["block_hash_001", "block_hash_002", "block_hash_003"]
result = client.get_batch(hashes)  # 返回 dict[str, KVTensor]
# result["block_hash_001"] → KVTensor

# 4. 存在性检查 (Exist)
existing = client.exist_batch(hashes)
# existing = {"block_hash_001": True, "block_hash_002": True, "block_hash_003": False}

# 5. 删除 KV Block (Remove)
client.remove_batch(["block_hash_001"])

# 6. 高级接口：指定存储层级
client.put(
    key="hot_prefix",
    value=kv_tensor,
    tier="HBM",       # 强制存入 HBM (热数据)
    ttl=3600,         # TTL 1 小时
)
client.put(
    key="cold_prefix",
    value=kv_tensor,
    tier="SSD",       # 存入 SSD (冷数据持久化)
    ttl=86400,        # TTL 24 小时
)`} />

      <table>
        <thead><tr><th>API</th><th>批量</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><code>put(key, value, tier, ttl)</code></td><td><code>put_batch</code></td><td>写入 KV Cache，可指定存储层级和 TTL</td></tr>
          <tr><td><code>get(key)</code></td><td><code>get_batch</code></td><td>读取 KV Cache，MemFabric 自动选择传输路径</td></tr>
          <tr><td><code>exist(key)</code></td><td><code>exist_batch</code></td><td>检查 block 是否存在，用于前缀缓存命中判断</td></tr>
          <tr><td><code>remove(key)</code></td><td><code>remove_batch</code></td><td>显式删除 KV Cache，释放存储空间</td></tr>
        </tbody>
      </table>

      {/* ==================== 3.5. vllm-ascend 集成 ==================== */}
      <h3>vllm-ascend 集成</h3>
      <p>2025 年 12 月，MemCache 正式集成到 vllm-ascend 作为<strong>KV Pool 后端</strong>，为 Ascend NPU 推理提供分布式 KV Cache 共享能力。</p>

      <CodeBlock language="bash" title="vllm-ascend + MemCache 启动" code={`# 1. 启动 MetaService (HA 模式)
python -m memcache.meta_service \\
  --port 50051 \\
  --ha-mode \\
  --k8s-namespace memcache

# 2. 启动 vllm-ascend (自动加载 LocalService)
vllm serve Qwen/Qwen2-7B \\
  --kv-transfer-config '{"backend":"memcache","meta_addr":"memcache-meta:50051"}' \\
  --memcache-pool-gb 100 \\
  --tensor-parallel-size 8

# 3. MemCache 自动管理:
#    - 每个 TP worker 加载 LocalService 共享库
#    - 本地 HBM/DDR/SSD 自动注册到全局 KV Pool
#    - 跨节点 KV Cache 通过 MemFabric OneCopy 直访`} />

      <h3>PrefixCache 加速</h3>
      <p>2026 年 6 月发布的 PrefixCache 加速案例：</p>

      <table>
        <thead><tr><th>场景</th><th>无 MemCache</th><th>有 MemCache</th><th>加速比</th></tr></thead>
        <tbody>
          <tr><td><strong>多轮对话 (system prompt 复用)</strong></td><td>每次重新计算 system prompt</td><td>从 KV Pool 直接读取，命中率 {'>'} 90%</td><td>3-5x</td></tr>
          <tr><td><strong>Few-shot 推理</strong></td><td>每次计算完整 prompt</td><td>共享示例前缀，跨请求复用</td><td>2-3x</td></tr>
          <tr><td><strong>P/D 分离</strong></td><td>NCCL 全量传输</td><td>MemFabric 增量 + 去重</td><td>1.5-2x 传输效率</td></tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>MemCache 的核心优势：</strong>
        <ul>
          <li><strong>硬件原生加速</strong>：针对 Ascend A2/A3/A5 芯片提供不同硬件路径（RDMA/SDMA/URMA），非通用 TCP 方案</li>
          <li><strong>OneCopy 直访</strong>：RH2D/D2RH 跨机器跨介质直达，消除中间拷贝，延迟降低 3-5x</li>
          <li><strong>双角色设计</strong>：LocalService 既是 Client 又是 Memory Provider，每个进程都贡献内存，池化效率高</li>
          <li><strong>弹性伸缩</strong>：LocalService 支持动态加入/移除，K8s HA 模式支持元数据恢复</li>
          <li><strong>框架集成</strong>：已集成 vllm-ascend、sglang、mindie 三大推理框架</li>
          <li><strong>三级存储</strong>：HBM → DDR → SSD 自动冷热迁移，平衡容量与性能</li>
        </ul>
      </Callout>

      {/* ==================== 4. 业界方案全景 ==================== */}
      <div className="section-divider"><span>业界方案全景</span></div>

      <h3>4.1 InfiniGen (Harvard / MIT)</h3>
      <p>InfiniGen 提出<strong>投机 KV Cache 预取</strong>：在 Prefill 阶段预测 Decode 可能需要的 KV Cache，提前从 CPU 内存加载到 GPU HBM。</p>

      <CodeBlock language="python" title="InfiniGen 投机预取" code={`class InfiniGenPrefetcher:
    """投机 KV Cache 预取"""

    def prefetch(self, query: Tensor, kv_store: KVStore):
        """基于 Query 注意力分数预测需要预取的 KV block"""
        # 1. 用少量 Query 头计算近似注意力分数
        approx_scores = self._compute_approx_attention(query, kv_store.metadata)

        # 2. 选择 top-k 最相关的 KV block
        top_blocks = torch.topk(approx_scores, k=self.prefetch_k).indices

        # 3. 异步预取到 GPU HBM
        for block_id in top_blocks:
            kv_store.async_load_to_gpu(block_id)

        return top_blocks`} />

      <h3>4.2 FlexGen (Stanford / UC Berkeley)</h3>
      <p>FlexGen 提出<strong>GPU-CPU-Disk 三级卸载</strong>，将 KV Cache 和模型权重按需在 GPU/CPU/Disk 间移动，实现有限显存下运行超大模型。</p>

      <MermaidDiagram chart={`
graph TB
    subgraph FlexGen["FlexGen 三级卸载"]
        G["GPU HBM<br/>当前活跃 KV block"]
        C["CPU DRAM<br/>近期 KV Cache"]
        D["NVMe SSD<br/>冷 KV Cache"]

        G -->|"evict"| C
        C -->|"prefetch"| G
        C -->|"swap out"| D
        D -->|"swap in"| C
    end
      `} />

      <table>
        <thead><tr><th>方案</th><th>核心思想</th><th>存储层级</th><th>传输方式</th></tr></thead>
        <tbody>
          <tr><td><strong>FlexGen</strong></td><td>GPU-CPU-Disk 三级卸载</td><td>HBM + DRAM + SSD</td><td>PCIe / NVMe</td></tr>
          <tr><td><strong>Mooncake</strong></td><td>分布式 KV Pool + RDMA</td><td>HBM + DRAM + SSD + 远程</td><td>RDMA / GPU Direct</td></tr>
          <tr><td><strong>InfiniGen</strong></td><td>投机 KV 预取</td><td>HBM + CPU DRAM</td><td>PCIe</td></tr>
        </tbody>
      </table>

      <h3>4.3 CacheGen (CMU / Microsoft)</h3>
      <p>CacheGen 提出<strong>KV Cache 压缩编码</strong>：将 KV Cache 编码为紧凑的比特流，减少传输和存储开销。</p>

      <CodeBlock language="python" title="CacheGen 压缩编码" code={`class CacheGenEncoder:
    """KV Cache 压缩编码器"""

    def encode(self, kv_tensor: Tensor) -> bytes:
        """将 KV Cache 张量编码为压缩字节流"""
        # 1. 量化: FP16 → INT8
        quantized = quantize_to_int8(kv_tensor)

        # 2. 自定义编码: 利用 KV Cache 的数值特性
        #    - Key 相邻 token 间高度相似 → 差分编码
        #    - Value 在 Attention 后变化平缓 → 预测编码
        encoded = self._custom_encode(quantized)

        # 3. 通用压缩: Zstd/LZ4
        compressed = zstd.compress(encoded)

        return compressed

    def decode(self, compressed: bytes) -> Tensor:
        """解码为 KV Cache 张量"""
        encoded = zstd.decompress(compressed)
        quantized = self._custom_decode(encoded)
        return dequantize_to_fp16(quantized)

# 压缩比: 5-10x (相比原始 FP16)
# 编码开销: < 1ms / block`} />

      <h3>4.4 AttentionStore (KAIST)</h3>
      <p>AttentionStore 提出<strong>多模态 KV Cache 共享</strong>：不同模态（文本/图像/视频）的请求可共享部分 KV Cache 层。</p>

      <table>
        <thead><tr><th>共享粒度</th><th>说明</th><th>示例</th></tr></thead>
        <tbody>
          <tr><td><strong>完全共享</strong></td><td>相同 token 序列完全复用</td><td>相同 system prompt</td></tr>
          <tr><td><strong>前缀共享</strong></td><td>共享前缀，后半部分不同</td><td>多轮对话，Few-shot 示例</td></tr>
          <tr><td><strong>跨模态共享</strong></td><td>文本部分可跨模态复用</td><td>图+文和纯文共享文本前缀</td></tr>
          <tr><td><strong>层间共享</strong></td><td>浅层 KV Cache 可跨模型复用</td><td>同架构不同尺寸模型</td></tr>
        </tbody>
      </table>

      <h3>4.5 vLLM Multi-Node KV Cache</h3>
      <p>vLLM 的<strong>多节点 KV Cache 共享</strong>通过 KVTransferAgent 实现节点间 KV Cache 传输，支持 Disaggregated Serving。</p>

      <CodeBlock language="python" title="vLLM KVTransferAgent" code={`class KVTransferAgent:
    """vLLM 多节点 KV Cache 传输代理"""

    def __init__(self, config: KVTransferConfig):
        if config.backend == "nixl":
            self.engine = NIXLTransferEngine(config)
        elif config.backend == "mooncake":
            self.engine = MooncakeTransferEngine(config)
        elif config.backend == "p2p_nccl":
            self.engine = NCCLTransferEngine(config)

    def send_kv_cache(self, blocks: list[Block], dst_rank: int):
        """发送 KV Cache 到目标节点"""
        # 1. 收集 block 元数据
        metadata = [block.metadata() for block in blocks]

        # 2. 发送元数据 (控制面)
        self.engine.send_metadata(metadata, dst_rank)

        # 3. 发送 KV 数据 (数据面)
        for block in blocks:
            self.engine.send_tensor(block.kv_tensor, dst_rank)

    def recv_kv_cache(self, src_rank: int) -> list[Block]:
        """接收 KV Cache"""
        metadata = self.engine.recv_metadata(src_rank)
        blocks = []
        for meta in metadata:
            tensor = self.engine.recv_tensor(meta.size, src_rank)
            blocks.append(Block(tensor, meta))
        return blocks`} />

      {/* ==================== 5. 方案横评 ==================== */}
      <div className="section-divider"><span>方案横评</span></div>

      <table>
        <thead><tr><th>方案</th><th>存储架构</th><th>传输方式</th><th>压缩</th><th>跨节点</th><th>成熟度</th></tr></thead>
        <tbody>
          <tr><td><strong>Mooncake</strong></td><td>分布式 KV Pool + 多级存储</td><td>RDMA / GPU Direct</td><td>❌</td><td>✅</td><td>生产级 (Kimi)</td></tr>
          <tr><td><strong>Ascend MemCache</strong></td><td>MetaService + LocalService 双组件</td><td>MemFabric OneCopy (RDMA/SDMA/URMA)</td><td>❌</td><td>✅</td><td>生产级 (vllm-ascend)</td></tr>
          <tr><td><strong>MemCache KV Pool</strong></td><td>一致性哈希 + LRU 节点</td><td>RDMA / GPU Direct</td><td>❌</td><td>✅</td><td>概念验证</td></tr>
          <tr><td><strong>FlexGen</strong></td><td>GPU-CPU-Disk 三级</td><td>PCIe / NVMe</td><td>❌</td><td>❌</td><td>研究原型</td></tr>
          <tr><td><strong>InfiniGen</strong></td><td>GPU + CPU 预取</td><td>PCIe</td><td>❌</td><td>❌</td><td>研究原型</td></tr>
          <tr><td><strong>CacheGen</strong></td><td>压缩编码 + 传输</td><td>PCIe / RDMA</td><td>✅ 5-10x</td><td>✅</td><td>研究原型</td></tr>
          <tr><td><strong>AttentionStore</strong></td><td>多模态共享池</td><td>PCIe</td><td>❌</td><td>❌</td><td>研究原型</td></tr>
          <tr><td><strong>vLLM KVTransfer</strong></td><td>P2P 传输 + NIXL/Mooncake</td><td>NCCL / NIXL / RDMA</td><td>❌</td><td>✅</td><td>生产级</td></tr>
          <tr><td><strong>LMDeploy TurboMind</strong></td><td>动态 KV Cache 管理</td><td>NCCL</td><td>✅ INT8</td><td>✅</td><td>生产级</td></tr>
        </tbody>
      </table>

      {/* ==================== 6. 关键技术 ==================== */}
      <div className="section-divider"><span>关键技术</span></div>

      <h3>6.1 GPU Direct RDMA</h3>
      <p>GPU Direct RDMA 允许网卡直接读写 GPU 显存，<strong>绕过 CPU</strong>，实现真正的零拷贝 KV Cache 传输。</p>

      <MermaidDiagram chart={`
sequenceDiagram
    participant GPU1 as GPU 0 HBM
    participant NIC1 as NIC (Node 0)
    participant NIC2 as NIC (Node 1)
    participant GPU2 as GPU 1 HBM

    Note over GPU1,GPU2: 传统方式: GPU→CPU→NIC→NIC→CPU→GPU (6 次拷贝)
    Note over GPU1,GPU2: GPU Direct: GPU→NIC→NIC→GPU (2 次拷贝)

    GPU1->>NIC1: DMA Read (GPU 显存)
    NIC1->>NIC2: RDMA Send (InfiniBand)
    NIC2->>GPU2: DMA Write (GPU 显存)
    Note over GPU1,GPU2: 总延迟: ~1-2 μs (NVLink) / ~3-5 μs (IB)
      `} />

      <h3>6.2 一致性哈希 vs 中心化元数据</h3>
      <table>
        <thead><tr><th>方案</th><th>优点</th><th>缺点</th><th>代表</th></tr></thead>
        <tbody>
          <tr><td><strong>一致性哈希</strong></td><td>无中心节点，节点增减影响小</td><td>负载可能不均，迁移成本高</td><td>MemCache 风格</td></tr>
          <tr><td><strong>中心化元数据</strong></td><td>全局最优调度，负载均衡精确</td><td>Master 单点瓶颈，需 HA</td><td>Mooncake</td></tr>
          <tr><td><strong>Gossip 协议</strong></td><td>完全去中心化，高可用</td><td>收敛慢，一致性弱</td><td>大规模集群</td></tr>
        </tbody>
      </table>

      <h3>6.3 淘汰策略</h3>
      <CodeBlock language="python" title="KV Pool 淘汰策略" code={`class KVPoolEviction:
    """KV Pool 淘汰策略集合"""

    # 策略 1: LRU (Least Recently Used)
    # 淘汰最久未访问的 block
    def evict_lru(self, pool: KVPool, needed: int):
        sorted_blocks = sorted(pool.blocks, key=lambda b: b.last_access)
        return sorted_blocks[:needed]

    # 策略 2: LFU (Least Frequently Used)
    # 淘汰访问频率最低的 block
    def evict_lfu(self, pool: KVPool, needed: int):
        sorted_blocks = sorted(pool.blocks, key=lambda b: b.access_count)
        return sorted_blocks[:needed]

    # 策略 3: 引用计数保护
    # 正在使用的 block (ref_cnt > 0) 不可淘汰
    def evict_with_ref_protection(self, pool: KVPool, needed: int):
        candidates = [b for b in pool.blocks if b.ref_cnt == 0]
        sorted_candidates = sorted(candidates, key=lambda b: b.last_access)
        return sorted_candidates[:needed]

    # 策略 4: 优先级 + TTL
    # 高优先级请求的 KV Cache 保留更久
    def evict_priority_ttl(self, pool: KVPool, needed: int):
        def score(block):
            age = now() - block.create_time
            return block.priority * (1.0 / (age + 1))
        sorted_blocks = sorted(pool.blocks, key=score)
        return sorted_blocks[:needed]`} />

      {/* ==================== 7. 性能对比 ==================== */}
      <div className="section-divider"><span>性能对比</span></div>

      <h3>KV Cache 传输延迟 (Llama-3-70B, seq_len=8192, FP16)</h3>
      <table>
        <thead><tr><th>传输方式</th><th>数据量</th><th>带宽</th><th>延迟</th></tr></thead>
        <tbody>
          <tr><td><strong>GPU Direct RDMA (NVLink 4.0)</strong></td><td>~268 MB</td><td>900 GB/s</td><td>~0.3 ms</td></tr>
          <tr><td><strong>GPU Direct RDMA (IB NDR400)</strong></td><td>~268 MB</td><td>400 GB/s</td><td>~0.7 ms</td></tr>
          <tr><td><strong>PCIe Copy (GPU→CPU→GPU)</strong></td><td>~268 MB</td><td>64 GB/s</td><td>~4.2 ms</td></tr>
          <tr><td><strong>TCP/IP (100GbE)</strong></td><td>~268 MB</td><td>12.5 GB/s</td><td>~21 ms</td></tr>
          <tr><td><strong>CacheGen 压缩后 (RDMA)</strong></td><td>~30 MB (9x 压缩)</td><td>400 GB/s</td><td>~0.08 ms</td></tr>
        </tbody>
      </table>

      <h3>KV Pool 命中率对吞吐的影响</h3>
      <table>
        <thead><tr><th>命中率</th><th>相对吞吐</th><th>场景</th></tr></thead>
        <tbody>
          <tr><td><strong>0%</strong> (无缓存)</td><td>1.0x (基准)</td><td>每次请求都是全新 prompt</td></tr>
          <tr><td><strong>30%</strong></td><td>1.4x</td><td>部分公共前缀 (API 文档)</td></tr>
          <tr><td><strong>60%</strong></td><td>2.5x</td><td>多轮对话 (每轮命中前一整轮)</td></tr>
          <tr><td><strong>90%</strong></td><td>10x</td><td>Agent 工作负载 (大量重复前缀)</td></tr>
          <tr><td><strong>95%+</strong></td><td>20x</td><td>固定 system prompt + 短用户输入</td></tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>选型建议：</strong>
        <ul>
          <li><strong>单节点小规模</strong>：vLLM PagedAttention 内置前缀缓存，最简方案</li>
          <li><strong>多节点 P/D 分离</strong>：Mooncake KV Pool，生产验证，RDMA 零拷贝</li>
          <li><strong>低成本传输</strong>：CacheGen 压缩编码，5-10x 减少传输量</li>
          <li><strong>极致显存优化</strong>：FlexGen 三级卸载，有限显存运行大模型</li>
          <li><strong>跨模态共享</strong>：AttentionStore，多模态场景 KV 复用</li>
        </ul>
      </Callout>

      <ResourceTable resources={[
        { name: 'Mooncake 论文', url: 'https://arxiv.org/abs/2407.00079', desc: 'Mooncake: A KVCache-Centric Disaggregated Architecture for LLM Serving' },
        { name: 'Mooncake 源码', url: 'https://github.com/kvcache-ai/Mooncake', desc: '月之暗面开源 KV Cache 传输框架' },
        { name: 'FlexGen 论文', url: 'https://arxiv.org/abs/2303.06865', desc: 'FlexGen: High-Throughput Generative Inference of Large Language Models with a Single GPU' },
        { name: 'InfiniGen 论文', url: 'https://arxiv.org/abs/2406.19707', desc: 'InfiniGen: Efficient Generative Inference of Large Language Models with Speculative KV Cache Prefetching' },
        { name: 'CacheGen 论文', url: 'https://arxiv.org/abs/2310.07240', desc: 'CacheGen: KV Cache Compression and Streaming for Fast LLM Serving' },
        { name: 'AttentionStore 论文', url: 'https://arxiv.org/abs/2403.12527', desc: 'AttentionStore: Cost-Effective KV Cache Sharing for Multi-Modal LLM Serving' },
        { name: 'vLLM KVTransfer', url: 'https://docs.vllm.ai/en/latest/features/disagg_prefill.html', desc: 'vLLM 多节点 KV Cache 传输文档' },
        { name: 'NIXL', url: 'https://github.com/ai-dynamo/nixl', desc: 'NVIDIA In-Network Compute Library，GPU Direct 传输' },
      ]} />
    </div>
  );
}