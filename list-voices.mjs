import 'dotenv/config';
const r = await fetch('https://api.elevenlabs.io/v1/voices', {
  headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
});
const j = await r.json();
for (const v of j.voices || []) {
  console.log(v.voice_id, '·', v.name, '·', v.category, '·', v.labels?.gender || '');
}
