import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, CodeBlock, ResourceTable } from '../components/CodeBlock';

export function MemCachePage() {
  return (
    <div className="prose max-w-none">
      <h1>Ascend MemCache</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-08</span>
        <span className="page-meta-item">⏱️ 阅读约 30 分钟</span>
        <span className="page-meta-item">🏷️ 专题 · KV Pool · Ascend</span>
      </div>
      <p>MemCache 是华为 Ascend 开源的<strong>高性能分布式 KV Cache 存储引擎</strong>，专为 AI 推理场景设计。基于 MemFabric 实现跨机器、跨介质直访（OneCopy），已集成到 vllm-ascend、sglang 和 mindie 等推理框架。2025 年 11 月开源，基于 MulanPSL2 协议。</p>

      {/* ==================== 1. 总体架构 ==================== */}
      <div className="section-divider"><span>总体架构</span></div>

      <h3>MetaService + LocalService 双组件</h3>
      <p>MemCache 采用<strong>分离式管控架构</strong>：MetaService 负责全局元数据管理，LocalService 负责数据面的内存提供和 API 接入。</p>

      <MermaidDiagram chart={`
graph TB
    subgraph Control["管控面: MetaService"]
        MS["集群元数据管理<br/>内存池分配/回收"]
        HA["HA 模式<br/>K8s ClusterIP + Lease"]
        MONITOR["RESTful API<br/>Metrics 监控"]
    end

    subgraph Data["数据面: LocalService x N"]
        subgraph Node1["Node 1"]
            LS1["LocalService<br/>Client + Provider"]
            subgraph T1["三级存储"]
                H1["HBM (NPU)"]
                D1["DDR (Host)"]
                S1["SSD (NVMe)"]
            end
        end
        subgraph Node2["Node 2"]
            LS2["LocalService<br/>Client + Provider"]
            subgraph T2["三级存储"]
                H2["HBM (NPU)"]
                D2["DDR (Host)"]
                S2["SSD (NVMe)"]
            end
        end
    end

    subgraph Transport["传输层: MemFabric"]
        OC["OneCopy 直访<br/>跨机器 + 跨介质"]
        HW["硬件路径<br/>RDMA/SDMA/URMA/UBoE/SHM"]
    end

    subgraph Frameworks["推理框架"]
        VLLM["vllm-ascend"]
        SGL["sglang"]
        MD["mindie"]
    end

    MS --> Node1
    MS --> Node2
    Node1 --> Transport
    Node2 --> Transport
    Transport --> Frameworks
      `} />

      <table>
        <thead><tr><th>组件</th><th>角色</th><th>运行方式</th><th>核心职责</th></tr></thead>
        <tbody>
          <tr><td><strong>MetaService</strong></td><td>管控面—全局调度</td><td>独立进程 (Python API / 二进制启动)</td><td>集群内存池全局分配、LocalService 加入/退出管理、K8s HA 模式下元数据恢复</td></tr>
          <tr><td><strong>LocalService</strong></td><td>数据面—双角色</td><td>共享库 (whl/so) 加载到推理进程</td><td><strong>Client</strong>：提供 put/get/exist/remove API；<strong>Memory Provider</strong>：贡献本地内存区域纳入全局 KV Pool</td></tr>
        </tbody>
      </table>

      <Callout type="info">
        <strong>LocalService 双角色是关键设计：</strong>每个推理进程加载 LocalService 共享库后，既是 KV Pool 的<strong>消费者</strong>（通过 API 读写 KV Cache），
        也是<strong>提供者</strong>（贡献本地的 HBM/DDR/SSD 内存区域）。这使得整个集群的内存资源被<strong>池化</strong>，而非每个节点独立管理。
      </Callout>

      {/* ==================== 2. 部署模式 ==================== */}
      <div className="section-divider"><span>部署模式</span></div>

      <h3>单点模式 vs HA 模式</h3>
      <table>
        <thead><tr><th>维度</th><th>单点模式</th><th>HA 模式</th></tr></thead>
        <tbody>
          <tr><td><strong>MetaService 实例</strong></td><td>1 个</td><td>多个 (K8s ClusterIP Service)</td></tr>
          <tr><td><strong>部署依赖</strong></td><td>无</td><td>Kubernetes 集群</td></tr>
          <tr><td><strong>Leader 选举</strong></td><td>—</td><td>K8s Lease 资源</td></tr>
          <tr><td><strong>元数据恢复</strong></td><td>不支持</td><td>支持 (best-effort HA)</td></tr>
          <tr><td><strong>动态扩缩</strong></td><td>LocalService 可动态加入/退出</td><td>LocalService 可动态加入/退出 + MetaService 多活</td></tr>
          <tr><td><strong>适用场景</strong></td><td>小规模测试、单机部署</td><td>生产环境、大规模集群</td></tr>
        </tbody>
      </table>

      <MermaidDiagram chart={`
graph TB
    subgraph Single["单点模式"]
        M1["MetaService<br/>(单实例)"]
        L1["LocalService 1"]
        L2["LocalService 2"]
        L3["LocalService 3"]
        M1 --> L1
        M1 --> L2
        M1 --> L3
    end

    subgraph HA["HA 模式 (K8s)"]
        SVC["ClusterIP Service"]
        MS1["MetaService Pod 1<br/>(Leader)"]
        MS2["MetaService Pod 2<br/>(Standby)"]
        MS3["MetaService Pod 3<br/>(Standby)"]
        LEASE["K8s Lease<br/>Leader 选举"]
        LS1["LocalService 1..N"]
        SVC --> MS1
        SVC --> MS2
        SVC --> MS3
        MS1 --> LEASE
        MS2 --> LEASE
        MS3 --> LEASE
        MS1 --> LS1
        MS2 --> LS1
        MS3 --> LS1
    end
      `} />

      {/* ==================== 3. 多级存储架构 ==================== */}
      <div className="section-divider"><span>多级存储：HBM → DDR → SSD</span></div>

      <h3>三级缓存池</h3>
      <p>MemCache 实现<strong>三级缓存池</strong>，按数据热度自动在 HBM、DDR、SSD 之间迁移，在容量和延迟之间取得平衡。</p>

      <MermaidDiagram chart={`
graph TB
    subgraph L1["L1: NPU HBM (片上高带宽)"]
        H_ACTIVE["活跃 KV Cache<br/>当前 decode 请求"]
        H_PREFETCH["预取 Buffer<br/>投机预取 block"]
        H_CAP["容量: 64-80 GB/卡<br/>延迟: ~1 μs<br/>介质: HBM3e"]
    end

    subgraph L2["L2: CPU DDR (主机内存)"]
        D_HOT["热数据<br/>近期访问的 block"]
        D_SHARED["共享前缀池<br/>system prompt 等"]
        D_CAP["容量: TB 级/节点<br/>延迟: ~10 μs (PCIe)<br/>介质: DDR5"]
    end

    subgraph L3["L3: NVMe SSD (持久化)"]
        S_COLD["冷数据<br/>历史会话 KV Cache"]
        S_SNAPSHOT["会话快照<br/>跨会话持久化"]
        S_CAP["容量: 数十 TB<br/>延迟: ~100 μs<br/>介质: NVMe SSD"]
    end

    H_ACTIVE -->|"evict (LRU)"| D_HOT
    D_HOT -->|"prefetch (投机)"| H_ACTIVE
    D_SHARED -->|"swap out (冷数据下沉)"| S_COLD
    S_COLD -->|"swap in (会话恢复)"| D_SHARED
    S_SNAPSHOT -->|"direct load (大块)"| H_PREFETCH
      `} />

      <h3>数据迁移策略</h3>
      <table>
        <thead><tr><th>迁徙方向</th><th>触发条件</th><th>延迟</th><th>带宽</th><th>实现</th></tr></thead>
        <tbody>
          <tr><td><strong>SSD → DDR</strong></td><td>请求命中冷数据，需恢复会话</td><td>~100 μs</td><td>~7 GB/s</td><td>NVMe Direct I/O</td></tr>
          <tr><td><strong>DDR → HBM</strong></td><td>Prefill 开始前预取 / Decode 需要</td><td>~10 μs</td><td>~64 GB/s</td><td>PCIe DMA (H2D)</td></tr>
          <tr><td><strong>HBM → DDR</strong></td><td>HBM 水位超过 80% / ref_cnt=0</td><td>~10 μs</td><td>~64 GB/s</td><td>PCIe DMA (D2H)</td></tr>
          <tr><td><strong>DDR → SSD</strong></td><td>DDR 水位超过 80% / 超过 TTL</td><td>~100 μs</td><td>~7 GB/s</td><td>NVMe Write</td></tr>
          <tr><td><strong>HBM → HBM (跨节点)</strong></td><td>P/D 分离 / 跨节点共享</td><td>~1-5 μs</td><td>400 GB/s</td><td>MemFabric OneCopy</td></tr>
        </tbody>
      </table>

      <Callout type="warning">
        <strong>分层存储的关键权衡：</strong>
        <ul>
          <li><strong>HBM 容量</strong>：决定同时可服务的活跃请求数。80GB HBM 中约 60% 给 KV Cache，约 48GB</li>
          <li><strong>DDR 容量</strong>：决定热数据缓存命中率。DDR 越大，命中率越高，但成本也越高</li>
          <li><strong>SSD 容量</strong>：决定跨会话复用能力。SSD 持久化可实现"关闭浏览器后回来，对话上下文还在"</li>
          <li><strong>PCIe 带宽</strong>：DDR ↔ HBM 的瓶颈。64 GB/s 意味着加载 1GB KV Cache 需要 ~16ms</li>
        </ul>
      </Callout>

      {/* ==================== 4. MemFabric 传输层 ==================== */}
      <div className="section-divider"><span>MemFabric 传输层</span></div>

      <h3>OneCopy 直访原理</h3>
      <p>MemFabric 是 MemCache 的底层传输基座，核心创新是 <strong>OneCopy</strong>—跨机器、跨介质直接数据访问，消除中间拷贝。</p>

      <MermaidDiagram chart={`
sequenceDiagram
    participant GPU1 as NPU HBM (Node 0)
    participant CPU1 as CPU DDR (Node 0)
    participant NIC1 as NIC (Node 0)
    participant NIC2 as NIC (Node 1)
    participant CPU2 as CPU DDR (Node 1)
    participant GPU2 as NPU HBM (Node 1)

    Note over GPU1,GPU2: 传统方式: 6 次拷贝
    rect rgb(255, 230, 230)
        GPU1->>CPU1: 1. GPU→CPU 拷贝
        CPU1->>NIC1: 2. CPU→NIC 拷贝
        NIC1->>NIC2: 3. 网络传输
        NIC2->>CPU2: 4. NIC→CPU 拷贝
        CPU2->>GPU2: 5. CPU→GPU 拷贝
    end

    Note over GPU1,GPU2: MemFabric OneCopy: 2 次拷贝
    rect rgb(230, 255, 230)
        GPU1->>NIC1: 1. GPU Direct DMA
        NIC1->>NIC2: 2. RDMA Send
        NIC2->>GPU2: 3. GPU Direct DMA
    end
      `} />

      <h3>硬件加速路径</h3>
      <p>MemFabric 针对不同 Ascend 芯片提供不同的硬件加速路径：</p>

      <table>
        <thead><tr><th>硬件路径</th><th>支持芯片</th><th>传输类型</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><code>device_rdma</code></td><td>A2 (Ascend 910B)</td><td>NPU ↔ NPU</td><td>NPU 设备间 RDMA 直传，GPU Direct RDMA</td></tr>
          <tr><td><code>device_sdma</code></td><td>A3 (Ascend 910C)</td><td>NPU ↔ NPU</td><td>NPU 设备间 SDMA 直传，新一代 DMA 引擎</td></tr>
          <tr><td><code>host_rdma</code></td><td>A2 / A3</td><td>Host ↔ Host</td><td>主机侧 RDMA，CPU 内存间传输</td></tr>
          <tr><td><code>device_urma</code></td><td>A5 (下一代)</td><td>NPU ↔ NPU</td><td>统一远程内存访问，更低延迟</td></tr>
          <tr><td><code>device_uboe</code></td><td>A5 (下一代)</td><td>NPU ↔ NPU</td><td>统一缓冲溢出引擎，更大带宽</td></tr>
          <tr><td><code>host_urma</code></td><td>K5 (鲲鹏)</td><td>CPU ↔ CPU</td><td>鲲鹏 CPU 侧 URMA，国产化替代</td></tr>
          <tr><td><code>host_shm</code></td><td>全部</td><td>同节点</td><td>同节点共享内存通信，零延迟</td></tr>
        </tbody>
      </table>

      <h3>RH2D / D2RH 跨介质直访</h3>
      <MermaidDiagram chart={`
graph LR
    subgraph RH2D["RH2D: Remote Host → Device"]
        R1["远端 CPU DDR"] -->|"MemFabric<br/>绕过本地 CPU"| R2["本地 NPU HBM"]
    end
    subgraph D2RH["D2RH: Device → Remote Host"]
        D1["本地 NPU HBM"] -->|"MemFabric<br/>绕过本地 CPU"| D2["远端 CPU DDR"]
    end
    Note["核心价值: 跨介质直接访问<br/>无需经过中间 CPU 中转<br/>延迟降低 3-5x"]
    RH2D --> Note
    D2RH --> Note
      `} />

      <Callout type="tip">
        <strong>RH2D/D2RH 的应用场景：</strong>
        <ul>
          <li><strong>P/D 分离</strong>：Prefill NPU 的 KV Cache 通过 D2RH 直写 Decode 节点的 DDR，Decode 节点通过 RH2D 直读回 HBM</li>
          <li><strong>跨节点共享</strong>：Node A 写入 system prompt 的 KV Cache 到全局 DDR Pool，Node B 通过 RH2D 直读</li>
          <li><strong>冷热迁移</strong>：HBM 紧张时 D2RH 将冷数据下沉到远端 DDR，需要时 RH2D 恢复</li>
        </ul>
      </Callout>

      {/* ==================== 5. 内存共享实现 ==================== */}
      <div className="section-divider"><span>内存共享实现</span></div>

      <h3>全局页表</h3>
      <p>MetaService 维护<strong>全局页表</strong>，将每个 KV block 的哈希映射到物理存储位置。LocalService 通过查询页表定位数据，再通过 MemFabric 直访。</p>

      <CodeBlock language="python" title="全局页表与内存共享" code={`class GlobalPageTable:
    """MetaService 维护的全局页表

    核心数据结构: block_hash → PhysicalLocation
    多个推理实例通过查询页表定位 KV block 的物理地址，
    然后通过 MemFabric 直接访问，数据不经过 MetaService。
    """

    def __init__(self):
        self.page_table: dict[int, PageTableEntry] = {}
        self.nodes: dict[str, NodeInfo] = {}

    def allocate(self, block_hashes: list[int],
                 preferred_node: str = None,
                 tier: str = "auto") -> list[PhysicalLocation]:
        """为新 block 分配物理存储位置"""
        locations = []
        for h in block_hashes:
            # 去重: 已存在则增加引用计数
            if h in self.page_table:
                self.page_table[h].ref_count += 1
                locations.append(self.page_table[h].location)
                continue

            # 选择存储层级
            if tier == "auto":
                tier = self._select_tier(h)  # 冷热自动判断
            node = self._select_node(preferred_node)
            location = self.nodes[node].allocate(tier)

            self.page_table[h] = PageTableEntry(
                location=location,
                ref_count=1,
                tier=tier,
                create_time=time.time(),
            )
            locations.append(location)
        return locations

    def lookup(self, block_hashes: list[int]) -> list[PhysicalLocation]:
        """查找 block 物理位置"""
        for h in block_hashes:
            if h not in self.page_table:
                raise CacheMissError(f"Block {h} not found")
            self.page_table[h].last_access = time.time()
        return [self.page_table[h].location for h in block_hashes]

    def _select_tier(self, block_hash: int) -> str:
        """自动选择存储层级 (冷热判断)"""
        if block_hash in self.hot_keys:
            return "HBM"
        elif block_hash in self.warm_keys:
            return "DDR"
        else:
            return "SSD"`} />

      <h3>引用计数共享模型</h3>
      <MermaidDiagram chart={`
stateDiagram-v2
    [*] --> Free: 初始化
    Free --> HBM: allocate(tier="HBM")
    Free --> DDR: allocate(tier="DDR")
    Free --> SSD: allocate(tier="SSD")

    HBM --> Shared: 新请求命中 (ref_cnt++)
    DDR --> Shared: 新请求命中 (ref_cnt++)
    Shared --> Shared: ref_cnt 持续增加

    Shared --> HBM: ref_cnt 降至 1
    HBM --> DDR: evict (HBM 水位 > 80%)
    DDR --> SSD: swap_out (DDR 水位 > 80%)
    SSD --> DDR: prefetch (即将需要)
    DDR --> HBM: prefetch (即将需要)

    HBM --> Free: release (ref_cnt=0)
    DDR --> Free: release (ref_cnt=0)
    SSD --> Free: release (ref_cnt=0)
    Free --> [*]: 归还内存池
      `} />

      {/* ==================== 6. KV Block 操作 API ==================== */}
      <div className="section-divider"><span>KV Block 操作 API</span></div>

      <h3>API 概览</h3>
      <p>MemCache 提供<strong>面向对象的 KV Block 操作 API</strong>，支持 C++、Python 和 RESTful 三种接口。KV Cache 被抽象为多级 block 结构。</p>

      <CodeBlock language="python" title="Python API (memcache-hybrid)" code={`# 安装: pip install memcache-hybrid
from memcache import MemCacheClient, KVTensor

# 初始化客户端
client = MemCacheClient(
    meta_addr="192.168.1.1:50051",
    local_memory_gb=100,  # 本节点贡献的内存
)

# ===== 基本操作 =====

# 1. Put: 写入 KV Cache
client.put(
    key="block_hash_001",
    value=kv_tensor,
    tier="HBM",       # 存储层级: HBM / DDR / SSD / auto
    ttl=3600,         # TTL 秒
)

# 2. Get: 读取 KV Cache
tensor = client.get("block_hash_001")

# 3. Exist: 检查是否存在
exists = client.exist("block_hash_001")

# 4. Remove: 删除 KV Cache
client.remove("block_hash_001")

# ===== 批量操作 =====

# 批量写入
blocks = {
    "hash_001": KVTensor(k=k1, v=v1),
    "hash_002": KVTensor(k=k2, v=v2),
}
client.put_batch(blocks)

# 批量读取
tensors = client.get_batch(["hash_001", "hash_002"])

# 批量存在性检查
exist_map = client.exist_batch(["hash_001", "hash_002", "hash_003"])
# {"hash_001": True, "hash_002": True, "hash_003": False}`} />

      <h3>API 接口矩阵</h3>
      <table>
        <thead><tr><th>操作</th><th>Python</th><th>C++</th><th>RESTful</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><strong>put</strong></td><td><code>client.put(key, value, tier, ttl)</code></td><td><code>Put(key, value, opts)</code></td><td>—</td><td>写入 KV Cache，支持指定层级和 TTL</td></tr>
          <tr><td><strong>get</strong></td><td><code>client.get(key)</code></td><td><code>Get(key) → Tensor</code></td><td>—</td><td>读取 KV Cache，MemFabric 自动选择路径</td></tr>
          <tr><td><strong>exist</strong></td><td><code>client.exist(key)</code></td><td><code>Exist(key) → bool</code></td><td>—</td><td>检查存在性，用于前缀缓存命中判断</td></tr>
          <tr><td><strong>remove</strong></td><td><code>client.remove(key)</code></td><td><code>Remove(key)</code></td><td>—</td><td>显式删除，释放存储空间</td></tr>
          <tr><td><strong>metrics</strong></td><td>—</td><td>—</td><td><code>GET /metrics</code></td><td>Prometheus 格式监控指标</td></tr>
          <tr><td><strong>health</strong></td><td>—</td><td>—</td><td><code>GET /health</code></td><td>健康检查端点</td></tr>
        </tbody>
      </table>

      <CodeBlock language="bash" title="C++ API 示例" code={`// C++ API 使用示例
#include "memcache/client.h"

// 初始化
MemCacheClient client("192.168.1.1:50051", 100 /* GB */);

// 写入 KV Cache
KVTensor kv_tensor = {k_data, v_data, num_layers, num_heads, head_dim};
PutOptions opts;
opts.tier = "HBM";
opts.ttl = 3600;
client.Put("block_hash_001", kv_tensor, opts);

// 读取 KV Cache
auto result = client.Get("block_hash_001");

// 批量操作
std::vector<std::string> keys = {"hash_001", "hash_002"};
auto results = client.GetBatch(keys);`} />

      {/* ==================== 7. vllm-ascend 集成 ==================== */}
      <div className="section-divider"><span>vllm-ascend 集成实战</span></div>

      <h3>集成架构</h3>
      <MermaidDiagram chart={`
graph TB
    subgraph vllm["vllm-ascend 推理引擎"]
        API["API Server"]
        SCHED["Scheduler"]
        EXEC["Executor"]
        KW["Ascend Worker"]
    end

    subgraph MemCache["MemCache"]
        LS["LocalService<br/>(共享库)"]
        MF["MemFabric<br/>传输层"]
    end

    subgraph KV["KV Pool"]
        HBM["NPU HBM"]
        DDR["Host DDR"]
        SSD["NVMe SSD"]
    end

    API --> SCHED
    SCHED --> EXEC
    EXEC --> KW
    KW --> LS
    LS --> MF
    MF --> KV
      `} />

      <CodeBlock language="bash" title="完整部署流程" code={`# ===== Step 1: 启动 MetaService =====
# 单点模式
python -m memcache.meta_service --port 50051

# HA 模式 (K8s)
kubectl apply -f memcache-meta-ha.yaml

# ===== Step 2: 启动 vllm-ascend + MemCache =====
vllm serve Qwen/Qwen2-7B \\
  --kv-transfer-config '{
    "backend": "memcache",
    "meta_addr": "memcache-meta:50051",
    "local_memory_gb": 100,
    "hbm_ratio": 0.4,
    "ddr_ratio": 0.4,
    "ssd_ratio": 0.2
  }' \\
  --tensor-parallel-size 8

# ===== Step 3: 验证集成 =====
# 检查 MemCache 状态
curl http://memcache-meta:50051/metrics | grep memcache

# 发送推理请求
curl http://localhost:8000/v1/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "Qwen/Qwen2-7B",
    "prompt": "Explain quantum computing",
    "max_tokens": 100
  }'`} />

      <h3>配置参数详解</h3>
      <table>
        <thead><tr><th>参数</th><th>默认值</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><code>backend</code></td><td>"memcache"</td><td>KV 传输后端，必须设为 memcache</td></tr>
          <tr><td><code>meta_addr</code></td><td>必填</td><td>MetaService 地址，格式 host:port</td></tr>
          <tr><td><code>local_memory_gb</code></td><td>100</td><td>本节点贡献给 KV Pool 的总内存 (GB)</td></tr>
          <tr><td><code>hbm_ratio</code></td><td>0.5</td><td>HBM 占 local_memory_gb 的比例</td></tr>
          <tr><td><code>ddr_ratio</code></td><td>0.4</td><td>DDR 占 local_memory_gb 的比例</td></tr>
          <tr><td><code>ssd_ratio</code></td><td>0.1</td><td>SSD 占 local_memory_gb 的比例</td></tr>
          <tr><td><code>prefetch_enabled</code></td><td>true</td><td>是否启用投机预取</td></tr>
          <tr><td><code>eviction_policy</code></td><td>"lru"</td><td>淘汰策略: lru / lfu / priority</td></tr>
        </tbody>
      </table>

      {/* ==================== 8. PrefixCache 加速 ==================== */}
      <div className="section-divider"><span>PrefixCache 加速</span></div>

      <h3>加速原理</h3>
      <p>MemCache 的 PrefixCache 模式将<strong>前缀匹配</strong>与<strong>KV Pool 存储</strong>结合：相同前缀的请求命中 KV Pool 中的缓存 block，跳过 Prefill 阶段的计算。</p>

      <MermaidDiagram chart={`
sequenceDiagram
    participant A as 请求 A (首次)
    participant MS as MetaService
    participant Pool as KV Pool
    participant B as 请求 B (相同前缀)

    Note over A,Pool: 请求 A: 首次写入
    A->>A: Prefill: 计算 system prompt KV Cache
    A->>MS: allocate(block_hashes)
    MS-->>A: locations
    A->>Pool: put_batch(blocks)
    A->>MS: commit
    A->>A: Decode: 生成回答

    Note over B,Pool: 请求 B: 缓存命中
    B->>MS: exist_batch(block_hashes)
    MS-->>B: 全部命中!
    B->>MS: lookup(block_hashes)
    MS-->>B: locations
    B->>Pool: get_batch(block_hashes)
    Pool-->>B: KV Cache (跳过 Prefill!)
    B->>B: 直接进入 Decode
      `} />

      <h3>加速效果</h3>
      <table>
        <thead><tr><th>场景</th><th>无 MemCache</th><th>有 MemCache PrefixCache</th><th>加速比</th></tr></thead>
        <tbody>
          <tr><td><strong>多轮对话 (system prompt 复用)</strong></td><td>每次重新计算 system prompt</td><td>从 KV Pool 直接读取，命中率 {'>'} 90%</td><td>3-5x</td></tr>
          <tr><td><strong>Few-shot 推理</strong></td><td>每次计算完整 prompt</td><td>共享示例前缀，跨请求复用</td><td>2-3x</td></tr>
          <tr><td><strong>P/D 分离</strong></td><td>NCCL 全量传输</td><td>MemFabric 增量 + 去重</td><td>1.5-2x 传输效率</td></tr>
          <tr><td><strong>Agent 工作负载</strong></td><td>每次 Tool Call 独立计算</td><td>共享对话历史和工具定义</td><td>4-6x</td></tr>
        </tbody>
      </table>

      {/* ==================== 9. 性能基准 ==================== */}
      <div className="section-divider"><span>性能基准</span></div>

      <h3>测试环境</h3>
      <p>测试使用模拟 DeepSeek-R1 模型 KV block：每个 block 为 61×128K + 61×16K ≈ 8.57MB，122 个离散地址。</p>

      <table>
        <thead><tr><th>硬件</th><th>配置</th><th>测试场景</th></tr></thead>
        <tbody>
          <tr><td><strong>A2 (Ascend 910B)</strong></td><td>2 节点 × 8 卡</td><td>双节点内存池读写性能</td></tr>
          <tr><td><strong>A3 (Ascend 910C)</strong></td><td>2 节点 × 8 卡/16 die</td><td>双节点内存池读写性能</td></tr>
        </tbody>
      </table>

      <h3>传输路径性能对比</h3>
      <table>
        <thead><tr><th>传输路径</th><th>数据量</th><th>延迟</th><th>带宽</th><th>适用场景</th></tr></thead>
        <tbody>
          <tr><td><strong>host_shm (同节点)</strong></td><td>8.57 MB</td><td>{'<'} 10 μs</td><td>{'~'}100 GB/s</td><td>同节点 NPU 间共享</td></tr>
          <tr><td><strong>device_rdma (A2)</strong></td><td>8.57 MB</td><td>{'~'}50 μs</td><td>{'~'}200 GB/s</td><td>跨节点 A2 直传</td></tr>
          <tr><td><strong>device_sdma (A3)</strong></td><td>8.57 MB</td><td>{'~'}30 μs</td><td>{'~'}300 GB/s</td><td>跨节点 A3 直传</td></tr>
          <tr><td><strong>host_rdma (A2/A3)</strong></td><td>8.57 MB</td><td>{'~'}80 μs</td><td>{'~'}100 GB/s</td><td>CPU 内存池传输</td></tr>
          <tr><td><strong>RH2D (A3, 跨介质)</strong></td><td>8.57 MB</td><td>{'~'}60 μs</td><td>{'~'}150 GB/s</td><td>远端 DDR → 本地 HBM</td></tr>
          <tr><td><strong>D2RH (A3, 跨介质)</strong></td><td>8.57 MB</td><td>{'~'}60 μs</td><td>{'~'}150 GB/s</td><td>本地 HBM → 远端 DDR</td></tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>RH2D 路径的性能优势：</strong>相比传统中继传输（NPU→CPU→NIC→NIC→CPU→NPU），RH2D/D2RH 消除了 2 次 CPU 中转拷贝，
        延迟降低 3-5x。对于 8.57MB 的 KV block，传统方式需要 ~200μs，RH2D 仅需 ~60μs。
      </Callout>

      {/* ==================== 10. 方案对比 ==================== */}
      <div className="section-divider"><span>与 Mooncake 对比</span></div>

      <table>
        <thead><tr><th>维度</th><th>Ascend MemCache</th><th>Mooncake</th></tr></thead>
        <tbody>
          <tr><td><strong>开发组织</strong></td><td>华为 Ascend</td><td>月之暗面 (Kimi)</td></tr>
          <tr><td><strong>开源时间</strong></td><td>2025.11</td><td>2024.06</td></tr>
          <tr><td><strong>目标硬件</strong></td><td>Ascend NPU (A2/A3/A5)</td><td>NVIDIA GPU (H100/A100)</td></tr>
          <tr><td><strong>传输层</strong></td><td>MemFabric (OneCopy)</td><td>RDMA + TCP 混合</td></tr>
          <tr><td><strong>硬件路径</strong></td><td>7 种 (RDMA/SDMA/URMA/UBoE/SHM)</td><td>RDMA / TCP</td></tr>
          <tr><td><strong>跨介质直访</strong></td><td>✅ RH2D / D2RH</td><td>❌ 需 CPU 中转</td></tr>
          <tr><td><strong>存储层级</strong></td><td>HBM + DDR + SSD</td><td>HBM + DRAM + SSD + 远程</td></tr>
          <tr><td><strong>部署模式</strong></td><td>单点 + K8s HA</td><td>Master + Transfer Server</td></tr>
          <tr><td><strong>API</strong></td><td>C++ / Python / RESTful</td><td>Python / C++</td></tr>
          <tr><td><strong>集成框架</strong></td><td>vllm-ascend / sglang / mindie</td><td>vLLM / SGLang</td></tr>
          <tr><td><strong>动态扩缩</strong></td><td>✅ LocalService 动态加入/退出</td><td>✅ 动态 Worker 管理</td></tr>
          <tr><td><strong>成熟度</strong></td><td>生产级 (vllm-ascend)</td><td>生产级 (Kimi 40 万 GPU)</td></tr>
        </tbody>
      </table>

      <ResourceTable resources={[
        { name: 'MemCache 项目主页', url: 'https://gitcode.com/Ascend/memcache', desc: 'Ascend MemCache 开源仓库，包含完整文档和源码' },
        { name: 'MemCache Wiki', url: 'https://gitcode.com/Ascend/memcache/wiki/Home.md', desc: 'MemCache 官方 Wiki，架构设计、部署指南、API 文档' },
        { name: 'MemFabric 项目', url: 'https://gitcode.com/Ascend/memfabric_hybrid', desc: 'MemCache 底层传输基座，OneCopy 跨介质直访' },
        { name: 'vllm-ascend 集成文档', url: 'https://github.com/vllm-project/vllm-ascend', desc: 'vllm-ascend + MemCache 集成使用指南' },
        { name: 'MemCache Python API 文档', url: 'https://gitcode.com/Ascend/memcache/docs/memcache_python_api.md', desc: 'memcache-hybrid Python API 完整文档' },
        { name: 'MemCache C++ API 文档', url: 'https://gitcode.com/Ascend/memcache/docs/memcache_c++_api.md', desc: 'MemCache C++ API 完整文档' },
        { name: 'MemCache 配置文档', url: 'https://gitcode.com/Ascend/memcache/docs/memcache_config.md', desc: 'MetaService 和 LocalService 配置参数详解' },
        { name: 'Mooncake 论文', url: 'https://arxiv.org/abs/2407.00079', desc: 'Mooncake KV Cache 论文，与 MemCache 对比参考' },
      ]} />
    </div>
  );
}