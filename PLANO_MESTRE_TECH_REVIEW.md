# Análise Técnica do Plano Mestre — Avesia

## Comitê: Backend | Segurança | DevOps/SRE | Arquitetura

**Data:** 04 de julho de 2026
**Documento avaliado:** `PLANO_MESTRE.md` (visão de Product Owner)
**Objetivo:** Avaliar viabilidade técnica real, não a visão estratégica.

---

## Infraestrutura atual (estado real)

| Recurso | Valor | Observação |
|---------|-------|------------|
| VPS | Contabo, 6 vCPU, 11GB RAM, 193GB disco | **Sem GPU** |
| Rede | WireGuard VPN, SSH chave-only, UFW | Seguro mas sem horizontal scale |
| Docker | 15 containers rodando simultaneamente | Avesia + SEO + Trivestia compartilham a VPS |
| Stack | Node.js (Fastify) + React (Vite) + Python (Celery) | 3 linguagens |
| Banco | PostgreSQL + pgvector + Redis + MinIO | Tudo na mesma VPS |
| AI Gateway | Ollama local (PC do Bruno) + NVIDIA NIM (cloud) | Failover configurado |
| Worker | Celery com 5 filas (transcription, analysis, etc.) | Concorrência=4 |
| Deploy | `deploy.sh` (rsync + docker compose) | Manual, sem CI/CD |
| Monitoramento | Nenhum | Sem Prometheus, sem Grafana, sem alertas |
| Backup | Nenhum automatizado | Risco crítico |
| Modelos Prisma | 29 modelos | Schema já tem Session, Transcript, ClinicalNote, etc. |

### Decisões do fundador (constraints inegociáveis)

1. **Sem CI/CD.** O fundador é o único desenvolvedor. Deploy manual via `deploy.sh` é o processo oficial. Confiança no próprio código.
2. **Sem GPU na VPS.** Não vai ter. Ponto final.
3. **Zero serviços pagos.** Nenhum. Nada de Whisper API, Backblaze, S3, AssemblyAI, GPU alugada. Tudo precisa rodar em infraestrutura existente (VPS + PC do Bruno) ou em free tiers.
4. **Transcrição roda no PC do Bruno.** Igual o Ollama já funciona — via WireGuard. O PC do Bruno tem GPU e processamento. Quando o PC está ligado, processa. Quando não está, a fila espera.
5. **Processamento de upload NÃO é rápido.** O usuário envia o áudio, esquece, e o sistema processa quando o worker local estiver disponível. Isso precisa ser comunicado claramente na UI.

### Limitações conhecidas

1. **Sem GPU na VPS** — Whisper (transcrição) roda no PC do Bruno via WireGuard, não na VPS
2. **11GB RAM compartilhado entre 15 containers** — já está em ~1.5GB usado, mas Avesia sozinha tem limite de 512MB (API) + 1GB (worker) + 1GB (postgres) + 512MB (minio) + 256MB (redis) = ~3.3GB
3. **Deploy é manual** — decisão do fundador. Sem CI/CD. O `deploy.sh` é o processo oficial.
4. **Sem backup** — se a VPS morrer, perde-se tudo. Precisa de solução gratuita.
5. **Single point of failure** — uma VPS, sem HA, sem replica. Se cair, tudo cai.
6. **Transcrição depende do PC do Bruno estar ligado** — não é 24/7. O usuário precisa ser informado disso.

---

## Resumo Executivo

**Viabilidade geral: O plano é estratégicamente correto e a maioria das features é viável com a infraestrutura atual, desde que aceitemos que processamento pesado (transcrição) é assíncrono e depende do PC local estar disponível.**

O documento de PO propõe 7 módulos com ~30 funcionalidades. A realidade:

- **~30% é viável hoje** com a infraestrutura atual (modificações no código existente)
- **~40% é viável com esforço moderado** (novas dependências, mudanças de schema, mesma VPS)
- **~15% é viável com a arquitetura de worker local** (transcrição no PC do Bruno via WireGuard)
- **~15% é inviável ou precisa ser redesenhado** (inteligência agregada multi-tenant, predição de desfechos)

