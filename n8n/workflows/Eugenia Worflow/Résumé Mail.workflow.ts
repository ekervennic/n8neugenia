const when_clicking_Execute_workflow = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'When clicking \u2018Execute workflow\u2019' }
});

const get_many_messages = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: { name: 'Get many messages', parameters: { operation: 'getAll', limit: 10, filters: { labelIds: ['IMPORTANT'], readStatus: 'unread' } }, credentials: { gmailOAuth2: newCredential('Gmail account', 'UWpq4RiHTFChUUpE') }, position: [208, -16], webhookId: 'bbb664a2-fa7b-42db-a1f8-6a298b9ad68f' }
});

const aggregate = node({
  type: 'n8n-nodes-base.aggregate',
  version: 1,
  config: { name: 'Aggregate', parameters: { fieldsToAggregate: { fieldToAggregate: [{ fieldToAggregate: 'snippet' }, { fieldToAggregate: 'From' }, { fieldToAggregate: 'Subject' }] }, options: {} }, position: [432, -16] }
});

const message_a_model = node({
  type: '@n8n/n8n-nodes-langchain.openAi',
  version: 2.3,
  config: { name: 'Message a model', parameters: { modelId: { __rl: true, value: 'gpt-4o-mini', mode: 'list', cachedResultName: 'GPT-4O-MINI' }, responses: { values: [{ content: expr('Voici la liste de mes derniers emails. Fais un résumé global en français :\n- regroupe les mails par thème\n- mets en premier ce qui est urgent ou demande une action de ma part\n- 10 lignes maximum\n\nExpéditeurs : {{ $json.From }}\nObjets : {{ $json.Subject }}\nContenus : {{ $json.snippet }}\nFormat : texte brut uniquement, sans Markdown (pas de #, pas de **, pas de tirets décoratifs). Utilise des titres en majuscules et des lignes simples.\nEt ignore les newsletters et les publicités') }] }, builtInTools: {}, options: {} }, position: [672, 0] }
});

const send_a_message = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: { name: 'Send a message', parameters: { sendTo: 'ekervennic@eugeniaschool.com', subject: 'Résumé de mes mails du jour', emailType: 'text', message: expr('{{ $json.output[0].content[0].text }}'), options: { appendAttribution: false } }, credentials: { gmailOAuth2: newCredential('Gmail account', 'UWpq4RiHTFChUUpE') }, position: [1040, 0], webhookId: 'b5a8822a-2213-4eab-a7f3-f521ce9e8da5' }
});

const wf = workflow('IpIBKSubzcu0Iey4', 'Résumé Mail', { executionOrder: 'v1', binaryMode: 'separate', availableInMCP: true });

export default wf
  .add(when_clicking_Execute_workflow)
  .to(get_many_messages)
  .to(aggregate)
  .to(message_a_model)
  .to(send_a_message)