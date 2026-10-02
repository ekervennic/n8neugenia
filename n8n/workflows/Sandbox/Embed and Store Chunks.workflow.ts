const markdown_Section_Splitter = textSplitter({ type: '@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter', version: 1, config: { name: 'Markdown Section Splitter', parameters: { chunkOverlap: 50, options: {} }, position: [592, 544], notes: 'Second line of defence: re-splits any fragment still above the size limit after the parent Code node chunked it.', notesInFlow: true } });
const load_and_Split_Document = documentLoader({ type: '@n8n/n8n-nodes-langchain.documentDefaultDataLoader', version: 1, config: { name: 'Load and Split Document', parameters: { options: { metadata: { metadataValues: [{ name: 'document_id', value: expr('{{ $json.document_id }}') }, { name: 'file_name', value: expr('{{ $json.file_name }}') }, { name: 'chunk_index', value: expr('{{ $json.chunk_index }}') }, { name: 'ingested_at', value: expr('{{ $json.ingested_at }}') }] } } }, position: [512, 336], notes: 'Turns each incoming chunk into a document. The metadata is what lets the search quote a file name and chunk number back to Elena.', notesInFlow: true, subnodes: { textSplitter: markdown_Section_Splitter } } });
const embeddings_Google_Gemini = embedding({ type: '@n8n/n8n-nodes-langchain.embeddingsGoogleGemini', version: 1, config: { position: [384, 336], notes: '3072 dimensions. Must stay identical to the model used by the RAG Hybrid Search workflow, otherwise a query vector cannot be compared with the stored ones.', notesInFlow: true } });

const chunks_Received = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.1,
  config: { name: 'Chunks Received', parameters: { inputSource: 'passthrough', returnOutput: 'allRuns' }, position: [144, 96], notes: 'Entry point for the RAG Ingestion V4 sub-workflow. The parent hands over a small batch of already-chunked fragments; the input list is empty on purpose because the items themselves are the payload.', notesInFlow: true }
});

const store_Fragments_in_Postgres = node({
  type: '@n8n/n8n-nodes-langchain.vectorStorePGVector',
  version: 1.3,
  config: { name: 'Store Fragments in Postgres', parameters: { mode: 'insert', tableName: 'rag_documents', embeddingBatchSize: 1, options: { columnNames: { values: { contentColumnName: 'content' } } } }, credentials: { postgres: newCredential('Postgres Elena clé', '6hgLXGJga7YeTQ1R') }, position: [400, 96], notes: 'Writes the embedded fragments into Supabase over the Postgres connection. embeddingBatchSize is kept at 2 because the Gemini endpoint silently returns empty vectors when a single request carries too much text.', notesInFlow: true, subnodes: { documentLoader: load_and_Split_Document, embedding: embeddings_Google_Gemini } }
});

const wf = workflow('FYhCiothhv5jVAAZ', 'Embed and Store Chunks', { executionOrder: 'v1', binaryMode: 'separate', availableInMCP: true, description: 'Sub-workflow called by the ingestion pipeline for each small batch of fragments. Embeds them with Gemini and writes them to the rag_documents table in Supabase through the Postgres connection.' });

export default wf
  .add(chunks_Received)
  .to(store_Fragments_in_Postgres)