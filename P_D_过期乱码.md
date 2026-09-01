# vLLM 大并发下 P/D 分离 KV 过期乱码问题分析

## 问题现象

**大并发场景下**：vLLM P/D 分离部署中，P 节点 KV Cache 因内存压力被淘汰，D 节点拉取时出现**乱码输出**。

## 根因分析

### 核心问题：静默数据损坏（Silent Data Corruption）

这是一个 **Connector 模型固有缺陷**，而非普通的传输错误。关键在于 `invalid_block_ids` 机制**无法检测到此类错误**。

### 完整竞态链路

```
时间线

T1: D 端调用 get_num_new_matched_tokens() → 返回 Block 1, 3, 5 可用
T2: P 端内存压力触发 LRU 淘汰 → Block 5 被标记为 Free
T3: P 端新请求到达 → Block 5 被分配给新请求 → 写入新的 KV 数据
T4: D 端调用 start_load_kv(block_ids=[1, 3, 5])
    NIXL RDMA 读取 Block 5 ─── 传输成功！
    但读取到的是新请求的 KV 数据 ← 静默数据损坏
T5: D 端用错误 KV 数据做 Attention → 乱码输出

⚠️ invalid_block_ids 未被触发！
   _handle_failed_transfer() 只捕获 NIXL xfer 操作显式失败
   但 RDMA 读到"别人的数据"时传输本身是成功的
```

### 源码证据

**NIXL Worker 错误上报** (`nixl/worker.py:1925-1927`)：

```python
def _handle_failed_transfer(self, req_id: str, handle: int | None):
    """Handle a failed transfer by marking all blocks as invalid."""
    if (meta := self._recving_metadata.get(req_id)) and not self._is_hma_required:
        self._invalid_block_ids.put(set(meta.local_block_ids[0]))
    self._failed_recv_reqs.put(req_id)
```

**关键问题**：此方法仅在 NIXL `xfer` 操作**显式失败**时被调用。但 Block 被重新分配后，RDMA 读取操作仍然成功——它只是读取了错误的数据。

**KVTransferConfig 默认值** (`kv_transfer.py:70`)：

```python
kv_load_failure_policy: Literal["recompute", "fail"] = "fail"
```

默认是 `"fail"`，即使检测到失效 Block，也是直接 abort 而非重算。

### 为什么 vLLM 的 invalid_block_ids 无法捕获此问题

```
┌──────────────────────────────────────────────────────────────────┐
│                    NIXL 传输的两种失败模式                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  模式 A: 传输失败（可检测）                                        │
│  ─────────────────────────                                       │
│  RDMA read → 网络错误 / 内存地址无效 / handle 超时                  │
│  → _handle_failed_transfer() 被调用                                │
│  → invalid_block_ids 上报                                         │
│  → 调度器触发 recompute 或 abort                                   │
│                                                                  │
│  模式 B: 静默损坏（不可检测）← 大并发下的问题                        │
│  ─────────────────────────────                                    │
│  Block 被重新分配 → 新数据写入 → RDMA read 成功                     │
│  → 读取到"别人的"KV 数据                                           │
│  → _handle_failed_transfer() 未被调用！                            │
│  → 错误 KV 数据参与 Attention 计算 → 乱码                          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 解决方案

### 方案一：增大 P 端 KV Cache 容量（治本，推荐优先）

**原理**：减少内存压力，避免 Block 在传输窗口内被淘汰。

```bash
# P 端
vllm serve meta-llama/Llama-3-70B \
  --disaggregation-role prefill \
  --kv-transfer-config '{"backend":"nixl","port":12345}' \
  --gpu-memory-utilization 0.95 \
  --max-model-len 8192 \
  --max-num-seqs 128
```

**优点**：零代码改动，立即生效
**缺点**：需要足够 GPU 显存，治标不治本

### 方案二：切换 kv_load_failure_policy 为 recompute（部分缓解）

**原理**：至少能被检测到的失效 Block 会触发重算而非直接 abort。

```bash
# D 端
vllm serve meta-llama/Llama-3-70B \
  --disaggregation-role decode \
  --kv-transfer-config '{
    "backend":"nixl",
    "port":12345,
    "kv_load_failure_policy":"recompute"
  }'
```

**优点**：一行配置，快速止血
**缺点**：只能修复**可检测的**传输失败，无法解决静默数据损坏

### 方案三：使用 Mooncake Connector（推荐）

**原理**：Mooncake Connector 的会话管理 + 后台探测 + 拓扑感知路径选择比 NIXL 更健壮。

```bash
# P 端
vllm serve meta-llama/Llama-3-70B \
  --disaggregation-role prefill \
  --kv-transfer-config '{
    "backend":"mooncake",
    "port":12345,
    "kv_load_failure_policy":"recompute"
  }'

# D 端
vllm serve meta-llama/Llama-3-70B \
  --disaggregation-role decode \
  --kv-transfer-config '{
    "backend":"mooncake",
    "port":12345,
    "kv_load_failure_policy":"recompute"
  }'
```

**优点**：更健壮的传输层，支持会话黑名单和后台探测
**缺点**：需要 RDMA 环境，侵入性高于方案一/二

### 方案四：P 端 Block 传输引用计数保护（需代码改造）

**原理**：在 BlockPool 中增加 `transfer_ref` 计数，防止正在传输的 Block 被淘汰。

```python
# vllm/v1/core/block_pool.py 改造