A diferença crítica em relação à análise anterior: **não há custo recorrente**. Tudo roda em infraestrutura existente (VPS + PC do Bruno) ou free tiers (NVIDIA NIM). A transcrição não é instantânea, mas é gratuita e privada.

---

## Tabela de Viabilidade por Feature

### Módulo 1: Sessão Inteligente

| Feature | Viabilidade | Complexidade | Riscos | Observações |
|---------|-------------|--------------|--------|-------------|
| 1.1 Briefing pré-sessão | ✅ Viável hoje | **Baixa** | Baixo | Schema já tem ClinicalSession, AIAnalysis. É uma query + LLM call. Usar RAGOrchestrator existente. |
| 1.2 Copiloto em tempo real | ✅ Já existe | — | — | Já implementado (WebSocket + insights). Melhorar prompts, não reescrever. |
| 1.3 Análise pós-sessão | ✅ Viável hoje | **Baixa** | Baixo | Worker já tem fila `analysis`. Adicionar prompt de análise pós-sessão. |
| 1.4 Modo discreto/ativo | ✅ Viável hoje | **Baixa** | Baixo | Frontend toggle. WebSocket já existe. Só não enviar insights em modo discreto. |

### Módulo 2: Memória do Paciente

| Feature | Viabilidade | Complexidade | Riscos | Observações |
|---------|-------------|--------------|--------|-------------|
| 2.1 Timeline longitudinal | ✅ Viável hoje | **Média** | Médio | Query de sessões por paciente já é possível. Visualização (frontend) é o trabalho real. |
| 2.2 Perfil cognitivo do paciente | ⚠️ Viável com esforço | **Alta** | Alto | Exige novo modelo de dados. Simplificar para timeline JSON + embeddings + resumo acumulado (ver ajustes). |
| 2.3 Predição de temas e riscos | ❌ Invíável agora | **Muito alta** | Muito alto | Exige volume de dados que não existe. **Redesenhar**: apresentar como "padrões observados" (descritivo), não "predição" (preditivo). |

### Módulo 3: Conhecimento da Clínica

| Feature | Viabilidade | Complexidade | Riscos | Observações |
|---------|-------------|--------------|--------|-------------|
| 3.1 Grafo de conhecimento vivo | ✅ Já existe | — | — | Já implementado (KnowledgeConcept, KnowledgeRelation, comunidades). |
| 3.2 Detecção de lacunas | ✅ Viável hoje | **Média** | Baixo | Cruzar temas de sessões com conceitos do grafo. Query SQL + LLM. |
| 3.3 Onboarding inteligente | ✅ Viável hoje | **Baixa** | Baixo | É uma query no grafo de conhecimento. Já existe RAGOrchestrator. |
| 3.4 Sugestão de documentos na sessão | ✅ Viável hoje | **Baixa** | Baixo | RAGOrchestrator.retrieve() já faz isso. Integrar no copiloto. |

### Módulo 4: Prontuário Inteligente

| Feature | Viabilidade | Complexidade | Riscos | Observações |
|---------|-------------|--------------|--------|-------------|
| 4.1 SOAP automático | ✅ Viável hoje | **Baixa** | Médio | SOAP_NOTE_PROMPT já existe no ai-core. Worker já tem fila `notes-generation`. Conectar. |
| 4.2 Revisão e aprovação | ✅ Viável hoje | **Baixa** | Baixo | Frontend: editar + aprovar. ClinicalNote já existe no schema. |
| 4.3 Versionamento e auditoria | ⚠️ Viável com esforço | **Média** | Baixo | AuditLog já existe no schema. Adicionar versionamento de ClinicalNote (nova tabela ou JSON field). |
| 4.4 Códigos CID-11 automáticos | ⚠️ Viável com esforço | **Média** | Médio | LLM pode sugerir, mas precisa de ontologia CID-11 para validar. Sem validação, LLM inventa códigos. |

### Módulo 5: Observatório da Clínica

| Feature | Viabilidade | Complexidade | Riscos | Observações |
|---------|-------------|--------------|--------|-------------|
| 5.1 Dashboard clínico | ✅ Viável hoje | **Média** | Baixo | Queries SQL agregadas. Frontend com Recharts (já no projeto). |
| 5.2 Relatórios automáticos | ✅ Viável hoje | **Média** | Baixo | Mesmas queries, export PDF/CSV. |
| 5.3 Alertas gestores | ⚠️ Viável com esforço | **Média** | Médio | Precisa de cron/scheduler. Celery beat ou task periódica. Notificação por email/push. |

