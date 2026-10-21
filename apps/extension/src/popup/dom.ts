import { TRACKR_URL } from "../shared/config";
import type { Message } from "../shared/types";

export const send = <T>(message: Message) =>
  chrome.runtime.sendMessage(message) as Promise<T>;

/** Builds an element; strings become text, never HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & {
    dataset?: Record<string, string>;
  } = {},
  ...children: (Node | string | null | false)[]
): HTMLElementTagNameMap[K] {
  const { dataset, ...rest } = props;
  const element = Object.assign(document.createElement(tag), rest);
  if (dataset) Object.assign(element.dataset, dataset);
  for (const child of children) if (child) element.append(child);
  return element;
}

/** Children for replaceChildren, leaving out the ones that don't apply. */
export const present = (...nodes: (Node | false | null)[]) =>
  nodes.filter((node): node is Node => Boolean(node));

export const openTab = (path: string) => () =>
  void chrome.tabs.create({ url: `${TRACKR_URL}${path}` });
