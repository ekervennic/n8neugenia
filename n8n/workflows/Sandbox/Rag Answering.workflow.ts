const embeddings_Google_Gemini = embedding({ type: '@n8n/n8n-nodes-langchain.embeddingsGoogleGemini', version: 1, config: { credentials: { googlePalmApi: newCredential('Clé gmail elena', 'odMAexQ4JQr2prvj') }, position: [-128, 528], notes: '3072 dimensions, the same model the ingestion sub-workflow writes with. If these two ever diverge, a question vector can no longer be compared with the stored vectors and the search silently returns nonsense.', notesInFlow: true } });
const gemini_Flash_Lite = languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini', version: 1, config: { name: 'Gemini Flash Lite', parameters: { modelName: 'models/gemini-2.5-flash-lite', options: {} }, position: [912, 384], notesInFlow: true } });

const course_Questions = trigger({
  type: '@n8n/n8n-nodes-langchain.chatTrigger',
  version: 1.1,
  config: { name: 'Course Questions', parameters: { public: true, mode: 'webhook', options: {} }, position: [-640, 144], webhookId: 'b40de5c8-a3d7-49fd-8677-06e53dc18b3a', notes: 'Ask a question about the ingested course material. One question at a time; the workflow answers from the fragments it retrieves and refuses when they do not contain the answer.', notesInFlow: true }
});

const read_Question = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Read Question', parameters: { jsCode: '// One clean question string for every downstream step. Both search branches and\n// the final prompt read this field, so they can never disagree on what was asked.\nconst question = String($json.chatInput || $json.question || "").trim();\n\nif (!question) {\n  throw new Error("Question vide : rien a rechercher.");\n}\n\nreturn [{ json: { question } }];' }, position: [-416, 144], notes: 'Normalises the chat input into a single "question" field.', notesInFlow: true }
});

const keyword_Search = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: 'Keyword Search', parameters: { operation: 'executeQuery', query: '-- Half of the hybrid search: plain full-text matching, which finds the exact\n-- wording a question uses (a name, a formula, a date) that embeddings tend to blur.\n-- If nothing matches, it falls back to a substring match on the longest words so\n-- the vector half is never left on its own.\nwith params as (\n  select websearch_to_tsquery(\'french\', $1) as tsq\n),\nscored as (\n  select\n    r.id,\n    r.content,\n    r.metadata,\n    ts_rank(to_tsvector(\'french\', r.content), p.tsq) as score\n  from rag_documents r\n  cross join params p\n  where to_tsvector(\'french\', r.content) @@ p.tsq\n),\nwords as (\n  select unnest(regexp_split_to_array(lower($1), \'[^[:alnum:]]+\')) as w\n),\nkept as (\n  select w from words where length(w) > 3\n)\nselect s.id, s.content, s.metadata, s.score\nfrom scored s\nunion all\nselect r.id, r.content, r.metadata, 0.01 as score\nfrom rag_documents r\nwhere not exists (select 1 from scored)\n  and exists (\n    select 1 from kept k where lower(r.content) like (\'%\' || k.w || \'%\')\n  )\norder by score desc\nlimit 20;', options: { queryReplacement: expr('{{ $json.question }}') } }, credentials: { postgres: newCredential('Postgres Elena clé', '6hgLXGJga7YeTQ1R') }, position: [-128, 0], notes: 'French full-text search over the fragment text. alwaysOutputData keeps the chain alive when the question matches nothing, so the vector half still runs.', notesInFlow: true }
});

const tag_Keyword_Results = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Tag Keyword Results', parameters: { jsCode: '// Labels each row with which list it came from and its rank in that list, so the\n// fusion step can recognise the same fragment coming from both halves.\nreturn items.map((item, index) => ({\n  json: {\n    __list: "keyword",\n    __rank: index + 1,\n    content: item.json.content,\n    metadata: item.json.metadata || {},\n  },\n}));' }, position: [160, 0], notes: 'Adds list name and rank. Rank starts at 1, as Reciprocal Rank Fusion expects.', notesInFlow: true }
});

const combine_Both_Lists = merge({
  version: 3.2,
  config: { name: 'Combine Both Lists', position: [384, 144], notes: 'Appends the keyword list and the vector list into one stream so the fusion step can compare them. A linear chain would have discarded the keyword hits as soon as the vector search consumed them.' }
});

