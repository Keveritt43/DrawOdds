/** IDFG's published counts describe applicants listing a tag at a given choice.
 * They do not establish how many were still eligible after their earlier choices. */
export function tagChoiceHistory(draw: { applied?: number[]; drew?: number[] } | null | undefined, choice: number) {
  const applied = draw?.applied?.[choice];
  const drew = draw?.drew?.[choice];
  if (!Number.isInteger(applied) || !Number.isInteger(drew) || applied! <= 0 || drew! < 0 || drew! > applied!) return null;
  return { applied: applied!, drew: drew!, rate: drew! / applied! };
}
