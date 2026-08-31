// Auto-generated from Zhihu article scrape
export interface ArticleParagraph { tag: string; text: string; }
export interface ArticleImage { src: string; alt: string; width: number; height: number; }
export interface ArticleLink { href: string; text: string; isExternal: boolean; }
export interface ArticleData { title: string; paragraphs: ArticleParagraph[]; images: ArticleImage[]; links: ArticleLink[]; }

export const articleData: ArticleData = {
  "title": "vLLM不知如何开始？看这篇：vLLM框架快速入门引导",
  "paragraphs": [
    {
      "tag": "p",
      "text": "作为vLLM源码的开发者、框架的使用者，刚接触vLLM框架时会有这样的问题“如何快速地了解vLLM全貌？”。要解决这个问题，可以去读vLLM官方指导手册[1]、阅读其github源码[2]或者相关博客[3]。然而，对于初学者这么做虽然有效，但不一定高效。推荐的一个学习步骤："
    },
    {
      "tag": "p",
      "text": "先大致了解整体运行流程，接着理解关键模块逻辑，然后学习关键特性。同时，逐步理解源码。"
    },
    {
      "tag": "p",
      "text": "本文作为这个过程的一个前置引导，主要分析vLLM框架的运行流程。由于vLLM框架的迭代速度非常之快，如果直接解读源码，可能过几个月后这些逻辑就发生了较大的变化，所以文中以概念为主，代码逻辑为辅。主要参考vLLM 0.10.0，本人梳理了一版整体架构图，如下所示，细节后面逐步展开。"
    },
    {
      "tag": "figcaption",
      "text": "vLLM整体架构图"
    },
    {
      "tag": "h2",
      "text": "1 为什么需要一个LLM推理框架？"
    },
    {
      "tag": "p",
      "text": "在有PyTorch/TensorFlow这些既能训练又能推理的深度学习框架后，为什么还需要构建一个推理框架？这是在学习vLLM前需要思考的一个关键问题。"
    },
    {
      "tag": "p",
      "text": "以PyTorch框架为例，有了训练好的模型后，切换model的模式即可运行推理："
    },
    {
      "tag": "pre",
      "text": "# 关键步骤：\n# 1. 设置为推理模式\nmodel.eval()\n\n# 2. 进行推理（不计算梯度）\nwith torch.no_grad():  \n    output = model(input_data)"
    },
    {
      "tag": "p",
      "text": "对于自回归的大语言模型（LLM）多个步骤：增加前、后token的转换处理，token的流处理："
    },
    {
      "tag": "p",
      "text": "但这种方式会面临如下问题："
    },
    {
      "tag": "li",
      "text": "如何处理来自不同用户的请求？"
    },
    {
      "tag": "li",
      "text": "资源利用率如何维持较高水平？"
    },
    {
      "tag": "li",
      "text": "如何避免超显存(OOM)？"
    },
    {
      "tag": "p",
      "text": "对于问题1一般的解决方式是部署推理服务，通过API server来响应用户的并发请求。如Tensorflow的推理部署服务、NVIDIA的Triton。"
    },
    {
      "tag": "p",
      "text": "问题2、问题3主要跟负载的动态变化相关："
    },
    {
      "tag": "li",
      "text": "单位时间内推理服务处理的请求数量会发生动态变化，这是推理服务所共有的问题。"
    },
    {
      "tag": "li",
      "text": "单个请求的资源需求会发生变化。这是自回归模型所特有的。 随着序列的增长，计算量、KV cache显存量均会增长。"
    },
    {
      "tag": "p",
      "text": "若按照峰值需求来配置资源，会导致资源整体利用率低；若资源给得太少，会使得推理服务质量下降，或者触发OOM问题。所以针对LLM的特点，需要有一个专门推理引擎完成高效的请求调度与资源分配。"
    },
    {
      "tag": "h2",
      "text": "2 vLLM的基本要素"
    },
    {
      "tag": "p",
      "text": "为了解决通用深度学习框架中存在的不足，vLLM设计了几个关键模块："
    },
    {
      "tag": "li",
      "text": "调度器(Scheduler)，用于解决多请求之间的调度协同问题；"
    },
    {
      "tag": "li",
      "text": "显存管理(KV cache manager)，为请求分配KV cache内存资源。"
    },
    {
      "tag": "li",
      "text": "执行器(Model runner)，完成模型的计算。"
    },
    {
      "tag": "p",
      "text": "上述3个模块放置在引擎核(Engine core)中。有了关键模块后，再采用API服务的方式，得到如下所示的改进方案："
    },
    {
      "tag": "figcaption",
      "text": "改进方案示意"
    },
    {
      "tag": "p",
      "text": "在这个基础上为了提升算子的下发速度，框架要做进一步优化。把在CPU侧执行的一些步骤放入独立的进程中，如请求的前置处理，token转换等，进程之间采用异步流程。这么做能够降低CPU运算对GPU运算的阻塞影响。"
    },
    {
      "tag": "p",
      "text": "同时为了适配分布式并行推理，在engine core里面抽出了一个engine core client模块。该模块负责给不同的engine core分配请求。在模块管理上面，除了engine core，其它模块基本放入AsyncLLM中。这也是为了防止CPU成为运算的瓶颈。"
    },
    {
      "tag": "p",
      "text": "vLLM的基本流程执行框图如下，其中Node 0为主节点，上面运行了API Server、AsyncLLM、engine core；从节点(Node1~N)，仅运行engine core。"
    },
    {
      "tag": "figcaption",
      "text": "vLLM基本流程执行框图"
    },
    {
      "tag": "p",
      "text": "按照OpenAI的格式，给vLLM发送一个在线服务请求："
    },
    {
      "tag": "p",
      "text": "收到请求后，其基本的处理步骤："
    },
    {
      "tag": "li",
      "text": "API server响应请求，对请求的信息进行初步处理；"
    },
    {
      "tag": "li",
      "text": "进行请求的前置处理，包括对prompt进行token转换获得token id；"
    },
    {
      "tag": "li",
      "text": "engine core client将请求发送给合适engine core，engine core完成自回归运算；"
    },
    {
      "tag": "li",
      "text": "进行后置处理，包括token转文本的过程；"
    },
    {
      "tag": "li",
      "text": "返回请求结果给用户。"
    },
    {
      "tag": "h2",
      "text": "3 关键模块运行逻辑"
    },
    {
      "tag": "h3",
      "text": "3.1 Engine core模块"
    },
    {
      "tag": "p",
      "text": "单engine core的基本架构图如下所示。AsyncLLM与engine core运行在不同的进程中，两者通过队列(queue)交互。engine core的任务由executor下发，多个worker共同完成LLM的数据生成。一般情况下，每个worker拥有一张GPU卡，多worker可实现TP/SP/EP等并行策略。"
    },
    {
      "tag": "p",
      "text": "注：上图为V1版本，与V0版本有差异，具体参看\"vLLM框架V1演进分析\"[4]。"
    },
    {
      "tag": "p",
      "text": "Engine core里有三个协同的线程："
    },
    {
      "tag": "li",
      "text": "输入处理线程(process input)：主要负责接收engine core client传递过来的数据，并将请求放入队列；"
    },
    {
      "tag": "li",
      "text": "输出处理线程(process output)：将数据通过zmq通信返回给engine core client；"
    },
    {
      "tag": "li",
      "text": "处理循环线程(run busy loop)：持续地从输入队列拿取请求，按照vLLM config里的参数构造数据，并执行引擎的step操作。step操作包括请求调度和模型运算。"
    },
    {
      "tag": "figcaption",
      "text": "engine core计算流"
    },
    {
      "tag": "h3",
      "text": "3.2 Scheduler模块"
    },
    {
      "tag": "p",
      "text": "scheduler模块主要职责是：根据系统资源和当前在执行请求的情况，组织每次推理需要计算的数据。"
    },
    {
      "tag": "p",
      "text": "分析scheduler的执行逻辑前，先回顾下LLM推理过程的一般特点："
    },
    {
      "tag": "li",
      "text": "推理的阶段不一样，计算、访存的资源消耗量不同。prefill属于计算密集、decode属于访存密集。"
    },
    {
      "tag": "li",
      "text": "不同请求的decode结束时机不同，生成的序列长短也不一样。"
    },
    {
      "tag": "figcaption",
      "text": "批处理示意：黄色表示prefill、蓝色表示decode生成"
    },
    {
      "tag": "p",
      "text": "结合LLM的推理特点，scheduler目前应用了两个关键技术："
    },
    {
      "tag": "p",
      "text": "1 持续批处理(Continuous-batching)：持续地往GPU中送入请求数据，而不是离散的进行数据推理。一个请求结束立刻下发新的请求。"
    },
    {
      "tag": "figcaption",
      "text": "continuous batching"
    },
    {
      "tag": "p",
      "text": "2 分块预填充(Chunked Prefill)：将大的prefill分块成更小的块（切分序列）执行，也可以将它们与decode阶段的请求一起混合执行。"
    },
    {
      "tag": "figcaption",
      "text": "分块预填充示意"
    },
    {
      "tag": "p",
      "text": "除此之外，scheduler还要根据请求优先级调整执行顺序，高优先级的请求可以打断低优先级的请求。"
    },
    {
      "tag": "p",
      "text": "scheduler整体逻辑：按照可用资源的数量和优先级构建调度输出。scheduler里面有两个主要的队列waiting和running，以及一些辅助队列。运行时，请求在不同的队列之间轮转。scheduler通过KV manager为请求配备KV cache。scheduler的优先级默认是FCFS(先到先服务)，也支持用户自定义。"
    },
    {
      "tag": "figcaption",
      "text": "scheduler调度流程示意"
    },
    {
      "tag": "p",
      "text": "scheduler处理的大致步骤："
    },
    {
      "tag": "li",
      "text": "请求抵达后，先进入waiting队列；"
    },
    {
      "tag": "li",
      "text": "找KV manager申请KV cache块；"
    },
    {
      "tag": "li",
      "text": "具备下发条件的请求转入running队列，组batch下发执行(图示中有3个请求)；资源不足的请求会转回waiting队列。"
    },
    {
      "tag": "p",
      "text": "更细节的执行步骤参考[5]："
    },
    {
      "tag": "p",
      "text": "如果觉得Scheduler逻辑太复杂，理解起来费劲，可以先阅读："
    },
    {
      "tag": "h3",
      "text": "3.3 KV Manager模块"
    },
    {
      "tag": "p",
      "text": "KV值的复用能够降低 Attention中的冗余计算，目前KV cache已成为了Attention推理计算的标准配置。框架中需要完成对多个不同请求的KV cache管理。"
    },
    {
      "tag": "p",
      "text": "vLLM中的KV cache管理逻辑基于Paged attention原理，目前的版本还融合了前缀树特点[6]。"
    },
    {
      "tag": "p",
      "text": "KV cache管理的整体架构示意图如下所示，分为了逻辑层和物理层。KV Manager负责逻辑层、Model Runner处理物理层；Scheduler（调度器）作为信息传递的桥梁，衔接了逻辑层与物理层。cache的管理元素包括：池（pool）表(table)、层(layer)、块(block)和槽(slot)。"
    },
    {
      "tag": "figcaption",
      "text": "KV cache管理架构示意"
    },
    {
      "tag": "li",
      "text": "slot：为最小管理单元，每个token占一个slot；"
    },
    {
      "tag": "li",
      "text": "block：为请求分配的基本单位，一个block包含多个slot；"
    },
    {
      "tag": "li",
      "text": "pool：为逻辑层block的管理合集，通过链表将block数据组织起来；"
    },
    {
      "tag": "li",
      "text": "table：管理请求与数据的映射表，一个table可包含多个请求的信息。位于物理层；"
    },
    {
      "tag": "li",
      "text": "layer：一个整体的tensor，拆分成多个blocks使用。对应attention的一个层，所有请求共用；"
    },
    {
      "tag": "p",
      "text": "模块之间运行的关键步骤："
    },
    {
      "tag": "li",
      "text": "Scheduler分配资源给请求，通过KV Manager申请逻辑blocks；"
    },
    {
      "tag": "li",
      "text": "KV Manager把Pool中空闲的blocks选中后给到对应请求；"
    },
    {
      "tag": "li",
      "text": "分配好逻辑blocks后Scheduler构建scheduler.output传递给ModelRunner；"
    },
    {
      "tag": "li",
      "text": "ModelRunner为每条请求创建block table，并生成slot_mapping；"
    },
    {
      "tag": "li",
      "text": "计算时把slot_mapping传入attention，就能够从物理KV blocks上面找到所需的数据。"
    },
    {
      "tag": "p",
      "text": "逻辑KV blocks是一个双向链表，采用LRU策略淘汰旧数据[7]。"
    },
    {
      "tag": "figcaption",
      "text": "blocks数据结构示意"
    },
    {
      "tag": "p",
      "text": "KV Manager的代码解析参看“vLLM V1 KV cache 管理机制剖析”[8]"
    },
    {
      "tag": "h3",
      "text": "3.4 Model Runner"
    },
    {
      "tag": "p",
      "text": "模型执行器(model runner)主要负责计算调度器发送过来的批请求，并返回执行结果。"
    },
    {
      "tag": "p",
      "text": "从上面engine core的架构可知，executor可以有多个worker模块，每个worker都会有自己的model runner。model runner的逻辑主要是模型运算、以及物理层的kv cache分配与管理。"
    },
    {
      "tag": "p",
      "text": "执行的基本步骤："
    },
    {
      "tag": "li",
      "text": "根据映射表(block table)信息为每个待执行请求分配kv blocks；"
    },
    {
      "tag": "li",
      "text": "将请求组成序列batch，并让模型处理该batch数据。"
    },
    {
      "tag": "li",
      "text": "在Attention层运算阶段，每层拿取自己对应的kv cache数据，完成MHA/GQA/MLA运算。"
    },
    {
      "tag": "h3",
      "text": "3.5 Attention模块"
    },
    {
      "tag": "p",
      "text": "Attention模块负责承载注意力计算的算子，其关键要素："
    },
    {
      "tag": "li",
      "text": "QKV数据：Q值是展平后的tokens序列，KV则是整个KV Cache Tensor。"
    },
    {
      "tag": "li",
      "text": "Metadata：注意力运算的元数据，包括KV相关的block table、slot_mapping，以及Q值的起始位置信息(query_start_loc)，用于区分不同请求；"
    },
    {
      "tag": "li",
      "text": "Backend：通过定义不同后端(backend)来支持不同类型的Attention算子，以及不同的硬件。"
    },
    {
      "tag": "h2",
      "text": "4 数据处理流程"
    },
    {
      "tag": "p",
      "text": "接下来通过一个请求处理的数据流的例子，了解从请求、kv cache、attention算子、到采样的数据传递过程。"
    },
    {
      "tag": "p",
      "text": "给vLLM发送请求，提示词prompts包含两条语句，即有两个子请求。"
    },
    {
      "tag": "p",
      "text": "方式一：在线服务(online serving)："
    },
    {
      "tag": "p",
      "text": "方式二：离线推理(offline infer):"
    },
    {
      "tag": "p",
      "text": "Step1：文字转token ids(Tokenization)。 多个请求会拼接成一个数据(组batch)，用位置(positions)记录每个请求对应的ids。"
    },
    {
      "tag": "figcaption",
      "text": "Step1 Tokenization示意"
    },
    {
      "tag": "p",
      "text": "Step2：KV manager分配逻辑块、计算slot。"
    },
    {
      "tag": "figcaption",
      "text": "Step2 KV分配示意"
    },
    {
      "tag": "p",
      "text": "Step3： Model runner分配KV cache"
    },
    {
      "tag": "figcaption",
      "text": "Step3 KV Cache分配示意"
    },
    {
      "tag": "p",
      "text": "Step4： Decoding生成新token，并更新ids、positions、slot_mapping数据。该过程需要迭代多次。"
    },
    {
      "tag": "figcaption",
      "text": "Step4 Decoding示意"
    },
    {
      "tag": "p",
      "text": "示例中KV manager的逻辑块是连续的，而物理块在model runner中不连续。"
    },
    {
      "tag": "p",
      "text": "从模型输出的logits到token id，要经过采样(sampling)计算。"
    },
    {
      "tag": "p",
      "text": "Step5：将token id还原成词(De-Tokenization)。"
    },
    {
      "tag": "figcaption",
      "text": "Step5 De-Tokenization示意"
    },
    {
      "tag": "h2",
      "text": "5 概念与关键特性"
    },
    {
      "tag": "li",
      "text": "关键特性与相关术语（如TTFT/TPOT）推荐阅读："
    },
    {
      "tag": "li",
      "text": "投机推理(speculative decoding)："
    },
    {
      "tag": "li",
      "text": "推理采样："
    },
    {
      "tag": "li",
      "text": "Multi-Lora服务："
    },
    {
      "tag": "li",
      "text": "自动前缀匹配(APC):"
    },
    {
      "tag": "li",
      "text": "Chunked Prefill&FLashDecoding："
    },
    {
      "tag": "li",
      "text": "并行优化基础："
    },
    {
      "tag": "p",
      "text": "vLLM的框架其它内容参看："
    },
    {
      "tag": "blockquote",
      "text": "想深耕AI Infra领域？欢迎访问InfraTech库！内容涵盖大模型基础、PyTorch/vLLM/SGLang框架入门、性能加速等核心方向，配套50+知识干货及适合初学者的notebook练习。"
    },
    {
      "tag": "p",
      "text": "欢迎点赞、关注、留言讨论。 @kaiyuan"
    },
    {
      "tag": "h2",
      "text": "参考"
    },
    {
      "tag": "li",
      "text": "^https://docs.vllm.ai/en/latest/"
    },
    {
      "tag": "li",
      "text": "^https://github.com/vllm-project/vllm"
    },
    {
      "tag": "li",
      "text": "^https://blog.vllm.ai/"
    },
    {
      "tag": "li",
      "text": "^https://zhuanlan.zhihu.com/p/1894423873145004335"
    },
    {
      "tag": "li",
      "text": "^https://zhuanlan.zhihu.com/p/1900957007575511876"
    },
    {
      "tag": "li",
      "text": "^https://zhuanlan.zhihu.com/p/1983137653336585901"
    },
    {
      "tag": "li",
      "text": "^https://zhuanlan.zhihu.com/p/1896927732027335111"
    },
    {
      "tag": "li",
      "text": "^https://zhuanlan.zhihu.com/p/1954128446398633139"
    }
  ],
  "images": [
    {
      "src": "https://pic4.zhimg.com/v2-2fd218f425161bbee18327321377b327_r.jpg",
      "alt": "",
      "width": 1440,
      "height": 3464
    },
    {
      "src": "https://pic3.zhimg.com/v2-541617787a9ead90944a74374d6d5a16_r.jpg",
      "alt": "",
      "width": 1105,
      "height": 280
    },
    {
      "src": "https://pic3.zhimg.com/v2-1b96921220c80e061c475634e10104ea_r.jpg",
      "alt": "",
      "width": 1440,
      "height": 441
    },
    {
      "src": "https://pic4.zhimg.com/v2-240f596c520af982ddb7069095c8475f_r.jpg",
      "alt": "",
      "width": 762,
      "height": 474
    },
    {
      "src": "https://pic4.zhimg.com/v2-2627b373ac28f3a22c7094ed11600f2d_r.jpg",
      "alt": "",
      "width": 1129,
      "height": 912
    },
    {
      "src": "https://pica.zhimg.com/v2-bb2ed018abbda35ed33176583d2b70ee_r.jpg",
      "alt": "",
      "width": 1269,
      "height": 475
    },
    {
      "src": "https://pic2.zhimg.com/v2-875294cb4d3293430a24c4e4efeefc4d_r.jpg",
      "alt": "",
      "width": 1330,
      "height": 793
    },
    {
      "src": "https://picx.zhimg.com/v2-d6a836de5d852cbd343b0e68650b23af_r.jpg",
      "alt": "",
      "width": 1069,
      "height": 481
    },
    {
      "src": "https://pic2.zhimg.com/v2-c9c366b22c4bbb1c16ae8cae937d4eb7_r.jpg",
      "alt": "",
      "width": 1045,
      "height": 235
    },
    {
      "src": "https://picx.zhimg.com/v2-320c5d282e26e8fd18262c29d2adb3a7_b.jpg",
      "alt": "动图封面",
      "width": 600,
      "height": 349
    },
    {
      "src": "https://pic1.zhimg.com/v2-c86ef2055b096ac5ee8c0ae0b2cb3358_r.jpg",
      "alt": "",
      "width": 1303,
      "height": 363
    },
    {
      "src": "https://pic3.zhimg.com/v2-f17fb7e55115c2ae7fcb8ed026173058_r.jpg",
      "alt": "",
      "width": 1366,
      "height": 551
    },
    {
      "src": "https://pic1.zhimg.com/v2-41db92a2cf13be6695a6eecdcb63b8e0_r.jpg",
      "alt": "",
      "width": 1440,
      "height": 2212
    },
    {
      "src": "https://picx.zhimg.com/v2-9ccd7b7226fe4105631ff4304784d4f7.gif?source=7e7ef6e2",
      "alt": "",
      "width": 897,
      "height": 554
    },
    {
      "src": "https://pica.zhimg.com/v2-17a8bb267df5a7afdb0a261cdec7f4b6_b.jpg",
      "alt": "动图封面",
      "width": 600,
      "height": 334
    },
    {
      "src": "https://picx.zhimg.com/v2-eefbaead8f4d070e2b5c3834a1ed69df_b.jpg",
      "alt": "动图封面",
      "width": 600,
      "height": 318
    },
    {
      "src": "https://pic2.zhimg.com/v2-d7d7975afcef0d34eee6d5f4973cb6e3_r.jpg",
      "alt": "",
      "width": 1440,
      "height": 511
    },
    {
      "src": "https://pic2.zhimg.com/v2-8a9dcac89035c174e49c5f0bef7afb4f_r.jpg",
      "alt": "",
      "width": 1097,
      "height": 190
    },
    {
      "src": "https://pica.zhimg.com/v2-cf19c05f755724e2762479d017e276a6_r.jpg",
      "alt": "",
      "width": 1349,
      "height": 628
    },
    {
      "src": "https://pic3.zhimg.com/v2-6181fc87df37a241b706e1476d88b80e_r.jpg",
      "alt": "",
      "width": 1224,
      "height": 532
    },
    {
      "src": "https://picx.zhimg.com/v2-81c9aceb24440d2dd54b58bce9905f7b_r.jpg",
      "alt": "",
      "width": 813,
      "height": 263
    },
    {
      "src": "https://pic2.zhimg.com/v2-63dd3bce01331c1cbac293fe51935e8d_r.jpg",
      "alt": "",
      "width": 960,
      "height": 289
    },
    {
      "src": "https://pica.zhimg.com/v2-ce64a92e12e39fb37f88a52183e80c32_r.jpg",
      "alt": "",
      "width": 1112,
      "height": 716
    },
    {
      "src": "https://pic1.zhimg.com/v2-de817cf81d97a03250793e73cd676d0a_r.jpg",
      "alt": "",
      "width": 1339,
      "height": 490
    },
    {
      "src": "https://pic1.zhimg.com/v2-6e30fb8051716927d32b368428cdb08a_r.jpg",
      "alt": "",
      "width": 1220,
      "height": 569
    },
    {
      "src": "https://pic4.zhimg.com/v2-575bc6074232352cb6aeb9ec5a4ccdd1_r.jpg",
      "alt": "",
      "width": 1242,
      "height": 638
    },
    {
      "src": "https://pica.zhimg.com/v2-62c8e41aa612c81a6317239216470732_r.jpg",
      "alt": "",
      "width": 917,
      "height": 397
    },
    {
      "src": "https://pica.zhimg.com/v2-5c33090efacfb534346fdde8554c8c44_r.jpg",
      "alt": "",
      "width": 642,
      "height": 440
    },
    {
      "src": "https://picx.zhimg.com/v2-932106b42a2188d44bbbcdc286217515.jpg?source=7e7ef6e2&needBackground=1",
      "alt": "",
      "width": 1130,
      "height": 518
    },
    {
      "src": "https://pic1.zhimg.com/v2-71a0970082de04780a2bca6ff020e19d.jpg?source=7e7ef6e2&needBackground=1",
      "alt": "",
      "width": 1926,
      "height": 842
    },
    {
      "src": "https://pic1.zhimg.com/v2-9ff9520a019a48851c2bded8566c61ff.jpg?source=7e7ef6e2&needBackground=1",
      "alt": "",
      "width": 1219,
      "height": 474
    },
    {
      "src": "https://picx.zhimg.com/v2-aa59122fe4d9bdf2694a54ae4990ffc3.jpg?source=7e7ef6e2&needBackground=1",
      "alt": "",
      "width": 1043,
      "height": 584
    },
    {
      "src": "https://picx.zhimg.com/v2-52534dc942694d45fb0e1d08086d8f31.jpg?source=7e7ef6e2&needBackground=1",
      "alt": "",
      "width": 1181,
      "height": 359
    },
    {
      "src": "https://picx.zhimg.com/v2-1c689ede21ed5879adcc17c00ae8f777.jpg?source=7e7ef6e2&needBackground=1",
      "alt": "",
      "width": 1477,
      "height": 748
    },
    {
      "src": "https://pic1.zhimg.com/v2-7a148edaef14d047dd0b0f4a694ad786.jpg?source=7e7ef6e2&needBackground=1",
      "alt": "",
      "width": 1255,
      "height": 726
    },
    {
      "src": "https://pic1.zhimg.com/v2-f9e3e6f8051a9edc65c5df5de61701f3.jpg?source=7e7ef6e2&needBackground=1",
      "alt": "",
      "width": 1048,
      "height": 1017
    }
  ],
  "links": [
    {
      "href": "https://zhuanlan.zhihu.com/p/1984742841528902530#ref_1",
      "text": "[1]",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1984742841528902530#ref_2",
      "text": "[2]",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1984742841528902530#ref_3",
      "text": "[3]",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=LLM%E6%8E%A8%E7%90%86%E6%A1%86%E6%9E%B6&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJMTE3mjqjnkIbmoYbmnrYiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.S7OkQ9-ZuVim9iwVs7AUsc683rn4diPdXQkEs07HvWg&zhida_source=entity",
      "text": "LLM推理框架",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=TensorFlow&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJUZW5zb3JGbG93IiwiemhpZGFfc291cmNlIjoiZW50aXR5IiwiY29udGVudF9pZCI6MjY3Nzk5MDU4LCJjb250ZW50X3R5cGUiOiJBcnRpY2xlIiwibWF0Y2hfb3JkZXIiOjEsInpkX3Rva2VuIjpudWxsfQ.BK5SdkAwYPBUJoSdvV94v1lg3uhDRPzTeORqbRLaWK8&zhida_source=entity",
      "text": "TensorFlow",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E5%A4%A7%E8%AF%AD%E8%A8%80%E6%A8%A1%E5%9E%8B&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLlpKfor63oqIDmqKHlnosiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.N6Z9uJwl71EmFDcyMfddtWGNUFy0H6uBT9ZXC9vN_vo&zhida_source=entity",
      "text": "大语言模型",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E8%B6%85%E6%98%BE%E5%AD%98&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLotoXmmL7lrZgiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.dY3dNlaaMLbERG-akObjkWojp4DUAl1FD_-ARyOqeM0&zhida_source=entity",
      "text": "超显存",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E6%8E%A8%E7%90%86%E6%9C%8D%E5%8A%A1&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLmjqjnkIbmnI3liqEiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.yzu1V2BcxXwKK0zbmb-7z3QCzXr3MSHQPFMHsvWrjc4&zhida_source=entity",
      "text": "推理服务",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=API+server&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJBUEkgc2VydmVyIiwiemhpZGFfc291cmNlIjoiZW50aXR5IiwiY29udGVudF9pZCI6MjY3Nzk5MDU4LCJjb250ZW50X3R5cGUiOiJBcnRpY2xlIiwibWF0Y2hfb3JkZXIiOjEsInpkX3Rva2VuIjpudWxsfQ.NVGLjfwmpCz5VyHO6cL31zaMRS-dJagnAUe6h94is9A&zhida_source=entity",
      "text": "API server",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=Tensorflow&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJUZW5zb3JmbG93IiwiemhpZGFfc291cmNlIjoiZW50aXR5IiwiY29udGVudF9pZCI6MjY3Nzk5MDU4LCJjb250ZW50X3R5cGUiOiJBcnRpY2xlIiwibWF0Y2hfb3JkZXIiOjEsInpkX3Rva2VuIjpudWxsfQ.15DyuQlVkIe31PDlGrXJPD-h9LKyib3G_UhFm3Ucpr4&zhida_source=entity",
      "text": "Tensorflow",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=Triton&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJUcml0b24iLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.KLYWvc4NUuE5kgnogxpJiEJ_41g-Dz8_LcsrIh759r8&zhida_source=entity",
      "text": "Triton",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E8%B4%9F%E8%BD%BD&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLotJ_ovb0iLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.2mwe-OPT3WZ9FV69-aLuBsqjbJni1_kOH60opC_kYEE&zhida_source=entity",
      "text": "负载",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E8%87%AA%E5%9B%9E%E5%BD%92%E6%A8%A1%E5%9E%8B&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLoh6rlm57lvZLmqKHlnosiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.XFmP0iCcGH22-kqm_qHS0txsAQuTHXKqhz5du5tfxIk&zhida_source=entity",
      "text": "自回归模型",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E6%8E%A8%E7%90%86%E5%BC%95%E6%93%8E&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLmjqjnkIblvJXmk44iLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.IevfbuwcSQK9zAIvhsmCQyVdCkV-WTiHsSLS2MHCJnE&zhida_source=entity",
      "text": "推理引擎",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E6%98%BE%E5%AD%98%E7%AE%A1%E7%90%86&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLmmL7lrZjnrqHnkIYiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.APUyX4BEITJJ26Wtw6ARUFdYYz-AARHnTsfcs8kodiw&zhida_source=entity",
      "text": "显存管理",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E6%89%A7%E8%A1%8C%E5%99%A8&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLmiafooYzlmagiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.kcA-KOr7GGsW4hhrsAb4Jg1CTQzBOKHyYuLd-0E4Jiw&zhida_source=entity",
      "text": "执行器",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=CPU&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJDUFUiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.1upldKZyyrBOFusiDbRnhQCOqyUwlwwDHD5R8PPWlM8&zhida_source=entity",
      "text": "CPU",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E5%BC%82%E6%AD%A5%E6%B5%81%E7%A8%8B&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLlvILmraXmtYHnqIsiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.k0l6YelzvGXwbgltjcij37mVjW6Eja2t8MM1N60gATE&zhida_source=entity",
      "text": "异步流程",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=GPU&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJHUFUiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.BfkdupNJa7r-MLuQEfYkPNaKfkdI3Vp_iGR_n_T0sR0&zhida_source=entity",
      "text": "GPU",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=API+Server&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJBUEkgU2VydmVyIiwiemhpZGFfc291cmNlIjoiZW50aXR5IiwiY29udGVudF9pZCI6MjY3Nzk5MDU4LCJjb250ZW50X3R5cGUiOiJBcnRpY2xlIiwibWF0Y2hfb3JkZXIiOjEsInpkX3Rva2VuIjpudWxsfQ.-v68vfbT72YN04dWUSBNPit29cSgRhtAw2KC_jkcsCg&zhida_source=entity",
      "text": "API Server",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=OpenAI&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJPcGVuQUkiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.kHu1FLfCa4E5iZLBV6wQ6hac9qXZN16jWm_4GX8mIvw&zhida_source=entity",
      "text": "OpenAI",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=executor&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJleGVjdXRvciIsInpoaWRhX3NvdXJjZSI6ImVudGl0eSIsImNvbnRlbnRfaWQiOjI2Nzc5OTA1OCwiY29udGVudF90eXBlIjoiQXJ0aWNsZSIsIm1hdGNoX29yZGVyIjoxLCJ6ZF90b2tlbiI6bnVsbH0.q6Amhi_pYb7TLD4FRNBmLRP7vP45v5_HX1f1jP05TdI&zhida_source=entity",
      "text": "executor",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1894423873145004335",
      "text": "vLLM框架V1演进分析",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1984742841528902530#ref_4",
      "text": "[4]",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E7%BA%BF%E7%A8%8B&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLnur_nqIsiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.B9K5bElGfDvZeh9NZt7RXKXA8yRspCvrMIomWNm1dTo&zhida_source=entity",
      "text": "线程",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E5%BE%AA%E7%8E%AF%E7%BA%BF%E7%A8%8B&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLlvqrnjq_nur_nqIsiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.h4ikikX8SdbTvFGgMLjs5iBb8ukN4p60oTWxmaXmYsI&zhida_source=entity",
      "text": "循环线程",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E8%AE%A1%E7%AE%97%E5%AF%86%E9%9B%86&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLorqHnrpflr4bpm4YiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.wDQP0nJ6Gq3Tz8c4vZyoLJfCeedVL4jWSLnzBxHQYd0&zhida_source=entity",
      "text": "计算密集",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E8%AE%BF%E5%AD%98%E5%AF%86%E9%9B%86&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLorr_lrZjlr4bpm4YiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.4nsrLjIzXP1nLwHbr_WhZOX2gJhzQieRJO0VMAw7Xyw&zhida_source=entity",
      "text": "访存密集",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=3&q=scheduler&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJzY2hlZHVsZXIiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MywiemRfdG9rZW4iOm51bGx9._mqGYCjxyk8ffxd_wcDfC68hlX2QKcxxjEGj8w0REqA&zhida_source=entity",
      "text": "scheduler",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=FCFS&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJGQ0ZTIiwiemhpZGFfc291cmNlIjoiZW50aXR5IiwiY29udGVudF9pZCI6MjY3Nzk5MDU4LCJjb250ZW50X3R5cGUiOiJBcnRpY2xlIiwibWF0Y2hfb3JkZXIiOjEsInpkX3Rva2VuIjpudWxsfQ.rGJxX6akOft2mMPMxNZt0NZBzMTphidPcazGcgpJ50Q&zhida_source=entity",
      "text": "FCFS",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=2&q=waiting%E9%98%9F%E5%88%97&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJ3YWl0aW5n6Zif5YiXIiwiemhpZGFfc291cmNlIjoiZW50aXR5IiwiY29udGVudF9pZCI6MjY3Nzk5MDU4LCJjb250ZW50X3R5cGUiOiJBcnRpY2xlIiwibWF0Y2hfb3JkZXIiOjIsInpkX3Rva2VuIjpudWxsfQ.DAn_GdHvKy0D4ViDE0OzjCxT3Qskp78dJJbxpgjQ96c&zhida_source=entity",
      "text": "waiting队列",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1984742841528902530#ref_5",
      "text": "[5]",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1988193790129902960",
      "text": "vLLM Scheduler逻辑难啃？先手搓一个基础调度器265 赞同 · 13 评论 文章",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=KV%E5%80%BC&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJLVuWAvCIsInpoaWRhX3NvdXJjZSI6ImVudGl0eSIsImNvbnRlbnRfaWQiOjI2Nzc5OTA1OCwiY29udGVudF90eXBlIjoiQXJ0aWNsZSIsIm1hdGNoX29yZGVyIjoxLCJ6ZF90b2tlbiI6bnVsbH0.cT3q_jz8of8CQOCh1ewVEw7_kfp8SDkrkUZh3SewuDY&zhida_source=entity",
      "text": "KV值",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E5%89%8D%E7%BC%80%E6%A0%91&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLliY3nvIDmoJEiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.Wq66Dr0ikSmaLj6uo63BWy3ibwlJsWrqtPBX6fTz6qA&zhida_source=entity",
      "text": "前缀树",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1984742841528902530#ref_6",
      "text": "[6]",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E7%89%A9%E7%90%86%E5%B1%82&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLniannkIblsYIiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.xbvUaCE8rIwQJdDULSv5hiLZahk5khOwxkCbEtFZaO8&zhida_source=entity",
      "text": "物理层",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E7%AE%A1%E7%90%86%E5%8D%95%E5%85%83&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLnrqHnkIbljZXlhYMiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.5O2E9H9JxdpOQ-I-5wRbTi9RkDRbNFcHzt1Wg2kTXw8&zhida_source=entity",
      "text": "管理单元",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E9%93%BE%E8%A1%A8&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLpk77ooagiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.-EsktRg9s8tU45lAJCzjZyJCcB0DDUTHaB9F_zaXnSg&zhida_source=entity",
      "text": "链表",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E6%98%A0%E5%B0%84%E8%A1%A8&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLmmKDlsITooagiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.6V1HX0DBD2VmmSXCMiNf6kN8kZLN43m4-VYX0M_XTq8&zhida_source=entity",
      "text": "映射表",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=tensor&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJ0ZW5zb3IiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.XTRuW6XHXd_4_twRkdEmHlNc54yjpUyiSy0xb6QR1Wo&zhida_source=entity",
      "text": "tensor",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=2&q=slot_mapping&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJzbG90X21hcHBpbmciLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MiwiemRfdG9rZW4iOm51bGx9.uni2Blk_Q_WoTt_kd_apDlPKy6kEaJtxooeR2exwCGU&zhida_source=entity",
      "text": "slot_mapping",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E5%8F%8C%E5%90%91%E9%93%BE%E8%A1%A8&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLlj4zlkJHpk77ooagiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.q4NucPhuxStMeoLsnK3EcVxeb7zuAGhQV-5t_McoO8s&zhida_source=entity",
      "text": "双向链表",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1984742841528902530#ref_7",
      "text": "[7]",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1954128446398633139",
      "text": "vLLM V1 KV cache 管理机制剖析",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1984742841528902530#ref_8",
      "text": "[8]",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=Attention%E6%A8%A1%E5%9D%97&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJBdHRlbnRpb27mqKHlnZciLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.y9vuUi-da_xv_PinFxV-e8sNcA0hdveHj4U6si-cQuM&zhida_source=entity",
      "text": "Attention模块",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=Q%E5%80%BC&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJR5YC8IiwiemhpZGFfc291cmNlIjoiZW50aXR5IiwiY29udGVudF9pZCI6MjY3Nzk5MDU4LCJjb250ZW50X3R5cGUiOiJBcnRpY2xlIiwibWF0Y2hfb3JkZXIiOjEsInpkX3Rva2VuIjpudWxsfQ.kn1l4bLdQXPIYb6_lSQB7Ub0Eu8SWd_bTMXD4qbyNOM&zhida_source=entity",
      "text": "Q值",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=Cache&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJDYWNoZSIsInpoaWRhX3NvdXJjZSI6ImVudGl0eSIsImNvbnRlbnRfaWQiOjI2Nzc5OTA1OCwiY29udGVudF90eXBlIjoiQXJ0aWNsZSIsIm1hdGNoX29yZGVyIjoxLCJ6ZF90b2tlbiI6bnVsbH0.kjQqwiatur9XBQlJAKQSUNt1ANw_Drn2W_ETKMXjzLo&zhida_source=entity",
      "text": "Cache",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=Metadata&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJNZXRhZGF0YSIsInpoaWRhX3NvdXJjZSI6ImVudGl0eSIsImNvbnRlbnRfaWQiOjI2Nzc5OTA1OCwiY29udGVudF90eXBlIjoiQXJ0aWNsZSIsIm1hdGNoX29yZGVyIjoxLCJ6ZF90b2tlbiI6bnVsbH0.XxhClL-GXMSFZqBnY17IYY_WRxoi6WnE7p65Kpm8HKM&zhida_source=entity",
      "text": "Metadata",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E5%85%83%E6%95%B0%E6%8D%AE&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLlhYPmlbDmja4iLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.rJUfHN5btx3Rq7OE-TSCL92hcP6C_cMC0QU6VyOtFkU&zhida_source=entity",
      "text": "元数据",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=Backend&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJCYWNrZW5kIiwiemhpZGFfc291cmNlIjoiZW50aXR5IiwiY29udGVudF9pZCI6MjY3Nzk5MDU4LCJjb250ZW50X3R5cGUiOiJBcnRpY2xlIiwibWF0Y2hfb3JkZXIiOjEsInpkX3Rva2VuIjpudWxsfQ.rzQeImOgniitbuBE9Rvoghi6UwtSCb2_lJVogdkAe5g&zhida_source=entity",
      "text": "Backend",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=Attention%E7%AE%97%E5%AD%90&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJBdHRlbnRpb27nrpflrZAiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.aBObr7eSVFdD97cyBxsXCv2oQbuFMHRtt5MVIlZstPg&zhida_source=entity",
      "text": "Attention算子",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E6%95%B0%E6%8D%AE%E5%A4%84%E7%90%86&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLmlbDmja7lpITnkIYiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.w2FdC-NIKshrxkxMEmJONrGv_LI4mnibIfsINRHc5pQ&zhida_source=entity",
      "text": "数据处理",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E6%95%B0%E6%8D%AE%E6%B5%81&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLmlbDmja7mtYEiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.s1_8EDntip-30GG2nqFsPmjrG0dfZmW0vPsPjRNoYqk&zhida_source=entity",
      "text": "数据流",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=3&q=kv+cache&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJrdiBjYWNoZSIsInpoaWRhX3NvdXJjZSI6ImVudGl0eSIsImNvbnRlbnRfaWQiOjI2Nzc5OTA1OCwiY29udGVudF90eXBlIjoiQXJ0aWNsZSIsIm1hdGNoX29yZGVyIjozLCJ6ZF90b2tlbiI6bnVsbH0.9c1cnOJWYLWZ26O7kiFJCujGz3iKNw-MxoFf_kLcMHU&zhida_source=entity",
      "text": "kv cache",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=attention%E7%AE%97%E5%AD%90&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJhdHRlbnRpb27nrpflrZAiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.iq1wxTsVybkydp2orcTxYNoLJFkJo1cqrkfVNvmqF2k&zhida_source=entity",
      "text": "attention算子",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=%E7%89%A9%E7%90%86%E5%9D%97&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiLniannkIblnZciLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.OQ2FN9DDD_DpHY-mVg1-qVu62GZHEuU8vaF5MEZLqi4&zhida_source=entity",
      "text": "物理块",
      "isExternal": false
    },
    {
      "href": "https://zhida.zhihu.com/search?content_id=267799058&content_type=Article&match_order=1&q=logits&zd_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ6aGlkYV9zZXJ2ZXIiLCJleHAiOjE3ODgzMjI5OTgsInEiOiJsb2dpdHMiLCJ6aGlkYV9zb3VyY2UiOiJlbnRpdHkiLCJjb250ZW50X2lkIjoyNjc3OTkwNTgsImNvbnRlbnRfdHlwZSI6IkFydGljbGUiLCJtYXRjaF9vcmRlciI6MSwiemRfdG9rZW4iOm51bGx9.-hlDTOKoOgQHApR9nxXpsOyVeM1NuQKLa4lIq1ypi3s&zhida_source=entity",
      "text": "logits",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1983137653336585901",
      "text": "大模型推理核心概念与术语总结297 赞同 · 23 评论 文章",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1978037808544370747",
      "text": "LLM提速利器：投机推理的原理与常见方案106 赞同 · 15 评论 文章",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1981752176578667658",
      "text": "LLM推理采样(Sampling)常见知识概览98 赞同 · 9 评论 文章",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1984729458444363168",
      "text": "从LoRA到Multi-LoRA：原理&代码实践77 赞同 · 4 评论 文章",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1896927732027335111",
      "text": "vLLM的prefix cache为何零开销378 赞同 · 34 评论 文章",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1988996116017086993",
      "text": "推理长序列利器：ChunkedPrefill&FlashDecoding原理详解110 赞同 · 18 评论 文章",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1937449564509545940",
      "text": "LLM推理并行优化的必备知识381 赞同 · 16 评论 文章",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1954137524881580796",
      "text": "LLM推理知识指南---kaiyuan227 赞同 · 6 评论 文章",
      "isExternal": false
    },
    {
      "href": "https://link.zhihu.com/?target=https%3A//github.com/CalvinXKY/InfraTech",
      "text": "InfraTech",
      "isExternal": false
    },
    {
      "href": "https://www.zhihu.com/people/da4e6b50eb50d6f120b604f6cf15b33e",
      "text": "@kaiyuan",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1984742841528902530#ref_1_0",
      "text": "^",
      "isExternal": false
    },
    {
      "href": "https://docs.vllm.ai/en/latest/",
      "text": "https://docs.vllm.ai/en/latest/",
      "isExternal": true
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1984742841528902530#ref_2_0",
      "text": "^",
      "isExternal": false
    },
    {
      "href": "https://github.com/vllm-project/vllm",
      "text": "https://github.com/vllm-project/vllm",
      "isExternal": true
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1984742841528902530#ref_3_0",
      "text": "^",
      "isExternal": false
    },
    {
      "href": "https://blog.vllm.ai/",
      "text": "https://blog.vllm.ai/",
      "isExternal": true
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1984742841528902530#ref_4_0",
      "text": "^",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1984742841528902530#ref_5_0",
      "text": "^",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1900957007575511876",
      "text": "https://zhuanlan.zhihu.com/p/1900957007575511876",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1984742841528902530#ref_6_0",
      "text": "^",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1984742841528902530#ref_7_0",
      "text": "^",
      "isExternal": false
    },
    {
      "href": "https://zhuanlan.zhihu.com/p/1984742841528902530#ref_8_0",
      "text": "^",
      "isExternal": false
    }
  ]
};
