const on_Form_Submission = trigger({
  type: 'n8n-nodes-base.formTrigger',
  version: 2.6,
  config: { name: 'On Form Submission', parameters: { authentication: 'n8nUserAuth', formTitle: expr('Course'), formFields: { values: [{ fieldLabel: 'PDF', fieldType: 'file' }] }, options: {} }, position: [-368, -480], webhookId: 'f250e367-2d46-49a8-922e-62d69bb85458' }
});

const stash_PDF_as_Base64 = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Stash PDF as Base64', parameters: { jsCode: 'const items = $input.all();\nconst out = [];\n\nfor (const item of items) {\n  const binary = item.binary?.PDF;\n\n  if (!binary?.data) {\n    throw new Error(\'Le champ binaire PDF est absent.\');\n  }\n\n  const data = binary.data;\n  const fileName = binary.fileName || \'document.pdf\';\n  const mimeType = binary.mimeType || \'application/pdf\';\n\n  out.push({\n    json: {\n      ...item.json,\n      pdf_base64: data,\n      pdf_file_name: fileName\n    },\n    binary: {\n      PDF: {\n        data,\n        mimeType,\n        fileName\n      }\n    }\n  });\n}\n\nreturn out;' }, position: [-144, -480] }
});

const extract_PDF_Text = node({
  type: 'n8n-nodes-base.extractFromFile',
  version: 1.1,
  config: { name: 'Extract PDF Text', parameters: { operation: 'pdf', binaryPropertyName: 'PDF', options: { keepSource: 'both' } }, position: [80, -480], notes: 'Reads the embedded text layer. Returns an empty string rather than an error when the PDF is a scan.' }
});

const check_Extracted_Text = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: { name: 'Check Extracted Text', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 }, conditions: [{ id: 'text-length-check', leftValue: expr('{{ ($json.text || \'\').trim().length }}'), rightValue: 0, operator: { type: 'number', operation: 'gt' } }], combinator: 'and' }, options: {} }, position: [304, -480] }
});

const chunk_and_Normalize_Text = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Chunk and Normalize Text', parameters: { jsCode: 'const CHUNK_CHARS = 1200;\nconst OVERLAP_CHARS = 120;\n\nfunction contentId(text) {\n  let h1 = 0x811c9dc5;\n  let h2 = 0x01000193;\n  for (let i = 0; i < text.length; i++) {\n    const c = text.charCodeAt(i);\n    h1 ^= c;\n    h1 = Math.imul(h1, 0x01000193);\n    h2 ^= (c + i);\n    h2 = Math.imul(h2, 0x85ebca6b);\n  }\n  return (h1 >>> 0).toString(16).padStart(8, \'0\') + (h2 >>> 0).toString(16).padStart(8, \'0\');\n}\n\nconst out = [];\n\nfor (const item of $input.all()) {\n  const j = item.json || {};\n  const raw = j.text || j.extractedText || j.data || \'\';\n\n  const text = String(raw)\n    .replace(/\\r\\n/g, \'\\n\')\n    .replace(/-\\n/g, \'\')\n    .replace(/[ \\t]+/g, \' \')\n    .replace(/\\n{3,}/g, \'\\n\\n\')\n    .trim();\n\n  if (text.length === 0) {\n    continue;\n  }\n\n  const binaryName = item.binary && item.binary.PDF ? item.binary.PDF.fileName : null;\n  const file_name = binaryName || j.file_name || \'unknown.pdf\';\n  const document_id = contentId(text);\n  const ingested_at = new Date().toISOString();\n\n  let start = 0;\n  let chunk_index = 0;\n\n  while (start < text.length) {\n    let end = Math.min(start + CHUNK_CHARS, text.length);\n\n    if (end < text.length) {\n      const boundary = text.lastIndexOf(\' \', end);\n      if (boundary > start + Math.floor(CHUNK_CHARS / 2)) {\n        end = boundary;\n      }\n    }\n\n    const chunk = text.slice(start, end).trim();\n\n    if (chunk.length > 0) {\n      out.push({ json: { text: chunk, chunk_index, document_id, file_name, ingested_at } });\n      chunk_index++;\n    }\n\n    if (end >= text.length) {\n      break;\n    }\n\n    const next = end - OVERLAP_CHARS;\n    start = next > start ? next : end;\n  }\n}\n\nreturn out;' }, position: [976, -480], notes: 'Both branches converge here so they cannot disagree on the field name. It reads extractedText from the OCR branch and data from the text layer branch, repairs PDF extraction damage, then cuts the text into overlapping chunks and emits one item per chunk. Empty text is dropped rather than embedded as an empty vector. document_id is a pure function of the content, so re-ingesting the same PDF produces the same id.', notesInFlow: true }
});

