// Pricing snapshots (USD per 1M characters) — update when providers change pricing.
// Keep this conservative: if a price has moved, the guard fires early, which is the safe failure mode.

export const PRICING = {
  // OpenAI Audio API. tts-1: $15/1M, tts-1-hd: $30/1M, gpt-4o-mini-tts: $0.60/1M-ish (per token; rough char approx).
  // Source: https://openai.com/api/pricing/
  'openai:tts-1': 15.0,
  'openai:tts-1-hd': 30.0,
  'openai:gpt-4o-mini-tts': 12.0, // ~ token-based; conservative char approximation

  // ElevenLabs — model-specific char rates. Use cheapest viable models to stay under cap.
  // Source: https://elevenlabs.io/pricing  (Creator/Pro plan rates; free tier monthly quota separate).
  'elevenlabs:eleven_multilingual_v2': 180.0, // $0.18/1k
  'elevenlabs:eleven_turbo_v2_5': 90.0,       // $0.09/1k
  'elevenlabs:eleven_flash_v2_5': 45.0,       // $0.045/1k
  'elevenlabs:*': 90.0,                       // fallback = turbo (narrate.mjs default)

  // Local / free
  'kokoro:*': 0.0,
  'say:*': 0.0,
};

export function estimateCostUSD(backend, model, chars) {
  const key = `${backend}:${model}`;
  const wildcard = `${backend}:*`;
  const rate = PRICING[key] ?? PRICING[wildcard];
  if (rate == null) return null; // unknown — caller decides
  return (chars / 1_000_000) * rate;
}

export function assertWithinBudget(backend, model, totalChars, capUSD) {
  const est = estimateCostUSD(backend, model, totalChars);
  if (est == null) {
    console.log(`  cost: unknown for ${backend}:${model} — proceeding`);
    return;
  }
  console.log(`  cost estimate: $${est.toFixed(4)} (${totalChars} chars × ${backend}:${model}) — cap $${capUSD.toFixed(2)}`);
  if (est > capUSD) {
    throw new Error(
      `Budget exceeded: estimated $${est.toFixed(4)} > cap $${capUSD.toFixed(2)}. ` +
      `Use a cheaper model or raise MAX_COST_PER_VIDEO in .env.`
    );
  }
}
