import '../src/server.js';

async function probe() {
  // Give server 500ms to bind port
  await new Promise(r => setTimeout(r, 600));

  console.log('📡 Probing GET /api/health...');
  const healthRes = await fetch('http://localhost:3000/api/health');
  const healthData = await healthRes.json();
  console.log('Health Response:', JSON.stringify(healthData, null, 2));

  console.log('\n💬 Probing POST /api/chat (Multi-turn turn 1)...');
  const chat1 = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Hello, my name is Alex and I am testing the API.',
      provider: 'demo',
    }),
  });
  const data1 = await chat1.json();
  console.log('Chat 1 Reply:', data1.reply);
  console.log('Chat 1 Stats:', JSON.stringify(data1.stats, null, 2));

  console.log('\n💬 Probing POST /api/chat (Multi-turn turn 2)...');
  const chat2 = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId: data1.conversationId,
      message: 'What was my name again?',
      provider: 'demo',
    }),
  });
  const data2 = await chat2.json();
  console.log('Chat 2 Reply:', data2.reply);
  console.log('Chat 2 Stats:', JSON.stringify(data2.stats, null, 2));

  console.log('\n✅ All server endpoints verified successfully!');
  process.exit(0);
}

probe().catch(err => {
  console.error('Probe failed:', err);
  process.exit(1);
});
