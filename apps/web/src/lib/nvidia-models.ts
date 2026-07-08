// NVIDIA NIM available models — sourced from https://build.nvidia.com/models
// Only chat/instruct and embedding models relevant to Avesia's use case

export interface NvidiaModel {
  id: string;
  label: string;
  description: string;
  contextWindow?: string;
  recommended?: boolean;
}

// Chat/instruct models available on NVIDIA NIM
export const NVIDIA_CHAT_MODELS: readonly NvidiaModel[] = [
  {
    id: 'meta/llama-3.1-8b-instruct',
    label: 'Llama 3.1 8B Instruct',
    description: 'Fast, efficient model ideal for real-time copilot and clinical chat',
    contextWindow: '128K',
    recommended: true,
  },
  {
    id: 'meta/llama-3.1-70b-instruct',
    label: 'Llama 3.1 70B Instruct',
    description: 'Larger model with superior reasoning for complex clinical analysis',
    contextWindow: '128K',
  },
  {
    id: 'meta/llama-3.3-70b-instruct',
    label: 'Llama 3.3 70B Instruct',
    description: 'Latest Llama with advanced reasoning, math, and function calling',
    contextWindow: '128K',
    recommended: true,
  },
  {
    id: 'meta/llama-3.2-1b-instruct',
    label: 'Llama 3.2 1B Instruct',
    description: 'Ultra-light model for edge deployments and simple tasks',
    contextWindow: '128K',
  },
  {
    id: 'meta/llama-3.2-3b-instruct',
    label: 'Llama 3.2 3B Instruct',
    description: 'Small model balancing speed and capability',
    contextWindow: '128K',
  },
  {
    id: 'meta/llama-4-maverick-17b-128e-instruct',
    label: 'Llama 4 Maverick 17B',
    description: 'Multimodal MoE model with 128 experts, multilingual',
    contextWindow: '256K',
  },
  {
    id: 'nvidia/llama-3.1-nemotron-nano-8b-v1',
    label: 'Nemotron Nano 8B',
    description: 'NVIDIA-tuned model for reasoning and agentic AI on PC/edge',
    contextWindow: '128K',
  },
  {
    id: 'nvidia/llama-3.3-nemotron-super-49b-v1',
    label: 'Nemotron Super 49B',
    description: 'High efficiency model with leading accuracy for tool calling',
    contextWindow: '128K',
  },
  {
    id: 'nvidia/nemotron-3-nano-30b-a3b',
    label: 'Nemotron 3 Nano 30B',
    description: 'Efficient MoE with 1M context for coding, reasoning, tool calling',
    contextWindow: '1M',
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b',
    label: 'Nemotron 3 Super 120B',
    description: 'Hybrid Mamba-Transformer MoE with 1M context for agentic reasoning',
    contextWindow: '1M',
  },
  {
    id: 'deepseek-ai/deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    description: '284B MoE optimized for fast coding and agents, 1M context',
    contextWindow: '1M',
  },
  {
    id: 'deepseek-ai/deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    description: 'Efficient MoE architecture for coding tasks, 1M context',
    contextWindow: '1M',
  },
  {
    id: 'mistralai/mistral-nemotron',
    label: 'Mistral Nemotron',
    description: 'Built for agentic workflows — coding, instruction following, function calling',
    contextWindow: '128K',
  },
  {
    id: 'mistralai/mistral-small-4-119b-2603',
    label: 'Mistral Small 4 119B',
    description: 'Hybrid MoE unifying instruct, reasoning, and coding with multimodal input',
    contextWindow: '256K',
  },
  {
    id: 'google/gemma-4-31b-it',
    label: 'Gemma 4 31B',
    description: 'Dense 31B model delivering frontier reasoning for coding and agentic workflows',
    contextWindow: '128K',
  },
  {
    id: 'google/gemma-2-2b-it',
    label: 'Gemma 2 2B',
    description: 'Small language model for edge applications',
    contextWindow: '8K',
  },
  {
    id: 'qwen/qwen2.5-7b-instruct',
    label: 'Qwen 2.5 7B Instruct',
    description: 'Multilingual model with strong instruction following',
    contextWindow: '128K',
  },
  {
    id: 'qwen/qwen2.5-coder-32b-instruct',
    label: 'Qwen 2.5 Coder 32B',
    description: 'Specialized for code generation and technical tasks',
    contextWindow: '128K',
  },
] as const;

