async function probe() {
  const r1 = await fetch('http://localhost:3000/api/conversations');
  const d1 = await r1.json();
  console.log('Conversations count:', d1.sessions.length);

  const r2 = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Review this config snippet.',
      attachments: [{ name: 'server.json', type: 'application/json', text: '{"port": 3000, "env": "prod"}' }]
    })
  });
  const d2 = await r2.json();
  console.log('\nGemini Reply with Attachment:');
  console.log(d2.reply);
  console.log('\nStats:', JSON.stringify(d2.stats, null, 2));
  process.exit(0);
}

probe().catch(err => {
  console.error('Probe failed:', err);
  process.exit(1);
});

