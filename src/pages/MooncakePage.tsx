import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, CodeBlock, ResourceTable } from '../components/CodeBlock';

const GH = 'https://github.com/kvcache-ai/Mooncake/blob/main';

function SrcLink({ path }: { path: string }) {
  return (
    <a href={`${GH}/${path}`} target="_blank" rel="noopener noreferrer">
      <code>{path}</code>
    </a>
  );
}

export function MooncakePage() {
  return (
    <div className="prose max-w-none">
      <h1>Mooncake — KVCache-Centric 分离式推理的缓存池化与 P/D 同步</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-09</span>
        <span className="page-meta-item">⏱️ 阅读约 55 分钟</span>
        <span className="page-meta-item">🏷️ 专题 · Mooncake · KV Pool · P/D 分离</span>
      </div>
      <p>
        深入分析 <code>kvcache-ai/Mooncake</code>（FAST 2025 最佳论文）的实现机制，按 <strong>Pi-0.5 粒度</strong>拆解三大核心：
        <strong>缓存池化</strong>（Segment + 双分配器 + 分配策略 + 两阶段 Put/Get）、<strong>缓存管理</strong>（水位驱逐 + 并行普查 + 软/硬钉保护 + 租约）、
        <strong>P/D 分离数据同步</strong>（两阶段代理 + kv_transfer_params 全链路 + Transfer Engine 直传 + ProcessGroup 数据面）。
        每个关键点附真实源码 + 逐行解释 + 可点击跳转 GitHub 的文件路径。
      </p>

      <Callout type="info">
        源码位置：<code>/data/sd/Mooncake</code>（本地克隆），GitHub 上游：<a href="https://github.com/kvcache-ai/Mooncake" target="_blank" rel="noopener noreferrer">kvcache-ai/Mooncake</a>。页面内所有 <code>SrcLink</code> 均指向 <code>{'{'}GH{'}'}/&lt;path&gt;</code>（GH = <code>https://github.com/kvcache-ai/Mooncake/blob/main</code>）。
      </Callout>

      <Callout type="tip">
        <strong>阅读视角：</strong>Mooncake 的部署形态与 <code>vLLM Router</code>（vLLM 版调度网关）互补：Router 管「把请求分给谁」，
        而 Mooncake 管「KV Cache 放哪、怎么同步」。两者共同构成 vLLM P/D 分离的两条关键路径——<strong>控制面</strong>（请求路由）与
        <strong>数据面</strong>（KV 传输/池化）。本文聚焦数据面。
      </Callout>

      {/* ===================== 0 概览 ===================== */}
      <div className="section-divider"><span>Mooncake 概览：定位 · 六句话速懂 · 双路径部署 · 关键指标</span></div>

      <p>
        <strong>Mooncake</strong> 是月之暗面（Kimi）开源的 <strong>KV Cache 中心（KVCache-Centric）分离式推理系统</strong>，获 FAST 2025 最佳论文奖。
        它回答的问题很具体：P/D 分离之后，prefill 算出来的 KV Cache <strong>怎么存、放哪、怎么交给 decode</strong>——以及这些 KV 能不能像内存数据库一样被全局共享、副本化、分层（DRAM→SSD）。
        与「把计算节点池化」的路子不同，Mooncake 把 <strong>KV Cache 本身做成分布式存储</strong>。
      </p>

      <h3>0.1 六句话看懂 Mooncake</h3>
      <ul>
        <li><strong>以 KV Cache 为中心</strong>：池化的对象是 KV Cache 而非计算节点——KV 是一等公民，可共享、可副本、可分层。</li>
        <li><strong>三面分离</strong>：元数据面（Master 只存对象→副本位置/租约/配额）、存储面（Segment 上报 + 双分配器）、传输面（Transfer Engine 20+ 协议 P2P 直传）。</li>
        <li><strong>两条 P/D 数据路径</strong>：<strong>非池化</strong>（MooncakeConnector，TE 直写 decode 内存，延迟最低）与 <strong>池化</strong>（MooncakeStoreConnector，Store 中转 + CPU/SSD 换出 + 跨实例前缀共享 + XpYd）。</li>
        <li><strong>邮包驱动的两阶段代理</strong>：<code>vllm_v1_proxy_server</code> 把一次请求拆成「prefill（max_tokens=1）+ decode 流式」两段，用 <code>kv_transfer_params</code> 邮包传递 KV 元数据。</li>
        <li><strong>缓存管理像数据库不像 LRU</strong>：水位触发驱逐 + 并行普查按租约截止排序 + 软钉(30min)/硬钉保护 + 读租约 + offload/promotion 换出换入。</li>
        <li><strong>数据面也讲容错与流控</strong>：PG 协调器 + epoch 版本化 + credit-ack 信用流控——P2P 裸写也能感知对端就绪、天然背压。</li>
      </ul>

      <h3>0.2 关键能力速览</h3>
      <table>
        <thead><tr><th>能力域</th><th>核心机制</th><th>价值</th></tr></thead>
        <tbody>
          <tr><td><strong>缓存池化</strong></td><td>Segment + Cachelib/Offset 双分配器 + RANDOM/FREE_RATIO_FIRST/CXL 策略</td><td>把散落内存/SSD 变成全局可调度资源池</td></tr>
          <tr><td><strong>缓存管理</strong></td><td>0.90 水位驱逐 + 并行普查 + 软/硬钉 + 组驱逐 + 换出/换入</td><td>KV 生命周期可控：热数据不丢、温数据不占内存</td></tr>
          <tr><td><strong>P/D 同步</strong></td><td>两阶段代理邮包 + Connector 直传/池化 + PG 集合面</td><td>KV 从 prefill 到 decode：低延迟、高带宽、可容错</td></tr>
          <tr><td><strong>传输面</strong></td><td>TransferRequest 统一原语 + MultiTransport 多协议路由 + HCA 选择</td><td>RDMA/TCP/NVLink/CXL/NVMe-oF/NCCL 等 20+ 协议一接口搞定</td></tr>
          <tr><td><strong>集成</strong></td><td>mooncake-wheel pybind + vLLM Connector + SGLang HiCache</td><td>主流框架开箱即用；vLLM V1 已官方内置</td></tr>
        </tbody>
      </table>

      <h3>0.3 两种部署形态：非池化直传 vs 池化 Store</h3>
      <p>
        Mooncake 在 vLLM P/D 分离里提供<strong>两条正交的数据路径</strong>，对应两种部署形态。理解「池化 vs 非池化」是读懂全页的关键分叉：
      </p>
      <table>
        <thead><tr><th>维度</th><th>非池化 · MooncakeConnector（§4.6 专题）</th><th>池化 · MooncakeStoreConnector（§4.3）</th></tr></thead>
        <tbody>
          <tr><td>KV 传输</td><td>prefill → TransferEngine <strong>RDMA 直写</strong> decode 已注册内存</td><td>prefill <strong>Put 进 Store 池</strong>，decode 按需 <strong>Get</strong></td></tr>
          <tr><td>元数据面</td><td>无 Master：HTTP 邮包 + ZMQ 带外通道</td><td>Master Server：对象/副本/租约/配额</td></tr>
          <tr><td>前缀共享</td><td>仅限同一次请求链路</td><td>跨实例 hash 前缀去重共享</td></tr>
          <tr><td>CPU/SSD 换出</td><td>不支持</td><td>支持（offload/promotion）</td></tr>
          <tr><td>XpYd 弹性</td><td>点对点绑定，不支持动态扩缩</td><td>支持（kv_both / kv_producer / kv_consumer）</td></tr>
          <tr><td>端到端延迟</td><td><strong>最低</strong>（一次 RDMA 直写）</td><td>略高（Store 中转一跳）</td></tr>
          <tr><td>适用场景</td><td>1P1D 固定拓扑、极致 TTFT</td><td>XpYd 弹性集群、前缀复用率高、需要换出</td></tr>
        </tbody>
      </table>

      <h3>0.4 关键指标</h3>
      <table>
        <thead><tr><th>指标</th><th>数值</th><th>来源/说明</th></tr></thead>
        <tbody>
          <tr><td>非池化直传带宽</td><td><strong>142.25 GB/s</strong>（8x RoCE 利用率 71.1%）</td><td>官方 vLLM V1 PD 指南（disagg-prefill-decode.md）</td></tr>
          <tr><td>池化 TTFT 提升</td><td><strong>~32%</strong>（2P2D tp=2 RDMA 均值）</td><td>相比 Redis 后端（kv-cache-storage.md）</td></tr>
          <tr><td>发送线程</td><td>默认 10 workers × 2 任务</td><td><code>VLLM_MOONCAKE_SENDER_WORKERS</code></td></tr>
          <tr><td>KV 软钉 TTL</td><td>默认 30min，上限 24h</td><td><code>DEFAULT_KV_SOFT_PIN_TTL_MS</code></td></tr>
          <tr><td>驱逐水位</td><td>0.90 高水位，每次回收 ≥5%</td><td><code>DEFAULT_EVICTION_HIGH_WATERMARK_RATIO</code></td></tr>
          <tr><td>侧信道端口</td><td>6557 + dp_rank × tp_size + tp_rank</td><td><code>VLLM_MOONCAKE_SIDE_CHANNEL_PORT</code></td></tr>
        </tbody>
      </table>

      {/* ===================== 1 定位与整体架构 ===================== */}
      <div className="section-divider"><span>定位与整体架构：元数据面 / 存储面 / 传输面 三面分离</span></div>

      <p>
        Mooncake（月之暗面 Kimi 开源，FAST 2025 Best Paper）的核心主张是<strong>以 KV Cache 为中心</strong>重构分离式推理：
        不是把「计算节点」池化，而是把「KV Cache」本身做成一棵可共享、可池化、可分层（DRAM→SSD）的分布式存储。
        技术报告（<a href="https://arxiv.org/abs/2504.17734" target="_blank" rel="noopener noreferrer">arXiv 2504.17734</a>）把系统拆成三块：
      </p>
      <ul>
        <li><strong>Mooncake Store</strong>（<code>mooncake-store/</code>）：分布式 KV 缓存引擎。Master Server 只存<strong>元数据</strong>（对象→副本位置、租约、配额），各节点通过 Segment 上报自己的内存/SSD 段。</li>
        <li><strong>Transfer Engine</strong>（<code>mooncake-transfer-engine/</code>）：统一数据传输层。数据在节点间 <strong>P2P 直传</strong>，完全绕过 Master，支持 RDMA / TCP / NVLink / CXL / NVMe-oF / NCCL / HIP 等 20+ 协议。</li>
        <li><strong>Mooncake PG / EP</strong>（<code>mooncake-pg/</code> + <code>mooncake-ep/</code>）：容错 ProcessGroup（协调器 + 活跃 rank 感知）与弹性专家并行，提供 P/D 之外的集合通信数据面。</li>
      </ul>

      <MermaidDiagram chart={`
graph TB
    subgraph Apps["集成层 (mooncake-integration / mooncake-wheel)"]
        App_vLLM["vLLM Connector<br/>MooncakeConnector / MooncakeStoreConnector"]
        App_SGLang["SGLang HiCache"]
        App_Proxy["vllm_v1_proxy_server.py<br/>P/D 两阶段代理"]
    end

    subgraph Store["Mooncake Store（存储面）"]
        Master["Master Server<br/>仅元数据：对象索引 + 副本 + 租约 + 配额"]
        Client["Store Client / RealClient<br/>Put / Get / MountSegment / register_buffer"]
        Alloc["Allocator 层<br/>CachelibBufferAllocator / OffsetBufferAllocator"]
        Strat["AllocationStrategy<br/>RANDOM / FREE_RATIO_FIRST / CXL"]
        Replica["Replica Manager<br/>MEMORY / DISK / LOCAL_DISK / NOF_SSD / DFS"]
    end

    subgraph TE["Transfer Engine（传输面）"]
        Engine["TransferEngine<br/>submitTransfer / registerLocalMemory"]
        MT["MultiTransport<br/>协议优先级路由 + 故障转移"]
        Topo["Topology<br/>preferred_hca / avail_hca"]
    end

    subgraph Transport["网络传输层"]
        RDMA["RDMA · TCP · NVLink · CXL"]
        NVMe["NVMe-oF · NCCL · HIP · EFA · Ascend"]
    end

    subgraph PG["Mooncake PG（容错数据面）"]
        Coord["Coordinator<br/>rank 注册 / epoch / 激活/去激活"]
        P2P["P2PProxy<br/>credit-ack 状态机"]
    end

    Apps --> Client
    Client -->|"coro_rpc RPC"| Master
    Master --> Alloc
    Master --> Strat
    Client -->|"TransferRequest{READ,WRITE}"| Engine
    Engine --> MT --> Transport
    PG --> TE
    App_Proxy --> App_vLLM
`} maxWidth={700} />

      <p>仓库顶层模块与职责：</p>
      <table>
        <thead><tr><th>模块</th><th>路径</th><th>职责</th></tr></thead>
        <tbody>
          <tr><td><strong>Mooncake Store</strong></td><td><code>mooncake-store/</code></td><td>分布式 KV 池：Master 元数据 + Client 读写 + 分配/驱逐/租约/配额</td></tr>
          <tr><td><strong>Transfer Engine</strong></td><td><code>mooncake-transfer-engine/</code></td><td>统一传输接口，20+ 协议，MultiTransport 多路径聚合</td></tr>
          <tr><td><strong>ProcessGroup</strong></td><td><code>mooncake-pg/</code></td><td>容错集合通信（broadcast/allreduce/send/recv），协调器 + P2P 信用流控</td></tr>
          <tr><td><strong>Integration</strong></td><td><code>mooncake-integration/</code> + <code>mooncake-wheel/</code></td><td>pybind 绑定、vLLM 连接器、P/D 代理</td></tr>
          <tr><td><strong>EP</strong></td><td><code>mooncake-ep/</code></td><td>弹性专家并行（兼容 DeepEP dispatch/combine）</td></tr>
        </tbody>
      </table>

      <h3>1.1 一个 KV 对象的一生：Segment → 分配 → 写入 → 读取</h3>
      <p>
        先建立全局心智模型：每个推理节点的本地内存/SSD 被切成若干 <strong>Segment</strong> 上报给 Master；一个 <strong>KV 对象</strong>（key 通常是 vLLM 的 block hash / SGLang 的 token 前缀）在写入时被分配 <code>replica_num</code> 个<strong>副本</strong>，分散到多个 Segment 上；读取时从 Master 拿副本描述符，再用 Transfer Engine 直读远端内存。
      </p>

      <MermaidDiagram chart={`
sequenceDiagram
    participant C as Store Client
    participant M as Master Server
    participant A as Allocator Manager
    participant S as Segment (DRAM/SSD)
    participant T as Transfer Engine

    Note over C,M: 阶段一：挂载 Segment（上报资源）
    C->>C: registerLocalMemory(base, size, remote_accessible=true)
    C->>M: MountSegment(Segment{base, size, te_endpoint})
    M-->>C: OK（分配器已注册）

    Note over C,M: 阶段二：两阶段 Put（写入 KV）
    C->>M: PutStart(key, slice_length, ReplicateConfig)
    M->>A: allocation_strategy_->Allocate(length, replica_num)
    A-->>M: vector<Replica> (status=PROCESSING)
    M-->>C: vector<Replica::Descriptor>{buffer_address, protocol, endpoint}
    C->>S: TransferRequest{opcode=WRITE, target_id, target_offset, length}
    C->>M: PutEnd(ObjectMeta, ReplicaType)
    M->>M: replica.mark_complete() + GrantReadLease
    M-->>C: OK

    Note over C,M: 阶段三：读取 KV（先查元数据，再直读）
    C->>M: GetReplicaList(key)
    M-->>C: descriptors + ttl + checksum（GrantReadLease）
    C->>S: TransferRequest{opcode=READ, source=远端buffer, length}
    S-->>C: 数据直达本地内存（零拷贝）
`} maxWidth={680} />

      <p>下面按 <strong>缓存池化 → 缓存管理 → P/D 分离数据同步</strong> 三节逐行拆解。</p>

      {/* ===================== 2 缓存池化实现 ===================== */}
      <div className="section-divider"><span>缓存池化实现：Segment 挂载 → 双分配器 → 分配策略 → 副本与两阶段 Put</span></div>

      <p>
        「池化」的本质是把分散在每台机器上的内存/SSD 抽象成<strong>可被全局调度</strong>的统一资源池。Mooncake 用三层结构实现：<strong>Segment</strong>（资源单位）→ <strong>Allocator</strong>（段内分配）→ <strong>AllocationStrategy</strong>（跨段选择）。
      </p>

      <h3>2.1 Segment：池化的最小资源单位</h3>
      <p>
        Segment 在 <SrcLink path="mooncake-store/include/segment.h" /> 中定义，是节点向 Master 注册的<strong>一块连续可访问内存</strong>。关键字段是 <code>base</code>/<code>size</code>（物理范围）与 <code>te_endpoint</code>（传输引擎端点）——Master 只知道这两个信息就能把副本「指」到任意节点：
      </p>
      <CodeBlock language="cpp" title="Segment 结构 (segment.h)" code={`// mooncake-store/include/segment.h
struct Segment {
    SegmentID id;              // 全局唯一段 ID（uuid）
    std::string name;          // 通常 = hostname
    uint64_t base;             // 段首地址（虚拟地址）
    uint64_t size;             // 段大小
    std::string te_endpoint;   // 传输端点："ip:port" / nic path
    std::string protocol;      // "rdma" / "tcp" / "cxl" / "nvmeof" ...
    HostID host_id;            // 宿主节点 ID（用于 local-first 分配）
};`} />

      <p>
        客户端挂载 Segment 的完整流程在 <SrcLink path="mooncake-store/src/client_service.cpp" /> 的 <code>MountSegmentAndGetId</code>：先在<strong>本地 Transfer Engine</strong> 注册内存（这样远端才能访问），再构造 Segment 对象，最后通过 RPC 上报 Master：
      </p>
      <CodeBlock language="cpp" title="挂载 Segment (client_service.cpp:3493-3555)" code={`// mooncake-store/src/client_service.cpp
// 1) 让本地 TE 把这块内存发布到远端（生成 rkey 等）
int rc = transfer_engine_->registerLocalMemory(
    (void*)buffer, size, location, /*remote_accessible=*/true,
    /*update_metadata=*/true);

// 2) 构造 Segment 描述
Segment segment;
segment.id      = generate_uuid();
segment.name    = local_hostname_;
segment.base    = reinterpret_cast<uintptr_t>(buffer);
segment.size    = size;
segment.protocol = protocol;
segment.host_id = host_id_;

// 3) 上报 Master → Master 创建对应的 Allocator 实例
auto mount_result = master_client_.MountSegment(segment);`} />

      <Callout type="info" title="设计要点：为什么 Segment 是「段」而不是「单块」">
        <p>一个节点可以挂载<strong>多段</strong>（全局段、本地 SSD 段、NoF SSD 段分别走 <code>MountSegment</code> / <code>MountLocalDiskSegment</code> / <code>MountNoFSegment</code>，见 <SrcLink path="mooncake-store/src/master_client.cpp" />）。每段绑定独立的 Allocator，Master 按段统计使用率。这样「同一台机器既是 DRAM 池又是 SSD 池」成为可能。</p>
      </Callout>

      <h3>2.2 双分配器：CacheLib Slab vs Offset bin</h3>
      <p>
        每个 Segment 对应一个 <code>BufferAllocatorBase</code>（<SrcLink path="mooncake-store/include/allocator.h" />）。接口的核心是 <code>allocate</code> / <code>deallocate</code> 与一个有趣的钩子 <code>getLargestFreeRegion()</code>——Master 用它对 Segment 做「还剩多大连续空间」的粗筛：
      </p>
      <CodeBlock language="cpp" title="分配器基类 (allocator.h:128-172)" code={`// mooncake-store/include/allocator.h
class BufferAllocatorBase {
public:
    virtual ~BufferAllocatorBase() = default;
    virtual std::unique_ptr<AllocatedBuffer> allocate(size_t size) = 0;
    virtual void deallocate(AllocatedBuffer* handle) = 0;
    virtual size_t capacity() const = 0;
    virtual size_t size() const = 0;
    virtual uintptr_t base() const = 0;
    virtual std::string getSegmentName() const = 0;
    virtual std::string getTransportEndpoint() const = 0;

    // 返回最大连续空闲区，用于 Master 分配决策时的粗筛
    virtual size_t getLargestFreeRegion() const = 0;
};`} />

      <p><strong>① CachelibBufferAllocator</strong>（<SrcLink path="mooncake-store/include/allocator.h" />:223）——基于 Meta CacheLib 的 slab 分配器。要求 base/size 按 <strong>4MB slab</strong> 对齐；因为 CacheLib 内部不做「最大空闲区」统计，其 <code>getLargestFreeRegion</code> 直接返回 <code>kAllocatorUnknownFreeSpace</code>，保证永远被候选（不因误估被排除）：</p>
      <CodeBlock language="cpp" title="CachelibBufferAllocator (allocator.h:223-284)" code={`// mooncake-store/include/allocator.h
class CachelibBufferAllocator
    : public BufferAllocatorBase,
      public std::enable_shared_from_this<CachelibBufferAllocator> {
public:
    static tl::expected<std::shared_ptr<CachelibBufferAllocator>, ErrorCode>
    Create(std::string segment_name, size_t base, size_t size,
           std::string transport_endpoint,
           ReplicaType replica_type = ReplicaType::MEMORY);
    // ...
    // CacheLib 没有精确的空闲区信息：返回 UNKNOWN，
    // 保证 CacheLib 段永远进入候选集（注释原话）
    size_t getLargestFreeRegion() const override {
        return kAllocatorUnknownFreeSpace;
    }
private:
    std::unique_ptr<facebook::cachelib::MemoryAllocator> memory_allocator_;
    facebook::cachelib::PoolId pool_id_;   // slab 池
};`} />

      <p><strong>② OffsetBufferAllocator</strong>（<SrcLink path="mooncake-store/include/allocator.h" />:302）——基于 <code>offset_allocator::OffsetAllocator</code> 的 <strong>bin 分配器</strong>，能精确回答 <code>getLargestFreeRegion()</code>，供 FREE_RATIO 类策略做真实空间判断：</p>
      <CodeBlock language="cpp" title="OffsetBufferAllocator (allocator.h:302-333)" code={`// mooncake-store/include/allocator.h
class OffsetBufferAllocator
    : public BufferAllocatorBase,
      public std::enable_shared_from_this<OffsetBufferAllocator> {
public:
    // 返回真正的最大空闲区（来自 OffsetAllocator 内部统计）
    size_t getLargestFreeRegion() const override;

    std::shared_ptr<offset_allocator::OffsetAllocator> getOffsetAllocator()
        const { return offset_allocator_; }
private:
    std::shared_ptr<offset_allocator::OffsetAllocator> offset_allocator_;
};`} />

      <Callout type="tip" title="什么时候用哪种？">
        <p>前者面向「KV 块固定大小、高频分配/释放」的 DRAM 池（CacheLib 的 slab 天然抗碎片）；后者面向需要「精确剩余空间」的池（SSD/NoF 段），供 <code>SSD_FREE_RATIO_FIRST</code> 等策略计算空闲率。</p>
      </Callout>

      <h3>2.3 AllocationStrategy：Master 侧如何选段放副本</h3>
      <p>
        真正的池化调度发生在 Master 的 <SrcLink path="mooncake-store/include/allocation_strategy.h" />。基类 <code>AllocationStrategy::Allocate</code> 是<strong>尽力而为</strong>的（能分配几个算几个，不足则返回部分），子类决定「优先放哪」：
      </p>
      <CodeBlock language="cpp" title="策略族 (allocation_strategy.h:241/402/514/579)" code={`// mooncake-store/include/allocation_strategy.h
// ① 随机策略：优先打满 preferred_segments，再随机补足（不同段）
class RandomAllocationStrategy : public AllocationStrategy {
    static constexpr size_t kMaxRetryLimit = 100;   // :394
    // 循环尝试：不同副本放到不同 segment（used_segments 去重）
};

// ② 排序策略：采样 kCandidateMultiplier 个候选段打分排序
class RankedAllocationStrategy : public RandomAllocationStrategy {
    static constexpr size_t kCandidateMultiplier = 6;   // :511
    // :441-465  剩余需分配量 remaining 放大 6 倍做候选采样，
    //           按 score 降序 sort，再逐个 allocateSingle
    // :483-501  兜底：随机扫 segment 直到凑够 / kMaxRetryLimit
};

// ③ 空闲率优先：score = free/capacity（用于 SSD 池）
class FreeRatioFirstAllocationStrategy final : public RankedAllocationStrategy {
    // :527  score = GetSegmentFreeRatio(allocator_manager, name)
    //        = free / capacity
};

// ④ CXL 专用：只往 preferred 的 CXL 段分配
class CxlAllocationStrategy : public AllocationStrategy { ... };

// 工厂：按类型产出（RANDOM / FREE_RATIO_FIRST / CXL / SSD_FREE_RATIO_FIRST）
inline std::shared_ptr<AllocationStrategy> CreateAllocationStrategy(...); // :643
`} />

      <p>
        以 <code>RankedAllocationStrategy::AllocateRanked</code> 为例看「采样 + 排序 + 兜底」三段式（<SrcLink path="mooncake-store/include/allocation_strategy.h" />:402-512）：
      </p>
      <CodeBlock language="cpp" title="Ranked 分配核心 (allocation_strategy.h:424-477)" code={`// 先尽量填 preferred_segments（用户/拓扑偏好，如 local-first）
for (const auto& preferred_segment : preferred_segments) {
    auto buffer = allocateSingle(allocator_manager, preferred_segment,
                                 slice_length);
    if (buffer) { replicas.emplace_back(...); used_segments.insert(...); }
}

// 再从全集群采样 kCandidateMultiplier * remaining 个段
const size_t remaining = replica_num - replicas.size();
const size_t sample_count =
    std::min(kCandidateMultiplier * remaining, names.size());
const size_t start_idx = randomIndex(names.size());   // 随机起点，均衡 shard

std::vector<Candidate> candidates;
for (size_t i = 0; i < sample_count; ++i) {
    const size_t idx = (start_idx + i) % names.size();
    // 跳过 excluded / 已用段
    candidates.push_back({idx, score(name)});
}
// 按 score 降序排序
std::sort(candidates.begin(), candidates.end(),
          [](const Candidate& l, const Candidate& r) { return l.score > r.score; });
for (const auto& candidate : candidates) {
    if (replicas.size() >= replica_num) break;
    auto buffer = allocateSingle(allocator_manager, name, slice_length);
    if (buffer) { replicas.emplace_back(std::move(buffer), ReplicaStatus::PROCESSING,
                                        replica_type); used_segments.insert(name); }
}`} />

      <Callout type="info" title="kCandidateMultiplier=6 的工程意图">
        <p>全量扫所有 segment 找「最空」的在大集群下是 O(N) 元数据遍历；只采 6× 剩余量的候选做「够好的」次优选择，既控制 Master 开销，又避免每次都扎堆同一个最空段（避免热点）。随机起点 <code>randomIndex</code> 进一步打散 shard 间的偏心。</p>
      </Callout>

      <h3>2.4 副本模型与两阶段 Put</h3>
      <p>
        分配结果是一组 <strong>Replica</strong>。副本类型枚举与写模式定义在 <SrcLink path="mooncake-store/include/replica.h" />：
      </p>
      <CodeBlock language="cpp" title="副本类型与写模式 (replica.h)" code={`// mooncake-store/include/replica.h
enum class ReplicaType {
    MEMORY = 0,      // DRAM 副本（热数据，低延迟）
    DISK = 1,        // 远端 SSD 副本（温数据，低成本）
    LOCAL_DISK = 2,  // 本地 SSD（不走网络存储）
    NOF_SSD = 3,     // NVMe-oF 远程 SSD
    ALL = 4,         // 全部类型
    DFS = 100,       // 分布式文件系统备份
};

enum class ReplicaWriteMode {
    SINGLE_REPLICA,            // 单副本：要么全成功要么失败
    FLEXIBLE_DUAL_REPLICA,     // 灵活双副本：内存分配失败可降级
    RELIABLE_MULTI_REPLICA,    // 可靠多副本：要求全配齐
};`} />

      <p>
        写入采用<strong>两阶段提交</strong>（PutStart → 数据直写 → PutEnd），把「分配空间」与「确认写入」解耦。客户端侧在 <SrcLink path="mooncake-store/src/client_service.cpp" />:1853 的 <code>Client::Put</code> 组装：
      </p>
      <CodeBlock language="cpp" title="Client::Put 两阶段 (client_service.cpp:1882-1982)" code={`// 阶段一：向 Master 要副本空间（返回可直写的描述符）
auto start_result = master_client_.PutStart(key, slice_lengths, client_cfg);
// ...
// 对每个 MEMORY / NOF 副本，用 Transfer Engine 把数据 WRITE 过去
ErrorCode transfer_err = TransferWrite(replica, slices);  // :1928
// ...
// 阶段二：确认写入完成（携带校验和；失败则 PutRevoke 回滚）
auto end_result = master_client_.PutEnd(
    ObjectMeta{key, object_checksum}, *finalize_decision.end_type);  // :1971
// 失败路径：
master_client_.PutRevoke(key, *finalize_decision.revoke_type);`} />

      <p>
        <code>PutStart</code> 的 RPC 封包在 <SrcLink path="mooncake-store/src/master_client.cpp" />:578（<code>invoke_rpc&lt;PutStart&gt;</code> 返回 <code>vector&lt;Replica::Descriptor&gt;</code>）；Master 侧入口在 <SrcLink path="mooncake-store/src/master_service.cpp" />:4390，先做参数/租户配额校验，最终调 <code>AllocateAndInsertMetadata</code>（:4119）真正执行策略分配并写入元数据分片：
      </p>
      <CodeBlock language="cpp" title="PutStart → 策略分配 (master_service.cpp:4155-4214)" code={`// 阶段 A：MEMORY 副本 —— 调用全局分配策略
if (config.replica_num > 0) {
    ScopedAllocatorAccess allocator_access = segment_manager_.getAllocatorAccess();
    // ... 组装 preferred_segments（用户指定 + writer_host 本机段优先）
    auto allocation_result = allocation_strategy_->Allocate(
        allocator_access, value_length, config.replica_num,
        preferred_segments, /*excluded=*/{}, ReplicaType::MEMORY);  // :4192
    if (!allocation_result.has_value()) {
        // 内存不够 → 置 need_mem_eviction_ = true 触发后台驱逐（第 3 节）
        if (has_enough_memory_segments) need_mem_eviction_ = true;
        // FLEXIBLE_DUAL_REPLICA 模式下允许降级成功
        return tl::make_unexpected(ErrorCode::NO_AVAILABLE_HANDLE);
    }
    allocated_memory_replicas = allocation_result->size();
    replicas = std::move(allocation_result.value());
}
// 阶段 B：NOF_SSD 副本（USE_NOF 编译开关下）
// 阶段 C：DFS 副本 ...`} />

      <p>
        <code>PutEnd</code>（<SrcLink path="mooncake-store/src/master_service.cpp" />:4583）把 PROCESSING 副本标记为 COMPLETE（:4648-4662），提交 pending 软钉，并 <code>GrantReadLease</code>（:4721）让对象立即可读。成功后该副本进入「可被 GetReplicaList 命中、可被租约保护、可被驱逐」的生命周期。
      </p>

      <Callout type="warning" title="写入一致性：最终一致 + 读租约">
        <p>PutEnd 之后副本才 <code>mark_complete()</code>，未完成的副本 <code>IsReplicaReadable</code> 返回 false，读路径不会拿到半截数据。多个副本之间是<strong>最终一致</strong>（每个副本各自直写完成即标记），跨副本同步由后台 TaskManager 补足。读的时候靠 <strong>读租约</strong>防止驱逐线程在传输中途清掉副本。</p>
      </Callout>

      <h3>2.5 GetReplicaList：读路径 + 租约授予</h3>
      <p>
        Master 的 <code>GetReplicaList</code>（<SrcLink path="mooncake-store/src/master_service.cpp" />:3742-3840）是「读」的元数据入口：遍历对象的所有 <code>IsReplicaReadable</code> 副本、返回描述符 + TTL + 校验和，并<strong>授予读租约</strong>：
      </p>
      <CodeBlock language="cpp" title="GetReplicaList（master_service.cpp:3762-3802）" code={`std::vector<Replica::Descriptor> replica_list;
metadata.VisitReplicas(
    [this](const Replica& replica) { return IsReplicaReadable(replica); },
    [this, &key, &replica_list](const Replica& replica) {
        replica_list.emplace_back(replica.get_descriptor());
        // ... DFS 副本顺带更新访问热点（供 DFS 驱逐）
    });
// ...
// 授予读租约：客户端传输期间该对象不会被驱逐/删除
metadata.GrantReadLease(std::chrono::milliseconds(default_kv_lease_ttl_));`} />

      <p>
        客户端拿到描述符后，如何选「读哪个副本」？<SrcLink path="mooncake-store/include/replica_selection.h" /> 的 <code>SelectBestReplica</code> 给出明确的本地优先序：
        <strong>本机 MEMORY → 本机 NOF_SSD → 远端 MEMORY → 远端 NOF_SSD → LOCAL_DISK → DFS → DISK</strong>。
        远端 MEMORY 之间可用 <code>BuiltinRemoteReplicaScore</code>（rdma=0 / tcp=1 / 其他=2）打分择优，或注入拓扑感知的 scorer（env <code>MC_STORE_REPLICA_SCORING=1</code>）：
      </p>
      <CodeBlock language="cpp" title="副本选择优先级 (replica_selection.h:123-169)" code={`// mooncake-store/include/replica_selection.h
inline const Replica::Descriptor *SelectBestReplica(
    const std::vector<Replica::Descriptor>& replica_list,
    const std::vector<std::string>& local_endpoints) {
    for (const auto& r : replica_list) {
        if (r.is_memory_replica()) {
            // 1) 本机 MEMORY 最优（端点在本机）
            if (IsEndpointLocal(r, local_endpoints)) return &r;
        }
    }
    // ... 依次：本机 NOF_SSD → 远端 MEMORY(打分) → 远端 NOF_SSD
    //     → LOCAL_DISK → DFS → DISK
}`} />

      <MermaidDiagram chart={`
flowchart LR
    subgraph 选副本[SelectBestReplica 优先级]
        A[本机 MEMORY] -->|未命中| B[本机 NOF_SSD]
        B -->|未命中| C[远端 MEMORY<br/>BuiltinRemoteReplicaScore<br/>rdma=0 tcp=1 其他=2]
        C -->|未命中| D[远端 NOF_SSD]
        D -->|未命中| E[LOCAL_DISK]
        E -->|未命中| F[DFS]
        F -->|未命中| G[DISK]
    end
`} maxWidth={520} />

      {/* ===================== 3 缓存管理 ===================== */}
      <div className="section-divider"><span>缓存管理：水位触发驱逐 + 并行普查 + 软/硬钉保护 + 组驱逐 + 换出/换入</span></div>

      <p>
        池化的资源是有限的，必须有<strong>驱逐（eviction）</strong>来回收。Mooncake 的驱逐是 <strong>Master 后台线程驱动</strong>的：一个 <code>EvictionThreadFunc</code> 周期性检查水位，超阈值就调 <code>BatchEvict</code> 大规模回收。设计上刻意<strong>不用传统 LRU 链表</strong>（<code>eviction_strategy.h</code> 里的 LRU/FIFO 类是历史遗留，未被 master_service.cpp 使用），而是每次驱逐时<strong>并行扫全量元数据分片</strong>、按「租约到期时间」排序选最冷对象。
      </p>

      <h3>3.1 触发条件：双水位 + 分配失败强驱</h3>
      <p>
        常量定义在 <SrcLink path="mooncake-store/include/types.h" />:84-92：<code>DEFAULT_EVICTION_HIGH_WATERMARK_RATIO = 0.90</code>、<code>DEFAULT_EVICTION_RATIO = 0.05</code>。驱逐主循环（<SrcLink path="mooncake-store/src/master_service.cpp" />:9101-9173）：
      </p>
      <CodeBlock language="cpp" title="驱逐线程主循环（master_service.cpp:9106-9123）" code={`void MasterService::EvictionThreadFunc() {
    // ...
    while (eviction_running_) {
        const auto now = std::chrono::system_clock::now();
        double used_ratio = segment_manager_.GetMemoryUsage().used_ratio();
        // 触发：占用率超过高水位 0.90，或上次 PutStart 分配失败置了 need_mem_eviction_
        if (used_ratio > eviction_high_watermark_ratio_ ||
            (need_mem_eviction_ && eviction_ratio_ > 0.0)) {
            // 目标回收量：至少 5%，若超水位更多则回收「超量+5%」
            double evict_ratio_target = std::max(
                eviction_ratio_,
                used_ratio - eviction_high_watermark_ratio_ + eviction_ratio_);
            double evict_ratio_lowerbound = std::max(
                evict_ratio_target * 0.5,
                used_ratio - eviction_high_watermark_ratio_);
            BatchEvict(evict_ratio_target, evict_ratio_lowerbound);  // :9121
            last_discard_time = now;
        } else if (now - last_discard_time > put_start_release_timeout_sec_) {
            // 长期无事：清理过期 PROCESSING 副本（孤儿写入）
            //   DiscardExpiredProcessingReplicas / ReleaseExpiredDiscardedReplicas
        }
        // ... NoF 段、DFS 段各有独立水位；promotion 队列重试
        std::this_thread::sleep_for(std::chrono::milliseconds(kEvictionThreadSleepMs));
    }
}`} />

      <Callout type="info" title="水位参数默认值 (types.h:84-92)">
        <p><code>DEFAULT_EVICTION_HIGH_WATERMARK_RATIO = 0.90</code>（内存占用超过 90% 开始回收）；<code>DEFAULT_EVICTION_RATIO = 0.05</code>（每次至少回收 5%）；<code>DEFAULT_ALLOW_EVICT_SOFT_PINNED_OBJECTS = true</code>（软钉对象在 TTL 到期后允许被驱逐）。</p>
      </Callout>

      <h3>3.2 BatchEvict：并行普查 + 按租约截止排序</h3>
      <p>
        <code>BatchEvict</code>（<SrcLink path="mooncake-store/src/master_service.cpp" />:10043-10381）先定义两个 lambda：<code>is_evictable_memory_replica</code> 与 <code>evict_replicas</code>（真正弹出副本、记账、返还租户配额）。其核心在于 <strong>Phase 1 并行 candidate census</strong>（:10397-10468）：
      </p>
      <CodeBlock language="cpp" title="Phase 1：并行候选普查（master_service.cpp:10419-10468）" code={`// Candidate 只携带「能安全重查的键」+ 租约截止时间
struct Candidate {
    size_t shard_idx;
    TenantId tenant_id;
    std::string key;
    std::chrono::system_clock::time_point lease_timeout;  // = EvictionDeadline
};

// 随机起点，避免 shard 间偏心驱逐
size_t start_idx = randomIndex(kNumShards);
std::shared_lock<std::shared_mutex> shared_lock(snapshot_mutex_);

int num_threads = std::min((int)kNumShards, 16);   // 最多 16 线程并行扫
// ...
for (int t = 0; t < num_threads; t++) {
    threads.emplace_back([&, t] {
        // 每个线程扫一段 shard
        for (size_t s = s_start; s < s_end; s++) {
            MetadataShardAccessorRW shard(this, s);
            DiscardExpiredProcessingReplicas(shard, now);
            for (const auto& [tenant_id, tenant_state] : shard->tenants) {
                for (auto it = tenant_state.metadata.begin();
                     it != tenant_state.metadata.end(); ++it) {
                    if (it->second.IsHardPinned()) continue;      // 硬钉跳过
                    bool has_evictable = can_evict_replicas(it->second);
                    // 组对象按共享组 TTL 排序（全组一致，防止过驱逐）
                    const auto deadline = it->second.EvictionDeadline();
                    if (now < deadline || !has_evictable) continue;  // 租约未到期
                    if (!IsSoftPinActive(it->second, now)) {
                        // 未软钉 → 正常候选（记录 lease_timeout）
                        local_candidates[t].push_back({s, tenant_id, it->first, deadline});
                    } else if (allow_evict_soft_pinned_objects_) {
                        // 软钉但允许驱逐 → 进 soft_pin 列表
                        local_soft_pin[t].push_back(deadline);
                    }
                }
            }
        }
    });
}
for (auto& t : threads) t.join();`} />

      <p>
        普查收集的候选随后按 <code>lease_timeout</code>（即 <code>EvictionDeadline</code>）<strong>升序排序</strong>——租约最早到期、最冷的对象最先被驱逐。排序后的驱逐逐个调用 <code>EvictGroupOrObject</code>（:1669-1746）真正执行。
      </p>

      <MermaidDiagram chart={`
flowchart TB
    START([EvictionThreadFunc]) --> RATIO{"used_ratio > 0.90<br/>或 need_mem_eviction?"}
    RATIO -->|no| SLEEP[sleep 后重查]
    RATIO -->|yes| TARGET["目标 = max(5%, 超量+5%)"]
    TARGET --> P1["Phase1: ≤16 线程并行扫 shard<br/>随机起点 · 收集 lease_timeout"]
    P1 --> FILTER{"IsHardPinned?<br/>租约未到期?<br/>软钉但可逐?"}
    FILTER -->|候选| SORT[按 EvictionDeadline 升序<br/>组对象按共享组 TTL]
    SORT --> GRP[EvictGroupOrObject<br/>组驱逐：全组 or 不逐]
    GRP --> EVICT[PopReplicasWithCacheTotalAccounting<br/>返回 bytes · 返还租户配额]
    EVICT --> DONE["标记 REMOVED · 延迟归还<br/>ReleaseExpiredDiscardedReplicas"]
`} maxWidth={560} />

      <h3>3.3 可驱逐判定与软/硬钉保护</h3>
      <p>
        单个副本是否可逐由 <code>IsEvictableMemoryReplica</code> 决定（<SrcLink path="mooncake-store/src/master_service.cpp" />:3685）——三个条件缺一不可：<strong>是内存副本</strong>（SSD/DFS 副本不走这条）、<strong>可读</strong>（没在写入中）、<strong>引用计数为 0</strong>（没被读者借用）：
      </p>
      <CodeBlock language="cpp" title="可驱逐判定 (master_service.cpp:3685-3688)" code={`bool MasterService::IsEvictableMemoryReplica(const Replica& replica) const {
    return replica.is_memory_replica() && IsReplicaReadable(replica) &&
           replica.get_refcnt() == 0;
}`} />

      <p>
        对象级保护分两种（在 <SrcLink path="mooncake-store/include/replica.h" />:108-112 的 <code>ReplicateConfig</code> 与 <code>master_service.cpp</code> 的 <code>IsSoftPinActive</code>/<code>IsHardPinned</code> 体现）：
      </p>
      <ul>
        <li><strong>硬钉（hard pin）</strong>：<code>with_hard_pin=true</code>，对象<strong>永不可驱逐</strong>。普查第一行就 <code>continue</code> 跳过。</li>
        <li><strong>软钉（soft pin）</strong>：<code>soft_pin_action / soft_pin_ttl_ms</code>，默认 TTL <strong>30 分钟</strong>（<code>DEFAULT_KV_SOFT_PIN_TTL_MS</code>）、上限 <strong>24 小时</strong>（<code>DEFAULT_MAX_KV_SOFT_PIN_TTL_MS</code>）。到期后 <code>IsSoftPinActive</code> 返回 false，进入可驱逐候选。典型用途：P/D 分离里 decode 还在陆续消费的 KV 对象，prefill 写入时软钉一下，避免 decode 没拉完就被逐。</li>
      </ul>
      <CodeBlock language="cpp" title="软钉判定 (master_service.cpp:2576-2582)" code={`bool MasterService::IsSoftPinActive(
    const ObjectMetadata& metadata,
    const std::chrono::system_clock::time_point& now) const {
    const auto evaluation = metadata.EvaluateSoftPin(now);
    ApplySoftPinEvaluation(metadata, evaluation);   // 顺带更新 deadline 索引
    return evaluation.active;
}`} />

      <h3>3.4 组驱逐：全组 or 不逐</h3>
      <p>
        <code>ReplicateConfig.group_ids</code>（replica.h:126）允许把多个 key 绑成一个<strong>生命周期组</strong>（例如一次请求的全部 KV 块、或一次预填充产生的所有 block）。驱逐时<strong>要么整组逐、要么整组保留</strong>（<code>EvictGroupOrObject</code>，master_service.cpp:1669-1746）。关键理由在普查注释里写得很清楚（:10445-10449）：<em>组对象共享同一个 group TTL，按组排序候选截止线，防止把一组 KV 逐掉一半导致另一半永远孤儿。</em>
      </p>
      <CodeBlock language="cpp" title="组驱逐（master_service.cpp:1700-1721 关键逻辑）" code={`// EvictGroupOrObject：对组内每个 member 判定
for (const auto& member_metadata : ...) {
    if (!IsEvictableMemoryReplica(replica)) return GroupEvictionResult::Skip;
    if ((!allow_soft_pinned && IsSoftPinActive(member_metadata, now)) || ...) {
        return GroupEvictionResult::Skip;   // 任何一个 member 不可逐 → 整组放弃
    }
}
// 全部 member 通过 → 整组弹出
for (auto& member_metadata : ...) { evict_replicas(...); }
return GroupEvictionResult::Evicted;`} />

      <h3>3.5 换出与换入：驱逐≠删除（offload / promotion）</h3>
      <p>
        驱逐的高明之处在于「降级而非消灭」：
      </p>
      <ul>
        <li><strong>Offload-on-evict</strong>：被逐的内存副本若开了 <code>enable_offload_</code>，会先推到 LOCAL_DISK（或 DFS）再做元数据降级，热数据变温数据而不是消失（BatchEvict 里有 <code>offload_queued_this_cycle</code> 等统计）。</li>
        <li><strong>Promotion-on-hit</strong>：GetReplicaList 时发现「无 MEMORY 副本但有 LOCAL_DISK 副本」，则 <code>TryPushPromotionQueue</code>（master_service.cpp:3833-3835）把对象排队换入，后台复制回内存——L2→L1 自动升温。</li>
      </ul>

      <Callout type="warning" title="与「经典 LRU」的区别">
        <p><SrcLink path="mooncake-store/include/eviction_strategy.h" /> 里确实有 <code>LRUEvictionStrategy</code>（<code>all_key_list_</code> + <code>all_key_idx_map_</code>，AddKey/UpdateKey/EvictKey）与 <code>FIFOEvictionStrategy</code>，但在当前 <code>master_service.cpp</code> 驱逐路径中<strong>并未使用</strong>。现代实现是「并行普查 + 租约截止排序」：因为副本租约（lease）本身就是比 LRU 访问位更精准的活跃度信号——有读者在借用的对象必被保护，无需维护链表。</p>
      </Callout>

      {/* ===================== 4 P/D 分离数据同步 ===================== */}
      <div className="section-divider"><span>P/D 分离数据同步：两阶段代理 → kv_transfer_params 全链路 → TE 直传 / PG 数据面</span></div>

      <p>
        P/D 分离里最硬的问题不是「算得快」，而是 <strong>prefill 算出的 KV Cache 如何可靠、低延迟地交给 decode</strong>。Mooncake 给出两条正交路径：
      </p>
      <ul>
        <li><strong>MooncakeConnector</strong>（Transfer Engine 直传）：prefill 把 KV 块 <strong>RDMA Write 到 decode 已注册的本地内存</strong>，延迟最低，但依赖两者同时在线。</li>
        <li><strong>MooncakeStoreConnector</strong>（存储池中转）：KV 先进 Mooncake Store 池化，decode 按需拉取；支持 CPU/SSD 换出、跨实例前缀共享、XpYd 动态扩缩。</li>
      </ul>
      <p>
        两者之上是 <strong>vLLM V1 的两阶段代理</strong>——用 <code>kv_transfer_params</code> 这个「邮包」在 prefill 与 decode 之间传递 KV 元数据。
      </p>

      <h3>4.1 两阶段代理：vllm_v1_proxy_server.py</h3>
      <p>
        代理（<SrcLink path="mooncake-wheel/mooncake/vllm_v1_proxy_server.py" />）把一次请求拆成两段：<strong>先发 prefill（max_tokens=1 骗一次只算 prefill）</strong>，把预填充的 KV 落盘/落池；<strong>再把 prefill 响应里的 kv_transfer_params 原样转发给 decode</strong>（流式返回）。初始化时的「邮包」：
      </p>
      <CodeBlock language="python" title="代理初始化 kv_transfer_params (vllm_v1_proxy_server.py:162-176)" code={`req_data = req_data.copy()
# 第一阶段：发给 prefill 的邮包 —— 开启远端 decode 模式
req_data["kv_transfer_params"] = {
    "do_remote_decode": True,     # 让 prefill 知道 KV 要给远端 decode
    "do_remote_prefill": False,
    "remote_engine_id": None,     # 待 prefill 填写
    "remote_block_ids": None,
    "remote_host": None,
    "remote_port": None,
}
req_data["stream"] = False
req_data["max_tokens"] = 1        # 关键：prefill 只算一次，不生成
if "max_completion_tokens" in req_data:
    req_data["max_completion_tokens"] = 1
# ... 发到 prefill 服务`} />

      <p>
        prefill 侧 vLLM 计算完 KV 后，把 <strong>engine_id、分配的 block_ids、远端 host/port</strong> 回填进响应的 <code>kv_transfer_params</code>。代理收到后立刻转发给 decode（:229-231）：
      </p>
      <CodeBlock language="python" title="代理转发邮包给 decode (vllm_v1_proxy_server.py:226-242)" code={`response_json = response.json()
await response.aclose()  # 关键：释放连接回连接池
# 把 prefill 回填的邮包原样取出
kv_transfer_params = response_json.get("kv_transfer_params", {})
if kv_transfer_params:
    req_data["kv_transfer_params"] = kv_transfer_params

# 发给 decode（流式返回给客户端）
async def generate_stream():
    async for chunk in stream_service_response(
        decode_client_info, api, req_data, request_id=request_id):
        yield chunk`} />

      <h3>4.2 MooncakeConnector：Transfer Engine 直传路径</h3>
      <p>
        连接器（<SrcLink path="mooncake-wheel/mooncake/mooncake_connector_v1.py" />）实现了 vLLM 的 <code>KVConnectorBase_V1</code>。核心概念是 <strong>engine_id</strong>（:130-132）——每个 vLLM 部署一个，KV 传输以它做作用域隔离。块级元数据用 <code>MooncakeAgentMetadata</code>（:73-82）在 ZMQ 上带外传输（不是塞进 HTTP 邮包，而是走独立的 ROUTER socket）：
      </p>
      <CodeBlock language="python" title="engine_id + 带外元数据 (mooncake_connector_v1.py:73-132)" code={`@dataclass
class MooncakeAgentMetadata(msgspec.Struct, dict=True):
    remote_hostname: str
    remote_port: int
    request_ids: list[ReqId]
    kv_caches_base_addr: list[int]   # 各 layer 的 KV buffer 基址
    block_ids: list[list[int]]       # decode 为每个请求分配的块号

class MooncakeConnector(KVConnectorBase_V1, SupportsHMA):
    def __init__(self, ...):
        assert vllm_config.kv_transfer_config.engine_id is not None
        self.engine_id: EngineId = vllm_config.kv_transfer_config.engine_id`} />

      <p>
        decode 侧拿到 kv_transfer_params 后：分配本地块 → <code>register_kv_caches</code>（:693，把 KV 张量注册进 TE）→ 构造 <code>MooncakeAgentMetadata</code> 经 ZMQ 通知 prefill → prefill 的 <code>send_kv_to_decode</code>（:586）调用 <code>_build_transfer_params</code>（:616）把「块号对 → 内存地址对」算出来，再经 <code>batch_transfer_sync_write</code> 一次 RDMA 直写：
      </p>
      <CodeBlock language="python" title="构建传输参数 (mooncake_connector_v1.py:639-663)" code={`# 部分前缀命中：只读未算的块（远端块数 <= 本地块数）
num_local_blocks = len(local_block_ids)
assert num_local_blocks >= num_remote_blocks
if num_local_blocks > num_remote_blocks:
    local_block_ids = local_block_ids[-num_remote_blocks:]   # 只取尾巴

# 把连续块归并成组，减少 scatter 条目数
group_local_block_ids, group_remote_block_ids = group_concurrent_contiguous(
    local_block_ids, remote_block_ids)

for local_layer_addr, remote_layer_addr in zip(local_base_addr, remote_base_addr):
    for gl, gr in zip(group_local_block_ids, group_remote_block_ids):
        src_ptrs.append(local_layer_addr + gl[0] * block_len)   # 本地 KV 地址
        dst_ptrs.append(remote_layer_addr + gr[0] * block_len)  # 远端 decode 地址
        lengths.append(block_len * len(gl))
# → self.engine.batch_transfer_sync_write(remote_session, src_ptrs, dst_ptrs, lengths)`} />

      <Callout type="tip" title="为什么要带外 ZMQ + 地址换算">
        <p>HTTP 邮包只传「逻辑块号」，真正的物理地址（<code>kv_caches_base_addr + block_id * block_len</code>）通过 ZMQ 直连交换。这避免了两件事：HTTP 层泄漏内存布局、以及 decode 每次分配地址变化导致 prefill 缓存失效。</p>
      </Callout>

      <MermaidDiagram chart={`
sequenceDiagram
    participant C as Client
    participant P as Proxy
    participant PF as Prefill (MooncakeConnector)
    participant DC as Decode (MooncakeConnector)
    participant ZM as ZMQ 通道
    participant TE as Transfer Engine

    C->>P: /v1/completions (max_tokens=N)
    P->>PF: /v1/completions (max_tokens=1)<br/>kv_transfer_params{do_remote_decode}
    PF->>PF: prefill 计算 KV + register_kv_caches
    PF-->>P: response + kv_transfer_params{engine_id, block_ids, host, port}
    P->>DC: 转发 kv_transfer_params + 流式请求
    DC->>DC: 分配块 + register_kv_caches
    DC->>ZM: MooncakeAgentMetadata{block_ids, base_addr}
    ZM->>PF: 通知 prefill 发送
    PF->>TE: batch_transfer_sync_write(src=本地KV, dst=decode 内存)
    TE->>DC: RDMA Write 零拷贝（按 block_len 连续组直写）
    DC-->>P: 流式 decode 输出
    P-->>C: 流式响应
`} maxWidth={700} />

      <h3>4.3 MooncakeStoreConnector：存储池中转路径</h3>
      <p>
        当需要<strong>跨实例共享前缀 / CPU/SSD 换出 / XpYd 动态扩缩</strong>时，走 <code>MooncakeStoreConnector</code>。三种角色（<SrcLink path="docs/source/deployment/integrations/vllm/vllm-mooncakestoreconnector.md" />）：
      </p>
      <table>
        <thead><tr><th>角色</th><th>语义</th><th>典型部署</th></tr></thead>
        <tbody>
          <tr><td><code>kv_both</code></td><td>本机既产也消：KV 池化 + 本机复用</td><td>单节点 KV 扩展</td></tr>
          <tr><td><code>kv_producer</code></td><td>只生产：prefill 结果写池</td><td>Prefill 池</td></tr>
          <tr><td><code>kv_consumer</code></td><td>只消费：decode 按需拉取</td><td>Decode 池</td></tr>
        </tbody>
      </table>
      <p>
        关键实践：XpYd 场景下 producer 通常<strong>同时挂 MooncakeConnector + MooncakeStoreConnector</strong>（<code>MultiConnector</code>），实现「同节点 decode 直传、跨节点落池」。另一个工程细节是 <strong>固定 <code>PYTHONHASHSEED</code></strong>——vLLM 的 block hash 依赖 Python str hash，DP 多副本不固定种子会导致相同前缀哈希不一致，跨实例命中率归零。
      </p>
      <CodeBlock language="shell" title="XpYd 部署（kv-cache-storage.md）" code={`# Prefill 节点：MultiConnector = 直传 + 落池
VLLM_MOONCAKE_BOOTSTRAP_PORT=50052 vllm serve ... \\
    --kv-transfer-config '{
        "kv_connector": "MultiConnector",
        "kv_role": "kv_producer",
        "kv_connector_extra_config": {
            "connectors": [
                {"kv_connector": "MooncakeConnector",      "kv_role": "kv_producer"},
                {"kv_connector": "MooncakeStoreConnector", "kv_role": "kv_producer"}
            ]}}'

# 关键：固定 PYTHONHASHSEED，保证 DP 各 rank 的 block hash 一致
PYTHONHASHSEED=0 vllm serve ...`} />

      <h3>4.4 Mooncake PG：P/D 之外的容错集合数据面</h3>
      <p>
        <code>mooncake-pg</code>（<SrcLink path="mooncake-pg/include/mooncake_pg.h" />）提供 <code>BroadcastGpu / AllReduceGpu / AllGatherGpu / SendGpu / RecvGpu</code> 等集合原语，是 KV 传输之外的另一条数据面（也可承载 EP 的权重同步）。其 C API 与容错模型：
      </p>
      <CodeBlock language="cpp" title="mooncake-pg C API (mooncake_pg.h:156-316)" code={`mooncakePgContext *mooncakePgContextCreate(...);         // :156
int mooncakePgContextInitialize(ctx, global_rank, max_world_size); // :157
int mooncakePgContextLaunchCoordinator(...);      // rank0 起协调器 :159
int mooncakePgContextConnectCoordinator(...);     // 其他 rank 连 :162
mooncakePgComm *mooncakePgCommCreate(             // 建通信域 :181
    ctx, config{groupId, rank, size, globalRanks, deviceType});
int mooncakePgBroadcastGpu(comm, buffer, ...);     // :194
int mooncakePgSendGpu(comm, buffer, peer, ...);    // :281
int mooncakePgCommActivateRanks(comm, ranks, n);   // 容错：恢复 :311
int mooncakePgCommDeactivateRanks(comm, ranks, n); // 容错：摘除`} />

      <p>
        容错靠 <strong>epoch</strong>：协调器（<SrcLink path="mooncake-pg/src/control_plane/coordinator.cpp" />）在每次 rank 注册、端点发布、成员激活/去激活时自增 <code>view.epoch</code>（:1010-1023）。成员变化需要屏障确认（<code>pending_barriers_</code>）后才提交；rank 掉线自动去激活（:660-693），健康 rank 不可被替换（:70-76）。
      </p>
      <CodeBlock language="cpp" title="成员变更提交 (coordinator.cpp:1010-1023)" code={`if (req.is_activation) {
    for (GlobalRank rank : requested_global_ranks) {
        view.members[rank].status = GroupMemberState::Active;
    }
} else {
    for (GlobalRank rank : requested_global_ranks) {
        if (!view.members[rank].isActive()) continue;
        view.members[rank].status = GroupMemberState::Inactive;
    }
}
view.epoch++;   // 每次成员变更都 bump epoch → 数据面缓存作废`} />

      <h3>4.5 SendGpu 的传输内核：credit-ack 状态机</h3>
      <p>
        P2P 发送（<code>sendGpu → enqueueSend → p2p_proxy_</code>）不走简单的 fire-and-forget，而是一个 <strong>信用流控（credit）+ ACK 确认</strong>的状态机（<SrcLink path="mooncake-pg/src/p2p_proxy.cpp" />）：
      </p>
      <MermaidDiagram chart={`
sequenceDiagram
    participant R as Receiver
    participant S as Sender
    participant TE as Transfer Engine

    R->>TE: submitTransfer{WRITE, credit_region ← CreditSlot}<br/>（tryIssueRecvTask :604-650）
    Note over R: 广播「我有一段内存空闲」信用
    S->>S: stepSendCopyIn: cudaMemcpyAsync GPU→staging（:803-805）
    S->>TE: 看到 credit → submitTransfer{WRITE,<br/>staging → remote_addr}（stepSendWriteRemote :883-921）
    S->>TE: stepSendAck: submitTransfer{WRITE, ack_region ← AckSlot}（:928-949）
    R->>R: 收到 ACK → stepRecvCopyOut: RecvPool→用户 buffer
`} maxWidth={640} />

      <CodeBlock language="cpp" title="credit 授予 (p2p_proxy.cpp:636-643)" code={`// Receiver 把「信用槽」写给 peer —— 本质上也是 WRITE
engine_->submitTransfer(
    batch_id, {TransferRequest{
                  .opcode = TransferRequest::WRITE,
                  .source = static_cast<void*>(credit_staging_buf),
                  .target_id = meta_->segmentIDs[op_ctx.peer_rank_],
                  .target_offset = remote_credit_offset,
                  .length = sizeof(CreditSlot),
              }});`} />

      <Callout type="info" title="为什么 P2P 也要做 credit 流控">
        <p>RDMA 是内存到内存的裸写，发端无法感知接收 buffer 是否就绪。credit-ack 让接收端「先声明可收、发端看到信用才写、写完回 ACK」——既防写进未就绪内存，又天然实现背压（接收端不 release credit，发端自然停）。PG 的所有 <code>BroadcastGpu/SendGpu</code> 底层复用这个状态机。</p>
      </Callout>

      <h3>4.6 非池化场景专题：P/D 分离下 KV Cache 存取全流程</h3>
      <p>
        本节把 §4.2 的 MooncakeConnector 直传路径放大成一个<strong>端到端业务专题</strong>：在<strong>不启用 Mooncake Store（非池化）</strong>的部署里，
        一次 P/D 分离请求中，KV Cache 如何在 Mooncake 各组件的协作下被<strong>存</strong>（prefill 计算 → 直写）与<strong>取</strong>（decode 拉取 → 就绪）。
        整条链路只依赖 3 类运行时组件：<code>vllm_v1_proxy_server.py</code>（两阶段代理）、prefill/decode 各自的 vLLM 实例（内嵌 MooncakeConnector）、以及每个节点一个的 TransferEngine——<strong>没有 Master、没有 Store、没有副本</strong>。
        核心矛盾是：KV 块在 prefill 的显存里，decode 却要在自己的显存里读到它。Mooncake 的答案是 <strong>控制面 pull + 数据面 push</strong>：
        decode 用 ZMQ 通知「我要哪些块、我内存在哪」，prefill 用 RDMA 把 KV 直接写进 decode 已注册的内存。
      </p>

      <h4>4.6.1 业务角色与组件地图</h4>
      <table>
        <thead><tr><th>组件</th><th>角色（非池化）</th><th>关键职责</th></tr></thead>
        <tbody>
          <tr><td><code>vllm_v1_proxy_server.py</code></td><td>两阶段代理</td><td>邮包生成与转发、prefill-only 欺骗（max_tokens=1）、连接池复用</td></tr>
          <tr><td>Prefill vLLM + MooncakeConnector</td><td><code>kv_producer</code></td><td>计算 KV、<code>register_kv_caches</code> 注册内存、监听 ZMQ ROUTER、<code>send_kv_to_decode</code> 直写</td></tr>
          <tr><td>Decode vLLM + MooncakeConnector</td><td><code>kv_consumer</code></td><td>识别远端 prefill、分配本地块、ZMQ 通知、确认 KV 就绪</td></tr>
          <tr><td>TransferEngine（每节点一个）</td><td>数据面</td><td><code>batch_register_memory</code> / <code>batch_transfer_sync_write</code>（RDMA/TCP）</td></tr>
          <tr><td>ZMQ 带外通道</td><td>控制面</td><td>传输 <code>MooncakeAgentMetadata</code>（块号 + 各层基址），不走 HTTP</td></tr>
        </tbody>
      </table>

      <h4>4.6.2 业务流程图（端到端 · 业务视角）</h4>
      <MermaidDiagram chart={`
flowchart TB
    A([客户端发起 /v1/completions]) --> B["两阶段代理<br/>vllm_v1_proxy_server.py"]
    B -->|"阶段① prefill-only"| C["转发 Prefill<br/>max_tokens=1 · 邮包 do_remote_decode=true"]
    C --> D["Prefill 计算全部 prompt 的 KV Cache"]
    D --> E["Prefill 把 KV 张量注册进 TransferEngine<br/>register_kv_caches → batch_register_memory"]
    E --> F["Prefill 请求结束时延迟释放 KV 块<br/>request_finished 回填邮包<br/>{remote_host, remote_port, remote_request_id}"]
    F --> B
    B -->|"阶段② decode 流式"| G["转发 Decode<br/>原请求 + 邮包 do_remote_prefill=true"]
    G --> H["Decode 调度器识别远端 prefill<br/>get_num_new_matched_tokens → 剩余 prompt 免重复计算"]
    H --> I["Decode 分配本地 KV 块<br/>update_state_after_alloc → _reqs_need_recv"]
    I --> J["Decode 注册本地 KV 内存到 TE<br/>（kv_consumer 同样 register_kv_caches）"]
    J --> K["Decode ZMQ 通知 Prefill<br/>MooncakeAgentMetadata{base_addr, block_ids}"]
    K --> L["Prefill 收到通知<br/>await ready.wait() 等块真正就绪"]
    L --> M["Prefill 换算 src/dst 物理地址<br/>_build_transfer_params（addr = base + 块号 × block_len）"]
    M --> N["TE batch_transfer_sync_write<br/>一次 RDMA 直写 decode 内存"]
    N --> O["TRANS_DONE 回执 → decode 侧 KV 就绪"]
    O --> P["decode 注意力直接读本地 KV<br/>生成流式输出 → 代理 → 客户端"]
    P --> Q([请求结束：双方 request_finished<br/>延迟释放 KV 块 · 超时兜底])
`} maxWidth={640} />

      <p>
        图中<strong>绿色虚线以上的步骤只走 HTTP（控制面），虚线以下的步骤走 ZMQ + RDMA（数据面）</strong>。客户端感知到的只是「发一个请求、收一段流式回复」——
        两阶段拆分、邮包回填、ZMQ 握手、RDMA 直写全部被 Mooncake 封装在代理与 Connector 内部。
      </p>

      <h4>4.6.3 全流程时序图（组件 + 代码标注）</h4>
      <MermaidDiagram chart={`
sequenceDiagram
    participant CL as 客户端
    participant PR as 两阶段代理<br/>vllm_v1_proxy_server.py
    participant PF as Prefill vLLM<br/>MooncakeConnector kv_producer
    participant DC as Decode vLLM<br/>MooncakeConnector kv_consumer
    participant ZM as ZMQ 带外通道
    participant TE as TransferEngine

    Note over PF,DC: 启动期：双方把 KV 内存注册进 TE（远端才可 RDMA 访问）
    PF->>TE: initialize(P2PHANDSHAKE, rdma) + get_rpc_port
    DC->>TE: initialize(P2PHANDSHAKE, rdma) + get_rpc_port
    PF->>TE: register_kv_caches → batch_register_memory(base_addr[])
    DC->>TE: register_kv_caches → batch_register_memory(base_addr[])
    Note over PF: 监听 ZMQ ROUTER side_channel_port + tp_rank

    CL->>PR: POST /v1/completions（max_tokens=N）
    Note over PR,PF: 阶段① prefill-only 计算
    PR->>PF: POST max_tokens=1 + 邮包{do_remote_decode:true}
    PF->>PF: 计算 KV → update_state_after_alloc → _reqs_need_send 占位(ready Event)
    PF-->>PR: 200 + 邮包{do_remote_prefill:true,<br/>remote_host, remote_port, remote_request_id}

    Note over PR,DC: 阶段② decode 流式 + KV 拉取
    PR->>DC: POST 原请求 + 邮包
    DC->>DC: get_num_new_matched_tokens →<br/>剩余 prompt 都来自远端 KV，不重复算
    DC->>DC: 分配本地块 → update_state_after_alloc → _reqs_need_recv
    DC->>DC: build_connector_meta → start_load_kv → group_kv_pull → receive_kv
    DC->>ZM: REQ MooncakeAgentMetadata{rpc_port, base_addr[], block_ids[]}
    ZM->>PF: ROUTER 收到 → _sender_worker
    PF->>PF: send_kv_to_decode → await ready.wait() → _build_transfer_params
    PF->>TE: batch_transfer_sync_write(src[], dst[], lengths[])
    TE->>DC: RDMA 零拷贝直写 decode 已注册内存
    ZM-->>DC: TRANS_DONE
    DC->>DC: finished_recving_reqs → KV 就绪，直接做注意力
    DC-->>PR: 流式 decode 输出（SSE）
    PR-->>CL: 流式响应

    Note over DC,PF: 收尾：request_finished 延迟释放<br/>+ VLLM_MOONCAKE_ABORT_REQUEST_TIMEOUT 超时兜底
`} maxWidth={760} />

      <h4>4.6.4 路径 A（存）：prefill 侧发送内核</h4>
      <p>
        「存」的本质是 <strong>prefill 把显存里的 KV 块写进 decode 的显存</strong>。前置条件是 <code>register_kv_caches</code>——只有本地内存被 TransferEngine 注册（生成 rkey），远端才能发起 RDMA 访问：
      </p>
      <CodeBlock language="python" title="注册 KV 内存（mooncake_connector_v1.py:693-742）" code={`# Worker 启动后由 vLLM 调用：把本节点 KV 张量注册进 TE
for layer_name, cache_or_caches in kv_caches.items():
    # split_k_and_v（非 MLA/Pallas/FlashInfer）时每层有 K/V 两个张量
    cache_list = cache_or_caches if self.split_k_and_v else [cache_or_caches]
    for cache in cache_list:
        base_addr = cache.data_ptr()
        if base_addr in seen_base_addresses: continue   # 同一层去重
        seen_base_addresses.append(base_addr)
        kv_data_ptrs.append(base_addr)
        kv_data_lens.append(cache.nbytes)
self.kv_caches_base_addr = seen_base_addresses      # :729 各层 KV 基址
self.engine.batch_register_memory(kv_data_ptrs, kv_data_lens)  # :731 发布 rkey
self.block_len = tensor_size_bytes // self.num_blocks        # :739 单块字节数
# kv_producer 额外启动 ZMQ ROUTER，监听 side_channel_port + tp_rank
# kv_consumer 则直接 return（无需监听，只作为接收方）`} />

      <p>
        KV 就绪后，prefill 的请求在 <code>request_finished</code>（FINISHED_LENGTH_CAPPED，因为 max_tokens=1）里被判定为「要交给远端 decode」：
        <code>delay_free_blocks = True</code>，块号进 <code>_reqs_need_send</code>，并把 <code>remote_host / remote_port / remote_request_id</code> 回填进响应邮包。
        真正触发传输的是 decode 的 ZMQ 请求——prefill 侧收到后走 <code>send_kv_to_decode</code>：
      </p>
      <CodeBlock language="python" title="存端发送（mooncake_connector_v1.py:586-672）" code={`async def send_kv_to_decode(self, meta: MooncakeAgentMetadata):
    for req_id in meta.request_ids:
        send_meta = self.reqs_need_send.get(req_id)
        if send_meta is None: return              # 找不到 → 放弃整批
        send_meta.expire_time = float("inf")       # 已开始发送，不再超时
    src_ptrs, dst_ptrs, lengths = await self._build_transfer_params(send_reqs, meta)
    remote_session = f"{meta.remote_hostname}:{meta.remote_port}"  # TE 会话
    ret = await self.sender_loop.run_in_executor(
        self._sender_executor, self._send_blocks,
        remote_session, src_ptrs, dst_ptrs, lengths)
    if ret != 0: raise RuntimeError(...)           # 失败向上抛 → TRANS_ERROR
    for req_id in meta.request_ids: del self.reqs_need_send[req_id]
    self.finished_sending_reqs.update(meta.request_ids)

async def _build_transfer_params(self, send_reqs, agent_meta):
    for (req_id, send_meta), remote_block_ids in zip(send_reqs, agent_meta.block_ids):
        await send_meta.ready.wait()               # 等 prefill 的 KV 块真正算完
        if num_remote_blocks == 0: continue        # 远端不需要 → 跳过
        local_block_ids = send_meta.local_block_ids
        if num_local_blocks > num_remote_blocks:
            local_block_ids = local_block_ids[-num_remote_blocks:]  # 部分前缀命中
        # 连续块归并成组，减少 RDMA scatter 条目
        gl, gr = group_concurrent_contiguous(local_block_ids, remote_block_ids)
        for local_layer_addr, remote_layer_addr in zip(local_base_addr, remote_base_addr):
            for g_local, g_remote in zip(gl, gr):
                src_ptrs.append(local_layer_addr  + g_local[0]  * block_len)  # prefill KV
                dst_ptrs.append(remote_layer_addr + g_remote[0] * block_len)  # decode 内存
                lengths.append(block_len * len(g_local))`} />

      <CodeBlock language="python" title="落到底：一次同步批写（mooncake_connector_v1.py:674-691）" code={`def _send_blocks(self, remote_session, src_ptrs, dst_ptrs, lengths) -> int:
    # 在 10 个 sender worker 线程之一执行；返回 0 表示成功
    return self.engine.batch_transfer_sync_write(
        remote_session, src_ptrs, dst_ptrs, lengths)`} />

      <h4>4.6.5 路径 B（取）：decode 侧触发与就绪</h4>
      <p>
        「取」的本质是 <strong>decode 主动发起拉取，让远端把 KV 送进自己内存</strong>。起点是代理转发来的邮包（<code>do_remote_prefill=true</code>），decode 的调度器在三个钩子里把它转化为实际的拉取动作：
      </p>
      <CodeBlock language="python" title="取端调度三钩子（mooncake_connector_v1.py:251-342）" code={`# ① 计算「可以从远端补多少 token」→ 决定要不要省掉本地重复 prefill
def get_num_new_matched_tokens(self, request, num_computed_tokens):
    params = request.kv_transfer_params
    if params and params.get("do_remote_prefill"):
        count = len(request.prompt_token_ids) - num_computed_tokens
        if count > 0: return count, True    # (新增匹配数, 异步加载 KV)
    return 0, False

# ② 分配本地块之后，把「要拉的块」记入 _reqs_need_recv
def update_state_after_alloc(self, request, blocks, num_external_tokens):
    params = request.kv_transfer_params
    if not params: return
    if params.get("do_remote_prefill"):
        assert self.kv_role != "kv_producer"
        if all(p in params for p in ("remote_host", "remote_port")):
            local_block_ids = (blocks.get_unhashed_block_ids()
                               if num_external_tokens > 0 else [])
            self._reqs_need_recv[request.request_id] = (request, local_block_ids)
        else:
            logger.warning("Got invalid KVTransferParams ...")  # 降级为本地请求
        params["do_remote_prefill"] = False   # 每个请求只触发一次 KV 传输
    elif params.get("do_remote_decode"):
        self._reqs_need_send[request.request_id] = []  # 存端占位，等块就绪

# ③ 调度步末把 _reqs_need_recv 封进元数据 → worker 侧 start_load_kv 执行
def build_connector_meta(self, scheduler_output):
    meta = MooncakeConnectorMetadata()
    if self.kv_role != "kv_producer":
        for req_id, (req, block_ids) in self._reqs_need_recv.items():
            meta.add_new_req(req_id, block_ids, req.kv_transfer_params)  # 走拉取
    if self.kv_role != "kv_consumer":
        for req_id, block_ids in self._reqs_need_send.items():
            meta.add_new_req(req_id, block_ids, {}, load_remote_cache=False)  # 走发送
    return meta`} />

      <CodeBlock language="python" title="取端拉取动作（mooncake_connector_v1.py:818-910）" code={`async def receive_kv(self, path, req_blocks):
    # 把「要哪些远端请求的 KV + 我本地的内存地址」编码后发给 prefill
    metadata = MooncakeAgentMetadata(
        remote_hostname=self.hostname,          # decode 的 TE 会话地址
        remote_port=self.rpc_port,
        request_ids=remote_req_ids,             # prefill 侧原始请求号
        kv_caches_base_addr=self.kv_caches_base_addr,  # decode 各层 KV 基址
        block_ids=block_ids,                    # decode 为这些请求分配的块号
    )
    sock = make_zmq_socket(self.async_zmq_ctx, path, zmq.REQ, ...)
    await sock.send(self._encoder.encode(metadata))
    ret_msg = await sock.recv()                 # 等 prefill 的 TRANS_DONE / TRANS_ERROR
    if ret_msg != TRANS_DONE:
        logger.error("Error happens during transferring kvcache ...")
        return
    self.finished_recving_reqs.update(local_req_ids)   # KV 就绪，可被调度使用

def start_load_kv(self, metadata):
    if self.kv_role != "kv_producer":
        kv_pulls = self.group_kv_pull(metadata)  # 按远端 host:port 聚合
        for path, req_blocks in kv_pulls.items():
            asyncio.run_coroutine_threadsafe(
                self.receive_kv(path, req_blocks), self.receiver_loop)`} />

      <MermaidDiagram chart={`
flowchart TB
    subgraph 控制面["控制面（取 · 逻辑拉取）"]
        A1[decode 识别邮包 do_remote_prefill] --> A2[get_num_new_matched_tokens<br/>剩余 prompt 免重复计算]
        A2 --> A3[分配本地块 + 注册内存]
        A3 --> A4[ZMQ REQ 通知 prefill<br/>附 block_ids + base_addr]
    end
    subgraph 数据面["数据面（存 · 物理直写）"]
        B1[prefill ROUTER 收到通知] --> B2[await ready.wait 等块就绪]
        B2 --> B3[块号 → src/dst 物理地址换算]
        B3 --> B4[TE batch_transfer_sync_write]
        B4 --> B5[RDMA Write → decode 已注册内存]
    end
    A4 -. "MooncakeAgentMetadata" .-> B1
    B5 -. "TRANS_DONE 回执" .-> A4
`} maxWidth={560} />

      <h4>4.6.6 关键业务处理细节</h4>
      <ul>
        <li><strong>部分前缀命中</strong>：<code>_build_transfer_params</code> 里若 decode 本地已算部分前缀（<code>num_local_blocks &gt; num_remote_blocks</code>），只发送 <code>local_block_ids[-num_remote_blocks:]</code> 尾巴；若 <code>num_remote_blocks == 0</code> 则完全本地命中，但仍需 ZMQ 通知 prefill 释放其已算块。</li>
        <li><strong>ready / expire 双标记</strong>：<code>SendBlockMeta.ready</code>（Event）标记「prefill 的块已算完」，<code>expire_time</code> 标记「超过多少秒没被消费就释放」，两者解耦了「块可用」与「块必须发出去」两个时点。</li>
        <li><strong>连续块归并</strong>：<code>group_concurrent_contiguous</code> 用 NumPy 把 src/dst 相邻的块号并成组，一次传输覆盖整段连续内存——减少 scatter 条目、放大单次 RDMA 长度。</li>
        <li><strong>地址公式</strong>：<code>addr = base + block_id × block_len</code>；<code>block_len = 单层 KV 张量字节数 / num_blocks</code>。K/V 是否分张量（<code>split_k_and_v</code>）由 MLA / Pallas / FlashInfer 等 backend 决定。</li>
        <li><strong>TP 分片一致性</strong>：prefill 每个 TP rank 独立监听 <code>side_channel_port + tp_rank</code>，decode 按自身 <code>tp_rank</code> 连对应端口，保证每个 rank 只收到自己那部分 KV 分片。</li>
        <li><strong>DP 端口隔离</strong>：<code>get_mooncake_side_channel_port</code> 在基址 6557 上叠加 <code>dp_rank × tp_size</code>，多 DP rank 共享一机时端口不冲突。</li>
        <li><strong>邮包在响应里回填</strong>：prefill 的 <code>request_finished</code> 返回 <code>(delay_free_blocks, kv_transfer_params)</code>，vLLM 把它序列化进 HTTP 响应，代理 <code>response_json.get("kv_transfer_params")</code> 原样取出发给 decode——KV 元数据全程「寄邮包」。</li>
      </ul>

      <h4>4.6.7 异常与超时处理</h4>
      <table>
        <thead><tr><th>故障</th><th>识别点</th><th>处理</th></tr></thead>
        <tbody>
          <tr><td>发送异常</td><td><code>_sender_worker</code> 捕获异常</td><td>ZMQ 回 <code>TRANS_ERROR</code>；decode 收到非 <code>TRANS_DONE</code> 记日志、放弃本次拉取</td></tr>
          <tr><td>请求在调度前被 abort</td><td><code>request_finished</code> 时 <code>do_remote_prefill</code> 仍为 true</td><td>以空 block_ids 进 <code>_reqs_need_recv</code>，worker 通知 prefill 释放已算块，避免 P 端块泄漏</td></tr>
          <tr><td>发送超时</td><td><code>fetch_finished_sending_reqs</code> 扫描 <code>expire_time &lt; now</code></td><td>释放 prefill 侧块并告警（默认 <code>VLLM_MOONCAKE_ABORT_REQUEST_TIMEOUT=120s</code>）</td></tr>
          <tr><td>传输进行中超时保护</td><td><code>send_kv_to_decode</code> 置 <code>expire_time = inf</code></td><td>已开始传输的请求不再因超时被释放</td></tr>
          <tr><td>邮包缺 remote 字段</td><td><code>update_state_after_alloc</code> 的 invalid 分支</td><td>打 warning，本次请求退化为普通本地请求，不影响其他请求</td></tr>
          <tr><td>请求完成后的块释放</td><td><code>request_finished</code> 的 <code>delay_free_blocks</code></td><td>非池化无 Store 兜底，靠「延迟释放 + 超时兜底」保证 prefill 块最终被回收</td></tr>
        </tbody>
      </table>

      <h4>4.6.8 非池化 vs 池化：选型决策</h4>
      <Callout type="tip" title="什么时候走非池化直传？">
        <p><strong>非池化（MooncakeConnector）</strong>适合：<strong>1P1D 固定拓扑</strong>、对 TTFT 极致敏感、KV 体积可控、能接受「prefill 与 decode 必须同时在线」的在线服务——多一跳 Store 的代价换不回延迟收益。</p>
        <p><strong>池化（MooncakeStoreConnector）</strong>适合：<strong>XpYd 弹性扩缩</strong>、跨实例前缀共享命中率高、需要 CPU/SSD 换出扩容、或要容忍单实例崩溃的业务。还可以用 <code>MultiConnector</code> 同时挂两个 Connector——<strong>同节点 decode 走直传、跨节点落池</strong>。</p>
      </Callout>

      {/* ===================== 5 Transfer Engine ===================== */}
      <div className="section-divider"><span>Transfer Engine：统一传输原语 → 多协议路由 → RDMA 注册与分片</span></div>

      <p>
        Store 的副本直写、PG 的集合通信、vLLM 的 KV 直传，最终都落在 Transfer Engine 的 <strong>统一原语</strong>上。本节拆解其实现。
      </p>

      <h3>5.1 统一原语：TransferRequest + BatchID</h3>
      <p>
        传输的最小单元是 <code>TransferRequest</code>（<SrcLink path="mooncake-transfer-engine/include/transport/transport.h" />:60-75）。<code>source</code> 是本地虚拟地址，<code>target_id</code> 是远端 <strong>SegmentID</strong>，<code>target_offset</code> 是段内偏移——一次调用即可完成「本地内存 → 远端 Segment 的某段」：
      </p>
      <CodeBlock language="cpp" title="TransferRequest (transport.h:60-75)" code={`struct TransferRequest {
    enum OpCode { READ, WRITE };

    static constexpr uint64_t kNoTaskGroup = 0;

    OpCode opcode;          // READ：从远端读回；WRITE：写向远端
    void *source;           // 本地虚拟地址
    SegmentID target_id;    // 远端段 ID（openSegment 拿到的句柄）
    uint64_t target_offset; // 远端段内偏移
    size_t length;          // 字节数
    int advise_retry_cnt = 0;
    int transport_hint = 0;                 // 传输协议钉选（TENT）
    uint64_t task_group_id = kNoTaskGroup;  // 相邻请求可成组调度
};`} />

      <p>
        一个有意思的实现细节是 <code>BatchID</code> 不是索引，而是<strong>指针别名</strong>（transport.h:101-114）——直接把堆上 <code>BatchDesc</code> 对象的地址 reinterpret_cast 成 64 位整数返回，省掉一次 map 查找：
      </p>
      <CodeBlock language="cpp" title="BatchID → BatchDesc 指针重解释 (transport.h:101-114)" code={`// BatchID 是一个不透明的 64 位整数，携带 BatchDesc 指针值。
// 出于性能考虑，直接 reinterpret_cast 为 BatchDesc 引用，绕过一切 map 查询。
static inline BatchDesc &toBatchDesc(BatchID id) {
    return *reinterpret_cast<BatchDesc *>(id);
}`} />

      <h3>5.2 MultiTransport：按协议优先级路由</h3>
      <p>
        一次 <code>submitTransfer</code> 到了 <code>MultiTransport::submitTransfer</code>（<SrcLink path="mooncake-transfer-engine/src/multi_transport.cpp" />:130-197），会为每个请求调 <code>selectTransport</code> 选一个具体传输器。选择的核心是<strong>按目标 Segment 的协议 + 优先级表</strong>（:581-685）：<code>hip=4 &gt; cxl=3 &gt; rdma=2 &gt; tcp=1</code>，并且跨主机时强制跳过 GPU-IPC 落到 rdma：
      </p>
      <CodeBlock language="cpp" title="selectTransport 协议优先级 (multi_transport.cpp:597-674)" code={`auto protocol_priority = [](const std::string& p) {
    if (p == "hip") return std::getenv("MC_DISABLE_HIP") ? 0 : 4;  // 同机 GPU IPC
    if (p == "cxl") return 3;
    if (p == "rdma") return 2;
    if (p == "tcp") return 1;
    return 0;
};
// 扫目标 segment 的 buffers，找到覆盖 target_offset 的那个，
// 选「优先级最高且可达」的协议；
// 跨主机时 isGpuIpcReachableTarget 为 false，强制 fall through 到 rdma。
// ...
// rdma 未安装时回退 rdma_twosided（:674-683）
if (!transport_map_.count(proto) && proto == "rdma" &&
    transport_map_.count("rdma_twosided")) {
    transport = transport_map_["rdma_twosided"].get();
    return Status::OK();
}`} />

      <p>
        选好协议后还需选<strong>网卡</strong>。拓扑模块维护 <code>preferred_hca / avail_hca</code> 两级列表（<SrcLink path="mooncake-transfer-engine/include/topology.h" />:38-59），<code>selectDevice</code>（<SrcLink path="mooncake-transfer-engine/src/topology.cpp" />:761-784）在 retry_count==0 时轮转/随机挑 preferred HCA，重试时按索引遍历：
      </p>
      <CodeBlock language="cpp" title="HCA 选择 (topology.cpp:761-784)" code={`if (retry_count == 0) {
    // ... 优先从 preferred_hca 随机/轮转取一块
    if (!entry.preferred_hca.empty())
        return entry.preferred_hca[rand_value % entry.preferred_hca.size()];
    else
        return entry.avail_hca[rand_value % entry.avail_hca.size()];
} else {
    // 重试：preferred 与 avail 拼接后按序取
    size_t index = (retry_count - 1) %
                   (entry.preferred_hca.size() + entry.avail_hca.size());
    // ...
}`} />

      <h3>5.3 RDMA 注册与分片：registerLocalMemory 内核</h3>
      <p>
        「远端能访问」的前提是本地调用 <code>registerLocalMemory</code>（<SrcLink path="mooncake-transfer-engine/include/transfer_engine.h" />:127-130）。RDMA 实现里（<SrcLink path="mooncake-transfer-engine/src/transport/rdma_transport/rdma_transport.cpp" />:284-535），它按 <code>remote_accessible</code> 决定给不给 <code>IBV_ACCESS_REMOTE_WRITE|REMOTE_READ</code>，并最终调用 <code>ibv_reg_mr</code>（GPU 走 <code>ibv_reg_dmabuf_mr</code>）：
      </p>
      <CodeBlock language="cpp" title="RDMA 注册与访问权 (rdma_transport.cpp:289-317, 586-624)" code={`// access flags 组装
int access_rights = IBV_ACCESS_LOCAL_WRITE;
if (remote_accessible)
    access_rights |= IBV_ACCESS_REMOTE_WRITE | IBV_ACCESS_REMOTE_READ;
if (MCIbRelaxedOrderingEnabled) access_rights |= IBV_ACCESS_RELAXED_ORDERING;
// 大 buffer 自动分片到 max_mr_size（Mooncake#2017）

// 最终注册（rdma_context.cpp:586-624）
mrMeta.mr = ibv_reg_mr(pd_, addr, length, access);
// GPU dma_buf 路径：
mrMeta.mr = ibv_reg_dmabuf_mr(pd_, exp.offset, length, (uintptr_t)addr,
                              exp.fd, access);
// 注册完构造 BufferDesc，把 lkey/rkey 发布进 metadata（rdma_transport.cpp:490-506）`} />

      <p>
        大请求在 <code>RdmaTransport::submitTransferTask</code>（rdma_transport.cpp:814-913）里被切成 <code>kBlockSize</code>（<code>globalConfig().slice_size</code>）的 Slice，每个 Slice 独立 <code>selectDevice</code> 选 HCA 后经 WorkerPool 投递：
      </p>
      <CodeBlock language="cpp" title="请求切片 (rdma_transport.cpp:814-830)" code={`const size_t kBlockSize = globalConfig().slice_size;
// ...
for (uint64_t offset = 0; offset < request.length;) {
    size_t slice_length = slice_calc.calculate(offset);
    Slice *slice = getSliceCache().allocate();
    slice->source_addr = (char *)request.source + offset;
    slice->length      = slice_length;
    slice->opcode      = request.opcode;
    slice->rdma.dest_addr = request.target_offset + offset;
    slice->status      = Slice::PENDING;
    // ... selectDevice 选 HCA → 投递到 worker
}`} />

      <Callout type="info" title="完成模型：fire-and-poll / event-driven 双模式">
        <p>公开 API 是「提交后轮询 <code>getTransferStatus</code>」。RDMA 侧 WorkerPool 用 <code>epoll</code> 监听 CQ 的 <code>ibv_get_cq_event</code>（worker_pool.cpp:1381-1395），每个 slice 完成时 <code>markSuccess/markFailed</code>。编译开 <code>USE_EVENT_DRIVEN_COMPLETION</code> 时，最后一个 slice 完成会 <code>completion_cv.notify_all()</code> 唤醒等待者（transport.h:222-287）。</p>
      </Callout>

      {/* ===================== 6 对比与总结 ===================== */}
      <div className="section-divider"><span>横向对比与选型结论</span></div>

      <h3>6.1 Store 直传 vs PG 数据面 vs HIXL/MemCache</h3>
      <table>
        <thead><tr><th>维度</th><th>Mooncake Store（池化）</th><th>Mooncake PG（集合）</th><th>HIXL / Ascend MemCache</th></tr></thead>
        <tbody>
          <tr><td>资源模型</td><td>Segment 上报 + 全局分配策略</td><td>rank 注册 + 协调器视图</td><td>FabricMem 全局内存池（LLM-DataDist V2）</td></tr>
          <tr><td>传输原语</td><td><code>PutStart/PutEnd</code> + <code>{'TransferRequest{READ,WRITE}'}</code></td><td>Broadcast/Send/Recv + credit-ack</td><td>UB 单边通信（<code>p2p_data_rd</code>）</td></tr>
          <tr><td>缓存管理</td><td>水位驱逐 + 软/硬钉 + 租约 + 换出/换入</td><td>epoch + 活跃 rank（无逐出）</td><td>MemCache 分级（MetaService/LocalService）</td></tr>
          <tr><td>容错</td><td>副本冗余 + Master 快照/oplog</td><td>rank 去激活/重激活 + epoch 作废</td><td>单机内存池（vllm-ascend 集成）</td></tr>
          <tr><td>P/D 定位</td><td>XpYd 跨节点 KV 池 + 前缀共享</td><td>EP 权重同步 / 集合通信</td><td>昇腾节点内 KV 池</td></tr>
        </tbody>
      </table>

      <h3>6.2 关键设计取舍回顾</h3>
      <Callout type="warning" title="四个「反直觉」设计">
        <p><strong>① Master 只碰元数据，数据永不经过它</strong>——副本直写路径让 Master 不是带宽瓶颈，但也意味着写入完整性依赖客户端自觉（两阶段 + checksum 兜底）。</p>
        <p><strong>② 驱逐用「租约截止」排序而非 LRU 链表</strong>——lease 是读者活跃度的天然信号，比访问位更准，且省掉全表排序的内存（每轮只保留候选）。</p>
        <p><strong>③ BatchID 是指针</strong>——64 位句柄直接 reinterpret_cast 成 <code>BatchDesc*</code>，零查找开销，但要求调用方保证生命周期（用后 freeBatchID）。</p>
        <p><strong>④ P/D 同步走「邮包 + 带外 ZMQ」</strong>——HTTP 层只传逻辑块号，物理地址经 ZMQ 直连交换，避免内存布局泄漏到网关。</p>
      </Callout>

      <h3>6.3 源码地图</h3>
      <p>本文引用的关键文件速查：</p>
      <ResourceTable
        resources={[
          { name: 'Mooncake 技术报告 v2', url: 'https://arxiv.org/abs/2504.17734', desc: 'Mooncake: KVCache-centric Disaggregated Architecture for LLM Serving（FAST 2025 Best Paper 扩展）' },
          { name: 'master_service.cpp', url: 'https://github.com/kvcache-ai/Mooncake/blob/main/mooncake-store/src/master_service.cpp', desc: 'Master 元数据服务：PutStart/PutEnd/GetReplicaList/驱逐/租约/配额（13K 行）' },
          { name: 'client_service.cpp', url: 'https://github.com/kvcache-ai/Mooncake/blob/main/mooncake-store/src/client_service.cpp', desc: '客户端两阶段 Put 与 TransferWrite/BatchPut' },
          { name: 'allocation_strategy.h', url: 'https://github.com/kvcache-ai/Mooncake/blob/main/mooncake-store/include/allocation_strategy.h', desc: 'RANDOM/FREE_RATIO_FIRST/CXL 分配策略与 Ranked 采样' },
          { name: 'allocator.h', url: 'https://github.com/kvcache-ai/Mooncake/blob/main/mooncake-store/include/allocator.h', desc: 'CachelibBufferAllocator / OffsetBufferAllocator 双实现' },
          { name: 'transport.h', url: 'https://github.com/kvcache-ai/Mooncake/blob/main/mooncake-transfer-engine/include/transport/transport.h', desc: 'TransferRequest / BatchID / Slice 定义' },
          { name: 'multi_transport.cpp', url: 'https://github.com/kvcache-ai/Mooncake/blob/main/mooncake-transfer-engine/src/multi_transport.cpp', desc: '多协议路由 + 协议优先级选择' },
          { name: 'mooncake_connector_v1.py', url: 'https://github.com/kvcache-ai/Mooncake/blob/main/mooncake-wheel/mooncake/mooncake_connector_v1.py', desc: 'vLLM V1 连接器：engine_id / ZMQ 元数据 / batch_transfer_sync_write' },
          { name: 'vllm_v1_proxy_server.py', url: 'https://github.com/kvcache-ai/Mooncake/blob/main/mooncake-wheel/mooncake/vllm_v1_proxy_server.py', desc: 'P/D 两阶段代理：kv_transfer_params 邮包转发' },
          { name: 'p2p_proxy.cpp', url: 'https://github.com/kvcache-ai/Mooncake/blob/main/mooncake-pg/src/p2p_proxy.cpp', desc: 'PG 数据面：credit-ack 状态机' },
          { name: 'coordinator.cpp', url: 'https://github.com/kvcache-ai/Mooncake/blob/main/mooncake-pg/src/control_plane/coordinator.cpp', desc: '协调器：rank 注册 / epoch / 容错成员变更' },
          { name: 'vLLM Mooncake Store 集成指南', url: 'https://github.com/kvcache-ai/Mooncake/blob/main/docs/source/deployment/integrations/vllm/kv-cache-storage.md', desc: 'kv_both / kv_producer / kv_consumer 部署与 XpYd MultiConnector' },
        ]}
      />
    </div>
  );
}
