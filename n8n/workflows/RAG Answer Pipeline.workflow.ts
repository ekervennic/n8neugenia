const mistral_rewrite = languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatMistralCloud', version: 1, config: { name: 'Mistral (rewrite)', parameters: { options: { maxTokens: 2048 } }, credentials: { mistralCloudApi: newCredential('Clé mistral n8n', 'DdKsa7Kj2agi9lb9') }, position: [-424, 376], notesInFlow: true } });
const history_rewrite = memory({ type: '@n8n/n8n-nodes-langchain.memoryBufferWindow', version: 1.3, config: { name: 'History (rewrite)', parameters: { sessionIdType: 'customKey', sessionKey: 'answer_pipeline_rewrite', contextWindowLength: 8 }, position: [-296, 376], notes: 'Needed only to resolve references such as "lui" or "et le chapitre suivant".', notesInFlow: true } });
const mistral_route = languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatMistralCloud', version: 1, config: { name: 'Mistral (route)', parameters: { options: { maxTokens: 2048 } }, credentials: { mistralCloudApi: newCredential('Clé mistral n8n', 'DdKsa7Kj2agi9lb9') }, position: [216, 376], notesInFlow: true } });
const embeddings_Google_Gemini = embedding({ type: '@n8n/n8n-nodes-langchain.embeddingsGoogleGemini', version: 1, config: { credentials: { googlePalmApi: newCredential('Gemini clé Elena', 'WOxRDqdM3shXs3h3') }, position: [1240, 616], notes: '3072 dimensions, identical to the model the ingestion sub-workflow writes with. Diverging here would make every comparison meaningless.', notesInFlow: true } });
const mistral_rerank = languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatMistralCloud', version: 1, config: { name: 'Mistral (rerank)', parameters: { options: { maxTokens: 2048 } }, credentials: { mistralCloudApi: newCredential('Clé mistral n8n', 'DdKsa7Kj2agi9lb9') }, position: [2264, 616], notesInFlow: true } });
const mistral_answer = languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatMistralCloud', version: 1, config: { name: 'Mistral (answer)', parameters: { options: { maxTokens: 2048 } }, credentials: { mistralCloudApi: newCredential('Clé mistral n8n', 'DdKsa7Kj2agi9lb9') }, position: [3000, 360], notesInFlow: true } });
const history_answer = memory({ type: '@n8n/n8n-nodes-langchain.memoryBufferWindow', version: 1.3, config: { name: 'History (answer)', parameters: { sessionIdType: 'customKey', sessionKey: 'answer_pipeline_chat', contextWindowLength: 8 }, position: [3128, 360], notes: 'Lets a follow-up such as "et lui ?" land in the right place.', notesInFlow: true } });

const course_Questions = trigger({
  type: '@n8n/n8n-nodes-langchain.chatTrigger',
  version: 1.1,
  config: { name: 'Course Questions', parameters: { public: true, mode: 'webhook', options: {} }, position: [-656, 144], webhookId: '2453a7d7-5f15-45a9-b077-0f14d47129e4', notes: 'Ask anything about the ingested course PDFs.', notesInFlow: true }
});

const contextualise_Question = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: { name: 'Contextualise Question', parameters: { promptType: 'define', text: expr('{{ $json.chatInput }}'), options: { systemMessage: 'Tu es un reformulateur de requetes pour une base de cours. Tu ne reponds JAMAIS a la question de l\'etudiante.\n\nTon unique travail : transformer la derniere question en une requete de recherche autonome, comprise sans l\'historique de la conversation.\n\nExemples :\n- "et lui ?" + historique sur Jean Echenoz -> "Jean Echenoz"\n- "c\'est quand ?" + historique sur la revolution francaise -> "date de la revolution francaise"\n- "la deuxieme partie" -> "deuxieme partie du cours"\n\nRegles :\n- Garde les mots importants, y compris les noms propres, les dates, les formules et les termes techniques exacts.\n- Si la question est deja autonome, recopie-la telle quelle.\n- Reponds UNIQUEMENT par la requete : pas de prefixe, pas de guillemets, pas d\'explication, pas de point final.' } }, position: [-432, 144], notes: 'Stage 1 of 5. A question like "et lui ?" matches nothing in a vector index, because it carries no subject. This turns it into something searchable before anything else runs.', notesInFlow: true, subnodes: { model: mistral_rewrite, memory: history_rewrite } }
});

