// ─────────────────────────────────────────────────────────────────────────────
// Central de Ajuda — artigos e categorias
//
// Para adicionar um novo artigo, basta criar um objeto HelpArticle e incluí-lo
// na categoria apropriada em HELP_CATEGORIES. Não é necessária refatoração.
// ─────────────────────────────────────────────────────────────────────────────

export interface HelpArticle {
  readonly id: string;
  readonly title: string;
  readonly excerpt: string;
  readonly tags: readonly string[];
  readonly body: string; // Markdown
}

export interface HelpCategory {
  readonly id: string;
  readonly title: string;
  readonly icon: string; // lucide icon name
  readonly description: string;
  readonly articles: readonly HelpArticle[];
}

// ── Categorias ──────────────────────────────────────────────────────────────

export const HELP_CATEGORIES: readonly HelpCategory[] = [
  {
    id: 'getting-started',
    title: 'Primeiros Passos',
    icon: 'Rocket',
    description: 'Configuração inicial, onboarding e primeiros passos na plataforma.',
    articles: [
      {
        id: 'getting-started-overview',
        title: 'Visão geral da plataforma',
        excerpt: 'Conheça os principais módulos e como eles se conectam.',
        tags: ['introdução', 'visão geral', 'módulos'],
        body: `# Visão geral da plataforma

A Avesia é uma plataforma clínica que combina gestão de pacientes, sessões e inteligência artificial de apoio.

## Módulos principais

- **Dashboard** — visão geral com métricas e atividade recente
- **Pacientes** — cadastro, histórico e perfil clínico
- **Sessões** — agendamento, sala de sessão com co-piloto de IA
- **Base de Conhecimento** — biblioteca de documentos para a IA consultar
- **Processamento** — fila de transcrições e análises
- **Relatórios** — exportação de dados em CSV
- **Provedores de IA** — configuração de modelos (admin)
- **Chaves de API** — integrações externas (admin)
- **Configurações** — preferências da organização

## Fluxo básico

1. Cadastre seus pacientes em **Pacientes**
2. Crie uma sessão em **Sessões** e entre na sala
3. (Opcional) Faça upload de áudio para transcrição automática
4. Use o co-piloto para insights em tempo real
5. Gere nota SOAP e análise pós-sessão
6. Consulte relatórios e dashboards

## Inteligência artificial

A IA da Avesia atua como **ferramenta de apoio**. Ela pode gerar erros ou informações imprecisas. Todo conteúdo gerado deve ser revisado pelo profissional antes de ser utilizado em decisões clínicas.`,
      },
      {
        id: 'getting-started-onboarding',
        title: 'Onboarding: completando a configuração inicial',
        excerpt: 'Como usar a página de Onboarding para configurar sua conta rapidamente.',
        tags: ['onboarding', 'setup', 'configuração'],
        body: `# Onboarding

A página de **Onboarding** guia você pela configuração inicial da sua conta.

## Acessar

No menu lateral, clique em **Onboarding** (atalho: \`G O\`).

## O que o onboarding verifica

- **Documentos na Base de Conhecimento** — quanto mais documentos, melhor a IA
- **Conceitos extraídos** — entidades detectadas pela IA nos documentos
- **Tópicos identificados** — temas agrupados automaticamente
- **Pacientes cadastrados** — mínimo recomendado para começar
- **Sessões realizadas** — para validar o fluxo completo

## Sugestões da IA

A página mostra sugestões personalizadas baseadas no conteúdo da sua Base de Conhecimento, como:
- Tópicos que podem enriquecer sua KB
- Especialidades sugeridas
- Ações rápidas para completar o setup

## Progresso

A barra de progresso mostra quanto da configuração inicial está completa. Busque atingir 100% antes de usar a IA em sessões reais.`,
      },
      {
        id: 'getting-started-roles',
        title: 'Permissões e papéis (OWNER, ADMIN, PROFESSIONAL)',
        excerpt: 'Entenda o que cada papel pode fazer na plataforma.',
        tags: ['roles', 'permissões', 'admin', 'rbac'],
        body: `# Permissões e papéis

A Avesia usa três papéis principais:

## OWNER (Proprietário)
- Acesso total a todas as funcionalidades
- Pode gerenciar provedores de IA e chaves de API
- Pode alterar configurações da organização
- Pode convidar e gerenciar usuários

## ADMIN (Administrador)
- Pode gerenciar provedores de IA e chaves de API
- Pode acessar todas as áreas operacionais
- Pode gerenciar pacientes e sessões

## PROFESSIONAL (Profissional)
- Acesso a pacientes e sessões atribuídos a ele
- Pode usar o co-piloto e gerar notas
- Não tem acesso a configurações administrativas

## Como mudar papéis

Apenas o OWNER pode alterar papéis de outros usuários. Isso é feito na página de **Configurações**.`,
      },
    ],
  },
  {
    id: 'patients',
    title: 'Pacientes',
    icon: 'Users',
    description: 'Cadastro, gerenciamento e histórico de pacientes.',
    articles: [
      {
        id: 'patients-managing',
        title: 'Cadastrando e gerenciando pacientes',
        excerpt: 'Como criar, editar e organizar pacientes na plataforma.',
        tags: ['pacientes', 'cadastro', 'crud'],
        body: `# Gerenciando pacientes

## Criar um paciente

1. Vá em **Pacientes** (atalho: \`G P\`)
2. Clique em **Novo Paciente**
3. Preencha nome, data de nascimento e informações de contato
4. Clique em **Salvar**

## Editar um paciente

1. Clique no paciente na lista
2. Na página de detalhe, clique em **Editar**
3. Faça as alterações e salve

## Excluir (soft delete)

A exclusão de pacientes é **soft** — os dados não são removidos imediatamente, apenas marcados como excluídos. Isso permite recuperação em caso de erro.

## Atribuir profissionais

Profissionais podem ser atribuídos a pacientes. Um paciente pode ter múltiplos profissionais responsáveis.`,
      },
      {
        id: 'patients-import-csv',
        title: 'Importação de pacientes via CSV',
        excerpt: 'Como importar múltiplos pacientes de uma vez usando arquivo CSV.',
        tags: ['importação', 'csv', 'pacientes', 'bulk'],
        body: `# Importação via CSV

A importação em massa permite cadastrar vários pacientes de uma vez.

## Formato do CSV

O arquivo deve conter as colunas:
- \`name\` (obrigatório) — nome completo
- \`dateOfBirth\` — data de nascimento (YYYY-MM-DD)
- \`email\` — email de contato
- \`phone\` — telefone
- \`notes\` — observações

## Como importar

1. Vá em **Pacientes**
2. Clique em **Importar CSV**
3. Selecione o arquivo
4. Veja o preview e mapeamento de colunas
5. Confirme a importação

## Resultado

Após a importação, você verá:
- Quantos pacientes foram importados
- Quantos foram ignorados (duplicados)
- Detalhes de erros, se houver`,
      },
      {
        id: 'patients-timeline',
        title: 'Timeline e histórico do paciente',
        excerpt: 'Como visualizar o histórico completo de um paciente.',
        tags: ['timeline', 'histórico', 'sessões'],
        body: `# Timeline do paciente

A página de detalhe do paciente mostra uma **timeline** com todos os eventos:

- Sessões realizadas
- Notas clínicas geradas
- Alertas clínicos
- Consentimentos
- Anexos

## Navegação

1. Clique em um paciente na lista
2. A timeline aparece na página de detalhe
3. Use os filtros para ver apenas tipos específicos de eventos

## Memória do paciente

A Avesia mantém uma **memória longitudinal** do paciente — um resumo que evolui conforme novas sessões são adicionadas. Isso ajuda a IA a dar insights mais contextuais.`,
      },
    ],
  },
  {
    id: 'sessions',
    title: 'Sessões',
    icon: 'Calendar',
    description: 'Agendamento, sala de sessão, transcrição e co-piloto de IA.',
    articles: [
      {
        id: 'sessions-creating',
        title: 'Criando e agendando sessões',
        excerpt: 'Como criar sessões e associá-las a pacientes.',
        tags: ['sessões', 'agendamento', 'criar'],
        body: `# Criando sessões

## Nova sessão

1. Vá em **Sessões** (atalho: \`G S\`)
2. Clique em **Nova Sessão**
3. Selecione o paciente
4. Escolha o tipo (Inicial, Retorno, Emergência)
5. Defina data, hora e modalidade (Presencial, Vídeo, Telefone)
6. Salve

## Status

- **Agendada** — criada mas ainda não iniciada
- **Em andamento** — sala de sessão aberta
- **Concluída** — finalizada com análise
- **Cancelada** — cancelada pelo profissional`,
      },
      {
        id: 'sessions-room',
        title: 'Sala de sessão: visão geral',
        excerpt: 'Conheça os recursos da sala de sessão em tempo real.',
        tags: ['sala', 'sessão', 'real-time', 'websocket'],
        body: `# Sala de sessão

A sala de sessão é o espaço de trabalho em tempo real durante o atendimento.

## Recursos

- **Transcrição ao vivo** — texto da conversa em tempo real
- **Co-piloto clínico** — insights da IA baseados na conversa e na KB
- **Briefing pré-sessão** — resumo do histórico do paciente antes de começar
- **Nota SOAP** — geração automática de nota estruturada
- **Análise pós-sessão** — resumo + análise clínica ao final

## Modos do co-piloto

- **Discreto** — insights aparecem apenas quando solicitados
- **Ativo** — insights são gerados automaticamente conforme a conversa

## Aviso de IA

Todo conteúdo gerado pela IA é uma **ferramenta de apoio** e pode conter erros. Revise antes de usar em decisões clínicas.`,
      },
      {
        id: 'sessions-audio-upload',
        title: 'Upload de áudio para transcrição',
        excerpt: 'Como enviar áudios para transcrição automática via Whisper.',
        tags: ['áudio', 'transcrição', 'upload', 'whisper'],
        body: `# Upload de áudio

## Como enviar

1. Na sala de sessão, clique em **Upload de Áudio**
2. Selecione o arquivo de áudio (MP3, WAV, M4A, etc.)
3. O áudio é enviado para o worker de transcrição
4. A transcrição aparece automaticamente quando pronta

## Processamento

O processamento é assíncrono:
1. Áudio enviado para armazenamento (MinIO)
2. Tarefa enfileirada no Redis
3. Worker Python (Whisper) processa
4. Transcrição enviada de volta para a API
5. Áudio **excluído** do armazenamento após transcrição

## Verificar status

Na página **Processamento** você pode ver o status de todas as transcrições em fila.`,
      },
      {
        id: 'sessions-briefing',
        title: 'Briefing pré-sessão',
        excerpt: 'Como gerar e usar o briefing antes de atender o paciente.',
        tags: ['briefing', 'pré-sessão', 'ia'],
        body: `# Briefing pré-sessão

O briefing é um resumo gerado pela IA baseado no histórico do paciente e na Base de Conhecimento.

## Quando usar

Antes de iniciar a sessão, clique em **Briefing** na sala de sessão.

## O que inclui

- Resumo das sessões anteriores
- Temas recorrentes
- Tópicos relevantes da KB
- Sugestões de abordagem

## Importante

O briefing é uma **sugestão da IA**. Ele pode conter imprecisões. Use como ponto de partida, não como verdade absoluta.`,
      },
      {
        id: 'sessions-soap',
        title: 'Nota SOAP automática',
        excerpt: 'Geração de notas clínicas estruturadas no formato SOAP.',
        tags: ['soap', 'nota', 'clínica', 'ia'],
        body: `# Nota SOAP

A nota SOAP é um formato estruturado de documentação clínica:

- **S** (Subjective) — queixas e relato do paciente
- **O** (Objective) — observações objetivas
- **A** (Assessment) — avaliação clínica
- **P** (Plan) — plano de tratamento

## Como gerar

1. Na sala de sessão, após a sessão, clique em **Nota SOAP**
2. A IA gera um rascunho baseado na transcrição
3. Revise e edite cada seção
4. Salve como nota clínica

## Rascunho

A nota gerada fica como **DRAFT** até ser finalizada por um profissional. Sempre revise antes de finalizar.`,
      },
      {
        id: 'sessions-post-analysis',
        title: 'Análise pós-sessão',
        excerpt: 'Resumo e análise clínica gerados ao final da sessão.',
        tags: ['análise', 'pós-sessão', 'resumo', 'ia'],
        body: `# Análise pós-sessão

Ao final de uma sessão, você pode gerar uma **análise pós-sessão** que inclui:

- **Resumo** da sessão
- **Análise clínica** (humor, risco, temas, etc.)

## Como gerar

1. Na sala de sessão, clique em **Análise**
2. A IA processa a transcrição em paralelo (resumo + análise)
3. Os resultados aparecem no diálogo

## Persistência

A análise é salva no banco de dados e fica disponível na timeline do paciente e na memória longitudinal.`,
      },
    ],
  },
  {
    id: 'knowledge-base',
    title: 'Base de Conhecimento',
    icon: 'BookOpen',
    description: 'Documentos, grafo de conhecimento e GraphRAG.',
    articles: [
      {
        id: 'kb-overview',
        title: 'O que é a Base de Conhecimento',
        excerpt: 'Entenda como a KB alimenta a IA da Avesia.',
        tags: ['kb', 'conhecimento', 'grafo', 'rag'],
        body: `# Base de Conhecimento

A Base de Conhecimento (KB) é a biblioteca de documentos que a IA consulta para dar insights contextuais.

## Como funciona

1. Você faz upload de documentos (PDF, DOCX, TXT)
2. O worker Python processa cada documento:
   - Extrai texto
   - Divide em chunks
   - Gera embeddings
   - Extrai entidades (NER)
   - Constrói o grafo de conhecimento
   - Resume e classifica
3. Quando a IA precisa responder, ela busca na KB usando **GraphRAG**

## Grafo de conhecimento

O grafo é a "rede neural" da sua clínica:
- **Conceitos** — entidades extraídas (transtornos, técnicas, medicamentos)
- **Tópicos** — temas agrupados
- **Relações** — conexões entre conceitos (TREATS, CAUSES, IS_A, etc.)
- **Comunidades** — clusters de conceitos relacionados

## Multi-tenant

Cada organização tem sua própria KB isolada. Não há vazamento de dados entre clínicas.`,
      },
      {
        id: 'kb-upload',
        title: 'Fazendo upload de documentos',
        excerpt: 'Como adicionar PDFs, DOCX e TXTs à Base de Conhecimento.',
        tags: ['upload', 'documentos', 'pdf', 'docx'],
        body: `# Upload de documentos

## Como enviar

1. Vá em **Base de Conhecimento** (atalho: \`G K\`)
2. Selecione a KB (ou crie uma nova)
3. Clique em **Upload**
4. Selecione o arquivo (PDF, DOCX, TXT)

## Status do processamento

Após o upload, o documento passa por estágios:
- **PENDING** — na fila
- **EXTRACTING** — extraindo texto
- **CHUNKING** — dividindo em partes
- **EMBEDDING** — gerando vetores
- **ENTITY_EXTRACTION** — extraindo conceitos
- **GRAPH_BUILDING** — construindo relações
- **COMPLETED** — pronto para uso
- **FAILED** — erro no processamento

## Acompanhar progresso

A página de KB mostra o progresso em tempo real. Documentos grandes podem levar alguns minutos.`,
      },
      {
        id: 'kb-query',
        title: 'Consultando a KB (GraphRAG)',
        excerpt: 'Como fazer perguntas diretamente à Base de Conhecimento.',
        tags: ['query', 'rag', 'pergunta', 'busca'],
        body: `# Consultando a KB

## Como consultar

1. Na página de KB, use a barra de consulta
2. Digite sua pergunta em linguagem natural
3. A IA busca no grafo e nos chunks relevantes
4. Retorna uma resposta com **fontes** (chunks e documentos)

## GraphRAG

A Avesia usa **GraphRAG** — uma técnica que combina:
- Busca vetorial (semântica)
- Busca por palavra-chave
- Expansão pelo grafo de conhecimento
- Diversificação MMR

Isso resulta em respostas mais contextuais e menos redundantes que RAG tradicional.

## Fontes

Cada resposta mostra os chunks e documentos que foram usados como contexto. Clique para ver o trecho original.`,
      },
    ],
  },
  {
    id: 'ai',
    title: 'Inteligência Artificial',
    icon: 'Sparkles',
    description: 'Co-piloto, transcrição, análise e configuração de IA.',
    articles: [
      {
        id: 'ai-disclaimer',
        title: 'Aviso de IA: ferramenta de apoio, não substituto',
        excerpt: 'Importante: a IA pode errar. Sempre revise antes de usar.',
        tags: ['aviso', 'ia', 'responsabilidade', 'segurança'],
        body: `# Aviso de uso de IA

## A IA é uma ferramenta de apoio

A inteligência artificial da Avesia atua **exclusivamente como ferramenta de apoio** ao profissional responsável.

## Pode conter erros

As respostas, análises, transcrições e sugestões geradas pela IA **podem conter erros ou informações imprecisas**.

## Não substitui o profissional

A IA **não substitui** a análise, julgamento clínico e decisão do profissional. Todo conteúdo gerado deve ser **revisado criticamente** antes de ser utilizado.

## Transcrições

Transcrições automáticas podem conter erros de reconhecimento, especialmente com:
- Ruído ambiente
- Sotaques regionais
- Terminologia técnica especializada

## Análises e relatórios

Análises clínicas, resumos e notas SOAP são **sugestões iniciais** que devem ser validadas pelo profissional.

## Onde ver o aviso

Você verá avisos discretos da IA em:
- Sala de sessão (co-piloto)
- Diálogos de briefing, SOAP e análise
- Consultas à Base de Conhecimento`,
      },
      {
        id: 'ai-providers',
        title: 'Configurando provedores de IA',
        excerpt: 'Como escolher entre NVIDIA NIM, OpenRouter e Ollama.',
        tags: ['provedores', 'nvidia', 'openrouter', 'ollama', 'config'],
        body: `# Provedores de IA

A Avesia suporta múltiplos provedores de IA. Apenas **OWNER** e **ADMIN** podem configurar.

## Provedores disponíveis

### NVIDIA NIM (recomendado para VPS)
- Cloud, free tier
- Chat + embeddings
- Modelo padrão: \`meta/llama-3.1-8b-instruct\`
- Embeddings: \`nvidia/llama-nemotron-embed-1b-v2\`

### OpenRouter
- Cloud, chat only (sem embeddings)
- Múltiplos modelos disponíveis

### Ollama
- Local, requer GPU
- Pode instabilizar sob carga concorrente

## Como configurar

1. Vá em **Provedores de IA** (atalho: \`G A\`)
2. Selecione o provedor ativo
3. Configure a API key (se necessário)
4. Teste a conexão

## Troca sem código

Trocar de provedor requer apenas mudar a configuração — não é preciso alterar código.`,
      },
      {
        id: 'ai-copilot',
        title: 'Co-piloto clínico em tempo real',
        excerpt: 'Como o co-piloto funciona e como configurá-lo.',
        tags: ['copilot', 'tempo real', 'insights', 'websocket'],
        body: `# Co-piloto clínico

O co-piloto é a IA que assiste durante a sessão em tempo real.

## Como ativar

Na sala de sessão, o co-piloto pode ser ativado/desativado. Configure em **Configurações** no painel do co-piloto.

## Modos

- **Discreto** — você clica em "Analisar" para gerar insights
- **Ativo** — insights são gerados automaticamente conforme a conversa

## Intensidade

A intensidade controla com que frequência o co-piloto gera insights no modo ativo.

## O que o co-piloto faz

- Analisa os últimos turnos da conversa
- Busca contexto na Base de Conhecimento (GraphRAG)
- Sugere intervenções, técnicas e observações
- Identifica conceitos mencionados

## Importante

Os insights são **sugestões**. Sempre use seu julgamento clínico.`,
      },
    ],
  },
  {
    id: 'data-privacy',
    title: 'Dados e Privacidade',
    icon: 'Lock',
    description: 'LGPD, retenção de dados, consentimentos e segurança.',
    articles: [
      {
        id: 'privacy-lgpd',
        title: 'LGPD e consentimento de pacientes',
        excerpt: 'Como a Avesia lida com consentimento e dados de pacientes.',
        tags: ['lgpd', 'consentimento', 'privacidade', 'lgpd'],
        body: `# LGPD e consentimento

## Consentimento

Antes de gravar ou processar dados de um paciente, é necessário obter **consentimento**. A Avesia permite registrar consentimentos LGPD.

## Como registrar

1. Na página do paciente, use a seção de **Consentimentos**
2. Selecione o tipo de consentimento
3. Registre data e detalhes

## Direitos do titular

Conforme a LGPD, o titular dos dados pode solicitar:
- Acesso aos dados
- Correção
- Exclusão

Use a página de **Relatórios** para exportar dados de um paciente específico quando solicitado.`,
      },
      {
        id: 'privacy-retention',
        title: 'Política de retenção de dados',
        excerpt: 'Por quanto tempo os dados são mantidos.',
        tags: ['retenção', 'expiração', 'dados', 'áudio'],
        body: `# Retenção de dados

## Áudios

Os áudios enviados para transcrição são **excluídos imediatamente** após a transcrição ser concluída. Eles não são armazenados permanentemente.

## Transcrições e análises

Transcrições e análises geradas pela IA **expiram em 90 dias** por padrão. Isso pode ser configurado pela organização.

## Dados de pacientes

Dados de pacientes (cadastro, notas clínicas) são mantidos enquanto a conta estiver ativa. A exclusão é **soft** — os dados são marcados como excluídos mas podem ser recuperados.

## Exclusão permanente

Para exclusão permanente, entre em contato com o suporte.`,
      },
      {
        id: 'privacy-security',
        title: 'Segurança da plataforma',
        excerpt: 'Como a Avesia protege seus dados.',
        tags: ['segurança', 'criptografia', 'tls', 'vpn'],
        body: `# Segurança

## Criptografia

- **Em trânsito**: TLS para todas as conexões
- **Em repouso**: banco de dados criptografado

## Autenticação

- Senhas com hash (bcrypt)
- JWT com rotação de refresh tokens
- Detecção de reuso de tokens

## Acesso

- Multi-tenant: cada clínica tem dados isolados
- RBAC: permissões por papel (OWNER, ADMIN, PROFESSIONAL)
- Audit log: todas as ações sensíveis são registradas

## Infraestrutura

- Redis com senha em produção
- Acesso a serviços internos via WireGuard VPN
- UFW firewall no VPS`,
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Solução de Problemas',
    icon: 'Wrench',
    description: 'Problemas comuns e como resolvê-los.',
    articles: [
      {
        id: 'troubleshooting-ai-not-working',
        title: 'A IA não está respondendo',
        excerpt: 'O que verificar quando a IA não gera respostas.',
        tags: ['ia', 'erro', 'provedor', 'debug'],
        body: `# A IA não está respondendo

## Verificações

1. **Provedor de IA ativo** — vá em **Provedores de IA** e verifique se há um provedor ativo e com conexão OK
2. **API key válida** — se usando OpenRouter ou NVIDIA NIM, verifique se a API key está correta
3. **Base de Conhecimento** — se a KB está vazia, a IA pode não ter contexto suficiente
4. **Termos aceitos** — se você não aceitou o Aviso de IA, as funcionalidades de IA são bloqueadas

## Erro de conexão

Se o provedor retorna erro de conexão:
- Verifique sua internet
- Verifique se o provedor está online (status page)
- Tente trocar para outro provedor temporariamente

## Sem contexto

Se a IA responde mas com baixa qualidade:
- Adicione mais documentos à KB
- Verifique se os documentos estão COMPLETED
- Consulte a KB diretamente para testar`,
      },
      {
        id: 'troubleshooting-transcription-stuck',
        title: 'Transcrição travada / não processa',
        excerpt: 'O que fazer quando uma transcrição fica pendente.',
        tags: ['transcrição', 'áudio', 'worker', 'stuck'],
        body: `# Transcrição travada

## Verificar

1. Vá em **Processamento** (atalho: \`G P\`)
2. Veja o status da transcrição
3. Se está PENDING há muito tempo, o worker pode estar offline

## Worker offline

A transcrição é feita por um worker Python (Whisper). Se ele não estiver rodando:
- As transcrições ficam na fila indefinidamente
- Verifique com o administrador se o worker está ativo

## Reenviar

Se o áudio falhou no processamento:
1. Verifique o formato do arquivo (MP3, WAV, M4A)
2. Verifique o tamanho (muito grande pode dar timeout)
3. Tente reenviar

## Áudio foi excluído

Se a transcrição falhou, o áudio já pode ter sido excluído. Nesse caso, será necessário reenviar o arquivo.`,
      },
      {
        id: 'troubleshooting-login',
        title: 'Problemas de login',
        excerpt: 'Não consegue entrar? Veja as soluções.',
        tags: ['login', 'senha', 'acesso', 'auth'],
        body: `# Problemas de login

## Senha incorreta

Verifique se a senha está correta. Se esqueceu, entre em contato com o administrador da sua organização para redefinir.

## Conta desativada

Se sua conta foi desativada, você verá uma mensagem de erro. Contate o administrador.

## Termos pendentes

Após o login, se houver termos pendentes (Termos de Uso, Aviso de IA), você precisa aceitar antes de acessar a plataforma. O diálogo aparece automaticamente.

## Sessão expirada

Se sua sessão expirou, o sistema tentará refresh automático. Se falhar, você será redirecionado para o login.`,
      },
      {
        id: 'troubleshooting-terms',
        title: 'Termos de uso: aceite e re-aceite',
        excerpt: 'Por que preciso aceitar os termos novamente?',
        tags: ['termos', 'aceite', 'versão', 'consentimento'],
        body: `# Termos de uso

## Por que preciso aceitar de novo?

Quando uma nova versão dos termos é publicada, **todos os usuários** precisam aceitar novamente. Isso garante que você está ciente das mudanças.

## O que é registrado

Ao aceitar, registramos:
- **Data e hora** do aceite
- **Versão** dos termos aceita
- **Identificação** do usuário
- **IP** e **User-Agent**

## Onde ver meus aceites

Os aceites são registrados no audit log. Contate o administrador se precisar de um relatório.

## Recusar

Se você não aceitar os termos, não poderá utilizar a plataforma. O aceite é obrigatório para acessar funcionalidades, especialmente as de IA.`,
      },
    ],
  },
  {
    id: 'integrations',
    title: 'Integrações e API',
    icon: 'Plug',
    description: 'Chaves de API, integrações externas e worker local.',
    articles: [
      {
        id: 'api-keys',
        title: 'Chaves de API para integrações',
        excerpt: 'Como criar e gerenciar chaves de API para acesso externo.',
        tags: ['api', 'chaves', 'integração', 'admin'],
        body: `# Chaves de API

As chaves de API permitem que sistemas externos acessem a API da Avesia de forma segura.

## Criar uma chave

1. Vá em **Chaves de API** (atalho: \`G V\`) — apenas OWNER/ADMIN
2. Clique em **Nova Chave**
3. Defina um nome e data de expiração
4. A chave é mostrada **apenas uma vez** — guarde bem

## Revogar

Você pode revogar uma chave a qualquer momento. Acesso é interrompido imediatamente.

## Uso

Use a chave no header: \`Authorization: Bearer <sua-chave>\`

## Segurança

- Nunca compartilhe sua chave
- Use datas de expiração curtas quando possível
- Revogue chaves não utilizadas`,
      },
      {
        id: 'worker-local',
        title: 'Worker local de transcrição (Whisper)',
        excerpt: 'Como configurar o worker Python local para transcrição.',
        tags: ['worker', 'whisper', 'python', 'local', 'transcrição'],
        body: `# Worker local de transcrição

O worker Python processa transcrições de áudio usando Whisper.

## Requisitos

- Python 3.11+
- FFmpeg
- GPU recomendada (mas não obrigatório)

## Configuração

1. Copie o arquivo \`.env-worker-local.example\` para \`.env-worker-local\`
2. Configure as variáveis (endpoint da API, Redis, MinIO)
3. Use o script \`start-worker-local.sh\` para iniciar

## Ambiente

O worker pode rodar:
- **Dev**: na mesma máquina que a API
- **Produção**: em uma máquina separada, acessando via WireGuard VPN

## Health check

O worker envia heartbeats para a API. Se parar de enviar, a API marca como offline.

## Verificar

Na página de **Processamento**, você pode ver o status do worker.`,
      },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** All articles flattened, for search */
export const ALL_HELP_ARTICLES: readonly HelpArticle[] = HELP_CATEGORIES.flatMap((c) => c.articles);

/** Find article by id */
export function findHelpArticle(id: string): { article: HelpArticle; category: HelpCategory } | null {
  for (const category of HELP_CATEGORIES) {
    const article = category.articles.find((a) => a.id === id);
    if (article) return { article, category };
  }
  return null;
}

/** Search articles by query (title, excerpt, tags, body) */
export function searchHelpArticles(query: string): readonly HelpArticle[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return ALL_HELP_ARTICLES.filter((a) => {
    return (
      a.title.toLowerCase().includes(q) ||
      a.excerpt.toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q)) ||
      a.body.toLowerCase().includes(q)
    );
  });
}
