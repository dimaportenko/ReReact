const isNameStart = (c) => /[A-Za-z_]/.test(c);
const isNamePart = (c) => /[A-Za-z0-9_]/.test(c);

export function tokenize(input) {
  const tokens = [];
  let i = 0; // cursor: index of the next unread character

  while (i < input.length) {
    const c = input[i];

    if (c === "<") {
      tokens.push({ type: "<" });
      i++;
      continue;
    }
    if (c === ">") {
      tokens.push({ type: ">" });
      i++;
      continue;
    }
    if (c === "/") {
      tokens.push({ type: "/" });
      i++;
      continue;
    }

    if (/\s/.test(c)) {
      i++;
      continue;
    }

    if (isNameStart(c)) {
      const start = i;
      while (i < input.length && isNamePart(input[i])) {
        i++;
      }
      tokens.push({ type: "name", value: input.slice(start, i) });

      continue;
    }

    throw new SyntaxError(
      `Unexpected character ${JSON.stringify(c)} at index ${i}`,
    );
  }

  return tokens;
}