class KVCacheBlock:
    ref_cnt: int = 0       # 普通引用计数
    transfer_ref: int = 0  # 传输中引用计数（新增）

    @property
    def is_evictable(self) -> bool:
        return self.ref_cnt == 0 and self.transfer_ref == 0


class BlockPool:
    def can_evict(self, block_id: int) -> bool:
        """检查 Block 是否可以安全淘汰"""
        block = self.blocks[block_id]
        return block.is_evictable

    def inc_transfer_ref(self, block_ids: list[int]):
        """Connector 在 save/load 期间持有传输引用"""
        for bid in block_ids:
            self.blocks[bid].transfer_ref += 1

    def dec_transfer_ref(self, block_ids: list[int]):
        """传输完成后释放传输引用"""
        for bid in block_ids:
            self.blocks[bid].transfer_ref -= 1


# Connector 层改造
class NixlConnectorWorker:
    def start_load_kv(self, metadata):
        for req_id, meta in metadata.reqs_to_recv.items():
            block_ids = meta.local_block_ids[0]
            self.block_pool.inc_transfer_ref(block_ids)  # 加锁

    def wait_for_layer_load(self, layer_name):
        # 加载完成后释放
        self.block_pool.dec_transfer_ref(completed_blocks)  # 解锁
```

**优点**：从根本上消除竞态窗口
**缺点**：需要改动 vLLM 核心代码，需充分测试

### 方案五：迁移到 SGLang（架构根治）

**原理**：SGLang 的 Push 模型从架构上消除了这个竞态。

```
SGLang Push 模型：
  P 端 send_kv_chunk() → poll_and_all_reduce() → 仅 Success 后释放 KV
  
  不存在"查询-加载"两步操作的竞态窗口
  D 端从不主动拉取，P 端在确认 D 接收成功后才释放 KV
```

```bash
# SGLang 分离式部署
# P 端
python -m sglang.launch_server \
  --model meta-llama/Llama-3-70B \
  --disaggregation-mode prefill \
  --prefill-port 30000

# D 端
python -m sglang.launch_server \
  --model meta-llama/Llama-3-70B \
  --disaggregation-mode decode \
  --disaggregation-transfer-backend mooncake
```

**优点**：架构层面消除竞态，一劳永逸
**缺点**：框架切换成本高

---

## 方案对比

| 方案 | 效果 | 改动量 | 根治程度 | 适用场景 |
|------|------|--------|----------|----------|
| 增大 P 端 KV Cache | **治标** | 无代码改动 | 低 | 快速止血，有足够显存 |
| `kv_load_failure_policy=recompute` | 部分缓解 | 一行配置 | 低 | 快速止血 |
| 换用 Mooncake Connector | 显著改善 | 改配置 | 中 | 有 RDMA 环境 |
| Block 传输引用计数 | 根除可检测问题 | 代码改造 | 高 | 有改造能力 |
| 迁移到 SGLang | **架构根治** | 框架切换 | 最高 | 新项目/可接受迁移 |

---

## 建议优先级

```
短期止血（立即）:
  ├── 方案一：增大 P 端 KV Cache（--gpu-memory-utilization 0.95）
  └── 方案二：kv_load_failure_policy=recompute

中期加固（1-2 周）:
  └── 方案三：换用 Mooncake Connector

长期根治（1-3 月）:
  ├── 方案四：Block 传输引用计数保护（提交 PR 到 vLLM）
  └── 方案五：评估迁移到 SGLang
```

---

## SGLang vs vLLM 架构对比

| 维度 | vLLM | SGLang |
|------|------|--------|
| 传输模型 | Connector（P Save + D Load） | Push（P 主动推送） |
| 竞态窗口 | **存在**：查询和加载之间 | **不存在**：Push 天然消除 |
| 失效处理 | Recompute 失效 Block | Abort + 重新调度 |
| KV 释放时机 | P 独立决策，不等待 D 确认 | 仅 poll_and_all_reduce Success 后 |
| 大并发乱码风险 | **高**（静默数据损坏） | **无**（架构保障） |
| 传输后端 | 9 种 Connector | 5 种传输后端 |

---

## 相关源码位置

| 文件 | 关键内容 |
|------|----------|
| `vllm/v1/core/sched/scheduler.py:121` | `recompute_kv_load_failures` 初始化 |
| `vllm/v1/core/sched/scheduler.py:2353-2422` | `_handle_invalid_blocks()` 处理逻辑 |
| `vllm/v1/core/sched/scheduler.py:2250-2349` | `_update_requests_with_invalid_blocks()` 回退逻辑 |
| `vllm/config/kv_transfer.py:70` | `kv_load_failure_policy` 默认值 `"fail"` |
| `vllm/distributed/kv_transfer/kv_connector/v1/nixl/worker.py:1915-1931` | `_handle_failed_transfer()` 仅捕获显式传输失败 |
| `vllm/distributed/kv_transfer/kv_connector/v1/nixl/worker.py:2453-2464` | `get_block_ids_with_load_errors()` 错误上报 |
| `vllm/distributed/kv_transfer/kv_connector/v1/base.py:375-393` | `get_block_ids_with_load_errors()` 接口定义 |