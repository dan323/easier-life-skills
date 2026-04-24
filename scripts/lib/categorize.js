/* lib/categorize.js — infers categories for uncategorised skills via GitHub Models API */

const CATEGORIES = ['automation', 'code-quality', 'documentation', 'productivity'];

export async function inferCategories(uncategorisedSkills) {
  const token = process.env.MODELS_TOKEN || process.env.GITHUB_TOKEN;
  if (!token || uncategorisedSkills.length === 0) return {};

  const list = uncategorisedSkills
    .map(s => `- ${s.name}: ${String(s.description || '').slice(0, 300)}`)
    .join('\n');

  const prompt =
    `Categorize each Claude Code skill into exactly one of: ${CATEGORIES.join(', ')}.\n` +
    `Reply with a JSON object mapping each skill name to its category. No other text.\n\n` +
    list;

  try {
    const res = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 300,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} — ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const result = JSON.parse(data.choices[0].message.content);
    for (const [name, cat] of Object.entries(result)) {
      if (!CATEGORIES.includes(cat)) result[name] = 'uncategorized';
    }
    console.log(`  Copilot categorised ${Object.keys(result).length} skills`);
    return result;
  } catch (err) {
    console.warn(`  [warn] Copilot categorisation failed: ${err.message}`);
    return {};
  }
}