const tag_Vector_Results = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Tag Vector Results', parameters: { jsCode: '// Same labelling as the keyword half. The two lists are matched on the fragment text\n// because the vector store returns the fragment body and its metadata, not the row id.\nreturn items.map((item, index) => ({\n  json: {\n    __list: "vector",\n    __rank: index + 1,\n    content: item.json.pageContent,\n    metadata: item.json.metadata || {},\n  },\n}));' }, position: [160, 304], notes: 'Adds list name and rank to the vector hits.', notesInFlow: true }
});

const vector_Search = node({
  type: '@n8n/n8n-nodes-langchain.vectorStorePGVector',
  version: 1.3,
  config: { name: 'Vector Search', parameters: { mode: 'load', tableName: 'rag_documents', prompt: expr('{{ $("Read Question").first().json.question }}'), topK: 20, options: { distanceStrategy: 'cosine', columnNames: { values: { contentColumnName: 'content' } } } }, credentials: { postgres: newCredential('Postgres Elena clé', '6hgLXGJga7YeTQ1R') }, position: [-192, 304], notes: 'The other half: embeds the question and asks pgvector for the closest fragments on cosine distance. Runs after the keyword half so the two lists can be compared, not raced.', notesInFlow: true, subnodes: { embedding: embeddings_Google_Gemini } }
});

const fuse_Rankings = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Fuse Rankings', parameters: { jsCode: '// Reciprocal Rank Fusion. Neither half is trusted alone: the vector half understands\n// rephrasing, the keyword half pins exact wording. Ranking the two lists and\n// combining 1/(k + rank) rewards fragments that BOTH halves agree on, without\n// needing the two incomparable scores to be on the same scale.\nconst K = 60;\nconst TOP_N = 6;\n\nconst question = $("Read Question").first().json.question;\nconst byContent = new Map();\n\nfor (const item of items) {\n  const j = item.json;\n  const content = String(j.content || "").trim();\n\n  if (!content || !j.__list) {\n    continue;\n  }\n\n  if (!byContent.has(content)) {\n    byContent.set(content, { content, metadata: j.metadata || {}, hits: [] });\n  }\n\n  byContent.get(content).hits.push({ list: j.__list, rank: Number(j.__rank) || 1 });\n}\n\nconst fused = [];\n\nfor (const entry of byContent.values()) {\n  let score = 0;\n\n  for (const hit of entry.hits) {\n    score += 1 / (K + hit.rank);\n  }\n\n  fused.push({\n    content: entry.content,\n    metadata: entry.metadata,\n    rrf_score: Number(score.toFixed(6)),\n    found_by: [...new Set(entry.hits.map((h) => h.list))].join(" + "),\n  });\n}\n\nfused.sort((a, b) => b.rrf_score - a.rrf_score);\nconst top = fused.slice(0, TOP_N);\n\nconst context = top.length\n  ? top\n      .map((d, i) => {\n        const meta = d.metadata || {};\n        const source = meta.file_name ? meta.file_name : "source inconnue";\n        const chunk = meta.chunk_index !== undefined ? meta.chunk_index : "?";\n        return `[${i + 1}] ${source} - fragment ${chunk} (${d.found_by})\\n${d.content}`;\n      })\n      .join("\\n\\n")\n  : "Aucun fragment trouve.";\n\nreturn [\n  {\n    json: {\n      question,\n      context,\n      fragments_returned: top.length,\n      keyword_hits: byContent.size ? fused.filter((f) => f.found_by.includes("keyword")).length : 0,\n      both_lists: fused.filter((f) => f.found_by.includes("+")).length,\n      // Kept in the output so a weak result can be explained instead of guessed at.\n      fused_scores: top.map((d) => ({ score: d.rrf_score, found_by: d.found_by, opening: d.content.slice(0, 60) })),\n    },\n  },\n];' }, position: [608, 144], notes: 'Fuses both ranked lists into one context block, and reports how many fragments each half contributed so a weak result is visible instead of silent.', notesInFlow: true }
});

