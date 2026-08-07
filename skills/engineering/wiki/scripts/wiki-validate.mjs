import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

function invalid(message) { throw new Error(message); }
function object(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(`${name} must be an object`);
}
function string(value, name) {
  if (typeof value !== "string" || value.length === 0) invalid(`${name} must be a non-empty string`);
}
function meaningful(text) {
  return text.replace(/```[\s\S]*?```/gu, "").split(/\n\s*\n/gu).some((part) => part.replace(/^#+\s+|^[-*+]\s+/gmu, "").trim() !== "");
}
function locator(source, name) {
  object(source, name);
  if (!/^S[1-9][0-9]*$/u.test(source.id)) invalid(`${name}.id must use S1-style identity`);
  string(source.path, `${name}.path`);
  if (source.path.startsWith("/") || source.path.includes("\\") || source.path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    invalid(`${name}.path must be repository-relative`);
  }
  if (!["symbol", "test", "config-key", "json-pointer", "heading"].includes(source.kind)) invalid(`${name}.kind is unsupported`);
  string(source.value, `${name}.value`);
  if (source.line_hint !== undefined && (!Number.isInteger(source.line_hint) || source.line_hint < 1)) invalid(`${name}.line_hint must be positive`);
}

export function validateWikiPage(markdown) {
  string(markdown, "markdown");
  const text = markdown.replace(/\r\n?/gu, "\n");
  const visible = visibleMarkdown(text);
  const h1 = [...visible.matchAll(/^#[ \t]+(.+)$/gmu)];
  if (h1.length !== 1 || h1[0].index !== 0) invalid("page requires exactly one leading H1");
  const headings = [...visible.matchAll(/^##[ \t]+(.+?)[ \t]*#*[ \t]*$/gmu)].map((match) => ({ name: match[1].trim(), start: match.index, body: match.index + match[0].length }));
  const required = ["Purpose and scope", "Current behavior", "Rules and invariants", "Dependencies", "Sources"];
  const names = headings.map(({ name }) => name);
  for (const name of required) if (names.filter((item) => item === name).length !== 1) invalid(`page requires exactly one ${name} section`);
  const positions = required.map((name) => names.indexOf(name));
  if (positions.some((position, index) => index > 0 && position <= positions[index - 1])) invalid("required sections are out of order");
  const states = names.indexOf("States and exceptions");
  if (names.filter((name) => name === "States and exceptions").length > 1) invalid("States and exceptions is duplicated");
  if (states >= 0 && (states <= names.indexOf("Rules and invariants") || states >= names.indexOf("Dependencies"))) invalid("States and exceptions is out of order");
  if (names.at(-1) !== "Sources") invalid("Sources must be the final H2 section");
  const sections = new Map(headings.map((heading, index) => [heading.name, text.slice(heading.body, headings[index + 1]?.start ?? text.length).trim()]));
  const visibleSections = new Map(headings.map((heading, index) => [heading.name, visible.slice(heading.body, headings[index + 1]?.start ?? visible.length).trim()]));
  for (const name of required.slice(0, -1)) if (!meaningful(visibleSections.get(name))) invalid(`${name} must contain content`);
  if (states >= 0 && !meaningful(visibleSections.get("States and exceptions"))) invalid("States and exceptions must contain content");
  for (const name of ["Current behavior", "Rules and invariants", "States and exceptions", "Dependencies"]) {
    if (!sections.has(name)) continue;
    for (const claim of visibleSections.get(name).split(/\n\s*\n/gu)) {
      if (meaningful(claim) && !/\[S[1-9][0-9]*\]/u.test(claim)) invalid(`${name} contains an unmapped claim`);
    }
  }
  const match = sections.get("Sources").match(/^```json\n([\s\S]*?)\n```$/u);
  if (!match) invalid("Sources must contain one strict JSON fence");
  let sourceSet;
  try { sourceSet = JSON.parse(match[1]); } catch { invalid("Sources JSON is invalid"); }
  object(sourceSet, "Sources");
  if (sourceSet.schema !== "wiki-sources:v1" || !Array.isArray(sourceSet.sources) || sourceSet.sources.length === 0) invalid("Sources schema is invalid");
  const ids = new Set();
  sourceSet.sources.forEach((source, index) => {
    locator(source, `Sources.sources[${index}]`);
    if (ids.has(source.id)) invalid("Source IDs must be unique");
    ids.add(source.id);
  });
  const references = [...visible.slice(0, headings.at(-1).start).matchAll(/\[(S[1-9][0-9]*)\]/gu)].map((item) => item[1]);
  if (references.some((id) => !ids.has(id))) invalid("claim references an unknown Source");
  if ([...ids].some((id) => !references.includes(id))) invalid("Sources contains an unused entry");
  return { status: "valid", title: h1[0][1].trim(), sources: sourceSet.sources };
}

function inside(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

function uniqueLine(matches, source) {
  const lines = new Set(matches);
  if (lines.size !== 1) invalid(`${source.kind} locator must resolve exactly once: ${source.value}`);
}

function jsonPointer(document, pointer) {
  if (!pointer.startsWith("/")) invalid("json-pointer value must start with /");
  let current = document;
  for (const raw of pointer.slice(1).split("/")) {
    if (/~(?:[^01]|$)/u.test(raw)) invalid("json-pointer contains an invalid escape");
    const key = raw.replace(/~1/gu, "/").replace(/~0/gu, "~");
    if (current === null || typeof current !== "object" || !Object.hasOwn(current, key)) invalid(`json-pointer did not resolve: ${pointer}`);
    current = current[key];
  }
}

function maskCode(text, language) {
  let result = "";
  let state = null;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const pair = text.slice(index, index + 2);
    const triple = text.slice(index, index + 3);
    if (character === "\n") {
      result += "\n";
      if (state === "line" || state === "single" || state === "double") state = null;
      escaped = false;
      continue;
    }
    if (state === "line") { result += " "; continue; }
    if (state === "block") {
      if (pair === "*/") { result += "  "; index += 1; state = null; }
      else result += " ";
      continue;
    }
    if (state === "triple-single" || state === "triple-double") {
      const end = state === "triple-single" ? "'''" : '\"\"\"';
      if (triple === end) { result += "   "; index += 2; state = null; }
      else result += " ";
      continue;
    }
    if (["single", "double", "template"].includes(state)) {
      const end = state === "single" ? "'" : state === "double" ? '\"' : "`";
      if (!escaped && character === end) state = null;
      escaped = !escaped && character === "\\";
      if (character !== "\\") escaped = false;
      result += " ";
      continue;
    }
    if (language === "js" && pair === "//") { result += "  "; index += 1; state = "line"; continue; }
    if (language === "js" && pair === "/*") { result += "  "; index += 1; state = "block"; continue; }
    if (language === "py" && character === "#") { result += " "; state = "line"; continue; }
    if (language === "py" && (triple === "'''" || triple === '\"\"\"')) {
      result += "   "; index += 2; state = triple === "'''" ? "triple-single" : "triple-double"; continue;
    }
    if (character === "'" || character === '\"' || (language === "js" && character === "`")) {
      result += " "; state = character === "'" ? "single" : character === '\"' ? "double" : "template"; continue;
    }
    result += character;
  }
  return result;
}

function visibleMarkdown(markdown) {
  const lines = [];
  let fence = null;
  for (const line of markdown.split("\n")) {
    if (fence === null) {
      const marker = line.match(/^\s*(`{3,}|~{3,})/u)?.[1];
      if (marker) { fence = { character: marker[0], length: marker.length }; lines.push(" ".repeat(line.length)); continue; }
      lines.push(line);
      continue;
    }
    const closing = line.match(/^\s*(`{3,}|~{3,})\s*$/u)?.[1];
    if (closing?.[0] === fence.character && closing.length >= fence.length) fence = null;
    lines.push(" ".repeat(line.length));
  }
  return lines.join("\n");
}

function headingMatches(text, source) {
  const matches = [];
  const wanted = source.value.trim().replace(/\s+/gu, " ");
  for (const [index, line] of visibleMarkdown(text).split("\n").entries()) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/u)?.[1];
    if (heading?.trim().replace(/\s+/gu, " ") === wanted) matches.push(index);
  }
  uniqueLine(matches, source);
}

function advanceTripleQuote(line, state) {
  let current = state;
  let cursor = 0;
  while (cursor < line.length) {
    if (current !== null) {
      const end = line.indexOf(current, cursor);
      if (end < 0) break;
      cursor = end + 3;
      current = null;
      continue;
    }
    const positions = [line.indexOf("'''", cursor), line.indexOf('\"\"\"', cursor)].filter((position) => position >= 0);
    if (positions.length === 0) break;
    const start = Math.min(...positions);
    current = line.slice(start, start + 3);
    cursor = start + 3;
  }
  return current;
}

function resolveConfigKey(text, extension, source) {
  const matches = [];
  const lines = text.split("\n");
  if ([".yaml", ".yml"].includes(extension)) {
    if (/(^|\s)(<<:|[&*][A-Za-z0-9_-]+)/mu.test(text)) invalid("dynamic YAML keys are not supported");
    const stack = [];
    let blockIndent = null;
    for (const [index, line] of lines.entries()) {
      if (/^\s*(?:#|$)/u.test(line)) continue;
      if (line.includes("\t")) invalid("tab-indented YAML is not supported");
      const lineIndent = line.match(/^ */u)[0].length;
      if (blockIndent !== null) {
        if (lineIndent > blockIndent) continue;
        blockIndent = null;
      }
      const match = line.match(/^(\s*)([A-Za-z0-9_-]+)\s*:(?:\s*(.*))?$/u);
      if (!match) continue;
      const indent = match[1].length;
      while (stack.length > 0 && stack.at(-1).indent >= indent) stack.pop();
      if ([...stack.map(({ key }) => key), match[2]].join(".") === source.value) matches.push(index);
      const remainder = match[3] ?? "";
      if (/^[>|][-+0-9]*(?:\s+#.*)?$/u.test(remainder)) blockIndent = indent;
      else if (remainder.length === 0 || remainder.startsWith("#")) stack.push({ indent, key: match[2] });
    }
    uniqueLine(matches, source);
    return;
  }
  if (extension === ".toml") {
    let section = [];
    let tripleQuote = null;
    for (const [index, line] of lines.entries()) {
      const insideString = tripleQuote !== null;
      tripleQuote = advanceTripleQuote(line, tripleQuote);
      if (insideString) continue;
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;
      const table = trimmed.match(/^\[([A-Za-z0-9_.-]+)\]$/u)?.[1];
      if (table) { section = table.split("."); continue; }
      const key = trimmed.match(/^([A-Za-z0-9_-]+)\s*=/u)?.[1];
      if (key && [...section, key].join(".") === source.value) matches.push(index);
    }
    uniqueLine(matches, source);
    return;
  }
  if (extension === ".env") {
    if (source.value.includes(".")) invalid("nested .env keys are not supported");
    for (const [index, line] of lines.entries()) {
      if (line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/u)?.[1] === source.value) matches.push(index);
    }
    uniqueLine(matches, source);
    return;
  }
  invalid(`config-key locator does not support ${extension || "this file"}`);
}

function indentation(line) {
  return line.match(/^[ \t]*/u)[0].replace(/\t/gu, "        ").length;
}

function pythonDeclarationMatches(text, source) {
  const matches = [];
  const classes = [];
  for (const [index, line] of maskCode(text, "py").split("\n").entries()) {
    if (/^\s*$/u.test(line)) continue;
    const indent = indentation(line);
    while (classes.length > 0 && classes.at(-1).indent >= indent) classes.pop();
    const className = line.match(/^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\b/u)?.[1];
    if (className) {
      if (source.kind === "symbol" && source.value === [...classes.map(({ name }) => name), className].join(".")) matches.push(index);
      classes.push({ indent, name: className });
      continue;
    }
    const functionName = line.match(/^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/u)?.[1];
    if (!functionName) continue;
    const qualified = [...classes.map(({ name }) => name), functionName].join(".");
    if (source.kind === "symbol" && source.value === qualified) matches.push(index);
    if (source.kind === "test" && functionName.startsWith("test_") && source.value === qualified) matches.push(index);
  }
  return matches;
}

function braceDelta(line) {
  return [...line].reduce((count, character) => count + (character === "{" ? 1 : character === "}" ? -1 : 0), 0);
}

function javascriptDeclarationMatches(text, source) {
  const matches = [];
  let braceDepth = 0;
  let currentClass = null;
  let classBodyDepth = null;
  for (const [index, line] of maskCode(text, "js").split("\n").entries()) {
    const declarations = [
      /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/u,
      /^\s*(?:export\s+)?(?:default\s+)?(?:class|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/u,
      /^\s*(?:export\s+)?(?:declare\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/u,
    ];
    for (const pattern of declarations) if (pattern.exec(line)?.[1] === source.value) matches.push(index);
    if (currentClass !== null && braceDepth === classBodyDepth) {
      const method = line.match(/^\s*(?:(?:public|private|protected|static|async|readonly|abstract)\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/u)?.[1];
      if (`${currentClass}.${method}` === source.value) matches.push(index);
    }
    const className = line.match(/^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/u)?.[1];
    if (className && line.includes("{")) {
      currentClass = className;
      classBodyDepth = braceDepth + 1;
    }
    braceDepth += braceDelta(line);
    if (currentClass !== null && braceDepth < classBodyDepth) {
      currentClass = null;
      classBodyDepth = null;
    }
  }
  return matches;
}

function resolveLocator(text, extension, source) {
  if (source.kind === "heading") {
    if (![".md", ".mdx"].includes(extension)) invalid("heading locator requires Markdown");
    headingMatches(text, source);
    return;
  }
  if (source.kind === "json-pointer") {
    if (extension !== ".json") invalid("json-pointer locator requires JSON");
    let document;
    try { document = JSON.parse(text); } catch { invalid("source JSON is invalid"); }
    jsonPointer(document, source.value);
    return;
  }
  if (source.kind === "config-key") {
    if (extension === ".json") {
      let document;
      try { document = JSON.parse(text); } catch { invalid("source JSON is invalid"); }
      if (source.value.startsWith("/")) jsonPointer(document, source.value);
      else {
        let current = document;
        for (const key of source.value.split(".")) {
          if (current === null || typeof current !== "object" || !Object.hasOwn(current, key)) invalid(`config-key did not resolve: ${source.value}`);
          current = current[key];
        }
      }
      return;
    }
    resolveConfigKey(text, extension, source);
    return;
  }
  if (source.kind === "test") {
    if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(extension)) {
      const originalLines = text.split("\n");
      const matches = maskCode(text, "js").split("\n").flatMap((line, index) => {
        if (!/^\s*(?:test|it)(?:\.(?:only|skip|todo|concurrent))?\s*\(/u.test(line)) return [];
        const title = originalLines[index].match(/^\s*(?:test|it)(?:\.(?:only|skip|todo|concurrent))?\s*\(\s*(["'`])(.+?)\1/u)?.[2];
        return title === source.value ? [index] : [];
      });
      uniqueLine(matches, source);
      return;
    }
    if (extension === ".py") {
      uniqueLine(pythonDeclarationMatches(text, source), source);
      return;
    }
    invalid(`test locator does not support ${extension || "this file"}`);
  }
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/u.test(source.value)) invalid(`${source.kind} locator requires one declaration path`);
  let matches;
  if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(extension)) {
    matches = javascriptDeclarationMatches(text, source);
  } else if (extension === ".py") {
    matches = pythonDeclarationMatches(text, source);
  } else invalid(`${source.kind} locator does not support ${extension || "this file"}`);
  uniqueLine(matches, source);
}

export function validateWikiSources(repositoryRoot, markdown) {
  const root = realpathSync(repositoryRoot);
  const page = validateWikiPage(markdown);
  for (const source of page.sources) {
    const candidate = resolve(root, source.path);
    if (!inside(root, candidate) || !existsSync(candidate)) invalid(`Source path is not a repository file: ${source.path}`);
    const actual = realpathSync(candidate);
    if (!inside(root, actual) || !lstatSync(actual).isFile()) invalid(`Source path escapes the repository: ${source.path}`);
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(actual)); } catch { invalid(`Source is not readable UTF-8: ${source.path}`); }
    resolveLocator(text, basename(actual) === ".env" ? ".env" : extname(actual).toLowerCase(), source);
  }
  return { status: "valid", sources_checked: page.sources.length };
}

function markdownFiles(root, result = []) {
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const path = resolve(root, entry.name);
    if (entry.isSymbolicLink()) invalid("Wiki validation does not follow symbolic links");
    if (entry.isDirectory()) markdownFiles(path, result);
    else if ([".md", ".mdx"].includes(extname(entry.name).toLowerCase())) result.push(path);
  }
  return result;
}
function slug(value) {
  return value.trim().toLowerCase().replace(/[^\p{Letter}\p{Number}\p{Mark} _-]/gu, "").replace(/\s+/gu, "-");
}
function anchors(markdown) {
  const counts = new Map();
  const result = new Set();
  for (const match of visibleMarkdown(markdown).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gmu)) {
    const base = slug(match[1]);
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    result.add(count === 0 ? base : `${base}-${count}`);
  }
  return result;
}
function referenceLabel(value) {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}
function links(markdown) {
  const visible = visibleMarkdown(markdown);
  const targets = [];
  const definitions = new Map();
  for (const match of visible.matchAll(/!?\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^)\s]+))(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\)/gu)) {
    targets.push(match[1] ?? match[2]);
  }
  for (const match of visible.matchAll(/^\s*\[([^\]\n]+)\]:\s*(?:<([^>\n]+)>|([^\s]+))/gmu)) {
    const target = match[2] ?? match[3];
    definitions.set(referenceLabel(match[1]), target);
    targets.push(target);
  }
  for (const match of visible.matchAll(/!?\[([^\]\n]+)\]\[([^\]\n]*)\]/gu)) {
    if (!match[0].startsWith("!") && /^S[1-9][0-9]*$/u.test(match[1]) && /^S[1-9][0-9]*$/u.test(match[2])) continue;
    const label = referenceLabel(match[2] || match[1]);
    if (!definitions.has(label)) invalid(`unresolved Wiki reference: ${match[2] || match[1]}`);
  }
  for (const match of visible.matchAll(/!?\[\[([^\]\n]+)\]\]/gu)) {
    targets.push(match[1].split("|", 1)[0].trim());
  }
  return targets;
}

export function validateWikiLinks(repositoryRoot, wikiRoot) {
  const repository = realpathSync(repositoryRoot);
  const root = realpathSync(resolve(repository, wikiRoot));
  if (!inside(repository, root) || !lstatSync(root).isDirectory()) invalid("Wiki root is outside the repository");
  const files = markdownFiles(root);
  let checked = 0;
  for (const file of files) {
    const markdown = readFileSync(file, "utf8");
    for (const target of links(markdown)) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(target)) continue;
      const hash = target.indexOf("#");
      const rawPath = (hash < 0 ? target : target.slice(0, hash)).split("?", 1)[0];
      const rawAnchor = hash < 0 ? "" : target.slice(hash + 1);
      let decodedPath;
      let decodedAnchor;
      try {
        decodedPath = decodeURIComponent(rawPath);
        decodedAnchor = decodeURIComponent(rawAnchor);
      } catch { invalid(`link has invalid encoding: ${target}`); }
      const candidate = decodedPath === "" ? file : resolve(dirname(file), decodedPath);
      if (!inside(root, candidate)) invalid(`unresolved Wiki link: ${target}`);
      const alternatives = decodedPath !== "" && extname(candidate) === "" ? [candidate, `${candidate}.md`, `${candidate}.mdx`] : [candidate];
      const found = new Set();
      for (const path of alternatives) {
        if (!existsSync(path)) continue;
        const actual = realpathSync(path);
        if (inside(root, actual) && lstatSync(actual).isFile()) found.add(actual);
      }
      if (found.size === 0) invalid(`unresolved Wiki link: ${target}`);
      if (found.size > 1) invalid(`ambiguous Wiki link: ${target}`);
      const resolved = [...found][0];
      if (decodedAnchor && !anchors(readFileSync(resolved, "utf8")).has(slug(decodedAnchor))) invalid(`unresolved Wiki anchor: ${target}`);
      checked += 1;
    }
  }
  return { status: "valid", files: files.map((file) => relative(repository, file).replaceAll("\\", "/")), links_checked: checked };
}

export function runCliCommand(command, input = {}) {
  object(input, "CLI input");
  if (command === "page-validate") return validateWikiPage(input.markdown);
  if (command === "sources-validate") return validateWikiSources(input.repository_root, input.markdown);
  if (command === "links-validate") return validateWikiLinks(input.repository_root, input.wiki_root);
  invalid(`unsupported Wiki command: ${command}`);
}

function readInput(path) {
  const bytes = readFileSync(path);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) invalid("input JSON must be UTF-8 without BOM");
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = runCliCommand(process.argv[2], readInput(process.argv[3]));
    if (!process.argv[4]) invalid("output JSON path is required");
    writeFileSync(process.argv[4], `${JSON.stringify(result)}\n`, "utf8");
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: "invalid", error: error.message })}\n`);
    process.exitCode = 2;
  }
}
