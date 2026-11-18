/** 侧边栏菜单数据与路径工具（纯数据模块，无组件导出，保证 Sidebar 组件的 Vite Fast Refresh 生效）。 */

export interface SidebarItem {
  to?: string;
  label: string;
  /** 顶级项/分组标题图标（emoji），子链接不设，靠图标区分层级 */
  icon?: string;
  end?: boolean;
  external?: boolean;
  children?: SidebarItem[];
}

export const llmSidebar: SidebarItem[] = [
  { to: '/', label: '首页', icon: '🏠', end: true },
  { to: '/overview', label: '总体架构', icon: '🧩' },
  {
    label: 'vLLM', icon: '⚡',
    children: [
      { to: '/vllm', label: 'vLLM' },
      { to: '/vllm-arch', label: 'vLLM Arch' },
      { to: '/vllm-quickstart', label: 'vLLM 快速入门' },
    ],
  },
  { to: '/vllm-ascend', label: 'vLLM-Ascend', icon: '🧠' },
  { to: '/nano-vllm', label: 'nano-vLLM-NPU', icon: '🔬' },
  { to: '/sglang', label: 'SGLang', icon: '🌀' },
  { to: '/comparison', label: '框架对比', icon: '⚖️' },
  {
    label: 'KV Cache', icon: '🗃️',
    children: [
      { to: '/kv-cache', label: '概览' },
      { to: '/sglang-kv-cache', label: 'SGLang KV Cache 机制' },
      { to: '/vllm-kv-cache', label: 'vLLM KV Cache 机制' },
      { to: '/kv-cache-compare', label: 'SGLang vs vLLM 对比' },
    ],
  },
  {
    label: 'KV Pool', icon: '📦',
    children: [
      { to: '/kv-pool', label: '概览' },
      { to: '/mooncake-kvpool', label: 'Mooncake KVPool' },
      { to: '/memcache', label: 'Ascend MemCache' },
      // 说明：/mooncake-kvpool 仅在此保留一处，避免与 Mooncake 重复出现同一个页面。
    ],
  },
  { to: '/pd-separation', label: 'P/D 分离', icon: '🔀' },
  {
    label: '服务调度', icon: '📡',
    children: [
      { to: '/serving-scheduler', label: '概览' },
      { to: '/vllm-scheduler', label: 'vLLM 调度' },
      { to: '/sglang-scheduler', label: 'SGLang 调度' },
    ],
  },
  {
    label: '调度器', icon: '🎯',
    children: [
      { to: '/router', label: 'AIBrix' },
      { to: '/sglang-gateway', label: 'SGLang Model Gateway' },
      { to: '/vllm-router', label: 'vLLM Router' },
    ],
  },
  // 扁平化后：KV Cache / KV Pool / 服务调度 / 调度器等直接作为顶级分组，去掉“框架专题”中间层。
  { to: '/mooncake', label: 'Mooncake', icon: '🌕' },
  { to: '/attention-close-reading', label: 'Attention (精读)', icon: '💡' },
  { to: '/attention-en', label: 'Attention (论文-EN)', icon: '📄' },
  { to: '/infratech', label: 'InfraTech', icon: '🛠️' },
  { to: '/llm-learning', label: '推理框架学习资料', icon: '📚' },
  { to: '/nanovllm2deepinfer', label: 'nano-vLLM → DeepInfer', icon: '🔁' },
  {
    label: '模型可视化', icon: '🧭',
    children: [
      { to: '/business-process', label: 'LLM 业务处理视图' },
      { to: '/inferflux/gpt-3d.html', label: 'GPT 架构 3D 透视', external: true },
      { to: '/model-structure-3d', label: 'MiMo-V2.5 模型结构 3D' },
      { to: '/arch-compare-3d', label: 'Qwen3.8 vs DeepSeek V4 架构 3D' },
      { to: '/transformer-explainer', label: 'Transformer Explainer (GPT-2)' },
      { to: '/inferflux/transformer-3d.html', label: 'Transformer + Speculative 3D', external: true },
      { to: '/inferflux/pd-disagg.html', label: 'PD 分离模拟器', external: true },
      { to: '/inferflux/vllm-pd-glm.html', label: 'vLLM P/D 分离模拟器', external: true },
    ],
  },
];

