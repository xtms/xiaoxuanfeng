import { CodeBlock, Callout, ResourceTable } from '../components/CodeBlock';
import { MermaidDiagram } from '../components/MermaidDiagram';

export function AttentionCloseReadingPage() {
  return (
    <div className="prose max-w-none">
      <h1>🧠 Attention Is All You Need (Transformer) 论文精读</h1>
      <p>
        <strong>原文作者：</strong>Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones,
        Aidan N. Gomez, Łukasz Kaiser, Illia Polosukhin
      </p>
      <p>
        <strong>精读作者：</strong>周弈帆 | 发表于 2022-11-12 | 分类于 记录，论文阅读
      </p>
      <p>
        原文链接：
        <a href="https://zhouyifan.net/2022/11/12/20220925-Transformer/" target="_blank" rel="noreferrer">
          zhouyifan.net/2022/11/12/20220925-Transformer/
        </a>
      </p>

      <Callout type="tip">
        <strong>导读：</strong>Attention Is All You Need (Transformer) 是当今深度学习初学者必读的一篇论文。但是，这篇工作当时主要是用于解决机器翻译问题，有一定的写作背景，对没有相关背景知识的初学者来说十分难读懂。在这篇文章里，我将先补充背景知识，再清晰地解读一下这篇论文，保证让大多数对深度学习仅有少量基础的读者也能彻底读懂这篇论文。
      </Callout>

      <h2>1. 知识准备</h2>
      <p>
        机器翻译，就是将某种语言的一段文字翻译成另一段文字。
      </p>
      <p>
        由于翻译没有唯一的正确答案，用准确率来衡量一个机器翻译算法并不合适。因此，机器翻译的数据集通常会为每一条输入准备若干个参考输出。统计算法输出和参考输出之间的重复程度，就能评价算法输出的好坏了。这种评价指标叫做 <strong>BLEU Score</strong>。这一指标越高越好。
      </p>
      <p>
        在深度学习时代早期，人们使用 RNN（循环神经网络）来处理机器翻译任务。一段输入先是会被预处理成一个 token 序列。RNN 会对每个 token 逐个做计算，并维护一个表示整段文字整体信息的状态。根据当前时刻的状态，RNN 可以输出当前时刻的一个 token。
      </p>
      <p>
        所谓 token，既可以是一个单词、一个汉字，也可能是一个表示空白字符、未知字符、句首字符的特殊字符。
      </p>
      <p>
        具体来说，在第 t 轮计算中，输入是上一轮的状态 a<sup>&lt;t-1&gt;</sup> 以及这一轮的输入 token x<sup>&lt;t&gt;</sup>，输出这一轮的状态 a<sup>&lt;t&gt;</sup> 以及这一轮的输出 token y<sup>&lt;t&gt;</sup>。
      </p>
      <p>
        这种简单的 RNN 架构仅适用于输入和输出等长的任务。然而，大多数情况下，机器翻译的输出和输入都不是等长的。因此，人们使用了一种新的架构。前半部分的 RNN 只有输入，后半部分的 RNN 只有输出（上一轮的输出会当作下一轮的输入以补充信息）。两个部分通过一个状态 a<sup>&lt;T<sub>x</sub>&gt;</sup> 来传递信息。把该状态看成输入信息的一种编码的话，前半部分可以叫做"编码器"，后半部分可以叫做"解码器"。这种架构因而被称为 <strong>"编码器-解码器"架构</strong>。
      </p>
      <p>
        这种架构存在不足：编码器和解码器之间只通过一个隐状态来传递信息。在处理较长的文章时，这种架构的表现不够理想。为此，有人提出了基于注意力的架构。这种架构依然使用了编码器和解码器，只不过解码器的输入是编码器的状态的加权和，而不再是一个简单的中间状态。每一个输出对每一个输入的权重叫做注意力，注意力的大小取决于输出和输入的相关关系。这种架构优化了编码器和解码器之间的信息交流方式，在处理长文章时更加有效。
      </p>
      <p>
        尽管注意力模型的表现已经足够优秀，但所有基于 RNN 的模型都面临着同样一个问题：RNN 本轮的输入状态取决于上一轮的输出状态，这使 RNN 的计算必须串行执行。因此，<strong>RNN 的训练通常比较缓慢</strong>。
      </p>
      <p>
        在这一背景下，抛弃 RNN，只使用注意力机制的 Transformer 横空出世了。
      </p>

      <MermaidDiagram chart={`
flowchart LR
  subgraph RNN["基础 RNN (等长序列)"]
    direction LR
    X1["x&lt;1&gt;"] --> A1["a&lt;1&gt;"] --> Y1["y&lt;1&gt;"]
    X2["x&lt;2&gt;"] --> A2["a&lt;2&gt;"] --> Y2["y&lt;2&gt;"]
    X3["x&lt;3&gt;"] --> A3["a&lt;3&gt;"] --> Y3["y&lt;3&gt;"]
    A1 --> A2 --> A3
  end

  subgraph ENCDEC["编码器-解码器 (不等长序列)"]
    direction LR
    EX1["x&lt;1&gt;"] --> EA1["a&lt;1&gt;"]
    EX2["x&lt;2&gt;"] --> EA2["a&lt;2&gt;"]
    EX3["x&lt;3&gt;"] --> EA3["a&lt;3&gt;"]
    EA1 --> EA2 --> EA3
    EA3 -->|"a&lt;Tx&gt; 隐状态"| DA1["a'&lt;1&gt;"]
    DA1 --> DY1["y&lt;1&gt;"] --> DA2["a'&lt;2&gt;"] --> DY2["y&lt;2&gt;"]
    DY1 -.->|"上一轮输出"| DA2
  end
      `} />

      <p className="text-center text-sm text-gray-500">▲ 上：基础 RNN 架构（等长序列） | 下：编码器-解码器架构（不等长序列）</p>

      <h2>2. 摘要与引言</h2>
      <p>
        补充完了背景知识，文章就读起来比较轻松了。
      </p>

      <h3>摘要</h3>
      <p>
        摘要传递的信息非常简练：
      </p>
      <ul>
        <li>当前最好的架构是基于注意力的"encoder-decoder"架构。这些架构都使用了 CNN 或 RNN。</li>
        <li>这篇文章提出的 Transformer 架构<strong>仅使用了注意力机制，而无需使用 CNN 和 RNN</strong>。</li>
        <li>两项机器翻译的实验表明，这种架构不仅精度高，而且训练时间大幅缩短。</li>
      </ul>
      <p>摘要并没有解释 Transformer 的设计动机。让我们在引言中一探究竟。</p>

      <h3>引言</h3>
      <p>
        引言的第一段回顾了 RNN 架构。以 LSTM 和 GRU 为代表的 RNN 在多项序列任务中取得顶尖的成果。许多研究仍在拓宽循环语言模型和"encoder-decoder"架构的能力边界。
      </p>
      <p>
        第二段就开始讲 RNN 的不足了。RNN 要维护一个隐状态，该隐状态取决于上一时刻的隐状态。这种内在的串行计算特质阻碍了训练时的并行计算（特别是训练序列较长时，每一个句子占用的存储更多，batch size 变小，并行度降低）。有许多研究都在尝试解决这一问题，但是，<strong>串行计算的本质是无法改变的</strong>。
      </p>
      <p>
        上一段暗示了 Transformer 的第一个设计动机：<strong>提升训练的并行度</strong>。第三段讲了 Transformer 的另一个设计动机：注意力机制。注意力机制是当时最顶尖的模型中不可或缺的组件。这一机制可以让每对输入输出关联起来，而不用像早期使用一个隐状态传递信息的"encoder-decoder"模型一样，受到序列距离的限制。然而，几乎所有的注意力机制都用在 RNN 上的。
      </p>
      <p>
        既然注意力机制能够无视序列的先后顺序，捕捉序列间的关系，为什么不只用这种机制来构造一个适用于并行计算的模型呢？因此，在这篇文章中，作者提出了 Transformer 架构。这一架构规避了 RNN 的使用，完全使用注意力机制来捕捉输入输出序列之间的依赖关系。这种架构不仅训练得更快了，表现还更强了。
      </p>

      <Callout type="tip">
        <strong>小结：</strong>通过阅读摘要和引言，我们基本理解了 Transformer 架构的设计动机。作者想克服 RNN 不能并行的缺点，又想充分利用没有串行限制的注意力机制，于是就提出了一个只有注意力机制的模型。模型训练出来了，结果出乎预料地好，不仅训练速度大幅加快，模型的表现也超过了当时所有其他模型。接下来，我们可以直接跳到第三章学习 Transformer 的结构。
      </Callout>

      <h2>3. 注意力机制</h2>
      <p>
        文章在介绍 Transformer 的架构时，是自顶向下介绍的。但是，一开始我们并不了解 Transformer 的各个模块，理解整体框架时会有不少的阻碍。因此，我们可以<strong>自底向上</strong>地来学习 Transformer 架构。
      </p>
      <p>
        首先，跳到 3.2 节，这一节介绍了 Transformer 里最核心的机制——注意力。在阅读这部分的文字之前，我们先抽象地理解一下注意力机制究竟是在做什么。
      </p>

      <h3>3.1 注意力计算的一个例子</h3>
      <p>
        其实，"注意力"这个名字取得非常不易于理解。这个机制应该叫做 <strong>"全局信息查询"</strong>。做一次"注意力"计算，其实就跟去数据库了做了一次查询一样。
      </p>
      <p>
        假设，我们现在有这样一个以人名为 key（键），以年龄为 value（值）的数据库：
      </p>

      <CodeBlock code={`{
    张三: 18,
    张三: 20,
    李四: 22,
    张伟: 19
}`} language="python" title="数据库示例" />

      <p>
        现在，我们有一个 query（查询），问所有叫"张三"的人的年龄平均值是多少。让我们写程序的话，我们会把字符串"张三"和所有 key 做比较，找出所有"张三"的 value，把这些年龄值相加，取一个平均数。这个平均数是 (18+20)/2 = 19。
      </p>
      <p>
        但是，很多时候，我们的查询并不是那么明确。比如，我们可能想查询一下所有姓张的人的年龄平均值。这次，我们不是去比较 <code>key == 张三</code>，而是比较 <code>key[0] == 张</code>。这个平均数应该是 (18+20+19)/3 = 19。
      </p>
      <p>
        或许，我们的查询会更模糊一点，模糊到无法用简单的判断语句来完成。因此，最通用的方法是，把 query 和 key 各建模成一个向量。之后，对 query 和 key 之间算一个相似度（比如向量内积），以这个相似度为权重，算 value 的加权和。这样，不管多么抽象的查询，我们都可以把 query, key 建模成向量，用向量相似度代替查询的判断语句，用加权和代替直接取值再求平均值。<strong>"注意力"，其实指的就是这里的权重</strong>。
      </p>
      <p>
        把这种新方法套入刚刚那个例子里。我们先把所有 key 建模成向量，可能可以得到这样的一个新数据库：
      </p>

      <CodeBlock code={`{
    [1, 2, 0]: 18,    # 张三
    [1, 2, 0]: 20,    # 张三
    [0, 0, 2]: 22,    # 李四
    [1, 4, 0]: 19     # 张伟
}`} language="python" title="Key 向量化" />

      <p>
        假设 <code>key[0] == 1</code> 表示姓张。我们的查询"所有姓张的人的年龄平均值"就可以表示成向量 <code>[1, 0, 0]</code>。用这个 query 和所有 key 算出的权重是：
      </p>

      <CodeBlock code={`dot([1, 0, 0], [1, 2, 0]) = 1
dot([1, 0, 0], [1, 2, 0]) = 1
dot([1, 0, 0], [0, 0, 2]) = 0
dot([1, 0, 0], [1, 4, 0]) = 1`} language="python" title="计算相似度权重" />

      <p>
        之后，我们该用这些权重算平均值了。注意，算平均值时，权重的和应该是 1。因此，我们可以用 softmax 把这些权重归一化一下，再算 value 的加权和。
      </p>

      <CodeBlock code={`softmax([1, 1, 0, 1]) = [1/3, 1/3, 0, 1/3]
dot([1/3, 1/3, 0, 1/3], [18, 20, 22, 19]) = 19`} language="python" title="softmax 归一化 + 加权求和" />

      <p>
        这样，我们就用向量运算代替了判断语句，完成了数据库的全局信息查询。<strong>那三个 1/3，就是 query 对每个 key 的注意力。</strong>
      </p>

      <h3>3.2 Scaled Dot-Product Attention（3.2.1 节）</h3>
      <p>
        我们刚刚完成的计算差不多就是 Transformer 里的注意力，这种计算在论文里叫做<strong>放缩点乘注意力（Scaled Dot-Product Attention）</strong>。它的公式是：
      </p>

      <CodeBlock code={`Attention(Q, K, V) = softmax(QK^T / √d_k) V`} language="python" title="Scaled Dot-Product Attention 公式" />

      <MermaidDiagram chart={`
flowchart LR
  subgraph SDPA["放缩点乘注意力 (图2左)"]
    direction TB
    Q["Q<br/>(n × d_k)"]
    K["K<br/>(n × d_k)"]
    V["V<br/>(n × d_v)"]
    MATMUL1["MatMul<br/>QK^T"]
    SCALE["Scale<br/>÷ √d_k"]
    MASK["Mask (opt.)<br/>上三角 = -∞"]
    SOFTMAX["SoftMax"]
    MATMUL2["MatMul<br/>× V"]
    Q --> MATMUL1
    K --> MATMUL1
    MATMUL1 --> SCALE
    SCALE --> MASK
    MASK --> SOFTMAX
    SOFTMAX --> MATMUL2
    V --> MATMUL2
  end
      `} />

      <p className="text-center text-sm text-gray-500">▲ 论文图 2(左)：放缩点乘注意力 (Scaled Dot-Product Attention)</p>

      <MermaidDiagram chart={`
flowchart LR
  subgraph MHA["多头注意力 (图2右)"]
    direction TB
    QM["Q"]
    KM["K"]
    VM["V"]
    LINEARQ["Linear<br/>d_model → d_k"]
    LINEARK["Linear<br/>d_model → d_k"]
    LINEARV["Linear<br/>d_model → d_v"]
    H1["Scaled Dot-Product<br/>Attention × h"]
    CONCAT["Concat"]
    LINEARO["Linear<br/>h·d_v → d_model"]
    QM --> LINEARQ --> H1
    KM --> LINEARK --> H1
    VM --> LINEARV --> H1
    H1 --> CONCAT --> LINEARO
  end
      `} />

      <p className="text-center text-sm text-gray-500">▲ 论文图 2(右)：多头注意力 (Multi-Head Attention)</p>

      <p>
        我们先来看看 Q, K, V 在刚刚那个例子里究竟是什么。K 比较好理解，K 其实就是 key 向量的数组，也就是：
      </p>

      <CodeBlock code={`K = [[1, 2, 0], [1, 2, 0], [0, 0, 2], [1, 4, 0]]`} language="python" title="K 矩阵" />

      <p>
        同样，V 就是 value 向量的数组。而在我们刚刚那个例子里，value 都是实数。实数其实也就是可以看成长度为 1 的向量。因此，那个例子的 V 应该是：
      </p>

      <CodeBlock code={`V = [[18], [20], [22], [19]]`} language="python" title="V 矩阵" />

      <p>
        在刚刚那个例子里，我们只做了一次查询。因此，准确来说，我们的操作应该写成 A(q, K, V)。其中，query q 就是 <code>[1, 0, 0]</code> 了。
      </p>
      <p>
        实际上，我们可以一次做多组 query。把所有 q 打包成矩阵 Q，就得到了公式 Attention(Q, K, V) = softmax(QK<sup>T</sup> / √d<sub>k</sub>) V。
      </p>
      <p>
        等等，这个 d<sub>k</sub> 是什么意思？d<sub>k</sub> 就是 query 和 key 向量的长度。由于 query 和 key 要做点乘，这两种向量的长度必须一致。value 向量的长度倒是可以不一致，论文里把 value 向量的长度叫做 d<sub>v</sub>。在我们这个例子里，d<sub>k</sub> = 3, d<sub>v</sub> = 1。
      </p>

      <Callout type="info">
        <strong>为什么要用一个和 d<sub>k</sub> 成比例的项来放缩 QK<sup>T</sup> 呢？</strong>
        这是因为，softmax 在绝对值较大的区域梯度较小，梯度下降的速度比较慢。因此，我们要让被 softmax 的点乘数值尽可能小。而一般在 d<sub>k</sub> 较大时，也就是向量较长时，点乘的数值会比较大。<strong>除以一个和 d<sub>k</sub> 相关的量能够防止点乘的值过大。</strong>
      </Callout>

      <p>
        刚才也提到，QK<sup>T</sup> 其实是在算 query 和 key 的相似度。而算相似度并不只有求点乘这一种方式。另一种常用的注意力函数叫做<strong>加性注意力</strong>，它用一个单层神经网络来计算两个向量的相似度。相比之下，点乘注意力算起来快一些。出于性能上的考量，论文使用了点乘注意力。
      </p>

      <h3>3.3 自注意力</h3>
      <p>
        自注意力是 3.2.3 节里提及的内容。我认为，学完注意力的原理后，立刻去学自注意力能够更快地理解注意力机制。当然，论文里并没有对自注意力进行过多的引入，初学者学起来会非常困难。因此，这里我参考《深度学习专项》里的介绍方式，用一个更具体的例子介绍了自注意力。
      </p>
      <p>
        大致明白了注意力机制其实就是"全局信息查询"，并掌握了注意力的公式后，我们来以 Transformer 的自注意力为例，进一步理解注意力的意义。
      </p>
      <p>
        自注意力模块的目的是为每一个输入 token 生成一个向量表示，该表示不仅能反映 token 本身的性质，还能反映 token 在句子里特有的性质。比如翻译 <strong>"简访问非洲"</strong> 这句话时，第三个字"问"在中文里有很多个意思，比如询问、慰问等。我们想为它生成一个表示，知道它在句子中的具体意思。而在例句中，"问"字组词组成了"访问"，所以它应该取"询问"这个意思，而不是"慰问"。<strong>"询问"就是"问"字在这句话里的表示</strong>。
      </p>
      <p>
        让我们看看自注意力模块具体是怎么生成这种表示的。自注意力模块的输入是 3 个矩阵 Q, K, V。准确来说，这些矩阵是向量的数组，也就是每一个 token 的 query, key, value 向量构成的数组。自注意力模块会为每一个 token 输出一个向量表示 A。A<sup>&lt;t&gt;</sup> 是第 t 个 token 在这句话里的向量表示。
      </p>
      <p>
        我们先别管 token 的 query, key, value 究竟是什么算出来的，后文会对此做解释。
      </p>
      <p>
        让我们还是以刚刚那个句子"简访问非洲"为例，看一下自注意力是怎么计算的。现在，我们想计算 A<sup>&lt;3&gt;</sup>。A<sup>&lt;3&gt;</sup> 表示的是"问"字在句子里的确切含义。为了获取 A<sup>&lt;3&gt;</sup>，我们可以问这样一个可以用数学表达的问题：<strong>"和'问'字组词的字的词嵌入是什么？"</strong>。这个问题就是第三个 token 的 query 向量 q<sup>&lt;3&gt;</sup>。
      </p>
      <p>
        和"问"字组词的字，很可能是一个动词。恰好，每一个 token 的 key k<sup>&lt;t&gt;</sup> 就表示这个 token 的词性；每一个 token 的 value v<sup>&lt;t&gt;</sup>，就是这个 token 的嵌入。
      </p>
      <p>
        这样，我们就可以根据每个字的词性（key），尽量去找动词（和 query 比较相似的 key），求出权重（query 和 key 做点乘再做 softmax），对所有 value 求一个加权平均，就差不多能回答问题 q<sup>&lt;3&gt;</sup> 了。
      </p>
      <p>
        经计算，q<sup>&lt;3&gt;</sup> 和 k<sup>&lt;2&gt;</sup> 可能会比较相关，即这两个向量的内积比较大。因此，最终算出来的 A<sup>&lt;3&gt;</sup> 应该约等于 v<sup>&lt;2&gt;</sup>，即问题"哪个字和'问'字组词了？"的答案是第二个字"访"。
      </p>
      <p>
        这是 A<sup>&lt;3&gt;</sup> 的计算过程。准确来说，A<sup>&lt;3&gt;</sup> = A(q<sup>&lt;3&gt;</sup>, K, V)。类似地，A<sup>&lt;1&gt;</sup> 到 A<sup>&lt;5&gt;</sup> 都是用这个公式来计算。把所有 A 的计算合起来，把 q 合起来，得到的公式就是注意力的公式。
      </p>

      <MermaidDiagram chart={`
flowchart LR
  subgraph TOKENS["输入序列: 简 访 问 非 洲"]
    direction TB
    T1["简 (pos=1)"]
    T2["访 (pos=2)"]
    T3["问 (pos=3)"]
    T4["非 (pos=4)"]
    T5["洲 (pos=5)"]
  end

  subgraph SELF["自注意力计算 A&lt;3&gt;"]
    direction TB
    Q3["q&lt;3&gt;: '和问字组词的字是什么？'"]
    ATT["计算 q&lt;3&gt; 与每个 k&lt;t&gt; 的相似度"]
    RESULT["q&lt;3&gt;·k&lt;2&gt; 最大<br/>→ A&lt;3&gt; ≈ v&lt;2&gt;<br/>→ '问' 融入 '访' 的语义"]
    Q3 --> ATT --> RESULT
  end

  T1 --> ATT
  T2 --> ATT
  T3 --> ATT
  T4 --> ATT
  T5 --> ATT
      `} />

      <p className="text-center text-sm text-gray-500">▲ 自注意力示例："简访问非洲"中"问"字的语义消歧</p>

      <Callout type="info">
        <strong>小结：</strong>从上一节中，我们知道了注意力其实就是全局信息查询。而在这一节，我们知道了注意力的一种应用：通过让一句话中的每个单词去向其他单词查询信息，我们能为每一个单词生成一个更有意义的向量表示。
      </Callout>

      <p>
        可是，我们还留了一个问题没有解决：每个单词的 query, key, value 是怎么得来的？这就要看 Transformer 里的另一种机制了——多头注意力。
      </p>

      <h3>3.4 多头注意力（3.2.2 节）</h3>
      <p>
        在自注意力中，每一个单词的 query, key, value 应该只和该单词本身有关。因此，这三个向量都应该由单词的词嵌入得到。另外，每个单词的 query, key, value 不应该是人工指定的，而应该是可学习的。因此，我们可以用可学习的参数来描述从词嵌入到 query, key, value 的变换过程。综上，自注意力的输入 Q, K, V 应该用下面这个公式计算：
      </p>

      <CodeBlock code={`Q = E · W^Q
K = E · W^K
V = E · W^V

其中，E 是词嵌入矩阵，也就是每个单词的词嵌入的数组；
W^Q, W^K, W^V 是可学习的参数矩阵。

在 Transformer 中，大部分中间向量的长度都用 d_model 表示，
词嵌入的长度也是 d_model。因此，设输入的句子长度为 n，则：
  E 的形状是 n × d_model
  W^Q, W^K 的形状是 d_model × d_k
  W^V 的形状是 d_model × d_v

注：Transformer 似乎默认所有向量都是行向量，
参数矩阵都写成了右乘而不是常见的左乘。`} language="python" title="Q、K、V 的线性投影" />

      <p>
        就像卷积层能够用多个卷积核生成多个通道的特征一样，我们也用多组 W<sup>Q</sup>, W<sup>K</sup>, W<sup>V</sup> 生成多组自注意力结果。这样，每个单词的自注意力表示会更丰富一点。这种机制就叫做<strong>多头注意力</strong>。把多头注意力用在自注意力上的公式为：
      </p>

      <CodeBlock code={`MultiHead(Q, K, V) = Concat(head_1, ..., head_h) W^O

其中:
  head_i = Attention(Q·W_i^Q, K·W_i^K, V·W_i^V)

  h 是多头自注意力的"头"数
  W^O 是另一个参数矩阵

多头注意力模块的输入输出向量的长度都是 d_model。
因此，W^O 的形状是 h·d_v × d_model
（自注意力的输出长度是 d_v，有 h 个输出）。

默认参数配置:
  d_model = 512
  h = 8
  d_k = d_v = d_model / h = 64`} language="python" title="Multi-Head Attention" />

      <p>
        实际上，多头注意力机制不仅仅可以用在计算自注意力上。推广一下，如果把多头自注意力的输入 E 拆成三个矩阵 Q, K, V，则多头注意力的公式为：
      </p>

      <CodeBlock code={`MultiHead(Q, K, V) = Concat(head_1, ..., head_h) W^O
head_i = Attention(Q·W_i^Q, K·W_i^K, V·W_i^V)`} language="python" title="通用多头注意力公式" />

      <h2>4. Transformer 模型架构</h2>
      <p>
        看懂了注意力机制，可以回过头阅读 3.1 节学习 Transformer 的整体架构了。
      </p>
      <p>
        论文里的图 1 是 Transformer 的架构图。然而，由于我们没读后面的章节，有一些模块还没有见过。因此，我们这轮阅读的时候可以只关注模型主干，搞懂 encoder 和 decoder 之间是怎么组织起来的。
      </p>

      <MermaidDiagram chart={`
flowchart TB
  subgraph INPUT["输入"]
    IN["输入序列<br/>(x₁, ..., xₙ)"]
    OUT["输出序列<br/>(y₁, ..., yₘ) 右移一位"]
  end

  subgraph ENCODER["编码器 Encoder (N=6层)"]
    direction TB
    PE1["输入嵌入 + 位置编码"]
    ENC1["多头自注意力<br/>+ 残差连接 + LayerNorm"]
    ENC2["前馈网络<br/>+ 残差连接 + LayerNorm"]
    PE1 --> ENC1 --> ENC2
  end

  subgraph DECODER["解码器 Decoder (N=6层)"]
    direction TB
    PE2["输出嵌入 + 位置编码"]
    DEC1["掩码多头自注意力<br/>+ 残差 + LayerNorm"]
    DEC2["编码器-解码器注意力<br/>+ 残差 + LayerNorm"]
    DEC3["前馈网络<br/>+ 残差 + LayerNorm"]
    PE2 --> DEC1 --> DEC2 --> DEC3
  end

  subgraph OUTPUT["输出"]
    LINEAR["线性层"]
    SOFTMAX["Softmax"]
    PROB["输出概率"]
  end

  IN --> ENCODER
  OUT --> DECODER
  ENCODER -->|"K, V"| DEC2
  DECODER --> LINEAR --> SOFTMAX --> PROB
      `} />

      <p className="text-center text-sm text-gray-500">▲ 论文图 1：Transformer 模型架构</p>
      <p>
        我们现在仅知道多头注意力模块的原理，对模型主干中的三个模块还有疑问：
      </p>
      <ul>
        <li>Add &amp; Norm</li>
        <li>Feed Forward</li>
        <li>为什么一个多头注意力前面加了 Masked</li>
      </ul>
      <p>我们来依次看懂这三个模块。</p>

      <h3>4.1 残差连接（3.1 节）</h3>
      <p>
        Transformer 使用了和 ResNet 类似的<strong>残差连接</strong>，即设模块本身的映射为 F(x)，则模块输出为 <code>Normalization(F(x) + x)</code>。和 ResNet 不同，Transformer 使用的归一化方法是 <strong>LayerNorm</strong>。
      </p>
      <p>
        另外要注意的是，残差连接有一个要求：输入 x 和输出 F(x)+x 的维度必须等长。在 Transformer 中，包括所有词嵌入在内的向量长度都是 d<sub>model</sub> = 512。
      </p>

      <h3>4.2 前馈网络</h3>
      <p>
        架构图中的前馈网络（Feed Forward）其实就是一个全连接网络。具体来说，这个子网络由两个线性层组成，中间用 ReLU 作为激活函数。
      </p>

      <CodeBlock code={`FFN(x) = max(0, x·W_1 + b_1) · W_2 + b_2

中间的隐藏层的维度数记作 d_ff。默认 d_ff = 2048。`} language="python" title="Position-wise Feed-Forward Network" />

      <h3>4.3 整体架构与掩码多头注意力</h3>
      <p>
        现在，我们基本能看懂模型的整体架构了。只有读懂了整个模型的运行原理，我们才能搞懂多头注意力前面的 masked 是哪来的。
      </p>
      <p>
        论文第 3 章开头介绍了模型的运行原理。和多数强力的序列转换模型一样，Transformer 使用了 encoder-decoder 的架构。早期基于 RNN 的序列转换模型在生成序列时一般会输入前 i 个单词，输出第 i+1 个单词。
      </p>
      <p>
        而 Transformer 不同。对于输入序列 (x<sub>1</sub>, …, x<sub>s</sub>)，它会被编码器编码成中间表示 <strong>z</strong> = (z<sub>1</sub>, …, z<sub>s</sub>)。给定 <strong>z</strong> 的前提下，解码器输入 (y<sub>1</sub>, …, y<sub>t</sub>)，输出 (y<sub>2</sub>, …, y<sub>t+1</sub>) 的预测。
      </p>

      <Callout type="info">
        <strong>注意：</strong>Transformer 默认会并行地输出结果。而在推理时，序列必须得串行生成。直接调用 Transformer 的并行输出逻辑会产生非常多的冗余运算量。推理的代码实现可以进行优化。
      </Callout>

      <p>
        具体来说，输入序列 x 会经过 N=6 个结构相同的层。每层由多个子层组成。第一个子层是多头注意力层，准确来说，是多头自注意力。这一层可以为每一个输入单词提取出更有意义的表示。之后数据会经过前馈网络子层。最终，输出编码结果 <strong>z</strong>。
      </p>
      <p>
        得到了 <strong>z</strong> 后，要用解码器输出结果了。解码器的输入是当前已经生成的序列，该序列会经过一个掩码（masked）多头自注意力子层。我们先不管这个掩码是什么意思，暂且把它当成普通的多头自注意力层。它的作用和编码器中的一样，用于提取出更有意义的表示。
      </p>
      <p>
        接下来，数据还会经过一个多头注意力层。这个层比较特别，它的 K，V 来自 <strong>z</strong>，Q 来自上一层的输出。为什么会有这样的设计呢？这种设计来自于早期的注意力模型。在早期的注意力模型中，每一个输出单词都会与每一个输入单词求一个注意力，以找到每一个输出单词最相关的某几个输入单词。用注意力公式来表达的话，Q 就是输出单词，K, V 就是输入单词。
      </p>
      <p>
        经过第二个多头注意力层后，和编码器一样，数据会经过一个前馈网络。最终，网络并行输出各个时刻的下一个单词。
      </p>
      <p>
        这种并行计算有一个要注意的地方。<strong>在输出第 t+1 个单词时，模型不应该提前知道 t+1 时刻之后的信息。</strong>因此，应该只保留 t 时刻之前的信息，遮住后面的输入。这可以通过添加掩码实现。添加掩码的一个不严谨的示例如下表所示：
      </p>

      <table>
        <thead><tr><th>输入</th><th>输出</th></tr></thead>
        <tbody>
          <tr><td>(y1, y2, y3, y4)</td><td>y2</td></tr>
          <tr><td>(y1, y2, y3, y4)</td><td>y3</td></tr>
          <tr><td>(y1, y2, y3, y4)</td><td>y4</td></tr>
        </tbody>
      </table>

      <p>
        这就是为什么解码器的多头自注意力层前面有一个 masked。在论文中，mask 是通过令注意力公式的 softmax 的输入为 -∞ 来实现的（softmax 的输入为 -∞，注意力权重就几乎为 0，被遮住的输出也几乎全部为 0）。<strong>每个 mask 都是一个上三角矩阵。</strong>
      </p>

      <MermaidDiagram chart={`
flowchart LR
  subgraph EARLY["早期注意力模型 (encoder-decoder attention)"]
    direction TB
    INP["输入序列<br/>x₁ x₂ x₃ x₄"]
    OUTP["输出序列<br/>y₁ y₂ y₃"]
    ENC["Encoder<br/>编码"]
    DEC["Decoder<br/>解码"]
    ATT["注意力权重<br/>每个输出对每个输入<br/>都有一个注意力值"]
    INP --> ENC
    ENC --> ATT
    OUTP --> DEC
    ATT --> DEC
  end
      `} />

      <p className="text-center text-sm text-gray-500">▲ 编码器-解码器注意力机制：每个输出单词关注所有输入单词</p>

      <CodeBlock code={`# 掩码矩阵 (上三角为 -∞)，序列长度 n=4:
mask = [[  0, -∞, -∞, -∞],   # 位置 0 只能看到自己
        [  0,  0, -∞, -∞],   # 位置 1 看到 0,1
        [  0,  0,  0, -∞],   # 位置 2 看到 0,1,2
        [  0,  0,  0,  0]]   # 位置 3 看到全部

# 注意力计算:
scores = QK^T / √d_k
scores = scores + mask       # 非法位置变为 -∞
weights = softmax(scores)    # 非法位置权重 ≈ 0`} language="python" title="掩码多头注意力实现" />

      <h3>4.4 嵌入层</h3>
      <p>
        看完了 Transformer 的主干结构，再来看看输入输出做了哪些前后处理。
      </p>
      <p>
        和其他大多数序列转换任务一样，Transformer 主干结构的输入输出都是词嵌入序列。词嵌入，其实就是一个把 one-hot 向量转换成有意义的向量的转换矩阵。在 Transformer 中，解码器的嵌入层和输出线性层是共享权重的——输出线性层表示的线性变换是嵌入层的逆变换，其目的是把网络输出的嵌入再转换回 one-hot 向量。如果某任务的输入和输出是同一种语言，那么编码器的嵌入层和解码器的嵌入层也可以共享权重。
      </p>

      <Callout type="info">
        <strong>注意：</strong>论文中写道"输入输出的嵌入层和 softmax 前的线性层共享权重"。这个描述不够清楚。如果输入和输出的不是同一种语言，比如输入中文输出英文，那么共享一个词嵌入是没有意义的。
      </Callout>

      <p>
        嵌入矩阵的权重乘了一个 √d<sub>model</sub>。
      </p>
      <p>
        由于模型要预测一个单词，输出的线性层后面还有一个常规的 softmax 操作。
      </p>

      <h3>4.5 位置编码</h3>
      <p>
        现在，Transformer 的结构图还剩一个模块没有读——位置编码。无论是 RNN 还是 CNN，都能自然地利用到序列的先后顺序这一信息。然而，Transformer 的主干网络并不能利用到序列顺序信息。因此，Transformer 使用了一种叫做"位置编码"的机制，对编码器和解码器的嵌入输入做了一些修改，以向模型提供序列顺序信息。
      </p>
      <p>
        嵌入层的输出是一个向量数组，即词嵌入向量的序列。设数组的位置叫 pos，向量的某一维叫 i。我们为每一个向量里的每一个数添加一个实数编码，这种编码方式要满足以下性质：
      </p>
      <ol>
        <li>对于同一个 pos 不同的 i，即对于一个词嵌入向量的不同元素，它们的编码要各不相同。</li>
        <li>对于向量的同一个维度处，不同 pos 的编码不同。且 pos 间要满足相对关系，即 f(pos+1) - f(pos) = f(pos) - f(pos-1)。</li>
      </ol>
      <p>
        要满足这两种性质的话，我们可以轻松地设计一种编码函数：即对于每一个位置 i，用小数点后的 3 个十进制数位来表示不同的 pos。pos 之间也满足相对关系。
      </p>
      <p>
        但是，这种编码不利于网络的学习。我们更希望所有编码都差不多大小，且都位于 0~1 之间。为此，Transformer 使用了<strong>三角函数作为编码函数</strong>。这种位置编码（Positional Encoding, PE）的公式如下：
      </p>

      <CodeBlock code={`PE(pos, 2i)   = sin(pos / 10000^(2i/d_model))
PE(pos, 2i+1) = cos(pos / 10000^(2i/d_model))

其中:
  pos: 位置 (0 ≤ pos < seq_len)
  i:   维度索引 (0 ≤ i < d_model/2)
  偶数维度使用 sin，奇数维度使用 cos`} language="python" title="Positional Encoding" />

      <p>
        i 不同，则三角函数的周期不同。同 pos 不同周期的三角函数值不重复。这满足上面的性质 1。另外，根据三角函数的和角公式：
      </p>

      <CodeBlock code={`sin(pos + k) = sin(pos)·cos(k) + cos(pos)·sin(k)
cos(pos + k) = cos(pos)·cos(k) - sin(pos)·sin(k)

即 PE(pos+k) 是 PE(pos) 的一个线性函数。
不同的 pos 之间有相对关系。这满足性质 2。`} language="python" title="和角公式证明" />

      <p>
        本文作者也尝试了用可学习的函数作为位置编码函数。实验表明，二者的表现相当。作者还是使用了三角函数作为最终的编码函数，这是因为<strong>三角函数能够外推到任意长度的输入序列</strong>，而可学习的位置编码只能适应训练时的序列长度。
      </p>

      <h2>5. 为什么用自注意力</h2>
      <p>
        在论文的第四章，作者用自注意力层对比了循环层和卷积层，探讨了自注意力的一些优点。
      </p>
      <p>
        自注意力层是一种和循环层和卷积层等效的计算单元。它们的目的都是把一个向量序列映射成另一个向量序列，比如说编码器把 x 映射成中间表示 z。论文比较了三个指标：<strong>每一层的计算复杂度</strong>、<strong>串行操作的复杂度</strong>、<strong>最大路径长度</strong>。
      </p>
      <p>
        前两个指标很容易懂，第三个指标最大路径长度需要解释一下。最大路径长度表示数据从某个位置传递到另一个位置的最大长度。比如对边长为 n 的图像做普通卷积操作，卷积核大小 3×3，要做 n/3 次卷积才能把信息从左上角的像素传播到右下角的像素。设卷积核边长为 k，则最大路径长度 O(n/k)。如果是空洞卷积的话，像素第一次卷积的感受野是 3×3，第二次是 5×5，第三次是 9×9，以此类推，感受野会指数级增长。这种卷积的最大路径长度是 O(log<sub>k</sub>(n))。
      </p>
      <p>
        我们可以从这三个指标分别探讨自注意力的好处：
      </p>
      <ol>
        <li>
          <strong>串行操作的复杂度</strong>：如引言所写，循环层最大的问题是不能并行训练，序列计算复杂度是 O(n)。而自注意力层和卷积一样可以完全并行，为 O(1)。
        </li>
        <li>
          <strong>每一层的复杂度</strong>：设 n 是序列长度，d 是词嵌入向量长度。其他架构的复杂度有 d²，而自注意力是 d。一般模型的 d 会大于 n，自注意力的计算复杂度也会低一些。
        </li>
        <li>
          <strong>最大路径长度</strong>：注意力本来就是全局查询操作，可以在 O(1) 的时间里完成所有元素间信息的传递。它的信息传递速度远胜卷积层和循环层。
        </li>
      </ol>

      <table>
        <thead><tr><th>层类型</th><th>每层计算复杂度</th><th>串行操作数</th><th>最大路径长度</th></tr></thead>
        <tbody>
          <tr><td><strong>自注意力</strong></td><td>O(n²·d)</td><td>O(1)</td><td>O(1)</td></tr>
          <tr><td>循环 (RNN)</td><td>O(n·d²)</td><td>O(n)</td><td>O(n)</td></tr>
          <tr><td>卷积 (CNN)</td><td>O(k·n·d²)</td><td>O(1)</td><td>O(log<sub>k</sub>(n))</td></tr>
          <tr><td>受限自注意力 (r)</td><td>O(r·n·d)</td><td>O(1)</td><td>O(n/r)</td></tr>
        </tbody>
      </table>

      <p>
        为了降低每层的计算复杂度，可以改进自注意力层的查询方式，让每个元素查询最近的 r 个元素。本文仅提出了这一想法，并没有做相关实验。
      </p>

      <h2>6. 实验与结果</h2>
      <p>
        本工作测试了"英语-德语"和"英语-法语"两项翻译任务。使用论文的默认模型配置，在 8 张 P100 上只需 12 小时就能把模型训练完。本工作使用了 Adam 优化器，并对学习率调度有一定的优化。模型有两种正则化方式：
      </p>
      <ol>
        <li>每个子层后面有 <strong>Dropout</strong>，丢弃概率 0.1；</li>
        <li><strong>标签平滑（Label Smoothing）</strong>。</li>
      </ol>
      <p>
        Transformer 在翻译任务上胜过了所有其他模型，且训练时间大幅缩短。
      </p>

      <table>
        <thead><tr><th>模型</th><th>EN-DE BLEU</th><th>EN-FR BLEU</th><th>训练成本 (FLOPs)</th></tr></thead>
        <tbody>
          <tr><td>GNMT + RL</td><td>24.6</td><td>39.92</td><td>2.3×10¹⁹</td></tr>
          <tr><td>ConvS2S</td><td>25.16</td><td>40.46</td><td>9.6×10¹⁸</td></tr>
          <tr><td>MoE</td><td>26.03</td><td>40.56</td><td>2.0×10¹⁹</td></tr>
          <tr><td><strong>Transformer (base)</strong></td><td><strong>27.3</strong></td><td>38.1</td><td><strong>3.3×10¹⁸</strong></td></tr>
          <tr><td><strong>Transformer (big)</strong></td><td><strong>28.4</strong></td><td><strong>41.8</strong></td><td>2.3×10¹⁹</td></tr>
        </tbody>
      </table>

      <p>
        论文同样展示了不同配置下 Transformer 的<strong>消融实验结果</strong>：
      </p>

      <table>
        <thead><tr><th>实验</th><th>变量</th><th>结论</th></tr></thead>
        <tbody>
          <tr><td><strong>A</strong></td><td>注意力头数 h 和 d<sub>k</sub>/d<sub>v</sub> 比例</td><td>计算量不变的前提下，需要谨慎地调节 h 和 d<sub>k</sub>, d<sub>v</sub> 的比例，太大太小都不好。这些实验也说明，多头注意力比单头是要好的。</td></tr>
          <tr><td><strong>B</strong></td><td>注意力 key 维度 d<sub>k</sub></td><td>d<sub>k</sub> 增加可以提升模型性能。作者认为，这说明计算 key, value 相关性是比较困难的，如果用更精巧的计算方式来代替点乘，可能可以提升性能。</td></tr>
          <tr><td><strong>C, D</strong></td><td>模型大小和 Dropout</td><td>大模型是更优的，且 dropout 是必要的。</td></tr>
          <tr><td><strong>E</strong></td><td>位置编码方式</td><td>可学习的位置编码的效果和三角函数几乎一致。</td></tr>
        </tbody>
      </table>

      <h3>模型参数配置</h3>
      <table>
        <thead><tr><th>参数</th><th>Base 模型</th><th>Big 模型</th></tr></thead>
        <tbody>
          <tr><td>层数 N</td><td>6</td><td>6</td></tr>
          <tr><td>d<sub>model</sub></td><td>512</td><td>1024</td></tr>
          <tr><td>d<sub>ff</sub></td><td>2048</td><td>4096</td></tr>
          <tr><td>注意力头数 h</td><td>8</td><td>16</td></tr>
          <tr><td>d<sub>k</sub> = d<sub>v</sub></td><td>64</td><td>64</td></tr>
          <tr><td>Dropout</td><td>0.1</td><td>0.3</td></tr>
          <tr><td>训练步数</td><td>100K</td><td>300K</td></tr>
          <tr><td>参数量</td><td>65M</td><td>213M</td></tr>
        </tbody>
      </table>

      <p>
        Transformer 在英语成分句法分析任务上也展现了强大的泛化能力。4 层 Transformer (d<sub>model</sub>=1024) 在 WSJ 数据集上仅用 ~40K 句训练就达到了 91.3 F1，超越 BerkeleyParser；半监督下达到 92.7 F1。
      </p>

      <h2>7. 总结</h2>
      <p>
        为了改进 RNN 不可并行的问题，这篇工作提出了 Transformer 这一仅由注意力机制构成的模型。Transformer 的效果非常出色，不仅训练速度快了，还在两项翻译任务上胜过其他模型。
      </p>
      <p>
        作者也很期待 Transformer 在其他任务上的应用。对于序列长度比较大的任务，如图像、音频、视频，可能要使用文中提到的只关注局部的注意力机制。由于序列输出时仍然避免不了串行，作者也在探究如何减少序列输出的串行度。
      </p>
      <p>
        现在来看，<strong>Transformer 是近年来最有影响力的深度学习模型之一</strong>。它先是在 NLP 中发扬光大，再逐渐扩散到了 CV 等领域。文中的一些预测也成为了现实，现在很多论文都在讨论如何在图像中使用注意力，以及如何使用带限制的注意力以降低长序列导致的计算性能问题。
      </p>

      <Callout type="tip">
        <strong>学习建议：</strong>我认为，对于深度学习的初学者，不管是研究什么领域，都应该仔细学习 Transformer。在学 Transformer 之前，最好先了解一下 RNN 和经典的 encoder-decoder 架构，再学习注意力模型。有了这些基础，读 Transformer 论文就会顺利很多。读论文时，最重要的是看懂注意力公式的原理，再看懂自注意力和多头注意力，最后看一看位置编码。其他一些和机器翻译任务相关的设计可以不用那么关注。
      </Callout>

      <ResourceTable resources={[
          { name: 'arXiv 论文', url: 'https://arxiv.org/abs/1706.03762', desc: '"Attention Is All You Need" 原始论文，Transformer 架构的奠基之作' },
          { name: '原文链接 (周弈帆)', url: 'https://zhouyifan.net/2022/11/12/20220925-Transformer/', desc: '中文逐段精读原文，从背景知识到数学公式的完整讲解' },
          { name: '官方代码 (tensor2tensor)', url: 'https://github.com/tensorflow/tensor2tensor', desc: 'Google 官方 TensorFlow 实现，包含训练与推理完整流程' },
          { name: 'The Illustrated Transformer', url: 'https://jalammar.github.io/illustrated-transformer/', desc: 'Jay Alammar 的经典可视化图解，直观理解 Q/K/V 与多头注意力' },
          { name: 'The Annotated Transformer', url: 'https://nlp.seas.harvard.edu/2018/04/03/attention.html', desc: 'Harvard NLP 逐行注释 PyTorch 实现，代码与公式一一对应' },
          { name: 'Attention? Attention!', url: 'https://lilianweng.github.io/posts/2018-06-24-attention/', desc: 'Lilian Weng 注意力机制综述，从 Seq2Seq 到 Self-Attention 的演进' },
          { name: 'The Transformer Family v2.0', url: 'https://lilianweng.github.io/posts/2023-01-27-the-transformer-family-v2/', desc: 'Transformer 变体大全，涵盖 GPT/BERT/T5/稀疏注意力等改进' },
          { name: 'minGPT', url: 'https://github.com/karpathy/minGPT', desc: 'Andrej Karpathy 的精简 GPT 教学实现，约 300 行，适合逐行精读' },
          { name: 'nanoGPT', url: 'https://github.com/karpathy/nanoGPT', desc: '极简训练+推理一体实现，可直接跑 Shakespeare 级别的小规模训练' },
          { name: 'x-transformers', url: 'https://github.com/lucidrains/x-transformers', desc: 'lucidrains 的各种 Transformer 变体实现，覆盖 Flash/Linear/稀疏 Attention' },
          { name: 'HuggingFace Transformers', url: 'https://github.com/huggingface/transformers', desc: '最流行的生产级 Transformer 库，BERT/GPT/Llama 等完整实现' },
          { name: 'PyTorch nn.Transformer 源码', url: 'https://github.com/pytorch/pytorch/blob/main/torch/nn/modules/transformer.py', desc: 'PyTorch 官方 nn.MultiheadAttention 与 nn.Transformer 实现' },
          { name: 'Harvard annotated-transformer', url: 'https://github.com/harvardnlp/annotated-transformer', desc: '与 The Annotated Transformer 教程配套的完整代码仓库' },
        ]} />
    </div>
  );
}