### Módulo 6: Ponte de Sessões (Upload)

| Feature | Viabilidade | Complexidade | Riscos | Observações |
|---------|-------------|--------------|--------|-------------|
| 6.1 Upload de áudio | ✅ Viável com worker local | **Alta** | Médio | **Transcrição roda no PC do Bruno via WireGuard**, igual Ollama. Áudio sobe pra VPS (MinIO), worker local baixa, transcreve, sobe a transcrição, áudio é deletado. Sem custo. Ver arquitetura detalhada abaixo. |
| 6.2 Processamento em lote | ✅ Viável hoje | **Média** | Médio | Celery já tem fila `transcription`. Throttling via `max_length` + concurrency. |
| 6.3 Vinculação com paciente | ✅ Viável hoje | **Baixa** | Baixo | Frontend: selecionar paciente ao fazer upload. |
| 6.4 Consentimento embutido | ✅ Viável hoje | **Média** | Médio | Model Consent já existe no schema. Workflow de aprovação precisa ser construído. |
| Destruição de áudio (P1) | ✅ Viável hoje | **Baixa** | Baixo | MinIO lifecycle rule + deleção explícita no worker. Simples. |
| Backpressure (P2) | ✅ Viável hoje | **Baixa** | Baixo | Celery `max_length` na fila + concurrency limit. Configuração, não código. |

### Módulo 7: Rede de Inteligência

| Feature | Viabilidade | Complexidade | Riscos | Observações |
|---------|-------------|--------------|--------|-------------|
| 7.1 Benchmarks anônimos | ❌ Inviável agora | **Muito alta** | Muito alto | Precisa de múltiplas clínicas (não temos). **Adiar para Fase 4.** |
| 7.2 Padrões emergentes | ❌ Inviável agora | **Muito alta** | Muito alto | Mesmo problema. Sem volume, padrões são ruído. |
| 7.3 Recomendações baseadas em evidência | ❌ Inviável agora | **Muito alta** | Crítico | Recomendação clínica sem validação = risco legal. |

---

## Análise Detalhada dos Pontos Críticos

### 1. Transcrição de áudio — arquitetura de worker local

**O problema:** O Módulo 6 (Ponte de Sessões) depende de transcrição de áudio. A VPS não tem GPU. O fundador não vai pagar por nenhum serviço cloud.

**Solução: Worker local no PC do Bruno via WireGuard.**

Já existe precedente: o Ollama roda no PC do Bruno e o AI Gateway na VPS acessa via `10.0.0.2:11434`. A transcrição segue o mesmo padrão, mas invertido — o worker local puxa trabalho da fila na VPS.

**Fluxo completo:**

```
1. Usuário faz upload do áudio na web
2. API salva áudio no MinIO (VPS) — bucket temporário, TTL 24h
3. API enfileira task na fila `transcription` (Redis na VPS)
4. Status da sessão: "Aguardando processamento"

   ─── O PC do Bruno precisa estar ligado ───

5. Worker local (PC do Bruno) conecta ao Redis da VPS via WireGuard
6. Worker local consome a task da fila `transcription`
7. Worker local baixa o áudio do MinIO (VPS) via WireGuard
8. Worker local transcreve com Whisper (GPU local)
9. Worker local sobe a transcrição para a API (VPS)
10. Worker local deleta o áudio do MinIO
11. API atualiza status: "Transcrição completa → Analisando"
12. Worker Python (VPS) processa a transcrição (análise, SOAP, etc.)
13. Status: "Pronto" → notifica usuário
```

**Vantagens:**
- **Custo zero** — Whisper roda na GPU do PC do Bruno
- **Privacidade máxima** — áudio nunca sai da rede WireGuard
- **Reutiliza padrão existente** — mesmo modelo do Ollama
- **Sem dependência de terceiros** — se OpenAI mudar pricing, não afeta

**Limitações (precisam ser comunicadas na UI):**
- **Não é instantâneo.** O processamento só acontece quando o PC do Bruno está ligado e o worker local está rodando
- **Throughput limitado.** Uma transcrição por vez (ou N, dependendo da GPU)
- **UX precisa gerenciar expectativas.** O usuário envia, esquece, e é notificado quando pronto