// Embedding models available on NVIDIA NIM
export const NVIDIA_EMBEDDING_MODELS: readonly NvidiaModel[] = [
  {
    id: 'nvidia/llama-nemotron-embed-1b-v2',
    label: 'Llama Nemotron Embed 1B v2',
    description: 'Multilingual embedding model for long-document QA retrieval (26 languages)',
    contextWindow: '8K',
    recommended: true,
  },
  {
    id: 'nvidia/nv-embed-v1',
    label: 'NV-Embed v1',
    description: 'High-quality numerical embeddings from text inputs',
    contextWindow: '4K',
  },
  {
    id: 'baai/bge-m3',
    label: 'BGE-M3',
    description: 'Embedding model excelling in dense, multi-vector, and sparse retrieval',
    contextWindow: '8K',
  },
] as const;

// OpenRouter suggested models (not exhaustive — OpenRouter has hundreds)
export const OPENROUTER_CHAT_MODELS: readonly NvidiaModel[] = [
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    label: 'Llama 3.3 70B Instruct',
    description: 'Latest Llama with advanced reasoning via OpenRouter',
    recommended: true,
  },
  {
    id: 'meta-llama/llama-3.1-8b-instruct',
    label: 'Llama 3.1 8B Instruct',
    description: 'Fast and efficient model via OpenRouter',
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    label: 'Claude 3.5 Sonnet',
    description: 'Anthropic Claude with excellent reasoning and writing',
  },
  {
    id: 'openai/gpt-4o-mini',
    label: 'GPT-4o Mini',
    description: 'OpenAI GPT-4o mini — fast and cost-effective',
  },
  {
    id: 'google/gemini-2.0-flash-001',
    label: 'Gemini 2.0 Flash',
    description: 'Google Gemini 2.0 Flash — fast multimodal model',
  },
] as const;

// Ollama suggested models (depends on what's installed locally)
export const OLLAMA_CHAT_MODELS: readonly NvidiaModel[] = [
  {
    id: 'llama3.1:8b',
    label: 'Llama 3.1 8B',
    description: 'Meta Llama 3.1 8B — recommended for VPS with limited GPU',
    recommended: true,
  },
  {
    id: 'llama3.1:70b',
    label: 'Llama 3.1 70B',
    description: 'Larger model — requires significant GPU memory',
  },
  {
    id: 'gemma3:12b',
    label: 'Gemma 3 12B',
    description: 'Google Gemma 3 12B — good balance of speed and quality',
  },
  {
    id: 'qwen2.5:7b',
    label: 'Qwen 2.5 7B',
    description: 'Multilingual model with strong instruction following',
  },
  {
    id: 'mistral:7b',
    label: 'Mistral 7B',
    description: 'Efficient model good for general tasks',
  },
] as const;

export function getChatModelsForProvider(provider: string): readonly NvidiaModel[] {
  switch (provider) {
    case 'nvidia-nim':
      return NVIDIA_CHAT_MODELS;
    case 'openrouter':
      return OPENROUTER_CHAT_MODELS;
    case 'ollama':
      return OLLAMA_CHAT_MODELS;
    default:
      return [];
  }
}

export function getEmbeddingModelsForProvider(provider: string): readonly NvidiaModel[] {
  switch (provider) {
    case 'nvidia-nim':
      return NVIDIA_EMBEDDING_MODELS;
    default:
      return [];
  }
}