const read_Standalone_Query = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Read Standalone Query', parameters: { jsCode: '// Takes the rewrite out of the model chatter: strips any lead-in and quotes, and\n// refuses a rewrite that is empty or wildly off, falling back to the original.\nconst original = String($("Course Questions").first().json.chatInput || "").trim();\nconst raw = String($json.output || $json.text || "").trim();\n\nconst cleaned = raw\n  .replace(/^(requete|recherche|query|question)\\s*[:\\-]\\s*/i, "")\n  .replace(/^[\\"\\u0027`\\u00ab\\u201c]+/, "")\n  .replace(/[\\"\\u0027`\\u00bb\\u201d]+$/, "")\n  .replace(/\\s+/g, " ")\n  .replace(/\\.+$/, "")\n  .trim();\n\n// A good rewrite is a real query, not a sentence and not a stub.\nconst usable = cleaned.length >= 3 && cleaned.length <= 300 && !/\\?$/.test(cleaned);\nconst query = usable ? cleaned : original;\n\nif (!query) {\n  throw new Error("Question vide : rien a rechercher.");\n}\n\nreturn [{ json: { query, original_question: original, rewritten: usable && query !== original } }];' }, position: [-80, 144], notes: 'Guards the rewrite: if the model returns something unusable, the original question is used rather than a broken query.', notesInFlow: true }
});

const classify_Intent = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: { name: 'Classify Intent', parameters: { promptType: 'define', text: expr('Classe cette requete de recherche en UNE SEULE categorie.\n\nexact : la requete cite un nom propre, une date precise, un numero, un sigle, une formule, ou demande une citation exacte.\nconceptual : la requete demande une idee, un mecanisme, une definition, une explication, ou est une reformulation d\'un concept.\nglobal : la requete demande un resume, une synthese, une vue d ensemble, ou porte sur un chapitre, une partie ou un document entier.\n\nRequete : {{ $json.query }}\n\nReponds avec le seul mot: exact, conceptual ou global.'), batching: {} }, position: [144, 144], notes: 'Stage 2 of 5. The route decides how many hits to pull from each search and how many survive reranking.', notesInFlow: true, subnodes: { model: mistral_route } }
});

const read_Route = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Read Route', parameters: { jsCode: '// One word decides the search budget. Anything unrecognised falls back to\n// conceptual, the safest middle ground, rather than failing the question.\nconst VALID = ["exact", "conceptual", "global"];\nconst raw = String($json.text || $json.output || "").toLowerCase();\n\nlet route = "conceptual";\nfor (const candidate of VALID) {\n  if (raw.includes(candidate)) {\n    route = candidate;\n    break;\n  }\n}\n\nreturn [{ json: { query: $("Read Standalone Query").first().json.query, original_question: $("Read Standalone Query").first().json.original_question, route } }];' }, position: [496, 144], notes: 'Validates the classifier output instead of trusting it.', notesInFlow: true }
});

const route_the_Question = node({
  type: 'n8n-nodes-base.switch',
  version: 3.2,
  config: { name: 'Route the Question', parameters: { rules: { values: [{ conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'strict', version: 1 }, conditions: [{ leftValue: expr('{{ $json.route }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'exact' }], combinator: 'and' } }, { conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'strict', version: 1 }, conditions: [{ leftValue: expr('{{ $json.route }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'conceptual' }], combinator: 'and' } }] }, options: { fallbackOutput: 'extra', renameFallbackOutput: 'global' } }, position: [720, 128], notes: 'Stage 2 of 5, branching point.', notesInFlow: true }
});

const plan_Exact_Terms = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Plan: Exact Terms', parameters: { jsCode: '// Exact wording is what the question is made of, so lean on the keyword half and\n// keep few final fragments: a precise answer rarely needs six citations.\nreturn [{ json: { ...$json, keyword_limit: 30, vector_limit: 6, candidates: 14, final_k: 4, why: "requete avec termes exacts : plein texte d\'abord" } }];' }, position: [944, -96], notesInFlow: true }
});

