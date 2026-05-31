const isNameStart = (c) => /[A-Za-z_]/.test(c);
const isNamePart = (c) => /[A-Za-z0-9_-]/.test(c);

export function tokenize(input) {
  const tokens = [];
  let i = 0; // cursor: index of the next unread character
  let mode = "tag";

  while (i < input.length) {
    const c = input[i];

    if (mode === "text") {
      if (c === "<") {
        mode = "tag";
        continue;
      }

      const start = i;
      while (i < input.length && input[i] !== "<") {
        i++;
      }
      tokens.push({ type: "text", value: input.slice(start, i) });
      continue;
    }

    if (c === "<") {
      tokens.push({ type: "<" });
      i++;
      continue;
    }
    if (c === ">") {
      tokens.push({ type: ">" });
      i++;
      mode = "text";
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

  const peek = (offset = 0) => tokens[pos + offset];

  function expect(type) {
    const token = next();
    if (!token || token.type !== type) {
      const found = token ? token.type : "end of input";
      throw new SyntaxError(`Expected "${type}" but found ${found}`);
    }
    return token;
  }

  function parseElement() {
    expect("<");
    const tag = expect("name").value;

    const attributes = [];
    while (peek() && peek().type === "name") {
      const name = next().value;
      expect("=");
      const value = expect("string").value;
      attributes.push({ name, value });
    }

    if (peek() && peek().type === "/") {
      expect("/");
      expect(">");
      return { type: "element", tag, attributes, children: [] };
    }

    expect(">");
    const children = parseChildren(tag);
    return { type: "element", tag, attributes, children };
  }

  function parseChildren(parentTag) {
    const children = [];
    while (true) {
      const token = peek();
      if (!token) {
        throw new SyntaxError(
          `Unexpected end of input: <${parentTag}> was never closed`,
        );
      }

      // a closing tag "< / name >" ends this child list - the 2 - token lookahead
      if (token.type === "<" && peek(1) && peek(1).type === "/") {
        expect("<");
        expect("/");
        const closeTag = expect("name").value;
        expect(">");
        if (closeTag !== parentTag) {
          throw new SyntaxError(
            `Msimatched closing tag: expected </${parentTag}> but found </${closeTag}>`,
          );
        }
        return children;
      }

      // text child
      if (token.type === "text") {
        children.push({ type: "text", value: next().value });
        continue;
      }

      // nexted element child - recurse
      if (token.type === "<") {
        children.push(parseElement());
        continue;
      }

      throw new SyntaxError(
        `Unexpected ${token.type} token in children of <${parentTag}>`,
      );
    }
  }

  return parseElement();
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
