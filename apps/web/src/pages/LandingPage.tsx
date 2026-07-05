import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Brain,
  Mic,
  Network,
  Shield,
  Sparkles,
  ArrowRight,
  BookOpen,
  Activity,
  Stethoscope,
  CheckCircle2,
  Zap,
  Lock,
} from 'lucide-react';

import { useAuthStore } from '@/stores/auth-store';
import { BrandLogo, BRAND } from '@/components/branding/BrandLogo';
import { Button } from '@/components/ui/button';
import { NeuralIndicator } from '@/components/ui/neural-indicator';

// ── Feature card ──────────────────────────────────────────────────────────
interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FEATURES: readonly Feature[] = [
  {
    icon: <Mic className="h-5 w-5" />,
    title: 'Transcrição em tempo real',
    description: 'Captura automática da sessão com reconhecimento de fala em português, identificação de falantes e pausa/retomada a qualquer momento.',
  },
  {
    icon: <Brain className="h-5 w-5" />,
    title: 'Copilot clínico com IA',
    description: 'Insights gerados em tempo real durante o atendimento, sugestões de perguntas, identificação de temas recorrentes e padrões clínicos.',
  },
  {
    icon: <Network className="h-5 w-5" />,
    title: 'Knowledge Graph neural',
    description: 'Grafo de conceitos que evolui automaticamente com cada documento enviado. Retrieval via GraphRAG para respostas contextualizadas.',
  },
  {
    icon: <BookOpen className="h-5 w-5" />,
    title: 'Base de conhecimento privada',
    description: 'Cada clínica tem sua própria base isolada. Documentos, protocolos e materiais clínicos processados e indexados automaticamente.',
  },
  {
    icon: <Shield className="h-5 w-5" />,
    title: 'Multi-tenant seguro',
    description: 'Isolamento completo entre organizações. Cada clínica possui seu próprio grafo, vetores e configurações de IA.',
  },
  {
    icon: <Activity className="h-5 w-5" />,
    title: 'Provedores de IA flexíveis',
    description: 'Escolha entre NVIDIA NIM (nuvem), OpenRouter ou Ollama local com GPU. Troque de provedor sem mudar uma linha de código.',
  },
];

const STEPS = [
  {
    number: '01',
    title: 'Configure sua clínica',
    description: 'Crie sua organização, adicione profissionais e pacientes. Escolha seu provedor de IA preferido.',
  },
  {
    number: '02',
    title: 'Alimente a base de conhecimento',
    description: 'Faça upload de protocolos, artigos e materiais clínicos. O sistema extrai conceitos e constrói o grafo automaticamente.',
  },
  {
    number: '03',
    title: 'Atenda com o copilot',
    description: `Durante a sessão, o ${BRAND.name} transcreve, analisa e sugere insights em tempo real, baseado no conhecimento da sua clínica.`,
  },
];