**Comunicação na UI:**

```
┌──────────────────────────────────────────────────┐
│  Upload enviado ✓                                │
│                                                  │
│  ⏳ Aguardando processamento                     │
│                                                  │
│  Sua sessão será processada assim que o          │
│  serviço de transcrição estiver disponível.      │
│  Você será notificado quando estiver pronta.     │
│                                                  │
│  Tempo estimado: algumas horas                   │
└──────────────────────────────────────────────────┘
```

**Futuro: notificação por email para o Bruno**

Quando um usuário solicita processamento, o sistema envia um email para o Bruno:
"Nova solicitação de transcrição — 3 áudios na fila"
O Bruno liga o PC, inicia o worker local, e a fila é processada.

Isso pode ser implementado com um endpoint simples na API que envia email via
SMTP gratuito (Gmail, Brevo free tier, etc.) — sem custo.

**Implementação técnica do worker local:**

```
PC do Bruno
├── Whisper (already installed? needs setup)
├── worker-local.py (novo script)
│   ├── Conecta ao Redis da VPS via WireGuard (10.0.0.1:6379)
│   ├── Consome fila `transcription`
│   ├── Baixa áudio do MinIO (10.0.0.1:9000)
│   ├── Roda Whisper localmente
│   ├── Envia transcrição via API (10.0.0.1:3100)
│   └── Deleta áudio do MinIO
└── Iniciado manualmente: python worker-local.py
```

O worker local é um script Python simples que:
1. Conecta ao Redis da VPS (via WireGuard, como o Celery já faz)
2. Consome mensagens da fila `transcription`
3. Baixa o áudio do MinIO
4. Transcreve com Whisper
5. Envia o resultado de volta para a API
6. Deleta o áudio

Não precisa ser um container Docker. Pode ser um script Python rodando no
venv do Bruno, iniciado manualmente quando ele quer processar a fila.

### 2. Inteligência agregada (Camada 3) — inviável agora

**O problema:** O plano propõe inteligência agregada entre clínicas (benchmarks, padrões emergentes, recomendações). Isso exige:

1. **Múltiplas clínicas** — hoje temos 0 ou 1 clínica cliente
2. **Volume de dados** — centenas de milhares de sessões
3. **Pipeline de anonimização** — não existe
4. **Validação estatística** — correlação sem significância clínica é perigosa
5. **Segundo banco de dados** — `avesia-network` separado do tenant

**Recomendação:** Remover Camada 3 do roadmap de curto e médio prazo. É uma feature de Fase 4 (18-36 meses), e só faz sentido com 50+ clínicas. Construir a infraestrutura agora é desperdício — não há dados pra agregar.

**O que fazer no curto prazo:** Coletar consentimento (model Consent já existe), mas não construir pipeline de agregação. Quando tiver volume, os dados já estarão consentidos.

### 3. Predição de desfechos — risco legal e técnico

**O problema:** O plano propõe "predição de melhora" e "radar de desfecho". Isso é:

1. **Tecnicamente inviável sem volume** — predição séria precisa de centenas de casos
2. **Legalmente arriscado** — predição clínica sem validação é responsabilidade profissional
3. **Eticamente questionável** — "70% de probabilidade de melhora" pode influenciar decisões clínicas incorretamente

**Recomendação:** Redesenhar como **descrição, não predição**:

- ❌ "70% de probabilidade de melhora nas próximas 10 sessões"
- ✅ "O paciente relatou melhora no sono nas últimas 3 sessões — tendência observada"

Descrição é fato. Predição é especulação. O LLM pode descrever padrões observados, mas não deve prever desfechos sem validação estatística.

### 4. Memória longitudinal — complexidade subestimada

**O problema:** O plano propõe "perfil cognitivo do paciente" como rede de conceitos que evolui. Isso é essencialmente um **segundo grafo de conhecimento, por paciente**.

O grafo de conhecimento da clínica já existe e foi difícil de construir. Replicar isso por paciente, para cada sessão, é:

