/** A grudge at least this strong shapes behaviour and shows as 有芥蒂. */
export const GRUDGE = 0.15;

/**
 * One word for a relationship, shared by the profile page and the reply model so both say the same thing. A grudge
 * shows even when good things outweigh it: being owed an apology is what the member feels.
 */
export function bondWord(b: { closeness: number; grudge: number }) {
  if (b.grudge >= 0.5) return '很差';
  if (b.grudge >= GRUDGE) return '有芥蒂';
  const net = b.closeness - b.grudge;
  return net >= 0.5 ? '很好' : net >= 0.15 ? '不错' : '一般';
}
