export const Fragment = Symbol("rereact.fragment");

export function createElement(type, props, ...children) {
  const { key = null, ...rest } = props ?? {};

  return {
    type,
    props: { ...rest, children: children.flat(Infinity) },
    key,
  };
}