export function LandingPage(): React.ReactNode {
  const isLoading = useAuthStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const orgSlug = useAuthStore((s) => s.orgSlug);
  const navigate = useNavigate();

  // If already authenticated, redirect to org dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated && orgSlug) {
      navigate(`/${orgSlug}`, { replace: true });
    }
  }, [isLoading, isAuthenticated, orgSlug, navigate]);

  return (
    <div className="min-h-screen bg-background">
      {/* ── Ambient background ──────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 mesh-bg opacity-40" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-96 bg-gradient-glow opacity-50" />
      <div className="pointer-events-none fixed -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none fixed bottom-0 right-0 h-96 w-96 rounded-full bg-accent/5 blur-3xl" />

      {/* ── Nav bar ─────────────────────────────────────────────────────── */}
      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <BrandLogo variant="full" size="lg" />
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/login')}
            className="text-foreground-secondary"
          >
            Entrar
          </Button>
          <Button
            variant="gradient"
            size="sm"
            onClick={() => navigate('/login')}
            className="gap-2"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Solicitar Demonstração
          </Button>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 pt-20 pb-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/50 px-4 py-1.5 backdrop-blur-sm">
            <NeuralIndicator state="active" size="sm" />
            <span className="text-xs font-medium text-foreground-secondary">
              Inteligência clínica em tempo real
            </span>
          </div>

          <h1 className="text-balance text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
            O copilot clínico que
            <br />
            <span className="text-gradient-primary">pensa com você</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-foreground-secondary">
            {BRAND.name} transcreve sessões, constrói uma base de conhecimento neural da sua clínica
            e gera insights em tempo real — tudo alimentado por IA, com seus dados isolados e seguros.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              variant="gradient"
              size="lg"
              onClick={() => navigate('/login')}
              className="gap-2 shadow-glow"
            >
              <Sparkles className="h-4 w-4" />
              Começar agora
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate('/login')}
              className="gap-2"
            >
              Solicitar demonstração
            </Button>
          </div>
        </motion.div>
      </section>

      {/* ── Stats bar ───────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-2 gap-4 rounded-2xl border border-border bg-surface/30 p-6 backdrop-blur-sm sm:grid-cols-4"
        >
          {[
            { value: 'Tempo real', label: 'Transcrição e insights' },
            { value: 'GraphRAG', label: 'Retrieval neural' },
            { value: '100%', label: 'Dados isolados por clínica' },
            { value: '3+', label: 'Provedores de IA' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-xl font-bold text-primary">{stat.value}</p>
              <p className="mt-1 text-xs text-foreground-muted">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Tudo que sua clínica precisa
          </h2>
          <p className="mt-3 text-foreground-secondary">
            Uma plataforma completa, do atendimento ao conhecimento
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, idx) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.08 }}
              className="group rounded-xl border border-border bg-surface/40 p-6 backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:bg-surface/60"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
                {feature.icon}
              </div>
              <h3 className="mb-2 text-base font-semibold text-foreground">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-foreground-secondary">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-20">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Como funciona
          </h2>
          <p className="mt-3 text-foreground-secondary">
            Três passos para transformar seus atendimentos
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {STEPS.map((step, idx) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, x: idx === 0 ? -20 : idx === 2 ? 20 : 0, y: idx === 1 ? -20 : 0 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: 0.5, delay: idx * 0.15 }}
              className="relative"
            >
              <div className="mb-4 text-5xl font-bold text-primary/20">{step.number}</div>
              <h3 className="mb-2 text-lg font-semibold text-foreground">{step.title}</h3>
              <p className="text-sm leading-relaxed text-foreground-secondary">{step.description}</p>
              {idx < STEPS.length - 1 && (
                <div className="mt-6 hidden h-px w-full bg-gradient-to-r from-primary/30 to-transparent md:block" />
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Security highlight ──────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-surface/60 to-surface/20 p-8 backdrop-blur-sm sm:p-12"
        >
          <div className="grid items-center gap-8 sm:grid-cols-2">
            <div>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Lock className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">
                Seus dados, sua clínica
              </h2>
              <p className="mt-3 text-foreground-secondary">
                Cada organização tem isolamento completo: knowledge graph, vetores,
                documentos e configurações de IA. Nada vaza entre clínicas.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'Isolamento multi-tenant em todas as camadas',
                  'Token JWT com refresh token rotation',
                  'Escolha entre IA na nuvem ou local (Ollama)',
                  'Auditoria de todas as ações sensíveis',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-foreground-secondary">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-primary/10 blur-3xl" />
              <div className="relative flex h-48 w-48 items-center justify-center rounded-full border border-primary/20 bg-surface/40 backdrop-blur-sm">
                <Shield className="h-20 w-20 text-primary/60" />
                <div className="absolute inset-0 rounded-full border-2 border-primary/10 animate-ai-pulse" />
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── AI Provider highlight ───────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-20">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Escolha sua IA
          </h2>
          <p className="mt-3 text-foreground-secondary">
            Flexibilidade total no provedor de inteligência
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { name: 'NVIDIA NIM', tag: 'Nuvem', icon: <Zap className="h-5 w-5" />, desc: 'Free tier, modelos Llama 3.1, baixa latência' },
            { name: 'OpenRouter', tag: 'Nuvem', icon: <Sparkles className="h-5 w-5" />, desc: 'Acesso a múltiplos modelos com um único provedor' },
            { name: 'Ollama', tag: 'Local', icon: <Stethoscope className="h-5 w-5" />, desc: 'GPU local, privacidade máxima, sem custo de API' },
          ].map((provider) => (
            <div
              key={provider.name}
              className="rounded-xl border border-border bg-surface/40 p-6 text-center backdrop-blur-sm transition-all duration-300 hover:border-primary/30"
            >
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {provider.icon}
              </div>
              <h3 className="font-semibold text-foreground">{provider.name}</h3>
              <span className="mt-1 inline-block rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
                {provider.tag}
              </span>
              <p className="mt-3 text-xs text-foreground-secondary">{provider.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 py-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-surface/30 p-12 backdrop-blur-sm"
        >
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Pronto para inteligência clínica?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-foreground-secondary">
            Comece em minutos. Acesse o sistema e veja o {BRAND.name} em ação.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              variant="gradient"
              size="lg"
              onClick={() => navigate('/login')}
              className="gap-2 shadow-glow"
            >
              <Sparkles className="h-4 w-4" />
              Acessar o sistema
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate('/login')}
            >
              Solicitar demonstração
            </Button>
          </div>
        </motion.div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <BrandLogo variant="full" size="lg" />
          <p className="text-xs text-foreground-muted">
            © {new Date().getFullYear()} {BRAND.name}. Plataforma de inteligência clínica.
          </p>
          <div className="flex items-center gap-4 text-xs text-foreground-muted">
            <span className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-success animate-ai-pulse" />
              Sistema operacional
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
