const when_clicking_Execute_workflow = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'When clicking \u2018Execute workflow\u2019' }
});

const hTTP_Request = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'HTTP Request', parameters: { url: 'https://jsonplaceholder.typicode.com/users', options: {} }, position: [224, 0] }
});

const edit_Fields = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Edit Fields', parameters: { assignments: { assignments: [{ id: 'dd8233c2-d526-4a07-9860-c9230186059e', name: 'id', value: expr('{{ $json.id }}'), type: 'number' }, { id: 'f8a0e4db-66c0-4800-9cde-08ba8540a202', name: 'nom', value: expr('{{ $json.username }}'), type: 'string' }, { id: '96178e6f-3bbd-48a0-8c64-b88497156f6f', name: 'ville', value: expr('{{ $json.address.city }}'), type: 'string' }] }, options: {} }, position: [448, 0] }
});

const filter = node({
  type: 'n8n-nodes-base.filter',
  version: 2.3,
  config: { name: 'Filter', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 }, conditions: [{ id: '88cae738-7441-427a-92fa-ac72ad93b33b', leftValue: expr('{{ $json.id }}'), rightValue: 2, operator: { type: 'number', operation: 'gt' } }, { id: '3a24ed9e-7f68-4dff-b63d-38bb0d0d801d', leftValue: expr('{{ $json.ville }}'), rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }], combinator: 'and' }, options: {} }, position: [672, 0] }
});

const limit = node({
  type: 'n8n-nodes-base.limit',
  version: 1,
  config: { name: 'Limit', parameters: { maxItems: 5 }, position: [896, 0] }
});

const merge_node = merge({
  version: 3.2,
  config: { name: 'Merge', parameters: { mode: 'combine', fieldsToMatchString: 'id', options: {} }, position: [1600, -16] }
});

const hTTP_Request1 = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'HTTP Request1', parameters: { url: expr('https://jsonplaceholder.typicode.com/todos/{{ $json.id }}'), options: {} }, position: [1152, 144] }
});

const edit_Fields1 = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Edit Fields1', parameters: { assignments: { assignments: [{ id: '9d3d9898-a43d-4bc8-9a90-074c65c1c153', name: 'title', value: expr('{{ $json.title }}'), type: 'string' }, { id: '6ce41093-4065-44c8-ab96-1e426cf2fa90', name: 'completed', value: expr('{{ $json.completed }}'), type: 'boolean' }, { id: '7174e8a1-6c47-45af-8d89-44faed5f641d', name: 'id', value: expr('{{ $json.id }}'), type: 'number' }] }, options: {} }, position: [1360, 144] }
});

const code_in_JavaScript = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Code in JavaScript', parameters: { jsCode: 'const item = $input.item.json;\n\nreturn {\n  json: {\n    ...item,\n    statut: item.completed ? "Terminée" : "À faire",\n    resume: `${item.nom} (${item.ville}) : ${item.title}`\n  }\n};' }, position: [1856, -16] }
});

const wf = workflow('RFWwbhAvCi3Oux2l', 'Module Test', { executionOrder: 'v1', binaryMode: 'separate', availableInMCP: true });

export default wf
  .add(when_clicking_Execute_workflow)
  .to(hTTP_Request)
  .to(edit_Fields)
  .to(filter)
  .to(limit)
  .to(hTTP_Request1)
  .to(edit_Fields1)
  .add(limit.to(merge_node.input(0)))
  .add(edit_Fields1.to(merge_node.input(1)))
  .add(merge_node)
  .to(code_in_JavaScript)