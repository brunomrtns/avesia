"""Classifier — TF-IDF + cosine similarity with category centroids.

Deterministic (no LLM). Uses scikit-learn for TF-IDF vectorization
and keyword extraction.
"""

import re
from dataclasses import dataclass, field


@dataclass
class DocumentCategory:
    primary: str
    secondary: list[str] = field(default_factory=list)
    confidence: float = 0.0


@dataclass
class ClassificationResult:
    category: DocumentCategory
    keywords: list[str] = field(default_factory=list)
    themes: list[str] = field(default_factory=list)
    provider: str = "tfidf"
    model: str = "tfidf-v1"
    tokens_used: int = 0


# ── Category keyword dictionaries ──────────────────────────────────────────

CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "TCC": [
        "tcc", "terapia cognitivo-comportamental", "reestruturação cognitiva",
        "reestruturacao cognitiva", "pensamento automático", "pensamento automatico",
        "distorção cognitiva", "distorcao cognitiva", "crença central", "crenca central",
        "esquema", "exposição", "exposicao", "ativação comportamental",
        "ativacao comportamental", "beck", "análise do comportamento",
        "analise do comportamento", "reforço", "reforco", "extinção", "extincao",
        "modelagem", "hierarquia",
    ],
    "Psicanálise": [
        "psicanálise", "psicanalise", "freud", "lacan", "klein", "winnicott",
        "inconsciente", "transferência", "transferencia", "contratransferência",
        "contratransferencia", "resistência", "resistencia", "catarse", "insight",
        "ego", "id", "superego", "pulção", "pulsao", "mecanismo de defesa",
        "negação", "negacao", "projeção", "projecao", "sublimação", "sublimacao",
        "repressão", "repressao", "complexo de édipo", "complexo de edipo",
        "fase oral", "fase anal", "fase fálica", "fase falica",
        "associação livre", "associacao livre",
    ],
    "Fenomenologia": [
        "fenomenologia", "fenomenológico", "fenomenologico", "husserl",
        "heidegger", "merleau-ponty", "sartre", "dasein", "ser-no-mundo",
        "ser no mundo", "existencial", "existencialismo", "logoterapia",
        "frankl", "subjetividade", "singularidade", "experiência vivida",
        "experiencia vivida", "intencionalidade", "corporeidade",
    ],
    "Avaliação": [
        "avaliação", "avaliacao", "avaliação psicológica", "avaliacao psicologica",
        "anamnese", "entrevista clínica", "entrevista clinica",
        "laudo", "laudo psicológico", "laudo psicologico",
        "relatório", "relatorio", "parecer", "devolutiva",
        "teste", "testagem", "instrumento", "wisc", "wais", "bender",
        "rorschach", "zulliger", "mmpi", "minnesota", "teste projetivo",
        "desenho da figura humana", "teste de inteligência",
        "hamilton", "beck", "escala", "inventário", "inventario",
        "neuropsicológica", "neuropsicologica",
        "diagnóstico", "diagnostico", "diagnóstico diferencial", "cid", "dsm",
    ],
    "Neurociência": [
        "neurociência", "neurociencia", "neurocientífico", "neurocientifico",
        "cérebro", "cerebro", "neurônio", "neuronio", "sinapse",
        "neurotransmissor", "serotonina", "dopamina", "noradrenalina",
        "gaba", "glutamato", "córtex", "cortex", "hipocampo",
        "neuroplasticidade", "neurodesenvolvimento",
        "funcionamento executivo", "funções executivas", "funcoes executivas",
    ],
    "Farmacologia": [
        "farmacologia", "psicofarmacologia", "psicofármaco", "psicofarmaco",
        "antidepressivo", "ansiolítico", "ansiolitico",
        "antipsicótico", "antipsicotico", "estabilizador de humor",
        "lítio", "litio", "fluoxetina", "sertralina", "venlafaxina",
        "risperidona", "olanzapina", "quetiapina", "metilfenidato",
        "dosagem", "posologia", "efeito colateral", "prescrição", "prescricao",
    ],
    "Ética": [
        "ética", "etica", "código de ética", "codigo de etica",
        "sigilo profissional", "conselho federal de psicologia",
        "cfp", "crp", "conselho regional",
        "princípios éticos", "principios eticos",
        "responsabilidade profissional", "segredo profissional",
        "autonomia", "beneficência", "beneficencia",
        "consentimento informado", "termo de consentimento",
    ],
    "Caso Clínico": [
        "caso clínico", "caso clinico", "relato de caso",
        "paciente", "cliente", "atendimento",
        "queixa", "queixa principal", "história clínica", "historia clinica",
        "evolução", "evolucao", "sessão", "sessao",
        "encaminhamento", "desfecho", "follow-up",
        "tratamento", "intervenção", "intervencao",
    ],
    "Protocolo": [
        "protocolo", "diretriz", "diretrizes", "consenso",
        "fluxograma", "rotina", "manual",
        "dsm", "dsm-5", "cid", "cid-10", "cid-11",
        "classificação", "classificacao",
    ],
    "Humanista": [
        "humanista", "humanismo", "rogers", "maslow",
        "pessoa centrada", "abordagem centrada na pessoa",
        "autorrealização", "autorrealizacao",
        "tendência atualizante", "tendencia atualizante",
        "empatia", "consideração positiva", "consideracao positiva",
        "congruência", "congruencia", "genuinidade",
        "hierarquia de necessidades", "pirâmide de maslow",
    ],
}