const keyword_Search = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: 'Keyword Search', parameters: { operation: 'executeQuery', query: '-- Stage 3a: French full-text search. Finds the exact wording a question uses,\n-- which embeddings blur. Falls back to a substring match on the longest words\n-- so the vector half is never left to answer alone.\nwith params as (\n  select websearch_to_tsquery(\'french\', $1) as tsq\n),\nscored as (\n  select\n    r.id,\n    r.content,\n    r.metadata,\n    ts_rank(to_tsvector(\'french\', r.content), p.tsq) as score\n  from rag_documents r\n  cross join params p\n  where to_tsvector(\'french\', r.content) @@ p.tsq\n),\nwords as (\n  select unnest(regexp_split_to_array(lower($1), \'[^[:alnum:]]+\')) as w\n),\nkept as (\n  select w from words where length(w) > 3\n)\nselect s.id, s.content, s.metadata, s.score\nfrom scored s\nunion all\nselect r.id, r.content, r.metadata, 0.01 as score\nfrom rag_documents r\nwhere not exists (select 1 from scored)\n  and exists (\n    select 1 from kept k where lower(r.content) like (\'%\' || k.w || \'%\')\n  )\norder by score desc\nlimit {{ $json.keyword_limit }};', options: { queryReplacement: expr('{{ $json.query }}') } }, credentials: { postgres: newCredential('Postgres Elena clé', '6hgLXGJga7YeTQ1R') }, position: [1232, 96], notes: 'alwaysOutputData keeps the chain alive when nothing matches, so the vector half still runs.', notesInFlow: true }
});

const collect_Keyword_Results = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Collect Keyword Results', parameters: { jsCode: '// Collapses the keyword rows into ONE item holding the whole list, for two reasons:\n// the vector search must run exactly once, and an empty result still has to let\n// the chain continue rather than stopping it.\nconst plan = $("Read Route").first().json;\n\nconst keyword = items\n  .map((item) => ({\n    content: String(item.json.content || "").trim(),\n    metadata: item.json.metadata || {},\n  }))\n  .filter((k) => k.content);\n\nreturn [{ json: { ...plan, keyword } }];' }, position: [944, 144], notes: 'One item out, always. That is what keeps the vector search to a single embedding call.', notesInFlow: true }
});

const vector_Search = node({
  type: '@n8n/n8n-nodes-langchain.vectorStorePGVector',
  version: 1.3,
  config: { name: 'Vector Search', parameters: { mode: 'load', tableName: 'rag_documents', prompt: expr('{{ $json.query }}'), topK: expr('{{ $json.vector_limit }}'), options: { distanceStrategy: 'cosine', columnNames: { values: { contentColumnName: 'content' } } } }, credentials: { postgres: newCredential('Postgres Elena clé', '6hgLXGJga7YeTQ1R') }, position: [1168, 400], notes: 'Stage 3b: embeds the rewritten question and asks pgvector for the closest fragments. Receives exactly one item, so the question is embedded once.', notesInFlow: true, subnodes: { embedding: embeddings_Google_Gemini } }
});

const gather_Both_Lists = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Gather Both Lists', parameters: { jsCode: '// Re-attaches the keyword list, which the vector search pushed downstream. Both lists\n// leave here as plain arrays so the fusion step is pure arithmetic and can be\n// tested without a database.\nconst plan = $("Collect Keyword Results").first().json;\n\nconst vector = items\n  .map((item) => ({\n    content: String(item.json.pageContent || "").trim(),\n    metadata: item.json.metadata || {},\n  }))\n  .filter((v) => v.content);\n\nreturn [{ json: { ...plan, vector } }];' }, position: [1520, 400], notesInFlow: true }
});

const fuse_Rankings = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Fuse Rankings', parameters: { jsCode: '// Reciprocal Rank Fusion. Neither half is trusted alone, and their scores are not on the\n// same scale, so each list is ranked and combined as 1/(k + rank). A fragment both\n// halves like outranks one that only a single half found.\nconst K = 60;\n\nconst j = $json;\nconst wanted = Number(j.candidates) || 14;\nconst byContent = new Map();\n\nfunction add(list, entries) {\n  const ranked = entries.filter((e) => e && e.content);\n\n  ranked.forEach((entry, index) => {\n    if (!byContent.has(entry.content)) {\n      byContent.set(entry.content, { content: entry.content, metadata: entry.metadata || {}, hits: [] });\n    }\n\n    byContent.get(entry.content).hits.push({ list, rank: index + 1 });\n  });\n}\n\nadd("keyword", Array.isArray(j.keyword) ? j.keyword : []);\nadd("vector", Array.isArray(j.vector) ? j.vector : []);\n\nconst fused = [];\n\nfor (const entry of byContent.values()) {\n  let score = 0;\n\n  for (const hit of entry.hits) {\n    score += 1 / (K + hit.rank);\n  }\n\n  fused.push({\n    content: entry.content,\n    metadata: entry.metadata,\n    rrf_score: Number(score.toFixed(6)),\n    found_by: [...new Set(entry.hits.map((h) => h.list))].join(" + "),\n  });\n}\n\nfused.sort((a, b) => b.rrf_score - a.rrf_score);\nconst shortlist = fused.slice(0, wanted).map((d, i) => ({ index: i + 1, ...d }));\n\nreturn [\n  {\n    json: {\n      ...j,\n      keyword: undefined,\n      vector: undefined,\n      candidates: shortlist,\n      candidate_count: shortlist.length,\n      both_lists: fused.filter((f) => f.found_by.includes("+")).length,\n    },\n  },\n];' }, position: [1744, 400], notes: 'Keeps more fragments than the final answer needs: the whole point of the next stage is to throw some away.', notesInFlow: true }
});

