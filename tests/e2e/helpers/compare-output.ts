// Keep exact strings: no trim, newline conversion, punctuation or whitespace normalization.
export function compareOutput(expected: string, actual: string) {
  const wanted = [...expected];
  const received = [...actual];
  let index = 0;
  while (index < wanted.length && index < received.length && wanted[index] === received[index]) index++;
  const character = (value: string | undefined) => value === undefined ? { character: '<EOF>', codePoint: null }
    : { character: value, codePoint: `U+${value.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}` };
  const equal = expected === actual;
  const firstDifference = equal ? null : {
    unicodeIndex: index,
    line: wanted.slice(0, index).filter((value) => value === '\n').length + 1,
    expected: character(wanted[index]), actual: character(received[index]),
  };
  // JSON quoting makes blank lines, CRLF and trailing spaces explicit.
  const left = expected.split('\n');
  const right = actual.split('\n');
  const lines = Array.from({ length: Math.max(left.length, right.length) }, (_, i) => left[i] === right[i]
    ? ` ${i + 1} ${JSON.stringify(left[i])}`
    : `-${i + 1} ${left[i] === undefined ? '<EOF>' : JSON.stringify(left[i])}\n+${i + 1} ${right[i] === undefined ? '<EOF>' : JSON.stringify(right[i])}`);
  return { equal, firstDifference, expectedLength: wanted.length, actualLength: received.length, diff: ['--- expected', '+++ actual', ...lines].join('\n') + '\n' };
}
