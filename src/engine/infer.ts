import type { Attribute, Tier } from './constants';

const ATTRIBUTE_KEYWORDS: Record<Attribute, RegExp> = {
  STR: /\b(gym|lift|lifting|workout|train|training|run|running|jog|pushups?|push-ups?|squats?|pullups?|exercise|walk|walking|hike|swim|bike|cycling|yoga|stretch|sport|football|soccer|basketball|tennis|climb|boxing|cardio|steps|plank|dance)\b/i,
  INT: /\b(study|studying|learn|learning|read|reading|book|course|lecture|homework|assignment|research|paper|code|coding|program|programming|debug|bug|project|repo|repository|implement|algorithm|math|physics|quantum|exam|notes|write|writing|essay|thesis|leetcode|docs?)\b/i,
  DEX: /\b(guitar|piano|drums?|violin|bass|ukulele|sing|singing|practice|practise|draw|drawing|paint|painting|sketch|cook|cooking|bake|craft|build|woodwork|knit|sew|photo|photography|edit|video|design|animate|type|typing|juggle|chess)\b/i,
  VIT: /\b(sleep|nap|bed|water|hydrate|meal|eat|breakfast|lunch|dinner|vegetables?|fruit|meditate|meditation|breathe|journal|shower|skincare|teeth|floss|vitamins?|rest|recover|clean|tidy|laundry|dishes|groceries|doctor|therapy|detox|screen)\b/i,
  CHA: /\b(call|text|message|email|meet|meeting|friend|friends|family|mom|dad|parents|date|party|talk|present|presentation|speech|network|networking|interview|apply|pitch|post|share|volunteer|help|compliment|reply|social|club|team)\b/i,
};

/** Best-guess attribute for a quest title, or null when nothing matches. */
export function inferAttribute(title: string): Attribute | null {
  let best: Attribute | null = null;
  let bestIndex = Infinity;
  // Earliest keyword in the title wins: "Practice guitar after the gym" is DEX.
  for (const [attr, re] of Object.entries(ATTRIBUTE_KEYWORDS) as [Attribute, RegExp][]) {
    const m = re.exec(title);
    if (m && m.index < bestIndex) {
      best = attr;
      bestIndex = m.index;
    }
  }
  return best;
}

const BOSS_RE = /\b(finish|ship|launch|submit|complete the|release|publish|defend|graduate)\b/i;
const TINY_RE = /\b(drink|water|floss|bed|vitamins?|stretch|reply|tidy)\b/i;

/** Gentle tier hint. The player always has the final say. */
export function inferTier(title: string): Tier | null {
  if (BOSS_RE.test(title)) return 'challenge';
  if (TINY_RE.test(title)) return 'tiny';
  return null;
}
