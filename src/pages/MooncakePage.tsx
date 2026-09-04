import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, CodeBlock, ResourceTable } from '../components/CodeBlock';

export function MooncakePage() {
  return (
    <div className="prose max-w-none">
      <h1>Mooncake 深度分析</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-09</span>
        <span className="page-meta-item">⏱️ 阅读约 35 分钟</span>
        <span className="page-meta-item">🏷️ 专题 · Mooncake · P/D 分离 · KV Pool</span>
      </div>
      <p>Mooncake 是月之暗面（Kimi）开源的<strong>以 KV Cache 为中心的分离式 LLM 推理架构</strong>，获 FAST 2025 最佳论文奖。本文基于源码（<code>/data/sd/Mooncake</code>）深度分析其架构设计、P/D 分离实现和 KV Pool 机制。</p>

      {/* ==================== 1. 整体架构 ==================== */}
      <h2>整体架构</h2>

      <MermaidDiagram chart={`
graph TB
    subgraph Apps["集成层 (mooncake-integration)"]
        App_SGLang["SGLang HiCache"]
        App_vLLM["vLLM Connector"]
        App_TensorRT["TensorRT-LLM"]
        App_LM["LMDeploy/LMCache"]
    end

    subgraph Store["Mooncake Store (分布式 KV Pool)"]
        Master["Master Server<br/>全局元数据 + 调度"]
        Client["Store Client<br/>Put/Get/Remove/Pin"]
        Alloc["Allocator Layer<br/>Cachelib / Offset"]
        Replica["Replica Manager<br/>MEMORY / DISK / SSD"]
    end

    subgraph TE["Transfer Engine (传输层)"]
        Engine["TransferEngine<br/>统一传输接口"]
        Meta["TransferMetadata<br/>拓扑发现 + 路由"]
        MT["MultiTransport<br/>协议聚合 + 故障转移"]
    end

    subgraph Transport["网络传输层"]
        RDMA["RDMA<br/>RoCE/InfiniBand"]
        TCP["TCP"]
        NVLink["NVLink<br/>Intra-node"]
        NVMe["NVMe-oF<br/>SSD 直通"]
        CXL["CXL"]
        Ascend["Ascend<br/>HCCS/HCCS-roce"]
    end

    subgraph EP["弹性专家并行 (mooncake-ep)"]
        EP_Kernel["EP Kernel<br/>Dispatch/Combine"]
        EP_PG["ProcessGroup<br/>容错 + 恢复"]
    end

    Apps --> Store
    Store --> TE
    TE --> Transport
    EP_Kernel --> TE
    EP_PG --> TE
`} maxWidth={700} />

      <p>源码仓库包含以下核心模块：</p>
      <table>
        <thead><tr><th>模块</th><th>路径</th><th>职责</th></tr></thead>
        <tbody>
          <tr><td><strong>Transfer Engine</strong></td><td><code>mooncake-transfer-engine/</code></td><td>高性能数据传输框架，统一接口支撑多种传输协议</td></tr>
          <tr><td><strong>Mooncake Store</strong></td><td><code>mooncake-store/</code></td><td>分布式 KV 缓存引擎，多级缓存 + 对象管理</td></tr>
          <tr><td><strong>Integration</strong></td><td><code>mooncake-integration/</code></td><td>Python 绑定层，对接 SGLang/vLLM 等推理框架</td></tr>
          <tr><td><strong>EP & PG</strong></td><td><code>mooncake-ep/</code></td><td>弹性专家并行 + 容错 ProcessGroup</td></tr>
          <tr><td><strong>P2P Store</strong></td><td><code>mooncake-p2p-store/</code></td><td>Go 语言实现的 P2P 权重同步</td></tr>
        </tbody>
      </table>

      {/* ==================== 2. Transfer Engine 深度分析 ==================== */}
      <h2>Transfer Engine — 核心组件</h2>
      <p>Transfer Engine (TE) 是 Mooncake 的<strong>底层传输基础设施</strong>，向上提供统一的批处理数据传输接口，向下支持多种异构网络协议。</p>

      <h3>核心 API</h3>
      <CodeBlock language="cpp" code={`// mooncake-transfer-engine/include/transfer_engine.h
class TransferEngine {
public:
    // 初始化引擎
    int init(const std::string& metadata_conn_string,
             const std::string& local_server_name,
             const std::string& ip_or_host_name = "",
             uint64_t rpc_port = 12345);

    // 注册本地内存，使其可被远端访问
    int registerLocalMemory(void* addr, size_t length,
                            const std::string& location = kWildcardLocation,
                            bool remote_accessible = true,
                            bool update_metadata = true);

    // 批量提交传输请求
    Status submitTransfer(BatchID batch_id,
                          const std::vector<TransferRequest>& entries);

    // 安装传输协议（RDMA/TCP/...）
    Transport* installTransport(const std::string& proto, void** args);

    // 段管理 —— 用于标识一组内存区域
    SegmentHandle openSegment(const std::string& segment_name);
    int closeSegment(SegmentHandle handle);
};`} />

      <h3>传输协议栈</h3>
      <p>TE 支持 <strong>18+ 种传输协议</strong>，覆盖从节点内到跨节点的所有场景：</p>
      <table>
        <thead><tr><th>类别</th><th>协议</th><th>路径</th><th>用途</th></tr></thead>
        <tbody>
          <tr><td><strong>节点内</strong></td><td>NVLink</td><td><code>nvlink_transport/</code></td><td>GPU-GPU 直连</td></tr>
          <tr><td><strong>节点内</strong></td><td>CXL</td><td><code>cxl_transport/</code></td><td>CXL 共享内存</td></tr>
          <tr><td><strong>节点内</strong></td><td>HCCS</td><td><code>ascend_transport/</code></td><td>昇腾 NPU 间高速互联</td></tr>
          <tr><td><strong>跨节点</strong></td><td>RDMA</td><td><code>rdma_transport/</code></td><td>RoCE / InfiniBand</td></tr>
          <tr><td><strong>跨节点</strong></td><td>TCP</td><td><code>tcp_transport/</code></td><td>通用 TCP 回退</td></tr>
          <tr><td><strong>跨节点</strong></td><td>EFA</td><td><code>efa_transport/</code></td><td>AWS Elastic Fabric Adapter</td></tr>
          <tr><td><strong>跨节点</strong></td><td>NVMe-oF</td><td><code>nvmeof_transport/</code></td><td>NVMe over Fabric</td></tr>
          <tr><td><strong>跨节点</strong></td><td>HCCS-roce</td><td><code>ascend_transport/</code></td><td>昇腾 RoCE 网络</td></tr>
          <tr><td><strong>跨节点</strong></td><td>GPU-P2P</td><td><code>device/</code></td><td>GPU Direct RDMA</td></tr>
          <tr><td><strong>跨节点</strong></td><td>NCCL</td><td><code>nccl_transport/</code></td><td>NVIDIA 集合通信</td></tr>
        </tbody>
      </table>

      <h3>MultiTransport — 多协议聚合</h3>
      <CodeBlock language="cpp" code={`// mooncake-transfer-engine/include/multi_transport.h
// 核心思想：一个 TransferRequest 可以走多条路径
// MultiTransport 负责：
// 1. 根据拓扑自动选择最优协议和 NIC
// 2. 多 NIC 带宽聚合
// 3. 故障自动切换（网络中断时 fallback 到 TCP）
// 4. 拓扑感知路由（NUMA 亲和性）

class MultiTransport {
    std::vector<std::unique_ptr<Transport>> transports_;
    std::shared_ptr<Topology> topology_;
};`} />

      <h3>TransferMetadata — 元数据与拓扑发现</h3>
      <CodeBlock language="cpp" code={`// mooncake-transfer-engine/include/transfer_metadata.h
// 核心职责：
// 1. 集群拓扑发现（etcd 或 HTTP metadata server）
// 2. 内存段注册与管理（SegmentHandle）
// 3. 节点间通知机制（NotifyDesc）
// 4. 批量传输状态跟踪

class TransferMetadata {
    // 注册/查询内存段
    SegmentHandle openSegment(const std::string& segment_name);
    int closeSegment(SegmentHandle handle);

    // 通知机制 —— 实现跨节点同步
    int getNotifies(std::vector<NotifyDesc>& notifies);
    int sendNotifyByID(SegmentID target_id, NotifyDesc notify_msg);
};`} />

      {/* ==================== 3. Mooncake Store - KV Pool 实现 ==================== */}
      <h2>Mooncake Store — KV Pool 分布式实现</h2>
      <p>Mooncake Store 是基于 Transfer Engine 构建的<strong>分布式 KV Cache 存储引擎</strong>，它将各推理节点的内存/SSD 资源池化，形成全局 KV Cache 池。</p>

      <MermaidDiagram chart={`
graph TB
    subgraph Client["推理引擎 (vLLM/SGLang)"]
        Put["PutStart → 分配内存 → 写入数据 → PutEnd"]
        Get["GetReplicaList → 获取副本位置 → 传输数据"]
        Remove["Remove → 释放内存"]
    end

    subgraph MC["MasterClient (RPC)"]
        RPC["coro_rpc<br/>异步 RPC 通信"]
        Pool["RpcClientPool<br/>连接池管理"]
    end

    subgraph Master["Master Server"]
        MetaSvc["MasterService<br/>Put/Get/Remove/Copy/Move"]
        AllocSvc["AllocationStrategy<br/>分配策略 + 负载均衡"]
        View["ClusterView<br/>全局 Segment 视图"]
        QoS["Tenant Quota<br/>多租户隔离"]
        Task["TaskManager<br/>后台复制/迁移任务"]
    end

    subgraph Segments["分布式存储节点"]
        S1["Segment A<br/>DRAM (Cachelib)"]
        S2["Segment B<br/>DRAM (Offset)"]
        S3["Segment C<br/>SSD (NVMe-oF)"]
        S4["Segment D<br/>Local SSD"]
    end

    Client --> MC
    MC --> Master
    Master --> Segments
    Master --> QoS
    Master --> Task
`} maxWidth={680} />

      <h3>3.1 内存分配器 (Allocator Layer)</h3>
      <p>Store 提供两种分配器策略，管理每个 Segment 的内存分配：</p>

      <CodeBlock language="cpp" code={`// mooncake-store/include/allocator.h
// 两种分配器实现：

// 1. CachelibBufferAllocator — 基于 Meta CacheLib 的 Slab 分配器
//    适合：频繁分配/释放的 KV Cache block
class CachelibBufferAllocator : public BufferAllocatorBase {
    std::unique_ptr<facebook::cachelib::MemoryAllocator> memory_allocator_;
    PoolId pool_id_;
    // Slab 分配策略：将内存分为不同大小的 Slab 类
    // 避免内存碎片，适合 KV Cache 这种固定大小块场景
};

// 2. OffsetBufferAllocator — 基于 OffsetAllocator 的 bin 分配器
//    适合：需要精确控制偏移量的场景
class OffsetBufferAllocator : public BufferAllocatorBase {
    std::shared_ptr<offset_allocator::OffsetAllocator> offset_allocator_;
    // 返回真实的最大空闲区域，用于分配决策
    size_t getLargestFreeRegion() const override;
};

// 每个 Segment 绑定一个分配器实例
// 分配器通过 AttachUsageTracker 注册到全局资源追踪`} />

      <h3>3.2 副本管理 (Replica Manager)</h3>
      <CodeBlock language="cpp" code={`// mooncake-store/include/types.h
// 每个 KV Cache 对象可以有多个副本（Replica）
enum class ReplicaType {
    MEMORY = 0,      // DRAM 副本（热数据，低延迟）
    DISK = 1,        // SSD 副本（温数据，低成本）
    LOCAL_DISK = 2,  // 本地 SSD（不使用网络存储）
    NOF_SSD = 3,     // NVMe-oF 远程 SSD
    DFS = 100,       // 分布式文件系统备份
};

// Replica 描述符包含完整的传输信息
struct Replica::Descriptor {
    uint64_t size_;
    uintptr_t buffer_address_;
    std::string protocol_;          // 传输协议: "rdma", "tcp"
    std::string transport_endpoint_; // 传输端点地址
};`} />

      <h3>3.3 Master-Side 分配策略</h3>
      <CodeBlock language="cpp" code={`// mooncake-store/src/allocation_strategy.cpp
// Master 在 PutStart 时进行的全局分配决策：

// 1. 获取所有可用 Segment 的容量和负载信息
// 2. 根据 ReplicateConfig 筛选候选 Segment（考虑内存/磁盘）
// 3. 过滤掉空闲空间不足的 Segment（getLargestFreeRegion）
// 4. 按可用空间排序，优先分配到空间最大的 Segment
// 5. 支持 preferred_segments 参数（用户指定优先分配节点）
// 6. 返回 Replica::Descriptor 列表，包含：
//    - 分配的 buffer 地址
//    - 传输协议（rdma/tcp/tcp+cxl）
//    - 传输端点信息

// 分配时考虑的因素：
// - Segment 容量和当前使用量
// - 最大空闲区域（避免碎片导致分配失败）
// - 副本数（replica_count）
// - 用户指定的 placement 偏好`} />

      <h3>3.4 对象生命周期管理</h3>
      <CodeBlock language="cpp" code={`// mooncake-store/include/master_client.h
// 完整的对象操作接口：

// Put 操作（两阶段提交）
PutStart(key, slice_lengths, config)  // 分配副本 → 返回 Replica::Descriptor
PutEnd(object_meta, replica_type)      // 确认写入 → 激活副本

// Get 操作（元数据查询 + 直接传输）
GetReplicaList(key)  // 从 Master 获取副本位置
// 然后通过 Transfer Engine 直接从源节点 RDMA 读取

// 更新操作
UpsertStart / UpsertEnd  // 插入或更新（不存在则创建，存在则更新）

// 删除操作
Remove(key)  // 删除对象及其所有副本

// 高级操作
CopyStart → CopyEnd       // 对象副本复制
MoveStart → MoveEnd       // 对象跨段迁移
CreateCopyTask / CreateMoveTask  // 异步任务`} />

      <Callout type="info" title="设计要点">
        <p><strong>主从分离</strong>：Master 只管理元数据，不参与数据传输。所有数据通过 Transfer Engine 在节点间直接（P2P）传输，避免 Master 成为瓶颈。</p>
        <p><strong>两阶段写入</strong>：PutStart 分配副本空间 → 客户端直接写入数据 → PutEnd 确认激活。这样可以在写入失败时回滚分配。</p>
        <p><strong>零拷贝读取</strong>：GetReplicaList 返回远程内存地址和传输协议后，客户端通过 Transfer Engine 执行 RDMA Read，数据直接从远程内存到本地内存，无需 CPU 拷贝。</p>
      </Callout>

      {/* ==================== 4. P/D 分离 ==================== */}
      <h2>P/D 分离中的作用与实现</h2>

      <MermaidDiagram chart={`
graph LR
    subgraph Router["Router / 调度器"]
        R["请求路由<br/>Prefill or Decode?"]
    end

    subgraph Prefill["Prefill Pool (GPU 集群)"]
        P1["Prefill GPU 0<br/>计算 Attention<br/>生成 KV Cache"]
        P2["Prefill GPU 1"]
        P_Store["Mooncake Store Client<br/>Put KV Cache"]
    end

    subgraph Transfer["KV Cache 传输"]
        TE_M["Transfer Engine<br/>RDMA 直传"]
        Store_M["Mooncake Store<br/>全局 KV Pool"]
    end

    subgraph Decode["Decode Pool (GPU 集群)"]
        D_Store["Mooncake Store Client<br/>Get KV Cache"]
        D1["Decode GPU 0<br/>自回归生成"]
        D2["Decode GPU 1"]
        D3["Decode GPU 2"]
    end

    R --> Prefill
    R --> Decode
    Prefill --> Transfer
    Transfer --> Decode
`} maxWidth={700} />

      <h3>4.1 P/D 分离核心流程</h3>
      <CodeBlock language="python" code={`# 基于 mooncake-integration 的 P/D 分离流程

# === Prefill 侧 ===
from mooncake.store import MooncakeDistributedStore

store = MooncakeDistributedStore()
store.setup(master_addr, local_server, global_segments)

# 1. Prefill 完成后，将 KV Cache 存入 Mooncake Store
def prefill_and_store(request):
    kv_cache = prefill_model(request)  # 计算 Attention，生成 KV Cache

    # 分配副本空间（PutStart）
    descriptors = store.put_start(
        key=request.id,
        slice_lengths=[len(kv_cache)],
        config=ReplicateConfig(replica_count=2)  # 2 副本保证可用性
    )

    # 通过 Transfer Engine 写入数据
    for desc in descriptors:
        transfer_engine.submit_transfer(
            batch_id=bid,
            entries=[TransferRequest(
                opcode=WRITE,
                source=kv_cache.data_ptr(),
                target=desc.buffer_address,
                length=len(kv_cache)
            )]
        )

    # 确认写入完成（PutEnd）
    store.put_end(request.id, checksum)

# === Decode 侧 ===
def get_and_decode(request):
    # 获取 KV Cache 副本位置
    replicas = store.get_replica_list(request.id)

    # 选择最优副本（网络拓扑感知）
    best_replica = select_best_replica(replicas)

    # 通过 Transfer Engine RDMA 直接读取
    transfer_engine.submit_transfer(
        batch_id=bid,
        entries=[TransferRequest(
            opcode=READ,
            source=best_replica.buffer_address,
            target=local_kv_cache.data_ptr(),
            length=best_replica.size
        )]
    )

    # 开始自回归生成
    decode_model(request, local_kv_cache)`} />

      <h3>4.2 vLLM Integration — MooncakeConnector</h3>
      <CodeBlock language="python" code={`# vLLM 中的 P/D 分离集成（基于源码分析）

# 方式一：Transfer Engine Connector（直接传输）
# 适用于 P/D 分离场景，Prefill 节点直接向 Decode 节点传输 KV Cache
class MooncakeConnector:
    def __init__(self):
        self.engine = TransferEngine()
        self.engine.init(metadata_addr, local_server)

    def send_kv_cache(self, blocks, target_segment):
        """Prefill 完成后，发送 KV Cache 到目标 Decode"""
        for block in blocks:
            self.engine.registerLocalMemory(block.data_ptr(), block.size())
        self.engine.submitTransfer(batch_id, transfer_entries)

# 方式二：MooncakeStoreConnector（存储池）
# 适用于 KV Cache 复用场景，多个推理实例共享 KV Cache
class MooncakeStoreConnector:
    def __init__(self):
        self.store = MooncakeDistributedStore()
        self.store.setup(master_addr, local_server, segments)

    def save_kv_cache(self, key, kv_cache):
        """存入全局 KV Pool"""
        self.store.put(key, kv_cache)

    def load_kv_cache(self, key):
        """从全局 KV Pool 加载"""
        return self.store.get(key)`} />

      <h3>4.3 SGLang Integration — HiCache</h3>
      <CodeBlock language="python" code={`# SGLang 的多级 KV Cache 集成

# 三级缓存架构：
# L1: GPU VRAM (RadixAttention 本地缓存)
# L2: CPU DRAM (Mooncake Store MEMORY)
# L3: SSD (Mooncake Store DISK)

# 工作流程：
# 1. 请求到达 → 查 L1 (GPU VRAM) → 命中则直接复用
# 2. L1 未命中 → 查 L2 (Mooncake Store DRAM) → 通过 Transfer Engine 拉取到 GPU
# 3. L2 未命中 → 查 L3 (Mooncake Store SSD) → 读取到 DRAM 再传到 GPU
# 4. L3 未命中 → 重新计算 Prefill

# SGLang 的 HiCache 通过 Mooncake Store 将 Radix Tree 前缀匹配
# 从单机扩展到集群级别，实现跨实例的 KV Cache 共享`} />

      <Callout type="tip" title="P/D 分离的 Mooncake 优势">
        <p><strong>独立扩缩</strong>：Prefill Pool 和 Decode Pool 可以按不同比例扩缩容，无需绑定</p>
        <p><strong>GPU 异构</strong>：Prefill 用高算力 GPU（H100），Decode 用低成本 GPU（L40S），降低总成本</p>
        <p><strong>故障隔离</strong>：Prefill 或 Decode 节点故障不影响对方 Pool，配合 Mooncake EP 的容错机制</p>
        <p><strong>KV Cache 复用</strong>：多个请求共享前缀时，只需一次 Prefill，通过 Store 共享给所有 Decode 节点</p>
      </Callout>

      {/* ==================== 5. 网络传输层 ==================== */}
      <h2>网络传输层 — 拓扑感知与多路径</h2>

      <MermaidDiagram chart={`
graph TB
    subgraph App["上层应用"]
        Req["TransferRequest<br/>{src, dst, length, opcode}"]
    end

    subgraph TE["TransferEngine"]
        Topo["Topology<br/>拓扑发现"]
        Select["MultiTransport<br/>路径选择"]
        Agg["带宽聚合<br/>多 NIC 并行"]
        Failover["故障转移<br/>自动 fallback"]
    end

    subgraph Paths["可选路径"]
        P1["RDMA NIC 0<br/>200 Gbps"]
        P2["RDMA NIC 1<br/>200 Gbps"]
        P3["TCP<br/>兜底路径"]
        P4["NVLink<br/>节点内"]
    end

    Req --> Topo
    Topo --> Select
    Select --> Agg
    Agg --> Failover
    Failover --> P1
    Failover --> P2
    Failover --> P3
    Failover --> P4
`} maxWidth={600} />

      <h3>拓扑感知路由</h3>
      <CodeBlock language="cpp" code={`// mooncake-transfer-engine/include/topology.h
// 每个节点启动时发现本地拓扑：
// 1. 扫描所有 NIC 设备和 NUMA 节点
// 2. 构建 (NIC, NUMA, GPU) 三元组的亲和性矩阵
// 3. 上报到 TransferMetadata（etcd 或 HTTP）

// 传输时，根据源和目标选择最优路径：
// - 同一 NUMA 节点 → 优先使用本地 NIC
// - 不同 NUMA 节点 → 选择对应 NUMA 的 NIC
// - 跨机器 → 优先 RDMA，fallback TCP
// - 多 NIC → 自动 Striping 聚合带宽`} />

      <h3>性能数据</h3>
      <p>基于 40GB 数据传输（等效 LLaMA3-70B 128K token 的 KV Cache）：</p>
      <table>
        <thead><tr><th>配置</th><th>带宽</th><th>相对 TCP</th></tr></thead>
        <tbody>
          <tr><td>4×200 Gbps RoCE</td><td>87 GB/s</td><td>2.4x</td></tr>
          <tr><td>8×400 Gbps RoCE</td><td>190 GB/s</td><td>4.6x</td></tr>
          <tr><td>TCP (baseline)</td><td>~36 GB/s</td><td>1x</td></tr>
        </tbody>
      </table>

      {/* ==================== 6. 弹性专家并行 ==================== */}
      <h2>弹性专家并行 (Mooncake EP)</h2>
      <CodeBlock language="cpp" code={`// mooncake-ep/include/mooncake_ep_device.h
// Mooncake EP 提供容错 MoE 通信：
// 1. 兼容 DeepEP 的 dispatch/combine API
// 2. 增加 active_ranks 意识 —— 感知失效 rank
// 3. 路由绕过失效节点，继续使用健康专家
// 4. 弹性恢复 —— 替换进程可重新加入 group

// 在 P/D 分离中的角色：
// - 当 Decode Pool 中的某个 GPU 故障时
// - EP 自动将请求路由到其他健康的 Expert
// - 配合 Mooncake Store 的副本机制，从其他节点恢复 KV Cache`} />

      <Callout type="warning" title="关键设计取舍">
        <p><strong>Master 元数据瓶颈</strong>：Master 只管理元数据（对象索引、副本位置），所有数据走 P2P 传输。但频繁的小对象操作仍可能对 Master 造成压力。Mooncake 通过 RPC 连接池、批量操作（BatchPut、BatchGet）和客户端缓存优化。</p>
        <p><strong>副本一致性</strong>：Mooncake Store 采用最终一致性模型。PutEnd 确认后副本立即可读，但跨副本同步通过后台 TaskManager 异步完成。</p>
        <p><strong>内存管理</strong>：每个 Segment 绑定独立的 Allocator 实例，Master 通过全局视图做分配决策，但实际分配和释放由各节点本地执行，避免分布式锁。</p>
      </Callout>

      {/* ==================== 7. 集成生态 ==================== */}
      <h2>集成生态</h2>
      <ResourceTable
        resources={[
          { type: '论文', title: 'Mooncake (FAST 2025 Best Paper)', url: 'https://www.usenix.org/system/files/fast25-qin.pdf', desc: 'KVCache-centric Disaggregated Architecture for LLM Serving' },
          { type: '论文', title: 'Mooncake 技术报告 (v2)', url: 'https://arxiv.org/abs/2504.17734', desc: '最新技术报告，涵盖 Transfer Engine + Store + EP' },
          { type: '文档', title: 'Mooncake 官方文档', url: 'https://kvcache-ai.github.io/Mooncake/', desc: '完整 API 文档与部署指南' },
          { type: '文档', title: 'vLLM Mooncake Store 集成', url: 'https://vllm.ai/blog/2026-05-06-mooncake-store', desc: 'vLLM 分布式 KV Cache 池化' },
          { type: '文档', title: 'SGLang HiCache 集成', url: 'https://lmsys.org/blog/2025-09-10-sglang-hicache/', desc: 'SGLang 多级 KV Cache 存储' },
          { type: '源码', title: 'mooncake-transfer-engine', url: 'https://github.com/kvcache-ai/Mooncake/tree/main/mooncake-transfer-engine', desc: '核心传输引擎' },
          { type: '源码', title: 'mooncake-store', url: 'https://github.com/kvcache-ai/Mooncake/tree/main/mooncake-store', desc: '分布式 KV 存储引擎' },
          { type: '源码', title: 'mooncake-integration', url: 'https://github.com/kvcache-ai/Mooncake/tree/main/mooncake-integration', desc: 'Python 绑定与框架集成层' },
        ]}
      />
    </div>
  );
}