const build_Rerank_List = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Build Rerank List', parameters: { jsCode: '// RRF ranks by popularity across two lists, which is not the same as ranking by how\n// well a fragment answers THIS question. That judgement needs a model, so the\n// shortlist is turned into a numbered list here for the reranker to read.\nconst j = $json;\nconst cands = Array.isArray(j.candidates) ? j.candidates : [];\n\nif (!cands.length) {\n  return [{ json: { ...j, rerank_list: "", fragments_kept: 0 } }];\n}\n\nconst blocks = cands.map((c) => {\n  const meta = c.metadata || {};\n  const source = meta.file_name ? meta.file_name : "source inconnue";\n  const chunk = meta.chunk_index !== undefined ? meta.chunk_index : "?";\n  return [c.index + ". [" + source + " - fragment " + chunk + "]", c.content].join("\\n");\n});\n\nreturn [{ json: { ...j, rerank_list: blocks.join("\\n\\n") } }];' }, position: [1968, 400], notes: 'An empty shortlist short-circuits here rather than calling the model with nothing to rank.', notesInFlow: true }
});

const rerank_Fragments = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: { name: 'Rerank Fragments', parameters: { promptType: 'define', text: expr('Voici des fragments de cours. Classe-les par ordre de pertinence pour repondre a la requete.\n\nRequete : {{ $json.query }}\n\nFragments :\n{{ $json.rerank_list }}\n\nReponds UNIQUEMENT par les numeros, du plus pertinent au moins pertinent, separes par des virgules. Par exemple : 3, 1, 7, 2. Rien d\'autre.'), batching: {} }, position: [2192, 400], notes: 'Stage 4 of 5. A real cross-encoder reranker would be better, but that needs a Cohere or Jina key; this uses the Gemini key already on the account and is the honest upgrade over raw RRF order.', notesInFlow: true, subnodes: { model: mistral_rerank } }
});

const apply_Rerank = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Apply Rerank', parameters: { jsCode: '// Puts the fragments back in the order the reranker chose. If its answer cannot be\n// read, the RRF order is kept rather than losing the results entirely.\nconst j = $json;\nconst cands = Array.isArray(j.candidates) ? j.candidates : [];\nconst keep = Number(j.final_k) || 5;\n\nconst raw = String(j.text || j.output || "");\nconst seen = new Set();\nconst order = [];\n\nfor (const match of raw.matchAll(/\\d+/g)) {\n  const n = Number(match[0]);\n\n  if (Number.isInteger(n) && n >= 1 && n <= cands.length && !seen.has(n)) {\n    seen.add(n);\n    order.push(n);\n  }\n}\n\nconst ranked = order.length\n  ? order.map((n) => cands[n - 1])\n  : cands.slice();\n\nconst kept = ranked.filter(Boolean).slice(0, keep);\n\nconst context = kept.length\n  ? kept\n      .map((d, i) => {\n        const meta = d.metadata || {};\n        const source = meta.file_name ? meta.file_name : "source inconnue";\n        const chunk = meta.chunk_index !== undefined ? meta.chunk_index : "?";\n        return "[" + (i + 1) + "] " + source + " - fragment " + chunk + "\\n" + d.content;\n      })\n      .join("\\n\\n")\n  : "";\n\nreturn [\n  {\n    json: {\n      ...j,\n      context,\n      fragments_kept: kept.length,\n      rerank_applied: order.length > 0,\n      kept_sources: kept.map((d) => (d.metadata || {}).file_name || "source inconnue"),\n    },\n  },\n];' }, position: [2544, 400], notes: 'Degrades to the fusion order if the reranker returns something unparsable.', notesInFlow: true }
});

