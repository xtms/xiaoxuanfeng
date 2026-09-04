import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, CodeBlock, ResourceTable } from '../components/CodeBlock';

export function MooncakeKVPoolPage() {
  return (
    <div className="prose max-w-none">
      <h1>Mooncake KVPool</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-08</span>
        <span className="page-meta-item">⏱️ 阅读约 25 分钟</span>
        <span className="page-meta-item">🏷️ 专题 · KV Pool · Mooncake · Ascend</span>
      </div>
      <p>Mooncake KVPool 是 Mooncake（月之暗面/Kimi）在 Ascend 平台上的<strong>分布式 KV Cache 池化方案</strong>，由 HIXL（Huawei Interconnect Acceleration Library）提供底层传输引擎。本文基于 <strong>HIXL + Mooncake</strong> 的 Ascend 适配实现，分析其架构、传输机制、API 和部署方案。</p>

      {/* ==================== 1. 总体架构 ==================== */}
      <div className="section-divider"><span>总体架构</span></div>

      <h3>HIXL + Mooncake 分层架构</h3>
      <p>Mooncake KVPool 在 Ascend 平台上由<strong>两层组件</strong>构成：底层 HIXL Engine 提供高性能单边通信，上层 LLM-DataDist 封装 KV Cache 语义。</p>

      <MermaidDiagram maxWidth={360} chart={`
graph TB
    subgraph Apps["推理框架"]
        VLLM["vllm-ascend"]
        SGL["sglang"]
    end

    subgraph DataDist["LLM-DataDist"]
        DD_API["KV Cache 接口"]
        DD_V1["V1 (已弃用)"]
        DD_V2["V2 (当前)"]
    end

    subgraph HIXL["HIXL Engine"]
        CORE["核心引擎 (零拷贝)"]
        D2D["D2D"]
        D2H["D2H"]
        H2D["H2D"]
    end

    subgraph HW["硬件传输层"]
        HCCS["HCCS (119 GB/s)"]
        RDMA["RDMA (22 GB/s)"]
        UB["UB (URMA)"]
    end

    Apps --> DataDist
    DataDist --> HIXL
    HIXL --> HW
      `} />

      <table>
        <thead><tr><th>组件</th><th>定位</th><th>职责</th></tr></thead>
        <tbody>
          <tr><td><strong>HIXL Engine</strong></td><td>底层传输引擎</td><td>提供单边零拷贝 D2D/D2H/H2D 传输，屏蔽 Ascend 芯片代际差异，支持 HCCS/RDMA/UB 多协议</td></tr>
          <tr><td><strong>LLM-DataDist</strong></td><td>KV Cache 语义层</td><td>封装 HIXL Engine，提供带 KV Cache 语义的传输接口（put/get/transfer），对接 vllm-ascend 和 sglang</td></tr>
          <tr><td><strong>Mooncake 社区</strong></td><td>分布式 KV Pool 协议</td><td>定义 P/D 分离的 KV Cache 传输协议、Master 调度、全局页表管理</td></tr>
        </tbody>
      </table>

      <Callout type="info">
        <strong>HIXL 定位：</strong>HIXL 是"一个灵活、高效的昇腾单边通信库"，为集群场景提供点对点数据传输。
        "本地内存数据准备就绪之后，通过单边操作完成向远端内存的直接数据传输"——无需远端节点参与操作。
        vLLM、SGLang 等主流推理引擎可以直接调用 HIXL API 完成 KV Cache 的跨设备高效传输，内存访问延迟降低 20%。
      </Callout>

      {/* ==================== 2. HIXL Engine 详解 ==================== */}
      <div className="section-divider"><span>HIXL Engine 详解</span></div>

      <h3>核心设计原则</h3>
      <table>
        <thead><tr><th>原则</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><strong>单边零拷贝</strong></td><td>本地内存准备好后，通过单边操作直接写入远端内存，无需远端 CPU 参与。消除传统双边通信的握手开销</td></tr>
          <tr><td><strong>硬件抽象</strong></td><td>屏蔽 A2/A3/A5 芯片代际差异，支持跨架构设备互联（如 A2 和 A3 混合部署）</td></tr>
          <tr><td><strong>多链路支持</strong></td><td>原生支持 HCCS（片间直连）、RDMA（跨节点）、UB（Unified Buffer）等多种高速互联协议</td></tr>
          <tr><td><strong>跨代兼容</strong></td><td>支持 A2/A3/A5 异构配置，同一集群可混用不同代芯片</td></tr>
        </tbody>
      </table>

      <h3>单边通信模型</h3>
      <MermaidDiagram chart={`
sequenceDiagram
    participant Local as 本地 NPU
    participant HIXL as HIXL Engine
    participant NIC as NIC
    participant Remote as 远端 NPU

    Note over Local,Remote: 传统双边通信: 需握手 + 远端参与
    rect rgb(255, 230, 230)
        Local->>NIC: Send Request
        NIC->>Remote: 通知远端
        Remote->>Remote: CPU 参与处理
        Remote->>NIC: Recv Ready
        NIC->>Local: 开始传输
    end

    Note over Local,Remote: HIXL 单边通信: 不需要远端参与
    rect rgb(230, 255, 230)
        Local->>HIXL: put(dst_addr, src_addr, size)
        HIXL->>HIXL: 查询远端内存注册表
        HIXL->>NIC: RDMA Write (直接写入远端 HBM)
        Note over Remote: 远端 NPU 无感知<br/>数据已到达 HBM
    end
      `} />

      <h3>传输模式</h3>
      <table>
        <thead><tr><th>模式</th><th>方向</th><th>场景</th><th>协议</th></tr></thead>
        <tbody>
          <tr><td><strong>D2D</strong></td><td>Device → Device</td><td>Prefill NPU → Decode NPU (同节点/跨节点)</td><td>HCCS / RDMA / UB</td></tr>
          <tr><td><strong>D2H</strong></td><td>Device → Host</td><td>KV Cache 下沉到 CPU DDR</td><td>PCIe DMA</td></tr>
          <tr><td><strong>H2D</strong></td><td>Host → Device</td><td>从 CPU DDR 恢复 KV Cache 到 NPU HBM</td><td>PCIe DMA</td></tr>
        </tbody>
      </table>

      <CodeBlock language="python" title="HIXL Python API (pybind11)" code={`# HIXL Engine Python 绑定 (module: hixl)
# 通过 pybind11 暴露完整 C++ API

import hixl

# 1. 初始化 HIXL Engine
engine = hixl.Engine()
engine.init({
    "devices": [0, 1, 2, 3],    # 使用的 NPU 设备
    "protocol": "hccs",          # 传输协议: hccs / rdma / ub
    "links_per_dev": 4,          # 每设备链路数
})

# 2. 注册内存区域 (将 NPU HBM 注册为 RDMA 可访问)
mem_handle = engine.register_memory(
    ptr=gpu_buffer,              # NPU HBM 地址
    size=1024 * 1024 * 100,      # 100 MB
    flags=hixl.MEM_DEVICE,       # 设备内存标志
)

# 3. 建立连接 (单边)
link = engine.connect(
    local_dev=0,                 # 本地设备 0
    remote_dev=1,                # 远端设备 1
    remote_mem=mem_handle,       # 远端已注册内存
)

# 4. 同步传输 (阻塞)
engine.transfer_sync(
    link=link,
    src=src_addr,                # 本地源地址
    dst=dst_addr,                # 远端目标地址
    size=transfer_size,          # 传输大小
)

# 5. 异步传输 (非阻塞)
future = engine.transfer_async(
    link=link,
    src=src_addr,
    dst=dst_addr,
    size=transfer_size,
)
# 可以在传输期间做其他计算
future.wait()  # 等待完成

# 6. 通知机制
engine.notify(link, signal=hixl.SIGNAL_COMPLETE)

# 7. 能力查询
caps = engine.query_capabilities()
# caps = {"max_links": 16, "protocols": ["hccs", "rdma", "ub"], ...}`} />

      <h3>HCCS vs RDMA 性能对比</h3>
      <table>
        <thead><tr><th>协议</th><th>带宽</th><th>场景</th><th>芯片</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><strong>HCCS</strong></td><td>119 GB/s</td><td>同节点 NPU 间</td><td>A3</td><td>128M 数据传输，片间直连最高带宽</td></tr>
          <tr><td><strong>RDMA</strong></td><td>22 GB/s</td><td>跨节点 NPU 间</td><td>A3</td><td>128M 数据传输，跨节点 RDMA 传输</td></tr>
          <tr><td><strong>UB (URMA)</strong></td><td>取决于配置</td><td>跨节点 NPU 间</td><td>A5</td><td>Unified Buffer 协议，纯 URMA 路径</td></tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>HCCS 带宽是 RDMA 的 5.4x：</strong>同节点内通过 HCCS 片间直连可达到 119 GB/s，跨节点 RDMA 仅 22 GB/s。
        因此 P/D 分离部署时，<strong>优先将 Prefill 和 Decode 安排在同一节点的不同 NPU 上</strong>，通过 HCCS 传输可大幅降低延迟。
      </Callout>

      {/* ==================== 3. UB 协议详解 ==================== */}
      <div className="section-divider"><span>UB (Unified Buffer) 协议</span></div>

      <h3>UB 协议配置模式</h3>
      <p>UB（Unified Buffer）是 A5 芯片的<strong>统一缓冲协议</strong>，支持多种资源配置模式以适配不同场景：</p>

      <table>
        <thead><tr><th>配置</th><th>UB 资源</th><th>传输路径</th><th>适用场景</th></tr></thead>
        <tbody>
          <tr><td><strong>仅 device</strong></td><td>Device UB</td><td>UBMEM 路径</td><td>纯 NPU 间传输，无 CPU 参与</td></tr>
          <tr><td><strong>仅 host</strong></td><td>Host UB</td><td>Host-only Endpoint</td><td>CPU 侧传输为主</td></tr>
          <tr><td><strong>device + host</strong></td><td>Device + Host UB</td><td>纯 URMA 路径</td><td>NPU+CPU 协同，最高性能</td></tr>
          <tr><td><strong>全量 (bare ub_ctp)</strong></td><td>Device + Host UB</td><td>纯 URMA 路径</td><td>等同于 device+host</td></tr>
        </tbody>
      </table>

      <CodeBlock language="bash" title="UB 协议配置示例" code={`# UB 协议配置 (ProtocolDesc)

# 模式 1: 仅 Device UB → UBMEM 路径
hixl_config:
  protocol: ub
  ub_ctp:
    device: true

# 模式 2: 仅 Host UB → Host-only Endpoint
hixl_config:
  protocol: ub
  ub_ctp:
    host: true

# 模式 3: Device + Host UB → 纯 URMA 路径 (推荐)
hixl_config:
  protocol: ub
  ub_ctp:
    device: true
    host: true

# 模式 4: 全量 (等同于 mode 3)
hixl_config:
  protocol: ub
  ub_ctp: {}`} />

      <h3>UB 通信类型诊断</h3>
      <p>当 UB Endpoint 只能匹配部分通信类型时，HIXL 会输出诊断信息，包含：</p>
      <ul>
        <li><strong>请求的通信类型</strong></li>
        <li><strong>可用的通信类型</strong></li>
        <li><strong>本地和远端 Engine 信息</strong></li>
      </ul>
      <p>覆盖 lazy 和非 lazy 两种连接模式，仅在验证失败时构建可用类型字符串。</p>

      {/* ==================== 4. LLM-DataDist ==================== */}
      <div className="section-divider"><span>LLM-DataDist：KV Cache 语义层</span></div>

      <h3>版本演进</h3>
      <table>
        <thead><tr><th>版本</th><th>归属</th><th>状态</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><strong>V1</strong></td><td>ge-compiler</td><td>已弃用</td><td>初版设计，与编译器绑定</td></tr>
          <tr><td><strong>V2</strong></td><td>llm_datadist</td><td>当前版本</td><td>继承 V1 设计，独立于编译器，支持更多推理框架</td></tr>
        </tbody>
      </table>

      <h3>V2 架构</h3>
      <MermaidDiagram maxWidth={420} chart={`
graph TB
    subgraph Framework["推理框架"]
        VLLM2["vllm-ascend"]
        SGL2["sglang"]
    end

    subgraph DataDist["LLM-DataDist V2"]
        API2["语义 API"]
        BLOCK["Block 管理"]
        TRANSFER["传输调度"]
    end

    subgraph HIXL2["HIXL Engine"]
        D2D2["D2D"]
        D2H2["D2H"]
        H2D2["H2D"]
    end

    Framework --> API2
    API2 --> BLOCK
    BLOCK --> TRANSFER
    TRANSFER --> HIXL2
      `} />

      <CodeBlock language="python" title="LLM-DataDist KV Cache API" code={`# LLM-DataDist: 带 KV Cache 语义的传输接口
from llm_datadist import KVDataDist

# 初始化
datadist = KVDataDist(
    devices=[0, 1, 2, 3],
    protocol="hccs",          # 底层传输协议
    links_per_dev=4,
)

# ===== KV Cache 操作 =====

# 1. 分配 KV block
block = datadist.allocate_block(
    num_layers=32,
    num_heads=8,
    head_dim=128,
    block_size=16,            # tokens per block
    dtype="float16",
)

# 2. 写入 KV Cache (Prefill → KV Pool)
datadist.put_kv_cache(
    block_id=block.id,
    kv_tensors=kv_data,       # dict[layer_id] → (K, V)
    dst_devices=[4, 5],       # 目标 Decode 设备
)

# 3. 读取 KV Cache (KV Pool → Decode)
kv_data = datadist.get_kv_cache(
    block_id=block.id,
    src_device=0,             # 数据所在设备
    layers=[0, 1, 2, 3],     # 只读取需要的层 (Layer-wise)
)

# 4. 异步传输 + Pipeline
future = datadist.transfer_async(
    block_id=block.id,
    src_dev=0,
    dst_dev=4,
    layers=range(32),         # 所有层
    pipeline=True,            # 启用 Layer-wise Pipeline
)
# 传输期间可以继续计算
future.wait()

# 5. 释放 KV block
datadist.free_block(block.id)`} />

      {/* ==================== 5. 多链路与拓扑管理 ==================== */}
      <div className="section-divider"><span>多链路与拓扑管理</span></div>

      <h3>多链路支持</h3>
      <p>HIXL 支持<strong>每设备多条链路</strong>，通过并行传输提升带宽利用率。可通过环境变量配置：</p>

      <table>
        <thead><tr><th>环境变量</th><th>说明</th><th>默认值</th></tr></thead>
        <tbody>
          <tr><td><code>HIXL_E2E_LINKS_PER_DEV</code></td><td>每设备链路数</td><td>4</td></tr>
          <tr><td><code>HIXL_E2E_TRANSFER_SIZE</code></td><td>传输数据大小</td><td>128M</td></tr>
          <tr><td><code>HIXL_E2E_REGISTER_SIZE</code></td><td>注册内存大小</td><td>256M</td></tr>
        </tbody>
      </table>

      <h3>拓扑管理</h3>
      <p>HIXL 支持<strong>自定义拓扑文件</strong>，优化传输路径选择。LocalCommRes 边的生成顺序：</p>
      <ol>
        <li><strong>Device 边</strong>（基于 ProtocolDesc 配置）</li>
        <li><strong>Route Data</strong>（路由数据）</li>
        <li><strong>Host 边</strong>（主机侧连接）</li>
      </ol>

      <CodeBlock language="yaml" title="拓扑文件示例" code={`# 自定义拓扑文件 (hixl_topo.yaml)
# 用户可提供自定义拓扑以优化传输路径

topology:
  type: fullmesh  # 或 clos
  nodes:
    - id: 0
      type: A3
      devices: [0, 1, 2, 3]
      links:
        - to: 1
          protocol: hccs
          bandwidth: 119  # GB/s
        - to: 1
          protocol: rdma
          bandwidth: 22   # GB/s

    - id: 1
      type: A3
      devices: [4, 5, 6, 7]
      links:
        - to: 0
          protocol: hccs
          bandwidth: 119
        - to: 0
          protocol: rdma
          bandwidth: 22`} />

      {/* ==================== 6. FabricMem 与 Host RoCE ==================== */}
      <div className="section-divider"><span>FabricMem 与 Host RoCE</span></div>

      <h3>FabricMem 模式 (2026/03)</h3>
      <p>HIXL 支持<strong>超节点 FabricMem 模式</strong>，将多个节点的内存通过高速互联结构（Fabric）统一为全局内存池：</p>

      <MermaidDiagram chart={`
graph TB
    subgraph SuperNode["超节点"]
        subgraph N1["Node 0"]
            HBM1["NPU HBM"]
            DDR1["DDR"]
        end
        subgraph N2["Node 1"]
            HBM2["NPU HBM"]
            DDR2["DDR"]
        end
        subgraph N3["Node 2"]
            HBM3["NPU HBM"]
            DDR3["DDR"]
        end
    end

    subgraph Fabric["Fabric 互联"]
        F1["HCCS / RDMA / UB"]
    end

    HBM1 --> Fabric
    DDR1 --> Fabric
    HBM2 --> Fabric
    DDR2 --> Fabric
    HBM3 --> Fabric
    DDR3 --> Fabric
    Fabric --> POOL["全局 FabricMem Pool<br/>统一地址空间"]
      `} />

      <h3>Host RoCE (2026/01)</h3>
      <p>LLM-DataDist 和 HIXL 支持下一代芯片的 <strong>Host RoCE 传输能力</strong>，通过主机侧 RDMA 网卡实现跨节点 CPU 内存高效传输：</p>

      <table>
        <thead><tr><th>特性</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><strong>Host RoCE</strong></td><td>在主机侧使用 RDMA over Converged Ethernet，无需 NPU 参与</td></tr>
          <tr><td><strong>适用场景</strong></td><td>CPU DDR 间 KV Cache 传输、冷数据迁移、跨节点前缀共享</td></tr>
          <tr><td><strong>优势</strong></td><td>不占用 NPU 计算资源，后台传输不干扰推理</td></tr>
        </tbody>
      </table>

      {/* ==================== 7. E2E 测试场景 ==================== */}
      <div className="section-divider"><span>E2E 测试场景</span></div>

      <p>HIXL 的 Mooncake 部署场景 E2E 冒烟测试覆盖 5 类场景，均使用 multiprocessing spawn 上下文和设备内存：</p>

      <table>
        <thead><tr><th>测试场景</th><th>描述</th><th>设备映射</th></tr></thead>
        <tbody>
          <tr><td><strong>Real-real 4-device</strong></td><td>跨设备批量读写：验证 4 设备间 WRITE/READ 传输</td><td>0→1, 1→2, 2→3, 3→0</td></tr>
          <tr><td><strong>Dummy-real shared memory</strong></td><td>共享内存到远端：验证跨进程 mmap 数据传输</td><td>跨进程映射</td></tr>
          <tr><td><strong>Standalone cross-device</strong></td><td>同主机跨设备偏移：验证同主机多设备场景</td><td>同主机设备间</td></tr>
          <tr><td><strong>Scale reconnect</strong></td><td>多链路故障恢复：验证设备故障恢复能力</td><td>多链路重连</td></tr>
          <tr><td><strong>Flapping device</strong></td><td>设备抖动重连：测试设备不稳定时的重连</td><td>不稳定设备</td></tr>
        </tbody>
      </table>

      <Callout type="info">
        <strong>测试要求：</strong>至少 8 个 NPU 设备。可通过 <code>HIXL_E2E_LINKS_PER_DEV</code>、<code>HIXL_E2E_TRANSFER_SIZE</code>、<code>HIXL_E2E_REGISTER_SIZE</code> 环境变量配置。
      </Callout>

      {/* ==================== 8. 部署实践 ==================== */}
      <div className="section-divider"><span>部署实践</span></div>

      <h3>vllm-ascend + Mooncake KVPool 部署</h3>
      <CodeBlock language="bash" title="完整部署流程" code={`# ===== Step 1: 安装 HIXL =====
# 从 CANN 安装包获取或从源码编译
pip install hixl  # Python 绑定

# 编译安装 (C++ 开发)
mkdir build && cd build
cmake .. \\
  -DENABLE_EXPERIMENTAL=ON \\   # 启用实验性功能
  -DHIXL_BUILD_TESTS=ON
make -j

# ===== Step 2: 配置 HIXL =====
# 环境变量配置
export HIXL_E2E_LINKS_PER_DEV=4
export HIXL_E2E_TRANSFER_SIZE=$((128 * 1024 * 1024))  # 128M
export HIXL_E2E_REGISTER_SIZE=$((256 * 1024 * 1024))  # 256M

# ===== Step 3: 启动 Mooncake Master =====
# Mooncake 社区版的 Master Server
python -m mooncake.master \\
  --port 50051 \\
  --kv-pool-gb 500

# ===== Step 4: 启动 vllm-ascend =====
vllm serve Qwen/Qwen2-7B \\
  --kv-transfer-config '{
    "backend": "mooncake",
    "master_addr": "192.168.1.1:50051",
    "transfer_engine": "hixl",
    "protocol": "hccs",
    "links_per_dev": 4
  }' \\
  --tensor-parallel-size 8

# ===== Step 5: 验证传输 =====
# 使用 HIXL 自带测试
bash tests/run_test.sh -t cpp  # C++ 测试套件
# 预期: 883/883 tests passing`} />

      <h3>配置参数</h3>
      <table>
        <thead><tr><th>参数</th><th>默认值</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><code>backend</code></td><td>"mooncake"</td><td>KV 传输后端</td></tr>
          <tr><td><code>master_addr</code></td><td>必填</td><td>Mooncake Master 地址</td></tr>
          <tr><td><code>transfer_engine</code></td><td>"hixl"</td><td>传输引擎：hixl (Ascend) / nccl (NVIDIA)</td></tr>
          <tr><td><code>protocol</code></td><td>"hccs"</td><td>传输协议：hccs / rdma / ub</td></tr>
          <tr><td><code>links_per_dev</code></td><td>4</td><td>每设备链路数</td></tr>
          <tr><td><code>kv_pool_gb</code></td><td>100</td><td>KV Pool 总容量 (GB)</td></tr>
          <tr><td><code>pipeline</code></td><td>true</td><td>是否启用 Layer-wise Pipeline 传输</td></tr>
        </tbody>
      </table>

      {/* ==================== 9. 与 MemCache 对比 ==================== */}
      <div className="section-divider"><span>与 Ascend MemCache 对比</span></div>

      <table>
        <thead><tr><th>维度</th><th>Mooncake KVPool (HIXL)</th><th>Ascend MemCache</th></tr></thead>
        <tbody>
          <tr><td><strong>底层传输</strong></td><td>HIXL Engine (单边零拷贝)</td><td>MemFabric (OneCopy 直访)</td></tr>
          <tr><td><strong>传输协议</strong></td><td>HCCS / RDMA / UB</td><td>RDMA / SDMA / URMA / UBoE / SHM</td></tr>
          <tr><td><strong>最大带宽</strong></td><td>119 GB/s (HCCS, A3)</td><td>取决于硬件路径</td></tr>
          <tr><td><strong>KV Cache 语义</strong></td><td>LLM-DataDist V2</td><td>内置 KV Block API</td></tr>
          <tr><td><strong>部署模式</strong></td><td>Mooncake Master + HIXL</td><td>MetaService + LocalService</td></tr>
          <tr><td><strong>HA 支持</strong></td><td>Mooncake 社区方案</td><td>K8s ClusterIP + Lease</td></tr>
          <tr><td><strong>Python API</strong></td><td>✅ pybind11</td><td>✅ memcache-hybrid</td></tr>
          <tr><td><strong>集成框架</strong></td><td>vllm-ascend / sglang</td><td>vllm-ascend / sglang / mindie</td></tr>
          <tr><td><strong>跨代兼容</strong></td><td>✅ A2/A3/A5 异构</td><td>✅ A2/A3/A5 + K5</td></tr>
          <tr><td><strong>FabricMem</strong></td><td>✅ 超节点模式</td><td>通过 MemFabric 实现</td></tr>
          <tr><td><strong>Host RoCE</strong></td><td>✅ 下一代芯片</td><td>通过 host_rdma 实现</td></tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>选型建议：</strong>
        <ul>
          <li><strong>已有 Mooncake 社区部署</strong> → Mooncake KVPool (HIXL)，协议兼容，社区生态成熟</li>
          <li><strong>纯 Ascend 生态</strong> → Ascend MemCache，原生集成 vllm-ascend/sglang/mindie</li>
          <li><strong>最高同节点带宽</strong> → Mooncake KVPool (HCCS 119 GB/s)，HCCS 片间直连优势明显</li>
          <li><strong>最灵活硬件路径</strong> → Ascend MemCache (7 种硬件路径)，覆盖更全</li>
        </ul>
      </Callout>

      <ResourceTable resources={[
        { name: 'HIXL 项目主页', url: 'https://gitcode.com/cann/hixl', desc: 'HIXL: 昇腾单边通信库，Mooncake Ascend 传输引擎' },
        { name: 'Mooncake KVPool 指南', url: 'https://gitcode.com/cann/hixl/wiki/Mooncake-KVPool%E6%8C%87%E5%8D%97', desc: 'Mooncake KVPool 在 Ascend 上的部署指南 (HIXL Wiki)' },
        { name: 'Mooncake 论文', url: 'https://arxiv.org/abs/2407.00079', desc: 'Mooncake: A KVCache-Centric Disaggregated Architecture for LLM Serving' },
        { name: 'Mooncake 源码', url: 'https://github.com/kvcache-ai/Mooncake', desc: 'Mooncake 社区版 KV Cache 传输框架' },
        { name: 'HIXL FabricMem 文档', url: 'https://gitcode.com/cann/hixl/docs/zh/FabricMem.md', desc: 'HIXL 超节点 FabricMem 模式文档' },
        { name: 'vllm-ascend', url: 'https://github.com/vllm-project/vllm-ascend', desc: 'vllm-ascend 推理框架，支持 Mooncake KVPool 后端' },
      ]} />
    </div>
  );
}