import { parseFragment, serialize } from "parse5";

/** @param {import("parse5").DefaultTreeAdapterTypes.Node} node @returns {string} */
function textOf(node) {
  if ("value" in node) return node.value;
  return "childNodes" in node ? node.childNodes.map(textOf).join("") : "";
}

/** @param {string} html @param {(title: string) => string} slugify */
export function articleSections(html, slugify) {
  const fragment = parseFragment(html);
  const sections = [];
  const used = new Set(fragment.childNodes.flatMap((node) =>
    "attrs" in node ? node.attrs.filter(({ name }) => name === "id").map(({ value }) => value) : []));
  for (const heading of fragment.childNodes) {
    if (!("tagName" in heading) || heading.tagName !== "h2") continue;
    const title = textOf(heading).replace(/\s+/g, " ").trim();
    if (!title) continue;
    let id = heading.attrs.find((attribute) => attribute.name === "id");
    if (!id) {
      const base = `section-${slugify(title) || "heading"}`;
      let value = base;
      for (let suffix = 2; used.has(value); suffix++) value = `${base}-${suffix}`;
      id = { name: "id", value };
      heading.attrs.push(id);
      used.add(value);
    }
    heading.attrs = heading.attrs.filter(({ name }) => name !== "tabindex");
    heading.attrs.push({ name: "tabindex", value: "-1" });
    sections.push({ href: `#${encodeURIComponent(id.value)}`, title });
  }
  return { html: sections.length ? serialize(fragment) : html, sections };
}