const found_Anything = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: { name: 'Found Anything?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 }, conditions: [{ id: 'fragments-check', leftValue: expr('{{ $json.fragments_kept }}'), rightValue: 0, operator: { type: 'number', operation: 'gt' } }], combinator: 'and' }, options: {} }, position: [2768, 400], notes: 'An empty context must not reach the model: it would then answer from its own knowledge, which is the one thing this pipeline must never do.', notesInFlow: true }
});

const generate_Answer = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: { name: 'Generate Answer', parameters: { promptType: 'define', text: expr('Fragments retenus :\n{{ $json.context }}\n\nRequete de l\'etudiante : {{ $json.original_question || $json.query }}\n\nReponds en francais.'), options: { systemMessage: 'Tu reponds aux questions sur les cours en te basant UNIQUEMENT sur les fragments fournis.\n\nREGLE ABSOLUE : si l\'information ne se trouve pas dans ces fragments, reponds exactement : "Je ne trouve pas cette information dans tes cours." Puis rien d\'autre. Ne complete jamais avec tes connaissances generales, meme si tu es certaine de la reponse. Une reponse inventee est pire qu\'un refus.\n\nCITATION : quand ta reponse vient d\'un fragment, cite le fichier entre crochets, par exemple [Courir].' } }, position: [2992, 144], notes: 'Stage 5 of 5. The fragments are already reranked, so the model is asked to read rather than to select.', notesInFlow: true, subnodes: { model: mistral_answer, memory: history_answer } }
});

const nothing_Found = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Nothing Found', parameters: { jsCode: '// Refusal without a model call, so an empty retrieval can never be dressed up as an\n// answer. The reason travels in the output for debugging.\nreturn [\n  {\n    json: {\n      output: "Je ne trouve pas cette information dans tes cours.",\n      answer: "Je ne trouve pas cette information dans tes cours.",\n      route: $json.route,\n      query: $json.query,\n      candidate_count: $json.candidate_count || 0,\n      searched: ($json.candidates || []).map((c) => (c.metadata || {}).file_name || "?"),\n      why: $json.why,\n    },\n  },\n];' }, position: [3056, 544], notesInFlow: true }
});

const plan_Conceptual = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Plan: Conceptual', parameters: { jsCode: '// The question is about an idea, not a phrase, so give the vector half room to roam.\nreturn [{ json: { ...$json, keyword_limit: 8, vector_limit: 25, candidates: 14, final_k: 5, why: "requete conceptuelle : vecteurs d\'abord" } }];' }, position: [944, 336], notesInFlow: true }
});

const plan_Whole_Document = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Plan: Whole Document', parameters: { jsCode: '// A summary needs breadth, so pull more from both halves and keep more at the end.\nreturn [{ json: { ...$json, keyword_limit: 15, vector_limit: 20, candidates: 20, final_k: 8, why: "demande de synthese : recherche large, gardant plus de fragments" } }];' }, position: [944, 528], notesInFlow: true }
});

const wf = workflow('SrQI3ph4tDrYWNcH', 'RAG Answer Pipeline', { executionOrder: 'v1', binaryMode: 'separate', availableInMCP: true, description: 'Five-stage answering over the ingested course PDFs: contextualise the question, route it to a search budget, search with French full text plus pgvector fused by RRF, rerank the shortlist, then answer only from what survived. Reads the rag_documents table built by the RAG Schema Setup workflow.' });

export default wf
  .add(course_Questions)
  .to(contextualise_Question)
  .to(read_Standalone_Query)
  .to(classify_Intent)
  .to(read_Route)
  .to(route_the_Question.onCase(0, [plan_Exact_Terms
    .to(keyword_Search), collect_Keyword_Results
    .to(vector_Search)
    .to(gather_Both_Lists)
    .to(fuse_Rankings)
    .to(build_Rerank_List)
    .to(rerank_Fragments)
    .to(apply_Rerank)
    .to(found_Anything.onTrue(generate_Answer).onFalse(nothing_Found))]).onCase(1, plan_Conceptual
    .to(keyword_Search)).onCase(2, plan_Whole_Document
    .to(keyword_Search)))