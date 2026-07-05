-- CreateTable
CREATE TABLE "terms_versions" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terms_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_acceptances" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "terms_version_id" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "terms_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "terms_versions_type_version_key" ON "terms_versions"("type", "version");
CREATE INDEX "terms_versions_type_is_active_idx" ON "terms_versions"("type", "is_active");
CREATE UNIQUE INDEX "terms_acceptances_user_id_terms_version_id_key" ON "terms_acceptances"("user_id", "terms_version_id");
CREATE INDEX "terms_acceptances_user_id_idx" ON "terms_acceptances"("user_id");

-- AddForeignKey
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_terms_version_id_fkey" FOREIGN KEY ("terms_version_id") REFERENCES "terms_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed initial terms versions
INSERT INTO "terms_versions" ("id", "type", "version", "title", "content", "summary", "is_active", "published_at", "created_at", "updated_at") VALUES
(
  'terms_v1',
  'TERMS_OF_USE',
  '1.0.0',
  'Termos de Uso',
  '# Termos de Uso — Avesia

## 1. Aceitação dos Termos
Ao acessar e utilizar a plataforma Avesia, você concorda com estes Termos de Uso. Se não concordar com qualquer parte destes termos, não utilize a plataforma.

## 2. Descrição do Serviço
Avesia é uma plataforma de apoio clínico que utiliza inteligência artificial para auxiliar profissionais de saúde no gerenciamento de pacientes, transcrição de sessões, geração de relatórios e análise clínica.

## 3. Responsabilidades do Usuário
- O usuário é responsável pela precisão das informações inseridas na plataforma.
- O usuário é responsável por obter consentimento adequado de pacientes para gravação e processamento de dados.
- O usuário deve manter a confidencialidade de suas credenciais de acesso.

## 4. Uso Aceitável
- Não utilizar a plataforma para fins ilegais ou não autorizados.
- Não tentar acessar dados de outros usuários ou organizações.
- Não compartilhar credenciais de acesso.

## 5. Limitação de Responsabilidade
A plataforma é fornecida "como está", sem garantias expressas ou implícitas. Avesia não se responsabiliza por decisões clínicas tomadas com base nas informações geradas pela plataforma.

## 6. Modificações
Estes termos podem ser atualizados periodicamente. Usuários serão notificados e deverão aceitar a nova versão para continuar utilizando a plataforma.

## 7. Encerramento
Avesia reserva-se o direito de suspender ou encerrar contas que violem estes termos.',
  'Ao usar a Avesia, você concorda com os termos de uso do serviço, incluindo responsabilidades do usuário e limitações de responsabilidade.',
  true,
  NOW(),
  NOW(),
  NOW()
),
(
  'ai_notice_v1',
  'AI_NOTICE',
  '1.0.0',
  'Aviso de Uso de Inteligência Artificial',
  '# Aviso de Uso de Inteligência Artificial

## Ferramenta de Apoio
A inteligência artificial utilizada na Avesia atua exclusivamente como **ferramenta de apoio** ao profissional responsável. As respostas, análises, transcrições e sugestões geradas pela IA **podem conter erros ou informações imprecisas**.

## Não Substitui o Profissional
A IA **não substitui** a análise, julgamento clínico e decisão do profissional responsável. Todo conteúdo gerado deve ser **revisado criticamente** antes de ser utilizado em decisões operacionais ou clínicas.

## Transcrições de Áudio
As transcrições automáticas podem conter erros de reconhecimento de fala, especialmente em contextos com ruído, sotaques regionais ou terminologia técnica especializada.

## Análises e Relatórios
Análises clínicas, resumos e notas SOAP gerados pela IA são sugestões iniciais que devem ser validadas e complementadas pelo profissional.

## Privacidade e Dados
Dados processados pela IA seguem a política de privacidade da plataforma. Áudios são excluídos após a transcrição. Transcrições e análises expiram conforme a política de retenção.

## Consentimento do Paciente
É responsabilidade do profissional obter o consentimento adequado do paciente para gravação e processamento de dados por IA.',
  'A IA é uma ferramenta de apoio que pode gerar erros. Não substitui a análise e decisão do profissional. Todo conteúdo deve ser revisado antes do uso.',
  true,
  NOW(),
  NOW(),
  NOW()
),
(
  'privacy_v1',
  'PRIVACY_POLICY',
  '1.0.0',
  'Política de Privacidade',
  '# Política de Privacidade — Avesia

## 1. Coleta de Dados
A Avesia coleta dados necessários para o funcionamento da plataforma, incluindo informações de pacientes, sessões clínicas e áudios gravados para transcrição.

## 2. Uso dos Dados
Os dados são utilizados para:
- Gerenciamento de pacientes e sessões
- Transcrição de áudio via IA
- Análise clínica e geração de relatórios
- Melhoria contínua do serviço

## 3. Retenção de Dados
- Áudios: excluídos imediatamente após a transcrição
- Transcrições e análises: expiram em 90 dias
- Dados de pacientes: mantidos enquanto a conta estiver ativa

## 4. Compartilhamento
Dados não são compartilhados com terceiros, exceto quando exigido por lei.

## 5. Segurança
Utilizamos criptografia em trânsito (TLS) e em repouso. Acesso restrito via autenticação e autorização.

## 6. Direitos do Titular (LGPD)
Você pode solicitar acesso, correção ou exclusão de seus dados a qualquer momento.',
  'Coletamos dados necessários para o serviço. Áudios são excluídos após transcrição. Dados expiram conforme política de retenção.',
  true,
  NOW(),
  NOW(),
  NOW()
);