const course_Assistant = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: { name: 'Course Assistant', parameters: { promptType: 'define', text: expr('<rag_answer_prompt>\n\n  <role>\n    Tu réponds aux questions d\u2019un élève à partir de ses cours.\n  </role>\n\n  <absolute_rule>\n    Utilise uniquement les informations présentes dans les fragments.\n    N\u2019utilise jamais tes connaissances générales.\n    N\u2019invente aucune information.\n    Si la réponse ne se trouve pas clairement dans les fragments, réponds exactement :\n    Je ne trouve pas cette information dans tes cours.\n    Ne rajoute rien après cette phrase.\n  </absolute_rule>\n\n  <citation_rule>\n    Quand tu utilises une information provenant d\u2019un fragment, cite le nom du fichier entre crochets.\n    Exemple : [Courir].\n    Si plusieurs fichiers sont utilisés, cite-les tous.\n    N\u2019invente jamais un nom de fichier.\n  </citation_rule>\n\n  <input>\n    <fragments><![CDATA[\n{{ $json.context }}\n    ]]></fragments>\n\n    <question><![CDATA[\n{{ $json.question }}\n    ]]></question>\n  </input>\n\n  <output_rules>\n    Réponds en français.\n    Réponds directement à la question.\n    Sois clair et concis.\n    Ne mentionne pas les fragments, le RAG, les embeddings ou la recherche hybride.\n    Ne donne aucune information qui n\u2019est pas présente dans les fragments.\n  </output_rules>\n\n  <examples>\n\n    <example number="1">\n      <fragments>\n        Fichier : Courir\n        Information : Jean Echenoz est l\u2019auteur du livre Courir.\n      </fragments>\n      <question>Qui a écrit Courir ?</question>\n      <expected_output>\n        Jean Echenoz a écrit Courir. [Courir]\n      </expected_output>\n    </example>\n\n    <example number="2">\n      <fragments>\n        Fichier : Cours de droit\n        Information : La règle s\u2019applique aux étudiants majeurs.\n\n        Fichier : Règlement intérieur\n        Information : Les étudiants doivent respecter les horaires.\n      </fragments>\n      <question>Quelles règles concernent les étudiants majeurs ?</question>\n      <expected_output>\n        La règle s\u2019applique aux étudiants majeurs. [Cours de droit]\n      </expected_output>\n    </example>\n\n    <example number="3">\n      <fragments>\n        Fichier : Cours de littérature\n        Information : Le roman étudié a été publié en 1957.\n      </fragments>\n      <question>Dans quelle ville l\u2019auteur est-il né ?</question>\n      <expected_output>\n        Je ne trouve pas cette information dans tes cours.\n      </expected_output>\n    </example>\n\n    <example number="4">\n      <fragments>\n        Fichier : Cours d\u2019histoire\n        Information : La Révolution française commence en 1789.\n      </fragments>\n      <question>Peux-tu me donner les causes économiques détaillées de la Révolution française ?</question>\n      <expected_output>\n        Je ne trouve pas cette information dans tes cours.\n      </expected_output>\n    </example>\n\n  </examples>\n\n  <final_instruction>\n    Réponds uniquement à la question de l\u2019élève en respectant toutes les règles précédentes.\n  </final_instruction>\n\n</rag_answer_prompt>'), batching: {} }, position: [832, 144], notes: 'Answers from the fused fragments only, and says so when they do not contain the answer.', notesInFlow: true, subnodes: { model: gemini_Flash_Lite } }
});

const wf = workflow('MKbzPtfpwhKLXpPW', 'Rag Answering', { executionOrder: 'v1', binaryMode: 'separate', availableInMCP: true, description: 'Answers a question about the ingested course PDFs with a hybrid search: French full-text matching in Postgres fused by Reciprocal Rank Fusion with a pgvector similarity search, both using the same Gemini embedding model as the ingestion. Read the rag_documents table built by the RAG Schema Setup workflow.' });

export default wf
  .add(course_Questions)
  .to(read_Question
  .to([
    keyword_Search
    .to(tag_Keyword_Results),
    vector_Search
    .to(tag_Vector_Results)]))
  .add(tag_Vector_Results.to(combine_Both_Lists.input(1)))
  .add(tag_Keyword_Results.to(combine_Both_Lists.input(0)))
  .add(combine_Both_Lists)
  .to(fuse_Rankings
  .to(course_Assistant))