- **Custo de processamento:** cada sessão precisa de extração de entidades + build de grafo
- **Custo de armazenamento:** 500 pacientes × 20 sessões × 50 conceitos = 500.000 nós
- **Custo de query:** cruzar grafo do paciente com grafo da clínica em tempo real

**Recomendação:** Simplificar. Em vez de grafo por paciente, usar:

1. **Timeline estruturada** (JSON no PostgreSQL) — eventos, temas, mudanças por sessão
2. **Embeddings por sessão** (pgvector) — similaridade entre sessões do mesmo paciente
3. **Resumo acumulado** (LLM) — atualizado a cada sessão, máximo 2000 tokens

Isso dá 80% do valor com 20% da complexidade. Grafo por paciente é Fase 3+.

### 5. Deploy — decisão do fundador

**Decisão:** Deploy manual via `deploy.sh`. Sem CI/CD.

**Justificativa do fundador:** Único desenvolvedor. Confia no próprio código. Testa localmente, manda pra produção.

**Riscos aceitos:**
- Deploy quebra produção → downtime manual até corrigir
- Sem rollback automatizado → precisa rsync de versão anterior
- Sem testes automatizados no pipeline → depende do teste local

**Mitigações recomendadas (opcionais, sem custo):**
- `deploy.sh` já faz smoke test pós-deploy (verifica API + Web + Gateway)
- Se smoke test falhar, o script poderia reverter automaticamente (rsync da versão anterior)
- Manter um tag git antes de cada deploy (`git tag pre-deploy-YYYYMMDD`) pra rollback rápido

**Posição do comitê:** A decisão é do fundador. O `deploy.sh` já tem smoke test. Recomendamos apenas adicionar um `git tag` antes de cada deploy pra facilitar rollback manual, mas não é bloqueador.

### 6. Backup — solução gratuita

**O problema:** Sem backup, um crash da VPS perde todos os dados. Precisa de solução gratuita.

**Solução: Backup local no PC do Bruno via WireGuard.**

```
VPS (cron a cada 6h)
├── pg_dump avesia > /tmp/avesia-backup-$(date +%Y%m%d-%H%M).sql.gz
├── my-vps --rsync /tmp/avesia-backup-*.sql.gz → PC do Bruno
└── Remove backups >7 dias (find -mtime +7 -delete)
```

**Vantagens:**
- Custo zero
- Backup fica no PC do Bruno (offline da VPS — se VPS morrer, backup safe)
- WireGuard já existe (transferência segura)
- `my-vps --rsync` já funciona

**Implementação:** Cron job na VPS que faz pg_dump + rsync pro PC do Bruno. Simples, gratuito, eficaz.

**Limitação:** O PC do Bruno precisa estar ligado no momento do backup. Se não estiver, o backup daquela janela pula. Aceitável —下次 que o PC ligar, o backup da próxima janela roda.

**Alternativa adicional (gratuita):** GitHub não serve pra backup de banco (limite de repo size), mas o pg_dump comprimido de uma clínica pequena é <100MB. Se quiser redundância extra, pode commitar o dump num repo privado (não ideal, mas funciona como cópia offline).

### 7. Segurança — auditoria

**Pontos positivos já implementados:**
- WireGuard VPN para SSH
- Chave SSH com rotação atômica
- Senhas removidas do código
- Secrets no .env (gitignored)
- UFW + fail2ban

**Pontos que precisam atenção:**

| Risco | Severidade | Status | Recomendação (gratuita) |
|-------|------------|--------|--------------------------|
| Sem backup do PostgreSQL | **Crítico** | Não implementado | pg_dump + rsync pro PC do Bruno via WireGuard (gratuito) |
| Sem HTTPS na API interna | Alto | Verificar | Nginx termina TLS. API interna é HTTP. Aceitável se não exposta. |
| MinIO sem encryption at rest | Médio | Não implementado | Habilitar SSE-S3 no MinIO (gratuito, nativo) |
| Sem rate limiting na API | Médio | Não implementado | Fastify rate-limit plugin (gratuito, já existe) |
| Logs podem conter dados sensíveis | Médio | Verificar | Estruturar logs para não incluir conteúdo de sessão |
| Sem WAF | Baixo | Não implementado | Cloudflare free tier na frente do Nginx (gratuito) |

---

## Lista de Ajustes Recomendados (V2 do documento)

