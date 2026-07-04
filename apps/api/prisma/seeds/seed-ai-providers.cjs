/**
 * Seed AI Provider configs for Bruno Integrations.
 * Creates NVIDIA NIM (active) + Ollama (local via WireGuard).
 *
 * Usage inside API container:
 *   node seed-ai-providers.cjs
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst({
    where: { slug: 'bruno-integrations' },
  });
  if (!org) {
    console.error('Organization "bruno-integrations" not found. Run prod-seed-all.js first.');
    process.exit(1);
  }

  console.log(`Seeding AI providers for org: ${org.name} (${org.id})`);

  // NVIDIA NIM (active — cloud fallback)
  const nim = await prisma.aIProviderConfig.upsert({
    where: { organizationId_provider: { organizationId: org.id, provider: 'nvidia-nim' } },
    update: {},
    create: {
      organizationId: org.id,
      provider: 'nvidia-nim',
      label: 'NVIDIA NIM',
      apiKey: process.env.NVIDIA_NIM_API_KEY || '',
      baseUrl: process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      model: process.env.NVIDIA_NIM_DEFAULT_MODEL || 'meta/llama-3.1-8b-instruct',
      embeddingModel: process.env.EMBEDDING_MODEL || 'nvidia/llama-nemotron-embed-1b-v2',
      isActive: true,
      lastStatus: 'unknown',
    },
  });
  console.log(`  ✓ NVIDIA NIM created (id: ${nim.id})`);

  // Ollama (local via WireGuard — inactive, can be activated from UI)
  const ollama = await prisma.aIProviderConfig.upsert({
    where: { organizationId_provider: { organizationId: org.id, provider: 'ollama' } },
    update: {},
    create: {
      organizationId: org.id,
      provider: 'ollama',
      label: 'Ollama Local (PC via VPN)',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://172.19.0.1:11435/v1',
      model: process.env.OLLAMA_DEFAULT_MODEL || 'gemma3:12b',
      isActive: false,
      lastStatus: 'unknown',
    },
  });
  console.log(`  ✓ Ollama Local created (id: ${ollama.id})`);

  // OpenRouter (inactive — can be activated from UI)
  if (process.env.OPENROUTER_API_KEY) {
    const openrouter = await prisma.aIProviderConfig.upsert({
      where: { organizationId_provider: { organizationId: org.id, provider: 'openrouter' } },
      update: {},
      create: {
        organizationId: org.id,
        provider: 'openrouter',
        label: 'OpenRouter',
        apiKey: process.env.OPENROUTER_API_KEY,
        baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
        model: process.env.OPENROUTER_DEFAULT_MODEL || 'meta-llama/llama-3.3-70b-instruct',
        isActive: false,
        lastStatus: 'unknown',
      },
    });
    console.log(`  ✓ OpenRouter created (id: ${openrouter.id})`);
  }

  console.log('AI providers seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