STOPWORDS = {
    "a", "o", "as", "os", "de", "do", "da", "dos", "das", "e", "ou", "um", "uma",
    "que", "com", "para", "por", "em", "no", "na", "nos", "nas", "se", "sua",
    "seu", "suas", "seus", "ao", "aos", "pelo", "pela", "pelos", "pelas",
    "como", "mais", "menos", "muito", "muita", "muitos", "muitas",
    "este", "esta", "estes", "estas", "esse", "essa", "esses", "essas",
    "ser", "estar", "ter", "haver", "fazer", "ir", "vir", "ver", "dar",
    "dizer", "saber", "poder", "querer", "dever", "precisar",
    "quando", "onde", "porque", "pois", "então", "entao", "assim",
    "também", "tambem", "ainda", "já", "ja", "só", "so", "apenas",
    "sobre", "sob", "entre", "após", "apos", "antes", "depois",
    "durante", "através", "atraves", "sem", "contra", "desde",
    "até", "ate", "mas", "porem", "porém", "contudo", "todavia",
    "não", "nao", "sim", "cada", "todo", "toda", "todos", "todas",
    "outro", "outra", "outros", "outras", "mesmo", "mesma",
    "foi", "foram", "era", "será", "sera", "tem", "tinha", "tendo",
    "são", "sao", "somos", "estão", "estao",
}


def _tokenize(text: str) -> list[str]:
    text = text.lower()
    text = re.sub(r"[^\wà-ÿ\s]", " ", text)
    words = text.split()
    return [w for w in words if len(w) > 2 and w not in STOPWORDS]