### Ajuste 1: Remover Camada 3 (inteligência agregada) do roadmap de curto e médio prazo

**Motivo:** Sem volume de clínicas, é infraestrutura sem dados. Construir agora é desperdício.
**Ação:** Mover para Fase 4 (18-36 meses). Manter coleta de consentimento, mas não construir pipeline.

### Ajuste 2: Redesenhar "predição" como "descrição de padrões"

**Motivo:** Predição sem validação estatística é risco legal e técnico.
**Ação:** Trocar "predição de desfechos" por "identificação de padrões observados". LLM descreve, não prevê.

### Ajuste 3: Simplificar memória longitudinal

**Motivo:** Grafo por paciente é complexidade de Fase 3+.
**Ação:** Usar timeline JSON + embeddings por sessão + resumo acumulado. 80% do valor, 20% da complexidade.

### Ajuste 4: Transcrição via worker local no PC do Bruno

**Motivo:** Sem GPU na VPS, sem serviços pagos. PC do Bruno tem GPU e já acessa VPS via WireGuard.
**Ação:** Implementar worker local Python que consome fila `transcription` da VPS via WireGuard. Transcreve com Whisper local. Sem custo, máxima privacidade. Processamento é assíncrono e depende do PC estar ligado.

### Ajuste 5: Backup local gratuito via WireGuard

**Motivo:** Sem backup, crash da VPS perde tudo. Sem orçamento para storage cloud.
**Ação:** Cron job na VPS: pg_dump + rsync pro PC do Bruno via `my-vps --rsync`. Retenção 7 dias. Custo zero.

### Ajuste 6: Deploy manual é o processo oficial

**Motivo:** Decisão do fundador. Único dev, confia no próprio código.
**Ação:** Manter `deploy.sh` como processo oficial. Adicionar `git tag` antes de cada deploy pra rollback rápido. Sem CI/CD.

### Ajuste 7: Comunicar latência de processamento na UI

**Motivo:** Transcrição não é instantânea — depende do PC do Bruno estar ligado.
**Ação:** UI de upload deixa claro: "Aguardando processamento. Você será notificado quando estiver pronto." Sem promessa de tempo.

### Ajuste 8: Notificação por email para o Bruno (futuro)

**Motivo:** Bruno precisa saber quando tem áudio na fila pra ligar o PC.
**Ação:** Endpoint na API que envia email via SMTP gratuito (Brevo free tier, Gmail) quando nova task entra na fila `transcription`. Futuro próximo, não bloqueador.

---

## Roadmap Técnico Reordenado

### Fase 0: Fundação técnica (0-1 mês) — mínimo viável

| Item | Esforço | Risco se não fizer |
|------|---------|-------------------|
| Backup automatizado (pg_dump + rsync PC) | Baixo | **Perda total de dados** |
| MinIO lifecycle rule para áudio (TTL 24h) | Baixo | Áudio acumula indefinidamente |
| Rate limiting na API | Baixo | VPS derrubada por abuso |
| git tag antes de cada deploy | Baixo | Rollback difícil |

### Fase 1: Valor rápido (1-3 meses)

| Feature | Complexidade | Valor |
|---------|-------------|-------|
| Briefing pré-sessão | Baixa | Alto |
| SOAP automático | Baixa | Alto |
| Análise pós-sessão | Baixa | Médio |
| Modo discreto/ativo | Baixa | Médio |
| Dashboard clínico (básico) | Média | Médio |
| Detecção de lacunas | Média | Baixo |

### Fase 2: Diferenciação (3-6 meses)

| Feature | Complexidade | Valor |
|---------|-------------|-------|
| Worker local de transcrição (Whisper no PC) | Alta | Alto |
| Upload de áudio + processamento assíncrono | Alta | Alto |
| Processamento em lote | Média | Alto |
| Consentimento embutido | Média | Médio |
| Timeline longitudinal | Média | Alto |
| Observatório completo | Média | Médio |
| Onboarding inteligente | Baixa | Médio |

### Fase 3: Escala (6-12 meses)

| Feature | Complexidade | Valor |
|---------|-------------|-------|
| Memória longitudinal avançada | Alta | Alto |
| Perfil cognitivo do paciente (simplificado) | Alta | Médio |
| Alertas de risco | Média | Alto |
| API pública | Média | Médio |
| App mobile (PWA) | Média | Médio |
| Notificação por email (Brevo free tier) | Baixa | Médio |

