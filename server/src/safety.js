// Safety filter. Step 4 replaces this with the Strict / Standard / Custom
// word lists and the teacher's blocked and allowed words.
export function checkSafety(_text, _session) {
  return { allowed: true };
}
