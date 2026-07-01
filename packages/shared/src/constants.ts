export const AppConstants = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  DEFAULT_LOCALE: 'pt-BR',
  SESSION_DURATION_MINUTES: 50,
  TOKEN_EXPIRY_SECONDS: 900,
  REFRESH_TOKEN_EXPIRY_SECONDS: 604800,
} as const;

export const QUEUE_NAMES = {
  transcription: 'transcription',
  analysis: 'analysis',
  summarization: 'summarization',
  notesGeneration: 'notes-generation',
  ragIndexing: 'rag-indexing',
  kbProcessing: 'kb-processing',
} as const;

export const WS_CHANNELS = {
  session: 'session',
  transcript: 'transcript',
  ai: 'ai',
  worker: 'worker',
} as const;

export const PASSWORD_RULES = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
} as const;

export const PHONE_REGEX = /^\+?[\d\s-]+$/;
