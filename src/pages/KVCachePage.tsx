import { MermaidDiagram } from '../components/MermaidDiagram';
import { Callout, CodeBlock, ResourceTable } from '../components/CodeBlock';

export function KVCachePage() {
  return (
    <div className="prose max-w-none">
      <h1>KV Cache</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-08</span>
        <span className="page-meta-item">⏱️ 阅读约 20 分钟</span>
        <span className="page-meta-item">🏷️ 专题 · 核心机制</span>
      </div>
      <p>KV Cache 是 LLM 推理最核心的优化技术之一。本文将系统梳理 KV Cache 的数学原理、四种主流管理方案、内存计算与优化策略，以及多框架中的实现对比。</p>

      {/* ==================== 1. 数学原理 ==================== */}
      <div className="section-divider"><span>数学原理</span></div>

      <h3>为什么需要 KV Cache</h3>
      <p>在 Transformer 的自回归生成中，每一步只生成一个新 token，但 Attention 计算需要访问<strong>所有历史 token</strong>的 Key 和 Value。如果没有缓存，每步都需要重新计算所有历史 token 的 K、V，导致计算量随序列长度<strong>平方增长</strong>。</p>

      <CodeBlock language="python" title="自回归生成中的 Attention 计算" code={`# 第 t 步生成, 需要计算:
# Q = W_Q @ x_t          # 只有当前 token 的 Query
# K = W_K @ [x_1...x_t]  # 所有历史 token 的 Key
# V = W_V @ [x_1...x_t]  # 所有历史 token 的 Value

# 无 KV Cache: 每步计算全部 t 个 token 的 K, V → O(t^2) 总计算量
# 有 KV Cache: 只计算当前 token 的 K, V, 拼接历史缓存 → O(t) 总计算量

def attention_with_cache(Q_new, K_new, V_new, K_cache, V_cache):
    """有 KV Cache 的 Attention"""
    K = torch.cat([K_cache, K_new], dim=-2)  # 拼接历史 Key
    V = torch.cat([V_cache, V_new], dim=-2)  # 拼接历史 Value
    # 标准 Scaled Dot-Product Attention
    scores = torch.matmul(Q_new, K.transpose(-2, -1)) / math.sqrt(d_k)
    attn = torch.softmax(scores, dim=-1)
    return torch.matmul(attn, V), K, V  # 返回结果和更新后的缓存`} />

      <h3>显存计算</h3>
      <Callout type="info">
        <strong>KV Cache 显存公式：</strong><br/>
        <code>Size = 2 × L × H_kv × d × N × B × dtype_bytes</code><br/><br/>
        其中：<code>L</code> = 层数, <code>H_kv</code> = KV Head 数, <code>d</code> = head_dim,
        <code>N</code> = 序列长度, <code>B</code> = batch size<br/><br/>
        <strong>Llama-3-70B 示例 (FP16, batch=8, seq_len=8192):</strong><br/>
        <code>2 × 80 × 8 × 128 × 8192 × 8 × 2 ≈ 2.1 GB</code> (仅 KV Cache!)
      </Callout>

      <MermaidDiagram chart={`
graph LR
    subgraph NoCache["无 KV Cache"]
        S1["Step 1: 计算 K1,V1"]
        S2["Step 2: 计算 K1,K2,V1,V2"]
        S3["Step 3: 计算 K1,K2,K3,V1,V2,V3"]
        SN["...O(t^2) 计算量"]
    end
    subgraph Cache["有 KV Cache"]
        C1["Step 1: 计算 K1,V1 → 缓存"]
        C2["Step 2: 计算 K2,V2 → 拼接"]
        C3["Step 3: 计算 K3,V3 → 拼接"]
        CN["...O(t) 计算量"]
    end
    NoCache --> Cache
      `} />

      {/* ==================== 2. 四种管理方案 ==================== */}
      <div className="section-divider"><span>四种管理方案对比</span></div>

      <table>
        <thead><tr><th>方案</th><th>代表框架</th><th>核心思想</th><th>内存利用率</th><th>碎片</th></tr></thead>
        <tbody>
          <tr><td><strong>连续预分配</strong></td><td>HuggingFace Transformers</td><td>每请求预分配 max_len 连续显存</td><td>~25%</td><td>严重</td></tr>
          <tr><td><strong>PagedAttention</strong></td><td>vLLM</td><td>Block 粒度分页管理，按需分配</td><td>~99%</td><td>几乎无</td></tr>
          <tr><td><strong>RadixAttention</strong></td><td>SGLang</td><td>Radix Tree 组织 Block，自动前缀匹配</td><td>~99%</td><td>几乎无</td></tr>
          <tr><td><strong>HashChain</strong></td><td>nano-vLLM</td><td>xxhash 链式哈希 + Token 二次验证</td><td>~99%</td><td>几乎无</td></tr>
        </tbody>
      </table>

      {/* ==================== 3. PagedAttention 详解 ==================== */}
      <div className="section-divider"><span>PagedAttention 详解 (vLLM)</span></div>

      <h3>核心思想</h3>
      <p>将 KV Cache 视为<strong>虚拟内存页</strong>：逻辑上连续的 token 序列映射到物理上不连续的 block 上。每个 block 存储固定数量 token 的 K、V 张量。</p>

      <MermaidDiagram maxWidth={480} chart={`
graph TB
    subgraph Logical["逻辑 KV Cache (请求视图)"]
        L["Token 0-15 | Token 16-31 | Token 32-47 | Token 48-63"]
    end
    subgraph Physical["物理 Block 池"]
        P0["Block 0 (空闲)"]
        P1["Block 1: Token 0-15"]
        P2["Block 2: Token 32-47"]
        P3["Block 3: Token 16-31"]
        P4["Block 4: Token 48-63"]
        P5["Block 5 (空闲)"]
    end
    subgraph Mapping["Block Table"]
        M["[1, 3, 2, 4]"]
    end
    L --> M --> Physical
      `} />

      <CodeBlock language="python" title="PagedAttention 核心实现" code={`class PagedAttention:
    """PagedAttention: 分页 KV Cache 管理"""

    def forward(self, query, key, value, block_table, block_size):
        """在分页 KV Cache 上计算 Attention"""
        # block_table: [num_blocks], 每个 entry 是物理 block ID
        # 从 block_table 中按物理地址读取 K, V
        K_blocks = self.kv_cache.get_blocks(block_table, 'k')
        V_blocks = self.kv_cache.get_blocks(block_table, 'v')

        # 将分页的 K, V 拼接成连续张量
        K = torch.cat([K_blocks[i] for i in block_table], dim=-2)
        V = torch.cat([V_blocks[i] for i in block_table], dim=-2)

        # 标准 Scaled Dot-Product Attention
        scale = query.shape[-1] ** -0.5
        scores = torch.matmul(query, K.transpose(-2, -1)) * scale
        attn_weights = torch.softmax(scores, dim=-1)
        return torch.matmul(attn_weights, V)

# Block Table 示例:
# 请求 A: block_table = [3, 7, 12]  → 物理 block 3, 7, 12
# 请求 B: block_table = [3, 5, 8]   → 物理 block 3, 5, 8
#                                     ↑ block 3 被共享 (前缀缓存)`} />

      <h3>Block 状态机</h3>
      <MermaidDiagram chart={`
stateDiagram-v2
    [*] --> Free: 初始化
    Free --> Allocated: allocate_slots()
    Allocated --> Cached: ref_cnt>1（前缀共享）
    Allocated --> Free: 请求完成, ref_cnt=0
    Cached --> Allocated: ref_cnt 减到 1
    Cached --> Free: LRU 淘汰, ref_cnt=0
    Allocated --> Evicted: 抢占触发
    Evicted --> Free: 释放 block
      `} />

      {/* ==================== 4. RadixAttention 详解 ==================== */}
      <div className="section-divider"><span>RadixAttention 详解 (SGLang)</span></div>

      <h3>核心思想</h3>
      <p>用 <strong>Radix Tree（基数树）</strong> 组织 KV Cache block，每个节点代表一个 token（或 token 序列），从根到叶的路径为一个完整序列。共享前缀的请求自动共享路径上的 KV Cache。</p>

      <MermaidDiagram chart={`
graph TB
    ROOT["Root"]
    ROOT --> S1["系统: 你是一个"]
    S1 --> S2["有帮助的助手"]
    S2 --> A1["用户: 什么是KV Cache"]
    S2 --> A2["用户: 什么是PagedAttention"]
    A1 --> A3["助手: KV Cache是..."]
    A2 --> A4["助手: PagedAttention是..."]
    A3 --> A5["用户: 请详细解释"]
    A5 --> A6["助手: 好的，KV Cache..."]
      `} />

      <Callout type="tip">
        <strong>Radix Tree vs Hash Table：</strong>Radix Tree 天然支持前缀匹配，不需要哈希计算和碰撞检测。
        树结构使得 "查找最长公共前缀" 变成 O(L) 的树遍历，而非 O(N) 的哈希链查找。但树结构的内存开销略高于哈希表。
      </Callout>

      <h3>RadixAttention 与 PagedAttention 对比</h3>
      <table>
        <thead><tr><th>维度</th><th>PagedAttention (vLLM)</th><th>RadixAttention (SGLang)</th></tr></thead>
        <tbody>
          <tr><td>数据结构</td><td>哈希表 (BlockHashToBlockMap)</td><td>Radix Tree</td></tr>
          <tr><td>前缀匹配</td><td>O(N) 链式哈希查找</td><td>O(L) 树遍历</td></tr>
          <tr><td>碰撞处理</td><td>需要 Token 二次验证</td><td>树结构天然唯一，无碰撞</td></tr>
          <tr><td>淘汰策略</td><td>LRU (基于 block 访问时间)</td><td>LRU (基于子树访问时间)</td></tr>
          <tr><td>内存开销</td><td>低（哈希表）</td><td>中（树节点 + 指针）</td></tr>
          <tr><td>适合场景</td><td>通用推理</td><td>多轮对话、Agent、前缀复用率高</td></tr>
        </tbody>
      </table>

      {/* ==================== 5. GQA/MQA 优化 ==================== */}
      <div className="section-divider"><span>GQA / MQA 减少 KV Cache</span></div>

      <h3>GQA (Grouped Query Attention)</h3>
      <p>多个 Query Head 共享一组 KV Head，减少 KV Cache 大小。Llama-2-70B 使用 GQA 将 KV 头数从 64 降到 8。</p>

      <MermaidDiagram chart={`
graph LR
    subgraph MHA["MHA (Multi-Head)"]
        Q1["Q1"] --> K1["K1"]
        Q1 --> V1["V1"]
        Q2["Q2"] --> K2["K2"]
        Q2 --> V2["V2"]
        Q3["Q3"] --> K3["K3"]
        Q3 --> V3["V3"]
    end
    subgraph GQA["GQA (Grouped Query)"]
        QG1["Q1"] --> KG1["K1"]
        QG2["Q2"] --> KG1
        QG3["Q3"] --> KG1
        KG1 --> VG1["V1"]
    end
    subgraph MQA["MQA (Multi-Query)"]
        QM1["Q1"] --> KM1["K1"]
        QM2["Q2"] --> KM1
        QM3["Q3"] --> KM1
        KM1 --> VM1["V1"]
    end
    MHA --> GQA --> MQA
      `} />

      <table>
        <thead><tr><th>Attention 类型</th><th>KV Head 数</th><th>KV Cache 减少比例</th><th>质量影响</th><th>代表模型</th></tr></thead>
        <tbody>
          <tr><td>MHA (Multi-Head)</td><td>= Q Head 数</td><td>1x (基准)</td><td>无</td><td>GPT-3, Llama-1</td></tr>
          <tr><td>GQA (Grouped Query)</td><td>= Q Head / G</td><td>1/G</td><td>几乎无</td><td>Llama-2-70B, Llama-3</td></tr>
          <tr><td>MQA (Multi-Query)</td><td>= 1</td><td>1/H</td><td>轻微下降</td><td>PaLM, Falcon</td></tr>
        </tbody>
      </table>

      <Callout type="info">
        <strong>计算示例：</strong>Llama-3-8B 有 32 个 Q Head、8 个 KV Head (GQA, G=4)。
        KV Cache 大小是 MHA 的 <strong>1/4</strong>。对于 128K 上下文，这个差异是 GB 级别的显存节省。
      </Callout>

      {/* ==================== 6. 量化与压缩 ==================== */}
      <div className="section-divider"><span>KV Cache 量化与压缩</span></div>

      <h3>KV Cache 量化</h3>
      <p>将 KV Cache 从 FP16 量化到 INT8/FP8，可节省 2-4x 显存，精度损失极小。</p>

      <table>
        <thead><tr><th>量化方案</th><th>精度</th><th>压缩比</th><th>精度损失</th><th>框架支持</th></tr></thead>
        <tbody>
          <tr><td><strong>FP16 (基准)</strong></td><td>16-bit</td><td>1x</td><td>无</td><td>全部</td></tr>
          <tr><td><strong>FP8 (E4M3)</strong></td><td>8-bit 浮点</td><td>2x</td><td>几乎无</td><td>vLLM, SGLang</td></tr>
          <tr><td><strong>INT8 (per-token)</strong></td><td>8-bit 整数</td><td>2x</td><td>极小</td><td>vLLM, TensorRT-LLM</td></tr>
          <tr><td><strong>INT4 (per-group)</strong></td><td>4-bit 整数</td><td>4x</td><td>轻微</td><td>实验性</td></tr>
          <tr><td><strong>KIVI (2-bit)</strong></td><td>2-bit 整数</td><td>8x</td><td>可控</td><td>研究阶段</td></tr>
        </tbody>
      </table>

      <h3>KV Cache 淘汰策略</h3>
      <table>
        <thead><tr><th>策略</th><th>描述</th><th>优缺点</th></tr></thead>
        <tbody>
          <tr><td><strong>LRU</strong></td><td>淘汰最久未使用的 block</td><td>简单高效，但可能淘汰仍有用的前缀</td></tr>
          <tr><td><strong>LFU</strong></td><td>淘汰使用频率最低的 block</td><td>保留热门前缀，但需要额外计数器</td></tr>
          <tr><td><strong>FIFO</strong></td><td>淘汰最早分配的 block</td><td>最简单，但缓存命中率低</td></tr>
          <tr><td><strong>优先级 LRU</strong></td><td>结合优先级和 LRU，优先淘汰低优先级</td><td>vLLM 默认，兼顾公平和效率</td></tr>
        </tbody>
      </table>

      {/* ==================== 7. 多框架实现对比 ==================== */}
      <div className="section-divider"><span>多框架实现对比</span></div>

      <table>
        <thead><tr><th>框架</th><th>管理方案</th><th>Block 大小</th><th>前缀缓存</th><th>量化支持</th><th>跨请求共享</th></tr></thead>
        <tbody>
          <tr><td><strong>HuggingFace</strong></td><td>连续预分配</td><td>—</td><td>❌</td><td>❌</td><td>❌</td></tr>
          <tr><td><strong>vLLM</strong></td><td>PagedAttention</td><td>16</td><td>✅ Hash 链</td><td>✅ FP8/INT8</td><td>✅ 哈希匹配</td></tr>
          <tr><td><strong>SGLang</strong></td><td>RadixAttention</td><td>Token 级</td><td>✅ Radix Tree</td><td>✅ FP8</td><td>✅ 树共享</td></tr>
          <tr><td><strong>nano-vLLM</strong></td><td>Paged KV + HashChain</td><td>256</td><td>✅ xxhash 链</td><td>❌</td><td>✅ 哈希匹配</td></tr>
          <tr><td><strong>TensorRT-LLM</strong></td><td>Paged KV Cache</td><td>可配置</td><td>❌</td><td>✅ INT8/FP8</td><td>❌</td></tr>
          <tr><td><strong>LMDeploy</strong></td><td>TurboMind</td><td>可配置</td><td>✅</td><td>✅ INT8</td><td>✅</td></tr>
        </tbody>
      </table>

      <Callout type="tip">
        <strong>选择建议：</strong>
        <ul>
          <li>生产部署 (NVIDIA GPU)：vLLM PagedAttention，成熟稳定</li>
          <li>多轮对话 / Agent：SGLang RadixAttention，前缀复用率最高</li>
          <li>学习原理：nano-vLLM HashChain，代码最简洁</li>
          <li>超长上下文 (128K+)：配合 GQA + FP8 量化，显存节省 4-8x</li>
        </ul>
      </Callout>

      <ResourceTable resources={[
        { name: 'PagedAttention 论文', url: 'https://arxiv.org/abs/2309.06180', desc: 'vLLM PagedAttention 原始论文，KV Cache 分页管理理论基础' },
        { name: 'RadixAttention 论文', url: 'https://arxiv.org/abs/2312.07104', desc: 'SGLang RadixAttention 论文，Radix Tree 前缀缓存' },
        { name: 'GQA 论文', url: 'https://arxiv.org/abs/2305.13245', desc: 'Grouped Query Attention，减少 KV Cache 的关键技术' },
        { name: 'vLLM 自动前缀缓存文档', url: 'https://docs.vllm.ai/en/latest/features/automatic_prefix_caching.html', desc: 'vLLM 官方 APC 文档' },
        { name: 'KIVI 2-bit 量化', url: 'https://arxiv.org/abs/2402.02750', desc: 'KIVI: 2-bit KV Cache 量化方案' },
        { name: 'The Illustrated Transformer', url: 'https://jalammar.github.io/illustrated-transformer/', desc: 'Jay Alammar 经典可视化，理解 Attention 和 KV Cache' },
      ]} />
    </div>
  );
}