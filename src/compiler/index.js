import { syncBuiltinESMExports } from "node:module";

const isNameStart = (c) => /[A-Za-z_]/.test(c);
const isNamePart = (c) => /[A-Za-z0-9_-]/.test(c);

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
    if (c === "=") {
      tokens.push({ type: "=" });
      i++;
      continue;
    }

    if (/\s/.test(c)) {
      i++;
      continue;
    }

    if (c === '"') {
      i++;
      const start = i;

      while (i < input.length && input[i] !== '"') {
        i++;
      }

      if (i >= input.length) {
        throw new SyntaxError(
          `Unterminated string starting at index ${start - 1}`,
        );
      }

      tokens.push({ type: "string", value: input.slice(start, i) });
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

export function parse(tokens) {
  let pos = 0; // cursor: index of the next unread token

  const next = () => tokens[pos++];

  const peek = () => tokens[pos];

  function expect(type) {
    const token = next();
    if (!token || token.type !== type) {
      const found = token ? token.type : "end of input";
      throw new SyntaxError(`Expected "${type}" but found ${found}`);
    }
    return token;
  }

  expect("<");
  const tag = expect("name").value;

  // zero or more attributes, until we hit the closing "/"
  const attributes = [];
  while (peek() && peek().type === "name") {
    const name = next().value;
    expect("=");
    const value = expect("string").value;
    attributes.push({ name, value });
  }

  expect("/");
  expect(">");

  return { type: "element", tag, attributes, children: [] };
}

export function generate(node) {
  const type = JSON.stringify(node.tag);

  // No attributes yet
  const props =
    node.attributes.length === 0
      ? "null"
      : `{ ${node.attributes.map((attr) => `${JSON.stringify(attr.name)}: ${JSON.stringify(attr.value)}`).join(", ")} }`;

  return `createElement(${type}, ${props})`;
}