### Fase 4: Rede (12-36 meses) — só com 50+ clínicas

| Feature | Complexidade | Valor |
|---------|-------------|-------|
| Inteligência agregada (Camada 3) | Muito alta | Alto |
| Benchmarks anônimos | Alta | Médio |
| Padrões emergentes | Muito alta | Alto |
| Expansão para psiquiatria | Alta | Alto |

---

## Arquitetura Simplificada Recomendada

```
┌─────────────────────────────────────────────────────────────┐
│  VPS (Contabo, 6 vCPU, 11GB RAM, sem GPU)                  │
│                                                             │
│  Docker Compose                                             │
│  ├── avesia-api (Fastify, 512MB)                           │
│  ├── avesia-web (Vite/React, 64MB)                         │
│  ├── avesia-worker (Celery, 1GB, concurrency=4)            │
│  ├── avesia-postgres (PostgreSQL + pgvector, 1GB)          │
│  ├── avesia-redis (256MB)                                  │
│  ├── avesia-minio (512MB, lifecycle: audio TTL 24h)        │
│  └── avesia-ai-gateway (failover Ollama → NIM)             │
│                                                             │
│  Novos:                                                     │
│  └── backup-cron (pg_dump → rsync PC Bruno a cada 6h)      │
│                                                             │
├─────────────────────── WireGuard ───────────────────────────┤
│                                                             │
│  PC do Bruno (GPU local)                                    │
│  ├── Ollama (LLM local, já existe)                         │
│  ├── worker-local.py (Whisper, novo)                       │
│  │   ├── Conecta ao Redis da VPS (10.0.0.1:6379)          │
│  │   ├── Consome fila `transcription`                      │
│  │   ├── Baixa áudio do MinIO (10.0.0.1:9000)             │
│  │   ├── Transcreve com Whisper (GPU local)               │
│  │   ├── Envia transcrição via API (10.0.0.1:3100)        │
│  │   └── Deleta áudio do MinIO                             │
│  └── Backups do PostgreSQL (recebe via rsync)              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Cloud (free tier apenas)                                   │
│  └── NVIDIA NIM (LLM fallback, free tier)                  │
└─────────────────────────────────────────────────────────────┘
```

**Custo total de infraestrutura: R$ 0/mês** (além da VPS que já paga)

**O que NÃO mudar agora:**
- Não adicionar Kubernetes — Docker Compose é suficiente
- Não adicionar CI/CD — deploy manual é a decisão
- Não adicionar segundo banco — PostgreSQL + pgvector aguenta
- Não adicionar grafo por paciente — timeline JSON é suficiente
- Não adicionar camada de inteligência agregada — sem volume
- Não adicionar serviços pagos — nenhum

**O que fazer agora:**
- Backup local via rsync (não negociável, gratuito)
- MinIO lifecycle rule para áudio (não negociável, gratuito)
- Rate limiting na API (gratuito)
- git tag antes de deploy (gratuito)

---

## Conclusão do Comitê

O plano de PO é estratégicamente correto. A visão de longo prazo é sólida. Com as decisões do fundador (sem CI/CD, sem serviços pagos, transcrição no PC local), a execução técnica fica mais simples e mais barata:

1. **Backup local via rsync é a única coisa urgente.** Sem custo, sem dependência externa. Fazer antes de qualquer feature nova.

2. **30% das features já existem ou são triviais.** Começar por elas (briefing, SOAP, análise pós-sessão) gera valor rápido sem risco.

3. **Transcrição via worker local é viável e gratuita.** O padrão já existe (Ollama). A UX precisa comunicar que não é instantâneo, mas isso é aceitável para processamento de histórico.

4. **15% das features são inviáveis agora.** Inteligência agregada e predição de desfechos precisam de volume. Adiar.

5. **Custo total: R$ 0/mês** além da VPS existente. Tudo roda em infraestrutura própria ou free tiers.

**O risco maior não é técnico nem financeiro — é de expectativa.** O usuário precisa entender que processamento de upload não é instantâneo. Se a UX comunicar isso corretamente, a solução funciona.
