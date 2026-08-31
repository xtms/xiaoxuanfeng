import { CodeBlock, Callout, ExternalLink, ResourceTable } from '../components/CodeBlock';
import { MermaidDiagram } from '../components/MermaidDiagram';

export function AttentionENPage() {
  return (
    <div className="prose max-w-none">
      <h1>📐 Attention Is All You Need</h1>
      <p>
        <strong>Authors:</strong> Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones,
        Aidan N. Gomez, Łukasz Kaiser, Illia Polosukhin (Google Brain &amp; Google Research)
      </p>
      <p>
        <strong>Venue:</strong> NeurIPS 2017 | arXiv:1706.03762v7 [cs.CL]
      </p>

      <div className="flex gap-2 mb-4">
        <ExternalLink href="https://arxiv.org/abs/1706.03762" label="arXiv 论文" />
        <ExternalLink href="https://github.com/tensorflow/tensor2tensor" label="官方代码" />
      </div>

      <h2>Abstract</h2>
      <p>
        The dominant sequence transduction models are based on complex recurrent or convolutional neural networks
        that include an encoder and a decoder. The best performing models also connect the encoder and decoder
        through an attention mechanism. We propose a new simple network architecture, the <strong>Transformer</strong>,
        based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.
        Experiments on two machine translation tasks show that these models can be superior in quality while being
        more parallelizable and requiring significantly less time to train. Our model achieves 28.4 BLEU on the
        WMT 2014 English-to-German translation task, improving over the existing best results, including ensembles,
        by over 2 BLEU. On the WMT 2014 English-to-French translation task, our model establishes a new single-model
        state-of-the-art BLEU score of 41.8 after training for 3.5 days on eight GPUs, a small fraction of the
        training costs of the best models from the literature. We show that the Transformer generalizes well to
        other tasks by applying it successfully to English constituency parsing both with large and limited training data.
      </p>

      <h2>1. Introduction</h2>
      <p>
        Recurrent neural networks, long short-term memory and gated recurrent neural networks in particular,
        have been firmly established as state of the art approaches in sequence modeling and transduction
        problems such as language modeling and machine translation. Numerous efforts have since continued to
        push the boundaries of recurrent language models and encoder-decoder architectures.
      </p>
      <p>
        Recurrent models typically factor computation along the symbol positions of the input and output sequences.
        Aligning the positions to steps in computation time, they generate a sequence of hidden states h<sub>t</sub>,
        as a function of the previous hidden state h<sub>t-1</sub> and the input for position t. <strong>This inherently
        sequential nature precludes parallelization within training examples</strong>, which becomes critical at longer
        sequence lengths, as memory constraints limit batching across examples. Recent work has achieved significant
        improvements in computational efficiency through factorization tricks and conditional computation, while also
        improving model performance in case of the latter. The fundamental constraint of sequential computation, however, remains.
      </p>
      <p>
        Attention mechanisms have become an integral part of compelling sequence modeling and transduction models
        in various tasks, allowing modeling of dependencies without regard to their distance in the input or output
        sequences. In all but a few cases, however, such attention mechanisms are used in conjunction with a
        recurrent network.
      </p>
      <p>
        In this work we propose the Transformer, a model architecture eschewing recurrence and instead relying
        entirely on an attention mechanism to draw global dependencies between input and output. The Transformer
        allows for significantly more parallelization and can reach a new state of the art in translation quality
        after being trained for as little as twelve hours on eight P100 GPUs.
      </p>

      <h2>2. Background</h2>
      <p>
        The goal of reducing sequential computation also forms the foundation of the Extended Neural GPU,
        ByteNet and ConvS2S, all of which use convolutional neural networks as basic building block, computing
        hidden representations in parallel for all input and output positions. In these models, the number of
        operations required to relate signals from two arbitrary input or output positions grows in the distance
        between positions, linearly for ConvS2S and logarithmically for ByteNet. This makes it more difficult
        to learn dependencies between distant positions. In the Transformer this is reduced to a constant number
        of operations, albeit at the cost of reduced effective resolution due to averaging attention-weighted
        positions, an effect we counteract with Multi-Head Attention as described in section 3.2.
      </p>
      <p>
        Self-attention, sometimes called intra-attention, is an attention mechanism relating different positions
        of a single sequence in order to compute a representation of the sequence. Self-attention has been used
        successfully in a variety of tasks including reading comprehension, abstractive summarization, textual
        entailment and learning task-independent sentence representations.
      </p>
      <p>
        End-to-end memory networks are based on a recurrent attention mechanism instead of sequence-aligned
        recurrence and have been shown to perform well on simple-language question answering and language
        modeling tasks.
      </p>
      <p>
        To the best of our knowledge, however, the Transformer is <strong>the first transduction model relying
        entirely on self-attention</strong> to compute representations of its input and output without using
        sequence-aligned RNNs or convolution.
      </p>

      <h2>3. Model Architecture</h2>
      <p>
        Most competitive neural sequence transduction models have an encoder-decoder structure. Here, the encoder
        maps an input sequence of symbol representations (x<sub>1</sub>, ..., x<sub>n</sub>) to a sequence of
        continuous representations <strong>z</strong> = (z<sub>1</sub>, ..., z<sub>n</sub>). Given <strong>z</strong>,
        the decoder then generates an output sequence (y<sub>1</sub>, ..., y<sub>m</sub>) of symbols one element at
        a time. At each step the model is auto-regressive, consuming the previously generated symbols as additional
        input when generating the next.
      </p>
      <p>
        The Transformer follows this overall architecture using stacked self-attention and point-wise, fully connected
        layers for both the encoder and decoder, shown in the left and right halves of Figure 1 respectively.
      </p>

      <MermaidDiagram chart={`
flowchart TB
  subgraph INPUT["Input"]
    IN["Inputs<br/>(x₁, ..., xₙ)"]
    OUT["Outputs<br/>(y₁, ..., yₘ) shifted right"]
  end

  subgraph ENCODER["Encoder (N=6 layers)"]
    direction TB
    PE1["Input Embedding + Positional Encoding"]
    ENC1["Multi-Head Self-Attention<br/>+ Add & Norm"]
    ENC2["Feed Forward<br/>+ Add & Norm"]
    PE1 --> ENC1 --> ENC2
  end

  subgraph DECODER["Decoder (N=6 layers)"]
    direction TB
    PE2["Output Embedding + Positional Encoding"]
    DEC1["Masked Multi-Head Self-Attention<br/>+ Add & Norm"]
    DEC2["Multi-Head Cross-Attention<br/>+ Add & Norm"]
    DEC3["Feed Forward<br/>+ Add & Norm"]
    PE2 --> DEC1 --> DEC2 --> DEC3
  end

  subgraph OUTPUT["Output"]
    LINEAR["Linear"]
    SOFTMAX["Softmax"]
    PROB["Output Probabilities"]
  end

  IN --> ENCODER
  OUT --> DECODER
  ENCODER -->|"K, V"| DEC2
  DECODER --> LINEAR --> SOFTMAX --> PROB
      `} />

      <p className="text-center text-sm text-gray-500">▲ Figure 1: The Transformer — model architecture.</p>

      <h3>3.1 Encoder and Decoder Stacks</h3>

      <h4>Encoder</h4>
      <p>
        The encoder is composed of a stack of N = 6 identical layers. Each layer has two sub-layers. The first is
        a <strong>multi-head self-attention</strong> mechanism, and the second is a simple, <strong>position-wise
        fully connected feed-forward network</strong>. We employ a residual connection around each of the two
        sub-layers, followed by layer normalization. That is, the output of each sub-layer is
        LayerNorm(x + Sublayer(x)), where Sublayer(x) is the function implemented by the sub-layer itself.
        To facilitate these residual connections, all sub-layers in the model, as well as the embedding layers,
        produce outputs of dimension d<sub>model</sub> = 512.
      </p>

      <h4>Decoder</h4>
      <p>
        The decoder is also composed of a stack of N = 6 identical layers. In addition to the two sub-layers in
        each encoder layer, the decoder inserts a third sub-layer, which performs <strong>multi-head attention
        over the output of the encoder stack</strong>. Similar to the encoder, we employ residual connections
        around each of the sub-layers, followed by layer normalization. We also modify the self-attention sub-layer
        in the decoder stack to prevent positions from attending to subsequent positions. This masking, combined
        with the fact that the output embeddings are offset by one position, ensures that the predictions for
        position i can depend only on the known outputs at positions less than i.
      </p>

      <h3>3.2 Attention</h3>
      <p>
        An attention function can be described as mapping a query and a set of key-value pairs to an output,
        where the query, keys, values, and output are all vectors. The output is computed as a weighted sum of
        the values, where the weight assigned to each value is computed by a compatibility function of the query
        with the corresponding key.
      </p>

      <h4>3.2.1 Scaled Dot-Product Attention</h4>
      <p>
        We call our particular attention "Scaled Dot-Product Attention". The input consists of queries and keys
        of dimension d<sub>k</sub>, and values of dimension d<sub>v</sub>. We compute the dot products of the
        query with all keys, divide each by √d<sub>k</sub>, and apply a softmax function to obtain the weights
        on the values.
      </p>
      <p>
        In practice, we compute the attention function on a set of queries simultaneously, packed together into
        a matrix Q. The keys and values are also packed together into matrices K and V. We compute the matrix
        of outputs as:
      </p>

      <CodeBlock code={`Attention(Q, K, V) = softmax(QK^T / √d_k) V

Where:
  Q: Query matrix (n × d_k)
  K: Key matrix   (n × d_k)
  V: Value matrix (n × d_v)
  d_k: Dimension of queries and keys
  d_v: Dimension of values`} language="python" title="Scaled Dot-Product Attention" />

      <MermaidDiagram chart={`
flowchart LR
  subgraph SDPA["Scaled Dot-Product Attention (Figure 2 left)"]
    direction TB
    Q["Q (n × d_k)"]
    K["K (n × d_k)"]
    V["V (n × d_v)"]
    MATMUL1["MatMul: QK^T"]
    SCALE["Scale: ÷ √d_k"]
    MASK["Mask (opt.)"]
    SOFTMAX["SoftMax"]
    MATMUL2["MatMul: × V"]
    Q --> MATMUL1
    K --> MATMUL1
    MATMUL1 --> SCALE --> MASK --> SOFTMAX --> MATMUL2
    V --> MATMUL2
  end

  subgraph MHA["Multi-Head Attention (Figure 2 right)"]
    direction TB
    QM["Q"]
    KM["K"]
    VM["V"]
    LQ["Linear"] & LK["Linear"] & LV["Linear"]
    H["Scaled Dot-Product Attention × h"]
    CONCAT["Concat"]
    LO["Linear"]
    QM --> LQ
    KM --> LK
    VM --> LV
    LQ --> H
    LK --> H
    LV --> H
    H --> CONCAT --> LO
  end
      `} />

      <p className="text-center text-sm text-gray-500">▲ Figure 2: (left) Scaled Dot-Product Attention. (right) Multi-Head Attention consists of several attention layers running in parallel.</p>

      <p>
        The two most commonly used attention functions are additive attention, and dot-product (multiplicative)
        attention. Dot-product attention is identical to our algorithm, except for the scaling factor of
        1/√d<sub>k</sub>. Additive attention computes the compatibility function using a feed-forward network
        with a single hidden layer. While the two are similar in theoretical complexity, dot-product attention
        is much faster and more space-efficient in practice, since it can be implemented using highly optimized
        matrix multiplication code.
      </p>
      <p>
        While for small values of d<sub>k</sub> the two mechanisms perform similarly, additive attention
        outperforms dot product attention without scaling for larger values of d<sub>k</sub>. We suspect that
        for large values of d<sub>k</sub>, the dot products grow large in magnitude, pushing the softmax function
        into regions where it has extremely small gradients. To counteract this effect, we scale the dot products
        by 1/√d<sub>k</sub>.
      </p>

      <Callout type="info">
        <strong>Why divide by √d<sub>k</sub>?</strong>
        To illustrate why the dot products get large, assume that the components of q and k are independent random
        variables with mean 0 and variance 1. Then their dot product, q·k = Σ<sub>i=1</sub><sup>d_k</sup> q<sub>i</sub>k<sub>i</sub>,
        has mean 0 and variance d<sub>k</sub>. Dividing by √d<sub>k</sub> normalizes the variance back to 1,
        keeping the softmax gradients in a healthy range.
      </Callout>

      <h4>3.2.2 Multi-Head Attention</h4>
      <p>
        Instead of performing a single attention function with d<sub>model</sub>-dimensional keys, values and
        queries, we found it beneficial to linearly project the queries, keys and values h times with different,
        learned linear projections to d<sub>k</sub>, d<sub>k</sub> and d<sub>v</sub> dimensions, respectively.
        On each of these projected versions of queries, keys and values we then perform the attention function
        in parallel, yielding d<sub>v</sub>-dimensional output values. These are concatenated and once again
        projected, resulting in the final values, as depicted in Figure 2.
      </p>
      <p>
        Multi-head attention allows the model to jointly attend to information from <strong>different representation
        subspaces</strong> at different positions. With a single attention head, averaging inhibits this.
      </p>

      <CodeBlock code={`MultiHead(Q, K, V) = Concat(head_1, ..., head_h) W^O

where:
  head_i = Attention(Q W_i^Q, K W_i^K, V W_i^V)

Projection matrices:
  W_i^Q ∈ R^{d_model × d_k}
  W_i^K ∈ R^{d_model × d_k}
  W_i^V ∈ R^{d_model × d_v}
  W^O   ∈ R^{hd_v × d_model}

Default parameters (h = 8):
  d_model = 512
  d_k = d_v = d_model / h = 64
  With reduced head dimension, total computational cost is
  similar to single-head attention with full dimensionality.`} language="python" title="Multi-Head Attention" />

      <h4>3.2.3 Applications of Attention in our Model</h4>
      <p>The Transformer uses multi-head attention in three different ways:</p>

      <ul>
        <li>
          <strong>Encoder-decoder attention layers:</strong> the queries come from the previous decoder layer,
          and the memory keys and values come from the output of the encoder. This allows every position in the
          decoder to attend over all positions in the input sequence. This mimics the typical encoder-decoder
          attention mechanisms in sequence-to-sequence models.
        </li>
        <li>
          <strong>Encoder self-attention layers:</strong> all of the keys, values and queries come from the
          same place, in this case, the output of the previous layer in the encoder. Each position in the encoder
          can attend to all positions in the previous layer of the encoder.
        </li>
        <li>
          <strong>Decoder self-attention layers:</strong> similarly, self-attention layers in the decoder allow
          each position in the decoder to attend to all positions in the decoder up to and including that position.
          We need to prevent leftward information flow in the decoder to preserve the auto-regressive property.
          We implement this inside of scaled dot-product attention by masking out (setting to −∞) all values in the
          input of the softmax which correspond to illegal connections.
        </li>
      </ul>

      <h3>3.3 Position-wise Feed-Forward Networks</h3>
      <p>
        In addition to attention sub-layers, each of the layers in our encoder and decoder contains a fully
        connected feed-forward network, which is applied to each position separately and identically. This
        consists of two linear transformations with a ReLU activation in between.
      </p>

      <CodeBlock code={`FFN(x) = max(0, x W_1 + b_1) W_2 + b_2

While the linear transformations are the same across different positions,
they use different parameters from layer to layer.

Parameters:
  Input/output dimension: d_model = 512
  Inner-layer dimension:  d_ff = 2048
  W_1: 512 × 2048
  W_2: 2048 × 512

Equivalent to two convolutions with kernel size 1.`} language="python" title="Position-wise Feed-Forward Networks" />

      <h3>3.4 Embeddings and Softmax</h3>
      <p>
        Similarly to other sequence transduction models, we use learned embeddings to convert the input tokens
        and output tokens to vectors of dimension d<sub>model</sub>. We also use the usual learned linear
        transformation and softmax function to convert the decoder output to predicted next-token probabilities.
        In our model, we share the same weight matrix between the two embedding layers and the pre-softmax
        linear transformation. In the embedding layers, we multiply those weights by √d<sub>model</sub>.
      </p>

      <h3>3.5 Positional Encoding</h3>
      <p>
        Since our model contains no recurrence and no convolution, in order for the model to make use of the
        order of the sequence, we must inject some information about the relative or absolute position of the
        tokens in the sequence. To this end, we add "positional encodings" to the input embeddings at the
        bottoms of the encoder and decoder stacks. The positional encodings have the same dimension d<sub>model</sub>
        as the embeddings, so that the two can be summed. There are many choices of positional encodings, learned
        and fixed.
      </p>
      <p>
        In this work, we use sine and cosine functions of different frequencies:
      </p>

      <CodeBlock code={`PE(pos, 2i)   = sin(pos / 10000^(2i/d_model))
PE(pos, 2i+1) = cos(pos / 10000^(2i/d_model))

Where:
  pos: position (0 ≤ pos < sequence_length)
  i:   dimension index (0 ≤ i < d_model/2)

The wavelengths form a geometric progression from 2π to 10000·2π.`} language="python" title="Positional Encoding" />

      <p>
        We chose this function because we hypothesized it would allow the model to easily learn to attend by
        relative positions, since for any fixed offset k, PE<sub>pos+k</sub> can be represented as a linear
        function of PE<sub>pos</sub>.
      </p>
      <p>
        We also experimented with using learned positional embeddings instead, and found that the two versions
        produced nearly identical results (see Table 3 row (E)). We chose the sinusoidal version because it
        may allow the model to extrapolate to sequence lengths longer than the ones encountered during training.
      </p>

      <h2>4. Why Self-Attention</h2>
      <p>
        In this section we compare various aspects of self-attention layers to the recurrent and convolutional
        layers commonly used for mapping one variable-length sequence of symbol representations
        (x<sub>1</sub>, ..., x<sub>n</sub>) to another sequence of equal length (z<sub>1</sub>, ..., z<sub>n</sub>),
        with x<sub>i</sub>, z<sub>i</sub> ∈ R<sup>d</sup>, such as the hidden layers in a typical sequence
        transduction encoder or decoder. Motivating our use of self-attention we consider three desiderata.
      </p>
      <p>
        One is the total computational complexity per layer. Another is the amount of computation that can be
        parallelized, as measured by the minimum number of sequential operations required.
      </p>
      <p>
        The third is the path length between long-range dependencies in the network. Learning long-range
        dependencies is a key challenge in many sequence transduction tasks. One key factor affecting the
        ability to learn such dependencies is the length of the paths forward and backward signals have to
        traverse in the network. The shorter these paths between any combination of positions in the input
        and output sequences, the easier it is to learn long-range dependencies. Hence we also compare the
        maximum path length between any two input and output positions in networks composed of the different
        layer types.
      </p>

      <table>
        <thead><tr><th>Layer Type</th><th>Complexity per Layer</th><th>Sequential Operations</th><th>Maximum Path Length</th></tr></thead>
        <tbody>
          <tr><td><strong>Self-Attention</strong></td><td>O(n²·d)</td><td>O(1)</td><td>O(1)</td></tr>
          <tr><td>Recurrent</td><td>O(n·d²)</td><td>O(n)</td><td>O(n)</td></tr>
          <tr><td>Convolutional</td><td>O(k·n·d²)</td><td>O(1)</td><td>O(log<sub>k</sub>(n))</td></tr>
          <tr><td>Self-Attention (restricted)</td><td>O(r·n·d)</td><td>O(1)</td><td>O(n/r)</td></tr>
        </tbody>
      </table>

      <p>
        As noted in Table 1, a self-attention layer connects all positions with a constant number of sequentially
        executed operations, whereas a recurrent layer requires O(n) sequential operations. In terms of computational
        complexity, self-attention layers are faster than recurrent layers when the sequence length n is smaller
        than the representation dimensionality d, which is most often the case with sentence representations used
        by state-of-the-art models in machine translations, such as word-piece and byte-pair representations.
        To improve computational performance for tasks involving very long sequences, self-attention could be
        restricted to considering only a neighborhood of size r in the input sequence centered around the respective
        output position. This would increase the maximum path length to O(n/r). We plan to investigate this
        approach further in future work.
      </p>
      <p>
        A single convolutional layer with kernel width k &lt; n does not connect all pairs of input and output
        positions. Doing so requires a stack of O(n/k) convolutional layers in the case of contiguous kernels,
        or O(log<sub>k</sub>(n)) in the case of dilated convolutions, increasing the length of the longest paths
        between any two positions in the network. Convolutional layers are generally more expensive than recurrent
        layers, by a factor of k. Separable convolutions, however, decrease the complexity considerably, to
        O(k·n·d + n·d²). Even with k = n, however, the complexity of a separable convolution is equal to the
        combination of a self-attention layer and a point-wise feed-forward layer, the approach we take in our model.
      </p>
      <p>
        As a side benefit, self-attention could yield more interpretable models. We inspect attention distributions
        from our models and present and discuss examples in the appendix. Not only do individual attention heads
        clearly learn to perform different tasks, many appear to exhibit behavior related to the syntactic and
        semantic structure of the sentences.
      </p>

      <h2>5. Training</h2>

      <h3>5.1 Training Data and Batching</h3>
      <p>
        We trained on the standard WMT 2014 English-German dataset consisting of about 4.5 million sentence pairs.
        Sentences were encoded using byte-pair encoding, which has a shared source-target vocabulary of about 37,000
        tokens. For English-French, we used the significantly larger WMT 2014 English-French dataset consisting of
        36M sentences and split tokens into a 32,000 word-piece vocabulary. Sentence pairs were batched together
        by approximate sequence length. Each training batch contained a set of sentence pairs containing approximately
        25,000 source tokens and 25,000 target tokens.
      </p>

      <h3>5.2 Hardware and Schedule</h3>
      <p>
        We trained our models on one machine with 8 NVIDIA P100 GPUs. For our base models using the hyperparameters
        described throughout the paper, each training step took about 0.4 seconds. We trained the base models for
        a total of 100,000 steps or 12 hours. For our big models, step time was 1.0 seconds. The big models were
        trained for 300,000 steps (3.5 days).
      </p>

      <h3>5.3 Optimizer</h3>
      <p>
        We used the Adam optimizer with β<sub>1</sub> = 0.9, β<sub>2</sub> = 0.98 and ε = 10<sup>−9</sup>.
        We varied the learning rate over the course of training, according to the formula:
      </p>

      <CodeBlock code={`lrate = d_model^(-0.5) · min(
    step_num^(-0.5),
    step_num · warmup_steps^(-1.5)
)

warmup_steps = 4000

This corresponds to increasing the learning rate linearly for the
first warmup_steps training steps, and decreasing it thereafter
proportionally to the inverse square root of the step number.`} language="python" title="Learning Rate Schedule" />

      <h3>5.4 Regularization</h3>
      <p>We employ three types of regularization during training:</p>

      <p>
        <strong>Residual Dropout:</strong> We apply dropout to the output of each sub-layer, before it is added
        to the sub-layer input and normalized. In addition, we apply dropout to the sums of the embeddings and
        the positional encodings in both the encoder and decoder stacks. For the base model, we use a rate of
        P<sub>drop</sub> = 0.1.
      </p>

      <p>
        <strong>Label Smoothing:</strong> During training, we employed label smoothing of value ε<sub>ls</sub> = 0.1.
        This hurts perplexity, as the model learns to be more unsure, but improves accuracy and BLEU score.
      </p>

      <h2>6. Results</h2>

      <h3>6.1 Machine Translation</h3>
      <p>
        On the WMT 2014 English-to-German translation task, the big transformer model (Transformer (big) in
        Table 2) outperforms the best previously reported models (including ensembles) by more than 2.0 BLEU,
        establishing a new state-of-the-art BLEU score of 28.4. The configuration of this model is listed in
        the bottom line of Table 3. Training took 3.5 days on 8 P100 GPUs. Even our base model surpasses all
        previously published models and ensembles, at a fraction of the training cost of any of the competitive
        models.
      </p>
      <p>
        On the WMT 2014 English-to-French translation task, our big model achieves a BLEU score of 41.0,
        outperforming all of the previously published single models, at less than 1/4 the training cost of the
        previous state-of-the-art model. The Transformer (big) model trained for English-to-French used dropout
        rate P<sub>drop</sub> = 0.1, instead of 0.3.
      </p>
      <p>
        For the base models, we used a single model obtained by averaging the last 5 checkpoints, which were
        written at 10-minute intervals. For the big models, we averaged the last 20 checkpoints. We used beam
        search with a beam size of 4 and length penalty α = 0.6. These hyperparameters were chosen after
        experimentation on the development set. We set the maximum output length during inference to input
        length + 50, but terminate early when possible.
      </p>

      <table>
        <thead><tr><th>Model</th><th>EN-DE BLEU</th><th>EN-FR BLEU</th></tr></thead>
        <tbody>
          <tr><td>ByteNet</td><td>23.75</td><td>—</td></tr>
          <tr><td>Deep-Att + PosUnk</td><td>—</td><td>39.2</td></tr>
          <tr><td>GNMT + RL</td><td>24.6</td><td>39.92</td></tr>
          <tr><td>ConvS2S</td><td>25.16</td><td>40.46</td></tr>
          <tr><td>MoE</td><td>26.03</td><td>40.56</td></tr>
          <tr><td>GNMT + RL Ensemble</td><td>26.30</td><td>41.16</td></tr>
          <tr><td>ConvS2S Ensemble</td><td>26.36</td><td>41.29</td></tr>
          <tr><td><strong>Transformer (base model)</strong></td><td><strong>27.3</strong></td><td><strong>38.1</strong></td></tr>
          <tr><td><strong>Transformer (big)</strong></td><td><strong>28.4</strong></td><td><strong>41.8</strong></td></tr>
        </tbody>
      </table>

      <h3>6.2 Model Variations</h3>
      <p>
        To evaluate the importance of different components of the Transformer, we varied our base model in
        different ways, measuring the change in performance on English-to-German translation on the development
        set, newstest2013. We used beam search as described in the previous section, but no checkpoint averaging.
        We present these results in Table 3.
      </p>

      <table>
        <thead><tr><th></th><th>N</th><th>d<sub>model</sub></th><th>d<sub>ff</sub></th><th>h</th><th>d<sub>k</sub></th><th>d<sub>v</sub></th><th>P<sub>drop</sub></th><th>ε<sub>ls</sub></th><th>train steps</th><th>PPL</th><th>BLEU</th><th>params</th></tr></thead>
        <tbody>
          <tr><td>base</td><td>6</td><td>512</td><td>2048</td><td>8</td><td>64</td><td>64</td><td>0.1</td><td>0.1</td><td>100K</td><td>4.92</td><td>25.8</td><td>65×10⁶</td></tr>
          <tr><td>(A)</td><td colSpan={12}>Variation on number of attention heads and attention key/value dimensions. Single-head is 0.9 BLEU worse than best setting; quality also drops with too many heads.</td></tr>
          <tr><td>(B)</td><td colSpan={12}>Reducing the attention key size d<sub>k</sub> hurts model quality. Suggests determining compatibility is not easy and a more sophisticated compatibility function than dot product may be beneficial.</td></tr>
          <tr><td>(C)</td><td colSpan={12}>Bigger models are better. Dropout is very helpful in avoiding over-fitting.</td></tr>
          <tr><td>(D)</td><td colSpan={12}>Dropout is very necessary. Replacing sinusoidal positional encoding with learned positional embeddings yields nearly identical results.</td></tr>
          <tr><td>(E)</td><td colSpan={12}>Replacing sinusoidal positional encoding with learned positional embeddings yields nearly identical results to the base model.</td></tr>
          <tr><td>big</td><td>6</td><td>1024</td><td>4096</td><td>16</td><td>—</td><td>—</td><td>0.3</td><td>—</td><td>300K</td><td>4.33</td><td>26.4</td><td>213×10⁶</td></tr>
        </tbody>
      </table>

      <Callout type="info">
        <strong>Key findings from ablation studies:</strong>
        <ul>
          <li><strong>(A) Attention heads:</strong> Single-head is 0.9 BLEU worse than best; quality also drops with too many heads. Best at h=8.</li>
          <li><strong>(B) Attention key size:</strong> Reducing d<sub>k</sub> hurts quality, suggesting a more sophisticated compatibility function than dot product may be beneficial.</li>
          <li><strong>(C) Model size:</strong> Bigger models are better, and dropout is very helpful in avoiding over-fitting.</li>
          <li><strong>(D) Dropout:</strong> Dropout is very necessary — removing it (0.0) hurts performance.</li>
          <li><strong>(E) Positional encoding:</strong> Learned positional embeddings produce nearly identical results to sinusoidal encodings.</li>
        </ul>
      </Callout>

      <h3>6.3 English Constituency Parsing</h3>
      <p>
        To evaluate if the Transformer can generalize to other tasks we conducted experiments on English
        constituency parsing. This task presents specific challenges: the output is subject to strong structural
        constraints and is significantly longer than the input. Furthermore, RNN sequence-to-sequence models
        have not been able to attain state-of-the-art results in small-data regimes.
      </p>
      <p>
        We trained a 4-layer transformer with d<sub>model</sub> = 1024 on the Wall Street Journal (WSJ) portion
        of the Penn Treebank, about 40K training sentences. We also trained it in a semi-supervised setting,
        using the larger high-confidence and BerkleyParser corpora from with approximately 17M sentences.
        We used a vocabulary of 16K tokens for the WSJ only setting and a vocabulary of 32K tokens for the
        semi-supervised setting.
      </p>

      <table>
        <thead><tr><th>Parser</th><th>Training</th><th>WSJ 23 F1</th></tr></thead>
        <tbody>
          <tr><td>Vinyals &amp; Kaiser et al. (2014)</td><td>WSJ only, discriminative</td><td>88.3</td></tr>
          <tr><td>Petrov et al. (2006)</td><td>WSJ only, discriminative</td><td>90.4</td></tr>
          <tr><td>Zhu et al. (2013)</td><td>WSJ only, discriminative</td><td>90.4</td></tr>
          <tr><td>Dyer et al. (2016)</td><td>WSJ only, discriminative</td><td>91.7</td></tr>
          <tr><td><strong>Transformer (4 layers)</strong></td><td>WSJ only, discriminative</td><td><strong>91.3</strong></td></tr>
          <tr><td>Zhu et al. (2013)</td><td>semi-supervised</td><td>91.3</td></tr>
          <tr><td>Huang &amp; Harper (2009)</td><td>semi-supervised</td><td>91.3</td></tr>
          <tr><td>McClosky et al. (2006)</td><td>semi-supervised</td><td>92.1</td></tr>
          <tr><td>Vinyals &amp; Kaiser et al. (2014)</td><td>semi-supervised</td><td>92.1</td></tr>
          <tr><td><strong>Transformer (4 layers)</strong></td><td>semi-supervised</td><td><strong>92.7</strong></td></tr>
          <tr><td>Luong et al. (2015)</td><td>multi-task</td><td>93.0</td></tr>
          <tr><td>Dyer et al. (2016)</td><td>generative</td><td>93.3</td></tr>
        </tbody>
      </table>

      <p>
        Despite the lack of task-specific tuning our model performs surprisingly well, yielding better results than
        all previously reported models with the exception of the Recurrent Neural Network Grammar.
      </p>
      <p>
        In contrast to RNN sequence-to-sequence models, the Transformer outperforms the BerkeleyParser even when
        training only on the WSJ training set of 40K sentences.
      </p>

      <h2>7. Conclusion</h2>
      <p>
        In this work, we presented the Transformer, the first sequence transduction model based entirely on
        attention, replacing the recurrent layers most commonly used in encoder-decoder architectures with
        multi-headed self-attention.
      </p>
      <p>
        For translation tasks, the Transformer can be trained significantly faster than architectures based on
        recurrent or convolutional layers. On both WMT 2014 English-to-German and WMT 2014 English-to-French
        translation tasks, we achieve a new state of the art. In the former task our best model outperforms
        even all previously reported ensembles.
      </p>
      <p>
        We are excited about the future of attention-based models and plan to apply them to other tasks. We plan
        to extend the Transformer to problems involving input and output modalities other than text and to
        investigate local, restricted attention mechanisms to efficiently handle large inputs and outputs such
        as images, audio and video. Making generation less sequential is another research goal of ours.
      </p>
      <p>
        The code we used to train and evaluate our models is available at
        <a href="https://github.com/tensorflow/tensor2tensor" target="_blank" rel="noreferrer">https://github.com/tensorflow/tensor2tensor</a>.
      </p>

      <Callout type="tip">
        <strong>Impact and Legacy:</strong>
        The Transformer has become one of the most influential architectures in deep learning history. It first
        revolutionized NLP (BERT, GPT series), then expanded to computer vision (ViT), speech recognition,
        multimodal models, and beyond. The attention mechanism described in this paper is also the core target
        of optimization in modern LLM inference frameworks such as vLLM and SGLang.
      </Callout>

      <ResourceTable resources={[
          { name: 'arXiv 论文', url: 'https://arxiv.org/abs/1706.03762', desc: '"Attention Is All You Need" 原始论文，Transformer 架构的奠基之作' },
          { name: '官方代码 (tensor2tensor)', url: 'https://github.com/tensorflow/tensor2tensor', desc: 'Google 官方 TensorFlow 实现，包含训练与推理完整流程' },
          { name: '中文精读 (周弈帆)', url: 'https://zhouyifan.net/2022/11/12/20220925-Transformer/', desc: '中文逐段精读，从背景知识到数学公式的完整讲解' },
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