export const deepinferSidebar: SidebarItem[] = [
  {
    label: 'DeepInfer 剖面', icon: '🔍',
    children: [
      { to: '/deepinfer/index', label: '总览（整机剖面）' },
      { to: '/deepinfer/scheduling', label: '请求与调度' },
      { to: '/deepinfer/runtime', label: '运行时与异步' },
      { to: '/deepinfer/model', label: '模型与注意力' },
      { to: '/deepinfer/sampling', label: '采样与结构' },
      { to: '/deepinfer/performance', label: '测量与效率' },
      { to: '/deepinfer/production', label: '生产恢复' },
      { to: '/deepinfer/atlas', label: '整机图谱' },
    ],
  },
  {
    label: 'mini-DeepInfer 教学引擎', icon: '🎓',
    to: '/deepinfer/mini',
    children: [
      {
        label: '十四课学习路径',
        children: [
          { to: '/deepinfer/lesson/1', label: '一 跟踪一个请求' },
          { to: '/deepinfer/lesson/2', label: '二 真实权重与 KV Cache' },
          { to: '/deepinfer/lesson/3', label: '三 同步批处理' },
          { to: '/deepinfer/lesson/4', label: '四 Qwen3.5 的两种缓存' },
          { to: '/deepinfer/lesson/5', label: '五 缓存为什么还不能还' },
          { to: '/deepinfer/lesson/6', label: '六 NPU 算完 CPU 就能读吗' },
          { to: '/deepinfer/lesson/7', label: '七 结果回来后，再提交进度' },
          { to: '/deepinfer/lesson/8', label: '八 BatchEngine 分步执行' },
          { to: '/deepinfer/lesson/9', label: '九 等待期间准备新文本' },
          { to: '/deepinfer/lesson/10', label: '十 先准备采样索引' },
          { to: '/deepinfer/lesson/11', label: '十一 下一轮先发出去' },
          { to: '/deepinfer/lesson/12', label: '十二 请求结束，下一轮已发出' },
          { to: '/deepinfer/lesson/13', label: '十三 新请求放进哪一轮' },
          { to: '/deepinfer/lesson/14', label: '十四 发出去了，不等于已提交' },
        ],
      },
    ],
  },
];

export const autoDriveSidebar: SidebarItem[] = [
  { to: '/auto-drive', label: '首页', icon: '🏠', end: true },
  { to: '/auto-drive/overview', label: '总体架构', icon: '🧩' },
  {
    label: '训练框架', icon: '🏗️',
    children: [
      { to: '/auto-drive/voyager', label: 'Voyager' },
      { to: '/auto-drive/drivevla-w0', label: 'DriveVLA-W0' },
      { to: '/auto-drive/emu3', label: 'Emu3' },
      { to: '/auto-drive/pi-0-5', label: 'Pi-0.5' },
      { to: '/auto-drive/pi0', label: 'π0' },
      { to: '/auto-drive/mtr', label: 'MTR' },
      { to: '/auto-drive/uniad', label: 'UniAD' },
      { to: '/auto-drive/cosmos-framework', label: 'Cosmos-Framework' },
    ],
  },
];

export type SidebarTab = 'llm' | 'deepinfer' | 'auto';

/** 根据当前路径推断应显示的侧边栏 Tab。 */
export function getTabForPath(pathname: string): SidebarTab {
  if (pathname.startsWith('/deepinfer')) return 'deepinfer';
  if (pathname.startsWith('/auto-drive')) return 'auto';
  return 'llm';
}

function linkMatchesPath(to: string, pathname: string, end?: boolean): boolean {
  if (end) return pathname === to;
  // 按路径段边界匹配，避免 /vllm 误匹配 /vllm-ascend
  return pathname === to || pathname.startsWith(to.endsWith('/') ? to : `${to}/`);
}

/** 递归找出包含当前激活链接的分组（祖先）label，用于导航后自动展开对应分组。 */
export function findAncestorGroups(items: SidebarItem[], pathname: string): string[] {
  const labels: string[] = [];
  const collect = (nodes: SidebarItem[]): boolean => {
    for (const node of nodes) {
      if (node.children) {
        // 分组自身带链接且命中（如 mini-DeepInfer 教学引擎 → /deepinfer/mini）
        if (node.to && linkMatchesPath(node.to, pathname, node.end)) {
          labels.push(node.label);
          return true;
        }
        const before = labels.length;
        if (collect(node.children)) {
          // 子孙命中：把本分组 label 插到链首，保证 外层→内层 顺序
          labels.splice(before, 0, node.label);
          return true;
        }
      } else if (node.to && linkMatchesPath(node.to, pathname, node.end)) {
        // 叶子链接命中（含折叠分组内的叶子，如 vLLM 分组下的 /vllm）
        return true;
      }
    }
    return false;
  };
  collect(items);
  return labels;
}

/** 按关键字过滤菜单：分组名命中时保留整个分组（用户可看到组内全部条目）；
 *  仅子项命中时保留祖先分组并只保留命中的子项。 */
export function filterSidebar(items: SidebarItem[], query: string): SidebarItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const result: SidebarItem[] = [];
  for (const item of items) {
    const labelHit = item.label.toLowerCase().includes(q);
    if (item.children) {
      if (labelHit) {
        result.push(item);
      } else {
        const kids = filterSidebar(item.children, query);
        if (kids.length > 0) {
          result.push({ ...item, children: kids });
        }
      }
    } else if (labelHit || (item.to && item.to.toLowerCase().includes(q))) {
      result.push(item);
    }
  }
  return result;
}