class Classifier:
    """TF-IDF classifier using scikit-learn."""

    _vectorizer = None
    _category_vectors: dict[str, any] = {}
    _category_names: list[str] = []

    def __init__(self):
        self._init_vectors()

    @classmethod
    def _init_vectors(cls):
        if cls._vectorizer is not None:
            return

        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
        import numpy as np

        # Build category documents
        category_docs: dict[str, str] = {}
        for cat, keywords in CATEGORY_KEYWORDS.items():
            category_docs[cat] = " ".join(keywords)

        cls._category_names = list(category_docs.keys())

        # Fit TF-IDF on category documents
        all_docs = list(category_docs.values())
        cls._vectorizer = TfidfVectorizer(
            tokenizer=_tokenize,
            token_pattern=None,
            norm="l2",
        )
        cls._vectorizer.fit(all_docs)

        # Transform categories to vectors
        cat_matrix = cls._vectorizer.transform(all_docs)
        for i, cat in enumerate(cls._category_names):
            cls._category_vectors[cat] = cat_matrix[i]

    def classify(self, content: str, max_input_chars: int = 12000) -> ClassificationResult:
        from sklearn.metrics.pairwise import cosine_similarity

        truncated = content[:max_input_chars]

        try:
            # Transform document
            doc_vec = self._vectorizer.transform([truncated])

            # Score each category
            scores: list[tuple[str, float]] = []
            for cat in self._category_names:
                cat_vec = self._category_vectors[cat]
                sim = cosine_similarity(doc_vec, cat_vec)[0, 0]
                scores.append((cat, float(sim)))

            scores.sort(key=lambda x: x[1], reverse=True)

            top = scores[0] if scores else ("Outro", 0.0)
            primary = top[0] if top[1] > 0 else "Outro"
            confidence = min(0.95, top[1] * 2) if top[1] > 0 else 0.0

            # Secondary categories
            secondary: list[str] = []
            if len(scores) > 1 and scores[1][1] > top[1] * 0.5:
                secondary.append(scores[1][0])
            if len(scores) > 2 and scores[2][1] > top[1] * 0.4:
                secondary.append(scores[2][0])

            keywords = self._extract_keywords(truncated)
            themes = self._extract_themes(truncated, keywords)

            return ClassificationResult(
                category=DocumentCategory(
                    primary=primary,
                    secondary=secondary,
                    confidence=max(0.0, min(1.0, confidence)),
                ),
                keywords=keywords,
                themes=themes,
            )
        except Exception:
            return ClassificationResult(
                category=DocumentCategory(primary="Outro"),
            )

    def _extract_keywords(self, text: str, n: int = 10) -> list[str]:
        """Extract top-N keywords using TF-IDF + spaCy POS filtering.

        Combines TF-IDF scores (statistical relevance) with spaCy POS tagging
        (linguistic filtering) to return only meaningful nouns and adjectives,
        lemmatized to their canonical form.
        """
        import numpy as np

        try:
            # Get TF-IDF scores
            doc_vec = self._vectorizer.transform([text])
            feature_names = self._vectorizer.get_feature_names_out()
            scores = doc_vec.toarray()[0]
            if scores.max() == 0:
                return []

            # Get top 30 features by TF-IDF (over-fetch to allow POS filtering)
            top_indices = np.argsort(scores)[-30:][::-1]
            tfidf_keywords = [(feature_names[i], scores[i]) for i in top_indices if scores[i] > 0]

            # Use spaCy to filter by POS (nouns, adjectives, proper nouns) and lemmatize
            try:
                from .entity_extractor import _get_nlp
                nlp = _get_nlp()
                if nlp:
                    # Process the top TF-IDF keywords through spaCy for POS + lemma
                    relevant_pos = {"NOUN", "PROPN", "ADJ"}
                    filtered: list[tuple[str, float]] = []

                    for kw, score in tfidf_keywords:
                        doc = nlp(kw)
                        token = doc[0] if len(doc) > 0 else None
                        if token and token.pos_ in relevant_pos:
                            # Use lemma as canonical form
                            lemma = token.lemma_.lower()
                            # Skip generic adjectives
                            if lemma not in {"primeiro", "segundo", "terceiro", "novo", "velho", "grande", "pequeno", "bom", "mau"}:
                                filtered.append((lemma, score))

                    # Sort by score and return top N
                    filtered.sort(key=lambda x: x[1], reverse=True)
                    return [kw for kw, _ in filtered[:n]]
            except Exception:
                pass

            # Fallback: just return top TF-IDF keywords without POS filtering
            return [kw for kw, _ in tfidf_keywords[:n]]
        except Exception:
            return []

    def _extract_themes(self, text: str, keywords: list[str]) -> list[str]:
        """Extract themes by matching against category keywords."""
        themes: set[str] = set()
        lower = text.lower()

        for category, kws in CATEGORY_KEYWORDS.items():
            match_count = sum(1 for kw in kws if kw in lower)
            if match_count >= 2:
                themes.add(category)

        # Add top keywords as themes if few categories matched
        if len(themes) < 2:
            for kw in keywords[:3]:
                themes.add(kw)

        return list(themes)[:5]