const limit = node({
  type: 'n8n-nodes-base.limit',
  version: 1,
  config: { name: 'Limit', position: [1200, -480] }
});

const process_in_Batches = node({
  type: 'n8n-nodes-base.splitInBatches',
  version: 3,
  config: { name: 'Process in Batches', parameters: { options: { reset: false } }, position: [1424, -480], notes: 'The Gemini embeddings endpoint returns empty vectors when a single call carries the whole document set (reproduced: 145-196 chunks -> zero-length vectors, 1 chunk -> valid 3072-dim vector). This loop keeps each embedding request small and inserts each batch as it goes.' }
});

const embed_and_Store_Batches = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: { name: 'Embed and Store Batches', parameters: { workflowId: { __rl: true, value: 'FYhCiothhv5jVAAZ', mode: 'list', cachedResultUrl: '/workflow/FYhCiothhv5jVAAZ', cachedResultName: 'Embed and Store Chunks' }, workflowInputs: { mappingMode: 'passThrough', value: {}, matchingColumns: [], schema: [{ id: 'text', displayName: 'text', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string', removed: false }, { id: 'document_id', displayName: 'document_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string', removed: false }, { id: 'file_name', displayName: 'file_name', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string', removed: false }, { id: 'chunk_index', displayName: 'chunk_index', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string', removed: false }, { id: 'ingested_at', displayName: 'ingested_at', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string', removed: false }], attemptToConvertTypes: false, convertFieldsToString: true }, mode: 'each', options: {} }, position: [1648, -560], notes: 'The pipeline ends here: each batch of two fragments is handed to the Embed and Store Chunks sub-workflow, which embeds them with Gemini and writes them into Supabase over Postgres. executeOnce keeps it to one sub-workflow run per batch.' }
});

const pace_Between_Batches = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: { name: 'Pace Between Batches', parameters: { amount: 3 }, position: [1872, -480], webhookId: '7f360fa4-3c65-4d47-a1e6-852e8c8c591f', notes: 'The Gemini embedding endpoint returns empty vectors once several large embedContent calls land in the same short window. Reproduced deterministically: calls 1 and 2 succeed, call 3 returns zero-length vectors. This pause keeps the call rate under the limit.' }
});

const rebuild_PDF_Binary = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Rebuild PDF Binary', parameters: { jsCode: '// Rebuilds the binary property the Mistral OCR node expects.\n//\n// It reads the base64 copy straight from the stash node instead of relying on\n// the current item, because "Extract From File" on this instance replaces the\n// item JSON outright, so pdf_base64 never survives the extraction step.\nconst source = $(\'Stash PDF as Base64\').first().json;\nconst data = source.pdf_base64;\n\nif (!data) {\n  throw new Error(\'Copie base64 du PDF introuvable : la branche OCR ne peut pas reconstruire le fichier.\');\n}\n\nreturn items.map((item) => ({\n  json: item.json,\n  binary: {\n    PDF: {\n      data,\n      mimeType: \'application/pdf\',\n      fileName: source.pdf_file_name || \'document.pdf\',\n    },\n  },\n}));\n' }, position: [528, -416] }
});

const extract_Text_OCR = node({
  type: 'n8n-nodes-base.mistralAi',
  version: 1,
  config: { name: 'Extract Text OCR', parameters: { binaryProperty: 'PDF', options: {} }, credentials: { mistralCloudApi: newCredential('Clé mistral n8n', 'DdKsa7Kj2agi9lb9') }, position: [752, -416], notes: 'Optical character recognition for scanned course PDFs. This node previously declared neither resource nor operation, so it had no valid operation at all and could never run. Its answer lands in extractedText, not data.' }
});

const wf = workflow('47InbFKzNzfmQUZO', 'RAG Ingestion V4', { executionOrder: 'v1', binaryMode: 'separate', availableInMCP: true, description: 'Ingests a course PDF into a pgvector index. Reads the embedded text layer, falls back to Mistral optical character recognition when the PDF is a scan, cleans and chunks the text, embeds each chunk with Gemini, and writes it to Supabase with the metadata the chat needs to cite a source. The RAG Chat workflow queries this index.' });

export default wf
  .add(on_Form_Submission)
  .to(stash_PDF_as_Base64)
  .to(extract_PDF_Text)
  .to(check_Extracted_Text.onTrue(chunk_and_Normalize_Text
    .to(limit)
    .to(splitInBatches(process_in_Batches)
    .onEachBatch(embed_and_Store_Batches
      .to(pace_Between_Batches)
      .to(nextBatch(process_in_Batches))))).onFalse(rebuild_PDF_Binary
    .to(extract_Text_OCR)
    .to(chunk_and_Normalize_Text)))