import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, CodeBlock, ResourceTable } from '../components/CodeBlock';

export function PDSeparationPage() {
  return (
    <div className="prose max-w-none">
      <h1>P/D 分离 (Prefill/Decode Disaggregation)</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-08</span>
        <span className="page-meta-item">⏱️ 阅读约 20 分钟</span>
        <span className="page-meta-item">🏷️ 专题 · 架构设计</span>
      </div>
      <p>Prefill/Decode 分离（简称 P/D 分离）是 LLM 推理架构的重要演进方向。它将计算特性截然不同的 Prefill 和 Decode 阶段拆分到独立的 GPU 集群，实现资源专用化和利用率最大化。</p>

      {/* ==================== 1. 为什么需要分离 ==================== */}
      <div className="section-divider"><span>为什么需要分离</span></div>

      <h3>Prefill vs Decode 的计算特性</h3>
      <table>
        <thead><tr><th>维度</th><th>Prefill</th><th>Decode</th></tr></thead>
        <tbody>
          <tr><td><strong>计算模式</strong></td><td>Compute-bound（计算密集）</td><td>Memory-bound（访存密集）</td></tr>
          <tr><td><strong>并行度</strong></td><td>高（一次处理全部 prompt tokens）</td><td>低（每次只生成 1 token）</td></tr>
          <tr><td><strong>GPU 利用率</strong></td><td>高（~80-90%）</td><td>低（~20-30%）</td></tr>
          <tr><td><strong>延迟敏感度</strong></td><td>对 TTFT 敏感</td><td>对 TPOT 敏感</td></tr>
          <tr><td><strong>显存需求</strong></td><td>高（存储全部 prompt 的 KV Cache）</td><td>低（增量 1 token/step）</td></tr>
          <tr><td><strong>Batch 效率</strong></td><td>大 batch 高效</td><td>小 batch 即可饱和显存带宽</td></tr>
        </tbody>
      </table>

      <Callout type="warning">
        <strong>核心矛盾：</strong>在一体式架构中，Prefill 和 Decode 共享同一 GPU。Prefill 的 compute-bound 特性需要高算力 GPU（如 H100），
        但 Decode 的 memory-bound 特性导致这些 GPU 算力大量闲置。分离后，Prefill 用高算力 GPU，Decode 用低成本 GPU，总成本大幅降低。
      </Callout>

      {/* ==================== 2. 架构对比 ==================== */}
      <div className="section-divider"><span>一体式 vs 分离式架构</span></div>

      <h3>一体式架构</h3>
      <MermaidDiagram chart={`
graph TB
    subgraph Colo["Colocate 一体式"]
        API["API Server"]
        SCHED["Scheduler<br/>(Prefill + Decode 混合)"]
        GPU1["GPU 0<br/>Prefill + Decode"]
        GPU2["GPU 1<br/>Prefill + Decode"]
        API --> SCHED
        SCHED --> GPU1
        SCHED --> GPU2
    end
      `} />

      <h3>分离式架构</h3>
      <MermaidDiagram chart={`
graph TB
    subgraph Disagg["Disaggregation 分离式"]
        API2["API Server / Router"]
        SCHED2["Global Scheduler"]
        subgraph P_Pool["Prefill Pool (高算力)"]
            P1["GPU A100-0<br/>仅 Prefill"]
            P2["GPU A100-1<br/>仅 Prefill"]
        end
        subgraph D_Pool["Decode Pool (低成本)"]
            D1["GPU L40S-0<br/>仅 Decode"]
            D2["GPU L40S-1<br/>仅 Decode"]
            D3["GPU L40S-2<br/>仅 Decode"]
        end
        KV["KV Cache 传输层<br/>NCCL / RDMA / NVLink"]
        API2 --> SCHED2
        SCHED2 --> P_Pool
        P_Pool --> KV
        KV --> D_Pool
    end
      `} />

      <h3>关键差异</h3>
      <table>
        <thead><tr><th>维度</th><th>一体式</th><th>分离式</th></tr></thead>
        <tbody>
          <tr><td><strong>GPU 异构</strong></td><td>所有 GPU 同型号</td><td>Prefill 和 Decode 可用不同 GPU</td></tr>
          <tr><td><strong>KV Cache 传输</strong></td><td>无需传输（同 GPU）</td><td>需要跨节点传输 KV Cache</td></tr>
          <tr><td><strong>弹性扩缩</strong></td><td>整体扩缩</td><td>Prefill/Decode 独立扩缩</td></tr>
          <tr><td><strong>故障隔离</strong></td><td>单 GPU 故障影响全局</td><td>Pool 级别故障隔离</td></tr>
          <tr><td><strong>调度复杂度</strong></td><td>低</td><td>高（需全局调度 + KV 传输协调）</td></tr>
          <tr><td><strong>网络要求</strong></td><td>低</td><td>高（KV Cache 传输需要高带宽）</td></tr>
        </tbody>
      </table>

      {/* ==================== 3. KV Cache 传输 ==================== */}
      <div className="section-divider"><span>KV Cache 传输</span></div>

      <p>P/D 分离的核心挑战是 <strong>KV Cache 传输</strong>：Prefill 完成后，需要将 KV Cache 从 Prefill GPU 传输到 Decode GPU。</p>

      <h3>传输方案对比</h3>
      <table>
        <thead><tr><th>方案</th><th>带宽</th><th>延迟</th><th>适用场景</th></tr></thead>
        <tbody>
          <tr><td><strong>NCCL Send/Recv</strong></td><td>~900 GB/s (NVLink 4.0)</td><td>微秒级</td><td>同节点 GPU 间</td></tr>
          <tr><td><strong>RDMA (InfiniBand)</strong></td><td>~400 GB/s (NDR)</td><td>微秒级</td><td>跨节点，高性能</td></tr>
          <tr><td><strong>TCP/IP</strong></td><td>~100 GB/s (400GbE)</td><td>毫秒级</td><td>跨节点，低成本</td></tr>
          <tr><td><strong>NVMe over Fabric</strong></td><td>~50 GB/s</td><td>毫秒级</td><td>跨节点，大 KV Cache</td></tr>
          <tr><td><strong>GPU Direct RDMA</strong></td><td>~400 GB/s</td><td>微秒级</td><td>GPU 到 GPU 直通，零拷贝</td></tr>
        </tbody>
      </table>

      <CodeBlock language="python" title="NCCL KV Cache 传输实现" code={`def transfer_kv_cache(kv_blocks: list[torch.Tensor],
                       src_gpu: int, dst_gpu: int):
    """通过 NCCL 传输 KV Cache blocks"""
    comm = get_nccl_communicator(src_gpu, dst_gpu)

    for block in kv_blocks:
        # 异步发送
        comm.send(block, dst=dst_gpu)

    # 接收端
    received = []
    for _ in range(len(kv_blocks)):
        tensor = torch.empty_like(kv_blocks[0])
        comm.recv(tensor, src=src_gpu)
        received.append(tensor)

    return received

# 传输量估算
# Llama-3-70B, seq_len=8192, FP16:
# 2 × 80 × 8 × 128 × 8192 × 2 bytes ≈ 268 MB
# 通过 NVLink (900 GB/s): 268 MB / 900 GB/s ≈ 0.3 ms
# 通过 RDMA (400 GB/s): 268 MB / 400 GB/s ≈ 0.7 ms`} />

      <Callout type="tip">
        <strong>传输延迟优化：</strong>
        <ul>
          <li><strong>Pipeline 传输</strong>：Prefill 还在进行时就开始传输已完成的 block</li>
          <li><strong>Layer-wise 传输</strong>：每层 Prefill 完成后立即传输该层的 KV Cache</li>
          <li><strong>选择性传输</strong>：只传输 Decode 需要的层（如只传输最后几层用于投机解码）</li>
        </ul>
      </Callout>

      {/* ==================== 4. 调度策略 ==================== */}
      <div className="section-divider"><span>P/D 分离调度策略</span></div>

      <h3>三层调度架构</h3>
      <MermaidDiagram chart={`
sequenceDiagram
    participant C as Client
    participant R as Router
    participant PS as Prefill Scheduler
    participant DS as Decode Scheduler
    participant KV as KV Transfer

    C->>R: POST /v1/completions
    R->>R: 路由决策 (负载均衡)
    R->>PS: 分配 Prefill 任务
    PS->>PS: Prefill 执行
    PS->>KV: 传输 KV Cache
    KV->>DS: KV Cache 就绪
    DS->>DS: Decode 执行
    DS-->>C: 流式返回 token
      `} />

      <h3>Pool 扩缩容策略</h3>
      <table>
        <thead><tr><th>场景</th><th>Prefill Pool</th><th>Decode Pool</th></tr></thead>
        <tbody>
          <tr><td><strong>短 prompt + 长生成</strong></td><td>少量 GPU</td><td>大量 GPU（Decode 是瓶颈）</td></tr>
          <tr><td><strong>长 prompt + 短生成</strong></td><td>大量 GPU（Prefill 是瓶颈）</td><td>少量 GPU</td></tr>
          <tr><td><strong>多轮对话</strong></td><td>少量 GPU（前缀缓存命中率高）</td><td>大量 GPU</td></tr>
          <tr><td><strong>批量离线推理</strong></td><td>大量 GPU</td><td>少量 GPU</td></tr>
        </tbody>
      </table>

      {/* ==================== 5. 框架实现对比 ==================== */}
      <div className="section-divider"><span>框架实现对比</span></div>

      <h3>vLLM Disaggregated Serving</h3>
      <p>vLLM V1 支持 P/D 分离，通过 <code>KVTransferConfig</code> 配置 KV Cache 传输方式。</p>

      <CodeBlock language="bash" title="vLLM 分离式启动" code={`# Prefill 节点
vllm serve meta-llama/Llama-3-70B \\
  --disaggregation-role prefill \\
  --kv-transfer-config '{"backend":"nixl","port":12345}'

# Decode 节点
vllm serve meta-llama/Llama-3-70B \\
  --disaggregation-role decode \\
  --kv-transfer-config '{"backend":"nixl","port":12345}'`} />

      <h3>SGLang Disaggregated Serving</h3>
      <p>SGLang 原生支持 P/D 分离，且调度器天然支持分离式架构。</p>

      <CodeBlock language="bash" title="SGLang 分离式启动" code={`# Prefill 节点
python -m sglang.launch_server \\
  --model meta-llama/Llama-3-70B \\
  --disaggregation-mode prefill \\
  --prefill-port 30000

# Decode 节点
python -m sglang.launch_server \\
  --model meta-llama/Llama-3-70B \\
  --disaggregation-mode decode \\
  --disaggregation-transfer-backend mooncake`} />

      <h3>Mooncake (月之暗面)</h3>
      <p>Mooncake 是月之暗面（Kimi）开源的 P/D 分离 KV Cache 传输框架，以<strong>高吞吐 KV 传输</strong>为核心。</p>

      <table>
        <thead><tr><th>特性</th><th>Mooncake</th><th>vLLM NIXL</th><th>SGLang RDMA</th></tr></thead>
        <tbody>
          <tr><td><strong>传输协议</strong></td><td>RDMA + TCP 混合</td><td>NIXL (NVIDIA)</td><td>RDMA / Mooncake</td></tr>
          <tr><td><strong>零拷贝</strong></td><td>✅ GPU Direct RDMA</td><td>✅</td><td>✅</td></tr>
          <tr><td><strong>Pipeline 传输</strong></td><td>✅ Layer-wise</td><td>✅</td><td>✅</td></tr>
          <tr><td><strong>拓扑感知</strong></td><td>✅ 自动选择最优路径</td><td>❌</td><td>✅</td></tr>
          <tr><td><strong>开源</strong></td><td>✅</td><td>✅</td><td>✅</td></tr>
        </tbody>
      </table>

      {/* ==================== 6. 性能分析 ==================== */}
      <div className="section-divider"><span>性能分析</span></div>

      <h3>分离式架构的收益</h3>
      <table>
        <thead><tr><th>指标</th><th>一体式</th><th>分离式</th><th>提升</th></tr></thead>
        <tbody>
          <tr><td><strong>GPU 总利用率</strong></td><td>~40%</td><td>~70%</td><td>+75%</td></tr>
          <tr><td><strong>Decode 吞吐</strong></td><td>基准</td><td>2-3x</td><td>Decode 专用 GPU 优化</td></tr>
          <tr><td><strong>TTFT 稳定性</strong></td><td>受 Decode 干扰</td><td>独立 Prefill Pool</td><td>无干扰</td></tr>
          <tr><td><strong>成本</strong></td><td>全部高算力 GPU</td><td>Decode 用低成本 GPU</td><td>~30-50% 成本降低</td></tr>
        </tbody>
      </table>

      <h3>分离式架构的代价</h3>
      <ul>
        <li><strong>KV Cache 传输延迟</strong>：Prefill → Decode 传输增加 0.3-5ms 延迟</li>
        <li><strong>调度复杂度</strong>：需要全局调度器协调 Prefill 和 Decode Pool</li>
        <li><strong>网络要求</strong>：需要 RDMA 或至少 100GbE 网络</li>
        <li><strong>Bubble 效率</strong>：Prefill 和 Decode 速度不匹配时产生 bubble</li>
      </ul>

      <Callout type="warning">
        <strong>适用场景判断：</strong>
        <ul>
          <li>✅ 大规模部署（100+ GPU），GPU 利用率收益显著</li>
          <li>✅ 请求负载波动大，需要独立扩缩 Prefill/Decode</li>
          <li>✅ 长短 prompt 混合场景</li>
          <li>⚠️ 小规模部署（{'<'} 8 GPU），分离式开销 {'>'} 收益</li>
          <li>⚠️ 网络带宽不足（{'<'} 100GbE），KV 传输成为瓶颈</li>
        </ul>
      </Callout>

      <ResourceTable resources={[
        { name: 'Splitwise (OSDI 2024)', url: 'https://arxiv.org/abs/2311.18677', desc: 'Splitwise: Efficient LLM Inference with P/D Separation' },
        { name: 'DistServe (OSDI 2024)', url: 'https://arxiv.org/abs/2401.09670', desc: 'Disaggregated Prefill and Decoding for LLM Serving' },
        { name: 'Mooncake', url: 'https://github.com/kvcache-ai/Mooncake', desc: '月之暗面开源的 KV Cache 传输框架，P/D 分离核心组件' },
        { name: 'vLLM Disaggregated Serving', url: 'https://docs.vllm.ai/en/latest/features/disagg_prefill.html', desc: 'vLLM 官方 P/D 分离文档' },
        { name: 'SGLang Disaggregated', url: 'https://docs.sglang.io/advanced_features/disaggregated_serving.html', desc: 'SGLang 分离式服务文档' },
        { name: 'NIXL', url: 'https://github.com/ai-dynamo/nixl', desc: 'NVIDIA In-Network Compute Library，KV Cache 传输加速' },
      ]} />
    </div>
  );
}