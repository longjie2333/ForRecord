import { EditorState, Plugin, PluginKey, Selection, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet, EditorView } from "prosemirror-view";
import { Compartment, EditorState as EditorState$1 } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, LanguageDescription, bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { markdown } from "@codemirror/lang-markdown";
import { tags } from "@lezer/highlight";
import { EditorView as EditorView$1, keymap } from "@codemirror/view";
import { keymap as keymap$1 } from "prosemirror-keymap";
import { baseKeymap, chainCommands, setBlockType, wrapIn } from "prosemirror-commands";
import { history as history$1, redo, undo } from "prosemirror-history";
import { InputRule, inputRules, wrappingInputRule } from "prosemirror-inputrules";
import emojiData from "markdown-it-emoji/lib/data/full.mjs";
import DOMPurify from "dompurify";
import { liftListItem, sinkListItem, splitListItem, wrapInList } from "prosemirror-schema-list";
import katex from "katex";
import { Mark, Schema } from "prosemirror-model";
import MarkdownIt from "markdown-it";
//#region src/code-highlighter.ts
var lezerDescription = LanguageDescription.of({
	name: "Lezer",
	alias: ["lezer"],
	extensions: ["grammar"],
	load: async () => (await import("@codemirror/lang-lezer")).lezer()
});
var codeMirrorLanguages = languages.some((language) => language.name === "Lezer") ? languages : [...languages, lezerDescription];
var typoraWebHighlightStyle = HighlightStyle.define([
	{
		tag: tags.comment,
		class: "hljs-comment"
	},
	{
		tag: [
			tags.keyword,
			tags.operatorKeyword,
			tags.modifier
		],
		class: "hljs-keyword"
	},
	{
		tag: [
			tags.string,
			tags.character,
			tags.attributeValue
		],
		class: "hljs-string"
	},
	{
		tag: [
			tags.number,
			tags.bool,
			tags.null,
			tags.atom
		],
		class: "hljs-number"
	},
	{
		tag: [
			tags.typeName,
			tags.className,
			tags.namespace
		],
		class: "hljs-type"
	},
	{
		tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
		class: "hljs-title function_"
	},
	{
		tag: tags.variableName,
		class: "hljs-variable"
	},
	{
		tag: tags.propertyName,
		class: "hljs-property"
	},
	{
		tag: tags.attributeName,
		class: "hljs-attr"
	},
	{
		tag: tags.operator,
		class: "hljs-operator"
	},
	{
		tag: [tags.punctuation, tags.bracket, tags.separator],
		class: "hljs-punctuation"
	},
	{
		tag: [tags.meta, tags.annotation],
		class: "hljs-meta"
	},
	{
		tag: tags.invalid,
		class: "hljs-invalid"
	}
]);
var CODE_LANGUAGE_OPTIONS = codeMirrorLanguages.map((language) => ({
	name: language.name,
	aliases: language.alias,
	extensions: language.extensions
})).sort((a, b) => a.name.localeCompare(b.name, "en"));
function normalizeLanguageInfo(info) {
	return (info.trim().split(/\s+/, 1)[0] ?? "").replace(/^\{?\.?/, "").replace(/\}?$/, "").trim().toLowerCase();
}
function resolveCodeLanguage(info) {
	const normalized = normalizeLanguageInfo(info);
	if (!normalized) return null;
	return LanguageDescription.matchLanguageName(codeMirrorLanguages, normalized, true) ?? LanguageDescription.matchFilename(codeMirrorLanguages, `index.${normalized}`);
}
async function loadCodeLanguage(info) {
	const description = resolveCodeLanguage(info);
	if (!description) return null;
	try {
		return await description.load();
	} catch {
		return null;
	}
}
function commonExtensions(languageCompartment, onChange) {
	return [
		history(),
		keymap.of([
			indentWithTab,
			...historyKeymap,
			...defaultKeymap
		]),
		EditorState$1.tabSize.of(2),
		indentOnInput(),
		bracketMatching(),
		syntaxHighlighting(typoraWebHighlightStyle, { fallback: true }),
		EditorView$1.lineWrapping,
		languageCompartment.of([]),
		EditorView$1.updateListener.of((update) => {
			if (update.docChanged) onChange?.(update.state.doc.toString(), update);
		}),
		EditorView$1.theme({
			"&": {
				"--tw-code-comment": "#77736c",
				"--tw-code-keyword": "#7b4f9d",
				"--tw-code-string": "#8a5a28",
				"--tw-code-literal": "#6c6f1f",
				"--tw-code-type": "#0f766e",
				"--tw-code-function": "#2468a2",
				"--tw-code-name": "inherit",
				"--tw-code-punctuation": "#6f6a64",
				"--tw-code-meta": "#77736c",
				"--tw-code-invalid": "#b42318",
				backgroundColor: "transparent",
				color: "inherit",
				font: "inherit"
			},
			":root[data-appearance=\"dark\"] &": {
				"--tw-code-comment": "#9a9690",
				"--tw-code-keyword": "#c9a7e8",
				"--tw-code-string": "#e5aa7a",
				"--tw-code-literal": "#c9c277",
				"--tw-code-type": "#8bc8bd",
				"--tw-code-function": "#9fbee8",
				"--tw-code-name": "inherit",
				"--tw-code-punctuation": "#c3bdb4",
				"--tw-code-meta": "#a8a29a",
				"--tw-code-invalid": "#ff8f86"
			},
			".cm-scroller": {
				fontFamily: "inherit",
				lineHeight: "inherit",
				overflow: "visible",
				overflowX: "hidden"
			},
			".cm-content": {
				padding: "0",
				caretColor: "currentColor",
				overflowWrap: "anywhere",
				wordBreak: "break-word"
			},
			".cm-line": {
				padding: "0",
				overflowWrap: "anywhere",
				wordBreak: "break-word"
			},
			".cm-gutters": { display: "none" },
			".cm-activeLine": { backgroundColor: "transparent" },
			".cm-focused": { outline: "none" },
			"&.cm-focused": { outline: "none" }
		})
	];
}
function createEmbeddedCodeMirrorEditor(options) {
	const languageCompartment = new Compartment();
	const editableCompartment = new Compartment();
	const extensions = commonExtensions(languageCompartment, options.onChange);
	if (options.markdownSource) extensions.push(markdown({ codeLanguages: codeMirrorLanguages }));
	extensions.push(editableCompartment.of([
		EditorView$1.editable.of(options.editable ?? true),
		EditorState$1.readOnly.of(!(options.editable ?? true))
	]));
	const view = new EditorView$1({
		parent: options.parent,
		state: EditorState$1.create({
			doc: options.doc,
			extensions
		})
	});
	view.dom.classList.add(options.className);
	view.dom.__typoraWebCodeMirrorView = view;
	let languageRequest = 0;
	const setLanguage = (language) => {
		if (options.markdownSource) return;
		const request = ++languageRequest;
		loadCodeLanguage(language).then((support) => {
			if (request !== languageRequest) return;
			view.dispatch({ effects: languageCompartment.reconfigure(support ? support.extension : []) });
		});
	};
	if (options.language) setLanguage(options.language);
	return {
		view,
		setDoc(doc) {
			const current = view.state.doc.toString();
			if (current === doc) return;
			view.dispatch({ changes: {
				from: 0,
				to: current.length,
				insert: doc
			} });
		},
		setLanguage,
		setEditable(editable) {
			view.dispatch({
				effects: editableCompartment.reconfigure([
					EditorView$1.editable.of(editable),
					EditorState$1.readOnly.of(!editable)
				])
			});
		},
		destroy() {
			view.destroy();
		}
	};
}
//#endregion
//#region src/cursor-render.ts
function cursorRenderPlugin() {
	return new Plugin({ props: { decorations(state) {
		const sel = state.selection;
		if (!sel.empty) {
			const open = makeWidget("selection-marker", "[");
			const close = makeWidget("selection-marker", "]");
			return DecorationSet.create(state.doc, [Decoration.widget(sel.from, open, { side: -1 }), Decoration.widget(sel.to, close, { side: 1 })]);
		}
		const el = makeWidget("play-caret", "");
		return DecorationSet.create(state.doc, [Decoration.widget(sel.from, el, { side: 0 })]);
	} } });
}
function makeWidget(cls, content) {
	return () => {
		const el = document.createElement("span");
		el.className = cls;
		if (content) el.textContent = content;
		return el;
	};
}
//#endregion
//#region src/features/auto-pair.ts
var PAIRS = {
	"[": "]",
	"(": ")"
};
var CLOSERS = /* @__PURE__ */ new Set(["]", ")"]);
function shouldAutoPair(after) {
	return after.length === 0 || /^\s/.test(after);
}
function autoPairInputPlugin() {
	return new Plugin({ props: { handleTextInput(view, from, to, text) {
		if (from !== to) return false;
		const $from = view.state.doc.resolve(from);
		if (!$from.parent.isTextblock) return false;
		const offset = $from.parentOffset;
		const size = $from.parent.content.size;
		const nextChar = offset < size ? $from.parent.textBetween(offset, offset + 1) : "";
		if (CLOSERS.has(text) && nextChar === text) {
			const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, from + 1));
			view.dispatch(tr);
			return true;
		}
		const close = PAIRS[text];
		if (!close) return false;
		if (!shouldAutoPair($from.parent.textBetween(offset, size))) return false;
		const tr = view.state.tr.insertText(text + close, from, to);
		tr.setSelection(TextSelection.create(tr.doc, from + 1));
		view.dispatch(tr);
		return true;
	} } });
}
var backspaceClearPair = (state, dispatch) => {
	const sel = state.selection;
	if (!sel.empty) return false;
	const $from = state.doc.resolve(sel.from);
	if (!$from.parent.isTextblock) return false;
	const offset = $from.parentOffset;
	const size = $from.parent.content.size;
	if (offset === 0 || offset === size) return false;
	const before = $from.parent.textBetween(offset - 1, offset);
	const after = $from.parent.textBetween(offset, offset + 1);
	if (!(before === "[" && after === "]" || before === "(" && after === ")")) return false;
	if (dispatch) dispatch(state.tr.delete(sel.from - 1, sel.from + 1));
	return true;
};
var autoPair = {
	name: "auto_pair",
	plugins: () => [autoPairInputPlugin()],
	keymap: (_schema) => ({ Backspace: backspaceClearPair })
};
//#endregion
//#region src/inline-parse.ts
function scanRuns(text, delim, consumed) {
	const runs = [];
	for (let i = 0; i < text.length;) {
		if (text[i] !== delim || consumed[i]) {
			i++;
			continue;
		}
		let j = i;
		while (j < text.length && text[j] === delim && !consumed[j]) j++;
		const before = i > 0 ? text[i - 1] : " ";
		const after = j < text.length ? text[j] : " ";
		runs.push({
			pos: i,
			len: j - i,
			canOpen: !/\s/.test(after),
			canClose: !/\s/.test(before)
		});
		i = j;
	}
	return runs;
}
function markConsumed(consumed, from, to) {
	for (let i = from; i < to; i++) consumed[i] = 1;
}
function scanFixedDelim(text, delimCh, delimLen, type, consumed) {
	const out = [];
	const runs = scanRuns(text, delimCh, consumed).filter((r) => r.len >= delimLen);
	const used = /* @__PURE__ */ new Set();
	for (let a = 0; a < runs.length; a++) {
		if (used.has(a)) continue;
		const open = runs[a];
		if (!open.canOpen) continue;
		let b = -1;
		for (let k = runs.length - 1; k > a; k--) {
			if (used.has(k)) continue;
			if (runs[k].canClose) {
				b = k;
				break;
			}
		}
		if (b === -1) continue;
		const close = runs[b];
		const openFrom = open.pos;
		const openTo = openFrom + delimLen;
		const closeTo = close.pos + close.len;
		const closeFrom = closeTo - delimLen;
		const innerFrom = openTo;
		const innerTo = closeFrom;
		if (innerFrom >= innerTo) continue;
		if (/\s/.test(text[innerFrom]) || /\s/.test(text[innerTo - 1])) continue;
		let hasDelimInside = false;
		for (let k = innerFrom; k < innerTo; k++) if (text[k] === delimCh) {
			hasDelimInside = true;
			break;
		}
		if (hasDelimInside) continue;
		markConsumed(consumed, openFrom, closeTo);
		used.add(a);
		used.add(b);
		out.push({
			type,
			from: innerFrom,
			to: innerTo,
			openFrom,
			openTo,
			closeFrom,
			closeTo
		});
	}
	return out;
}
function markExtRanges(parent, markName, openLen, closeLen = openLen) {
	const ranges = [];
	const markType = parent.type.schema.marks[markName];
	if (!markType) return ranges;
	let start = -1;
	let off = 0;
	parent.forEach((child) => {
		if (!child.isText) return;
		const has = child.marks.some((m) => m.type === markType);
		if (has && start < 0) start = off;
		if (!has && start >= 0) {
			ranges.push([start - openLen, off + closeLen]);
			start = -1;
		}
		off += child.text?.length ?? 0;
	});
	if (start >= 0) ranges.push([start - openLen, off + closeLen]);
	return ranges;
}
function parseInline(text, parentBlock = null, context) {
	const out = [];
	const consumed = new Uint8Array(text.length);
	for (const f of collectInlineFeatures()) for (const s of f.scan(text, consumed, parentBlock, context)) out.push(s);
	return out;
}
//#endregion
//#region src/features/autolink.ts
var AUTOLINK_RE = new RegExp(`<((?:[a-zA-Z][a-zA-Z0-9+.-]*:[^\\s<>]+)|(?:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}))>`, "g");
var BARE_URL_RE = /\bhttps?:\/\/[^\s<>\]\u3000-\u303F\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]+/g;
function rangeConsumed(consumed, from, to) {
	for (let i = from; i < to; i++) if (consumed[i]) return true;
	return false;
}
function trimBareUrl(raw) {
	let end = raw.length;
	while (end > 0 && /[.,!?;:]/.test(raw[end - 1])) end--;
	while (end > 0 && raw[end - 1] === ")") {
		const candidate = raw.slice(0, end);
		const opens = (candidate.match(/\(/g) ?? []).length;
		if ((candidate.match(/\)/g) ?? []).length <= opens) break;
		end--;
	}
	return raw.slice(0, end);
}
var scan$6 = (text, consumed, parentBlock) => {
	const out = [];
	AUTOLINK_RE.lastIndex = 0;
	let m;
	while (m = AUTOLINK_RE.exec(text)) {
		const fullStart = m.index;
		const fullEnd = fullStart + m[0].length;
		if (rangeConsumed(consumed, fullStart, fullEnd)) continue;
		const inner = m[1];
		const href = !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(inner) ? `mailto:${inner}` : inner;
		markConsumed(consumed, fullStart, fullEnd);
		out.push({
			type: "autolink",
			from: fullStart + 1,
			to: fullEnd - 1,
			openFrom: fullStart,
			openTo: fullStart + 1,
			closeFrom: fullEnd - 1,
			closeTo: fullEnd,
			attrs: { href }
		});
	}
	if (parentBlock?.type.name !== "link_def") {
		BARE_URL_RE.lastIndex = 0;
		while (m = BARE_URL_RE.exec(text)) {
			const matchStart = m.index;
			if (text[matchStart - 1] === "<") continue;
			if (text.slice(0, matchStart).endsWith("](")) continue;
			if (/^\[[^\]]+\]:\s*$/.test(text.slice(0, matchStart))) continue;
			const url = trimBareUrl(m[0]);
			if (!url) continue;
			const matchEnd = matchStart + url.length;
			if (rangeConsumed(consumed, matchStart, matchEnd)) continue;
			markConsumed(consumed, matchStart, matchEnd);
			out.push({
				type: "autolink",
				from: matchStart,
				to: matchEnd,
				openFrom: matchStart,
				openTo: matchStart,
				closeFrom: matchEnd,
				closeTo: matchEnd,
				attrs: { href: url },
				delimRanges: []
			});
		}
	}
	return out;
};
var autolink = {
	name: "autolink",
	marks: { autolink: {
		attrs: { href: {} },
		inclusive: false,
		parseDOM: [{
			tag: "a[data-autolink]",
			getAttrs: (el) => ({ href: el.getAttribute("href") ?? "" })
		}],
		toDOM: (mark) => [
			"a",
			{
				href: mark.attrs.href,
				"data-autolink": ""
			},
			0
		]
	} },
	mdItPlugins: [(md) => md.disable("autolink")],
	markDelims: { autolink: {
		open: "",
		close: ""
	} },
	inline: {
		priority: 2.5,
		scan: scan$6,
		markNames: ["autolink"],
		extRanges: (parent) => {
			const ranges = [];
			const autolinkType = parent.type.schema.marks.autolink;
			if (!autolinkType) return ranges;
			const source = parent.textContent;
			let start = -1;
			let off = 0;
			const flush = (end) => {
				if (start < 0) return;
				if (source[start - 1] === "<" && source[end] === ">") ranges.push([start - 1, end + 1]);
				else ranges.push([start, end]);
				start = -1;
			};
			parent.forEach((child) => {
				if (child.isText) {
					if (child.marks.some((mk) => mk.type === autolinkType)) {
						if (start < 0) start = off;
					} else flush(off);
				}
				off += child.nodeSize;
			});
			flush(off);
			return ranges;
		}
	}
};
//#endregion
//#region src/callouts.ts
var CALLOUT_MARKER_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|DANGER)\][ \t]*(?:\n|$)/i;
var CALLOUT_MARKER_LINE_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|DANGER)\][ \t]*$/i;
function normalizeCalloutKind(value) {
	switch ((value ?? "").toLowerCase()) {
		case "note": return "note";
		case "tip": return "tip";
		case "important": return "important";
		case "warning": return "warning";
		case "danger": return "danger";
		default: return null;
	}
}
function calloutAttrsFromSource(value) {
	const source = (value ?? "").trim();
	const kind = normalizeCalloutKind(source);
	if (!kind) return null;
	return {
		alert: kind,
		alertSource: source.toUpperCase()
	};
}
function getCalloutAttrsFromElement(el) {
	const dataSource = el.getAttribute("data-alert-source");
	const dataKind = el.getAttribute("data-alert");
	const fromData = calloutAttrsFromSource(dataSource ?? dataKind);
	if (fromData) return fromData;
	for (const cls of Array.from(el.classList)) {
		const match = /^(?:md-alert|md-alert-text|markdown-alert)-(note|tip|important|warning|danger)$/i.exec(cls);
		if (!match) continue;
		return calloutAttrsFromSource(match[1]);
	}
	return null;
}
function stripCalloutMarker(paragraph) {
	const first = paragraph.firstChild;
	if (!first?.isText) return null;
	const text = first.text ?? "";
	const match = CALLOUT_MARKER_RE.exec(text);
	if (!match) return null;
	const attrs = calloutAttrsFromSource(match[1]);
	if (!attrs) return null;
	const inline = [];
	const remaining = text.slice(match[0].length);
	if (remaining) inline.push(paragraph.type.schema.text(remaining, first.marks));
	let dropLeadingBreak = remaining.length === 0;
	paragraph.forEach((child, _offset, index) => {
		if (index === 0) return;
		if (dropLeadingBreak) {
			dropLeadingBreak = false;
			if (child.type.name === "hard_break") return;
			if (child.isText && child.text?.startsWith("\n")) {
				const rest = child.text.slice(1);
				if (rest) inline.push(paragraph.type.schema.text(rest, child.marks));
				return;
			}
		}
		inline.push(child);
	});
	return {
		attrs,
		paragraph: inline.length > 0 ? paragraph.type.createAndFill(paragraph.attrs, inline) : null
	};
}
function foldBlockquote(node) {
	if (node.attrs.alert) return node;
	const first = node.firstChild;
	if (!first || first.type.name !== "paragraph") return node;
	const stripped = stripCalloutMarker(first);
	if (!stripped) return node;
	const children = [];
	if (stripped.paragraph) children.push(stripped.paragraph);
	node.forEach((child, _offset, index) => {
		if (index > 0) children.push(child);
	});
	if (children.length === 0) children.push(node.type.schema.nodes.paragraph.create());
	return node.type.createAndFill({
		...node.attrs,
		...stripped.attrs
	}, children);
}
function transformBlock$1(node) {
	if (node.isInline || node.childCount === 0) return node;
	const children = [];
	let changed = false;
	node.forEach((child) => {
		const next = transformBlock$1(child);
		if (next !== child) changed = true;
		children.push(next);
	});
	let current = node;
	if (changed) current = node.type.createAndFill(node.attrs, children, node.marks);
	return current.type.name === "blockquote" ? foldBlockquote(current) : current;
}
function foldMarkdownCallouts(doc) {
	return transformBlock$1(doc);
}
var convertCurrentBlockquoteCallout = (state, dispatch) => {
	const sel = state.selection;
	if (!sel.empty) return false;
	const $from = sel.$from;
	if ($from.parent.type.name !== "paragraph") return false;
	const blockquoteDepth = $from.depth - 1;
	if (blockquoteDepth < 1) return false;
	const blockquote = $from.node(blockquoteDepth);
	if (blockquote.type.name !== "blockquote" || blockquote.attrs.alert) return false;
	if ($from.index(blockquoteDepth) !== 0) return false;
	const text = $from.parent.textContent;
	const match = CALLOUT_MARKER_LINE_RE.exec(text);
	if (!match) return false;
	const attrs = calloutAttrsFromSource(match[1]);
	if (!attrs) return false;
	if (dispatch) {
		const paragraphStart = $from.start();
		const paragraphEnd = $from.end();
		const blockquotePos = $from.before(blockquoteDepth);
		const tr = state.tr.setNodeMarkup(blockquotePos, void 0, {
			...blockquote.attrs,
			...attrs
		});
		tr.delete(paragraphStart, paragraphEnd);
		tr.setSelection(TextSelection.create(tr.doc, paragraphStart));
		dispatch(tr);
	}
	return true;
};
//#endregion
//#region src/features/blockquote.ts
var calloutInputRule = new InputRule(/^\[!(NOTE|TIP|IMPORTANT|WARNING|DANGER)\]$/i, (state, match, start, end) => {
	const attrs = calloutAttrsFromSource(match[1]);
	if (!attrs) return null;
	const $start = state.doc.resolve(start);
	if ($start.parent.type.name !== "paragraph") return null;
	const blockquoteDepth = $start.depth - 1;
	if (blockquoteDepth < 1) return null;
	const blockquote = $start.node(blockquoteDepth);
	if (blockquote.type.name !== "blockquote") return null;
	if ($start.index(blockquoteDepth) !== 0) return null;
	const tr = state.tr.setNodeMarkup($start.before(blockquoteDepth), void 0, {
		...blockquote.attrs,
		...attrs
	});
	const nextChar = $start.parent.textBetween($start.parentOffset + match[0].length - 1, $start.parentOffset + match[0].length);
	tr.delete(start, nextChar === "]" ? end + 1 : end);
	return tr.setSelection(TextSelection.create(tr.doc, start));
});
var calloutEnter = (state, dispatch) => {
	if (convertCurrentBlockquoteCallout(state, dispatch)) return true;
	const sel = state.selection;
	if (!sel.empty) return false;
	const $from = sel.$from;
	if ($from.parent.type.name !== "paragraph") return false;
	if ($from.parent.content.size !== 0) return false;
	const blockquoteDepth = $from.depth - 1;
	if (blockquoteDepth < 1) return false;
	const blockquote = $from.node(blockquoteDepth);
	if (blockquote.type.name !== "blockquote" || !blockquote.attrs.alert) return false;
	if ($from.index(blockquoteDepth) !== 0) return false;
	if (dispatch) {
		const insertPos = $from.after();
		const tr = state.tr.insert(insertPos, state.schema.nodes.paragraph.create());
		tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
		dispatch(tr);
	}
	return true;
};
var blockquote = {
	name: "blockquote",
	inputRules: (schema) => [wrappingInputRule(/^> $/, schema.nodes.blockquote), calloutInputRule],
	keymap: () => ({ Enter: calloutEnter })
};
//#endregion
//#region src/features/code.ts
function scanCodeRuns(text, consumed) {
	const out = [];
	const runs = [];
	for (let i = 0; i < text.length;) {
		if (text[i] !== "`" || consumed[i]) {
			i++;
			continue;
		}
		let j = i;
		while (j < text.length && text[j] === "`" && !consumed[j]) j++;
		runs.push({
			pos: i,
			len: j - i
		});
		i = j;
	}
	const used = /* @__PURE__ */ new Set();
	for (let a = 0; a < runs.length; a++) {
		if (used.has(a)) continue;
		const open = runs[a];
		if (consumed[open.pos]) {
			used.add(a);
			continue;
		}
		let b = -1;
		for (let k = a + 1; k < runs.length; k++) {
			if (used.has(k) || consumed[runs[k].pos]) continue;
			if (runs[k].len === open.len) {
				b = k;
				break;
			}
		}
		if (b === -1) for (let k = a + 1; k < runs.length; k++) {
			if (used.has(k) || consumed[runs[k].pos]) continue;
			b = k;
			break;
		}
		if (b === -1) continue;
		const close = runs[b];
		const fenceLen = Math.min(open.len, close.len);
		const openFrom = open.pos;
		const openTo = openFrom + fenceLen;
		const closeTo = close.pos + close.len;
		const closeFrom = closeTo - fenceLen;
		if (openTo >= closeFrom) continue;
		const innerStart = openTo;
		const innerEnd = closeFrom;
		if (!/\S/.test(text.slice(innerStart, innerEnd))) continue;
		let markFrom = innerStart;
		let markTo = innerEnd;
		while (markFrom < markTo && /\s/.test(text[markFrom])) markFrom += 1;
		while (markTo > markFrom && /\s/.test(text[markTo - 1])) markTo -= 1;
		const hasSoft = markFrom > innerStart || markTo < innerEnd;
		let delimRanges;
		if (hasSoft) {
			delimRanges = [{
				from: openFrom,
				to: openTo
			}];
			if (markFrom > innerStart) delimRanges.push({
				from: innerStart,
				to: markFrom,
				softInside: true
			});
			if (markTo < innerEnd) delimRanges.push({
				from: markTo,
				to: innerEnd,
				softInside: true
			});
			delimRanges.push({
				from: closeFrom,
				to: closeTo
			});
		}
		markConsumed(consumed, openFrom, closeTo);
		used.add(a);
		used.add(b);
		const span = {
			type: "code",
			from: markFrom,
			to: markTo,
			openFrom,
			openTo,
			closeFrom,
			closeTo
		};
		if (delimRanges) span.delimRanges = delimRanges;
		out.push(span);
	}
	return out;
}
var code = {
	name: "code",
	marks: { code: {
		parseDOM: [{ tag: "code" }],
		toDOM: () => ["code", 0]
	} },
	parserTokens: { code_inline: (state, tok, schema) => {
		const fence = tok.markup;
		let content = tok.content;
		if (fence.length > 1 && content.includes(fence[0])) content = ` ${content} `;
		state.addText(fence);
		state.openMark(schema.marks.code.create());
		state.addText(content);
		state.closeMarkType(schema.marks.code);
		state.addText(fence);
	} },
	markDelims: { code: {
		open: "",
		close: ""
	} },
	inline: {
		priority: 0,
		scan: scanCodeRuns,
		markNames: ["code"],
		extRanges: (parent) => {
			const ranges = [];
			if (!parent.type.schema.marks.code) return ranges;
			const text = parent.textContent;
			const baseRanges = markExtRanges(parent, "code", 0);
			for (const [from, to] of baseRanges) {
				let left = from;
				if (left > 0 && text[left - 1] === " ") left -= 1;
				while (left > 0 && text[left - 1] === "`") left -= 1;
				let right = to;
				if (right < text.length && text[right] === " ") right += 1;
				while (right < text.length && text[right] === "`") right += 1;
				ranges.push([left, right]);
			}
			return ranges;
		}
	}
};
//#endregion
//#region src/features/emoji.ts
var EMOJI = emojiData;
var ALL_NAMES = Object.keys(EMOJI).sort();
var EMOJI_RE = /:([a-z0-9_+\-]+):/g;
var scan$5 = (text, consumed) => {
	const out = [];
	EMOJI_RE.lastIndex = 0;
	let m;
	while (m = EMOJI_RE.exec(text)) {
		const glyph = EMOJI[m[1]];
		if (!glyph) continue;
		const fullStart = m.index;
		const fullEnd = fullStart + m[0].length;
		let blocked = false;
		for (let i = fullStart; i < fullEnd; i++) if (consumed[i]) {
			blocked = true;
			break;
		}
		if (blocked) continue;
		markConsumed(consumed, fullStart, fullEnd);
		out.push({
			type: "emoji",
			from: fullStart,
			to: fullEnd,
			openFrom: fullStart,
			openTo: fullStart,
			closeFrom: fullEnd,
			closeTo: fullEnd,
			delimRanges: [{
				from: fullStart,
				to: fullEnd
			}],
			widgetDecorations: [{
				pos: fullStart,
				when: "always",
				kind: "emoji",
				attrs: {
					glyph,
					len: String(fullEnd - fullStart)
				},
				side: -1
			}]
		});
	}
	return out;
};
var PARTIAL_RE = /\B:([a-z0-9_+\-]+)$/;
var MAX_VISIBLE = 8;
var CLOSED = {
	open: false,
	partial: "",
	matches: [],
	selected: 0,
	dismissedFor: "",
	from: 0,
	to: 0
};
var autoKey = new PluginKey("emoji-autocomplete");
function findMatches(partial) {
	const out = [];
	for (const n of ALL_NAMES) {
		if (n.startsWith(partial)) out.push(n);
		if (out.length >= MAX_VISIBLE) return out;
	}
	if (out.length < MAX_VISIBLE) for (const n of ALL_NAMES) {
		if (out.includes(n)) continue;
		if (n.includes(partial)) out.push(n);
		if (out.length >= MAX_VISIBLE) break;
	}
	return out;
}
function computeAutoState(state, prev) {
	const sel = state.selection;
	if (!sel.empty) return CLOSED;
	const $pos = sel.$from;
	if (!$pos.parent.isTextblock) return CLOSED;
	const text = $pos.parent.textBetween(0, $pos.parentOffset, "\n", "\n");
	const m = PARTIAL_RE.exec(text);
	if (!m) return CLOSED;
	const partial = m[1];
	if (prev.dismissedFor === partial) return {
		...CLOSED,
		dismissedFor: partial
	};
	const matches = findMatches(partial);
	if (matches.length === 0) return CLOSED;
	const cursor = $pos.pos;
	return {
		open: true,
		partial,
		matches,
		selected: prev.open && prev.partial === partial && prev.matches.length === matches.length ? Math.min(prev.selected, matches.length - 1) : 0,
		dismissedFor: "",
		from: cursor - partial.length - 1,
		to: cursor
	};
}
function commit(view, name, s) {
	const replacement = `:${name}: `;
	const tr = view.state.tr.insertText(replacement, s.from, s.to);
	const newPos = s.from + replacement.length;
	tr.setSelection(TextSelection.create(tr.doc, newPos));
	view.dispatch(tr);
}
function emojiAutocompletePlugin() {
	return new Plugin({
		key: autoKey,
		state: {
			init: (_, state) => computeAutoState(state, CLOSED),
			apply(tr, prev, _oldState, newState) {
				const meta = tr.getMeta(autoKey);
				if (meta?.type === "select") {
					if (!prev.open) return prev;
					const max = prev.matches.length - 1;
					const next = Math.max(0, Math.min(max, meta.index));
					return {
						...prev,
						selected: next
					};
				}
				if (meta?.type === "dismiss") return {
					...CLOSED,
					dismissedFor: prev.partial
				};
				return computeAutoState(newState, prev);
			}
		},
		props: {
			decorations(state) {
				const s = autoKey.getState(state);
				if (!s?.open) return DecorationSet.empty;
				const el = buildDropdown(s);
				return DecorationSet.create(state.doc, [Decoration.widget(s.to, el, {
					side: 1,
					key: `emoji-auto@${s.partial}@${s.selected}`,
					ignoreSelection: true,
					stopEvent: () => true
				})]);
			},
			handleKeyDown(view, e) {
				const s = autoKey.getState(view.state);
				if (!s?.open) return false;
				if (e.key === "ArrowDown") {
					view.dispatch(view.state.tr.setMeta(autoKey, {
						type: "select",
						index: s.selected + 1
					}));
					e.preventDefault();
					return true;
				}
				if (e.key === "ArrowUp") {
					view.dispatch(view.state.tr.setMeta(autoKey, {
						type: "select",
						index: s.selected - 1
					}));
					e.preventDefault();
					return true;
				}
				if (e.key === "Enter" || e.key === "Tab") {
					const name = s.matches[s.selected];
					if (!name) return false;
					commit(view, name, s);
					e.preventDefault();
					return true;
				}
				if (e.key === "Escape") {
					view.dispatch(view.state.tr.setMeta(autoKey, { type: "dismiss" }));
					e.preventDefault();
					return true;
				}
				return false;
			}
		},
		view(view) {
			const reposition = () => {
				const s = autoKey.getState(view.state);
				if (!s?.open) return;
				const el = view.dom.querySelector(".emoji-completion");
				if (!el) return;
				const coords = view.coordsAtPos(s.to, -1);
				el.style.top = `${coords.bottom + 2}px`;
				el.style.left = `${coords.left}px`;
				const sel = el.querySelector(".emoji-completion-row.selected");
				if (sel) {
					const elRect = el.getBoundingClientRect();
					const selRect = sel.getBoundingClientRect();
					if (selRect.top < elRect.top) el.scrollTop -= elRect.top - selRect.top;
					else if (selRect.bottom > elRect.bottom) el.scrollTop += selRect.bottom - elRect.bottom;
				}
			};
			reposition();
			return { update() {
				reposition();
			} };
		}
	});
}
function buildDropdown(s) {
	const root = document.createElement("div");
	root.className = "emoji-completion";
	root.setAttribute("contenteditable", "false");
	root.addEventListener("mousedown", (e) => e.preventDefault());
	for (let i = 0; i < s.matches.length; i++) {
		const name = s.matches[i];
		const row = document.createElement("div");
		row.className = "emoji-completion-row";
		if (i === s.selected) row.classList.add("selected");
		row.dataset.name = name;
		const glyph = document.createElement("span");
		glyph.className = "emoji-completion-glyph";
		glyph.textContent = EMOJI[name] ?? "";
		const label = document.createElement("span");
		label.className = "emoji-completion-name";
		label.textContent = `:${name}:`;
		row.appendChild(glyph);
		row.appendChild(label);
		row.addEventListener("click", () => {
			root.dispatchEvent(new CustomEvent("emoji-autocomplete-pick", {
				bubbles: true,
				detail: { name }
			}));
		});
		root.appendChild(row);
	}
	return root;
}
var emoji = {
	name: "emoji",
	plugins: () => [
		emojiAutocompletePlugin(),
		new Plugin({ view(view) {
			const handler = (e) => {
				const ce = e;
				const s = autoKey.getState(view.state);
				if (!s?.open) return;
				commit(view, ce.detail.name, s);
			};
			view.dom.addEventListener("emoji-autocomplete-pick", handler);
			return { destroy() {
				view.dom.removeEventListener("emoji-autocomplete-pick", handler);
			} };
		} }),
		new Plugin({ view(view) {
			const handler = (event) => {
				const glyph = event.target?.closest(".emoji-glyph");
				if (!glyph || !view.dom.contains(glyph)) return;
				const len = Number(glyph.getAttribute("data-len") ?? "0");
				if (!len) return;
				const widgetPos = Number(glyph.getAttribute("data-pos") ?? "-1");
				if (widgetPos < 0) return;
				const tail = widgetPos + len;
				if (tail > view.state.doc.content.size) return;
				event.preventDefault();
				view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, tail)));
				view.focus();
			};
			view.dom.addEventListener("click", handler);
			return { destroy() {
				view.dom.removeEventListener("click", handler);
			} };
		} })
	],
	inline: {
		priority: .7,
		scan: scan$5,
		markNames: [],
		extRanges: () => []
	}
};
//#endregion
//#region src/features/emphasis.ts
var isAlnum = (c) => /[\p{L}\p{N}]/u.test(c);
function scanOneDelim(text, delim, consumed, out) {
	const runs = scanRuns(text, delim, consumed);
	if (delim === "_") for (const r of runs) {
		const before = r.pos > 0 ? text[r.pos - 1] : " ";
		const after = r.pos + r.len < text.length ? text[r.pos + r.len] : " ";
		if (isAlnum(before)) r.canOpen = false;
		if (isAlnum(after)) r.canClose = false;
	}
	const stack = [];
	for (let i = 0; i < runs.length; i++) {
		const run = runs[i];
		if (run.canClose && stack.length > 0) {
			const open = runs[stack.pop()];
			const close = run;
			if (open.len >= 3 && close.len >= 3) {
				const emOpenFrom = open.pos;
				const emOpenTo = emOpenFrom + 1;
				const emCloseTo = close.pos + close.len;
				const emCloseFrom = emCloseTo - 1;
				const strongOpenFrom = emOpenTo;
				const strongOpenTo = strongOpenFrom + 2;
				const strongCloseTo = emCloseFrom;
				const strongCloseFrom = strongCloseTo - 2;
				const innerFrom = strongOpenTo;
				const innerTo = strongCloseFrom;
				if (innerFrom >= innerTo) continue;
				if (/\s/.test(text[innerFrom]) || /\s/.test(text[innerTo - 1])) continue;
				markConsumed(consumed, emOpenFrom, emCloseTo);
				out.push({
					type: "em",
					from: emOpenTo,
					to: emCloseFrom,
					openFrom: emOpenFrom,
					openTo: emOpenTo,
					closeFrom: emCloseFrom,
					closeTo: emCloseTo
				});
				out.push({
					type: "strong",
					from: innerFrom,
					to: innerTo,
					openFrom: strongOpenFrom,
					openTo: strongOpenTo,
					closeFrom: strongCloseFrom,
					closeTo: strongCloseTo
				});
				continue;
			}
			const wantLen = Math.min(open.len, close.len) >= 2 ? 2 : 1;
			const openFrom = open.pos;
			const openTo = openFrom + wantLen;
			const closeTo = close.pos + close.len;
			const closeFrom = closeTo - wantLen;
			const innerFrom = openTo;
			const innerTo = closeFrom;
			if (innerFrom >= innerTo) continue;
			if (/\s/.test(text[innerFrom]) || /\s/.test(text[innerTo - 1])) continue;
			markConsumed(consumed, openFrom, closeTo);
			out.push({
				type: wantLen === 2 ? "strong" : "em",
				from: innerFrom,
				to: innerTo,
				openFrom,
				openTo,
				closeFrom,
				closeTo
			});
			continue;
		}
		if (run.canOpen) stack.push(i);
	}
}
var scan$4 = (text, consumed) => {
	const out = [];
	scanOneDelim(text, "*", consumed, out);
	scanOneDelim(text, "_", consumed, out);
	return out;
};
var emphasis = {
	name: "emphasis",
	marks: {
		em: {
			parseDOM: [{ tag: "em" }, { tag: "i" }],
			toDOM: () => ["em", 0]
		},
		strong: {
			parseDOM: [{ tag: "strong" }, { tag: "b" }],
			toDOM: () => ["strong", 0]
		}
	},
	parserTokens: {
		em_open: (state, tok, schema) => {
			state.addText(tok.markup);
			state.openMark(schema.marks.em.create());
		},
		em_close: (state, tok, schema) => {
			state.closeMarkType(schema.marks.em);
			state.addText(tok.markup);
		},
		strong_open: (state, tok, schema) => {
			state.addText(tok.markup);
			state.openMark(schema.marks.strong.create());
		},
		strong_close: (state, tok, schema) => {
			state.closeMarkType(schema.marks.strong);
			state.addText(tok.markup);
		}
	},
	markDelims: {
		em: {
			open: "",
			close: ""
		},
		strong: {
			open: "",
			close: ""
		}
	},
	inline: {
		priority: 2,
		scan: scan$4,
		markNames: ["em", "strong"],
		extRanges: (parent) => [...markExtRanges(parent, "em", 1), ...markExtRanges(parent, "strong", 2)]
	}
};
//#endregion
//#region src/block-draft.ts
function leaveLineDraft(spec) {
	const key = new PluginKey("leaveLineDraft");
	function matchForCursorParagraph(state) {
		const sel = state.selection;
		if (!sel.empty) return null;
		const $from = sel.$from;
		const paragraph = $from.parent;
		if (paragraph.type.name !== "paragraph") return null;
		const m = spec.match(paragraph.textContent);
		if (!m) return null;
		return {
			paragraph,
			paragraphPos: $from.before(),
			paragraphStart: $from.start(),
			data: m.data,
			prefixLen: m.prefixLen
		};
	}
	function buildDecos(state) {
		const hit = matchForCursorParagraph(state);
		if (!hit) return DecorationSet.empty;
		const { paragraph, paragraphPos, paragraphStart, data, prefixLen } = hit;
		const decos = [Decoration.node(paragraphPos, paragraphPos + paragraph.nodeSize, { class: spec.draftClass(data) })];
		if (prefixLen > 0) decos.push(Decoration.inline(paragraphStart, paragraphStart + prefixLen, { class: "syntax-hint" }));
		return DecorationSet.create(state.doc, decos);
	}
	const plugin = new Plugin({
		key,
		state: {
			init: (_, state) => buildDecos(state),
			apply: (_tr, _old, _oldState, newState) => buildDecos(newState)
		},
		props: { decorations(state) {
			return key.getState(state);
		} },
		appendTransaction(trs, oldState, newState) {
			const oldSel = oldState.selection;
			if (!oldSel.empty) return null;
			const oldPara = oldSel.$from.parent;
			if (oldPara.type.name !== "paragraph") return null;
			if (!spec.match(oldPara.textContent)) return null;
			let mapped = oldSel.$from.before();
			for (const tr of trs) mapped = tr.mapping.map(mapped);
			const newSel = newState.selection;
			if (newSel.empty && newSel.$from.before() === mapped) return null;
			const paraNow = newState.doc.nodeAt(mapped);
			if (!paraNow || paraNow.type.name !== "paragraph") return null;
			const reMatched = spec.match(paraNow.textContent);
			if (!reMatched) return null;
			const tr = newState.tr;
			spec.commit(tr, mapped, paraNow, reMatched.data);
			return tr.docChanged ? tr : null;
		}
	});
	const commit = (view) => {
		const hit = matchForCursorParagraph(view.state);
		if (!hit) return false;
		const tr = view.state.tr;
		spec.commit(tr, hit.paragraphPos, hit.paragraph, hit.data);
		if (!tr.docChanged) return false;
		view.dispatch(tr);
		return true;
	};
	return {
		plugin,
		commit
	};
}
//#endregion
//#region src/renderers/latest-task.ts
function createLatestTaskScheduler(delayMs) {
	let version = 0;
	let timer = null;
	return {
		schedule(task, onResult) {
			const ownVersion = ++version;
			if (timer) globalThis.clearTimeout(timer);
			timer = globalThis.setTimeout(() => {
				timer = null;
				task().then((value) => {
					if (ownVersion === version) onResult(value);
				});
			}, delayMs);
		},
		cancel() {
			version++;
			if (timer) {
				globalThis.clearTimeout(timer);
				timer = null;
			}
		}
	};
}
//#endregion
//#region src/renderers/mermaid.ts
var renderSeq = 0;
var RENDER_TIMEOUT_MS = 5e3;
var MERMAID_ERROR_SVG_RE = /Syntax error in text|mermaid version/i;
function getMermaidRenderAppearance() {
	if (typeof document === "undefined") return "light";
	return document.documentElement.dataset.appearance === "dark" ? "dark" : "light";
}
function mermaidConfigForAppearance(appearance) {
	return {
		startOnLoad: false,
		securityLevel: "strict",
		suppressErrorRendering: true,
		theme: appearance === "dark" ? "dark" : "default"
	};
}
function shouldPadMermaidNewline(prev, next) {
	return prev === ">" && next === "|";
}
function normalizeMermaidSourceForRender(code) {
	let out = "";
	for (let i = 0; i < code.length; i++) {
		const char = code[i];
		if (char !== "\n") {
			out += char;
			continue;
		}
		const prev = out.at(-1);
		const next = code[i + 1];
		const pad = shouldPadMermaidNewline(prev, next);
		if (pad) out += " ";
		out += "\n";
		if (pad) out += " ";
	}
	return out;
}
function timeout(ms) {
	return new Promise((_, reject) => {
		globalThis.setTimeout(() => reject(/* @__PURE__ */ new Error("Mermaid rendering timed out")), ms);
	});
}
function createMermaidRenderer(load, timeoutMs = RENDER_TIMEOUT_MS) {
	let mermaidPromise = null;
	const getMermaid = async () => {
		if (!mermaidPromise) mermaidPromise = load();
		return mermaidPromise;
	};
	return { async render(code) {
		try {
			const result = await Promise.race([(async () => {
				const mermaid = await getMermaid();
				mermaid.initialize(mermaidConfigForAppearance(getMermaidRenderAppearance()));
				return mermaid.render(`typora-web-mermaid-${++renderSeq}`, normalizeMermaidSourceForRender(code));
			})(), timeout(timeoutMs)]);
			if (MERMAID_ERROR_SVG_RE.test(result.svg)) return {
				state: "error",
				message: "Mermaid syntax error"
			};
			return {
				state: "success",
				svg: result.svg
			};
		} catch (error) {
			return {
				state: "error",
				message: error instanceof Error ? error.message : String(error)
			};
		}
	} };
}
var mermaidRenderer = createMermaidRenderer(async () => {
	return (await import("mermaid")).default;
});
//#endregion
//#region src/features/fenced-code.ts
var FENCE_RE = /^```(\w*)$/;
var DIAGRAM_RENDER_DELAY_MS = 120;
var DIAGRAM_RENDER_ROOT_MARGIN = "600px 0px";
function canDeferDiagramRender() {
	const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
	return typeof IntersectionObserver === "function" && !/\bHappyDOM\b/i.test(userAgent);
}
var langFocusKey = new PluginKey("fencedCodeLangFocus");
function codeBlockPosAt(state, pos) {
	const $ = state.doc.resolve(pos);
	for (let d = $.depth; d >= 0; d--) if ($.node(d).type.name === "code_block") return $.before(d);
	return null;
}
var CodeBlockView = class {
	dom;
	contentDOM;
	sourceFrameEl;
	codeMountEl;
	chromeEl;
	inputEl;
	menuEl;
	diagramEl;
	view;
	getPos;
	cm;
	diagramScheduler = createLatestTaskScheduler(DIAGRAM_RENDER_DELAY_MS);
	diagramObserver = null;
	appearanceObserver = null;
	renderedDiagramKey = "";
	pendingDiagramKey = "";
	pendingDiagramCode = "";
	syncingFromProseMirror = false;
	constructor(node, view, getPos, decorations = []) {
		this.view = view;
		this.getPos = getPos;
		const root = document.createElement("div");
		root.className = "code-block-node";
		root.setAttribute("contenteditable", "false");
		const pre = document.createElement("pre");
		pre.className = "code-source-frame hljs";
		pre.setAttribute("contenteditable", "false");
		const lang = node.attrs.lang ?? "";
		if (lang) pre.setAttribute("data-lang", lang);
		pre.dataset.code = node.textContent;
		root.dataset.code = node.textContent;
		const code = document.createElement("code");
		code.className = "pm-code-content";
		code.setAttribute("aria-hidden", "true");
		pre.appendChild(code);
		const codeMount = document.createElement("div");
		codeMount.className = "typora-web-code-editor";
		pre.appendChild(codeMount);
		const diagram = document.createElement("div");
		diagram.className = "diagram-panel";
		diagram.setAttribute("contenteditable", "false");
		const chrome = document.createElement("div");
		chrome.className = "cb-chrome";
		chrome.setAttribute("contenteditable", "false");
		const input = document.createElement("input");
		input.className = "cb-lang-input";
		input.placeholder = "lang";
		input.value = lang;
		input.spellcheck = false;
		chrome.appendChild(input);
		const menu = document.createElement("div");
		menu.className = "cb-lang-menu";
		menu.hidden = true;
		menu.setAttribute("role", "listbox");
		pre.appendChild(chrome);
		root.append(pre, diagram);
		document.body.appendChild(menu);
		this.dom = root;
		this.contentDOM = code;
		this.sourceFrameEl = pre;
		this.codeMountEl = codeMount;
		this.chromeEl = chrome;
		this.inputEl = input;
		this.menuEl = menu;
		this.diagramEl = diagram;
		this.cm = createEmbeddedCodeMirrorEditor({
			parent: codeMount,
			doc: node.textContent,
			language: lang,
			className: "typora-web-cm-code",
			onChange: this.onCodeChange
		});
		this.cmEditable = view.editable;
		this.cm.setEditable(this.cmEditable);
		this.inputEl.disabled = !this.cmEditable;
		this.dom.__typoraWebCodeBlock = this;
		/* Clicks on the frame/padding never reach the CodeMirror surface, so
		   ProseMirror takes focus and the block never activates. Refocus the
		   CodeMirror after the dust settles so any click inside the frame
		   activates the block. */
		pre.addEventListener("mousedown", () => {
			if (!this.cmEditable) return;
			setTimeout(() => {
				if (this.cmEditable && !this.dom.contains(document.activeElement)) try {
					this.cm.view.focus();
				} catch {}
			});
		});
		codeMount.addEventListener("focusin", this.onFocusIn);
		codeMount.addEventListener("focusout", this.onFocusOut);
		diagram.addEventListener("click", this.onDiagramClick);
		input.addEventListener("focus", this.onInputFocus);
		input.addEventListener("click", this.onInputFocus);
		input.addEventListener("input", this.onInput);
		input.addEventListener("keydown", this.onInputKeyDown);
		input.addEventListener("mousedown", (e) => e.stopPropagation());
		menu.addEventListener("mousedown", this.onMenuMouseDown);
		document.addEventListener("mousedown", this.onDocumentMouseDown);
		window.addEventListener("resize", this.onViewportChange);
		window.addEventListener("scroll", this.onViewportChange, true);
		window.addEventListener("typora-web:appearancechange", this.onAppearanceChange);
		this.observeAppearanceChanges();
		this.applyDecorations(decorations);
		this.renderDiagram(node);
	}
	setEditable(editable) {
		if (editable !== this.cmEditable) {
			this.cmEditable = editable;
			this.cm.setEditable(editable);
		}
		this.inputEl.disabled = !editable;
		if (!editable) {
			/* Mode switched while the block was active: PM may still have
			   applied the (stale) cb-active decoration classes; strip them
			   and dismiss the language menu. */
			this.dom.classList.remove("cb-active", "cb-lang-focus");
			this.sourceFrameEl.classList.remove("cb-active", "cb-lang-focus");
			this.dom.removeAttribute("data-lang-focus");
			this.sourceFrameEl.removeAttribute("data-lang-focus");
			this.hideLanguageMenu();
			try {
				this.inputEl.blur();
			} catch {}
		}
	}
	applyDecorations(decorations) {
		let active = false;
		let langFocus = false;
		for (const d of decorations) {
			const spec = d.spec;
			if (spec?.cbActive) active = true;
			if (spec?.cbLangFocus) langFocus = true;
		}
		/* In read-only mode the chrome (language input + menu) must never
		   appear: CM still receives focus on click, which used to add
		   "cb-active" and reveal the input even though it is disabled. */
		if (!this.cmEditable) {
			active = false;
			langFocus = false;
		}
		this.dom.classList.toggle("cb-active", active || langFocus);
		this.dom.classList.toggle("cb-lang-focus", langFocus);
		this.sourceFrameEl.classList.toggle("cb-active", active || langFocus);
		this.sourceFrameEl.classList.toggle("cb-lang-focus", langFocus);
		if (langFocus) {
			this.dom.setAttribute("data-lang-focus", "1");
			this.sourceFrameEl.setAttribute("data-lang-focus", "1");
		} else {
			this.dom.removeAttribute("data-lang-focus");
			this.sourceFrameEl.removeAttribute("data-lang-focus");
		}
		if (langFocus && this.cmEditable) try {
			this.inputEl.focus();
		} catch {}
		else if (active && this.cmEditable && !this.dom.contains(document.activeElement)) try {
			this.cm.view.focus();
		} catch {}
	}
	onFocusIn = () => {
		if (!this.cmEditable) return;
		this.dom.classList.add("cb-active");
	};
	onFocusOut = (event) => {
		const next = event.relatedTarget;
		if (!next || !this.dom.contains(next)) {
			this.dom.classList.remove("cb-active");
			this.sourceFrameEl.classList.remove("cb-active");
		}
	};
	onDiagramClick = () => {
		if (!this.dom.classList.contains("has-diagram")) return;
		this.startPendingDiagramRender();
		this.dom.classList.add("diagram-source-open");
		this.sourceFrameEl.classList.add("diagram-source-open");
		this.dom.classList.add("cb-active");
		this.sourceFrameEl.classList.add("cb-active");
		try {
			this.cm.view.focus();
		} catch {}
	};
	openLanguageMenu() {
		this.renderLanguageMenu();
		this.menuEl.hidden = false;
		this.menuEl.scrollTop = 0;
		this.positionLanguageMenu();
	}
	hideLanguageMenu() {
		this.menuEl.hidden = true;
	}
	onViewportChange = () => {
		if (!this.menuEl.hidden) this.positionLanguageMenu();
	};
	onAppearanceChange = () => {
		const pos = this.getPos();
		if (pos == null) return;
		const node = this.view.state.doc.nodeAt(pos);
		if (!node || node.type.name !== "code_block") return;
		this.renderDiagram(node);
	};
	observeAppearanceChanges() {
		if (typeof MutationObserver !== "function" || typeof document === "undefined") return;
		this.appearanceObserver = new MutationObserver(this.onAppearanceChange);
		this.appearanceObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-appearance"]
		});
	}
	positionLanguageMenu() {
		const rect = this.inputEl.getBoundingClientRect();
		const margin = 8;
		const gap = 6;
		const width = 220;
		const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 236;
		const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 600;
		const spaceBelow = Math.max(0, viewportHeight - rect.bottom - margin - gap);
		const spaceAbove = Math.max(0, rect.top - margin - gap);
		const openAbove = spaceBelow < 160 && spaceAbove > spaceBelow;
		const maxHeight = Math.max(96, Math.min(260, openAbove ? spaceAbove : spaceBelow));
		const maxLeft = Math.max(margin, viewportWidth - width - margin);
		const left = Math.min(Math.max(margin, rect.right - width), maxLeft);
		const top = openAbove ? Math.max(margin, rect.top - gap - maxHeight) : Math.min(viewportHeight - margin - maxHeight, rect.bottom + gap);
		this.menuEl.style.position = "fixed";
		this.menuEl.style.width = `${width}px`;
		this.menuEl.style.left = `${left}px`;
		this.menuEl.style.top = `${Math.max(margin, top)}px`;
		this.menuEl.style.maxHeight = `${maxHeight}px`;
	}
	renderLanguageMenu() {
		const frag = document.createDocumentFragment();
		for (const option of CODE_LANGUAGE_OPTIONS) {
			const item = document.createElement("button");
			item.type = "button";
			item.className = "cb-lang-option";
			item.dataset.langName = option.name;
			item.setAttribute("role", "option");
			item.textContent = option.name;
			frag.appendChild(item);
		}
		this.menuEl.replaceChildren(frag);
	}
	setLanguageValue(newLang) {
		const pos = this.getPos();
		if (pos == null) return;
		this.inputEl.value = newLang;
		this.cm.setLanguage(newLang);
		const tr = this.view.state.tr.setNodeAttribute(pos, "lang", newLang);
		tr.setMeta(langFocusKey, { pos });
		this.view.dispatch(tr);
	}
	onInputFocus = () => {
		if (!this.cmEditable) return;
		this.openLanguageMenu();
	};
	onMenuMouseDown = (event) => {
		event.preventDefault();
		event.stopPropagation();
		const item = event.target?.closest(".cb-lang-option");
		if (!item?.dataset.langName) return;
		this.setLanguageValue(item.dataset.langName);
		this.hideLanguageMenu();
		try {
			this.inputEl.focus();
		} catch {}
	};
	onDocumentMouseDown = (event) => {
		const target = event.target;
		if (target && this.menuEl.contains(target)) return;
		if (target && this.dom.contains(target)) return;
		this.hideLanguageMenu();
		if (!this.dom.classList.contains("diagram-error")) {
			this.dom.classList.remove("diagram-source-open");
			this.sourceFrameEl.classList.remove("diagram-source-open");
		}
	};
	onCodeChange = (code) => {
		if (this.syncingFromProseMirror) return;
		const pos = this.getPos();
		if (pos == null) return;
		const node = this.view.state.doc.nodeAt(pos);
		if (!node || node.type.name !== "code_block") return;
		if (node.textContent === code) return;
		const content = code ? this.view.state.schema.text(code) : null;
		const next = node.type.create(node.attrs, content ? [content] : null);
		const tr = this.view.state.tr.replaceWith(pos, pos + node.nodeSize, next);
		this.view.dispatch(tr);
	};
	onInput = () => {
		this.setLanguageValue(this.inputEl.value);
		this.renderLanguageMenu();
	};
	onInputKeyDown = (e) => {
		if (e.key === "ArrowUp" || e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			const pos = this.getPos();
			if (pos == null) return;
			const node = this.view.state.doc.nodeAt(pos);
			if (!node) return;
			const endInside = pos + node.nodeSize - 1;
			const tr = this.view.state.tr.setSelection(TextSelection.create(this.view.state.doc, endInside));
			tr.setMeta(langFocusKey, null);
			this.view.dispatch(tr);
			this.view.focus();
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			const pos = this.getPos();
			if (pos == null) return;
			const node = this.view.state.doc.nodeAt(pos);
			if (!node) return;
			const afterBlock = pos + node.nodeSize;
			const tr = this.view.state.tr;
			tr.setMeta(langFocusKey, null);
			if (afterBlock < this.view.state.doc.content.size) tr.setSelection(TextSelection.create(tr.doc, afterBlock + 1));
			else {
				const newPara = this.view.state.schema.nodes.paragraph?.createAndFill();
				if (newPara) {
					tr.insert(afterBlock, newPara);
					tr.setSelection(TextSelection.create(tr.doc, afterBlock + 1));
				}
			}
			this.view.dispatch(tr);
			this.view.focus();
		}
	};
	update(node, decorations) {
		if (node.type.name !== "code_block") return false;
		const editable = this.view.editable;
		if (editable !== this.cmEditable) {
			this.cmEditable = editable;
			this.cm.setEditable(editable);
		}
		const lang = node.attrs.lang ?? "";
		if (lang) this.sourceFrameEl.setAttribute("data-lang", lang);
		else this.sourceFrameEl.removeAttribute("data-lang");
		this.dom.dataset.code = node.textContent;
		this.sourceFrameEl.dataset.code = node.textContent;
		if (this.inputEl.value !== lang) this.inputEl.value = lang;
		this.cm.setLanguage(lang);
		if (this.cm.view.state.doc.toString() !== node.textContent) {
			this.syncingFromProseMirror = true;
			this.cm.setDoc(node.textContent);
			this.syncingFromProseMirror = false;
		}
		this.applyDecorations(decorations);
		this.renderDiagram(node);
		return true;
	}
	stopDiagramObserver() {
		this.diagramObserver?.disconnect();
		this.diagramObserver = null;
	}
	stopAppearanceObserver() {
		this.appearanceObserver?.disconnect();
		this.appearanceObserver = null;
	}
	startPendingDiagramRender() {
		if (!this.pendingDiagramKey) return;
		const code = this.pendingDiagramCode;
		const diagramKey = this.pendingDiagramKey;
		this.stopDiagramObserver();
		this.renderedDiagramKey = diagramKey;
		this.pendingDiagramCode = "";
		this.pendingDiagramKey = "";
		this.diagramScheduler.schedule(() => mermaidRenderer.render(code), (result) => {
			if (this.renderedDiagramKey !== diagramKey) return;
			if (result.state === "success") {
				this.dom.classList.add("diagram-success");
				this.dom.classList.remove("diagram-error");
				this.sourceFrameEl.classList.add("diagram-success");
				this.sourceFrameEl.classList.remove("diagram-error");
				this.diagramEl.hidden = false;
				this.diagramEl.dataset.diagramState = "success";
				this.diagramEl.innerHTML = result.svg;
			} else {
				this.dom.classList.add("diagram-error");
				this.dom.classList.remove("diagram-success");
				this.sourceFrameEl.classList.add("diagram-error");
				this.sourceFrameEl.classList.remove("diagram-success");
				this.diagramEl.hidden = true;
				this.diagramEl.dataset.diagramState = "error";
				this.diagramEl.replaceChildren();
			}
		});
	}
	observePendingDiagram() {
		this.stopDiagramObserver();
		if (!canDeferDiagramRender()) {
			this.startPendingDiagramRender();
			return;
		}
		this.diagramObserver = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) this.startPendingDiagramRender();
		}, { rootMargin: DIAGRAM_RENDER_ROOT_MARGIN });
		this.diagramObserver.observe(this.dom);
	}
	renderDiagram(node) {
		const lang = String(node.attrs.lang ?? "").trim().toLowerCase();
		if (lang !== "mermaid") {
			this.diagramScheduler.cancel();
			this.stopDiagramObserver();
			this.dom.classList.remove("has-diagram", "diagram-success", "diagram-error", "diagram-source-open");
			this.sourceFrameEl.classList.remove("has-diagram", "diagram-success", "diagram-error", "diagram-source-open");
			this.diagramEl.hidden = false;
			this.diagramEl.replaceChildren();
			this.diagramEl.removeAttribute("data-diagram-state");
			this.renderedDiagramKey = "";
			this.pendingDiagramKey = "";
			this.pendingDiagramCode = "";
			return;
		}
		const code = node.textContent;
		const diagramKey = `${lang}\u0000${getMermaidRenderAppearance()}\u0000${code}`;
		if (diagramKey === this.renderedDiagramKey || diagramKey === this.pendingDiagramKey) return;
		this.diagramScheduler.cancel();
		this.stopDiagramObserver();
		this.pendingDiagramKey = diagramKey;
		this.pendingDiagramCode = code;
		this.dom.classList.add("has-diagram");
		this.sourceFrameEl.classList.add("has-diagram");
		this.dom.classList.remove("diagram-success", "diagram-error");
		this.sourceFrameEl.classList.remove("diagram-success", "diagram-error");
		this.diagramEl.hidden = false;
		this.diagramEl.dataset.diagramState = "loading";
		this.diagramEl.textContent = "";
		this.observePendingDiagram();
	}
	stopEvent(e) {
		const target = e.target;
		return this.chromeEl.contains(target) || this.menuEl.contains(target) || this.codeMountEl.contains(target) || this.diagramEl.contains(target);
	}
	ignoreMutation(m) {
		if (this.chromeEl.contains(m.target) || this.codeMountEl.contains(m.target) || this.diagramEl.contains(m.target)) return true;
		if ((m.target === this.dom || m.target === this.sourceFrameEl) && m.type === "attributes" && (m.attributeName === "class" || m.attributeName === "data-lang-focus" || m.attributeName === "data-lang" || m.attributeName === "data-code")) return true;
		return false;
	}
	destroy() {
		this.diagramScheduler.cancel();
		this.stopDiagramObserver();
		this.stopAppearanceObserver();
		this.cm.destroy();
		this.codeMountEl.removeEventListener("focusin", this.onFocusIn);
		this.codeMountEl.removeEventListener("focusout", this.onFocusOut);
		this.diagramEl.removeEventListener("click", this.onDiagramClick);
		this.inputEl.removeEventListener("focus", this.onInputFocus);
		this.inputEl.removeEventListener("click", this.onInputFocus);
		this.inputEl.removeEventListener("input", this.onInput);
		this.inputEl.removeEventListener("keydown", this.onInputKeyDown);
		this.menuEl.removeEventListener("mousedown", this.onMenuMouseDown);
		document.removeEventListener("mousedown", this.onDocumentMouseDown);
		window.removeEventListener("resize", this.onViewportChange);
		window.removeEventListener("scroll", this.onViewportChange, true);
		window.removeEventListener("typora-web:appearancechange", this.onAppearanceChange);
		this.menuEl.remove();
	}
};
function codeEditableSyncPlugin() {
	return new Plugin({
		view() {
			return {
				update(view) {
					const editable = view.editable;
					for (const el of view.dom.querySelectorAll(".code-block-node")) el.__typoraWebCodeBlock?.setEditable(editable);
				}
			};
		}
	});
}
function fencedCodeChromePlugin() {
	/* Tracks view.editable so the cb-active/cb-lang-focus decorations are
	   never produced in read-only mode (PM applies their classes to the
	   node DOM via updateOuterDeco, bypassing the NodeView). */
	let pluginEditable = true;
	return new Plugin({
		key: langFocusKey,
		view(view) {
			pluginEditable = view.editable;
			return {
				update: (view) => {
					pluginEditable = view.editable;
				}
			};
		},
		state: {
			init: () => null,
			apply: (tr, old) => {
				const m = tr.getMeta(langFocusKey);
				if (m === null) return null;
				if (m !== void 0) return m;
				if (!old) return null;
				const mapped = tr.mapping.map(old.pos);
				const node = tr.doc.nodeAt(mapped);
				if (!node || node.type.name !== "code_block") return null;
				return { pos: mapped };
			}
		},
		props: {
			nodeViews: { code_block: (node, view, getPos, decorations) => new CodeBlockView(node, view, getPos, decorations) },
			decorations(state) {
				const decos = [];
				const sel = state.selection;
				if (sel.empty && pluginEditable) {
					const cbPos = codeBlockPosAt(state, sel.from);
					if (cbPos !== null) {
						const node = state.doc.nodeAt(cbPos);
						if (node) decos.push(Decoration.node(cbPos, cbPos + node.nodeSize, { class: "cb-active" }, { cbActive: true }));
					}
				}
				const lf = langFocusKey.getState(state);
				if (lf && pluginEditable) {
					const node = state.doc.nodeAt(lf.pos);
					if (node && node.type.name === "code_block") decos.push(Decoration.node(lf.pos, lf.pos + node.nodeSize, { class: "cb-active cb-lang-focus" }, {
						cbActive: true,
						cbLangFocus: true
					}));
				}
				return decos.length > 0 ? DecorationSet.create(state.doc, decos) : null;
			},
			handleKeyDown(view, e) {
				if (!view.editable) return false;
				if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return false;
				if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return false;
				const state = view.state;
				const lf = langFocusKey.getState(state);
				if (lf) {
					const node = state.doc.nodeAt(lf.pos);
					if (!node || node.type.name !== "code_block") {
						view.dispatch(state.tr.setMeta(langFocusKey, null));
						return true;
					}
					if (e.key === "ArrowUp") {
						const endInside = lf.pos + node.nodeSize - 1;
						const tr = state.tr.setSelection(TextSelection.create(state.doc, endInside)).setMeta(langFocusKey, null);
						view.dispatch(tr);
						return true;
					}
					const afterBlock = lf.pos + node.nodeSize;
					const tr = state.tr.setMeta(langFocusKey, null);
					if (afterBlock < state.doc.content.size) tr.setSelection(TextSelection.create(tr.doc, afterBlock + 1));
					else {
						const newPara = state.schema.nodes.paragraph?.createAndFill();
						if (newPara) {
							tr.insert(afterBlock, newPara);
							tr.setSelection(TextSelection.create(tr.doc, afterBlock + 1));
						}
					}
					view.dispatch(tr);
					return true;
				}
				const sel = state.selection;
				if (!sel.empty) return false;
				const $from = sel.$from;
				if (e.key === "ArrowDown" && $from.parent.type.name === "code_block" && $from.parentOffset === $from.parent.content.size) {
					const cbPos = $from.before();
					view.dispatch(state.tr.setMeta(langFocusKey, { pos: cbPos }));
					return true;
				}
				if (e.key === "ArrowUp" && $from.depth >= 1 && $from.parentOffset === 0) {
					const parentPos = $from.before();
					if (parentPos > 0) {
						const $before = state.doc.resolve(parentPos);
						const index = $before.index();
						if (index > 0) {
							const prev = $before.parent.child(index - 1);
							if (prev.type.name === "code_block") {
								const prevPos = parentPos - prev.nodeSize;
								const endInside = prevPos + prev.nodeSize - 1;
								const tr = state.tr.setSelection(TextSelection.create(state.doc, endInside)).setMeta(langFocusKey, { pos: prevPos });
								view.dispatch(tr);
								return true;
							}
						}
					}
				}
				return false;
			}
		}
	});
}
function makeFencedPlugin(schema) {
	return leaveLineDraft({
		match: (text) => {
			const m = FENCE_RE.exec(text);
			if (!m) return null;
			return {
				data: { lang: m[1] ?? "" },
				prefixLen: 3
			};
		},
		draftClass: () => "fenced-code-draft",
		commit: (tr, pos, paragraph, data) => {
			const codeBlock = schema.nodes.code_block.create({ lang: data.lang }, null);
			tr.replaceWith(pos, pos + paragraph.nodeSize, codeBlock);
		}
	});
}
var fencedCode = {
	name: "code_block",
	plugins: (schema) => [makeFencedPlugin(schema).plugin, fencedCodeChromePlugin(), codeEditableSyncPlugin()],
	keymap: (schema) => ({
		Enter: (state, dispatch) => {
			const sel = state.selection;
			if (!sel.empty) return false;
			const $from = sel.$from;
			const para = $from.parent;
			if (para.type.name !== "paragraph") return false;
			const m = FENCE_RE.exec(para.textContent);
			if (!m) return false;
			if (dispatch) {
				const lang = m[1] ?? "";
				const pos = $from.before();
				const codeBlock = schema.nodes.code_block.create({ lang }, null);
				const tr = state.tr.replaceWith(pos, pos + para.nodeSize, codeBlock);
				tr.setSelection(TextSelection.create(tr.doc, pos + 1));
				dispatch(tr);
			}
			return true;
		},
		Backspace: (state, dispatch) => {
			const sel = state.selection;
			if (!sel.empty) return false;
			const $from = sel.$from;
			if ($from.parent.type.name !== "code_block") return false;
			if ($from.parent.content.size > 0) return false;
			if (dispatch) {
				const pos = $from.before();
				const size = $from.parent.nodeSize;
				const tr = state.tr.delete(pos, pos + size);
				if (tr.doc.content.size === 0) {
					const p = schema.nodes.paragraph.createAndFill();
					if (p) tr.insert(0, p);
				}
				dispatch(tr);
			}
			return true;
		}
	})
};
//#endregion
//#region src/features/front-matter.ts
var frontMatterRule = (state, startLine, endLine, silent) => {
	if (startLine !== 0) return false;
	if (state.tShift[startLine] !== 0) return false;
	const start = state.bMarks[startLine];
	if (state.eMarks[startLine] - start !== 3) return false;
	if (state.src.slice(start, start + 3) !== "---") return false;
	let closeLine = -1;
	for (let line = startLine + 1; line <= endLine; line++) {
		const bm = state.bMarks[line];
		const em = state.eMarks[line];
		if (state.tShift[line] === 0 && em - bm === 3 && state.src.slice(bm, em) === "---") {
			closeLine = line;
			break;
		}
	}
	if (closeLine === -1) return false;
	if (silent) return true;
	const content = state.src.slice(state.bMarks[startLine + 1], state.bMarks[closeLine]).replace(/\n$/, "");
	const token = state.push("front_matter", "div", 0);
	token.content = content;
	token.markup = "---";
	token.block = true;
	token.map = [startLine, closeLine + 1];
	state.line = closeLine + 1;
	return true;
};
var frontMatter = {
	name: "front-matter",
	nodes: { front_matter: {
		group: "block",
		content: "text*",
		code: true,
		marks: "",
		defining: true,
		parseDOM: [{
			tag: "yaml-block",
			preserveWhitespace: "full"
		}],
		toDOM: () => ["yaml-block", 0]
	} },
	mdItPlugins: [(md) => {
		md.block.ruler.before("hr", "front_matter", frontMatterRule, { alt: [
			"paragraph",
			"reference",
			"blockquote",
			"list"
		] });
	}],
	parserTokens: { front_matter: (state, tok, schema) => {
		const content = tok.content;
		const textNodes = content ? [schema.text(content)] : [];
		state.push(schema.nodes.front_matter.createChecked({}, textNodes));
	} },
	blockHandlers: { front_matter: (state, node) => {
		state.write("---\n");
		state.tick("inner");
		for (const ch of node.textContent) {
			state.tick("inner");
			if (ch === "\n") {
				state.out += "\n";
				if (state.delim) state.out += state.delim;
			} else state.out += ch;
			state.advance(1);
		}
		state.tick("inner");
		state.write("\n---");
		state.closeBlock(node);
	} },
	keymap: (schema) => ({
		Enter: (state, dispatch) => {
			const sel = state.selection;
			if (!sel.empty) return false;
			const $from = sel.$from;
			const fmType = schema.nodes.front_matter;
			if ($from.parent.type.name === "paragraph") {
				if ($from.depth === 1 && $from.index(0) === 0 && $from.parent.textContent === "---") {
					if (dispatch) {
						const fm = fmType.create();
						const paraStart = $from.before();
						const paraEnd = $from.after();
						const tr = state.tr;
						tr.replaceWith(paraStart, paraEnd, fm);
						const inside = paraStart + 1;
						tr.setSelection(TextSelection.create(tr.doc, inside));
						dispatch(tr);
					}
					return true;
				}
			}
			if ($from.parent.type === fmType) {
				const text = $from.parent.textContent;
				if ($from.parentOffset === text.length) {
					if (text.endsWith("\n")) {
						if (dispatch) {
							const tr = state.tr;
							const blockEnd = $from.after();
							tr.delete(blockEnd - 2, blockEnd - 1);
							const newBlockEnd = blockEnd - 1;
							if (newBlockEnd >= tr.doc.content.size) {
								const para = schema.nodes.paragraph.create();
								tr.insert(newBlockEnd, para);
							}
							tr.setSelection(TextSelection.create(tr.doc, newBlockEnd + 1));
							dispatch(tr);
						}
						return true;
					}
				}
				return false;
			}
			return false;
		},
		ArrowDown: (state, dispatch) => {
			const sel = state.selection;
			if (!sel.empty) return false;
			const $from = sel.$from;
			const fmType = state.schema.nodes.front_matter;
			if ($from.parent.type !== fmType) return false;
			if ($from.parent.textContent.slice($from.parentOffset).includes("\n")) return false;
			if (dispatch) {
				const tr = state.tr;
				const blockEnd = $from.after();
				if (blockEnd >= tr.doc.content.size) {
					const para = state.schema.nodes.paragraph.create();
					tr.insert(blockEnd, para);
				}
				tr.setSelection(TextSelection.create(tr.doc, blockEnd + 1));
				dispatch(tr);
			}
			return true;
		}
	})
};
//#endregion
//#region src/features/heading.ts
var HEADING_RE = /^(#{1,6}) (.+)$/;
function headingArrowDownPlugin() {
	return new Plugin({ props: { handleKeyDown(view, e) {
		if (e.key !== "ArrowDown") return false;
		if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return false;
		const { state } = view;
		const sel = state.selection;
		if (!sel.empty) return false;
		const para = sel.$from.parent;
		if (para.type.name !== "paragraph") return false;
		if (!HEADING_RE.test(para.textContent)) return false;
		const end = Selection.atEnd(state.doc);
		if (sel.from !== end.from) return false;
		const paraType = state.schema.nodes.paragraph;
		if (!paraType) return false;
		const newPara = paraType.createAndFill();
		if (!newPara) return false;
		const insertPos = state.doc.content.size;
		const tr = state.tr.insert(insertPos, newPara);
		tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
		view.dispatch(tr);
		return true;
	} } });
}
function makeHeadingPlugin(schema) {
	return leaveLineDraft({
		match: (text) => {
			const m = HEADING_RE.exec(text);
			if (!m) return null;
			const level = m[1].length;
			return {
				data: { level },
				prefixLen: level + 1
			};
		},
		draftClass: (data) => `heading-draft-${data.level}`,
		commit: (tr, pos, paragraph, data) => {
			const prefix = data.level + 1;
			const remaining = paragraph.content.cut(prefix);
			const headingNode = schema.nodes.heading.create({ level: data.level }, remaining);
			tr.replaceWith(pos, pos + paragraph.nodeSize, headingNode);
		}
	});
}
var heading = {
	name: "heading",
	plugins: (schema) => [makeHeadingPlugin(schema).plugin, headingArrowDownPlugin()],
	keymap: (schema) => ({ Backspace: (state, dispatch) => {
		const sel = state.selection;
		if (!sel.empty) return false;
		const $from = sel.$from;
		if ($from.parent.type.name !== "heading") return false;
		if ($from.parentOffset !== 0) return false;
		if ($from.parent.content.size > 0) return false;
		if (dispatch) {
			const tr = state.tr;
			const pos = $from.before();
			tr.setBlockType(pos, pos + $from.parent.nodeSize, schema.nodes.paragraph);
			dispatch(tr);
		}
		return true;
	} })
};
//#endregion
//#region src/features/highlight.ts
var highlight = {
	name: "highlight",
	marks: { highlight: {
		parseDOM: [{ tag: "mark" }],
		toDOM: () => ["mark", 0]
	} },
	markDelims: { highlight: {
		open: "",
		close: ""
	} },
	inline: {
		priority: 1.5,
		scan: (text, consumed) => scanFixedDelim(text, "=", 2, "highlight", consumed),
		markNames: ["highlight"],
		extRanges: (parent) => markExtRanges(parent, "highlight", 2)
	}
};
//#endregion
//#region src/features/hr.ts
var HR_RE = /^(-{3,}|\*{3,}|_{3,})$/;
function makeHrPlugin(schema) {
	return leaveLineDraft({
		match: (text) => {
			const m = HR_RE.exec(text);
			if (!m) return null;
			return {
				data: { variant: m[1][0] },
				prefixLen: m[1].length
			};
		},
		draftClass: () => "hr-draft",
		commit: (tr, pos, paragraph) => {
			const hrNode = schema.nodes.horizontal_rule.create();
			const parent = tr.doc.resolve(pos).parent;
			if (tr.doc.resolve(pos).index() === parent.childCount - 1) {
				const empty = schema.nodes.paragraph.create();
				tr.replaceWith(pos, pos + paragraph.nodeSize, [hrNode, empty]);
			} else tr.replaceWith(pos, pos + paragraph.nodeSize, hrNode);
		}
	});
}
var hr = {
	name: "horizontal_rule",
	plugins: (schema) => [makeHrPlugin(schema).plugin]
};
//#endregion
//#region src/sanitize.ts
var URL_ATTRS = /* @__PURE__ */ new Set([
	"href",
	"src",
	"xlink:href",
	"action",
	"formaction"
]);
var UNSAFE_URL_RE = /^[\u0000-\u001F\s]*(?:javascript|vbscript):/i;
var UNSAFE_DATA_URL_RE = /^[\u0000-\u001F\s]*data:text\/html/i;
function stripUnsafeUrls(html) {
	const template = document.createElement("template");
	template.innerHTML = html;
	for (const el of template.content.querySelectorAll("*")) for (const attr of Array.from(el.attributes)) if (URL_ATTRS.has(attr.name.toLowerCase()) && (UNSAFE_URL_RE.test(attr.value) || UNSAFE_DATA_URL_RE.test(attr.value))) el.removeAttribute(attr.name);
	return template.innerHTML;
}
function sanitizeHtml(rawHtml) {
	return stripUnsafeUrls(DOMPurify.sanitize(rawHtml, {
		USE_PROFILES: { html: true },
		RETURN_TRUSTED_TYPE: false
	}));
}
//#endregion
//#region src/features/html-block.ts
var HTML_COMMENT_BLOCK_RE = /^\s*<!--[\s\S]*?-->\s*$/;
function rawHtml(node) {
	return String(node.attrs.raw ?? "");
}
function isCommentOnly(raw) {
	return HTML_COMMENT_BLOCK_RE.test(raw);
}
var HtmlBlockView = class {
	dom;
	preview;
	source;
	sourceEditor;
	view;
	getPos;
	syncingFromProseMirror = false;
	constructor(node, view, getPos) {
		this.dom = document.createElement("html-block");
		this.dom.setAttribute("contenteditable", "false");
		this.view = view;
		this.getPos = getPos;
		this.preview = document.createElement("div");
		this.preview.className = "html-block-preview";
		this.preview.setAttribute("contenteditable", "false");
		this.source = document.createElement("div");
		this.source.className = "html-block-source";
		this.source.spellcheck = false;
		this.source.setAttribute("aria-label", "HTML source");
		this.source.hidden = true;
		this.preview.addEventListener("mousedown", this.onPreviewMouseDown);
		this.preview.addEventListener("click", this.onPreviewClick);
		this.source.addEventListener("mousedown", this.onSourceMouseDown);
		document.addEventListener("mousedown", this.onDocumentMouseDown);
		this.dom.append(this.source, this.preview);
		this.sourceEditor = createEmbeddedCodeMirrorEditor({
			parent: this.source,
			doc: rawHtml(node),
			language: "html",
			className: "typora-web-html-source",
			onChange: this.onSourceChange
		});
		this.render(node);
	}
	update(node) {
		if (node.type.name !== "html_block") return false;
		this.render(node);
		return true;
	}
	render(node) {
		const raw = rawHtml(node);
		this.dom.dataset.raw = raw;
		const preview = document.createElement("div");
		preview.innerHTML = sanitizeHtml(raw);
		normalizeInteractiveHtml(preview);
		this.preview.replaceChildren(...Array.from(preview.childNodes));
		if (this.sourceEditor.view.state.doc.toString() !== raw) {
			this.syncingFromProseMirror = true;
			this.sourceEditor.setDoc(raw);
			this.syncingFromProseMirror = false;
		}
		if (isCommentOnly(raw)) this.source.classList.add("html-comment-source");
		else this.source.classList.remove("html-comment-source");
	}
	openSource(event) {
		event?.preventDefault();
		event?.stopPropagation();
		this.dom.classList.add("html-source-open");
		this.source.hidden = false;
		try {
			this.sourceEditor.view.focus();
		} catch {}
	}
	onPreviewMouseDown = (event) => {
		this.openSource(event);
	};
	onPreviewClick = (event) => {
		this.openSource(event);
	};
	onSourceMouseDown = (event) => {
		event.stopPropagation();
	};
	onSourceChange = (raw) => {
		if (this.syncingFromProseMirror) return;
		const pos = this.getPos();
		if (pos == null) return;
		const node = this.view.state.doc.nodeAt(pos);
		if (!node || node.type.name !== "html_block") return;
		if (raw === rawHtml(node)) return;
		this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, void 0, {
			...node.attrs,
			raw
		}));
	};
	onDocumentMouseDown = (event) => {
		const target = event.target;
		if (target && this.dom.contains(target)) return;
		this.dom.classList.remove("html-source-open");
		this.source.hidden = true;
	};
	destroy() {
		this.preview.removeEventListener("mousedown", this.onPreviewMouseDown);
		this.preview.removeEventListener("click", this.onPreviewClick);
		this.source.removeEventListener("mousedown", this.onSourceMouseDown);
		document.removeEventListener("mousedown", this.onDocumentMouseDown);
		this.sourceEditor.destroy();
	}
	stopEvent(event) {
		const target = event.target;
		return this.preview.contains(target) || this.source.contains(target);
	}
	ignoreMutation() {
		return true;
	}
};
function normalizeInteractiveHtml(root) {
	for (const summary of Array.from(root.querySelectorAll("summary"))) {
		const replacement = document.createElement("div");
		replacement.className = "html-summary";
		replacement.replaceChildren(...Array.from(summary.childNodes));
		summary.replaceWith(replacement);
	}
	for (const details of Array.from(root.querySelectorAll("details"))) {
		const replacement = document.createElement("div");
		replacement.className = "html-details";
		replacement.replaceChildren(...Array.from(details.childNodes));
		details.replaceWith(replacement);
	}
}
function htmlBlockPlugin() {
	return new Plugin({ props: { nodeViews: { html_block: (node, view, getPos) => new HtmlBlockView(node, view, getPos) } } });
}
function createCommentParagraph(raw, schema) {
	return schema.nodes.paragraph.createChecked(null, raw ? [schema.text(raw)] : []);
}
var htmlBlock = {
	name: "html-block",
	nodes: { html_block: {
		group: "block",
		atom: true,
		selectable: true,
		attrs: { raw: { default: "" } },
		parseDOM: [{
			tag: "html-block",
			getAttrs: (el) => ({ raw: el.dataset.raw ?? "" })
		}],
		toDOM: (node) => [
			"html-block",
			{
				"data-raw": rawHtml(node),
				contenteditable: "false"
			},
			["code", rawHtml(node)]
		]
	} },
	parserTokens: {
		html_block: (state, token, schema) => {
			const raw = token.content.replace(/\n$/, "");
			if (isCommentOnly(raw)) {
				state.push(createCommentParagraph(raw, schema));
				return;
			}
			state.push(schema.nodes.html_block.createChecked({ raw }));
		},
		html_inline: (state, token) => {
			state.addText(token.content);
		}
	},
	blockHandlers: { html_block: (state, node) => {
		state.write(rawHtml(node));
		state.closeBlock(node);
	} },
	plugins: () => [htmlBlockPlugin()]
};
//#endregion
//#region src/features/html-comment.ts
var COMMENT_RE = /<!--([\s\S]*?)-->/g;
var scan$3 = (text, consumed) => {
	const out = [];
	COMMENT_RE.lastIndex = 0;
	let m;
	while (m = COMMENT_RE.exec(text)) {
		const fullStart = m.index;
		const fullEnd = fullStart + m[0].length;
		let blocked = false;
		for (let i = fullStart; i < fullEnd; i++) if (consumed[i]) {
			blocked = true;
			break;
		}
		if (blocked) continue;
		markConsumed(consumed, fullStart, fullEnd);
		out.push({
			type: "html_comment",
			from: fullStart,
			to: fullEnd,
			openFrom: fullStart,
			openTo: fullStart,
			closeFrom: fullEnd,
			closeTo: fullEnd
		});
	}
	return out;
};
var htmlComment = {
	name: "html-comment",
	marks: { html_comment: {
		inclusive: false,
		parseDOM: [{ tag: "mark-comment" }],
		toDOM: () => ["mark-comment", 0]
	} },
	markDelims: { html_comment: {
		open: "",
		close: ""
	} },
	inline: {
		priority: .5,
		scan: scan$3,
		markNames: ["html_comment"],
		extRanges: (parent) => {
			const ranges = [];
			const t = parent.type.schema.marks.html_comment;
			if (!t) return ranges;
			let start = -1;
			let off = 0;
			const flush = (end) => {
				if (start >= 0) ranges.push([start, end]);
				start = -1;
			};
			parent.forEach((child) => {
				if (child.isText) {
					if (child.marks.some((m) => m.type === t)) {
						if (start < 0) start = off;
					} else flush(off);
				}
				off += child.nodeSize;
			});
			flush(off);
			return ranges;
		}
	}
};
//#endregion
//#region src/document-metadata.ts
var metadataKey = new PluginKey("document-metadata");
function readFrontMatterValue(doc, key) {
	const first = doc.firstChild;
	if (!first || first.type.name !== "front_matter") return "";
	for (const line of first.textContent.split(/\r?\n/)) {
		const match = /^\s*([^:#]+?)\s*:\s*(.+?)\s*$/.exec(line);
		if (!match || match[1] !== key) continue;
		return match[2].replace(/^['"]|['"]$/g, "");
	}
	return "";
}
function readMetadata(doc) {
	return { typoraRootUrl: readFrontMatterValue(doc, "typora-root-url") };
}
function documentMetadataPlugin() {
	return new Plugin({
		key: metadataKey,
		state: {
			init: (_, state) => readMetadata(state.doc),
			apply: (tr, previous, _oldState, newState) => tr.docChanged ? readMetadata(newState.doc) : previous
		}
	});
}
function getDocumentMetadata(state) {
	return metadataKey.getState(state) ?? { typoraRootUrl: "" };
}
//#endregion
//#region src/features/image.ts
var IMAGE_RE = /!\[([^\]]*?)\]\(([^\s)]*)(?:\s+"([^"]*)")?\)/g;
var imageLoadStatus = /* @__PURE__ */ new Map();
var IMAGE_LOAD_META = "image-load-status-changed";
function resolveImagePreviewSrc(src, rootUrl) {
	if (!rootUrl || !src.startsWith("/") || src.startsWith("//")) return src;
	return `${rootUrl.replace(/\/+$/, "")}/${src.replace(/^\/+/, "")}`;
}
var scan$2 = (text, consumed, _parentBlock, context) => {
	const out = [];
	const rootUrl = context?.state ? getDocumentMetadata(context.state).typoraRootUrl : "";
	IMAGE_RE.lastIndex = 0;
	let m;
	while (m = IMAGE_RE.exec(text)) {
		const fullStart = m.index;
		const fullEnd = fullStart + m[0].length;
		let blocked = false;
		for (let i = fullStart; i < fullEnd; i++) if (consumed[i]) {
			blocked = true;
			break;
		}
		if (blocked) continue;
		const openFrom = fullStart;
		const openTo = fullStart + 2;
		const contentFrom = openTo;
		const contentTo = openTo + m[1].length;
		const closeFrom = contentTo;
		const closeTo = fullEnd;
		markConsumed(consumed, fullStart, fullEnd);
		const src = m[2];
		const previewSrc = resolveImagePreviewSrc(src, rootUrl);
		const title = m[3] ?? null;
		const alt = m[1];
		const span = {
			type: "image",
			from: contentFrom,
			to: contentTo,
			openFrom,
			openTo,
			closeFrom,
			closeTo,
			attrs: {
				src,
				title
			},
			widgetDecorations: []
		};
		const status = src === "" ? null : imageLoadStatus.get(previewSrc) ?? null;
		const editMode = src === "" || status === "error";
		const iconWidget = {
			pos: openFrom,
			kind: "image-icon",
			side: 1,
			attrs: status === "error" ? { broken: "1" } : void 0
		};
		if (!editMode) {
			span.delimRanges = [{
				from: openFrom,
				to: closeTo,
				softInside: true
			}];
			span.widgetDecorations.push({
				...iconWidget,
				when: "inside"
			}, {
				pos: closeTo,
				when: "always",
				kind: "image-render",
				attrs: {
					src: previewSrc,
					alt,
					...title ? { title } : {}
				}
			});
		} else {
			span.delimRanges = [];
			span.widgetDecorations.push({
				...iconWidget,
				when: "always"
			}, {
				pos: closeFrom + 2,
				when: "always",
				kind: "file-input"
			});
		}
		out.push(span);
	}
	return out;
};
function imageLoadProbePlugin() {
	return new Plugin({ view(editorView) {
		const probe = (src) => {
			if (imageLoadStatus.has(src)) return;
			imageLoadStatus.set(src, "loading");
			const probeImg = new Image();
			const finish = (status) => {
				imageLoadStatus.set(src, status);
				editorView.dispatch(editorView.state.tr.setMeta(IMAGE_LOAD_META, status));
			};
			probeImg.onload = () => finish("ok");
			probeImg.onerror = () => finish("error");
			probeImg.src = src;
		};
		const scanDoc = () => {
			const rootUrl = getDocumentMetadata(editorView.state).typoraRootUrl;
			editorView.state.doc.descendants((node) => {
				if (!node.isTextblock) return true;
				const text = node.textContent;
				IMAGE_RE.lastIndex = 0;
				let m;
				while (m = IMAGE_RE.exec(text)) {
					const src = m[2];
					if (src) probe(resolveImagePreviewSrc(src, rootUrl));
				}
				return false;
			});
		};
		scanDoc();
		return {
			update: () => scanDoc(),
			destroy: () => {}
		};
	} });
}
function imageFileInputPlugin() {
	return new Plugin({ view(editorView) {
		const onPick = (e) => {
			const evt = e;
			const trigger = evt.target;
			if (!trigger?.classList?.contains("file-input")) return;
			const file = evt.detail?.files?.[0];
			if (!file) return;
			const posStr = trigger.getAttribute("data-pos");
			if (!posStr) return;
			const pos = Number(posStr);
			if (!Number.isFinite(pos)) return;
			const url = URL.createObjectURL(file);
			editorView.dispatch(editorView.state.tr.insertText(url, pos));
		};
		editorView.dom.addEventListener("file-input-pick", onPick);
		return { destroy() {
			editorView.dom.removeEventListener("file-input-pick", onPick);
		} };
	} });
}
function closeDelimText$1(mark) {
	const src = String(mark.attrs.src ?? "");
	const title = mark.attrs.title;
	return title ? `](${src} "${title.replace(/"/g, "\\\"")}")` : `](${src})`;
}
var image = {
	name: "image",
	marks: { image: {
		attrs: {
			src: { default: "" },
			title: { default: null }
		},
		inclusive: false,
		parseDOM: [{
			tag: "span[data-image-mark]",
			getAttrs: (el) => ({
				src: el.getAttribute("data-src") ?? "",
				title: el.getAttribute("data-title")
			})
		}],
		toDOM: (mark) => {
			const { src, title } = mark.attrs;
			const attrs = { "data-image-mark": "" };
			if (src) attrs["data-src"] = src;
			if (title) attrs["data-title"] = title;
			return [
				"span",
				attrs,
				0
			];
		}
	} },
	parserTokens: { image: (state, tok, schema) => {
		const src = tok.attrGet("src") ?? "";
		const title = tok.attrGet("title");
		const alt = tok.content;
		state.addText("![");
		state.openMark(schema.marks.image.create({
			src,
			title: title || null
		}));
		state.addText(alt);
		state.closeMarkType(schema.marks.image);
		state.addText(title ? `](${src} "${title}")` : `](${src})`);
	} },
	markDelims: { image: {
		open: "",
		close: ""
	} },
	plugins: () => [imageFileInputPlugin(), imageLoadProbePlugin()],
	inline: {
		priority: 2.5,
		scan: scan$2,
		markNames: ["image"],
		extRanges: (parent) => {
			const ranges = [];
			const imageType = parent.type.schema.marks.image;
			if (!imageType) return ranges;
			let start = -1;
			let currentMark = null;
			let off = 0;
			const flush = (end) => {
				if (start < 0 || !currentMark) return;
				ranges.push([start - 2, end + closeDelimText$1(currentMark).length]);
				start = -1;
				currentMark = null;
			};
			parent.forEach((child) => {
				if (child.isText) {
					const m = child.marks.find((mk) => mk.type === imageType) ?? null;
					if (m) {
						if (start < 0) {
							start = off;
							currentMark = m;
						} else if (currentMark && !m.eq(currentMark)) {
							flush(off);
							start = off;
							currentMark = m;
						}
					} else flush(off);
				}
				off += child.nodeSize;
			});
			flush(off);
			return ranges;
		}
	}
};
//#endregion
//#region src/features/link.ts
var LINK_RE = /\[([^\]]*?)\]\(([^\s)]*)(?:\s+"([^"]*)")?\)/g;
var scan$1 = (text, consumed) => {
	const out = [];
	LINK_RE.lastIndex = 0;
	let m;
	while (m = LINK_RE.exec(text)) {
		const fullStart = m.index;
		const fullEnd = fullStart + m[0].length;
		const openFrom = fullStart;
		const openTo = fullStart + 1;
		const contentFrom = openTo;
		const contentTo = openTo + m[1].length;
		const closeFrom = contentTo;
		const closeTo = fullEnd;
		let blocked = false;
		for (let i = openFrom; i < openTo; i++) if (consumed[i]) {
			blocked = true;
			break;
		}
		if (!blocked) {
			for (let i = closeFrom; i < closeTo; i++) if (consumed[i]) {
				blocked = true;
				break;
			}
		}
		if (blocked) continue;
		markConsumed(consumed, openFrom, openTo);
		markConsumed(consumed, closeFrom, closeTo);
		const href = m[2];
		const title = m[3] ?? null;
		const span = {
			type: "link",
			from: contentFrom,
			to: contentTo,
			openFrom,
			openTo,
			closeFrom,
			closeTo,
			attrs: {
				href,
				title
			}
		};
		if (m[1] === "") {
			if (href === "" || title !== null) span.delimRanges = [{
				from: openFrom,
				to: openTo,
				forceVisible: true
			}, {
				from: closeFrom,
				to: closeTo,
				forceVisible: true
			}];
			else {
				const hrefStart = closeFrom + 2;
				const hrefEnd = closeTo - 1;
				span.delimRanges = [
					{
						from: openFrom,
						to: openTo,
						forceVisible: true
					},
					{
						from: closeFrom,
						to: hrefStart,
						forceVisible: true
					},
					{
						from: hrefEnd,
						to: closeTo,
						forceVisible: true
					}
				];
				span.extraDecorations = [{
					from: hrefStart,
					to: hrefEnd,
					nodeName: "a",
					attrs: { href }
				}];
			}
		}
		out.push(span);
	}
	return out;
};
function closeDelimText(mark) {
	const href = String(mark.attrs.href ?? "");
	const title = mark.attrs.title;
	return title ? `](${href} "${title.replace(/"/g, "\\\"")}")` : `](${href})`;
}
var link = {
	name: "link",
	marks: { link: {
		attrs: {
			href: {},
			title: { default: null }
		},
		inclusive: false,
		parseDOM: [{
			tag: "a[href]",
			getAttrs: (el) => ({
				href: el.getAttribute("href"),
				title: el.getAttribute("title")
			})
		}],
		toDOM: (mark) => {
			const { href, title } = mark.attrs;
			return [
				"a",
				title ? {
					href,
					title
				} : { href },
				0
			];
		}
	} },
	parserTokens: {
		link_open: (state, tok, schema) => {
			const href = tok.attrGet("href") ?? "";
			const title = tok.attrGet("title");
			state.addText("[");
			state.openMark(schema.marks.link.create({
				href,
				title: title || null
			}));
		},
		link_close: (state, _tok, schema) => {
			const mark = state.topMark(schema.marks.link);
			state.closeMarkType(schema.marks.link);
			if (mark) state.addText(closeDelimText(mark));
		}
	},
	markDelims: { link: {
		open: "",
		close: ""
	} },
	inline: {
		priority: 3,
		scan: scan$1,
		markNames: ["link"],
		extRanges: (parent) => {
			const ranges = [];
			const linkType = parent.type.schema.marks.link;
			if (!linkType) return ranges;
			let start = -1;
			let currentMark = null;
			let off = 0;
			const flush = (end) => {
				if (start < 0 || !currentMark) return;
				ranges.push([start - 1, end + closeDelimText(currentMark).length]);
				start = -1;
				currentMark = null;
			};
			parent.forEach((child) => {
				if (child.isText) {
					const m = child.marks.find((mk) => mk.type === linkType) ?? null;
					if (m) {
						if (start < 0) {
							start = off;
							currentMark = m;
						} else if (currentMark && !m.eq(currentMark)) {
							flush(off);
							start = off;
							currentMark = m;
						}
					} else flush(off);
				}
				off += child.nodeSize;
			});
			flush(off);
			return ranges;
		}
	}
};
//#endregion
//#region src/features/ref-def.ts
var REF_DRAFT_RE = /^\[([^\]]+)\]:/;
var REF_COMMIT_RE = /^\[([^\]]+)\]:\s+(\S+)(?:\s+"([^"]*)")?\s*$/;
function refDraftPlugin() {
	return new Plugin({ props: { decorations(state) {
		const decos = [];
		const cursor = state.selection.empty ? state.selection.from : -1;
		state.doc.descendants((node, pos) => {
			if (node.type.name === "paragraph") {
				const text = node.textContent;
				const m = REF_DRAFT_RE.exec(text);
				if (!m) return false;
				const start = pos + 1;
				const labelLen = m[1].length;
				const openBracket = start;
				const closeBracket = start + 1 + labelLen;
				const colonEnd = closeBracket + 2;
				decos.push(Decoration.inline(openBracket, openBracket + 1, { class: "syntax-hint-italic" }));
				decos.push(Decoration.inline(closeBracket, colonEnd, { class: "syntax-hint-italic" }));
				return false;
			}
			if (node.type.name !== "link_def") return true;
			const linkDefStart = pos;
			const linkDefEnd = pos + node.nodeSize;
			const cursorInside = cursor > linkDefStart && cursor < linkDefEnd;
			let childOffset = pos + 1;
			node.forEach((child) => {
				const childStart = childOffset;
				const childEnd = childStart + child.nodeSize;
				const empty = child.content.size === 0;
				if (empty && child.type.name === "ref_url") decos.push(Decoration.node(childStart, childEnd, { "data-placeholder": "input link url here" }));
				if (empty && child.type.name === "ref_title" && cursorInside) decos.push(Decoration.node(childStart, childEnd, { "data-placeholder": "title (optional)" }));
				childOffset = childEnd;
			});
			return false;
		});
		return decos.length > 0 ? DecorationSet.create(state.doc, decos) : DecorationSet.empty;
	} } });
}
function buildLinkDef(schema, label, href, title) {
	return schema.nodes.link_def.createChecked(null, [
		schema.nodes.ref_label.create(null, label ? [schema.text(label)] : []),
		schema.nodes.ref_url.create(null, href ? [schema.text(href)] : []),
		schema.nodes.ref_title.create(null, title ? [schema.text(title)] : [])
	]);
}
var refDef = {
	name: "ref-def",
	nodes: {
		link_def: {
			group: "block",
			content: "ref_label ref_url ref_title",
			defining: true,
			isolating: true,
			parseDOM: [{ tag: "ref-def" }],
			toDOM: () => ["ref-def", 0]
		},
		ref_label: {
			content: "text*",
			defining: true,
			parseDOM: [{ tag: "ref-label" }],
			toDOM: () => ["ref-label", 0]
		},
		ref_url: {
			content: "text*",
			defining: true,
			parseDOM: [{ tag: "ref-url" }],
			toDOM: () => ["ref-url", 0]
		},
		ref_title: {
			content: "text*",
			defining: true,
			parseDOM: [{ tag: "ref-title" }],
			toDOM: () => ["ref-title", 0]
		}
	},
	plugins: () => [refDraftPlugin()],
	keymap: (schema) => ({ Enter: (state, dispatch) => {
		const sel = state.selection;
		if (!sel.empty) return false;
		const $from = sel.$from;
		if ($from.parent.type.name === "paragraph") {
			const text = $from.parent.textContent;
			const m = REF_COMMIT_RE.exec(text);
			if (!m) return false;
			if (dispatch) {
				const [, label, href, title] = m;
				const node = buildLinkDef(schema, label, href, title || "");
				const paraStart = $from.before();
				const paraEnd = $from.after();
				const tr = state.tr;
				tr.replaceWith(paraStart, paraEnd, [node, schema.nodes.paragraph.create()]);
				const labelInside = paraStart + 2;
				tr.setSelection(TextSelection.create(tr.doc, labelInside));
				dispatch(tr);
			}
			return true;
		}
		for (let d = $from.depth; d >= 0; d--) {
			const node = $from.node(d);
			if (node.type.name !== "link_def") continue;
			const labelEmpty = node.child(0).content.size === 0;
			const urlEmpty = node.child(1).content.size === 0;
			const titleEmpty = node.child(2).content.size === 0;
			if (labelEmpty && urlEmpty && titleEmpty) {
				if (dispatch) {
					const tr = state.tr;
					const linkDefStart = $from.before(d);
					const linkDefEnd = $from.after(d);
					tr.replaceWith(linkDefStart, linkDefEnd, schema.nodes.paragraph.create());
					tr.setSelection(TextSelection.create(tr.doc, linkDefStart + 1));
					dispatch(tr);
				}
				return true;
			}
			if (urlEmpty) return false;
			if (dispatch) {
				const linkDefEnd = $from.after(d);
				const fresh = buildLinkDef(schema, "", "", "");
				const tr = state.tr;
				tr.insert(linkDefEnd, fresh);
				const newLabelInside = linkDefEnd + 2;
				tr.setSelection(TextSelection.create(tr.doc, newLabelInside));
				dispatch(tr);
			}
			return true;
		}
		return false;
	} }),
	blockHandlers: { link_def: (state, node) => {
		const label = node.child(0).textContent;
		const href = node.child(1).textContent;
		const title = node.child(2).textContent;
		state.write(`[${label}]: ${href}`);
		if (title) state.out += ` "${title}"`;
		state.closeBlock(node);
	} }
};
//#endregion
//#region src/features/list.ts
function liftNestedEmptyItemToBulletless(li, paragraph) {
	return (state, dispatch) => {
		const { $from, empty } = state.selection;
		if (!empty) return false;
		const p = $from.parent;
		if (p.type !== paragraph || p.content.size !== 0) return false;
		const liDepth = $from.depth - 1;
		if (liDepth < 1) return false;
		const liNode = $from.node(liDepth);
		if (liNode.type !== li) return false;
		if (liNode.childCount !== 1) return false;
		const listDepth = liDepth - 1;
		if (listDepth < 1) return false;
		const listNode = $from.node(listDepth);
		if (listNode.type.name !== "bullet_list" && listNode.type.name !== "ordered_list") return false;
		const outerLiDepth = listDepth - 1;
		if (outerLiDepth < 1) return false;
		if ($from.node(outerLiDepth).type !== li) return false;
		const liStart = $from.before(liDepth);
		const liEnd = $from.after(liDepth);
		const outerLiEnd = $from.after(outerLiDepth);
		if (dispatch) {
			const tr = state.tr;
			if (listNode.childCount === 1) tr.delete($from.before(listDepth), $from.after(listDepth));
			else tr.delete(liStart, liEnd);
			const insertPos = tr.mapping.map(outerLiEnd) - 1;
			const newPara = paragraph.createAndFill();
			if (!newPara) return false;
			tr.insert(insertPos, newPara);
			tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
			tr.scrollIntoView();
			dispatch(tr);
		}
		return true;
	};
}
function liftBulletlessParagraphToListItem(li) {
	return (state, dispatch) => {
		const { $from, empty } = state.selection;
		if (!empty) return false;
		const p = $from.parent;
		if (p.type.name !== "paragraph" || p.content.size !== 0) return false;
		const pDepth = $from.depth;
		const liDepth = pDepth - 1;
		if (liDepth < 1) return false;
		if ($from.node(liDepth).type !== li) return false;
		if ($from.index(liDepth) === 0) return false;
		const listDepth = liDepth - 1;
		if (listDepth < 1) return false;
		const listNode = $from.node(listDepth);
		if (listNode.type.name !== "bullet_list" && listNode.type.name !== "ordered_list") return false;
		const pStart = $from.before(pDepth);
		const pEnd = $from.after(pDepth);
		const outerLiEnd = $from.after(liDepth);
		if (dispatch) {
			const tr = state.tr;
			tr.delete(pStart, pEnd);
			const newLi = li.createAndFill();
			if (!newLi) return false;
			const insertPos = tr.mapping.map(outerLiEnd);
			tr.insert(insertPos, newLi);
			tr.setSelection(TextSelection.create(tr.doc, insertPos + 2));
			tr.scrollIntoView();
			dispatch(tr);
		}
		return true;
	};
}
function propagateEmptyLoneTopLevelListItem(li) {
	return (state, dispatch) => {
		const { $from, empty } = state.selection;
		if (!empty) return false;
		if (!$from.parent.isTextblock || $from.parent.content.size !== 0) return false;
		let liDepth = -1;
		for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === li) {
			liDepth = d;
			break;
		}
		if (liDepth === -1) return false;
		const ulDepth = liDepth - 1;
		if (ulDepth !== 1) return false;
		if ($from.index(ulDepth) !== 0) return false;
		if (dispatch) {
			const liEnd = $from.after(liDepth);
			const newLi = li.createAndFill();
			if (!newLi) return false;
			const tr = state.tr.insert(liEnd, newLi);
			tr.setSelection(TextSelection.create(tr.doc, liEnd + 2));
			dispatch(tr);
		}
		return true;
	};
}
function backspaceJumpIntoPrevList() {
	return (state, dispatch) => {
		const { $from, empty } = state.selection;
		if (!empty) return false;
		if ($from.depth !== 1) return false;
		const para = $from.parent;
		if (!para.isTextblock) return false;
		if (para.content.size !== 0) return false;
		const idx = $from.index(0);
		if (idx === 0) return false;
		const prev = state.doc.child(idx - 1);
		if (prev.type.name !== "bullet_list" && prev.type.name !== "ordered_list") return false;
		if (dispatch) {
			const paraStart = $from.before();
			const paraEnd = $from.after();
			const tr = state.tr.delete(paraStart, paraEnd);
			const $inside = tr.doc.resolve(paraStart - 1);
			const target = Selection.findFrom($inside, -1, true);
			if (target) tr.setSelection(target);
			dispatch(tr);
		}
		return true;
	};
}
var list = {
	name: "bullet_list",
	inputRules: (schema) => [wrappingInputRule(/^[*+-]\s$/, schema.nodes.bullet_list), wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list, (match) => ({ start: Number(match[1]) }), (match, node) => node.childCount + node.attrs.start === Number(match[1]))],
	keymap: (schema) => {
		const li = schema.nodes.list_item;
		const p = schema.nodes.paragraph;
		return {
			Enter: chainCommands(liftNestedEmptyItemToBulletless(li, p), liftBulletlessParagraphToListItem(li), propagateEmptyLoneTopLevelListItem(li), splitListItem(li), liftListItem(li)),
			Tab: sinkListItem(li),
			Backspace: backspaceJumpIntoPrevList()
		};
	}
};
//#endregion
//#region node_modules/katex/dist/katex.mjs
/**
* This is the ParseError class, which is the main error thrown by KaTeX
* functions when something has gone wrong. This is used to distinguish internal
* errors from errors in the expression that the user provided.
*
* If possible, a caller should provide a Token or ParseNode with information
* about where in the source string the problem occurred.
*/
var ParseError = class ParseError extends Error {
	constructor(message, token) {
		var error = "KaTeX parse error: " + message;
		var start;
		var end;
		var loc = token && token.loc;
		if (loc && loc.start <= loc.end) {
			var input = loc.lexer.input;
			start = loc.start;
			end = loc.end;
			if (start === input.length) error += " at end of input: ";
			else error += " at position " + (start + 1) + ": ";
			var underlined = input.slice(start, end).replace(/[^]/g, "$&̲");
			var left;
			if (start > 15) left = "…" + input.slice(start - 15, start);
			else left = input.slice(0, start);
			var right;
			if (end + 15 < input.length) right = input.slice(end, end + 15) + "…";
			else right = input.slice(end);
			error += left + underlined + right;
		}
		super(error);
		this.name = "ParseError";
		this.position = void 0;
		this.length = void 0;
		this.rawMessage = void 0;
		Object.setPrototypeOf(this, ParseError.prototype);
		this.position = start;
		if (start != null && end != null) this.length = end - start;
		this.rawMessage = message;
	}
};
/**
* This file contains a list of utility functions which are useful in other
* files.
*/
var uppercase = /([A-Z])/g;
var hyphenate = (str) => str.replace(uppercase, "-$1").toLowerCase();
var ESCAPE_LOOKUP = {
	"&": "&amp;",
	">": "&gt;",
	"<": "&lt;",
	"\"": "&quot;",
	"'": "&#x27;"
};
var ESCAPE_REGEX = /[&><"']/g;
/**
* Escapes text to prevent scripting attacks.
*/
var escape = (text) => String(text).replace(ESCAPE_REGEX, (match) => ESCAPE_LOOKUP[match]);
/**
* Sometimes we want to pull out the innermost element of a group. In most
* cases, this will just be the group itself, but when ordgroups and colors have
* a single element, we want to pull that out.
*/
var getBaseElem = (group) => {
	if (group.type === "ordgroup") {
		if (group.body.length === 1) return getBaseElem(group.body[0]);
		else return group;
	} else if (group.type === "color") {
		if (group.body.length === 1) return getBaseElem(group.body[0]);
		else return group;
	} else if (group.type === "font") return getBaseElem(group.body);
	else return group;
};
var characterNodesTypes = /* @__PURE__ */ new Set([
	"mathord",
	"textord",
	"atom"
]);
/**
* TeXbook algorithms often reference "character boxes", which are simply groups
* with a single character in them. To decide if something is a character box,
* we find its innermost group, and see if it is a single character.
*/
var isCharacterBox = (group) => characterNodesTypes.has(getBaseElem(group).type);
/**
* Return the protocol of a URL, or "_relative" if the URL does not specify a
* protocol (and thus is relative), or `null` if URL has invalid protocol
* (so should be outright rejected).
*/
var protocolFromUrl = (url) => {
	var protocol = /^[\x00-\x20]*([^\\/#?]*?)(:|&#0*58|&#x0*3a|&colon)/i.exec(url);
	if (!protocol) return "_relative";
	if (protocol[2] !== ":") return null;
	if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*$/.test(protocol[1])) return null;
	return protocol[1].toLowerCase();
};
var SETTINGS_SCHEMA = {
	displayMode: {
		type: "boolean",
		description: "Render math in display mode, which puts the math in display style (so \\int and \\sum are large, for example), and centers the math on the page on its own line.",
		cli: "-d, --display-mode"
	},
	output: {
		type: { enum: [
			"htmlAndMathml",
			"html",
			"mathml"
		] },
		description: "Determines the markup language of the output.",
		cli: "-F, --format <type>"
	},
	leqno: {
		type: "boolean",
		description: "Render display math in leqno style (left-justified tags)."
	},
	fleqn: {
		type: "boolean",
		description: "Render display math flush left."
	},
	throwOnError: {
		type: "boolean",
		default: true,
		cli: "-t, --no-throw-on-error",
		cliDescription: "Render errors (in the color given by --error-color) instead of throwing a ParseError exception when encountering an error."
	},
	errorColor: {
		type: "string",
		default: "#cc0000",
		cli: "-c, --error-color <color>",
		cliDescription: "A color string given in the format 'rgb' or 'rrggbb' (no #). This option determines the color of errors rendered by the -t option.",
		cliProcessor: (color) => "#" + color
	},
	macros: {
		type: "object",
		cli: "-m, --macro <def>",
		cliDescription: "Define custom macro of the form '\\foo:expansion' (use multiple -m arguments for multiple macros).",
		cliDefault: [],
		cliProcessor: (def, defs) => {
			defs.push(def);
			return defs;
		}
	},
	minRuleThickness: {
		type: "number",
		description: "Specifies a minimum thickness, in ems, for fraction lines, `\\sqrt` top lines, `{array}` vertical lines, `\\hline`, `\\hdashline`, `\\underline`, `\\overline`, and the borders of `\\fbox`, `\\boxed`, and `\\fcolorbox`.",
		processor: (t) => Math.max(0, t),
		cli: "--min-rule-thickness <size>",
		cliProcessor: parseFloat
	},
	colorIsTextColor: {
		type: "boolean",
		description: "Makes \\color behave like LaTeX's 2-argument \\textcolor, instead of LaTeX's one-argument \\color mode change.",
		cli: "-b, --color-is-text-color"
	},
	strict: {
		type: [
			{ enum: [
				"warn",
				"ignore",
				"error"
			] },
			"boolean",
			"function"
		],
		description: "Turn on strict / LaTeX faithfulness mode, which throws an error if the input uses features that are not supported by LaTeX.",
		cli: "-S, --strict",
		cliDefault: false
	},
	trust: {
		type: ["boolean", "function"],
		description: "Trust the input, enabling all HTML features such as \\url.",
		cli: "-T, --trust"
	},
	maxSize: {
		type: "number",
		default: Infinity,
		description: "If non-zero, all user-specified sizes, e.g. in \\rule{500em}{500em}, will be capped to maxSize ems. Otherwise, elements and spaces can be arbitrarily large",
		processor: (s) => Math.max(0, s),
		cli: "-s, --max-size <n>",
		cliProcessor: parseInt
	},
	maxExpand: {
		type: "number",
		default: 1e3,
		description: "Limit the number of macro expansions to the specified number, to prevent e.g. infinite macro loops. If set to Infinity, the macro expander will try to fully expand as in LaTeX.",
		processor: (n) => Math.max(0, n),
		cli: "-e, --max-expand <n>",
		cliProcessor: (n) => n === "Infinity" ? Infinity : parseInt(n)
	},
	globalGroup: {
		type: "boolean",
		cli: false
	}
};
function getImplicitDefault(type) {
	if (typeof type !== "string") return type.enum[0];
	switch (type) {
		case "boolean": return false;
		case "string": return "";
		case "number": return 0;
		case "object": return {};
		default: throw new Error("Unexpected schema type; settings must declare an explicit default.");
	}
}
function getDefaultValue(schema) {
	if (schema.default !== void 0) return schema.default;
	return getImplicitDefault(Array.isArray(schema.type) ? schema.type[0] : schema.type);
}
function applySetting(target, prop, options, schema) {
	var optionValue = options[prop];
	target[prop] = optionValue !== void 0 ? schema.processor ? schema.processor(optionValue) : optionValue : getDefaultValue(schema);
}
/**
* The main Settings object
*
* The current options stored are:
*  - displayMode: Whether the expression should be typeset as inline math
*                 (false, the default), meaning that the math starts in
*                 \textstyle and is placed in an inline-block); or as display
*                 math (true), meaning that the math starts in \displaystyle
*                 and is placed in a block with vertical margin.
*/
var Settings = class {
	constructor(options) {
		if (options === void 0) options = {};
		this.displayMode = void 0;
		this.output = void 0;
		this.leqno = void 0;
		this.fleqn = void 0;
		this.throwOnError = void 0;
		this.errorColor = void 0;
		this.macros = void 0;
		this.minRuleThickness = void 0;
		this.colorIsTextColor = void 0;
		this.strict = void 0;
		this.trust = void 0;
		this.maxSize = void 0;
		this.maxExpand = void 0;
		this.globalGroup = void 0;
		options = options || {};
		for (var prop of Object.keys(SETTINGS_SCHEMA)) {
			var schema = SETTINGS_SCHEMA[prop];
			if (schema) applySetting(this, prop, options, schema);
		}
	}
	/**
	* Report nonstrict (non-LaTeX-compatible) input.
	* Can safely not be called if `this.strict` is false in JavaScript.
	*/
	reportNonstrict(errorCode, errorMsg, token) {
		var strict = this.strict;
		if (typeof strict === "function") strict = strict(errorCode, errorMsg, token);
		if (!strict || strict === "ignore") return;
		else if (strict === true || strict === "error") throw new ParseError("LaTeX-incompatible input and strict mode is set to 'error': " + (errorMsg + " [" + errorCode + "]"), token);
		else if (strict === "warn") typeof console !== "undefined" && console.warn("LaTeX-incompatible input and strict mode is set to 'warn': " + (errorMsg + " [" + errorCode + "]"));
		else typeof console !== "undefined" && console.warn("LaTeX-incompatible input and strict mode is set to " + ("unrecognized '" + strict + "': " + errorMsg + " [" + errorCode + "]"));
	}
	/**
	* Check whether to apply strict (LaTeX-adhering) behavior for unusual
	* input (like `\\`).  Unlike `nonstrict`, will not throw an error;
	* instead, "error" translates to a return value of `true`, while "ignore"
	* translates to a return value of `false`.  May still print a warning:
	* "warn" prints a warning and returns `false`.
	* This is for the second category of `errorCode`s listed in the README.
	*/
	useStrictBehavior(errorCode, errorMsg, token) {
		var strict = this.strict;
		if (typeof strict === "function") try {
			strict = strict(errorCode, errorMsg, token);
		} catch (error) {
			strict = "error";
		}
		if (!strict || strict === "ignore") return false;
		else if (strict === true || strict === "error") return true;
		else if (strict === "warn") {
			typeof console !== "undefined" && console.warn("LaTeX-incompatible input and strict mode is set to 'warn': " + (errorMsg + " [" + errorCode + "]"));
			return false;
		} else {
			typeof console !== "undefined" && console.warn("LaTeX-incompatible input and strict mode is set to " + ("unrecognized '" + strict + "': " + errorMsg + " [" + errorCode + "]"));
			return false;
		}
	}
	/**
	* Check whether to test potentially dangerous input, and return
	* `true` (trusted) or `false` (untrusted).  The sole argument `context`
	* should be an object with `command` field specifying the relevant LaTeX
	* command (as a string starting with `\`), and any other arguments, etc.
	* If `context` has a `url` field, a `protocol` field will automatically
	* get added by this function (changing the specified object).
	*/
	isTrusted(context) {
		if ("url" in context && context.url && !context.protocol) {
			var protocol = protocolFromUrl(context.url);
			if (protocol == null) return false;
			context.protocol = protocol;
		}
		var trust = typeof this.trust === "function" ? this.trust(context) : this.trust;
		return Boolean(trust);
	}
};
/**
* This file contains information and classes for the various kinds of styles
* used in TeX. It provides a generic `Style` class, which holds information
* about a specific style. It then provides instances of all the different kinds
* of styles possible, and provides functions to move between them and get
* information about them.
*/
/**
* The main style class. Contains a unique id for the style, a size (which is
* the same for cramped and uncramped version of a style), and a cramped flag.
*/
var Style = class {
	constructor(id, size, cramped) {
		this.id = void 0;
		this.size = void 0;
		this.cramped = void 0;
		this.id = id;
		this.size = size;
		this.cramped = cramped;
	}
	/**
	* Get the style of a superscript given a base in the current style.
	*/
	sup() {
		return styles[sup[this.id]];
	}
	/**
	* Get the style of a subscript given a base in the current style.
	*/
	sub() {
		return styles[sub[this.id]];
	}
	/**
	* Get the style of a fraction numerator given the fraction in the current
	* style.
	*/
	fracNum() {
		return styles[fracNum[this.id]];
	}
	/**
	* Get the style of a fraction denominator given the fraction in the current
	* style.
	*/
	fracDen() {
		return styles[fracDen[this.id]];
	}
	/**
	* Get the cramped version of a style (in particular, cramping a cramped style
	* doesn't change the style).
	*/
	cramp() {
		return styles[cramp[this.id]];
	}
	/**
	* Get a text or display version of this style.
	*/
	text() {
		return styles[text$1[this.id]];
	}
	/**
	* Return true if this style is tightly spaced (scriptstyle/scriptscriptstyle)
	*/
	isTight() {
		return this.size >= 2;
	}
};
var D = 0;
var Dc = 1;
var T = 2;
var Tc = 3;
var S = 4;
var Sc = 5;
var SS = 6;
var SSc = 7;
var styles = [
	new Style(D, 0, false),
	new Style(Dc, 0, true),
	new Style(T, 1, false),
	new Style(Tc, 1, true),
	new Style(S, 2, false),
	new Style(Sc, 2, true),
	new Style(SS, 3, false),
	new Style(SSc, 3, true)
];
var sup = [
	S,
	Sc,
	S,
	Sc,
	SS,
	SSc,
	SS,
	SSc
];
var sub = [
	Sc,
	Sc,
	Sc,
	Sc,
	SSc,
	SSc,
	SSc,
	SSc
];
var fracNum = [
	T,
	Tc,
	S,
	Sc,
	SS,
	SSc,
	SS,
	SSc
];
var fracDen = [
	Tc,
	Tc,
	Sc,
	Sc,
	SSc,
	SSc,
	SSc,
	SSc
];
var cramp = [
	Dc,
	Dc,
	Tc,
	Tc,
	Sc,
	Sc,
	SSc,
	SSc
];
var text$1 = [
	D,
	Dc,
	T,
	Tc,
	T,
	Tc,
	T,
	Tc
];
var Style$1 = {
	DISPLAY: styles[D],
	TEXT: styles[T],
	SCRIPT: styles[S],
	SCRIPTSCRIPT: styles[SS]
};
/**
* Unicode block data for the families of scripts we support in \text{}.
* Scripts only need to appear here if they do not have font metrics.
*/
var scriptData = [
	{
		name: "latin",
		blocks: [[256, 591], [768, 879]]
	},
	{
		name: "cyrillic",
		blocks: [[1024, 1279]]
	},
	{
		name: "armenian",
		blocks: [[1328, 1423]]
	},
	{
		name: "brahmic",
		blocks: [[2304, 4255]]
	},
	{
		name: "georgian",
		blocks: [[4256, 4351]]
	},
	{
		name: "cjk",
		blocks: [
			[12288, 12543],
			[19968, 40879],
			[65280, 65376]
		]
	},
	{
		name: "hangul",
		blocks: [[44032, 55215]]
	}
];
/**
* Given a codepoint, return the name of the script or script family
* it is from, or null if it is not part of a known block
*/
function scriptFromCodepoint(codepoint) {
	for (var i = 0; i < scriptData.length; i++) {
		var script = scriptData[i];
		for (var _i = 0; _i < script.blocks.length; _i++) {
			var block = script.blocks[_i];
			if (codepoint >= block[0] && codepoint <= block[1]) return script.name;
		}
	}
	return null;
}
/**
* A flattened version of all the supported blocks in a single array.
* This is an optimization to make supportedCodepoint() fast.
*/
var allBlocks = [];
scriptData.forEach((s) => s.blocks.forEach((b) => allBlocks.push(...b)));
/**
* Given a codepoint, return true if it falls within one of the
* scripts or script families defined above and false otherwise.
*
* Micro benchmarks shows that this is faster than
* /[\u3000-\u30FF\u4E00-\u9FAF\uFF00-\uFF60\uAC00-\uD7AF\u0900-\u109F]/.test()
* in Firefox, Chrome and Node.
*/
function supportedCodepoint(codepoint) {
	for (var i = 0; i < allBlocks.length; i += 2) if (codepoint >= allBlocks[i] && codepoint <= allBlocks[i + 1]) return true;
	return false;
}
/**
* This file provides support to domTree.js and delimiter.js.
* It's a storehouse of path geometry for SVG images.
*/
var doubleBrushStroke = (svgPath) => svgPath + " " + svgPath;
var hLinePad = 80;
var sqrtMain = function sqrtMain(extraVinculum, hLinePad) {
	return "M95," + (622 + extraVinculum + hLinePad) + "\nc-2.7,0,-7.17,-2.7,-13.5,-8c-5.8,-5.3,-9.5,-10,-9.5,-14\nc0,-2,0.3,-3.3,1,-4c1.3,-2.7,23.83,-20.7,67.5,-54\nc44.2,-33.3,65.8,-50.3,66.5,-51c1.3,-1.3,3,-2,5,-2c4.7,0,8.7,3.3,12,10\ns173,378,173,378c0.7,0,35.3,-71,104,-213c68.7,-142,137.5,-285,206.5,-429\nc69,-144,104.5,-217.7,106.5,-221\nl" + extraVinculum / 2.075 + " -" + extraVinculum + "\nc5.3,-9.3,12,-14,20,-14\nH400000v" + (40 + extraVinculum) + "H845.2724\ns-225.272,467,-225.272,467s-235,486,-235,486c-2.7,4.7,-9,7,-19,7\nc-6,0,-10,-1,-12,-3s-194,-422,-194,-422s-65,47,-65,47z\nM" + (834 + extraVinculum) + " " + hLinePad + "h400000v" + (40 + extraVinculum) + "h-400000z";
};
var sqrtSize1 = function sqrtSize1(extraVinculum, hLinePad) {
	return "M263," + (601 + extraVinculum + hLinePad) + "c0.7,0,18,39.7,52,119\nc34,79.3,68.167,158.7,102.5,238c34.3,79.3,51.8,119.3,52.5,120\nc340,-704.7,510.7,-1060.3,512,-1067\nl" + extraVinculum / 2.084 + " -" + extraVinculum + "\nc4.7,-7.3,11,-11,19,-11\nH40000v" + (40 + extraVinculum) + "H1012.3\ns-271.3,567,-271.3,567c-38.7,80.7,-84,175,-136,283c-52,108,-89.167,185.3,-111.5,232\nc-22.3,46.7,-33.8,70.3,-34.5,71c-4.7,4.7,-12.3,7,-23,7s-12,-1,-12,-1\ns-109,-253,-109,-253c-72.7,-168,-109.3,-252,-110,-252c-10.7,8,-22,16.7,-34,26\nc-22,17.3,-33.3,26,-34,26s-26,-26,-26,-26s76,-59,76,-59s76,-60,76,-60z\nM" + (1001 + extraVinculum) + " " + hLinePad + "h400000v" + (40 + extraVinculum) + "h-400000z";
};
var sqrtSize2 = function sqrtSize2(extraVinculum, hLinePad) {
	return "M983 " + (10 + extraVinculum + hLinePad) + "\nl" + extraVinculum / 3.13 + " -" + extraVinculum + "\nc4,-6.7,10,-10,18,-10 H400000v" + (40 + extraVinculum) + "\nH1013.1s-83.4,268,-264.1,840c-180.7,572,-277,876.3,-289,913c-4.7,4.7,-12.7,7,-24,7\ns-12,0,-12,0c-1.3,-3.3,-3.7,-11.7,-7,-25c-35.3,-125.3,-106.7,-373.3,-214,-744\nc-10,12,-21,25,-33,39s-32,39,-32,39c-6,-5.3,-15,-14,-27,-26s25,-30,25,-30\nc26.7,-32.7,52,-63,76,-91s52,-60,52,-60s208,722,208,722\nc56,-175.3,126.3,-397.3,211,-666c84.7,-268.7,153.8,-488.2,207.5,-658.5\nc53.7,-170.3,84.5,-266.8,92.5,-289.5z\nM" + (1001 + extraVinculum) + " " + hLinePad + "h400000v" + (40 + extraVinculum) + "h-400000z";
};
var sqrtSize3 = function sqrtSize3(extraVinculum, hLinePad) {
	return "M424," + (2398 + extraVinculum + hLinePad) + "\nc-1.3,-0.7,-38.5,-172,-111.5,-514c-73,-342,-109.8,-513.3,-110.5,-514\nc0,-2,-10.7,14.3,-32,49c-4.7,7.3,-9.8,15.7,-15.5,25c-5.7,9.3,-9.8,16,-12.5,20\ns-5,7,-5,7c-4,-3.3,-8.3,-7.7,-13,-13s-13,-13,-13,-13s76,-122,76,-122s77,-121,77,-121\ns209,968,209,968c0,-2,84.7,-361.7,254,-1079c169.3,-717.3,254.7,-1077.7,256,-1081\nl" + extraVinculum / 4.223 + " -" + extraVinculum + "c4,-6.7,10,-10,18,-10 H400000\nv" + (40 + extraVinculum) + "H1014.6\ns-87.3,378.7,-272.6,1166c-185.3,787.3,-279.3,1182.3,-282,1185\nc-2,6,-10,9,-24,9\nc-8,0,-12,-0.7,-12,-2z M" + (1001 + extraVinculum) + " " + hLinePad + "\nh400000v" + (40 + extraVinculum) + "h-400000z";
};
var sqrtSize4 = function sqrtSize4(extraVinculum, hLinePad) {
	return "M473," + (2713 + extraVinculum + hLinePad) + "\nc339.3,-1799.3,509.3,-2700,510,-2702 l" + extraVinculum / 5.298 + " -" + extraVinculum + "\nc3.3,-7.3,9.3,-11,18,-11 H400000v" + (40 + extraVinculum) + "H1017.7\ns-90.5,478,-276.2,1466c-185.7,988,-279.5,1483,-281.5,1485c-2,6,-10,9,-24,9\nc-8,0,-12,-0.7,-12,-2c0,-1.3,-5.3,-32,-16,-92c-50.7,-293.3,-119.7,-693.3,-207,-1200\nc0,-1.3,-5.3,8.7,-16,30c-10.7,21.3,-21.3,42.7,-32,64s-16,33,-16,33s-26,-26,-26,-26\ns76,-153,76,-153s77,-151,77,-151c0.7,0.7,35.7,202,105,604c67.3,400.7,102,602.7,104,\n606zM" + (1001 + extraVinculum) + " " + hLinePad + "h400000v" + (40 + extraVinculum) + "H1017.7z";
};
var phasePath = function phasePath(y) {
	var x = y / 2;
	return "M400000 " + y + " H0 L" + x + " 0 l65 45 L145 " + (y - 80) + " H400000z";
};
var sqrtTall = function sqrtTall(extraVinculum, hLinePad, viewBoxHeight) {
	var vertSegment = viewBoxHeight - 54 - hLinePad - extraVinculum;
	return "M702 " + (extraVinculum + hLinePad) + "H400000" + (40 + extraVinculum) + "\nH742v" + vertSegment + "l-4 4-4 4c-.667.7 -2 1.5-4 2.5s-4.167 1.833-6.5 2.5-5.5 1-9.5 1\nh-12l-28-84c-16.667-52-96.667 -294.333-240-727l-212 -643 -85 170\nc-4-3.333-8.333-7.667-13 -13l-13-13l77-155 77-156c66 199.333 139 419.667\n219 661 l218 661zM702 " + hLinePad + "H400000v" + (40 + extraVinculum) + "H742z";
};
var sqrtPath = function sqrtPath(size, extraVinculum, viewBoxHeight) {
	extraVinculum = 1e3 * extraVinculum;
	var path = "";
	switch (size) {
		case "sqrtMain":
			path = sqrtMain(extraVinculum, hLinePad);
			break;
		case "sqrtSize1":
			path = sqrtSize1(extraVinculum, hLinePad);
			break;
		case "sqrtSize2":
			path = sqrtSize2(extraVinculum, hLinePad);
			break;
		case "sqrtSize3":
			path = sqrtSize3(extraVinculum, hLinePad);
			break;
		case "sqrtSize4":
			path = sqrtSize4(extraVinculum, hLinePad);
			break;
		case "sqrtTall": path = sqrtTall(extraVinculum, hLinePad, viewBoxHeight);
	}
	return path;
};
var innerPath = function innerPath(name, height) {
	switch (name) {
		case "⎜": return doubleBrushStroke("M291 0 H417 V" + height + " H291z");
		case "∣": return doubleBrushStroke("M145 0 H188 V" + height + " H145z");
		case "∥": return doubleBrushStroke("M145 0 H188 V" + height + " H145z") + doubleBrushStroke("M367 0 H410 V" + height + " H367z");
		case "⎟": return doubleBrushStroke("M457 0 H583 V" + height + " H457z");
		case "⎢": return doubleBrushStroke("M319 0 H403 V" + height + " H319z");
		case "⎥": return doubleBrushStroke("M263 0 H347 V" + height + " H263z");
		case "⎪": return doubleBrushStroke("M384 0 H504 V" + height + " H384z");
		case "⏐": return doubleBrushStroke("M312 0 H355 V" + height + " H312z");
		case "‖": return doubleBrushStroke("M257 0 H300 V" + height + " H257z") + doubleBrushStroke("M478 0 H521 V" + height + " H478z");
		default: return "";
	}
};
var path = {
	doubleleftarrow: "M262 157\nl10-10c34-36 62.7-77 86-123 3.3-8 5-13.3 5-16 0-5.3-6.7-8-20-8-7.3\n 0-12.2.5-14.5 1.5-2.3 1-4.8 4.5-7.5 10.5-49.3 97.3-121.7 169.3-217 216-28\n 14-57.3 25-88 33-6.7 2-11 3.8-13 5.5-2 1.7-3 4.2-3 7.5s1 5.8 3 7.5\nc2 1.7 6.3 3.5 13 5.5 68 17.3 128.2 47.8 180.5 91.5 52.3 43.7 93.8 96.2 124.5\n 157.5 9.3 8 15.3 12.3 18 13h6c12-.7 18-4 18-10 0-2-1.7-7-5-15-23.3-46-52-87\n-86-123l-10-10h399738v-40H218c328 0 0 0 0 0l-10-8c-26.7-20-65.7-43-117-69 2.7\n-2 6-3.7 10-5 36.7-16 72.3-37.3 107-64l10-8h399782v-40z\nm8 0v40h399730v-40zm0 194v40h399730v-40z",
	doublerightarrow: "M399738 392l\n-10 10c-34 36-62.7 77-86 123-3.3 8-5 13.3-5 16 0 5.3 6.7 8 20 8 7.3 0 12.2-.5\n 14.5-1.5 2.3-1 4.8-4.5 7.5-10.5 49.3-97.3 121.7-169.3 217-216 28-14 57.3-25 88\n-33 6.7-2 11-3.8 13-5.5 2-1.7 3-4.2 3-7.5s-1-5.8-3-7.5c-2-1.7-6.3-3.5-13-5.5-68\n-17.3-128.2-47.8-180.5-91.5-52.3-43.7-93.8-96.2-124.5-157.5-9.3-8-15.3-12.3-18\n-13h-6c-12 .7-18 4-18 10 0 2 1.7 7 5 15 23.3 46 52 87 86 123l10 10H0v40h399782\nc-328 0 0 0 0 0l10 8c26.7 20 65.7 43 117 69-2.7 2-6 3.7-10 5-36.7 16-72.3 37.3\n-107 64l-10 8H0v40zM0 157v40h399730v-40zm0 194v40h399730v-40z",
	leftarrow: "M400000 241H110l3-3c68.7-52.7 113.7-120\n 135-202 4-14.7 6-23 6-25 0-7.3-7-11-21-11-8 0-13.2.8-15.5 2.5-2.3 1.7-4.2 5.8\n-5.5 12.5-1.3 4.7-2.7 10.3-4 17-12 48.7-34.8 92-68.5 130S65.3 228.3 18 247\nc-10 4-16 7.7-18 11 0 8.7 6 14.3 18 17 47.3 18.7 87.8 47 121.5 85S196 441.3 208\n 490c.7 2 1.3 5 2 9s1.2 6.7 1.5 8c.3 1.3 1 3.3 2 6s2.2 4.5 3.5 5.5c1.3 1 3.3\n 1.8 6 2.5s6 1 10 1c14 0 21-3.7 21-11 0-2-2-10.3-6-25-20-79.3-65-146.7-135-202\n l-3-3h399890zM100 241v40h399900v-40z",
	leftbrace: "M6 548l-6-6v-35l6-11c56-104 135.3-181.3 238-232 57.3-28.7 117\n-45 179-50h399577v120H403c-43.3 7-81 15-113 26-100.7 33-179.7 91-237 174-2.7\n 5-6 9-10 13-.7 1-7.3 1-20 1H6z",
	leftbraceunder: "M0 6l6-6h17c12.688 0 19.313.3 20 1 4 4 7.313 8.3 10 13\n 35.313 51.3 80.813 93.8 136.5 127.5 55.688 33.7 117.188 55.8 184.5 66.5.688\n 0 2 .3 4 1 18.688 2.7 76 4.3 172 5h399450v120H429l-6-1c-124.688-8-235-61.7\n-331-161C60.687 138.7 32.312 99.3 7 54L0 41V6z",
	leftgroup: "M400000 80\nH435C64 80 168.3 229.4 21 260c-5.9 1.2-18 0-18 0-2 0-3-1-3-3v-38C76 61 257 0\n 435 0h399565z",
	leftgroupunder: "M400000 262\nH435C64 262 168.3 112.6 21 82c-5.9-1.2-18 0-18 0-2 0-3 1-3 3v38c76 158 257 219\n 435 219h399565z",
	leftharpoon: "M0 267c.7 5.3 3 10 7 14h399993v-40H93c3.3\n-3.3 10.2-9.5 20.5-18.5s17.8-15.8 22.5-20.5c50.7-52 88-110.3 112-175 4-11.3 5\n-18.3 3-21-1.3-4-7.3-6-18-6-8 0-13 .7-15 2s-4.7 6.7-8 16c-42 98.7-107.3 174.7\n-196 228-6.7 4.7-10.7 8-12 10-1.3 2-2 5.7-2 11zm100-26v40h399900v-40z",
	leftharpoonplus: "M0 267c.7 5.3 3 10 7 14h399993v-40H93c3.3-3.3 10.2-9.5\n 20.5-18.5s17.8-15.8 22.5-20.5c50.7-52 88-110.3 112-175 4-11.3 5-18.3 3-21-1.3\n-4-7.3-6-18-6-8 0-13 .7-15 2s-4.7 6.7-8 16c-42 98.7-107.3 174.7-196 228-6.7 4.7\n-10.7 8-12 10-1.3 2-2 5.7-2 11zm100-26v40h399900v-40zM0 435v40h400000v-40z\nm0 0v40h400000v-40z",
	leftharpoondown: "M7 241c-4 4-6.333 8.667-7 14 0 5.333.667 9 2 11s5.333\n 5.333 12 10c90.667 54 156 130 196 228 3.333 10.667 6.333 16.333 9 17 2 .667 5\n 1 9 1h5c10.667 0 16.667-2 18-6 2-2.667 1-9.667-3-21-32-87.333-82.667-157.667\n-152-211l-3-3h399907v-40zM93 281 H400000 v-40L7 241z",
	leftharpoondownplus: "M7 435c-4 4-6.3 8.7-7 14 0 5.3.7 9 2 11s5.3 5.3 12\n 10c90.7 54 156 130 196 228 3.3 10.7 6.3 16.3 9 17 2 .7 5 1 9 1h5c10.7 0 16.7\n-2 18-6 2-2.7 1-9.7-3-21-32-87.3-82.7-157.7-152-211l-3-3h399907v-40H7zm93 0\nv40h399900v-40zM0 241v40h399900v-40zm0 0v40h399900v-40z",
	lefthook: "M400000 281 H103s-33-11.2-61-33.5S0 197.3 0 164s14.2-61.2 42.5\n-83.5C70.8 58.2 104 47 142 47 c16.7 0 25 6.7 25 20 0 12-8.7 18.7-26 20-40 3.3\n-68.7 15.7-86 37-10 12-15 25.3-15 40 0 22.7 9.8 40.7 29.5 54 19.7 13.3 43.5 21\n 71.5 23h399859zM103 281v-40h399897v40z",
	leftlinesegment: doubleBrushStroke("M40 281 V428 H0 V94 H40 V241 H400000 v40z"),
	leftbracketunder: doubleBrushStroke("M0 0 h120 V290 H399995 v120 H0z"),
	leftbracketover: doubleBrushStroke("M0 440 h120 V150 H399995 v-120 H0z"),
	leftmapsto: doubleBrushStroke("M40 281 V448H0V74H40V241H400000v40z"),
	leftToFrom: "M0 147h400000v40H0zm0 214c68 40 115.7 95.7 143 167h22c15.3 0 23\n-.3 23-1 0-1.3-5.3-13.7-16-37-18-35.3-41.3-69-70-101l-7-8h399905v-40H95l7-8\nc28.7-32 52-65.7 70-101 10.7-23.3 16-35.7 16-37 0-.7-7.7-1-23-1h-22C115.7 265.3\n 68 321 0 361zm0-174v-40h399900v40zm100 154v40h399900v-40z",
	longequal: doubleBrushStroke("M0 50 h400000 v40H0z m0 194h40000v40H0z"),
	midbrace: "M200428 334\nc-100.7-8.3-195.3-44-280-108-55.3-42-101.7-93-139-153l-9-14c-2.7 4-5.7 8.7-9 14\n-53.3 86.7-123.7 153-211 199-66.7 36-137.3 56.3-212 62H0V214h199568c178.3-11.7\n 311.7-78.3 403-201 6-8 9.7-12 11-12 .7-.7 6.7-1 18-1s17.3.3 18 1c1.3 0 5 4 11\n 12 44.7 59.3 101.3 106.3 170 141s145.3 54.3 229 60h199572v120z",
	midbraceunder: "M199572 214\nc100.7 8.3 195.3 44 280 108 55.3 42 101.7 93 139 153l9 14c2.7-4 5.7-8.7 9-14\n 53.3-86.7 123.7-153 211-199 66.7-36 137.3-56.3 212-62h199568v120H200432c-178.3\n 11.7-311.7 78.3-403 201-6 8-9.7 12-11 12-.7.7-6.7 1-18 1s-17.3-.3-18-1c-1.3 0\n-5-4-11-12-44.7-59.3-101.3-106.3-170-141s-145.3-54.3-229-60H0V214z",
	oiintSize1: "M512.6 71.6c272.6 0 320.3 106.8 320.3 178.2 0 70.8-47.7 177.6\n-320.3 177.6S193.1 320.6 193.1 249.8c0-71.4 46.9-178.2 319.5-178.2z\nm368.1 178.2c0-86.4-60.9-215.4-368.1-215.4-306.4 0-367.3 129-367.3 215.4 0 85.8\n60.9 214.8 367.3 214.8 307.2 0 368.1-129 368.1-214.8z",
	oiintSize2: "M757.8 100.1c384.7 0 451.1 137.6 451.1 230 0 91.3-66.4 228.8\n-451.1 228.8-386.3 0-452.7-137.5-452.7-228.8 0-92.4 66.4-230 452.7-230z\nm502.4 230c0-111.2-82.4-277.2-502.4-277.2s-504 166-504 277.2\nc0 110 84 276 504 276s502.4-166 502.4-276z",
	oiiintSize1: "M681.4 71.6c408.9 0 480.5 106.8 480.5 178.2 0 70.8-71.6 177.6\n-480.5 177.6S202.1 320.6 202.1 249.8c0-71.4 70.5-178.2 479.3-178.2z\nm525.8 178.2c0-86.4-86.8-215.4-525.7-215.4-437.9 0-524.7 129-524.7 215.4 0\n85.8 86.8 214.8 524.7 214.8 438.9 0 525.7-129 525.7-214.8z",
	oiiintSize2: "M1021.2 53c603.6 0 707.8 165.8 707.8 277.2 0 110-104.2 275.8\n-707.8 275.8-606 0-710.2-165.8-710.2-275.8C311 218.8 415.2 53 1021.2 53z\nm770.4 277.1c0-131.2-126.4-327.6-770.5-327.6S248.4 198.9 248.4 330.1\nc0 130 128.8 326.4 772.7 326.4s770.5-196.4 770.5-326.4z",
	rightarrow: "M0 241v40h399891c-47.3 35.3-84 78-110 128\n-16.7 32-27.7 63.7-33 95 0 1.3-.2 2.7-.5 4-.3 1.3-.5 2.3-.5 3 0 7.3 6.7 11 20\n 11 8 0 13.2-.8 15.5-2.5 2.3-1.7 4.2-5.5 5.5-11.5 2-13.3 5.7-27 11-41 14.7-44.7\n 39-84.5 73-119.5s73.7-60.2 119-75.5c6-2 9-5.7 9-11s-3-9-9-11c-45.3-15.3-85\n-40.5-119-75.5s-58.3-74.8-73-119.5c-4.7-14-8.3-27.3-11-40-1.3-6.7-3.2-10.8-5.5\n-12.5-2.3-1.7-7.5-2.5-15.5-2.5-14 0-21 3.7-21 11 0 2 2 10.3 6 25 20.7 83.3 67\n 151.7 139 205zm0 0v40h399900v-40z",
	rightbrace: "M400000 542l\n-6 6h-17c-12.7 0-19.3-.3-20-1-4-4-7.3-8.3-10-13-35.3-51.3-80.8-93.8-136.5-127.5\ns-117.2-55.8-184.5-66.5c-.7 0-2-.3-4-1-18.7-2.7-76-4.3-172-5H0V214h399571l6 1\nc124.7 8 235 61.7 331 161 31.3 33.3 59.7 72.7 85 118l7 13v35z",
	rightbraceunder: "M399994 0l6 6v35l-6 11c-56 104-135.3 181.3-238 232-57.3\n 28.7-117 45-179 50H-300V214h399897c43.3-7 81-15 113-26 100.7-33 179.7-91 237\n-174 2.7-5 6-9 10-13 .7-1 7.3-1 20-1h17z",
	rightgroup: "M0 80h399565c371 0 266.7 149.4 414 180 5.9 1.2 18 0 18 0 2 0\n 3-1 3-3v-38c-76-158-257-219-435-219H0z",
	rightgroupunder: "M0 262h399565c371 0 266.7-149.4 414-180 5.9-1.2 18 0 18\n 0 2 0 3 1 3 3v38c-76 158-257 219-435 219H0z",
	rightharpoon: "M0 241v40h399993c4.7-4.7 7-9.3 7-14 0-9.3\n-3.7-15.3-11-18-92.7-56.7-159-133.7-199-231-3.3-9.3-6-14.7-8-16-2-1.3-7-2-15-2\n-10.7 0-16.7 2-18 6-2 2.7-1 9.7 3 21 15.3 42 36.7 81.8 64 119.5 27.3 37.7 58\n 69.2 92 94.5zm0 0v40h399900v-40z",
	rightharpoonplus: "M0 241v40h399993c4.7-4.7 7-9.3 7-14 0-9.3-3.7-15.3-11\n-18-92.7-56.7-159-133.7-199-231-3.3-9.3-6-14.7-8-16-2-1.3-7-2-15-2-10.7 0-16.7\n 2-18 6-2 2.7-1 9.7 3 21 15.3 42 36.7 81.8 64 119.5 27.3 37.7 58 69.2 92 94.5z\nm0 0v40h399900v-40z m100 194v40h399900v-40zm0 0v40h399900v-40z",
	rightharpoondown: "M399747 511c0 7.3 6.7 11 20 11 8 0 13-.8 15-2.5s4.7-6.8\n 8-15.5c40-94 99.3-166.3 178-217 13.3-8 20.3-12.3 21-13 5.3-3.3 8.5-5.8 9.5\n-7.5 1-1.7 1.5-5.2 1.5-10.5s-2.3-10.3-7-15H0v40h399908c-34 25.3-64.7 57-92 95\n-27.3 38-48.7 77.7-64 119-3.3 8.7-5 14-5 16zM0 241v40h399900v-40z",
	rightharpoondownplus: "M399747 705c0 7.3 6.7 11 20 11 8 0 13-.8\n 15-2.5s4.7-6.8 8-15.5c40-94 99.3-166.3 178-217 13.3-8 20.3-12.3 21-13 5.3-3.3\n 8.5-5.8 9.5-7.5 1-1.7 1.5-5.2 1.5-10.5s-2.3-10.3-7-15H0v40h399908c-34 25.3\n-64.7 57-92 95-27.3 38-48.7 77.7-64 119-3.3 8.7-5 14-5 16zM0 435v40h399900v-40z\nm0-194v40h400000v-40zm0 0v40h400000v-40z",
	righthook: "M399859 241c-764 0 0 0 0 0 40-3.3 68.7-15.7 86-37 10-12 15-25.3\n 15-40 0-22.7-9.8-40.7-29.5-54-19.7-13.3-43.5-21-71.5-23-17.3-1.3-26-8-26-20 0\n-13.3 8.7-20 26-20 38 0 71 11.2 99 33.5 0 0 7 5.6 21 16.7 14 11.2 21 33.5 21\n 66.8s-14 61.2-42 83.5c-28 22.3-61 33.5-99 33.5L0 241z M0 281v-40h399859v40z",
	rightlinesegment: doubleBrushStroke("M399960 241 V94 h40 V428 h-40 V281 H0 v-40z"),
	rightbracketunder: doubleBrushStroke("M399995 0 h-120 V290 H0 v120 H400000z"),
	rightbracketover: doubleBrushStroke("M399995 440 h-120 V150 H0 v-120 H399995z"),
	rightToFrom: "M400000 167c-70.7-42-118-97.7-142-167h-23c-15.3 0-23 .3-23\n 1 0 1.3 5.3 13.7 16 37 18 35.3 41.3 69 70 101l7 8H0v40h399905l-7 8c-28.7 32\n-52 65.7-70 101-10.7 23.3-16 35.7-16 37 0 .7 7.7 1 23 1h23c24-69.3 71.3-125 142\n-167z M100 147v40h399900v-40zM0 341v40h399900v-40z",
	twoheadleftarrow: "M0 167c68 40\n 115.7 95.7 143 167h22c15.3 0 23-.3 23-1 0-1.3-5.3-13.7-16-37-18-35.3-41.3-69\n-70-101l-7-8h125l9 7c50.7 39.3 85 86 103 140h46c0-4.7-6.3-18.7-19-42-18-35.3\n-40-67.3-66-96l-9-9h399716v-40H284l9-9c26-28.7 48-60.7 66-96 12.7-23.333 19\n-37.333 19-42h-46c-18 54-52.3 100.7-103 140l-9 7H95l7-8c28.7-32 52-65.7 70-101\n 10.7-23.333 16-35.7 16-37 0-.7-7.7-1-23-1h-22C115.7 71.3 68 127 0 167z",
	twoheadrightarrow: "M400000 167\nc-68-40-115.7-95.7-143-167h-22c-15.3 0-23 .3-23 1 0 1.3 5.3 13.7 16 37 18 35.3\n 41.3 69 70 101l7 8h-125l-9-7c-50.7-39.3-85-86-103-140h-46c0 4.7 6.3 18.7 19 42\n 18 35.3 40 67.3 66 96l9 9H0v40h399716l-9 9c-26 28.7-48 60.7-66 96-12.7 23.333\n-19 37.333-19 42h46c18-54 52.3-100.7 103-140l9-7h125l-7 8c-28.7 32-52 65.7-70\n 101-10.7 23.333-16 35.7-16 37 0 .7 7.7 1 23 1h22c27.3-71.3 75-127 143-167z",
	tilde1: "M200 55.538c-77 0-168 73.953-177 73.953-3 0-7\n-2.175-9-5.437L2 97c-1-2-2-4-2-6 0-4 2-7 5-9l20-12C116 12 171 0 207 0c86 0\n 114 68 191 68 78 0 168-68 177-68 4 0 7 2 9 5l12 19c1 2.175 2 4.35 2 6.525 0\n 4.35-2 7.613-5 9.788l-19 13.05c-92 63.077-116.937 75.308-183 76.128\n-68.267.847-113-73.952-191-73.952z",
	tilde2: "M344 55.266c-142 0-300.638 81.316-311.5 86.418\n-8.01 3.762-22.5 10.91-23.5 5.562L1 120c-1-2-1-3-1-4 0-5 3-9 8-10l18.4-9C160.9\n 31.9 283 0 358 0c148 0 188 122 331 122s314-97 326-97c4 0 8 2 10 7l7 21.114\nc1 2.14 1 3.21 1 4.28 0 5.347-3 9.626-7 10.696l-22.3 12.622C852.6 158.372 751\n 181.476 676 181.476c-149 0-189-126.21-332-126.21z",
	tilde3: "M786 59C457 59 32 175.242 13 175.242c-6 0-10-3.457\n-11-10.37L.15 138c-1-7 3-12 10-13l19.2-6.4C378.4 40.7 634.3 0 804.3 0c337 0\n 411.8 157 746.8 157 328 0 754-112 773-112 5 0 10 3 11 9l1 14.075c1 8.066-.697\n 16.595-6.697 17.492l-21.052 7.31c-367.9 98.146-609.15 122.696-778.15 122.696\n -338 0-409-156.573-744-156.573z",
	tilde4: "M786 58C457 58 32 177.487 13 177.487c-6 0-10-3.345\n-11-10.035L.15 143c-1-7 3-12 10-13l22-6.7C381.2 35 637.15 0 807.15 0c337 0 409\n 177 744 177 328 0 754-127 773-127 5 0 10 3 11 9l1 14.794c1 7.805-3 13.38-9\n 14.495l-20.7 5.574c-366.85 99.79-607.3 139.372-776.3 139.372-338 0-409\n -175.236-744-175.236z",
	vec: "M377 20c0-5.333 1.833-10 5.5-14S391 0 397 0c4.667 0 8.667 1.667 12 5\n3.333 2.667 6.667 9 10 19 6.667 24.667 20.333 43.667 41 57 7.333 4.667 11\n10.667 11 18 0 6-1 10-3 12s-6.667 5-14 9c-28.667 14.667-53.667 35.667-75 63\n-1.333 1.333-3.167 3.5-5.5 6.5s-4 4.833-5 5.5c-1 .667-2.5 1.333-4.5 2s-4.333 1\n-7 1c-4.667 0-9.167-1.833-13.5-5.5S337 184 337 178c0-12.667 15.667-32.333 47-59\nH213l-171-1c-8.667-6-13-12.333-13-19 0-4.667 4.333-11.333 13-20h359\nc-16-25.333-24-45-24-59z",
	widehat1: "M529 0h5l519 115c5 1 9 5 9 10 0 1-1 2-1 3l-4 22\nc-1 5-5 9-11 9h-2L532 67 19 159h-2c-5 0-9-4-11-9l-5-22c-1-6 2-12 8-13z",
	widehat2: "M1181 0h2l1171 176c6 0 10 5 10 11l-2 23c-1 6-5 10\n-11 10h-1L1182 67 15 220h-1c-6 0-10-4-11-10l-2-23c-1-6 4-11 10-11z",
	widehat3: "M1181 0h2l1171 236c6 0 10 5 10 11l-2 23c-1 6-5 10\n-11 10h-1L1182 67 15 280h-1c-6 0-10-4-11-10l-2-23c-1-6 4-11 10-11z",
	widehat4: "M1181 0h2l1171 296c6 0 10 5 10 11l-2 23c-1 6-5 10\n-11 10h-1L1182 67 15 340h-1c-6 0-10-4-11-10l-2-23c-1-6 4-11 10-11z",
	widecheck1: "M529,159h5l519,-115c5,-1,9,-5,9,-10c0,-1,-1,-2,-1,-3l-4,-22c-1,\n-5,-5,-9,-11,-9h-2l-512,92l-513,-92h-2c-5,0,-9,4,-11,9l-5,22c-1,6,2,12,8,13z",
	widecheck2: "M1181,220h2l1171,-176c6,0,10,-5,10,-11l-2,-23c-1,-6,-5,-10,\n-11,-10h-1l-1168,153l-1167,-153h-1c-6,0,-10,4,-11,10l-2,23c-1,6,4,11,10,11z",
	widecheck3: "M1181,280h2l1171,-236c6,0,10,-5,10,-11l-2,-23c-1,-6,-5,-10,\n-11,-10h-1l-1168,213l-1167,-213h-1c-6,0,-10,4,-11,10l-2,23c-1,6,4,11,10,11z",
	widecheck4: "M1181,340h2l1171,-296c6,0,10,-5,10,-11l-2,-23c-1,-6,-5,-10,\n-11,-10h-1l-1168,273l-1167,-273h-1c-6,0,-10,4,-11,10l-2,23c-1,6,4,11,10,11z",
	baraboveleftarrow: "M400000 620h-399890l3 -3c68.7 -52.7 113.7 -120 135 -202\nc4 -14.7 6 -23 6 -25c0 -7.3 -7 -11 -21 -11c-8 0 -13.2 0.8 -15.5 2.5\nc-2.3 1.7 -4.2 5.8 -5.5 12.5c-1.3 4.7 -2.7 10.3 -4 17c-12 48.7 -34.8 92 -68.5 130\ns-74.2 66.3 -121.5 85c-10 4 -16 7.7 -18 11c0 8.7 6 14.3 18 17c47.3 18.7 87.8 47\n121.5 85s56.5 81.3 68.5 130c0.7 2 1.3 5 2 9s1.2 6.7 1.5 8c0.3 1.3 1 3.3 2 6\ns2.2 4.5 3.5 5.5c1.3 1 3.3 1.8 6 2.5s6 1 10 1c14 0 21 -3.7 21 -11\nc0 -2 -2 -10.3 -6 -25c-20 -79.3 -65 -146.7 -135 -202l-3 -3h399890z\nM100 620v40h399900v-40z M0 241v40h399900v-40zM0 241v40h399900v-40z",
	rightarrowabovebar: "M0 241v40h399891c-47.3 35.3-84 78-110 128-16.7 32\n-27.7 63.7-33 95 0 1.3-.2 2.7-.5 4-.3 1.3-.5 2.3-.5 3 0 7.3 6.7 11 20 11 8 0\n13.2-.8 15.5-2.5 2.3-1.7 4.2-5.5 5.5-11.5 2-13.3 5.7-27 11-41 14.7-44.7 39\n-84.5 73-119.5s73.7-60.2 119-75.5c6-2 9-5.7 9-11s-3-9-9-11c-45.3-15.3-85-40.5\n-119-75.5s-58.3-74.8-73-119.5c-4.7-14-8.3-27.3-11-40-1.3-6.7-3.2-10.8-5.5\n-12.5-2.3-1.7-7.5-2.5-15.5-2.5-14 0-21 3.7-21 11 0 2 2 10.3 6 25 20.7 83.3 67\n151.7 139 205zm96 379h399894v40H0zm0 0h399904v40H0z",
	baraboveshortleftharpoon: "M507,435c-4,4,-6.3,8.7,-7,14c0,5.3,0.7,9,2,11\nc1.3,2,5.3,5.3,12,10c90.7,54,156,130,196,228c3.3,10.7,6.3,16.3,9,17\nc2,0.7,5,1,9,1c0,0,5,0,5,0c10.7,0,16.7,-2,18,-6c2,-2.7,1,-9.7,-3,-21\nc-32,-87.3,-82.7,-157.7,-152,-211c0,0,-3,-3,-3,-3l399351,0l0,-40\nc-398570,0,-399437,0,-399437,0z M593 435 v40 H399500 v-40z\nM0 281 v-40 H399908 v40z M0 281 v-40 H399908 v40z",
	rightharpoonaboveshortbar: "M0,241 l0,40c399126,0,399993,0,399993,0\nc4.7,-4.7,7,-9.3,7,-14c0,-9.3,-3.7,-15.3,-11,-18c-92.7,-56.7,-159,-133.7,-199,\n-231c-3.3,-9.3,-6,-14.7,-8,-16c-2,-1.3,-7,-2,-15,-2c-10.7,0,-16.7,2,-18,6\nc-2,2.7,-1,9.7,3,21c15.3,42,36.7,81.8,64,119.5c27.3,37.7,58,69.2,92,94.5z\nM0 241 v40 H399908 v-40z M0 475 v-40 H399500 v40z M0 475 v-40 H399500 v40z",
	shortbaraboveleftharpoon: "M7,435c-4,4,-6.3,8.7,-7,14c0,5.3,0.7,9,2,11\nc1.3,2,5.3,5.3,12,10c90.7,54,156,130,196,228c3.3,10.7,6.3,16.3,9,17c2,0.7,5,1,9,\n1c0,0,5,0,5,0c10.7,0,16.7,-2,18,-6c2,-2.7,1,-9.7,-3,-21c-32,-87.3,-82.7,-157.7,\n-152,-211c0,0,-3,-3,-3,-3l399907,0l0,-40c-399126,0,-399993,0,-399993,0z\nM93 435 v40 H400000 v-40z M500 241 v40 H400000 v-40z M500 241 v40 H400000 v-40z",
	shortrightharpoonabovebar: "M53,241l0,40c398570,0,399437,0,399437,0\nc4.7,-4.7,7,-9.3,7,-14c0,-9.3,-3.7,-15.3,-11,-18c-92.7,-56.7,-159,-133.7,-199,\n-231c-3.3,-9.3,-6,-14.7,-8,-16c-2,-1.3,-7,-2,-15,-2c-10.7,0,-16.7,2,-18,6\nc-2,2.7,-1,9.7,3,21c15.3,42,36.7,81.8,64,119.5c27.3,37.7,58,69.2,92,94.5z\nM500 241 v40 H399408 v-40z M500 435 v40 H400000 v-40z"
};
var tallDelim = function tallDelim(label, midHeight) {
	switch (label) {
		case "lbrack": return "M403 1759 V84 H666 V0 H319 V1759 v" + midHeight + " v1759 v84 h347 v-84\nH403z M403 1759 V0 H319 V1759 v" + midHeight + " v1759 v84 h84z";
		case "rbrack": return "M347 1759 V0 H0 V84 H263 V1759 v" + midHeight + " v1759 H0 v84 H347z\nM347 1759 V0 H263 V1759 v" + midHeight + " v1759 h84z";
		case "vert": return "M145 15 v585 v" + midHeight + " v585 c2.667,10,9.667,15,21,15\nc10,0,16.667,-5,20,-15 v-585 v" + -midHeight + " v-585 c-2.667,-10,-9.667,-15,-21,-15\nc-10,0,-16.667,5,-20,15z M188 15 H145 v585 v" + midHeight + " v585 h43z";
		case "doublevert": return "M145 15 v585 v" + midHeight + " v585 c2.667,10,9.667,15,21,15\nc10,0,16.667,-5,20,-15 v-585 v" + -midHeight + " v-585 c-2.667,-10,-9.667,-15,-21,-15\nc-10,0,-16.667,5,-20,15z M188 15 H145 v585 v" + midHeight + " v585 h43z\nM367 15 v585 v" + midHeight + " v585 c2.667,10,9.667,15,21,15\nc10,0,16.667,-5,20,-15 v-585 v" + -midHeight + " v-585 c-2.667,-10,-9.667,-15,-21,-15\nc-10,0,-16.667,5,-20,15z M410 15 H367 v585 v" + midHeight + " v585 h43z";
		case "lfloor": return "M319 602 V0 H403 V602 v" + midHeight + " v1715 h263 v84 H319z\nMM319 602 V0 H403 V602 v" + midHeight + " v1715 H319z";
		case "rfloor": return "M319 602 V0 H403 V602 v" + midHeight + " v1799 H0 v-84 H319z\nMM319 602 V0 H403 V602 v" + midHeight + " v1715 H319z";
		case "lceil": return "M403 1759 V84 H666 V0 H319 V1759 v" + midHeight + " v602 h84z\nM403 1759 V0 H319 V1759 v" + midHeight + " v602 h84z";
		case "rceil": return "M347 1759 V0 H0 V84 H263 V1759 v" + midHeight + " v602 h84z\nM347 1759 V0 h-84 V1759 v" + midHeight + " v602 h84z";
		case "lparen": return "M863,9c0,-2,-2,-5,-6,-9c0,0,-17,0,-17,0c-12.7,0,-19.3,0.3,-20,1\nc-5.3,5.3,-10.3,11,-15,17c-242.7,294.7,-395.3,682,-458,1162c-21.3,163.3,-33.3,349,\n-36,557 l0," + (midHeight + 84) + "c0.2,6,0,26,0,60c2,159.3,10,310.7,24,454c53.3,528,210,\n949.7,470,1265c4.7,6,9.7,11.7,15,17c0.7,0.7,7,1,19,1c0,0,18,0,18,0c4,-4,6,-7,6,-9\nc0,-2.7,-3.3,-8.7,-10,-18c-135.3,-192.7,-235.5,-414.3,-300.5,-665c-65,-250.7,-102.5,\n-544.7,-112.5,-882c-2,-104,-3,-167,-3,-189\nl0,-" + (midHeight + 92) + "c0,-162.7,5.7,-314,17,-454c20.7,-272,63.7,-513,129,-723c65.3,\n-210,155.3,-396.3,270,-559c6.7,-9.3,10,-15.3,10,-18z";
		case "rparen": return "M76,0c-16.7,0,-25,3,-25,9c0,2,2,6.3,6,13c21.3,28.7,42.3,60.3,\n63,95c96.7,156.7,172.8,332.5,228.5,527.5c55.7,195,92.8,416.5,111.5,664.5\nc11.3,139.3,17,290.7,17,454c0,28,1.7,43,3.3,45l0," + (midHeight + 9) + "\nc-3,4,-3.3,16.7,-3.3,38c0,162,-5.7,313.7,-17,455c-18.7,248,-55.8,469.3,-111.5,664\nc-55.7,194.7,-131.8,370.3,-228.5,527c-20.7,34.7,-41.7,66.3,-63,95c-2,3.3,-4,7,-6,11\nc0,7.3,5.7,11,17,11c0,0,11,0,11,0c9.3,0,14.3,-0.3,15,-1c5.3,-5.3,10.3,-11,15,-17\nc242.7,-294.7,395.3,-681.7,458,-1161c21.3,-164.7,33.3,-350.7,36,-558\nl0,-" + (midHeight + 144) + "c-2,-159.3,-10,-310.7,-24,-454c-53.3,-528,-210,-949.7,\n-470,-1265c-4.7,-6,-9.7,-11.7,-15,-17c-0.7,-0.7,-6.7,-1,-18,-1z";
		default: throw new Error("Unknown stretchy delimiter.");
	}
};
function isMathDomNode(node) {
	return "toText" in node;
}
/**
* This node represents a document fragment, which contains elements, but when
* placed into the DOM doesn't have any representation itself. It only contains
* children and doesn't have any DOM node properties.
*/
var DocumentFragment = class {
	constructor(children) {
		this.children = void 0;
		this.classes = void 0;
		this.height = void 0;
		this.depth = void 0;
		this.maxFontSize = void 0;
		this.style = void 0;
		this.children = children;
		this.classes = [];
		this.height = 0;
		this.depth = 0;
		this.maxFontSize = 0;
		this.style = {};
	}
	hasClass(className) {
		return this.classes.includes(className);
	}
	/** Convert the fragment into a node. */
	toNode() {
		var frag = document.createDocumentFragment();
		for (var i = 0; i < this.children.length; i++) frag.appendChild(this.children[i].toNode());
		return frag;
	}
	/** Convert the fragment into HTML markup. */
	toMarkup() {
		var markup = "";
		for (var i = 0; i < this.children.length; i++) markup += this.children[i].toMarkup();
		return markup;
	}
	/**
	* Converts the math node into a string, similar to innerText. Applies to
	* MathDomNode's only.
	*/
	toText() {
		return this.children.map((child) => {
			if (isMathDomNode(child)) return child.toText();
			throw new Error("Expected MathDomNode with toText, got " + child.constructor.name);
		}).join("");
	}
};
/**
* This file does conversion between units.  In particular, it provides
* calculateSize to convert other units into ems.
*/
var ptPerUnit = {
	"pt": 1,
	"mm": 7227 / 2540,
	"cm": 7227 / 254,
	"in": 72.27,
	"bp": 803 / 800,
	"pc": 12,
	"dd": 1238 / 1157,
	"cc": 14856 / 1157,
	"nd": 685 / 642,
	"nc": 1370 / 107,
	"sp": 1 / 65536,
	"px": 803 / 800
};
var relativeUnit = {
	"ex": true,
	"em": true,
	"mu": true
};
/**
* Determine whether the specified unit (either a string defining the unit
* or a "size" parse node containing a unit field) is valid.
*/
var validUnit = function validUnit(unit) {
	if (typeof unit !== "string") unit = unit.unit;
	return unit in ptPerUnit || unit in relativeUnit || unit === "ex";
};
var calculateSize = function calculateSize(sizeValue, options) {
	var scale;
	if (sizeValue.unit in ptPerUnit) scale = ptPerUnit[sizeValue.unit] / options.fontMetrics().ptPerEm / options.sizeMultiplier;
	else if (sizeValue.unit === "mu") scale = options.fontMetrics().cssEmPerMu;
	else {
		var unitOptions;
		if (options.style.isTight()) unitOptions = options.havingStyle(options.style.text());
		else unitOptions = options;
		if (sizeValue.unit === "ex") scale = unitOptions.fontMetrics().xHeight;
		else if (sizeValue.unit === "em") scale = unitOptions.fontMetrics().quad;
		else throw new ParseError("Invalid unit: '" + sizeValue.unit + "'");
		if (unitOptions !== options) scale *= unitOptions.sizeMultiplier / options.sizeMultiplier;
	}
	return Math.min(sizeValue.number * scale, options.maxSize);
};
/**
* Round `n` to 4 decimal places, or to the nearest 1/10,000th em. See
* https://github.com/KaTeX/KaTeX/pull/2460.
*/
var makeEm = function makeEm(n) {
	return +n.toFixed(4) + "em";
};
/**
* These objects store the data about the DOM nodes we create, as well as some
* extra data. They can then be transformed into real DOM nodes with the
* `toNode` function or HTML markup using `toMarkup`. They are useful for both
* storing extra properties on the nodes, as well as providing a way to easily
* work with the DOM.
*
* Similar functions for working with MathML nodes exist in mathMLTree.js.
*
* TODO: refactor `span` and `anchor` into common superclass when
* target environments support class inheritance
*/
/**
* Create an HTML className based on a list of classes. In addition to joining
* with spaces, we also remove empty classes.
*/
var createClass = function createClass(classes) {
	return classes.filter((cls) => cls).join(" ");
};
/**
* Serialize a CssStyle object into a semicolon-delimited inline-style string
* (hyphenating camelCase property names). Returns "" when no property is set.
*/
var cssStyleToString = function cssStyleToString(style) {
	var styles = "";
	for (var key of Object.keys(style)) {
		var value = style[key];
		if (value !== void 0) styles += hyphenate(key) + ":" + value + ";";
	}
	return styles;
};
var initNode = function initNode(classes, options, style) {
	this.classes = classes || [];
	this.attributes = {};
	this.height = 0;
	this.depth = 0;
	this.maxFontSize = 0;
	this.style = style || {};
	if (options) {
		if (options.style.isTight()) this.classes.push("mtight");
		var color = options.getColor();
		if (color) this.style.color = color;
	}
};
/**
* Convert into an HTML node
*/
var toNode = function toNode(tagName) {
	var node = document.createElement(tagName);
	node.className = createClass(this.classes);
	Object.assign(node.style, this.style);
	for (var attr of Object.keys(this.attributes)) node.setAttribute(attr, this.attributes[attr]);
	for (var i = 0; i < this.children.length; i++) node.appendChild(this.children[i].toNode());
	return node;
};
/**
* https://w3c.github.io/html-reference/syntax.html#syntax-attributes
*
* > Attribute Names must consist of one or more characters
* other than the space characters, U+0000 NULL,
* '"', "'", ">", "/", "=", the control characters,
* and any characters that are not defined by Unicode.
*/
var invalidAttributeNameRegex = /[\s"'>/=\x00-\x1f]/;
/**
* Convert into an HTML markup string
*/
var toMarkup = function toMarkup(tagName) {
	var markup = "<" + tagName;
	if (this.classes.length) markup += " class=\"" + escape(createClass(this.classes)) + "\"";
	var styles = cssStyleToString(this.style);
	if (styles) markup += " style=\"" + escape(styles) + "\"";
	for (var attr of Object.keys(this.attributes)) {
		if (invalidAttributeNameRegex.test(attr)) throw new ParseError("Invalid attribute name '" + attr + "'");
		markup += " " + attr + "=\"" + escape(this.attributes[attr]) + "\"";
	}
	markup += ">";
	for (var i = 0; i < this.children.length; i++) markup += this.children[i].toMarkup();
	markup += "</" + tagName + ">";
	return markup;
};
/**
* This node represents a span node, with a className, a list of children, and
* an inline style. It also contains information about its height, depth, and
* maxFontSize.
*
* Represents two types with different uses: SvgSpan to wrap an SVG and DomSpan
* otherwise. This typesafety is important when HTML builders access a span's
* children.
*/
var Span = class {
	constructor(classes, children, options, style) {
		this.children = void 0;
		this.attributes = void 0;
		this.classes = void 0;
		this.height = void 0;
		this.depth = void 0;
		this.width = void 0;
		this.maxFontSize = void 0;
		this.style = void 0;
		/**
		* Italic correction carried over from a SymbolNode when the symbol is
		* wrapped in a vlist (e.g. \oiint / \oiiint).  Read by supsub to adjust
		* subscript positioning.  Only set when nonzero; use `?? 0` at read sites.
		*/
		this.italic = void 0;
		initNode.call(this, classes, options, style);
		this.children = children || [];
	}
	/**
	* Sets an arbitrary attribute on the span. Warning: use this wisely. Not
	* all browsers support attributes the same, and having too many custom
	* attributes is probably bad.
	*/
	setAttribute(attribute, value) {
		this.attributes[attribute] = value;
	}
	hasClass(className) {
		return this.classes.includes(className);
	}
	toNode() {
		return toNode.call(this, "span");
	}
	toMarkup() {
		return toMarkup.call(this, "span");
	}
};
/**
* This node represents an anchor (<a>) element with a hyperlink.  See `span`
* for further details.
*/
var Anchor = class {
	constructor(href, classes, children, options) {
		this.children = void 0;
		this.attributes = void 0;
		this.classes = void 0;
		this.height = void 0;
		this.depth = void 0;
		this.maxFontSize = void 0;
		this.style = void 0;
		initNode.call(this, classes, options);
		this.children = children || [];
		this.setAttribute("href", href);
	}
	setAttribute(attribute, value) {
		this.attributes[attribute] = value;
	}
	hasClass(className) {
		return this.classes.includes(className);
	}
	toNode() {
		return toNode.call(this, "a");
	}
	toMarkup() {
		return toMarkup.call(this, "a");
	}
};
/**
* This node represents an image embed (<img>) element.
*/
var Img = class {
	constructor(src, alt, style) {
		this.src = void 0;
		this.alt = void 0;
		this.classes = void 0;
		this.height = void 0;
		this.depth = void 0;
		this.maxFontSize = void 0;
		this.style = void 0;
		this.alt = alt;
		this.src = src;
		this.classes = ["mord"];
		this.height = 0;
		this.depth = 0;
		this.maxFontSize = 0;
		this.style = style;
	}
	hasClass(className) {
		return this.classes.includes(className);
	}
	toNode() {
		var node = document.createElement("img");
		node.src = this.src;
		node.alt = this.alt;
		node.className = "mord";
		Object.assign(node.style, this.style);
		return node;
	}
	toMarkup() {
		var markup = "<img src=\"" + escape(this.src) + "\"" + (" alt=\"" + escape(this.alt) + "\"");
		var styles = cssStyleToString(this.style);
		if (styles) markup += " style=\"" + escape(styles) + "\"";
		markup += "'/>";
		return markup;
	}
};
var iCombinations = {
	"î": "ı̂",
	"ï": "ı̈",
	"í": "ı́",
	"ì": "ı̀"
};
/**
* A symbol node contains information about a single symbol. It either renders
* to a single text node, or a span with a single text node in it, depending on
* whether it has CSS classes, styles, or needs italic correction.
*/
var SymbolNode = class {
	constructor(text, height, depth, italic, skew, width, classes, style) {
		this.text = void 0;
		this.height = void 0;
		this.depth = void 0;
		this.italic = void 0;
		this.skew = void 0;
		this.width = void 0;
		this.maxFontSize = void 0;
		this.classes = void 0;
		this.style = void 0;
		this.text = text;
		this.height = height || 0;
		this.depth = depth || 0;
		this.italic = italic || 0;
		this.skew = skew || 0;
		this.width = width || 0;
		this.classes = classes || [];
		this.style = style || {};
		this.maxFontSize = 0;
		var script = scriptFromCodepoint(this.text.charCodeAt(0));
		if (script) this.classes.push(script + "_fallback");
		if (/[îïíì]/.test(this.text)) this.text = iCombinations[this.text];
	}
	hasClass(className) {
		return this.classes.includes(className);
	}
	/**
	* Creates a text node or span from a symbol node. Note that a span is only
	* created if it is needed.
	*/
	toNode() {
		var node = document.createTextNode(this.text);
		var span = null;
		if (this.italic > 0) {
			span = document.createElement("span");
			span.style.marginRight = makeEm(this.italic);
		}
		if (this.classes.length > 0) {
			span = span || document.createElement("span");
			span.className = createClass(this.classes);
		}
		if (Object.keys(this.style).length > 0) {
			span = span || document.createElement("span");
			Object.assign(span.style, this.style);
		}
		if (span) {
			span.appendChild(node);
			return span;
		} else return node;
	}
	/**
	* Creates markup for a symbol node.
	*/
	toMarkup() {
		var needsSpan = false;
		var markup = "<span";
		if (this.classes.length) {
			needsSpan = true;
			markup += " class=\"";
			markup += escape(createClass(this.classes));
			markup += "\"";
		}
		var styles = "";
		if (this.italic > 0) styles += "margin-right:" + makeEm(this.italic) + ";";
		styles += cssStyleToString(this.style);
		if (styles) {
			needsSpan = true;
			markup += " style=\"" + escape(styles) + "\"";
		}
		var escaped = escape(this.text);
		if (needsSpan) {
			markup += ">";
			markup += escaped;
			markup += "</span>";
			return markup;
		} else return escaped;
	}
};
/**
* SVG nodes are used to render stretchy wide elements.
*/
var SvgNode = class {
	constructor(children, attributes) {
		this.children = void 0;
		this.attributes = void 0;
		this.children = children || [];
		this.attributes = attributes || {};
	}
	toNode() {
		var node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		for (var attr of Object.keys(this.attributes)) node.setAttribute(attr, this.attributes[attr]);
		for (var i = 0; i < this.children.length; i++) node.appendChild(this.children[i].toNode());
		return node;
	}
	toMarkup() {
		var markup = "<svg xmlns=\"http://www.w3.org/2000/svg\"";
		for (var attr of Object.keys(this.attributes)) markup += " " + attr + "=\"" + escape(this.attributes[attr]) + "\"";
		markup += ">";
		for (var i = 0; i < this.children.length; i++) markup += this.children[i].toMarkup();
		markup += "</svg>";
		return markup;
	}
};
var PathNode = class {
	constructor(pathName, alternate) {
		this.pathName = void 0;
		this.alternate = void 0;
		this.pathName = pathName;
		this.alternate = alternate;
	}
	toNode() {
		var node = document.createElementNS("http://www.w3.org/2000/svg", "path");
		if (this.alternate) node.setAttribute("d", this.alternate);
		else node.setAttribute("d", path[this.pathName]);
		return node;
	}
	toMarkup() {
		if (this.alternate) return "<path d=\"" + escape(this.alternate) + "\"/>";
		else return "<path d=\"" + escape(path[this.pathName]) + "\"/>";
	}
};
var LineNode = class {
	constructor(attributes) {
		this.attributes = void 0;
		this.attributes = attributes || {};
	}
	toNode() {
		var node = document.createElementNS("http://www.w3.org/2000/svg", "line");
		for (var attr of Object.keys(this.attributes)) node.setAttribute(attr, this.attributes[attr]);
		return node;
	}
	toMarkup() {
		var markup = "<line";
		for (var attr of Object.keys(this.attributes)) markup += " " + attr + "=\"" + escape(this.attributes[attr]) + "\"";
		markup += "/>";
		return markup;
	}
};
function assertSymbolDomNode(group) {
	if (group instanceof SymbolNode) return group;
	else throw new Error("Expected symbolNode but got " + String(group) + ".");
}
function assertSpan(group) {
	if (group instanceof Span) return group;
	else throw new Error("Expected span<HtmlDomNode> but got " + String(group) + ".");
}
/**
* Whether an HtmlDomNode has HtmlDomNode children.
* HtmlDomNode is a base type representing a union of
* SymbolNode, SvgSpan, DomSpan, Anchor, and documentFragment.
* In the last three cases, the children are HtmlDomNode[].
*/
var hasHtmlDomChildren = (node) => node instanceof Span || node instanceof Anchor || node instanceof DocumentFragment;
var fontMetricsData = {
	"AMS-Regular": {
		"32": [
			0,
			0,
			0,
			0,
			.25
		],
		"65": [
			0,
			.68889,
			0,
			0,
			.72222
		],
		"66": [
			0,
			.68889,
			0,
			0,
			.66667
		],
		"67": [
			0,
			.68889,
			0,
			0,
			.72222
		],
		"68": [
			0,
			.68889,
			0,
			0,
			.72222
		],
		"69": [
			0,
			.68889,
			0,
			0,
			.66667
		],
		"70": [
			0,
			.68889,
			0,
			0,
			.61111
		],
		"71": [
			0,
			.68889,
			0,
			0,
			.77778
		],
		"72": [
			0,
			.68889,
			0,
			0,
			.77778
		],
		"73": [
			0,
			.68889,
			0,
			0,
			.38889
		],
		"74": [
			.16667,
			.68889,
			0,
			0,
			.5
		],
		"75": [
			0,
			.68889,
			0,
			0,
			.77778
		],
		"76": [
			0,
			.68889,
			0,
			0,
			.66667
		],
		"77": [
			0,
			.68889,
			0,
			0,
			.94445
		],
		"78": [
			0,
			.68889,
			0,
			0,
			.72222
		],
		"79": [
			.16667,
			.68889,
			0,
			0,
			.77778
		],
		"80": [
			0,
			.68889,
			0,
			0,
			.61111
		],
		"81": [
			.16667,
			.68889,
			0,
			0,
			.77778
		],
		"82": [
			0,
			.68889,
			0,
			0,
			.72222
		],
		"83": [
			0,
			.68889,
			0,
			0,
			.55556
		],
		"84": [
			0,
			.68889,
			0,
			0,
			.66667
		],
		"85": [
			0,
			.68889,
			0,
			0,
			.72222
		],
		"86": [
			0,
			.68889,
			0,
			0,
			.72222
		],
		"87": [
			0,
			.68889,
			0,
			0,
			1
		],
		"88": [
			0,
			.68889,
			0,
			0,
			.72222
		],
		"89": [
			0,
			.68889,
			0,
			0,
			.72222
		],
		"90": [
			0,
			.68889,
			0,
			0,
			.66667
		],
		"107": [
			0,
			.68889,
			0,
			0,
			.55556
		],
		"160": [
			0,
			0,
			0,
			0,
			.25
		],
		"165": [
			0,
			.675,
			.025,
			0,
			.75
		],
		"174": [
			.15559,
			.69224,
			0,
			0,
			.94666
		],
		"240": [
			0,
			.68889,
			0,
			0,
			.55556
		],
		"295": [
			0,
			.68889,
			0,
			0,
			.54028
		],
		"710": [
			0,
			.825,
			0,
			0,
			2.33334
		],
		"732": [
			0,
			.9,
			0,
			0,
			2.33334
		],
		"770": [
			0,
			.825,
			0,
			0,
			2.33334
		],
		"771": [
			0,
			.9,
			0,
			0,
			2.33334
		],
		"989": [
			.08167,
			.58167,
			0,
			0,
			.77778
		],
		"1008": [
			0,
			.43056,
			.04028,
			0,
			.66667
		],
		"8245": [
			0,
			.54986,
			0,
			0,
			.275
		],
		"8463": [
			0,
			.68889,
			0,
			0,
			.54028
		],
		"8487": [
			0,
			.68889,
			0,
			0,
			.72222
		],
		"8498": [
			0,
			.68889,
			0,
			0,
			.55556
		],
		"8502": [
			0,
			.68889,
			0,
			0,
			.66667
		],
		"8503": [
			0,
			.68889,
			0,
			0,
			.44445
		],
		"8504": [
			0,
			.68889,
			0,
			0,
			.66667
		],
		"8513": [
			0,
			.68889,
			0,
			0,
			.63889
		],
		"8592": [
			-.03598,
			.46402,
			0,
			0,
			.5
		],
		"8594": [
			-.03598,
			.46402,
			0,
			0,
			.5
		],
		"8602": [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		"8603": [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		"8606": [
			.01354,
			.52239,
			0,
			0,
			1
		],
		"8608": [
			.01354,
			.52239,
			0,
			0,
			1
		],
		"8610": [
			.01354,
			.52239,
			0,
			0,
			1.11111
		],
		"8611": [
			.01354,
			.52239,
			0,
			0,
			1.11111
		],
		"8619": [
			0,
			.54986,
			0,
			0,
			1
		],
		"8620": [
			0,
			.54986,
			0,
			0,
			1
		],
		"8621": [
			-.13313,
			.37788,
			0,
			0,
			1.38889
		],
		"8622": [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		"8624": [
			0,
			.69224,
			0,
			0,
			.5
		],
		"8625": [
			0,
			.69224,
			0,
			0,
			.5
		],
		"8630": [
			0,
			.43056,
			0,
			0,
			1
		],
		"8631": [
			0,
			.43056,
			0,
			0,
			1
		],
		"8634": [
			.08198,
			.58198,
			0,
			0,
			.77778
		],
		"8635": [
			.08198,
			.58198,
			0,
			0,
			.77778
		],
		"8638": [
			.19444,
			.69224,
			0,
			0,
			.41667
		],
		"8639": [
			.19444,
			.69224,
			0,
			0,
			.41667
		],
		"8642": [
			.19444,
			.69224,
			0,
			0,
			.41667
		],
		"8643": [
			.19444,
			.69224,
			0,
			0,
			.41667
		],
		"8644": [
			.1808,
			.675,
			0,
			0,
			1
		],
		"8646": [
			.1808,
			.675,
			0,
			0,
			1
		],
		"8647": [
			.1808,
			.675,
			0,
			0,
			1
		],
		"8648": [
			.19444,
			.69224,
			0,
			0,
			.83334
		],
		"8649": [
			.1808,
			.675,
			0,
			0,
			1
		],
		"8650": [
			.19444,
			.69224,
			0,
			0,
			.83334
		],
		"8651": [
			.01354,
			.52239,
			0,
			0,
			1
		],
		"8652": [
			.01354,
			.52239,
			0,
			0,
			1
		],
		"8653": [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		"8654": [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		"8655": [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		"8666": [
			.13667,
			.63667,
			0,
			0,
			1
		],
		"8667": [
			.13667,
			.63667,
			0,
			0,
			1
		],
		"8669": [
			-.13313,
			.37788,
			0,
			0,
			1
		],
		"8672": [
			-.064,
			.437,
			0,
			0,
			1.334
		],
		"8674": [
			-.064,
			.437,
			0,
			0,
			1.334
		],
		"8705": [
			0,
			.825,
			0,
			0,
			.5
		],
		"8708": [
			0,
			.68889,
			0,
			0,
			.55556
		],
		"8709": [
			.08167,
			.58167,
			0,
			0,
			.77778
		],
		"8717": [
			0,
			.43056,
			0,
			0,
			.42917
		],
		"8722": [
			-.03598,
			.46402,
			0,
			0,
			.5
		],
		"8724": [
			.08198,
			.69224,
			0,
			0,
			.77778
		],
		"8726": [
			.08167,
			.58167,
			0,
			0,
			.77778
		],
		"8733": [
			0,
			.69224,
			0,
			0,
			.77778
		],
		"8736": [
			0,
			.69224,
			0,
			0,
			.72222
		],
		"8737": [
			0,
			.69224,
			0,
			0,
			.72222
		],
		"8738": [
			.03517,
			.52239,
			0,
			0,
			.72222
		],
		"8739": [
			.08167,
			.58167,
			0,
			0,
			.22222
		],
		"8740": [
			.25142,
			.74111,
			0,
			0,
			.27778
		],
		"8741": [
			.08167,
			.58167,
			0,
			0,
			.38889
		],
		"8742": [
			.25142,
			.74111,
			0,
			0,
			.5
		],
		"8756": [
			0,
			.69224,
			0,
			0,
			.66667
		],
		"8757": [
			0,
			.69224,
			0,
			0,
			.66667
		],
		"8764": [
			-.13313,
			.36687,
			0,
			0,
			.77778
		],
		"8765": [
			-.13313,
			.37788,
			0,
			0,
			.77778
		],
		"8769": [
			-.13313,
			.36687,
			0,
			0,
			.77778
		],
		"8770": [
			-.03625,
			.46375,
			0,
			0,
			.77778
		],
		"8774": [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		"8776": [
			-.01688,
			.48312,
			0,
			0,
			.77778
		],
		"8778": [
			.08167,
			.58167,
			0,
			0,
			.77778
		],
		"8782": [
			.06062,
			.54986,
			0,
			0,
			.77778
		],
		"8783": [
			.06062,
			.54986,
			0,
			0,
			.77778
		],
		"8785": [
			.08198,
			.58198,
			0,
			0,
			.77778
		],
		"8786": [
			.08198,
			.58198,
			0,
			0,
			.77778
		],
		"8787": [
			.08198,
			.58198,
			0,
			0,
			.77778
		],
		"8790": [
			0,
			.69224,
			0,
			0,
			.77778
		],
		"8791": [
			.22958,
			.72958,
			0,
			0,
			.77778
		],
		"8796": [
			.08198,
			.91667,
			0,
			0,
			.77778
		],
		"8806": [
			.25583,
			.75583,
			0,
			0,
			.77778
		],
		"8807": [
			.25583,
			.75583,
			0,
			0,
			.77778
		],
		"8808": [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		"8809": [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		"8812": [
			.25583,
			.75583,
			0,
			0,
			.5
		],
		"8814": [
			.20576,
			.70576,
			0,
			0,
			.77778
		],
		"8815": [
			.20576,
			.70576,
			0,
			0,
			.77778
		],
		"8816": [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		"8817": [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		"8818": [
			.22958,
			.72958,
			0,
			0,
			.77778
		],
		"8819": [
			.22958,
			.72958,
			0,
			0,
			.77778
		],
		"8822": [
			.1808,
			.675,
			0,
			0,
			.77778
		],
		"8823": [
			.1808,
			.675,
			0,
			0,
			.77778
		],
		"8828": [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		"8829": [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		"8830": [
			.22958,
			.72958,
			0,
			0,
			.77778
		],
		"8831": [
			.22958,
			.72958,
			0,
			0,
			.77778
		],
		"8832": [
			.20576,
			.70576,
			0,
			0,
			.77778
		],
		"8833": [
			.20576,
			.70576,
			0,
			0,
			.77778
		],
		"8840": [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		"8841": [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		"8842": [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		"8843": [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		"8847": [
			.03517,
			.54986,
			0,
			0,
			.77778
		],
		"8848": [
			.03517,
			.54986,
			0,
			0,
			.77778
		],
		"8858": [
			.08198,
			.58198,
			0,
			0,
			.77778
		],
		"8859": [
			.08198,
			.58198,
			0,
			0,
			.77778
		],
		"8861": [
			.08198,
			.58198,
			0,
			0,
			.77778
		],
		"8862": [
			0,
			.675,
			0,
			0,
			.77778
		],
		"8863": [
			0,
			.675,
			0,
			0,
			.77778
		],
		"8864": [
			0,
			.675,
			0,
			0,
			.77778
		],
		"8865": [
			0,
			.675,
			0,
			0,
			.77778
		],
		"8872": [
			0,
			.69224,
			0,
			0,
			.61111
		],
		"8873": [
			0,
			.69224,
			0,
			0,
			.72222
		],
		"8874": [
			0,
			.69224,
			0,
			0,
			.88889
		],
		"8876": [
			0,
			.68889,
			0,
			0,
			.61111
		],
		"8877": [
			0,
			.68889,
			0,
			0,
			.61111
		],
		"8878": [
			0,
			.68889,
			0,
			0,
			.72222
		],
		"8879": [
			0,
			.68889,
			0,
			0,
			.72222
		],
		"8882": [
			.03517,
			.54986,
			0,
			0,
			.77778
		],
		"8883": [
			.03517,
			.54986,
			0,
			0,
			.77778
		],
		"8884": [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		"8885": [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		"8888": [
			0,
			.54986,
			0,
			0,
			1.11111
		],
		"8890": [
			.19444,
			.43056,
			0,
			0,
			.55556
		],
		"8891": [
			.19444,
			.69224,
			0,
			0,
			.61111
		],
		"8892": [
			.19444,
			.69224,
			0,
			0,
			.61111
		],
		"8901": [
			0,
			.54986,
			0,
			0,
			.27778
		],
		"8903": [
			.08167,
			.58167,
			0,
			0,
			.77778
		],
		"8905": [
			.08167,
			.58167,
			0,
			0,
			.77778
		],
		"8906": [
			.08167,
			.58167,
			0,
			0,
			.77778
		],
		"8907": [
			0,
			.69224,
			0,
			0,
			.77778
		],
		"8908": [
			0,
			.69224,
			0,
			0,
			.77778
		],
		"8909": [
			-.03598,
			.46402,
			0,
			0,
			.77778
		],
		"8910": [
			0,
			.54986,
			0,
			0,
			.76042
		],
		"8911": [
			0,
			.54986,
			0,
			0,
			.76042
		],
		"8912": [
			.03517,
			.54986,
			0,
			0,
			.77778
		],
		"8913": [
			.03517,
			.54986,
			0,
			0,
			.77778
		],
		"8914": [
			0,
			.54986,
			0,
			0,
			.66667
		],
		"8915": [
			0,
			.54986,
			0,
			0,
			.66667
		],
		"8916": [
			0,
			.69224,
			0,
			0,
			.66667
		],
		"8918": [
			.0391,
			.5391,
			0,
			0,
			.77778
		],
		"8919": [
			.0391,
			.5391,
			0,
			0,
			.77778
		],
		"8920": [
			.03517,
			.54986,
			0,
			0,
			1.33334
		],
		"8921": [
			.03517,
			.54986,
			0,
			0,
			1.33334
		],
		"8922": [
			.38569,
			.88569,
			0,
			0,
			.77778
		],
		"8923": [
			.38569,
			.88569,
			0,
			0,
			.77778
		],
		"8926": [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		"8927": [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		"8928": [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		"8929": [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		"8934": [
			.23222,
			.74111,
			0,
			0,
			.77778
		],
		"8935": [
			.23222,
			.74111,
			0,
			0,
			.77778
		],
		"8936": [
			.23222,
			.74111,
			0,
			0,
			.77778
		],
		"8937": [
			.23222,
			.74111,
			0,
			0,
			.77778
		],
		"8938": [
			.20576,
			.70576,
			0,
			0,
			.77778
		],
		"8939": [
			.20576,
			.70576,
			0,
			0,
			.77778
		],
		"8940": [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		"8941": [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		"8994": [
			.19444,
			.69224,
			0,
			0,
			.77778
		],
		"8995": [
			.19444,
			.69224,
			0,
			0,
			.77778
		],
		"9416": [
			.15559,
			.69224,
			0,
			0,
			.90222
		],
		"9484": [
			0,
			.69224,
			0,
			0,
			.5
		],
		"9488": [
			0,
			.69224,
			0,
			0,
			.5
		],
		"9492": [
			0,
			.37788,
			0,
			0,
			.5
		],
		"9496": [
			0,
			.37788,
			0,
			0,
			.5
		],
		"9585": [
			.19444,
			.68889,
			0,
			0,
			.88889
		],
		"9586": [
			.19444,
			.74111,
			0,
			0,
			.88889
		],
		"9632": [
			0,
			.675,
			0,
			0,
			.77778
		],
		"9633": [
			0,
			.675,
			0,
			0,
			.77778
		],
		"9650": [
			0,
			.54986,
			0,
			0,
			.72222
		],
		"9651": [
			0,
			.54986,
			0,
			0,
			.72222
		],
		"9654": [
			.03517,
			.54986,
			0,
			0,
			.77778
		],
		"9660": [
			0,
			.54986,
			0,
			0,
			.72222
		],
		"9661": [
			0,
			.54986,
			0,
			0,
			.72222
		],
		"9664": [
			.03517,
			.54986,
			0,
			0,
			.77778
		],
		"9674": [
			.11111,
			.69224,
			0,
			0,
			.66667
		],
		"9733": [
			.19444,
			.69224,
			0,
			0,
			.94445
		],
		"10003": [
			0,
			.69224,
			0,
			0,
			.83334
		],
		"10016": [
			0,
			.69224,
			0,
			0,
			.83334
		],
		"10731": [
			.11111,
			.69224,
			0,
			0,
			.66667
		],
		"10846": [
			.19444,
			.75583,
			0,
			0,
			.61111
		],
		"10877": [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		"10878": [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		"10885": [
			.25583,
			.75583,
			0,
			0,
			.77778
		],
		"10886": [
			.25583,
			.75583,
			0,
			0,
			.77778
		],
		"10887": [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		"10888": [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		"10889": [
			.26167,
			.75726,
			0,
			0,
			.77778
		],
		"10890": [
			.26167,
			.75726,
			0,
			0,
			.77778
		],
		"10891": [
			.48256,
			.98256,
			0,
			0,
			.77778
		],
		"10892": [
			.48256,
			.98256,
			0,
			0,
			.77778
		],
		"10901": [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		"10902": [
			.13667,
			.63667,
			0,
			0,
			.77778
		],
		"10933": [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		"10934": [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		"10935": [
			.26167,
			.75726,
			0,
			0,
			.77778
		],
		"10936": [
			.26167,
			.75726,
			0,
			0,
			.77778
		],
		"10937": [
			.26167,
			.75726,
			0,
			0,
			.77778
		],
		"10938": [
			.26167,
			.75726,
			0,
			0,
			.77778
		],
		"10949": [
			.25583,
			.75583,
			0,
			0,
			.77778
		],
		"10950": [
			.25583,
			.75583,
			0,
			0,
			.77778
		],
		"10955": [
			.28481,
			.79383,
			0,
			0,
			.77778
		],
		"10956": [
			.28481,
			.79383,
			0,
			0,
			.77778
		],
		"57350": [
			.08167,
			.58167,
			0,
			0,
			.22222
		],
		"57351": [
			.08167,
			.58167,
			0,
			0,
			.38889
		],
		"57352": [
			.08167,
			.58167,
			0,
			0,
			.77778
		],
		"57353": [
			0,
			.43056,
			.04028,
			0,
			.66667
		],
		"57356": [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		"57357": [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		"57358": [
			.41951,
			.91951,
			0,
			0,
			.77778
		],
		"57359": [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		"57360": [
			.30274,
			.79383,
			0,
			0,
			.77778
		],
		"57361": [
			.41951,
			.91951,
			0,
			0,
			.77778
		],
		"57366": [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		"57367": [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		"57368": [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		"57369": [
			.25142,
			.75726,
			0,
			0,
			.77778
		],
		"57370": [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		"57371": [
			.13597,
			.63597,
			0,
			0,
			.77778
		]
	},
	"Caligraphic-Regular": {
		"32": [
			0,
			0,
			0,
			0,
			.25
		],
		"65": [
			0,
			.68333,
			0,
			.19445,
			.79847
		],
		"66": [
			0,
			.68333,
			.03041,
			.13889,
			.65681
		],
		"67": [
			0,
			.68333,
			.05834,
			.13889,
			.52653
		],
		"68": [
			0,
			.68333,
			.02778,
			.08334,
			.77139
		],
		"69": [
			0,
			.68333,
			.08944,
			.11111,
			.52778
		],
		"70": [
			0,
			.68333,
			.09931,
			.11111,
			.71875
		],
		"71": [
			.09722,
			.68333,
			.0593,
			.11111,
			.59487
		],
		"72": [
			0,
			.68333,
			.00965,
			.11111,
			.84452
		],
		"73": [
			0,
			.68333,
			.07382,
			0,
			.54452
		],
		"74": [
			.09722,
			.68333,
			.18472,
			.16667,
			.67778
		],
		"75": [
			0,
			.68333,
			.01445,
			.05556,
			.76195
		],
		"76": [
			0,
			.68333,
			0,
			.13889,
			.68972
		],
		"77": [
			0,
			.68333,
			0,
			.13889,
			1.2009
		],
		"78": [
			0,
			.68333,
			.14736,
			.08334,
			.82049
		],
		"79": [
			0,
			.68333,
			.02778,
			.11111,
			.79611
		],
		"80": [
			0,
			.68333,
			.08222,
			.08334,
			.69556
		],
		"81": [
			.09722,
			.68333,
			0,
			.11111,
			.81667
		],
		"82": [
			0,
			.68333,
			0,
			.08334,
			.8475
		],
		"83": [
			0,
			.68333,
			.075,
			.13889,
			.60556
		],
		"84": [
			0,
			.68333,
			.25417,
			0,
			.54464
		],
		"85": [
			0,
			.68333,
			.09931,
			.08334,
			.62583
		],
		"86": [
			0,
			.68333,
			.08222,
			0,
			.61278
		],
		"87": [
			0,
			.68333,
			.08222,
			.08334,
			.98778
		],
		"88": [
			0,
			.68333,
			.14643,
			.13889,
			.7133
		],
		"89": [
			.09722,
			.68333,
			.08222,
			.08334,
			.66834
		],
		"90": [
			0,
			.68333,
			.07944,
			.13889,
			.72473
		],
		"160": [
			0,
			0,
			0,
			0,
			.25
		]
	},
	"Fraktur-Regular": {
		"32": [
			0,
			0,
			0,
			0,
			.25
		],
		"33": [
			0,
			.69141,
			0,
			0,
			.29574
		],
		"34": [
			0,
			.69141,
			0,
			0,
			.21471
		],
		"38": [
			0,
			.69141,
			0,
			0,
			.73786
		],
		"39": [
			0,
			.69141,
			0,
			0,
			.21201
		],
		"40": [
			.24982,
			.74947,
			0,
			0,
			.38865
		],
		"41": [
			.24982,
			.74947,
			0,
			0,
			.38865
		],
		"42": [
			0,
			.62119,
			0,
			0,
			.27764
		],
		"43": [
			.08319,
			.58283,
			0,
			0,
			.75623
		],
		"44": [
			0,
			.10803,
			0,
			0,
			.27764
		],
		"45": [
			.08319,
			.58283,
			0,
			0,
			.75623
		],
		"46": [
			0,
			.10803,
			0,
			0,
			.27764
		],
		"47": [
			.24982,
			.74947,
			0,
			0,
			.50181
		],
		"48": [
			0,
			.47534,
			0,
			0,
			.50181
		],
		"49": [
			0,
			.47534,
			0,
			0,
			.50181
		],
		"50": [
			0,
			.47534,
			0,
			0,
			.50181
		],
		"51": [
			.18906,
			.47534,
			0,
			0,
			.50181
		],
		"52": [
			.18906,
			.47534,
			0,
			0,
			.50181
		],
		"53": [
			.18906,
			.47534,
			0,
			0,
			.50181
		],
		"54": [
			0,
			.69141,
			0,
			0,
			.50181
		],
		"55": [
			.18906,
			.47534,
			0,
			0,
			.50181
		],
		"56": [
			0,
			.69141,
			0,
			0,
			.50181
		],
		"57": [
			.18906,
			.47534,
			0,
			0,
			.50181
		],
		"58": [
			0,
			.47534,
			0,
			0,
			.21606
		],
		"59": [
			.12604,
			.47534,
			0,
			0,
			.21606
		],
		"61": [
			-.13099,
			.36866,
			0,
			0,
			.75623
		],
		"63": [
			0,
			.69141,
			0,
			0,
			.36245
		],
		"65": [
			0,
			.69141,
			0,
			0,
			.7176
		],
		"66": [
			0,
			.69141,
			0,
			0,
			.88397
		],
		"67": [
			0,
			.69141,
			0,
			0,
			.61254
		],
		"68": [
			0,
			.69141,
			0,
			0,
			.83158
		],
		"69": [
			0,
			.69141,
			0,
			0,
			.66278
		],
		"70": [
			.12604,
			.69141,
			0,
			0,
			.61119
		],
		"71": [
			0,
			.69141,
			0,
			0,
			.78539
		],
		"72": [
			.06302,
			.69141,
			0,
			0,
			.7203
		],
		"73": [
			0,
			.69141,
			0,
			0,
			.55448
		],
		"74": [
			.12604,
			.69141,
			0,
			0,
			.55231
		],
		"75": [
			0,
			.69141,
			0,
			0,
			.66845
		],
		"76": [
			0,
			.69141,
			0,
			0,
			.66602
		],
		"77": [
			0,
			.69141,
			0,
			0,
			1.04953
		],
		"78": [
			0,
			.69141,
			0,
			0,
			.83212
		],
		"79": [
			0,
			.69141,
			0,
			0,
			.82699
		],
		"80": [
			.18906,
			.69141,
			0,
			0,
			.82753
		],
		"81": [
			.03781,
			.69141,
			0,
			0,
			.82699
		],
		"82": [
			0,
			.69141,
			0,
			0,
			.82807
		],
		"83": [
			0,
			.69141,
			0,
			0,
			.82861
		],
		"84": [
			0,
			.69141,
			0,
			0,
			.66899
		],
		"85": [
			0,
			.69141,
			0,
			0,
			.64576
		],
		"86": [
			0,
			.69141,
			0,
			0,
			.83131
		],
		"87": [
			0,
			.69141,
			0,
			0,
			1.04602
		],
		"88": [
			0,
			.69141,
			0,
			0,
			.71922
		],
		"89": [
			.18906,
			.69141,
			0,
			0,
			.83293
		],
		"90": [
			.12604,
			.69141,
			0,
			0,
			.60201
		],
		"91": [
			.24982,
			.74947,
			0,
			0,
			.27764
		],
		"93": [
			.24982,
			.74947,
			0,
			0,
			.27764
		],
		"94": [
			0,
			.69141,
			0,
			0,
			.49965
		],
		"97": [
			0,
			.47534,
			0,
			0,
			.50046
		],
		"98": [
			0,
			.69141,
			0,
			0,
			.51315
		],
		"99": [
			0,
			.47534,
			0,
			0,
			.38946
		],
		"100": [
			0,
			.62119,
			0,
			0,
			.49857
		],
		"101": [
			0,
			.47534,
			0,
			0,
			.40053
		],
		"102": [
			.18906,
			.69141,
			0,
			0,
			.32626
		],
		"103": [
			.18906,
			.47534,
			0,
			0,
			.5037
		],
		"104": [
			.18906,
			.69141,
			0,
			0,
			.52126
		],
		"105": [
			0,
			.69141,
			0,
			0,
			.27899
		],
		"106": [
			0,
			.69141,
			0,
			0,
			.28088
		],
		"107": [
			0,
			.69141,
			0,
			0,
			.38946
		],
		"108": [
			0,
			.69141,
			0,
			0,
			.27953
		],
		"109": [
			0,
			.47534,
			0,
			0,
			.76676
		],
		"110": [
			0,
			.47534,
			0,
			0,
			.52666
		],
		"111": [
			0,
			.47534,
			0,
			0,
			.48885
		],
		"112": [
			.18906,
			.52396,
			0,
			0,
			.50046
		],
		"113": [
			.18906,
			.47534,
			0,
			0,
			.48912
		],
		"114": [
			0,
			.47534,
			0,
			0,
			.38919
		],
		"115": [
			0,
			.47534,
			0,
			0,
			.44266
		],
		"116": [
			0,
			.62119,
			0,
			0,
			.33301
		],
		"117": [
			0,
			.47534,
			0,
			0,
			.5172
		],
		"118": [
			0,
			.52396,
			0,
			0,
			.5118
		],
		"119": [
			0,
			.52396,
			0,
			0,
			.77351
		],
		"120": [
			.18906,
			.47534,
			0,
			0,
			.38865
		],
		"121": [
			.18906,
			.47534,
			0,
			0,
			.49884
		],
		"122": [
			.18906,
			.47534,
			0,
			0,
			.39054
		],
		"160": [
			0,
			0,
			0,
			0,
			.25
		],
		"8216": [
			0,
			.69141,
			0,
			0,
			.21471
		],
		"8217": [
			0,
			.69141,
			0,
			0,
			.21471
		],
		"58112": [
			0,
			.62119,
			0,
			0,
			.49749
		],
		"58113": [
			0,
			.62119,
			0,
			0,
			.4983
		],
		"58114": [
			.18906,
			.69141,
			0,
			0,
			.33328
		],
		"58115": [
			.18906,
			.69141,
			0,
			0,
			.32923
		],
		"58116": [
			.18906,
			.47534,
			0,
			0,
			.50343
		],
		"58117": [
			0,
			.69141,
			0,
			0,
			.33301
		],
		"58118": [
			0,
			.62119,
			0,
			0,
			.33409
		],
		"58119": [
			0,
			.47534,
			0,
			0,
			.50073
		]
	},
	"Main-Bold": {
		"32": [
			0,
			0,
			0,
			0,
			.25
		],
		"33": [
			0,
			.69444,
			0,
			0,
			.35
		],
		"34": [
			0,
			.69444,
			0,
			0,
			.60278
		],
		"35": [
			.19444,
			.69444,
			0,
			0,
			.95833
		],
		"36": [
			.05556,
			.75,
			0,
			0,
			.575
		],
		"37": [
			.05556,
			.75,
			0,
			0,
			.95833
		],
		"38": [
			0,
			.69444,
			0,
			0,
			.89444
		],
		"39": [
			0,
			.69444,
			0,
			0,
			.31944
		],
		"40": [
			.25,
			.75,
			0,
			0,
			.44722
		],
		"41": [
			.25,
			.75,
			0,
			0,
			.44722
		],
		"42": [
			0,
			.75,
			0,
			0,
			.575
		],
		"43": [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		"44": [
			.19444,
			.15556,
			0,
			0,
			.31944
		],
		"45": [
			0,
			.44444,
			0,
			0,
			.38333
		],
		"46": [
			0,
			.15556,
			0,
			0,
			.31944
		],
		"47": [
			.25,
			.75,
			0,
			0,
			.575
		],
		"48": [
			0,
			.64444,
			0,
			0,
			.575
		],
		"49": [
			0,
			.64444,
			0,
			0,
			.575
		],
		"50": [
			0,
			.64444,
			0,
			0,
			.575
		],
		"51": [
			0,
			.64444,
			0,
			0,
			.575
		],
		"52": [
			0,
			.64444,
			0,
			0,
			.575
		],
		"53": [
			0,
			.64444,
			0,
			0,
			.575
		],
		"54": [
			0,
			.64444,
			0,
			0,
			.575
		],
		"55": [
			0,
			.64444,
			0,
			0,
			.575
		],
		"56": [
			0,
			.64444,
			0,
			0,
			.575
		],
		"57": [
			0,
			.64444,
			0,
			0,
			.575
		],
		"58": [
			0,
			.44444,
			0,
			0,
			.31944
		],
		"59": [
			.19444,
			.44444,
			0,
			0,
			.31944
		],
		"60": [
			.08556,
			.58556,
			0,
			0,
			.89444
		],
		"61": [
			-.10889,
			.39111,
			0,
			0,
			.89444
		],
		"62": [
			.08556,
			.58556,
			0,
			0,
			.89444
		],
		"63": [
			0,
			.69444,
			0,
			0,
			.54305
		],
		"64": [
			0,
			.69444,
			0,
			0,
			.89444
		],
		"65": [
			0,
			.68611,
			0,
			0,
			.86944
		],
		"66": [
			0,
			.68611,
			0,
			0,
			.81805
		],
		"67": [
			0,
			.68611,
			0,
			0,
			.83055
		],
		"68": [
			0,
			.68611,
			0,
			0,
			.88194
		],
		"69": [
			0,
			.68611,
			0,
			0,
			.75555
		],
		"70": [
			0,
			.68611,
			0,
			0,
			.72361
		],
		"71": [
			0,
			.68611,
			0,
			0,
			.90416
		],
		"72": [
			0,
			.68611,
			0,
			0,
			.9
		],
		"73": [
			0,
			.68611,
			0,
			0,
			.43611
		],
		"74": [
			0,
			.68611,
			0,
			0,
			.59444
		],
		"75": [
			0,
			.68611,
			0,
			0,
			.90138
		],
		"76": [
			0,
			.68611,
			0,
			0,
			.69166
		],
		"77": [
			0,
			.68611,
			0,
			0,
			1.09166
		],
		"78": [
			0,
			.68611,
			0,
			0,
			.9
		],
		"79": [
			0,
			.68611,
			0,
			0,
			.86388
		],
		"80": [
			0,
			.68611,
			0,
			0,
			.78611
		],
		"81": [
			.19444,
			.68611,
			0,
			0,
			.86388
		],
		"82": [
			0,
			.68611,
			0,
			0,
			.8625
		],
		"83": [
			0,
			.68611,
			0,
			0,
			.63889
		],
		"84": [
			0,
			.68611,
			0,
			0,
			.8
		],
		"85": [
			0,
			.68611,
			0,
			0,
			.88472
		],
		"86": [
			0,
			.68611,
			.01597,
			0,
			.86944
		],
		"87": [
			0,
			.68611,
			.01597,
			0,
			1.18888
		],
		"88": [
			0,
			.68611,
			0,
			0,
			.86944
		],
		"89": [
			0,
			.68611,
			.02875,
			0,
			.86944
		],
		"90": [
			0,
			.68611,
			0,
			0,
			.70277
		],
		"91": [
			.25,
			.75,
			0,
			0,
			.31944
		],
		"92": [
			.25,
			.75,
			0,
			0,
			.575
		],
		"93": [
			.25,
			.75,
			0,
			0,
			.31944
		],
		"94": [
			0,
			.69444,
			0,
			0,
			.575
		],
		"95": [
			.31,
			.13444,
			.03194,
			0,
			.575
		],
		"97": [
			0,
			.44444,
			0,
			0,
			.55902
		],
		"98": [
			0,
			.69444,
			0,
			0,
			.63889
		],
		"99": [
			0,
			.44444,
			0,
			0,
			.51111
		],
		"100": [
			0,
			.69444,
			0,
			0,
			.63889
		],
		"101": [
			0,
			.44444,
			0,
			0,
			.52708
		],
		"102": [
			0,
			.69444,
			.10903,
			0,
			.35139
		],
		"103": [
			.19444,
			.44444,
			.01597,
			0,
			.575
		],
		"104": [
			0,
			.69444,
			0,
			0,
			.63889
		],
		"105": [
			0,
			.69444,
			0,
			0,
			.31944
		],
		"106": [
			.19444,
			.69444,
			0,
			0,
			.35139
		],
		"107": [
			0,
			.69444,
			0,
			0,
			.60694
		],
		"108": [
			0,
			.69444,
			0,
			0,
			.31944
		],
		"109": [
			0,
			.44444,
			0,
			0,
			.95833
		],
		"110": [
			0,
			.44444,
			0,
			0,
			.63889
		],
		"111": [
			0,
			.44444,
			0,
			0,
			.575
		],
		"112": [
			.19444,
			.44444,
			0,
			0,
			.63889
		],
		"113": [
			.19444,
			.44444,
			0,
			0,
			.60694
		],
		"114": [
			0,
			.44444,
			0,
			0,
			.47361
		],
		"115": [
			0,
			.44444,
			0,
			0,
			.45361
		],
		"116": [
			0,
			.63492,
			0,
			0,
			.44722
		],
		"117": [
			0,
			.44444,
			0,
			0,
			.63889
		],
		"118": [
			0,
			.44444,
			.01597,
			0,
			.60694
		],
		"119": [
			0,
			.44444,
			.01597,
			0,
			.83055
		],
		"120": [
			0,
			.44444,
			0,
			0,
			.60694
		],
		"121": [
			.19444,
			.44444,
			.01597,
			0,
			.60694
		],
		"122": [
			0,
			.44444,
			0,
			0,
			.51111
		],
		"123": [
			.25,
			.75,
			0,
			0,
			.575
		],
		"124": [
			.25,
			.75,
			0,
			0,
			.31944
		],
		"125": [
			.25,
			.75,
			0,
			0,
			.575
		],
		"126": [
			.35,
			.34444,
			0,
			0,
			.575
		],
		"160": [
			0,
			0,
			0,
			0,
			.25
		],
		"163": [
			0,
			.69444,
			0,
			0,
			.86853
		],
		"168": [
			0,
			.69444,
			0,
			0,
			.575
		],
		"172": [
			0,
			.44444,
			0,
			0,
			.76666
		],
		"176": [
			0,
			.69444,
			0,
			0,
			.86944
		],
		"177": [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		"184": [
			.17014,
			0,
			0,
			0,
			.51111
		],
		"198": [
			0,
			.68611,
			0,
			0,
			1.04166
		],
		"215": [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		"216": [
			.04861,
			.73472,
			0,
			0,
			.89444
		],
		"223": [
			0,
			.69444,
			0,
			0,
			.59722
		],
		"230": [
			0,
			.44444,
			0,
			0,
			.83055
		],
		"247": [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		"248": [
			.09722,
			.54167,
			0,
			0,
			.575
		],
		"305": [
			0,
			.44444,
			0,
			0,
			.31944
		],
		"338": [
			0,
			.68611,
			0,
			0,
			1.16944
		],
		"339": [
			0,
			.44444,
			0,
			0,
			.89444
		],
		"567": [
			.19444,
			.44444,
			0,
			0,
			.35139
		],
		"710": [
			0,
			.69444,
			0,
			0,
			.575
		],
		"711": [
			0,
			.63194,
			0,
			0,
			.575
		],
		"713": [
			0,
			.59611,
			0,
			0,
			.575
		],
		"714": [
			0,
			.69444,
			0,
			0,
			.575
		],
		"715": [
			0,
			.69444,
			0,
			0,
			.575
		],
		"728": [
			0,
			.69444,
			0,
			0,
			.575
		],
		"729": [
			0,
			.69444,
			0,
			0,
			.31944
		],
		"730": [
			0,
			.69444,
			0,
			0,
			.86944
		],
		"732": [
			0,
			.69444,
			0,
			0,
			.575
		],
		"733": [
			0,
			.69444,
			0,
			0,
			.575
		],
		"915": [
			0,
			.68611,
			0,
			0,
			.69166
		],
		"916": [
			0,
			.68611,
			0,
			0,
			.95833
		],
		"920": [
			0,
			.68611,
			0,
			0,
			.89444
		],
		"923": [
			0,
			.68611,
			0,
			0,
			.80555
		],
		"926": [
			0,
			.68611,
			0,
			0,
			.76666
		],
		"928": [
			0,
			.68611,
			0,
			0,
			.9
		],
		"931": [
			0,
			.68611,
			0,
			0,
			.83055
		],
		"933": [
			0,
			.68611,
			0,
			0,
			.89444
		],
		"934": [
			0,
			.68611,
			0,
			0,
			.83055
		],
		"936": [
			0,
			.68611,
			0,
			0,
			.89444
		],
		"937": [
			0,
			.68611,
			0,
			0,
			.83055
		],
		"8211": [
			0,
			.44444,
			.03194,
			0,
			.575
		],
		"8212": [
			0,
			.44444,
			.03194,
			0,
			1.14999
		],
		"8216": [
			0,
			.69444,
			0,
			0,
			.31944
		],
		"8217": [
			0,
			.69444,
			0,
			0,
			.31944
		],
		"8220": [
			0,
			.69444,
			0,
			0,
			.60278
		],
		"8221": [
			0,
			.69444,
			0,
			0,
			.60278
		],
		"8224": [
			.19444,
			.69444,
			0,
			0,
			.51111
		],
		"8225": [
			.19444,
			.69444,
			0,
			0,
			.51111
		],
		"8242": [
			0,
			.55556,
			0,
			0,
			.34444
		],
		"8407": [
			0,
			.72444,
			.15486,
			0,
			.575
		],
		"8463": [
			0,
			.69444,
			0,
			0,
			.66759
		],
		"8465": [
			0,
			.69444,
			0,
			0,
			.83055
		],
		"8467": [
			0,
			.69444,
			0,
			0,
			.47361
		],
		"8472": [
			.19444,
			.44444,
			0,
			0,
			.74027
		],
		"8476": [
			0,
			.69444,
			0,
			0,
			.83055
		],
		"8501": [
			0,
			.69444,
			0,
			0,
			.70277
		],
		"8592": [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		"8593": [
			.19444,
			.69444,
			0,
			0,
			.575
		],
		"8594": [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		"8595": [
			.19444,
			.69444,
			0,
			0,
			.575
		],
		"8596": [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		"8597": [
			.25,
			.75,
			0,
			0,
			.575
		],
		"8598": [
			.19444,
			.69444,
			0,
			0,
			1.14999
		],
		"8599": [
			.19444,
			.69444,
			0,
			0,
			1.14999
		],
		"8600": [
			.19444,
			.69444,
			0,
			0,
			1.14999
		],
		"8601": [
			.19444,
			.69444,
			0,
			0,
			1.14999
		],
		"8636": [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		"8637": [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		"8640": [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		"8641": [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		"8656": [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		"8657": [
			.19444,
			.69444,
			0,
			0,
			.70277
		],
		"8658": [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		"8659": [
			.19444,
			.69444,
			0,
			0,
			.70277
		],
		"8660": [
			-.10889,
			.39111,
			0,
			0,
			1.14999
		],
		"8661": [
			.25,
			.75,
			0,
			0,
			.70277
		],
		"8704": [
			0,
			.69444,
			0,
			0,
			.63889
		],
		"8706": [
			0,
			.69444,
			.06389,
			0,
			.62847
		],
		"8707": [
			0,
			.69444,
			0,
			0,
			.63889
		],
		"8709": [
			.05556,
			.75,
			0,
			0,
			.575
		],
		"8711": [
			0,
			.68611,
			0,
			0,
			.95833
		],
		"8712": [
			.08556,
			.58556,
			0,
			0,
			.76666
		],
		"8715": [
			.08556,
			.58556,
			0,
			0,
			.76666
		],
		"8722": [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		"8723": [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		"8725": [
			.25,
			.75,
			0,
			0,
			.575
		],
		"8726": [
			.25,
			.75,
			0,
			0,
			.575
		],
		"8727": [
			-.02778,
			.47222,
			0,
			0,
			.575
		],
		"8728": [
			-.02639,
			.47361,
			0,
			0,
			.575
		],
		"8729": [
			-.02639,
			.47361,
			0,
			0,
			.575
		],
		"8730": [
			.18,
			.82,
			0,
			0,
			.95833
		],
		"8733": [
			0,
			.44444,
			0,
			0,
			.89444
		],
		"8734": [
			0,
			.44444,
			0,
			0,
			1.14999
		],
		"8736": [
			0,
			.69224,
			0,
			0,
			.72222
		],
		"8739": [
			.25,
			.75,
			0,
			0,
			.31944
		],
		"8741": [
			.25,
			.75,
			0,
			0,
			.575
		],
		"8743": [
			0,
			.55556,
			0,
			0,
			.76666
		],
		"8744": [
			0,
			.55556,
			0,
			0,
			.76666
		],
		"8745": [
			0,
			.55556,
			0,
			0,
			.76666
		],
		"8746": [
			0,
			.55556,
			0,
			0,
			.76666
		],
		"8747": [
			.19444,
			.69444,
			.12778,
			0,
			.56875
		],
		"8764": [
			-.10889,
			.39111,
			0,
			0,
			.89444
		],
		"8768": [
			.19444,
			.69444,
			0,
			0,
			.31944
		],
		"8771": [
			.00222,
			.50222,
			0,
			0,
			.89444
		],
		"8773": [
			.027,
			.638,
			0,
			0,
			.894
		],
		"8776": [
			.02444,
			.52444,
			0,
			0,
			.89444
		],
		"8781": [
			.00222,
			.50222,
			0,
			0,
			.89444
		],
		"8801": [
			.00222,
			.50222,
			0,
			0,
			.89444
		],
		"8804": [
			.19667,
			.69667,
			0,
			0,
			.89444
		],
		"8805": [
			.19667,
			.69667,
			0,
			0,
			.89444
		],
		"8810": [
			.08556,
			.58556,
			0,
			0,
			1.14999
		],
		"8811": [
			.08556,
			.58556,
			0,
			0,
			1.14999
		],
		"8826": [
			.08556,
			.58556,
			0,
			0,
			.89444
		],
		"8827": [
			.08556,
			.58556,
			0,
			0,
			.89444
		],
		"8834": [
			.08556,
			.58556,
			0,
			0,
			.89444
		],
		"8835": [
			.08556,
			.58556,
			0,
			0,
			.89444
		],
		"8838": [
			.19667,
			.69667,
			0,
			0,
			.89444
		],
		"8839": [
			.19667,
			.69667,
			0,
			0,
			.89444
		],
		"8846": [
			0,
			.55556,
			0,
			0,
			.76666
		],
		"8849": [
			.19667,
			.69667,
			0,
			0,
			.89444
		],
		"8850": [
			.19667,
			.69667,
			0,
			0,
			.89444
		],
		"8851": [
			0,
			.55556,
			0,
			0,
			.76666
		],
		"8852": [
			0,
			.55556,
			0,
			0,
			.76666
		],
		"8853": [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		"8854": [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		"8855": [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		"8856": [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		"8857": [
			.13333,
			.63333,
			0,
			0,
			.89444
		],
		"8866": [
			0,
			.69444,
			0,
			0,
			.70277
		],
		"8867": [
			0,
			.69444,
			0,
			0,
			.70277
		],
		"8868": [
			0,
			.69444,
			0,
			0,
			.89444
		],
		"8869": [
			0,
			.69444,
			0,
			0,
			.89444
		],
		"8900": [
			-.02639,
			.47361,
			0,
			0,
			.575
		],
		"8901": [
			-.02639,
			.47361,
			0,
			0,
			.31944
		],
		"8902": [
			-.02778,
			.47222,
			0,
			0,
			.575
		],
		"8968": [
			.25,
			.75,
			0,
			0,
			.51111
		],
		"8969": [
			.25,
			.75,
			0,
			0,
			.51111
		],
		"8970": [
			.25,
			.75,
			0,
			0,
			.51111
		],
		"8971": [
			.25,
			.75,
			0,
			0,
			.51111
		],
		"8994": [
			-.13889,
			.36111,
			0,
			0,
			1.14999
		],
		"8995": [
			-.13889,
			.36111,
			0,
			0,
			1.14999
		],
		"9651": [
			.19444,
			.69444,
			0,
			0,
			1.02222
		],
		"9657": [
			-.02778,
			.47222,
			0,
			0,
			.575
		],
		"9661": [
			.19444,
			.69444,
			0,
			0,
			1.02222
		],
		"9667": [
			-.02778,
			.47222,
			0,
			0,
			.575
		],
		"9711": [
			.19444,
			.69444,
			0,
			0,
			1.14999
		],
		"9824": [
			.12963,
			.69444,
			0,
			0,
			.89444
		],
		"9825": [
			.12963,
			.69444,
			0,
			0,
			.89444
		],
		"9826": [
			.12963,
			.69444,
			0,
			0,
			.89444
		],
		"9827": [
			.12963,
			.69444,
			0,
			0,
			.89444
		],
		"9837": [
			0,
			.75,
			0,
			0,
			.44722
		],
		"9838": [
			.19444,
			.69444,
			0,
			0,
			.44722
		],
		"9839": [
			.19444,
			.69444,
			0,
			0,
			.44722
		],
		"10216": [
			.25,
			.75,
			0,
			0,
			.44722
		],
		"10217": [
			.25,
			.75,
			0,
			0,
			.44722
		],
		"10815": [
			0,
			.68611,
			0,
			0,
			.9
		],
		"10927": [
			.19667,
			.69667,
			0,
			0,
			.89444
		],
		"10928": [
			.19667,
			.69667,
			0,
			0,
			.89444
		],
		"57376": [
			.19444,
			.69444,
			0,
			0,
			0
		]
	},
	"Main-BoldItalic": {
		"32": [
			0,
			0,
			0,
			0,
			.25
		],
		"33": [
			0,
			.69444,
			.11417,
			0,
			.38611
		],
		"34": [
			0,
			.69444,
			.07939,
			0,
			.62055
		],
		"35": [
			.19444,
			.69444,
			.06833,
			0,
			.94444
		],
		"37": [
			.05556,
			.75,
			.12861,
			0,
			.94444
		],
		"38": [
			0,
			.69444,
			.08528,
			0,
			.88555
		],
		"39": [
			0,
			.69444,
			.12945,
			0,
			.35555
		],
		"40": [
			.25,
			.75,
			.15806,
			0,
			.47333
		],
		"41": [
			.25,
			.75,
			.03306,
			0,
			.47333
		],
		"42": [
			0,
			.75,
			.14333,
			0,
			.59111
		],
		"43": [
			.10333,
			.60333,
			.03306,
			0,
			.88555
		],
		"44": [
			.19444,
			.14722,
			0,
			0,
			.35555
		],
		"45": [
			0,
			.44444,
			.02611,
			0,
			.41444
		],
		"46": [
			0,
			.14722,
			0,
			0,
			.35555
		],
		"47": [
			.25,
			.75,
			.15806,
			0,
			.59111
		],
		"48": [
			0,
			.64444,
			.13167,
			0,
			.59111
		],
		"49": [
			0,
			.64444,
			.13167,
			0,
			.59111
		],
		"50": [
			0,
			.64444,
			.13167,
			0,
			.59111
		],
		"51": [
			0,
			.64444,
			.13167,
			0,
			.59111
		],
		"52": [
			.19444,
			.64444,
			.13167,
			0,
			.59111
		],
		"53": [
			0,
			.64444,
			.13167,
			0,
			.59111
		],
		"54": [
			0,
			.64444,
			.13167,
			0,
			.59111
		],
		"55": [
			.19444,
			.64444,
			.13167,
			0,
			.59111
		],
		"56": [
			0,
			.64444,
			.13167,
			0,
			.59111
		],
		"57": [
			0,
			.64444,
			.13167,
			0,
			.59111
		],
		"58": [
			0,
			.44444,
			.06695,
			0,
			.35555
		],
		"59": [
			.19444,
			.44444,
			.06695,
			0,
			.35555
		],
		"61": [
			-.10889,
			.39111,
			.06833,
			0,
			.88555
		],
		"63": [
			0,
			.69444,
			.11472,
			0,
			.59111
		],
		"64": [
			0,
			.69444,
			.09208,
			0,
			.88555
		],
		"65": [
			0,
			.68611,
			0,
			0,
			.86555
		],
		"66": [
			0,
			.68611,
			.0992,
			0,
			.81666
		],
		"67": [
			0,
			.68611,
			.14208,
			0,
			.82666
		],
		"68": [
			0,
			.68611,
			.09062,
			0,
			.87555
		],
		"69": [
			0,
			.68611,
			.11431,
			0,
			.75666
		],
		"70": [
			0,
			.68611,
			.12903,
			0,
			.72722
		],
		"71": [
			0,
			.68611,
			.07347,
			0,
			.89527
		],
		"72": [
			0,
			.68611,
			.17208,
			0,
			.8961
		],
		"73": [
			0,
			.68611,
			.15681,
			0,
			.47166
		],
		"74": [
			0,
			.68611,
			.145,
			0,
			.61055
		],
		"75": [
			0,
			.68611,
			.14208,
			0,
			.89499
		],
		"76": [
			0,
			.68611,
			0,
			0,
			.69777
		],
		"77": [
			0,
			.68611,
			.17208,
			0,
			1.07277
		],
		"78": [
			0,
			.68611,
			.17208,
			0,
			.8961
		],
		"79": [
			0,
			.68611,
			.09062,
			0,
			.85499
		],
		"80": [
			0,
			.68611,
			.0992,
			0,
			.78721
		],
		"81": [
			.19444,
			.68611,
			.09062,
			0,
			.85499
		],
		"82": [
			0,
			.68611,
			.02559,
			0,
			.85944
		],
		"83": [
			0,
			.68611,
			.11264,
			0,
			.64999
		],
		"84": [
			0,
			.68611,
			.12903,
			0,
			.7961
		],
		"85": [
			0,
			.68611,
			.17208,
			0,
			.88083
		],
		"86": [
			0,
			.68611,
			.18625,
			0,
			.86555
		],
		"87": [
			0,
			.68611,
			.18625,
			0,
			1.15999
		],
		"88": [
			0,
			.68611,
			.15681,
			0,
			.86555
		],
		"89": [
			0,
			.68611,
			.19803,
			0,
			.86555
		],
		"90": [
			0,
			.68611,
			.14208,
			0,
			.70888
		],
		"91": [
			.25,
			.75,
			.1875,
			0,
			.35611
		],
		"93": [
			.25,
			.75,
			.09972,
			0,
			.35611
		],
		"94": [
			0,
			.69444,
			.06709,
			0,
			.59111
		],
		"95": [
			.31,
			.13444,
			.09811,
			0,
			.59111
		],
		"97": [
			0,
			.44444,
			.09426,
			0,
			.59111
		],
		"98": [
			0,
			.69444,
			.07861,
			0,
			.53222
		],
		"99": [
			0,
			.44444,
			.05222,
			0,
			.53222
		],
		"100": [
			0,
			.69444,
			.10861,
			0,
			.59111
		],
		"101": [
			0,
			.44444,
			.085,
			0,
			.53222
		],
		"102": [
			.19444,
			.69444,
			.21778,
			0,
			.4
		],
		"103": [
			.19444,
			.44444,
			.105,
			0,
			.53222
		],
		"104": [
			0,
			.69444,
			.09426,
			0,
			.59111
		],
		"105": [
			0,
			.69326,
			.11387,
			0,
			.35555
		],
		"106": [
			.19444,
			.69326,
			.1672,
			0,
			.35555
		],
		"107": [
			0,
			.69444,
			.11111,
			0,
			.53222
		],
		"108": [
			0,
			.69444,
			.10861,
			0,
			.29666
		],
		"109": [
			0,
			.44444,
			.09426,
			0,
			.94444
		],
		"110": [
			0,
			.44444,
			.09426,
			0,
			.64999
		],
		"111": [
			0,
			.44444,
			.07861,
			0,
			.59111
		],
		"112": [
			.19444,
			.44444,
			.07861,
			0,
			.59111
		],
		"113": [
			.19444,
			.44444,
			.105,
			0,
			.53222
		],
		"114": [
			0,
			.44444,
			.11111,
			0,
			.50167
		],
		"115": [
			0,
			.44444,
			.08167,
			0,
			.48694
		],
		"116": [
			0,
			.63492,
			.09639,
			0,
			.385
		],
		"117": [
			0,
			.44444,
			.09426,
			0,
			.62055
		],
		"118": [
			0,
			.44444,
			.11111,
			0,
			.53222
		],
		"119": [
			0,
			.44444,
			.11111,
			0,
			.76777
		],
		"120": [
			0,
			.44444,
			.12583,
			0,
			.56055
		],
		"121": [
			.19444,
			.44444,
			.105,
			0,
			.56166
		],
		"122": [
			0,
			.44444,
			.13889,
			0,
			.49055
		],
		"126": [
			.35,
			.34444,
			.11472,
			0,
			.59111
		],
		"160": [
			0,
			0,
			0,
			0,
			.25
		],
		"168": [
			0,
			.69444,
			.11473,
			0,
			.59111
		],
		"176": [
			0,
			.69444,
			0,
			0,
			.94888
		],
		"184": [
			.17014,
			0,
			0,
			0,
			.53222
		],
		"198": [
			0,
			.68611,
			.11431,
			0,
			1.02277
		],
		"216": [
			.04861,
			.73472,
			.09062,
			0,
			.88555
		],
		"223": [
			.19444,
			.69444,
			.09736,
			0,
			.665
		],
		"230": [
			0,
			.44444,
			.085,
			0,
			.82666
		],
		"248": [
			.09722,
			.54167,
			.09458,
			0,
			.59111
		],
		"305": [
			0,
			.44444,
			.09426,
			0,
			.35555
		],
		"338": [
			0,
			.68611,
			.11431,
			0,
			1.14054
		],
		"339": [
			0,
			.44444,
			.085,
			0,
			.82666
		],
		"567": [
			.19444,
			.44444,
			.04611,
			0,
			.385
		],
		"710": [
			0,
			.69444,
			.06709,
			0,
			.59111
		],
		"711": [
			0,
			.63194,
			.08271,
			0,
			.59111
		],
		"713": [
			0,
			.59444,
			.10444,
			0,
			.59111
		],
		"714": [
			0,
			.69444,
			.08528,
			0,
			.59111
		],
		"715": [
			0,
			.69444,
			0,
			0,
			.59111
		],
		"728": [
			0,
			.69444,
			.10333,
			0,
			.59111
		],
		"729": [
			0,
			.69444,
			.12945,
			0,
			.35555
		],
		"730": [
			0,
			.69444,
			0,
			0,
			.94888
		],
		"732": [
			0,
			.69444,
			.11472,
			0,
			.59111
		],
		"733": [
			0,
			.69444,
			.11472,
			0,
			.59111
		],
		"915": [
			0,
			.68611,
			.12903,
			0,
			.69777
		],
		"916": [
			0,
			.68611,
			0,
			0,
			.94444
		],
		"920": [
			0,
			.68611,
			.09062,
			0,
			.88555
		],
		"923": [
			0,
			.68611,
			0,
			0,
			.80666
		],
		"926": [
			0,
			.68611,
			.15092,
			0,
			.76777
		],
		"928": [
			0,
			.68611,
			.17208,
			0,
			.8961
		],
		"931": [
			0,
			.68611,
			.11431,
			0,
			.82666
		],
		"933": [
			0,
			.68611,
			.10778,
			0,
			.88555
		],
		"934": [
			0,
			.68611,
			.05632,
			0,
			.82666
		],
		"936": [
			0,
			.68611,
			.10778,
			0,
			.88555
		],
		"937": [
			0,
			.68611,
			.0992,
			0,
			.82666
		],
		"8211": [
			0,
			.44444,
			.09811,
			0,
			.59111
		],
		"8212": [
			0,
			.44444,
			.09811,
			0,
			1.18221
		],
		"8216": [
			0,
			.69444,
			.12945,
			0,
			.35555
		],
		"8217": [
			0,
			.69444,
			.12945,
			0,
			.35555
		],
		"8220": [
			0,
			.69444,
			.16772,
			0,
			.62055
		],
		"8221": [
			0,
			.69444,
			.07939,
			0,
			.62055
		]
	},
	"Main-Italic": {
		"32": [
			0,
			0,
			0,
			0,
			.25
		],
		"33": [
			0,
			.69444,
			.12417,
			0,
			.30667
		],
		"34": [
			0,
			.69444,
			.06961,
			0,
			.51444
		],
		"35": [
			.19444,
			.69444,
			.06616,
			0,
			.81777
		],
		"37": [
			.05556,
			.75,
			.13639,
			0,
			.81777
		],
		"38": [
			0,
			.69444,
			.09694,
			0,
			.76666
		],
		"39": [
			0,
			.69444,
			.12417,
			0,
			.30667
		],
		"40": [
			.25,
			.75,
			.16194,
			0,
			.40889
		],
		"41": [
			.25,
			.75,
			.03694,
			0,
			.40889
		],
		"42": [
			0,
			.75,
			.14917,
			0,
			.51111
		],
		"43": [
			.05667,
			.56167,
			.03694,
			0,
			.76666
		],
		"44": [
			.19444,
			.10556,
			0,
			0,
			.30667
		],
		"45": [
			0,
			.43056,
			.02826,
			0,
			.35778
		],
		"46": [
			0,
			.10556,
			0,
			0,
			.30667
		],
		"47": [
			.25,
			.75,
			.16194,
			0,
			.51111
		],
		"48": [
			0,
			.64444,
			.13556,
			0,
			.51111
		],
		"49": [
			0,
			.64444,
			.13556,
			0,
			.51111
		],
		"50": [
			0,
			.64444,
			.13556,
			0,
			.51111
		],
		"51": [
			0,
			.64444,
			.13556,
			0,
			.51111
		],
		"52": [
			.19444,
			.64444,
			.13556,
			0,
			.51111
		],
		"53": [
			0,
			.64444,
			.13556,
			0,
			.51111
		],
		"54": [
			0,
			.64444,
			.13556,
			0,
			.51111
		],
		"55": [
			.19444,
			.64444,
			.13556,
			0,
			.51111
		],
		"56": [
			0,
			.64444,
			.13556,
			0,
			.51111
		],
		"57": [
			0,
			.64444,
			.13556,
			0,
			.51111
		],
		"58": [
			0,
			.43056,
			.0582,
			0,
			.30667
		],
		"59": [
			.19444,
			.43056,
			.0582,
			0,
			.30667
		],
		"61": [
			-.13313,
			.36687,
			.06616,
			0,
			.76666
		],
		"63": [
			0,
			.69444,
			.1225,
			0,
			.51111
		],
		"64": [
			0,
			.69444,
			.09597,
			0,
			.76666
		],
		"65": [
			0,
			.68333,
			0,
			0,
			.74333
		],
		"66": [
			0,
			.68333,
			.10257,
			0,
			.70389
		],
		"67": [
			0,
			.68333,
			.14528,
			0,
			.71555
		],
		"68": [
			0,
			.68333,
			.09403,
			0,
			.755
		],
		"69": [
			0,
			.68333,
			.12028,
			0,
			.67833
		],
		"70": [
			0,
			.68333,
			.13305,
			0,
			.65277
		],
		"71": [
			0,
			.68333,
			.08722,
			0,
			.77361
		],
		"72": [
			0,
			.68333,
			.16389,
			0,
			.74333
		],
		"73": [
			0,
			.68333,
			.15806,
			0,
			.38555
		],
		"74": [
			0,
			.68333,
			.14028,
			0,
			.525
		],
		"75": [
			0,
			.68333,
			.14528,
			0,
			.76888
		],
		"76": [
			0,
			.68333,
			0,
			0,
			.62722
		],
		"77": [
			0,
			.68333,
			.16389,
			0,
			.89666
		],
		"78": [
			0,
			.68333,
			.16389,
			0,
			.74333
		],
		"79": [
			0,
			.68333,
			.09403,
			0,
			.76666
		],
		"80": [
			0,
			.68333,
			.10257,
			0,
			.67833
		],
		"81": [
			.19444,
			.68333,
			.09403,
			0,
			.76666
		],
		"82": [
			0,
			.68333,
			.03868,
			0,
			.72944
		],
		"83": [
			0,
			.68333,
			.11972,
			0,
			.56222
		],
		"84": [
			0,
			.68333,
			.13305,
			0,
			.71555
		],
		"85": [
			0,
			.68333,
			.16389,
			0,
			.74333
		],
		"86": [
			0,
			.68333,
			.18361,
			0,
			.74333
		],
		"87": [
			0,
			.68333,
			.18361,
			0,
			.99888
		],
		"88": [
			0,
			.68333,
			.15806,
			0,
			.74333
		],
		"89": [
			0,
			.68333,
			.19383,
			0,
			.74333
		],
		"90": [
			0,
			.68333,
			.14528,
			0,
			.61333
		],
		"91": [
			.25,
			.75,
			.1875,
			0,
			.30667
		],
		"93": [
			.25,
			.75,
			.10528,
			0,
			.30667
		],
		"94": [
			0,
			.69444,
			.06646,
			0,
			.51111
		],
		"95": [
			.31,
			.12056,
			.09208,
			0,
			.51111
		],
		"97": [
			0,
			.43056,
			.07671,
			0,
			.51111
		],
		"98": [
			0,
			.69444,
			.06312,
			0,
			.46
		],
		"99": [
			0,
			.43056,
			.05653,
			0,
			.46
		],
		"100": [
			0,
			.69444,
			.10333,
			0,
			.51111
		],
		"101": [
			0,
			.43056,
			.07514,
			0,
			.46
		],
		"102": [
			.19444,
			.69444,
			.21194,
			0,
			.30667
		],
		"103": [
			.19444,
			.43056,
			.08847,
			0,
			.46
		],
		"104": [
			0,
			.69444,
			.07671,
			0,
			.51111
		],
		"105": [
			0,
			.65536,
			.1019,
			0,
			.30667
		],
		"106": [
			.19444,
			.65536,
			.14467,
			0,
			.30667
		],
		"107": [
			0,
			.69444,
			.10764,
			0,
			.46
		],
		"108": [
			0,
			.69444,
			.10333,
			0,
			.25555
		],
		"109": [
			0,
			.43056,
			.07671,
			0,
			.81777
		],
		"110": [
			0,
			.43056,
			.07671,
			0,
			.56222
		],
		"111": [
			0,
			.43056,
			.06312,
			0,
			.51111
		],
		"112": [
			.19444,
			.43056,
			.06312,
			0,
			.51111
		],
		"113": [
			.19444,
			.43056,
			.08847,
			0,
			.46
		],
		"114": [
			0,
			.43056,
			.10764,
			0,
			.42166
		],
		"115": [
			0,
			.43056,
			.08208,
			0,
			.40889
		],
		"116": [
			0,
			.61508,
			.09486,
			0,
			.33222
		],
		"117": [
			0,
			.43056,
			.07671,
			0,
			.53666
		],
		"118": [
			0,
			.43056,
			.10764,
			0,
			.46
		],
		"119": [
			0,
			.43056,
			.10764,
			0,
			.66444
		],
		"120": [
			0,
			.43056,
			.12042,
			0,
			.46389
		],
		"121": [
			.19444,
			.43056,
			.08847,
			0,
			.48555
		],
		"122": [
			0,
			.43056,
			.12292,
			0,
			.40889
		],
		"126": [
			.35,
			.31786,
			.11585,
			0,
			.51111
		],
		"160": [
			0,
			0,
			0,
			0,
			.25
		],
		"168": [
			0,
			.66786,
			.10474,
			0,
			.51111
		],
		"176": [
			0,
			.69444,
			0,
			0,
			.83129
		],
		"184": [
			.17014,
			0,
			0,
			0,
			.46
		],
		"198": [
			0,
			.68333,
			.12028,
			0,
			.88277
		],
		"216": [
			.04861,
			.73194,
			.09403,
			0,
			.76666
		],
		"223": [
			.19444,
			.69444,
			.10514,
			0,
			.53666
		],
		"230": [
			0,
			.43056,
			.07514,
			0,
			.71555
		],
		"248": [
			.09722,
			.52778,
			.09194,
			0,
			.51111
		],
		"338": [
			0,
			.68333,
			.12028,
			0,
			.98499
		],
		"339": [
			0,
			.43056,
			.07514,
			0,
			.71555
		],
		"710": [
			0,
			.69444,
			.06646,
			0,
			.51111
		],
		"711": [
			0,
			.62847,
			.08295,
			0,
			.51111
		],
		"713": [
			0,
			.56167,
			.10333,
			0,
			.51111
		],
		"714": [
			0,
			.69444,
			.09694,
			0,
			.51111
		],
		"715": [
			0,
			.69444,
			0,
			0,
			.51111
		],
		"728": [
			0,
			.69444,
			.10806,
			0,
			.51111
		],
		"729": [
			0,
			.66786,
			.11752,
			0,
			.30667
		],
		"730": [
			0,
			.69444,
			0,
			0,
			.83129
		],
		"732": [
			0,
			.66786,
			.11585,
			0,
			.51111
		],
		"733": [
			0,
			.69444,
			.1225,
			0,
			.51111
		],
		"915": [
			0,
			.68333,
			.13305,
			0,
			.62722
		],
		"916": [
			0,
			.68333,
			0,
			0,
			.81777
		],
		"920": [
			0,
			.68333,
			.09403,
			0,
			.76666
		],
		"923": [
			0,
			.68333,
			0,
			0,
			.69222
		],
		"926": [
			0,
			.68333,
			.15294,
			0,
			.66444
		],
		"928": [
			0,
			.68333,
			.16389,
			0,
			.74333
		],
		"931": [
			0,
			.68333,
			.12028,
			0,
			.71555
		],
		"933": [
			0,
			.68333,
			.11111,
			0,
			.76666
		],
		"934": [
			0,
			.68333,
			.05986,
			0,
			.71555
		],
		"936": [
			0,
			.68333,
			.11111,
			0,
			.76666
		],
		"937": [
			0,
			.68333,
			.10257,
			0,
			.71555
		],
		"8211": [
			0,
			.43056,
			.09208,
			0,
			.51111
		],
		"8212": [
			0,
			.43056,
			.09208,
			0,
			1.02222
		],
		"8216": [
			0,
			.69444,
			.12417,
			0,
			.30667
		],
		"8217": [
			0,
			.69444,
			.12417,
			0,
			.30667
		],
		"8220": [
			0,
			.69444,
			.1685,
			0,
			.51444
		],
		"8221": [
			0,
			.69444,
			.06961,
			0,
			.51444
		],
		"8463": [
			0,
			.68889,
			0,
			0,
			.54028
		]
	},
	"Main-Regular": {
		"32": [
			0,
			0,
			0,
			0,
			.25
		],
		"33": [
			0,
			.69444,
			0,
			0,
			.27778
		],
		"34": [
			0,
			.69444,
			0,
			0,
			.5
		],
		"35": [
			.19444,
			.69444,
			0,
			0,
			.83334
		],
		"36": [
			.05556,
			.75,
			0,
			0,
			.5
		],
		"37": [
			.05556,
			.75,
			0,
			0,
			.83334
		],
		"38": [
			0,
			.69444,
			0,
			0,
			.77778
		],
		"39": [
			0,
			.69444,
			0,
			0,
			.27778
		],
		"40": [
			.25,
			.75,
			0,
			0,
			.38889
		],
		"41": [
			.25,
			.75,
			0,
			0,
			.38889
		],
		"42": [
			0,
			.75,
			0,
			0,
			.5
		],
		"43": [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		"44": [
			.19444,
			.10556,
			0,
			0,
			.27778
		],
		"45": [
			0,
			.43056,
			0,
			0,
			.33333
		],
		"46": [
			0,
			.10556,
			0,
			0,
			.27778
		],
		"47": [
			.25,
			.75,
			0,
			0,
			.5
		],
		"48": [
			0,
			.64444,
			0,
			0,
			.5
		],
		"49": [
			0,
			.64444,
			0,
			0,
			.5
		],
		"50": [
			0,
			.64444,
			0,
			0,
			.5
		],
		"51": [
			0,
			.64444,
			0,
			0,
			.5
		],
		"52": [
			0,
			.64444,
			0,
			0,
			.5
		],
		"53": [
			0,
			.64444,
			0,
			0,
			.5
		],
		"54": [
			0,
			.64444,
			0,
			0,
			.5
		],
		"55": [
			0,
			.64444,
			0,
			0,
			.5
		],
		"56": [
			0,
			.64444,
			0,
			0,
			.5
		],
		"57": [
			0,
			.64444,
			0,
			0,
			.5
		],
		"58": [
			0,
			.43056,
			0,
			0,
			.27778
		],
		"59": [
			.19444,
			.43056,
			0,
			0,
			.27778
		],
		"60": [
			.0391,
			.5391,
			0,
			0,
			.77778
		],
		"61": [
			-.13313,
			.36687,
			0,
			0,
			.77778
		],
		"62": [
			.0391,
			.5391,
			0,
			0,
			.77778
		],
		"63": [
			0,
			.69444,
			0,
			0,
			.47222
		],
		"64": [
			0,
			.69444,
			0,
			0,
			.77778
		],
		"65": [
			0,
			.68333,
			0,
			0,
			.75
		],
		"66": [
			0,
			.68333,
			0,
			0,
			.70834
		],
		"67": [
			0,
			.68333,
			0,
			0,
			.72222
		],
		"68": [
			0,
			.68333,
			0,
			0,
			.76389
		],
		"69": [
			0,
			.68333,
			0,
			0,
			.68056
		],
		"70": [
			0,
			.68333,
			0,
			0,
			.65278
		],
		"71": [
			0,
			.68333,
			0,
			0,
			.78472
		],
		"72": [
			0,
			.68333,
			0,
			0,
			.75
		],
		"73": [
			0,
			.68333,
			0,
			0,
			.36111
		],
		"74": [
			0,
			.68333,
			0,
			0,
			.51389
		],
		"75": [
			0,
			.68333,
			0,
			0,
			.77778
		],
		"76": [
			0,
			.68333,
			0,
			0,
			.625
		],
		"77": [
			0,
			.68333,
			0,
			0,
			.91667
		],
		"78": [
			0,
			.68333,
			0,
			0,
			.75
		],
		"79": [
			0,
			.68333,
			0,
			0,
			.77778
		],
		"80": [
			0,
			.68333,
			0,
			0,
			.68056
		],
		"81": [
			.19444,
			.68333,
			0,
			0,
			.77778
		],
		"82": [
			0,
			.68333,
			0,
			0,
			.73611
		],
		"83": [
			0,
			.68333,
			0,
			0,
			.55556
		],
		"84": [
			0,
			.68333,
			0,
			0,
			.72222
		],
		"85": [
			0,
			.68333,
			0,
			0,
			.75
		],
		"86": [
			0,
			.68333,
			.01389,
			0,
			.75
		],
		"87": [
			0,
			.68333,
			.01389,
			0,
			1.02778
		],
		"88": [
			0,
			.68333,
			0,
			0,
			.75
		],
		"89": [
			0,
			.68333,
			.025,
			0,
			.75
		],
		"90": [
			0,
			.68333,
			0,
			0,
			.61111
		],
		"91": [
			.25,
			.75,
			0,
			0,
			.27778
		],
		"92": [
			.25,
			.75,
			0,
			0,
			.5
		],
		"93": [
			.25,
			.75,
			0,
			0,
			.27778
		],
		"94": [
			0,
			.69444,
			0,
			0,
			.5
		],
		"95": [
			.31,
			.12056,
			.02778,
			0,
			.5
		],
		"97": [
			0,
			.43056,
			0,
			0,
			.5
		],
		"98": [
			0,
			.69444,
			0,
			0,
			.55556
		],
		"99": [
			0,
			.43056,
			0,
			0,
			.44445
		],
		"100": [
			0,
			.69444,
			0,
			0,
			.55556
		],
		"101": [
			0,
			.43056,
			0,
			0,
			.44445
		],
		"102": [
			0,
			.69444,
			.07778,
			0,
			.30556
		],
		"103": [
			.19444,
			.43056,
			.01389,
			0,
			.5
		],
		"104": [
			0,
			.69444,
			0,
			0,
			.55556
		],
		"105": [
			0,
			.66786,
			0,
			0,
			.27778
		],
		"106": [
			.19444,
			.66786,
			0,
			0,
			.30556
		],
		"107": [
			0,
			.69444,
			0,
			0,
			.52778
		],
		"108": [
			0,
			.69444,
			0,
			0,
			.27778
		],
		"109": [
			0,
			.43056,
			0,
			0,
			.83334
		],
		"110": [
			0,
			.43056,
			0,
			0,
			.55556
		],
		"111": [
			0,
			.43056,
			0,
			0,
			.5
		],
		"112": [
			.19444,
			.43056,
			0,
			0,
			.55556
		],
		"113": [
			.19444,
			.43056,
			0,
			0,
			.52778
		],
		"114": [
			0,
			.43056,
			0,
			0,
			.39167
		],
		"115": [
			0,
			.43056,
			0,
			0,
			.39445
		],
		"116": [
			0,
			.61508,
			0,
			0,
			.38889
		],
		"117": [
			0,
			.43056,
			0,
			0,
			.55556
		],
		"118": [
			0,
			.43056,
			.01389,
			0,
			.52778
		],
		"119": [
			0,
			.43056,
			.01389,
			0,
			.72222
		],
		"120": [
			0,
			.43056,
			0,
			0,
			.52778
		],
		"121": [
			.19444,
			.43056,
			.01389,
			0,
			.52778
		],
		"122": [
			0,
			.43056,
			0,
			0,
			.44445
		],
		"123": [
			.25,
			.75,
			0,
			0,
			.5
		],
		"124": [
			.25,
			.75,
			0,
			0,
			.27778
		],
		"125": [
			.25,
			.75,
			0,
			0,
			.5
		],
		"126": [
			.35,
			.31786,
			0,
			0,
			.5
		],
		"160": [
			0,
			0,
			0,
			0,
			.25
		],
		"163": [
			0,
			.69444,
			0,
			0,
			.76909
		],
		"167": [
			.19444,
			.69444,
			0,
			0,
			.44445
		],
		"168": [
			0,
			.66786,
			0,
			0,
			.5
		],
		"172": [
			0,
			.43056,
			0,
			0,
			.66667
		],
		"176": [
			0,
			.69444,
			0,
			0,
			.75
		],
		"177": [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		"182": [
			.19444,
			.69444,
			0,
			0,
			.61111
		],
		"184": [
			.17014,
			0,
			0,
			0,
			.44445
		],
		"198": [
			0,
			.68333,
			0,
			0,
			.90278
		],
		"215": [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		"216": [
			.04861,
			.73194,
			0,
			0,
			.77778
		],
		"223": [
			0,
			.69444,
			0,
			0,
			.5
		],
		"230": [
			0,
			.43056,
			0,
			0,
			.72222
		],
		"247": [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		"248": [
			.09722,
			.52778,
			0,
			0,
			.5
		],
		"305": [
			0,
			.43056,
			0,
			0,
			.27778
		],
		"338": [
			0,
			.68333,
			0,
			0,
			1.01389
		],
		"339": [
			0,
			.43056,
			0,
			0,
			.77778
		],
		"567": [
			.19444,
			.43056,
			0,
			0,
			.30556
		],
		"710": [
			0,
			.69444,
			0,
			0,
			.5
		],
		"711": [
			0,
			.62847,
			0,
			0,
			.5
		],
		"713": [
			0,
			.56778,
			0,
			0,
			.5
		],
		"714": [
			0,
			.69444,
			0,
			0,
			.5
		],
		"715": [
			0,
			.69444,
			0,
			0,
			.5
		],
		"728": [
			0,
			.69444,
			0,
			0,
			.5
		],
		"729": [
			0,
			.66786,
			0,
			0,
			.27778
		],
		"730": [
			0,
			.69444,
			0,
			0,
			.75
		],
		"732": [
			0,
			.66786,
			0,
			0,
			.5
		],
		"733": [
			0,
			.69444,
			0,
			0,
			.5
		],
		"915": [
			0,
			.68333,
			0,
			0,
			.625
		],
		"916": [
			0,
			.68333,
			0,
			0,
			.83334
		],
		"920": [
			0,
			.68333,
			0,
			0,
			.77778
		],
		"923": [
			0,
			.68333,
			0,
			0,
			.69445
		],
		"926": [
			0,
			.68333,
			0,
			0,
			.66667
		],
		"928": [
			0,
			.68333,
			0,
			0,
			.75
		],
		"931": [
			0,
			.68333,
			0,
			0,
			.72222
		],
		"933": [
			0,
			.68333,
			0,
			0,
			.77778
		],
		"934": [
			0,
			.68333,
			0,
			0,
			.72222
		],
		"936": [
			0,
			.68333,
			0,
			0,
			.77778
		],
		"937": [
			0,
			.68333,
			0,
			0,
			.72222
		],
		"8211": [
			0,
			.43056,
			.02778,
			0,
			.5
		],
		"8212": [
			0,
			.43056,
			.02778,
			0,
			1
		],
		"8216": [
			0,
			.69444,
			0,
			0,
			.27778
		],
		"8217": [
			0,
			.69444,
			0,
			0,
			.27778
		],
		"8220": [
			0,
			.69444,
			0,
			0,
			.5
		],
		"8221": [
			0,
			.69444,
			0,
			0,
			.5
		],
		"8224": [
			.19444,
			.69444,
			0,
			0,
			.44445
		],
		"8225": [
			.19444,
			.69444,
			0,
			0,
			.44445
		],
		"8230": [
			0,
			.123,
			0,
			0,
			1.172
		],
		"8242": [
			0,
			.55556,
			0,
			0,
			.275
		],
		"8407": [
			0,
			.71444,
			.15382,
			0,
			.5
		],
		"8463": [
			0,
			.68889,
			0,
			0,
			.54028
		],
		"8465": [
			0,
			.69444,
			0,
			0,
			.72222
		],
		"8467": [
			0,
			.69444,
			0,
			.11111,
			.41667
		],
		"8472": [
			.19444,
			.43056,
			0,
			.11111,
			.63646
		],
		"8476": [
			0,
			.69444,
			0,
			0,
			.72222
		],
		"8501": [
			0,
			.69444,
			0,
			0,
			.61111
		],
		"8592": [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		"8593": [
			.19444,
			.69444,
			0,
			0,
			.5
		],
		"8594": [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		"8595": [
			.19444,
			.69444,
			0,
			0,
			.5
		],
		"8596": [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		"8597": [
			.25,
			.75,
			0,
			0,
			.5
		],
		"8598": [
			.19444,
			.69444,
			0,
			0,
			1
		],
		"8599": [
			.19444,
			.69444,
			0,
			0,
			1
		],
		"8600": [
			.19444,
			.69444,
			0,
			0,
			1
		],
		"8601": [
			.19444,
			.69444,
			0,
			0,
			1
		],
		"8614": [
			.011,
			.511,
			0,
			0,
			1
		],
		"8617": [
			.011,
			.511,
			0,
			0,
			1.126
		],
		"8618": [
			.011,
			.511,
			0,
			0,
			1.126
		],
		"8636": [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		"8637": [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		"8640": [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		"8641": [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		"8652": [
			.011,
			.671,
			0,
			0,
			1
		],
		"8656": [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		"8657": [
			.19444,
			.69444,
			0,
			0,
			.61111
		],
		"8658": [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		"8659": [
			.19444,
			.69444,
			0,
			0,
			.61111
		],
		"8660": [
			-.13313,
			.36687,
			0,
			0,
			1
		],
		"8661": [
			.25,
			.75,
			0,
			0,
			.61111
		],
		"8704": [
			0,
			.69444,
			0,
			0,
			.55556
		],
		"8706": [
			0,
			.69444,
			.05556,
			.08334,
			.5309
		],
		"8707": [
			0,
			.69444,
			0,
			0,
			.55556
		],
		"8709": [
			.05556,
			.75,
			0,
			0,
			.5
		],
		"8711": [
			0,
			.68333,
			0,
			0,
			.83334
		],
		"8712": [
			.0391,
			.5391,
			0,
			0,
			.66667
		],
		"8715": [
			.0391,
			.5391,
			0,
			0,
			.66667
		],
		"8722": [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		"8723": [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		"8725": [
			.25,
			.75,
			0,
			0,
			.5
		],
		"8726": [
			.25,
			.75,
			0,
			0,
			.5
		],
		"8727": [
			-.03472,
			.46528,
			0,
			0,
			.5
		],
		"8728": [
			-.05555,
			.44445,
			0,
			0,
			.5
		],
		"8729": [
			-.05555,
			.44445,
			0,
			0,
			.5
		],
		"8730": [
			.2,
			.8,
			0,
			0,
			.83334
		],
		"8733": [
			0,
			.43056,
			0,
			0,
			.77778
		],
		"8734": [
			0,
			.43056,
			0,
			0,
			1
		],
		"8736": [
			0,
			.69224,
			0,
			0,
			.72222
		],
		"8739": [
			.25,
			.75,
			0,
			0,
			.27778
		],
		"8741": [
			.25,
			.75,
			0,
			0,
			.5
		],
		"8743": [
			0,
			.55556,
			0,
			0,
			.66667
		],
		"8744": [
			0,
			.55556,
			0,
			0,
			.66667
		],
		"8745": [
			0,
			.55556,
			0,
			0,
			.66667
		],
		"8746": [
			0,
			.55556,
			0,
			0,
			.66667
		],
		"8747": [
			.19444,
			.69444,
			.11111,
			0,
			.41667
		],
		"8764": [
			-.13313,
			.36687,
			0,
			0,
			.77778
		],
		"8768": [
			.19444,
			.69444,
			0,
			0,
			.27778
		],
		"8771": [
			-.03625,
			.46375,
			0,
			0,
			.77778
		],
		"8773": [
			-.022,
			.589,
			0,
			0,
			.778
		],
		"8776": [
			-.01688,
			.48312,
			0,
			0,
			.77778
		],
		"8781": [
			-.03625,
			.46375,
			0,
			0,
			.77778
		],
		"8784": [
			-.133,
			.673,
			0,
			0,
			.778
		],
		"8801": [
			-.03625,
			.46375,
			0,
			0,
			.77778
		],
		"8804": [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		"8805": [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		"8810": [
			.0391,
			.5391,
			0,
			0,
			1
		],
		"8811": [
			.0391,
			.5391,
			0,
			0,
			1
		],
		"8826": [
			.0391,
			.5391,
			0,
			0,
			.77778
		],
		"8827": [
			.0391,
			.5391,
			0,
			0,
			.77778
		],
		"8834": [
			.0391,
			.5391,
			0,
			0,
			.77778
		],
		"8835": [
			.0391,
			.5391,
			0,
			0,
			.77778
		],
		"8838": [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		"8839": [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		"8846": [
			0,
			.55556,
			0,
			0,
			.66667
		],
		"8849": [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		"8850": [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		"8851": [
			0,
			.55556,
			0,
			0,
			.66667
		],
		"8852": [
			0,
			.55556,
			0,
			0,
			.66667
		],
		"8853": [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		"8854": [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		"8855": [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		"8856": [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		"8857": [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		"8866": [
			0,
			.69444,
			0,
			0,
			.61111
		],
		"8867": [
			0,
			.69444,
			0,
			0,
			.61111
		],
		"8868": [
			0,
			.69444,
			0,
			0,
			.77778
		],
		"8869": [
			0,
			.69444,
			0,
			0,
			.77778
		],
		"8872": [
			.249,
			.75,
			0,
			0,
			.867
		],
		"8900": [
			-.05555,
			.44445,
			0,
			0,
			.5
		],
		"8901": [
			-.05555,
			.44445,
			0,
			0,
			.27778
		],
		"8902": [
			-.03472,
			.46528,
			0,
			0,
			.5
		],
		"8904": [
			.005,
			.505,
			0,
			0,
			.9
		],
		"8942": [
			.03,
			.903,
			0,
			0,
			.278
		],
		"8943": [
			-.19,
			.313,
			0,
			0,
			1.172
		],
		"8945": [
			-.1,
			.823,
			0,
			0,
			1.282
		],
		"8968": [
			.25,
			.75,
			0,
			0,
			.44445
		],
		"8969": [
			.25,
			.75,
			0,
			0,
			.44445
		],
		"8970": [
			.25,
			.75,
			0,
			0,
			.44445
		],
		"8971": [
			.25,
			.75,
			0,
			0,
			.44445
		],
		"8994": [
			-.14236,
			.35764,
			0,
			0,
			1
		],
		"8995": [
			-.14236,
			.35764,
			0,
			0,
			1
		],
		"9136": [
			.244,
			.744,
			0,
			0,
			.412
		],
		"9137": [
			.244,
			.745,
			0,
			0,
			.412
		],
		"9651": [
			.19444,
			.69444,
			0,
			0,
			.88889
		],
		"9657": [
			-.03472,
			.46528,
			0,
			0,
			.5
		],
		"9661": [
			.19444,
			.69444,
			0,
			0,
			.88889
		],
		"9667": [
			-.03472,
			.46528,
			0,
			0,
			.5
		],
		"9711": [
			.19444,
			.69444,
			0,
			0,
			1
		],
		"9824": [
			.12963,
			.69444,
			0,
			0,
			.77778
		],
		"9825": [
			.12963,
			.69444,
			0,
			0,
			.77778
		],
		"9826": [
			.12963,
			.69444,
			0,
			0,
			.77778
		],
		"9827": [
			.12963,
			.69444,
			0,
			0,
			.77778
		],
		"9837": [
			0,
			.75,
			0,
			0,
			.38889
		],
		"9838": [
			.19444,
			.69444,
			0,
			0,
			.38889
		],
		"9839": [
			.19444,
			.69444,
			0,
			0,
			.38889
		],
		"10216": [
			.25,
			.75,
			0,
			0,
			.38889
		],
		"10217": [
			.25,
			.75,
			0,
			0,
			.38889
		],
		"10222": [
			.244,
			.744,
			0,
			0,
			.412
		],
		"10223": [
			.244,
			.745,
			0,
			0,
			.412
		],
		"10229": [
			.011,
			.511,
			0,
			0,
			1.609
		],
		"10230": [
			.011,
			.511,
			0,
			0,
			1.638
		],
		"10231": [
			.011,
			.511,
			0,
			0,
			1.859
		],
		"10232": [
			.024,
			.525,
			0,
			0,
			1.609
		],
		"10233": [
			.024,
			.525,
			0,
			0,
			1.638
		],
		"10234": [
			.024,
			.525,
			0,
			0,
			1.858
		],
		"10236": [
			.011,
			.511,
			0,
			0,
			1.638
		],
		"10815": [
			0,
			.68333,
			0,
			0,
			.75
		],
		"10927": [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		"10928": [
			.13597,
			.63597,
			0,
			0,
			.77778
		],
		"57376": [
			.19444,
			.69444,
			0,
			0,
			0
		]
	},
	"Math-BoldItalic": {
		"32": [
			0,
			0,
			0,
			0,
			.25
		],
		"48": [
			0,
			.44444,
			0,
			0,
			.575
		],
		"49": [
			0,
			.44444,
			0,
			0,
			.575
		],
		"50": [
			0,
			.44444,
			0,
			0,
			.575
		],
		"51": [
			.19444,
			.44444,
			0,
			0,
			.575
		],
		"52": [
			.19444,
			.44444,
			0,
			0,
			.575
		],
		"53": [
			.19444,
			.44444,
			0,
			0,
			.575
		],
		"54": [
			0,
			.64444,
			0,
			0,
			.575
		],
		"55": [
			.19444,
			.44444,
			0,
			0,
			.575
		],
		"56": [
			0,
			.64444,
			0,
			0,
			.575
		],
		"57": [
			.19444,
			.44444,
			0,
			0,
			.575
		],
		"65": [
			0,
			.68611,
			0,
			0,
			.86944
		],
		"66": [
			0,
			.68611,
			.04835,
			0,
			.8664
		],
		"67": [
			0,
			.68611,
			.06979,
			0,
			.81694
		],
		"68": [
			0,
			.68611,
			.03194,
			0,
			.93812
		],
		"69": [
			0,
			.68611,
			.05451,
			0,
			.81007
		],
		"70": [
			0,
			.68611,
			.15972,
			0,
			.68889
		],
		"71": [
			0,
			.68611,
			0,
			0,
			.88673
		],
		"72": [
			0,
			.68611,
			.08229,
			0,
			.98229
		],
		"73": [
			0,
			.68611,
			.07778,
			0,
			.51111
		],
		"74": [
			0,
			.68611,
			.10069,
			0,
			.63125
		],
		"75": [
			0,
			.68611,
			.06979,
			0,
			.97118
		],
		"76": [
			0,
			.68611,
			0,
			0,
			.75555
		],
		"77": [
			0,
			.68611,
			.11424,
			0,
			1.14201
		],
		"78": [
			0,
			.68611,
			.11424,
			0,
			.95034
		],
		"79": [
			0,
			.68611,
			.03194,
			0,
			.83666
		],
		"80": [
			0,
			.68611,
			.15972,
			0,
			.72309
		],
		"81": [
			.19444,
			.68611,
			0,
			0,
			.86861
		],
		"82": [
			0,
			.68611,
			.00421,
			0,
			.87235
		],
		"83": [
			0,
			.68611,
			.05382,
			0,
			.69271
		],
		"84": [
			0,
			.68611,
			.15972,
			0,
			.63663
		],
		"85": [
			0,
			.68611,
			.11424,
			0,
			.80027
		],
		"86": [
			0,
			.68611,
			.25555,
			0,
			.67778
		],
		"87": [
			0,
			.68611,
			.15972,
			0,
			1.09305
		],
		"88": [
			0,
			.68611,
			.07778,
			0,
			.94722
		],
		"89": [
			0,
			.68611,
			.25555,
			0,
			.67458
		],
		"90": [
			0,
			.68611,
			.06979,
			0,
			.77257
		],
		"97": [
			0,
			.44444,
			0,
			0,
			.63287
		],
		"98": [
			0,
			.69444,
			0,
			0,
			.52083
		],
		"99": [
			0,
			.44444,
			0,
			0,
			.51342
		],
		"100": [
			0,
			.69444,
			0,
			0,
			.60972
		],
		"101": [
			0,
			.44444,
			0,
			0,
			.55361
		],
		"102": [
			.19444,
			.69444,
			.11042,
			0,
			.56806
		],
		"103": [
			.19444,
			.44444,
			.03704,
			0,
			.5449
		],
		"104": [
			0,
			.69444,
			0,
			0,
			.66759
		],
		"105": [
			0,
			.69326,
			0,
			0,
			.4048
		],
		"106": [
			.19444,
			.69326,
			.0622,
			0,
			.47083
		],
		"107": [
			0,
			.69444,
			.01852,
			0,
			.6037
		],
		"108": [
			0,
			.69444,
			.0088,
			0,
			.34815
		],
		"109": [
			0,
			.44444,
			0,
			0,
			1.0324
		],
		"110": [
			0,
			.44444,
			0,
			0,
			.71296
		],
		"111": [
			0,
			.44444,
			0,
			0,
			.58472
		],
		"112": [
			.19444,
			.44444,
			0,
			0,
			.60092
		],
		"113": [
			.19444,
			.44444,
			.03704,
			0,
			.54213
		],
		"114": [
			0,
			.44444,
			.03194,
			0,
			.5287
		],
		"115": [
			0,
			.44444,
			0,
			0,
			.53125
		],
		"116": [
			0,
			.63492,
			0,
			0,
			.41528
		],
		"117": [
			0,
			.44444,
			0,
			0,
			.68102
		],
		"118": [
			0,
			.44444,
			.03704,
			0,
			.56666
		],
		"119": [
			0,
			.44444,
			.02778,
			0,
			.83148
		],
		"120": [
			0,
			.44444,
			0,
			0,
			.65903
		],
		"121": [
			.19444,
			.44444,
			.03704,
			0,
			.59028
		],
		"122": [
			0,
			.44444,
			.04213,
			0,
			.55509
		],
		"160": [
			0,
			0,
			0,
			0,
			.25
		],
		"915": [
			0,
			.68611,
			.15972,
			0,
			.65694
		],
		"916": [
			0,
			.68611,
			0,
			0,
			.95833
		],
		"920": [
			0,
			.68611,
			.03194,
			0,
			.86722
		],
		"923": [
			0,
			.68611,
			0,
			0,
			.80555
		],
		"926": [
			0,
			.68611,
			.07458,
			0,
			.84125
		],
		"928": [
			0,
			.68611,
			.08229,
			0,
			.98229
		],
		"931": [
			0,
			.68611,
			.05451,
			0,
			.88507
		],
		"933": [
			0,
			.68611,
			.15972,
			0,
			.67083
		],
		"934": [
			0,
			.68611,
			0,
			0,
			.76666
		],
		"936": [
			0,
			.68611,
			.11653,
			0,
			.71402
		],
		"937": [
			0,
			.68611,
			.04835,
			0,
			.8789
		],
		"945": [
			0,
			.44444,
			0,
			0,
			.76064
		],
		"946": [
			.19444,
			.69444,
			.03403,
			0,
			.65972
		],
		"947": [
			.19444,
			.44444,
			.06389,
			0,
			.59003
		],
		"948": [
			0,
			.69444,
			.03819,
			0,
			.52222
		],
		"949": [
			0,
			.44444,
			0,
			0,
			.52882
		],
		"950": [
			.19444,
			.69444,
			.06215,
			0,
			.50833
		],
		"951": [
			.19444,
			.44444,
			.03704,
			0,
			.6
		],
		"952": [
			0,
			.69444,
			.03194,
			0,
			.5618
		],
		"953": [
			0,
			.44444,
			0,
			0,
			.41204
		],
		"954": [
			0,
			.44444,
			0,
			0,
			.66759
		],
		"955": [
			0,
			.69444,
			0,
			0,
			.67083
		],
		"956": [
			.19444,
			.44444,
			0,
			0,
			.70787
		],
		"957": [
			0,
			.44444,
			.06898,
			0,
			.57685
		],
		"958": [
			.19444,
			.69444,
			.03021,
			0,
			.50833
		],
		"959": [
			0,
			.44444,
			0,
			0,
			.58472
		],
		"960": [
			0,
			.44444,
			.03704,
			0,
			.68241
		],
		"961": [
			.19444,
			.44444,
			0,
			0,
			.6118
		],
		"962": [
			.09722,
			.44444,
			.07917,
			0,
			.42361
		],
		"963": [
			0,
			.44444,
			.03704,
			0,
			.68588
		],
		"964": [
			0,
			.44444,
			.13472,
			0,
			.52083
		],
		"965": [
			0,
			.44444,
			.03704,
			0,
			.63055
		],
		"966": [
			.19444,
			.44444,
			0,
			0,
			.74722
		],
		"967": [
			.19444,
			.44444,
			0,
			0,
			.71805
		],
		"968": [
			.19444,
			.69444,
			.03704,
			0,
			.75833
		],
		"969": [
			0,
			.44444,
			.03704,
			0,
			.71782
		],
		"977": [
			0,
			.69444,
			0,
			0,
			.69155
		],
		"981": [
			.19444,
			.69444,
			0,
			0,
			.7125
		],
		"982": [
			0,
			.44444,
			.03194,
			0,
			.975
		],
		"1009": [
			.19444,
			.44444,
			0,
			0,
			.6118
		],
		"1013": [
			0,
			.44444,
			0,
			0,
			.48333
		],
		"57649": [
			0,
			.44444,
			0,
			0,
			.39352
		],
		"57911": [
			.19444,
			.44444,
			0,
			0,
			.43889
		]
	},
	"Math-Italic": {
		"32": [
			0,
			0,
			0,
			0,
			.25
		],
		"48": [
			0,
			.43056,
			0,
			0,
			.5
		],
		"49": [
			0,
			.43056,
			0,
			0,
			.5
		],
		"50": [
			0,
			.43056,
			0,
			0,
			.5
		],
		"51": [
			.19444,
			.43056,
			0,
			0,
			.5
		],
		"52": [
			.19444,
			.43056,
			0,
			0,
			.5
		],
		"53": [
			.19444,
			.43056,
			0,
			0,
			.5
		],
		"54": [
			0,
			.64444,
			0,
			0,
			.5
		],
		"55": [
			.19444,
			.43056,
			0,
			0,
			.5
		],
		"56": [
			0,
			.64444,
			0,
			0,
			.5
		],
		"57": [
			.19444,
			.43056,
			0,
			0,
			.5
		],
		"65": [
			0,
			.68333,
			0,
			.13889,
			.75
		],
		"66": [
			0,
			.68333,
			.05017,
			.08334,
			.75851
		],
		"67": [
			0,
			.68333,
			.07153,
			.08334,
			.71472
		],
		"68": [
			0,
			.68333,
			.02778,
			.05556,
			.82792
		],
		"69": [
			0,
			.68333,
			.05764,
			.08334,
			.7382
		],
		"70": [
			0,
			.68333,
			.13889,
			.08334,
			.64306
		],
		"71": [
			0,
			.68333,
			0,
			.08334,
			.78625
		],
		"72": [
			0,
			.68333,
			.08125,
			.05556,
			.83125
		],
		"73": [
			0,
			.68333,
			.07847,
			.11111,
			.43958
		],
		"74": [
			0,
			.68333,
			.09618,
			.16667,
			.55451
		],
		"75": [
			0,
			.68333,
			.07153,
			.05556,
			.84931
		],
		"76": [
			0,
			.68333,
			0,
			.02778,
			.68056
		],
		"77": [
			0,
			.68333,
			.10903,
			.08334,
			.97014
		],
		"78": [
			0,
			.68333,
			.10903,
			.08334,
			.80347
		],
		"79": [
			0,
			.68333,
			.02778,
			.08334,
			.76278
		],
		"80": [
			0,
			.68333,
			.13889,
			.08334,
			.64201
		],
		"81": [
			.19444,
			.68333,
			0,
			.08334,
			.79056
		],
		"82": [
			0,
			.68333,
			.00773,
			.08334,
			.75929
		],
		"83": [
			0,
			.68333,
			.05764,
			.08334,
			.6132
		],
		"84": [
			0,
			.68333,
			.13889,
			.08334,
			.58438
		],
		"85": [
			0,
			.68333,
			.10903,
			.02778,
			.68278
		],
		"86": [
			0,
			.68333,
			.22222,
			0,
			.58333
		],
		"87": [
			0,
			.68333,
			.13889,
			0,
			.94445
		],
		"88": [
			0,
			.68333,
			.07847,
			.08334,
			.82847
		],
		"89": [
			0,
			.68333,
			.22222,
			0,
			.58056
		],
		"90": [
			0,
			.68333,
			.07153,
			.08334,
			.68264
		],
		"97": [
			0,
			.43056,
			0,
			0,
			.52859
		],
		"98": [
			0,
			.69444,
			0,
			0,
			.42917
		],
		"99": [
			0,
			.43056,
			0,
			.05556,
			.43276
		],
		"100": [
			0,
			.69444,
			0,
			.16667,
			.52049
		],
		"101": [
			0,
			.43056,
			0,
			.05556,
			.46563
		],
		"102": [
			.19444,
			.69444,
			.10764,
			.16667,
			.48959
		],
		"103": [
			.19444,
			.43056,
			.03588,
			.02778,
			.47697
		],
		"104": [
			0,
			.69444,
			0,
			0,
			.57616
		],
		"105": [
			0,
			.65952,
			0,
			0,
			.34451
		],
		"106": [
			.19444,
			.65952,
			.05724,
			0,
			.41181
		],
		"107": [
			0,
			.69444,
			.03148,
			0,
			.5206
		],
		"108": [
			0,
			.69444,
			.01968,
			.08334,
			.29838
		],
		"109": [
			0,
			.43056,
			0,
			0,
			.87801
		],
		"110": [
			0,
			.43056,
			0,
			0,
			.60023
		],
		"111": [
			0,
			.43056,
			0,
			.05556,
			.48472
		],
		"112": [
			.19444,
			.43056,
			0,
			.08334,
			.50313
		],
		"113": [
			.19444,
			.43056,
			.03588,
			.08334,
			.44641
		],
		"114": [
			0,
			.43056,
			.02778,
			.05556,
			.45116
		],
		"115": [
			0,
			.43056,
			0,
			.05556,
			.46875
		],
		"116": [
			0,
			.61508,
			0,
			.08334,
			.36111
		],
		"117": [
			0,
			.43056,
			0,
			.02778,
			.57246
		],
		"118": [
			0,
			.43056,
			.03588,
			.02778,
			.48472
		],
		"119": [
			0,
			.43056,
			.02691,
			.08334,
			.71592
		],
		"120": [
			0,
			.43056,
			0,
			.02778,
			.57153
		],
		"121": [
			.19444,
			.43056,
			.03588,
			.05556,
			.49028
		],
		"122": [
			0,
			.43056,
			.04398,
			.05556,
			.46505
		],
		"160": [
			0,
			0,
			0,
			0,
			.25
		],
		"915": [
			0,
			.68333,
			.13889,
			.08334,
			.61528
		],
		"916": [
			0,
			.68333,
			0,
			.16667,
			.83334
		],
		"920": [
			0,
			.68333,
			.02778,
			.08334,
			.76278
		],
		"923": [
			0,
			.68333,
			0,
			.16667,
			.69445
		],
		"926": [
			0,
			.68333,
			.07569,
			.08334,
			.74236
		],
		"928": [
			0,
			.68333,
			.08125,
			.05556,
			.83125
		],
		"931": [
			0,
			.68333,
			.05764,
			.08334,
			.77986
		],
		"933": [
			0,
			.68333,
			.13889,
			.05556,
			.58333
		],
		"934": [
			0,
			.68333,
			0,
			.08334,
			.66667
		],
		"936": [
			0,
			.68333,
			.11,
			.05556,
			.61222
		],
		"937": [
			0,
			.68333,
			.05017,
			.08334,
			.7724
		],
		"945": [
			0,
			.43056,
			.0037,
			.02778,
			.6397
		],
		"946": [
			.19444,
			.69444,
			.05278,
			.08334,
			.56563
		],
		"947": [
			.19444,
			.43056,
			.05556,
			0,
			.51773
		],
		"948": [
			0,
			.69444,
			.03785,
			.05556,
			.44444
		],
		"949": [
			0,
			.43056,
			0,
			.08334,
			.46632
		],
		"950": [
			.19444,
			.69444,
			.07378,
			.08334,
			.4375
		],
		"951": [
			.19444,
			.43056,
			.03588,
			.05556,
			.49653
		],
		"952": [
			0,
			.69444,
			.02778,
			.08334,
			.46944
		],
		"953": [
			0,
			.43056,
			0,
			.05556,
			.35394
		],
		"954": [
			0,
			.43056,
			0,
			0,
			.57616
		],
		"955": [
			0,
			.69444,
			0,
			0,
			.58334
		],
		"956": [
			.19444,
			.43056,
			0,
			.02778,
			.60255
		],
		"957": [
			0,
			.43056,
			.06366,
			.02778,
			.49398
		],
		"958": [
			.19444,
			.69444,
			.04601,
			.11111,
			.4375
		],
		"959": [
			0,
			.43056,
			0,
			.05556,
			.48472
		],
		"960": [
			0,
			.43056,
			.03588,
			0,
			.57003
		],
		"961": [
			.19444,
			.43056,
			0,
			.08334,
			.51702
		],
		"962": [
			.09722,
			.43056,
			.07986,
			.08334,
			.36285
		],
		"963": [
			0,
			.43056,
			.03588,
			0,
			.57141
		],
		"964": [
			0,
			.43056,
			.1132,
			.02778,
			.43715
		],
		"965": [
			0,
			.43056,
			.03588,
			.02778,
			.54028
		],
		"966": [
			.19444,
			.43056,
			0,
			.08334,
			.65417
		],
		"967": [
			.19444,
			.43056,
			0,
			.05556,
			.62569
		],
		"968": [
			.19444,
			.69444,
			.03588,
			.11111,
			.65139
		],
		"969": [
			0,
			.43056,
			.03588,
			0,
			.62245
		],
		"977": [
			0,
			.69444,
			0,
			.08334,
			.59144
		],
		"981": [
			.19444,
			.69444,
			0,
			.08334,
			.59583
		],
		"982": [
			0,
			.43056,
			.02778,
			0,
			.82813
		],
		"1009": [
			.19444,
			.43056,
			0,
			.08334,
			.51702
		],
		"1013": [
			0,
			.43056,
			0,
			.05556,
			.4059
		],
		"57649": [
			0,
			.43056,
			0,
			.02778,
			.32246
		],
		"57911": [
			.19444,
			.43056,
			0,
			.08334,
			.38403
		]
	},
	"SansSerif-Bold": {
		"32": [
			0,
			0,
			0,
			0,
			.25
		],
		"33": [
			0,
			.69444,
			0,
			0,
			.36667
		],
		"34": [
			0,
			.69444,
			0,
			0,
			.55834
		],
		"35": [
			.19444,
			.69444,
			0,
			0,
			.91667
		],
		"36": [
			.05556,
			.75,
			0,
			0,
			.55
		],
		"37": [
			.05556,
			.75,
			0,
			0,
			1.02912
		],
		"38": [
			0,
			.69444,
			0,
			0,
			.83056
		],
		"39": [
			0,
			.69444,
			0,
			0,
			.30556
		],
		"40": [
			.25,
			.75,
			0,
			0,
			.42778
		],
		"41": [
			.25,
			.75,
			0,
			0,
			.42778
		],
		"42": [
			0,
			.75,
			0,
			0,
			.55
		],
		"43": [
			.11667,
			.61667,
			0,
			0,
			.85556
		],
		"44": [
			.10556,
			.13056,
			0,
			0,
			.30556
		],
		"45": [
			0,
			.45833,
			0,
			0,
			.36667
		],
		"46": [
			0,
			.13056,
			0,
			0,
			.30556
		],
		"47": [
			.25,
			.75,
			0,
			0,
			.55
		],
		"48": [
			0,
			.69444,
			0,
			0,
			.55
		],
		"49": [
			0,
			.69444,
			0,
			0,
			.55
		],
		"50": [
			0,
			.69444,
			0,
			0,
			.55
		],
		"51": [
			0,
			.69444,
			0,
			0,
			.55
		],
		"52": [
			0,
			.69444,
			0,
			0,
			.55
		],
		"53": [
			0,
			.69444,
			0,
			0,
			.55
		],
		"54": [
			0,
			.69444,
			0,
			0,
			.55
		],
		"55": [
			0,
			.69444,
			0,
			0,
			.55
		],
		"56": [
			0,
			.69444,
			0,
			0,
			.55
		],
		"57": [
			0,
			.69444,
			0,
			0,
			.55
		],
		"58": [
			0,
			.45833,
			0,
			0,
			.30556
		],
		"59": [
			.10556,
			.45833,
			0,
			0,
			.30556
		],
		"61": [
			-.09375,
			.40625,
			0,
			0,
			.85556
		],
		"63": [
			0,
			.69444,
			0,
			0,
			.51945
		],
		"64": [
			0,
			.69444,
			0,
			0,
			.73334
		],
		"65": [
			0,
			.69444,
			0,
			0,
			.73334
		],
		"66": [
			0,
			.69444,
			0,
			0,
			.73334
		],
		"67": [
			0,
			.69444,
			0,
			0,
			.70278
		],
		"68": [
			0,
			.69444,
			0,
			0,
			.79445
		],
		"69": [
			0,
			.69444,
			0,
			0,
			.64167
		],
		"70": [
			0,
			.69444,
			0,
			0,
			.61111
		],
		"71": [
			0,
			.69444,
			0,
			0,
			.73334
		],
		"72": [
			0,
			.69444,
			0,
			0,
			.79445
		],
		"73": [
			0,
			.69444,
			0,
			0,
			.33056
		],
		"74": [
			0,
			.69444,
			0,
			0,
			.51945
		],
		"75": [
			0,
			.69444,
			0,
			0,
			.76389
		],
		"76": [
			0,
			.69444,
			0,
			0,
			.58056
		],
		"77": [
			0,
			.69444,
			0,
			0,
			.97778
		],
		"78": [
			0,
			.69444,
			0,
			0,
			.79445
		],
		"79": [
			0,
			.69444,
			0,
			0,
			.79445
		],
		"80": [
			0,
			.69444,
			0,
			0,
			.70278
		],
		"81": [
			.10556,
			.69444,
			0,
			0,
			.79445
		],
		"82": [
			0,
			.69444,
			0,
			0,
			.70278
		],
		"83": [
			0,
			.69444,
			0,
			0,
			.61111
		],
		"84": [
			0,
			.69444,
			0,
			0,
			.73334
		],
		"85": [
			0,
			.69444,
			0,
			0,
			.76389
		],
		"86": [
			0,
			.69444,
			.01528,
			0,
			.73334
		],
		"87": [
			0,
			.69444,
			.01528,
			0,
			1.03889
		],
		"88": [
			0,
			.69444,
			0,
			0,
			.73334
		],
		"89": [
			0,
			.69444,
			.0275,
			0,
			.73334
		],
		"90": [
			0,
			.69444,
			0,
			0,
			.67223
		],
		"91": [
			.25,
			.75,
			0,
			0,
			.34306
		],
		"93": [
			.25,
			.75,
			0,
			0,
			.34306
		],
		"94": [
			0,
			.69444,
			0,
			0,
			.55
		],
		"95": [
			.35,
			.10833,
			.03056,
			0,
			.55
		],
		"97": [
			0,
			.45833,
			0,
			0,
			.525
		],
		"98": [
			0,
			.69444,
			0,
			0,
			.56111
		],
		"99": [
			0,
			.45833,
			0,
			0,
			.48889
		],
		"100": [
			0,
			.69444,
			0,
			0,
			.56111
		],
		"101": [
			0,
			.45833,
			0,
			0,
			.51111
		],
		"102": [
			0,
			.69444,
			.07639,
			0,
			.33611
		],
		"103": [
			.19444,
			.45833,
			.01528,
			0,
			.55
		],
		"104": [
			0,
			.69444,
			0,
			0,
			.56111
		],
		"105": [
			0,
			.69444,
			0,
			0,
			.25556
		],
		"106": [
			.19444,
			.69444,
			0,
			0,
			.28611
		],
		"107": [
			0,
			.69444,
			0,
			0,
			.53056
		],
		"108": [
			0,
			.69444,
			0,
			0,
			.25556
		],
		"109": [
			0,
			.45833,
			0,
			0,
			.86667
		],
		"110": [
			0,
			.45833,
			0,
			0,
			.56111
		],
		"111": [
			0,
			.45833,
			0,
			0,
			.55
		],
		"112": [
			.19444,
			.45833,
			0,
			0,
			.56111
		],
		"113": [
			.19444,
			.45833,
			0,
			0,
			.56111
		],
		"114": [
			0,
			.45833,
			.01528,
			0,
			.37222
		],
		"115": [
			0,
			.45833,
			0,
			0,
			.42167
		],
		"116": [
			0,
			.58929,
			0,
			0,
			.40417
		],
		"117": [
			0,
			.45833,
			0,
			0,
			.56111
		],
		"118": [
			0,
			.45833,
			.01528,
			0,
			.5
		],
		"119": [
			0,
			.45833,
			.01528,
			0,
			.74445
		],
		"120": [
			0,
			.45833,
			0,
			0,
			.5
		],
		"121": [
			.19444,
			.45833,
			.01528,
			0,
			.5
		],
		"122": [
			0,
			.45833,
			0,
			0,
			.47639
		],
		"126": [
			.35,
			.34444,
			0,
			0,
			.55
		],
		"160": [
			0,
			0,
			0,
			0,
			.25
		],
		"168": [
			0,
			.69444,
			0,
			0,
			.55
		],
		"176": [
			0,
			.69444,
			0,
			0,
			.73334
		],
		"180": [
			0,
			.69444,
			0,
			0,
			.55
		],
		"184": [
			.17014,
			0,
			0,
			0,
			.48889
		],
		"305": [
			0,
			.45833,
			0,
			0,
			.25556
		],
		"567": [
			.19444,
			.45833,
			0,
			0,
			.28611
		],
		"710": [
			0,
			.69444,
			0,
			0,
			.55
		],
		"711": [
			0,
			.63542,
			0,
			0,
			.55
		],
		"713": [
			0,
			.63778,
			0,
			0,
			.55
		],
		"728": [
			0,
			.69444,
			0,
			0,
			.55
		],
		"729": [
			0,
			.69444,
			0,
			0,
			.30556
		],
		"730": [
			0,
			.69444,
			0,
			0,
			.73334
		],
		"732": [
			0,
			.69444,
			0,
			0,
			.55
		],
		"733": [
			0,
			.69444,
			0,
			0,
			.55
		],
		"915": [
			0,
			.69444,
			0,
			0,
			.58056
		],
		"916": [
			0,
			.69444,
			0,
			0,
			.91667
		],
		"920": [
			0,
			.69444,
			0,
			0,
			.85556
		],
		"923": [
			0,
			.69444,
			0,
			0,
			.67223
		],
		"926": [
			0,
			.69444,
			0,
			0,
			.73334
		],
		"928": [
			0,
			.69444,
			0,
			0,
			.79445
		],
		"931": [
			0,
			.69444,
			0,
			0,
			.79445
		],
		"933": [
			0,
			.69444,
			0,
			0,
			.85556
		],
		"934": [
			0,
			.69444,
			0,
			0,
			.79445
		],
		"936": [
			0,
			.69444,
			0,
			0,
			.85556
		],
		"937": [
			0,
			.69444,
			0,
			0,
			.79445
		],
		"8211": [
			0,
			.45833,
			.03056,
			0,
			.55
		],
		"8212": [
			0,
			.45833,
			.03056,
			0,
			1.10001
		],
		"8216": [
			0,
			.69444,
			0,
			0,
			.30556
		],
		"8217": [
			0,
			.69444,
			0,
			0,
			.30556
		],
		"8220": [
			0,
			.69444,
			0,
			0,
			.55834
		],
		"8221": [
			0,
			.69444,
			0,
			0,
			.55834
		]
	},
	"SansSerif-Italic": {
		"32": [
			0,
			0,
			0,
			0,
			.25
		],
		"33": [
			0,
			.69444,
			.05733,
			0,
			.31945
		],
		"34": [
			0,
			.69444,
			.00316,
			0,
			.5
		],
		"35": [
			.19444,
			.69444,
			.05087,
			0,
			.83334
		],
		"36": [
			.05556,
			.75,
			.11156,
			0,
			.5
		],
		"37": [
			.05556,
			.75,
			.03126,
			0,
			.83334
		],
		"38": [
			0,
			.69444,
			.03058,
			0,
			.75834
		],
		"39": [
			0,
			.69444,
			.07816,
			0,
			.27778
		],
		"40": [
			.25,
			.75,
			.13164,
			0,
			.38889
		],
		"41": [
			.25,
			.75,
			.02536,
			0,
			.38889
		],
		"42": [
			0,
			.75,
			.11775,
			0,
			.5
		],
		"43": [
			.08333,
			.58333,
			.02536,
			0,
			.77778
		],
		"44": [
			.125,
			.08333,
			0,
			0,
			.27778
		],
		"45": [
			0,
			.44444,
			.01946,
			0,
			.33333
		],
		"46": [
			0,
			.08333,
			0,
			0,
			.27778
		],
		"47": [
			.25,
			.75,
			.13164,
			0,
			.5
		],
		"48": [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		"49": [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		"50": [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		"51": [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		"52": [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		"53": [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		"54": [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		"55": [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		"56": [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		"57": [
			0,
			.65556,
			.11156,
			0,
			.5
		],
		"58": [
			0,
			.44444,
			.02502,
			0,
			.27778
		],
		"59": [
			.125,
			.44444,
			.02502,
			0,
			.27778
		],
		"61": [
			-.13,
			.37,
			.05087,
			0,
			.77778
		],
		"63": [
			0,
			.69444,
			.11809,
			0,
			.47222
		],
		"64": [
			0,
			.69444,
			.07555,
			0,
			.66667
		],
		"65": [
			0,
			.69444,
			0,
			0,
			.66667
		],
		"66": [
			0,
			.69444,
			.08293,
			0,
			.66667
		],
		"67": [
			0,
			.69444,
			.11983,
			0,
			.63889
		],
		"68": [
			0,
			.69444,
			.07555,
			0,
			.72223
		],
		"69": [
			0,
			.69444,
			.11983,
			0,
			.59722
		],
		"70": [
			0,
			.69444,
			.13372,
			0,
			.56945
		],
		"71": [
			0,
			.69444,
			.11983,
			0,
			.66667
		],
		"72": [
			0,
			.69444,
			.08094,
			0,
			.70834
		],
		"73": [
			0,
			.69444,
			.13372,
			0,
			.27778
		],
		"74": [
			0,
			.69444,
			.08094,
			0,
			.47222
		],
		"75": [
			0,
			.69444,
			.11983,
			0,
			.69445
		],
		"76": [
			0,
			.69444,
			0,
			0,
			.54167
		],
		"77": [
			0,
			.69444,
			.08094,
			0,
			.875
		],
		"78": [
			0,
			.69444,
			.08094,
			0,
			.70834
		],
		"79": [
			0,
			.69444,
			.07555,
			0,
			.73611
		],
		"80": [
			0,
			.69444,
			.08293,
			0,
			.63889
		],
		"81": [
			.125,
			.69444,
			.07555,
			0,
			.73611
		],
		"82": [
			0,
			.69444,
			.08293,
			0,
			.64584
		],
		"83": [
			0,
			.69444,
			.09205,
			0,
			.55556
		],
		"84": [
			0,
			.69444,
			.13372,
			0,
			.68056
		],
		"85": [
			0,
			.69444,
			.08094,
			0,
			.6875
		],
		"86": [
			0,
			.69444,
			.1615,
			0,
			.66667
		],
		"87": [
			0,
			.69444,
			.1615,
			0,
			.94445
		],
		"88": [
			0,
			.69444,
			.13372,
			0,
			.66667
		],
		"89": [
			0,
			.69444,
			.17261,
			0,
			.66667
		],
		"90": [
			0,
			.69444,
			.11983,
			0,
			.61111
		],
		"91": [
			.25,
			.75,
			.15942,
			0,
			.28889
		],
		"93": [
			.25,
			.75,
			.08719,
			0,
			.28889
		],
		"94": [
			0,
			.69444,
			.0799,
			0,
			.5
		],
		"95": [
			.35,
			.09444,
			.08616,
			0,
			.5
		],
		"97": [
			0,
			.44444,
			.00981,
			0,
			.48056
		],
		"98": [
			0,
			.69444,
			.03057,
			0,
			.51667
		],
		"99": [
			0,
			.44444,
			.08336,
			0,
			.44445
		],
		"100": [
			0,
			.69444,
			.09483,
			0,
			.51667
		],
		"101": [
			0,
			.44444,
			.06778,
			0,
			.44445
		],
		"102": [
			0,
			.69444,
			.21705,
			0,
			.30556
		],
		"103": [
			.19444,
			.44444,
			.10836,
			0,
			.5
		],
		"104": [
			0,
			.69444,
			.01778,
			0,
			.51667
		],
		"105": [
			0,
			.67937,
			.09718,
			0,
			.23889
		],
		"106": [
			.19444,
			.67937,
			.09162,
			0,
			.26667
		],
		"107": [
			0,
			.69444,
			.08336,
			0,
			.48889
		],
		"108": [
			0,
			.69444,
			.09483,
			0,
			.23889
		],
		"109": [
			0,
			.44444,
			.01778,
			0,
			.79445
		],
		"110": [
			0,
			.44444,
			.01778,
			0,
			.51667
		],
		"111": [
			0,
			.44444,
			.06613,
			0,
			.5
		],
		"112": [
			.19444,
			.44444,
			.0389,
			0,
			.51667
		],
		"113": [
			.19444,
			.44444,
			.04169,
			0,
			.51667
		],
		"114": [
			0,
			.44444,
			.10836,
			0,
			.34167
		],
		"115": [
			0,
			.44444,
			.0778,
			0,
			.38333
		],
		"116": [
			0,
			.57143,
			.07225,
			0,
			.36111
		],
		"117": [
			0,
			.44444,
			.04169,
			0,
			.51667
		],
		"118": [
			0,
			.44444,
			.10836,
			0,
			.46111
		],
		"119": [
			0,
			.44444,
			.10836,
			0,
			.68334
		],
		"120": [
			0,
			.44444,
			.09169,
			0,
			.46111
		],
		"121": [
			.19444,
			.44444,
			.10836,
			0,
			.46111
		],
		"122": [
			0,
			.44444,
			.08752,
			0,
			.43472
		],
		"126": [
			.35,
			.32659,
			.08826,
			0,
			.5
		],
		"160": [
			0,
			0,
			0,
			0,
			.25
		],
		"168": [
			0,
			.67937,
			.06385,
			0,
			.5
		],
		"176": [
			0,
			.69444,
			0,
			0,
			.73752
		],
		"184": [
			.17014,
			0,
			0,
			0,
			.44445
		],
		"305": [
			0,
			.44444,
			.04169,
			0,
			.23889
		],
		"567": [
			.19444,
			.44444,
			.04169,
			0,
			.26667
		],
		"710": [
			0,
			.69444,
			.0799,
			0,
			.5
		],
		"711": [
			0,
			.63194,
			.08432,
			0,
			.5
		],
		"713": [
			0,
			.60889,
			.08776,
			0,
			.5
		],
		"714": [
			0,
			.69444,
			.09205,
			0,
			.5
		],
		"715": [
			0,
			.69444,
			0,
			0,
			.5
		],
		"728": [
			0,
			.69444,
			.09483,
			0,
			.5
		],
		"729": [
			0,
			.67937,
			.07774,
			0,
			.27778
		],
		"730": [
			0,
			.69444,
			0,
			0,
			.73752
		],
		"732": [
			0,
			.67659,
			.08826,
			0,
			.5
		],
		"733": [
			0,
			.69444,
			.09205,
			0,
			.5
		],
		"915": [
			0,
			.69444,
			.13372,
			0,
			.54167
		],
		"916": [
			0,
			.69444,
			0,
			0,
			.83334
		],
		"920": [
			0,
			.69444,
			.07555,
			0,
			.77778
		],
		"923": [
			0,
			.69444,
			0,
			0,
			.61111
		],
		"926": [
			0,
			.69444,
			.12816,
			0,
			.66667
		],
		"928": [
			0,
			.69444,
			.08094,
			0,
			.70834
		],
		"931": [
			0,
			.69444,
			.11983,
			0,
			.72222
		],
		"933": [
			0,
			.69444,
			.09031,
			0,
			.77778
		],
		"934": [
			0,
			.69444,
			.04603,
			0,
			.72222
		],
		"936": [
			0,
			.69444,
			.09031,
			0,
			.77778
		],
		"937": [
			0,
			.69444,
			.08293,
			0,
			.72222
		],
		"8211": [
			0,
			.44444,
			.08616,
			0,
			.5
		],
		"8212": [
			0,
			.44444,
			.08616,
			0,
			1
		],
		"8216": [
			0,
			.69444,
			.07816,
			0,
			.27778
		],
		"8217": [
			0,
			.69444,
			.07816,
			0,
			.27778
		],
		"8220": [
			0,
			.69444,
			.14205,
			0,
			.5
		],
		"8221": [
			0,
			.69444,
			.00316,
			0,
			.5
		]
	},
	"SansSerif-Regular": {
		"32": [
			0,
			0,
			0,
			0,
			.25
		],
		"33": [
			0,
			.69444,
			0,
			0,
			.31945
		],
		"34": [
			0,
			.69444,
			0,
			0,
			.5
		],
		"35": [
			.19444,
			.69444,
			0,
			0,
			.83334
		],
		"36": [
			.05556,
			.75,
			0,
			0,
			.5
		],
		"37": [
			.05556,
			.75,
			0,
			0,
			.83334
		],
		"38": [
			0,
			.69444,
			0,
			0,
			.75834
		],
		"39": [
			0,
			.69444,
			0,
			0,
			.27778
		],
		"40": [
			.25,
			.75,
			0,
			0,
			.38889
		],
		"41": [
			.25,
			.75,
			0,
			0,
			.38889
		],
		"42": [
			0,
			.75,
			0,
			0,
			.5
		],
		"43": [
			.08333,
			.58333,
			0,
			0,
			.77778
		],
		"44": [
			.125,
			.08333,
			0,
			0,
			.27778
		],
		"45": [
			0,
			.44444,
			0,
			0,
			.33333
		],
		"46": [
			0,
			.08333,
			0,
			0,
			.27778
		],
		"47": [
			.25,
			.75,
			0,
			0,
			.5
		],
		"48": [
			0,
			.65556,
			0,
			0,
			.5
		],
		"49": [
			0,
			.65556,
			0,
			0,
			.5
		],
		"50": [
			0,
			.65556,
			0,
			0,
			.5
		],
		"51": [
			0,
			.65556,
			0,
			0,
			.5
		],
		"52": [
			0,
			.65556,
			0,
			0,
			.5
		],
		"53": [
			0,
			.65556,
			0,
			0,
			.5
		],
		"54": [
			0,
			.65556,
			0,
			0,
			.5
		],
		"55": [
			0,
			.65556,
			0,
			0,
			.5
		],
		"56": [
			0,
			.65556,
			0,
			0,
			.5
		],
		"57": [
			0,
			.65556,
			0,
			0,
			.5
		],
		"58": [
			0,
			.44444,
			0,
			0,
			.27778
		],
		"59": [
			.125,
			.44444,
			0,
			0,
			.27778
		],
		"61": [
			-.13,
			.37,
			0,
			0,
			.77778
		],
		"63": [
			0,
			.69444,
			0,
			0,
			.47222
		],
		"64": [
			0,
			.69444,
			0,
			0,
			.66667
		],
		"65": [
			0,
			.69444,
			0,
			0,
			.66667
		],
		"66": [
			0,
			.69444,
			0,
			0,
			.66667
		],
		"67": [
			0,
			.69444,
			0,
			0,
			.63889
		],
		"68": [
			0,
			.69444,
			0,
			0,
			.72223
		],
		"69": [
			0,
			.69444,
			0,
			0,
			.59722
		],
		"70": [
			0,
			.69444,
			0,
			0,
			.56945
		],
		"71": [
			0,
			.69444,
			0,
			0,
			.66667
		],
		"72": [
			0,
			.69444,
			0,
			0,
			.70834
		],
		"73": [
			0,
			.69444,
			0,
			0,
			.27778
		],
		"74": [
			0,
			.69444,
			0,
			0,
			.47222
		],
		"75": [
			0,
			.69444,
			0,
			0,
			.69445
		],
		"76": [
			0,
			.69444,
			0,
			0,
			.54167
		],
		"77": [
			0,
			.69444,
			0,
			0,
			.875
		],
		"78": [
			0,
			.69444,
			0,
			0,
			.70834
		],
		"79": [
			0,
			.69444,
			0,
			0,
			.73611
		],
		"80": [
			0,
			.69444,
			0,
			0,
			.63889
		],
		"81": [
			.125,
			.69444,
			0,
			0,
			.73611
		],
		"82": [
			0,
			.69444,
			0,
			0,
			.64584
		],
		"83": [
			0,
			.69444,
			0,
			0,
			.55556
		],
		"84": [
			0,
			.69444,
			0,
			0,
			.68056
		],
		"85": [
			0,
			.69444,
			0,
			0,
			.6875
		],
		"86": [
			0,
			.69444,
			.01389,
			0,
			.66667
		],
		"87": [
			0,
			.69444,
			.01389,
			0,
			.94445
		],
		"88": [
			0,
			.69444,
			0,
			0,
			.66667
		],
		"89": [
			0,
			.69444,
			.025,
			0,
			.66667
		],
		"90": [
			0,
			.69444,
			0,
			0,
			.61111
		],
		"91": [
			.25,
			.75,
			0,
			0,
			.28889
		],
		"93": [
			.25,
			.75,
			0,
			0,
			.28889
		],
		"94": [
			0,
			.69444,
			0,
			0,
			.5
		],
		"95": [
			.35,
			.09444,
			.02778,
			0,
			.5
		],
		"97": [
			0,
			.44444,
			0,
			0,
			.48056
		],
		"98": [
			0,
			.69444,
			0,
			0,
			.51667
		],
		"99": [
			0,
			.44444,
			0,
			0,
			.44445
		],
		"100": [
			0,
			.69444,
			0,
			0,
			.51667
		],
		"101": [
			0,
			.44444,
			0,
			0,
			.44445
		],
		"102": [
			0,
			.69444,
			.06944,
			0,
			.30556
		],
		"103": [
			.19444,
			.44444,
			.01389,
			0,
			.5
		],
		"104": [
			0,
			.69444,
			0,
			0,
			.51667
		],
		"105": [
			0,
			.67937,
			0,
			0,
			.23889
		],
		"106": [
			.19444,
			.67937,
			0,
			0,
			.26667
		],
		"107": [
			0,
			.69444,
			0,
			0,
			.48889
		],
		"108": [
			0,
			.69444,
			0,
			0,
			.23889
		],
		"109": [
			0,
			.44444,
			0,
			0,
			.79445
		],
		"110": [
			0,
			.44444,
			0,
			0,
			.51667
		],
		"111": [
			0,
			.44444,
			0,
			0,
			.5
		],
		"112": [
			.19444,
			.44444,
			0,
			0,
			.51667
		],
		"113": [
			.19444,
			.44444,
			0,
			0,
			.51667
		],
		"114": [
			0,
			.44444,
			.01389,
			0,
			.34167
		],
		"115": [
			0,
			.44444,
			0,
			0,
			.38333
		],
		"116": [
			0,
			.57143,
			0,
			0,
			.36111
		],
		"117": [
			0,
			.44444,
			0,
			0,
			.51667
		],
		"118": [
			0,
			.44444,
			.01389,
			0,
			.46111
		],
		"119": [
			0,
			.44444,
			.01389,
			0,
			.68334
		],
		"120": [
			0,
			.44444,
			0,
			0,
			.46111
		],
		"121": [
			.19444,
			.44444,
			.01389,
			0,
			.46111
		],
		"122": [
			0,
			.44444,
			0,
			0,
			.43472
		],
		"126": [
			.35,
			.32659,
			0,
			0,
			.5
		],
		"160": [
			0,
			0,
			0,
			0,
			.25
		],
		"168": [
			0,
			.67937,
			0,
			0,
			.5
		],
		"176": [
			0,
			.69444,
			0,
			0,
			.66667
		],
		"184": [
			.17014,
			0,
			0,
			0,
			.44445
		],
		"305": [
			0,
			.44444,
			0,
			0,
			.23889
		],
		"567": [
			.19444,
			.44444,
			0,
			0,
			.26667
		],
		"710": [
			0,
			.69444,
			0,
			0,
			.5
		],
		"711": [
			0,
			.63194,
			0,
			0,
			.5
		],
		"713": [
			0,
			.60889,
			0,
			0,
			.5
		],
		"714": [
			0,
			.69444,
			0,
			0,
			.5
		],
		"715": [
			0,
			.69444,
			0,
			0,
			.5
		],
		"728": [
			0,
			.69444,
			0,
			0,
			.5
		],
		"729": [
			0,
			.67937,
			0,
			0,
			.27778
		],
		"730": [
			0,
			.69444,
			0,
			0,
			.66667
		],
		"732": [
			0,
			.67659,
			0,
			0,
			.5
		],
		"733": [
			0,
			.69444,
			0,
			0,
			.5
		],
		"915": [
			0,
			.69444,
			0,
			0,
			.54167
		],
		"916": [
			0,
			.69444,
			0,
			0,
			.83334
		],
		"920": [
			0,
			.69444,
			0,
			0,
			.77778
		],
		"923": [
			0,
			.69444,
			0,
			0,
			.61111
		],
		"926": [
			0,
			.69444,
			0,
			0,
			.66667
		],
		"928": [
			0,
			.69444,
			0,
			0,
			.70834
		],
		"931": [
			0,
			.69444,
			0,
			0,
			.72222
		],
		"933": [
			0,
			.69444,
			0,
			0,
			.77778
		],
		"934": [
			0,
			.69444,
			0,
			0,
			.72222
		],
		"936": [
			0,
			.69444,
			0,
			0,
			.77778
		],
		"937": [
			0,
			.69444,
			0,
			0,
			.72222
		],
		"8211": [
			0,
			.44444,
			.02778,
			0,
			.5
		],
		"8212": [
			0,
			.44444,
			.02778,
			0,
			1
		],
		"8216": [
			0,
			.69444,
			0,
			0,
			.27778
		],
		"8217": [
			0,
			.69444,
			0,
			0,
			.27778
		],
		"8220": [
			0,
			.69444,
			0,
			0,
			.5
		],
		"8221": [
			0,
			.69444,
			0,
			0,
			.5
		]
	},
	"Script-Regular": {
		"32": [
			0,
			0,
			0,
			0,
			.25
		],
		"65": [
			0,
			.7,
			.22925,
			0,
			.80253
		],
		"66": [
			0,
			.7,
			.04087,
			0,
			.90757
		],
		"67": [
			0,
			.7,
			.1689,
			0,
			.66619
		],
		"68": [
			0,
			.7,
			.09371,
			0,
			.77443
		],
		"69": [
			0,
			.7,
			.18583,
			0,
			.56162
		],
		"70": [
			0,
			.7,
			.13634,
			0,
			.89544
		],
		"71": [
			0,
			.7,
			.17322,
			0,
			.60961
		],
		"72": [
			0,
			.7,
			.29694,
			0,
			.96919
		],
		"73": [
			0,
			.7,
			.19189,
			0,
			.80907
		],
		"74": [
			.27778,
			.7,
			.19189,
			0,
			1.05159
		],
		"75": [
			0,
			.7,
			.31259,
			0,
			.91364
		],
		"76": [
			0,
			.7,
			.19189,
			0,
			.87373
		],
		"77": [
			0,
			.7,
			.15981,
			0,
			1.08031
		],
		"78": [
			0,
			.7,
			.3525,
			0,
			.9015
		],
		"79": [
			0,
			.7,
			.08078,
			0,
			.73787
		],
		"80": [
			0,
			.7,
			.08078,
			0,
			1.01262
		],
		"81": [
			0,
			.7,
			.03305,
			0,
			.88282
		],
		"82": [
			0,
			.7,
			.06259,
			0,
			.85
		],
		"83": [
			0,
			.7,
			.19189,
			0,
			.86767
		],
		"84": [
			0,
			.7,
			.29087,
			0,
			.74697
		],
		"85": [
			0,
			.7,
			.25815,
			0,
			.79996
		],
		"86": [
			0,
			.7,
			.27523,
			0,
			.62204
		],
		"87": [
			0,
			.7,
			.27523,
			0,
			.80532
		],
		"88": [
			0,
			.7,
			.26006,
			0,
			.94445
		],
		"89": [
			0,
			.7,
			.2939,
			0,
			.70961
		],
		"90": [
			0,
			.7,
			.24037,
			0,
			.8212
		],
		"160": [
			0,
			0,
			0,
			0,
			.25
		]
	},
	"Size1-Regular": {
		"32": [
			0,
			0,
			0,
			0,
			.25
		],
		"40": [
			.35001,
			.85,
			0,
			0,
			.45834
		],
		"41": [
			.35001,
			.85,
			0,
			0,
			.45834
		],
		"47": [
			.35001,
			.85,
			0,
			0,
			.57778
		],
		"91": [
			.35001,
			.85,
			0,
			0,
			.41667
		],
		"92": [
			.35001,
			.85,
			0,
			0,
			.57778
		],
		"93": [
			.35001,
			.85,
			0,
			0,
			.41667
		],
		"123": [
			.35001,
			.85,
			0,
			0,
			.58334
		],
		"125": [
			.35001,
			.85,
			0,
			0,
			.58334
		],
		"160": [
			0,
			0,
			0,
			0,
			.25
		],
		"710": [
			0,
			.72222,
			0,
			0,
			.55556
		],
		"732": [
			0,
			.72222,
			0,
			0,
			.55556
		],
		"770": [
			0,
			.72222,
			0,
			0,
			.55556
		],
		"771": [
			0,
			.72222,
			0,
			0,
			.55556
		],
		"8214": [
			-99e-5,
			.601,
			0,
			0,
			.77778
		],
		"8593": [
			1e-5,
			.6,
			0,
			0,
			.66667
		],
		"8595": [
			1e-5,
			.6,
			0,
			0,
			.66667
		],
		"8657": [
			1e-5,
			.6,
			0,
			0,
			.77778
		],
		"8659": [
			1e-5,
			.6,
			0,
			0,
			.77778
		],
		"8719": [
			.25001,
			.75,
			0,
			0,
			.94445
		],
		"8720": [
			.25001,
			.75,
			0,
			0,
			.94445
		],
		"8721": [
			.25001,
			.75,
			0,
			0,
			1.05556
		],
		"8730": [
			.35001,
			.85,
			0,
			0,
			1
		],
		"8739": [
			-.00599,
			.606,
			0,
			0,
			.33333
		],
		"8741": [
			-.00599,
			.606,
			0,
			0,
			.55556
		],
		"8747": [
			.30612,
			.805,
			.19445,
			0,
			.47222
		],
		"8748": [
			.306,
			.805,
			.19445,
			0,
			.47222
		],
		"8749": [
			.306,
			.805,
			.19445,
			0,
			.47222
		],
		"8750": [
			.30612,
			.805,
			.19445,
			0,
			.47222
		],
		"8896": [
			.25001,
			.75,
			0,
			0,
			.83334
		],
		"8897": [
			.25001,
			.75,
			0,
			0,
			.83334
		],
		"8898": [
			.25001,
			.75,
			0,
			0,
			.83334
		],
		"8899": [
			.25001,
			.75,
			0,
			0,
			.83334
		],
		"8968": [
			.35001,
			.85,
			0,
			0,
			.47222
		],
		"8969": [
			.35001,
			.85,
			0,
			0,
			.47222
		],
		"8970": [
			.35001,
			.85,
			0,
			0,
			.47222
		],
		"8971": [
			.35001,
			.85,
			0,
			0,
			.47222
		],
		"9168": [
			-99e-5,
			.601,
			0,
			0,
			.66667
		],
		"10216": [
			.35001,
			.85,
			0,
			0,
			.47222
		],
		"10217": [
			.35001,
			.85,
			0,
			0,
			.47222
		],
		"10752": [
			.25001,
			.75,
			0,
			0,
			1.11111
		],
		"10753": [
			.25001,
			.75,
			0,
			0,
			1.11111
		],
		"10754": [
			.25001,
			.75,
			0,
			0,
			1.11111
		],
		"10756": [
			.25001,
			.75,
			0,
			0,
			.83334
		],
		"10758": [
			.25001,
			.75,
			0,
			0,
			.83334
		]
	},
	"Size2-Regular": {
		"32": [
			0,
			0,
			0,
			0,
			.25
		],
		"40": [
			.65002,
			1.15,
			0,
			0,
			.59722
		],
		"41": [
			.65002,
			1.15,
			0,
			0,
			.59722
		],
		"47": [
			.65002,
			1.15,
			0,
			0,
			.81111
		],
		"91": [
			.65002,
			1.15,
			0,
			0,
			.47222
		],
		"92": [
			.65002,
			1.15,
			0,
			0,
			.81111
		],
		"93": [
			.65002,
			1.15,
			0,
			0,
			.47222
		],
		"123": [
			.65002,
			1.15,
			0,
			0,
			.66667
		],
		"125": [
			.65002,
			1.15,
			0,
			0,
			.66667
		],
		"160": [
			0,
			0,
			0,
			0,
			.25
		],
		"710": [
			0,
			.75,
			0,
			0,
			1
		],
		"732": [
			0,
			.75,
			0,
			0,
			1
		],
		"770": [
			0,
			.75,
			0,
			0,
			1
		],
		"771": [
			0,
			.75,
			0,
			0,
			1
		],
		"8719": [
			.55001,
			1.05,
			0,
			0,
			1.27778
		],
		"8720": [
			.55001,
			1.05,
			0,
			0,
			1.27778
		],
		"8721": [
			.55001,
			1.05,
			0,
			0,
			1.44445
		],
		"8730": [
			.65002,
			1.15,
			0,
			0,
			1
		],
		"8747": [
			.86225,
			1.36,
			.44445,
			0,
			.55556
		],
		"8748": [
			.862,
			1.36,
			.44445,
			0,
			.55556
		],
		"8749": [
			.862,
			1.36,
			.44445,
			0,
			.55556
		],
		"8750": [
			.86225,
			1.36,
			.44445,
			0,
			.55556
		],
		"8896": [
			.55001,
			1.05,
			0,
			0,
			1.11111
		],
		"8897": [
			.55001,
			1.05,
			0,
			0,
			1.11111
		],
		"8898": [
			.55001,
			1.05,
			0,
			0,
			1.11111
		],
		"8899": [
			.55001,
			1.05,
			0,
			0,
			1.11111
		],
		"8968": [
			.65002,
			1.15,
			0,
			0,
			.52778
		],
		"8969": [
			.65002,
			1.15,
			0,
			0,
			.52778
		],
		"8970": [
			.65002,
			1.15,
			0,
			0,
			.52778
		],
		"8971": [
			.65002,
			1.15,
			0,
			0,
			.52778
		],
		"10216": [
			.65002,
			1.15,
			0,
			0,
			.61111
		],
		"10217": [
			.65002,
			1.15,
			0,
			0,
			.61111
		],
		"10752": [
			.55001,
			1.05,
			0,
			0,
			1.51112
		],
		"10753": [
			.55001,
			1.05,
			0,
			0,
			1.51112
		],
		"10754": [
			.55001,
			1.05,
			0,
			0,
			1.51112
		],
		"10756": [
			.55001,
			1.05,
			0,
			0,
			1.11111
		],
		"10758": [
			.55001,
			1.05,
			0,
			0,
			1.11111
		]
	},
	"Size3-Regular": {
		"32": [
			0,
			0,
			0,
			0,
			.25
		],
		"40": [
			.95003,
			1.45,
			0,
			0,
			.73611
		],
		"41": [
			.95003,
			1.45,
			0,
			0,
			.73611
		],
		"47": [
			.95003,
			1.45,
			0,
			0,
			1.04445
		],
		"91": [
			.95003,
			1.45,
			0,
			0,
			.52778
		],
		"92": [
			.95003,
			1.45,
			0,
			0,
			1.04445
		],
		"93": [
			.95003,
			1.45,
			0,
			0,
			.52778
		],
		"123": [
			.95003,
			1.45,
			0,
			0,
			.75
		],
		"125": [
			.95003,
			1.45,
			0,
			0,
			.75
		],
		"160": [
			0,
			0,
			0,
			0,
			.25
		],
		"710": [
			0,
			.75,
			0,
			0,
			1.44445
		],
		"732": [
			0,
			.75,
			0,
			0,
			1.44445
		],
		"770": [
			0,
			.75,
			0,
			0,
			1.44445
		],
		"771": [
			0,
			.75,
			0,
			0,
			1.44445
		],
		"8730": [
			.95003,
			1.45,
			0,
			0,
			1
		],
		"8968": [
			.95003,
			1.45,
			0,
			0,
			.58334
		],
		"8969": [
			.95003,
			1.45,
			0,
			0,
			.58334
		],
		"8970": [
			.95003,
			1.45,
			0,
			0,
			.58334
		],
		"8971": [
			.95003,
			1.45,
			0,
			0,
			.58334
		],
		"10216": [
			.95003,
			1.45,
			0,
			0,
			.75
		],
		"10217": [
			.95003,
			1.45,
			0,
			0,
			.75
		]
	},
	"Size4-Regular": {
		"32": [
			0,
			0,
			0,
			0,
			.25
		],
		"40": [
			1.25003,
			1.75,
			0,
			0,
			.79167
		],
		"41": [
			1.25003,
			1.75,
			0,
			0,
			.79167
		],
		"47": [
			1.25003,
			1.75,
			0,
			0,
			1.27778
		],
		"91": [
			1.25003,
			1.75,
			0,
			0,
			.58334
		],
		"92": [
			1.25003,
			1.75,
			0,
			0,
			1.27778
		],
		"93": [
			1.25003,
			1.75,
			0,
			0,
			.58334
		],
		"123": [
			1.25003,
			1.75,
			0,
			0,
			.80556
		],
		"125": [
			1.25003,
			1.75,
			0,
			0,
			.80556
		],
		"160": [
			0,
			0,
			0,
			0,
			.25
		],
		"710": [
			0,
			.825,
			0,
			0,
			1.8889
		],
		"732": [
			0,
			.825,
			0,
			0,
			1.8889
		],
		"770": [
			0,
			.825,
			0,
			0,
			1.8889
		],
		"771": [
			0,
			.825,
			0,
			0,
			1.8889
		],
		"8730": [
			1.25003,
			1.75,
			0,
			0,
			1
		],
		"8968": [
			1.25003,
			1.75,
			0,
			0,
			.63889
		],
		"8969": [
			1.25003,
			1.75,
			0,
			0,
			.63889
		],
		"8970": [
			1.25003,
			1.75,
			0,
			0,
			.63889
		],
		"8971": [
			1.25003,
			1.75,
			0,
			0,
			.63889
		],
		"9115": [
			.64502,
			1.155,
			0,
			0,
			.875
		],
		"9116": [
			1e-5,
			.6,
			0,
			0,
			.875
		],
		"9117": [
			.64502,
			1.155,
			0,
			0,
			.875
		],
		"9118": [
			.64502,
			1.155,
			0,
			0,
			.875
		],
		"9119": [
			1e-5,
			.6,
			0,
			0,
			.875
		],
		"9120": [
			.64502,
			1.155,
			0,
			0,
			.875
		],
		"9121": [
			.64502,
			1.155,
			0,
			0,
			.66667
		],
		"9122": [
			-99e-5,
			.601,
			0,
			0,
			.66667
		],
		"9123": [
			.64502,
			1.155,
			0,
			0,
			.66667
		],
		"9124": [
			.64502,
			1.155,
			0,
			0,
			.66667
		],
		"9125": [
			-99e-5,
			.601,
			0,
			0,
			.66667
		],
		"9126": [
			.64502,
			1.155,
			0,
			0,
			.66667
		],
		"9127": [
			1e-5,
			.9,
			0,
			0,
			.88889
		],
		"9128": [
			.65002,
			1.15,
			0,
			0,
			.88889
		],
		"9129": [
			.90001,
			0,
			0,
			0,
			.88889
		],
		"9130": [
			0,
			.3,
			0,
			0,
			.88889
		],
		"9131": [
			1e-5,
			.9,
			0,
			0,
			.88889
		],
		"9132": [
			.65002,
			1.15,
			0,
			0,
			.88889
		],
		"9133": [
			.90001,
			0,
			0,
			0,
			.88889
		],
		"9143": [
			.88502,
			.915,
			0,
			0,
			1.05556
		],
		"10216": [
			1.25003,
			1.75,
			0,
			0,
			.80556
		],
		"10217": [
			1.25003,
			1.75,
			0,
			0,
			.80556
		],
		"57344": [
			-.00499,
			.605,
			0,
			0,
			1.05556
		],
		"57345": [
			-.00499,
			.605,
			0,
			0,
			1.05556
		],
		"57680": [
			0,
			.12,
			0,
			0,
			.45
		],
		"57681": [
			0,
			.12,
			0,
			0,
			.45
		],
		"57682": [
			0,
			.12,
			0,
			0,
			.45
		],
		"57683": [
			0,
			.12,
			0,
			0,
			.45
		]
	},
	"Typewriter-Regular": {
		"32": [
			0,
			0,
			0,
			0,
			.525
		],
		"33": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"34": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"35": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"36": [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		"37": [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		"38": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"39": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"40": [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		"41": [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		"42": [
			0,
			.52083,
			0,
			0,
			.525
		],
		"43": [
			-.08056,
			.53055,
			0,
			0,
			.525
		],
		"44": [
			.13889,
			.125,
			0,
			0,
			.525
		],
		"45": [
			-.08056,
			.53055,
			0,
			0,
			.525
		],
		"46": [
			0,
			.125,
			0,
			0,
			.525
		],
		"47": [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		"48": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"49": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"50": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"51": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"52": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"53": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"54": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"55": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"56": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"57": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"58": [
			0,
			.43056,
			0,
			0,
			.525
		],
		"59": [
			.13889,
			.43056,
			0,
			0,
			.525
		],
		"60": [
			-.05556,
			.55556,
			0,
			0,
			.525
		],
		"61": [
			-.19549,
			.41562,
			0,
			0,
			.525
		],
		"62": [
			-.05556,
			.55556,
			0,
			0,
			.525
		],
		"63": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"64": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"65": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"66": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"67": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"68": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"69": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"70": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"71": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"72": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"73": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"74": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"75": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"76": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"77": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"78": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"79": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"80": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"81": [
			.13889,
			.61111,
			0,
			0,
			.525
		],
		"82": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"83": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"84": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"85": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"86": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"87": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"88": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"89": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"90": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"91": [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		"92": [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		"93": [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		"94": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"95": [
			.09514,
			0,
			0,
			0,
			.525
		],
		"96": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"97": [
			0,
			.43056,
			0,
			0,
			.525
		],
		"98": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"99": [
			0,
			.43056,
			0,
			0,
			.525
		],
		"100": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"101": [
			0,
			.43056,
			0,
			0,
			.525
		],
		"102": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"103": [
			.22222,
			.43056,
			0,
			0,
			.525
		],
		"104": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"105": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"106": [
			.22222,
			.61111,
			0,
			0,
			.525
		],
		"107": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"108": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"109": [
			0,
			.43056,
			0,
			0,
			.525
		],
		"110": [
			0,
			.43056,
			0,
			0,
			.525
		],
		"111": [
			0,
			.43056,
			0,
			0,
			.525
		],
		"112": [
			.22222,
			.43056,
			0,
			0,
			.525
		],
		"113": [
			.22222,
			.43056,
			0,
			0,
			.525
		],
		"114": [
			0,
			.43056,
			0,
			0,
			.525
		],
		"115": [
			0,
			.43056,
			0,
			0,
			.525
		],
		"116": [
			0,
			.55358,
			0,
			0,
			.525
		],
		"117": [
			0,
			.43056,
			0,
			0,
			.525
		],
		"118": [
			0,
			.43056,
			0,
			0,
			.525
		],
		"119": [
			0,
			.43056,
			0,
			0,
			.525
		],
		"120": [
			0,
			.43056,
			0,
			0,
			.525
		],
		"121": [
			.22222,
			.43056,
			0,
			0,
			.525
		],
		"122": [
			0,
			.43056,
			0,
			0,
			.525
		],
		"123": [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		"124": [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		"125": [
			.08333,
			.69444,
			0,
			0,
			.525
		],
		"126": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"127": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"160": [
			0,
			0,
			0,
			0,
			.525
		],
		"176": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"184": [
			.19445,
			0,
			0,
			0,
			.525
		],
		"305": [
			0,
			.43056,
			0,
			0,
			.525
		],
		"567": [
			.22222,
			.43056,
			0,
			0,
			.525
		],
		"711": [
			0,
			.56597,
			0,
			0,
			.525
		],
		"713": [
			0,
			.56555,
			0,
			0,
			.525
		],
		"714": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"715": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"728": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"730": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"770": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"771": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"776": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"915": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"916": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"920": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"923": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"926": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"928": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"931": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"933": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"934": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"936": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"937": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"8216": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"8217": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"8242": [
			0,
			.61111,
			0,
			0,
			.525
		],
		"9251": [
			.11111,
			.21944,
			0,
			0,
			.525
		]
	}
};
/**
* This file contains metrics regarding fonts and individual symbols. The sigma
* and xi variables, as well as the metricMap map contain data extracted from
* TeX, TeX font metrics, and the TTF files. These data are then exposed via the
* `metrics` variable and the getCharacterMetrics function.
*/
var sigmasAndXis = {
	slant: [
		.25,
		.25,
		.25
	],
	space: [
		0,
		0,
		0
	],
	stretch: [
		0,
		0,
		0
	],
	shrink: [
		0,
		0,
		0
	],
	xHeight: [
		.431,
		.431,
		.431
	],
	quad: [
		1,
		1.171,
		1.472
	],
	extraSpace: [
		0,
		0,
		0
	],
	num1: [
		.677,
		.732,
		.925
	],
	num2: [
		.394,
		.384,
		.387
	],
	num3: [
		.444,
		.471,
		.504
	],
	denom1: [
		.686,
		.752,
		1.025
	],
	denom2: [
		.345,
		.344,
		.532
	],
	sup1: [
		.413,
		.503,
		.504
	],
	sup2: [
		.363,
		.431,
		.404
	],
	sup3: [
		.289,
		.286,
		.294
	],
	sub1: [
		.15,
		.143,
		.2
	],
	sub2: [
		.247,
		.286,
		.4
	],
	supDrop: [
		.386,
		.353,
		.494
	],
	subDrop: [
		.05,
		.071,
		.1
	],
	delim1: [
		2.39,
		1.7,
		1.98
	],
	delim2: [
		1.01,
		1.157,
		1.42
	],
	axisHeight: [
		.25,
		.25,
		.25
	],
	defaultRuleThickness: [
		.04,
		.049,
		.049
	],
	bigOpSpacing1: [
		.111,
		.111,
		.111
	],
	bigOpSpacing2: [
		.166,
		.166,
		.166
	],
	bigOpSpacing3: [
		.2,
		.2,
		.2
	],
	bigOpSpacing4: [
		.6,
		.611,
		.611
	],
	bigOpSpacing5: [
		.1,
		.143,
		.143
	],
	sqrtRuleThickness: [
		.04,
		.04,
		.04
	],
	ptPerEm: [
		10,
		10,
		10
	],
	doubleRuleSep: [
		.2,
		.2,
		.2
	],
	arrayRuleWidth: [
		.04,
		.04,
		.04
	],
	fboxsep: [
		.3,
		.3,
		.3
	],
	fboxrule: [
		.04,
		.04,
		.04
	]
};
var extraCharacterMap = {
	"Å": "A",
	"Ð": "D",
	"Þ": "o",
	"å": "a",
	"ð": "d",
	"þ": "o",
	"А": "A",
	"Б": "B",
	"В": "B",
	"Г": "F",
	"Д": "A",
	"Е": "E",
	"Ж": "K",
	"З": "3",
	"И": "N",
	"Й": "N",
	"К": "K",
	"Л": "N",
	"М": "M",
	"Н": "H",
	"О": "O",
	"П": "N",
	"Р": "P",
	"С": "C",
	"Т": "T",
	"У": "y",
	"Ф": "O",
	"Х": "X",
	"Ц": "U",
	"Ч": "h",
	"Ш": "W",
	"Щ": "W",
	"Ъ": "B",
	"Ы": "X",
	"Ь": "B",
	"Э": "3",
	"Ю": "X",
	"Я": "R",
	"а": "a",
	"б": "b",
	"в": "a",
	"г": "r",
	"д": "y",
	"е": "e",
	"ж": "m",
	"з": "e",
	"и": "n",
	"й": "n",
	"к": "n",
	"л": "n",
	"м": "m",
	"н": "n",
	"о": "o",
	"п": "n",
	"р": "p",
	"с": "c",
	"т": "o",
	"у": "y",
	"ф": "b",
	"х": "x",
	"ц": "n",
	"ч": "n",
	"ш": "w",
	"щ": "w",
	"ъ": "a",
	"ы": "m",
	"ь": "a",
	"э": "e",
	"ю": "m",
	"я": "r"
};
/**
* This function adds new font metrics to default metricMap
* It can also override existing metrics
*/
function setFontMetrics(fontName, metrics) {
	fontMetricsData[fontName] = metrics;
}
/**
* This function is a convenience function for looking up information in the
* metricMap table. It takes a character as a string, and a font.
*
* Note: the `width` property may be undefined if fontMetricsData.js wasn't
* built using `Make extended_metrics`.
*/
function getCharacterMetrics(character, font, mode) {
	if (!fontMetricsData[font]) throw new Error("Font metrics not found for font: " + font + ".");
	var ch = character.charCodeAt(0);
	var metrics = fontMetricsData[font][ch];
	if (!metrics && character[0] in extraCharacterMap) {
		ch = extraCharacterMap[character[0]].charCodeAt(0);
		metrics = fontMetricsData[font][ch];
	}
	if (!metrics && mode === "text") {
		if (supportedCodepoint(ch)) metrics = fontMetricsData[font][77];
	}
	if (metrics) return {
		depth: metrics[0],
		height: metrics[1],
		italic: metrics[2],
		skew: metrics[3],
		width: metrics[4]
	};
}
var fontMetricsBySizeIndex = {};
/**
* Get the font metrics for a given size.
*/
function getGlobalMetrics(size) {
	var sizeIndex;
	if (size >= 5) sizeIndex = 0;
	else if (size >= 3) sizeIndex = 1;
	else sizeIndex = 2;
	if (!fontMetricsBySizeIndex[sizeIndex]) {
		var metrics = fontMetricsBySizeIndex[sizeIndex] = { cssEmPerMu: sigmasAndXis.quad[sizeIndex] / 18 };
		for (var key in sigmasAndXis) if (sigmasAndXis.hasOwnProperty(key)) metrics[key] = sigmasAndXis[key][sizeIndex];
	}
	return fontMetricsBySizeIndex[sizeIndex];
}
/**
* This file holds a list of all no-argument functions and single-character
* symbols (like 'a' or ';').
*
* For each of the symbols, there are three properties they can have:
* - font (required): the font to be used for this symbol. Either "main" (the
normal font), or "ams" (the ams fonts).
* - group (required): the ParseNode group type the symbol should have (i.e.
"textord", "mathord", etc).
See https://github.com/KaTeX/KaTeX/wiki/Examining-TeX#group-types
* - replace: the character that this symbol or function should be
*   replaced with (i.e. "\phi" has a replace value of "\u03d5", the phi
*   character in the main font).
*
* The outermost map in the table indicates what mode the symbols should be
* accepted in (e.g. "math" or "text").
*/
var symbols = {
	"math": {},
	"text": {}
};
/** `acceptUnicodeChar = true` is only applicable if `replace` is set. */
function defineSymbol(mode, font, group, replace, name, acceptUnicodeChar) {
	symbols[mode][name] = {
		font,
		group,
		replace
	};
	if (acceptUnicodeChar && replace) symbols[mode][replace] = symbols[mode][name];
}
var math$1 = "math";
var text = "text";
var main = "main";
var ams = "ams";
var accent = "accent-token";
var bin = "bin";
var close = "close";
var inner = "inner";
var mathord = "mathord";
var op = "op-token";
var open = "open";
var punct = "punct";
var rel = "rel";
var spacing = "spacing";
var textord = "textord";
defineSymbol(math$1, main, rel, "≡", "\\equiv", true);
defineSymbol(math$1, main, rel, "≺", "\\prec", true);
defineSymbol(math$1, main, rel, "≻", "\\succ", true);
defineSymbol(math$1, main, rel, "∼", "\\sim", true);
defineSymbol(math$1, main, rel, "⊥", "\\perp");
defineSymbol(math$1, main, rel, "⪯", "\\preceq", true);
defineSymbol(math$1, main, rel, "⪰", "\\succeq", true);
defineSymbol(math$1, main, rel, "≃", "\\simeq", true);
defineSymbol(math$1, main, rel, "∣", "\\mid", true);
defineSymbol(math$1, main, rel, "≪", "\\ll", true);
defineSymbol(math$1, main, rel, "≫", "\\gg", true);
defineSymbol(math$1, main, rel, "≍", "\\asymp", true);
defineSymbol(math$1, main, rel, "∥", "\\parallel");
defineSymbol(math$1, main, rel, "⋈", "\\bowtie", true);
defineSymbol(math$1, main, rel, "⌣", "\\smile", true);
defineSymbol(math$1, main, rel, "⊑", "\\sqsubseteq", true);
defineSymbol(math$1, main, rel, "⊒", "\\sqsupseteq", true);
defineSymbol(math$1, main, rel, "≐", "\\doteq", true);
defineSymbol(math$1, main, rel, "⌢", "\\frown", true);
defineSymbol(math$1, main, rel, "∋", "\\ni", true);
defineSymbol(math$1, main, rel, "∝", "\\propto", true);
defineSymbol(math$1, main, rel, "⊢", "\\vdash", true);
defineSymbol(math$1, main, rel, "⊣", "\\dashv", true);
defineSymbol(math$1, main, rel, "∋", "\\owns");
defineSymbol(math$1, main, punct, ".", "\\ldotp");
defineSymbol(math$1, main, punct, "⋅", "\\cdotp");
defineSymbol(math$1, main, punct, "⋅", "·");
defineSymbol(text, main, textord, "⋅", "·");
defineSymbol(math$1, main, textord, "#", "\\#");
defineSymbol(text, main, textord, "#", "\\#");
defineSymbol(math$1, main, textord, "&", "\\&");
defineSymbol(text, main, textord, "&", "\\&");
defineSymbol(math$1, main, textord, "ℵ", "\\aleph", true);
defineSymbol(math$1, main, textord, "∀", "\\forall", true);
defineSymbol(math$1, main, textord, "ℏ", "\\hbar", true);
defineSymbol(math$1, main, textord, "∃", "\\exists", true);
defineSymbol(math$1, main, textord, "∇", "\\nabla", true);
defineSymbol(math$1, main, textord, "♭", "\\flat", true);
defineSymbol(math$1, main, textord, "ℓ", "\\ell", true);
defineSymbol(math$1, main, textord, "♮", "\\natural", true);
defineSymbol(math$1, main, textord, "♣", "\\clubsuit", true);
defineSymbol(math$1, main, textord, "℘", "\\wp", true);
defineSymbol(math$1, main, textord, "♯", "\\sharp", true);
defineSymbol(math$1, main, textord, "♢", "\\diamondsuit", true);
defineSymbol(math$1, main, textord, "ℜ", "\\Re", true);
defineSymbol(math$1, main, textord, "♡", "\\heartsuit", true);
defineSymbol(math$1, main, textord, "ℑ", "\\Im", true);
defineSymbol(math$1, main, textord, "♠", "\\spadesuit", true);
defineSymbol(math$1, main, textord, "§", "\\S", true);
defineSymbol(text, main, textord, "§", "\\S");
defineSymbol(math$1, main, textord, "¶", "\\P", true);
defineSymbol(text, main, textord, "¶", "\\P");
defineSymbol(math$1, main, textord, "†", "\\dag");
defineSymbol(text, main, textord, "†", "\\dag");
defineSymbol(text, main, textord, "†", "\\textdagger");
defineSymbol(math$1, main, textord, "‡", "\\ddag");
defineSymbol(text, main, textord, "‡", "\\ddag");
defineSymbol(text, main, textord, "‡", "\\textdaggerdbl");
defineSymbol(math$1, main, close, "⎱", "\\rmoustache", true);
defineSymbol(math$1, main, open, "⎰", "\\lmoustache", true);
defineSymbol(math$1, main, close, "⟯", "\\rgroup", true);
defineSymbol(math$1, main, open, "⟮", "\\lgroup", true);
defineSymbol(math$1, main, bin, "∓", "\\mp", true);
defineSymbol(math$1, main, bin, "⊖", "\\ominus", true);
defineSymbol(math$1, main, bin, "⊎", "\\uplus", true);
defineSymbol(math$1, main, bin, "⊓", "\\sqcap", true);
defineSymbol(math$1, main, bin, "∗", "\\ast");
defineSymbol(math$1, main, bin, "⊔", "\\sqcup", true);
defineSymbol(math$1, main, bin, "◯", "\\bigcirc", true);
defineSymbol(math$1, main, bin, "∙", "\\bullet", true);
defineSymbol(math$1, main, bin, "‡", "\\ddagger");
defineSymbol(math$1, main, bin, "≀", "\\wr", true);
defineSymbol(math$1, main, bin, "⨿", "\\amalg");
defineSymbol(math$1, main, bin, "&", "\\And");
defineSymbol(math$1, main, rel, "⟵", "\\longleftarrow", true);
defineSymbol(math$1, main, rel, "⇐", "\\Leftarrow", true);
defineSymbol(math$1, main, rel, "⟸", "\\Longleftarrow", true);
defineSymbol(math$1, main, rel, "⟶", "\\longrightarrow", true);
defineSymbol(math$1, main, rel, "⇒", "\\Rightarrow", true);
defineSymbol(math$1, main, rel, "⟹", "\\Longrightarrow", true);
defineSymbol(math$1, main, rel, "↔", "\\leftrightarrow", true);
defineSymbol(math$1, main, rel, "⟷", "\\longleftrightarrow", true);
defineSymbol(math$1, main, rel, "⇔", "\\Leftrightarrow", true);
defineSymbol(math$1, main, rel, "⟺", "\\Longleftrightarrow", true);
defineSymbol(math$1, main, rel, "↦", "\\mapsto", true);
defineSymbol(math$1, main, rel, "⟼", "\\longmapsto", true);
defineSymbol(math$1, main, rel, "↗", "\\nearrow", true);
defineSymbol(math$1, main, rel, "↩", "\\hookleftarrow", true);
defineSymbol(math$1, main, rel, "↪", "\\hookrightarrow", true);
defineSymbol(math$1, main, rel, "↘", "\\searrow", true);
defineSymbol(math$1, main, rel, "↼", "\\leftharpoonup", true);
defineSymbol(math$1, main, rel, "⇀", "\\rightharpoonup", true);
defineSymbol(math$1, main, rel, "↙", "\\swarrow", true);
defineSymbol(math$1, main, rel, "↽", "\\leftharpoondown", true);
defineSymbol(math$1, main, rel, "⇁", "\\rightharpoondown", true);
defineSymbol(math$1, main, rel, "↖", "\\nwarrow", true);
defineSymbol(math$1, main, rel, "⇌", "\\rightleftharpoons", true);
defineSymbol(math$1, ams, rel, "≮", "\\nless", true);
defineSymbol(math$1, ams, rel, "", "\\@nleqslant");
defineSymbol(math$1, ams, rel, "", "\\@nleqq");
defineSymbol(math$1, ams, rel, "⪇", "\\lneq", true);
defineSymbol(math$1, ams, rel, "≨", "\\lneqq", true);
defineSymbol(math$1, ams, rel, "", "\\@lvertneqq");
defineSymbol(math$1, ams, rel, "⋦", "\\lnsim", true);
defineSymbol(math$1, ams, rel, "⪉", "\\lnapprox", true);
defineSymbol(math$1, ams, rel, "⊀", "\\nprec", true);
defineSymbol(math$1, ams, rel, "⋠", "\\npreceq", true);
defineSymbol(math$1, ams, rel, "⋨", "\\precnsim", true);
defineSymbol(math$1, ams, rel, "⪹", "\\precnapprox", true);
defineSymbol(math$1, ams, rel, "≁", "\\nsim", true);
defineSymbol(math$1, ams, rel, "", "\\@nshortmid");
defineSymbol(math$1, ams, rel, "∤", "\\nmid", true);
defineSymbol(math$1, ams, rel, "⊬", "\\nvdash", true);
defineSymbol(math$1, ams, rel, "⊭", "\\nvDash", true);
defineSymbol(math$1, ams, rel, "⋪", "\\ntriangleleft");
defineSymbol(math$1, ams, rel, "⋬", "\\ntrianglelefteq", true);
defineSymbol(math$1, ams, rel, "⊊", "\\subsetneq", true);
defineSymbol(math$1, ams, rel, "", "\\@varsubsetneq");
defineSymbol(math$1, ams, rel, "⫋", "\\subsetneqq", true);
defineSymbol(math$1, ams, rel, "", "\\@varsubsetneqq");
defineSymbol(math$1, ams, rel, "≯", "\\ngtr", true);
defineSymbol(math$1, ams, rel, "", "\\@ngeqslant");
defineSymbol(math$1, ams, rel, "", "\\@ngeqq");
defineSymbol(math$1, ams, rel, "⪈", "\\gneq", true);
defineSymbol(math$1, ams, rel, "≩", "\\gneqq", true);
defineSymbol(math$1, ams, rel, "", "\\@gvertneqq");
defineSymbol(math$1, ams, rel, "⋧", "\\gnsim", true);
defineSymbol(math$1, ams, rel, "⪊", "\\gnapprox", true);
defineSymbol(math$1, ams, rel, "⊁", "\\nsucc", true);
defineSymbol(math$1, ams, rel, "⋡", "\\nsucceq", true);
defineSymbol(math$1, ams, rel, "⋩", "\\succnsim", true);
defineSymbol(math$1, ams, rel, "⪺", "\\succnapprox", true);
defineSymbol(math$1, ams, rel, "≆", "\\ncong", true);
defineSymbol(math$1, ams, rel, "", "\\@nshortparallel");
defineSymbol(math$1, ams, rel, "∦", "\\nparallel", true);
defineSymbol(math$1, ams, rel, "⊯", "\\nVDash", true);
defineSymbol(math$1, ams, rel, "⋫", "\\ntriangleright");
defineSymbol(math$1, ams, rel, "⋭", "\\ntrianglerighteq", true);
defineSymbol(math$1, ams, rel, "", "\\@nsupseteqq");
defineSymbol(math$1, ams, rel, "⊋", "\\supsetneq", true);
defineSymbol(math$1, ams, rel, "", "\\@varsupsetneq");
defineSymbol(math$1, ams, rel, "⫌", "\\supsetneqq", true);
defineSymbol(math$1, ams, rel, "", "\\@varsupsetneqq");
defineSymbol(math$1, ams, rel, "⊮", "\\nVdash", true);
defineSymbol(math$1, ams, rel, "⪵", "\\precneqq", true);
defineSymbol(math$1, ams, rel, "⪶", "\\succneqq", true);
defineSymbol(math$1, ams, rel, "", "\\@nsubseteqq");
defineSymbol(math$1, ams, bin, "⊴", "\\unlhd");
defineSymbol(math$1, ams, bin, "⊵", "\\unrhd");
defineSymbol(math$1, ams, rel, "↚", "\\nleftarrow", true);
defineSymbol(math$1, ams, rel, "↛", "\\nrightarrow", true);
defineSymbol(math$1, ams, rel, "⇍", "\\nLeftarrow", true);
defineSymbol(math$1, ams, rel, "⇏", "\\nRightarrow", true);
defineSymbol(math$1, ams, rel, "↮", "\\nleftrightarrow", true);
defineSymbol(math$1, ams, rel, "⇎", "\\nLeftrightarrow", true);
defineSymbol(math$1, ams, rel, "△", "\\vartriangle");
defineSymbol(math$1, ams, textord, "ℏ", "\\hslash");
defineSymbol(math$1, ams, textord, "▽", "\\triangledown");
defineSymbol(math$1, ams, textord, "◊", "\\lozenge");
defineSymbol(math$1, ams, textord, "Ⓢ", "\\circledS");
defineSymbol(math$1, ams, textord, "®", "\\circledR");
defineSymbol(text, ams, textord, "®", "\\circledR");
defineSymbol(math$1, ams, textord, "∡", "\\measuredangle", true);
defineSymbol(math$1, ams, textord, "∄", "\\nexists");
defineSymbol(math$1, ams, textord, "℧", "\\mho");
defineSymbol(math$1, ams, textord, "Ⅎ", "\\Finv", true);
defineSymbol(math$1, ams, textord, "⅁", "\\Game", true);
defineSymbol(math$1, ams, textord, "‵", "\\backprime");
defineSymbol(math$1, ams, textord, "▲", "\\blacktriangle");
defineSymbol(math$1, ams, textord, "▼", "\\blacktriangledown");
defineSymbol(math$1, ams, textord, "■", "\\blacksquare");
defineSymbol(math$1, ams, textord, "⧫", "\\blacklozenge");
defineSymbol(math$1, ams, textord, "★", "\\bigstar");
defineSymbol(math$1, ams, textord, "∢", "\\sphericalangle", true);
defineSymbol(math$1, ams, textord, "∁", "\\complement", true);
defineSymbol(math$1, ams, textord, "ð", "\\eth", true);
defineSymbol(text, main, textord, "ð", "ð");
defineSymbol(math$1, ams, textord, "╱", "\\diagup");
defineSymbol(math$1, ams, textord, "╲", "\\diagdown");
defineSymbol(math$1, ams, textord, "□", "\\square");
defineSymbol(math$1, ams, textord, "□", "\\Box");
defineSymbol(math$1, ams, textord, "◊", "\\Diamond");
defineSymbol(math$1, ams, textord, "¥", "\\yen", true);
defineSymbol(text, ams, textord, "¥", "\\yen", true);
defineSymbol(math$1, ams, textord, "✓", "\\checkmark", true);
defineSymbol(text, ams, textord, "✓", "\\checkmark");
defineSymbol(math$1, ams, textord, "ℶ", "\\beth", true);
defineSymbol(math$1, ams, textord, "ℸ", "\\daleth", true);
defineSymbol(math$1, ams, textord, "ℷ", "\\gimel", true);
defineSymbol(math$1, ams, textord, "ϝ", "\\digamma", true);
defineSymbol(math$1, ams, textord, "ϰ", "\\varkappa");
defineSymbol(math$1, ams, open, "┌", "\\@ulcorner", true);
defineSymbol(math$1, ams, close, "┐", "\\@urcorner", true);
defineSymbol(math$1, ams, open, "└", "\\@llcorner", true);
defineSymbol(math$1, ams, close, "┘", "\\@lrcorner", true);
defineSymbol(math$1, ams, rel, "≦", "\\leqq", true);
defineSymbol(math$1, ams, rel, "⩽", "\\leqslant", true);
defineSymbol(math$1, ams, rel, "⪕", "\\eqslantless", true);
defineSymbol(math$1, ams, rel, "≲", "\\lesssim", true);
defineSymbol(math$1, ams, rel, "⪅", "\\lessapprox", true);
defineSymbol(math$1, ams, rel, "≊", "\\approxeq", true);
defineSymbol(math$1, ams, bin, "⋖", "\\lessdot");
defineSymbol(math$1, ams, rel, "⋘", "\\lll", true);
defineSymbol(math$1, ams, rel, "≶", "\\lessgtr", true);
defineSymbol(math$1, ams, rel, "⋚", "\\lesseqgtr", true);
defineSymbol(math$1, ams, rel, "⪋", "\\lesseqqgtr", true);
defineSymbol(math$1, ams, rel, "≑", "\\doteqdot");
defineSymbol(math$1, ams, rel, "≓", "\\risingdotseq", true);
defineSymbol(math$1, ams, rel, "≒", "\\fallingdotseq", true);
defineSymbol(math$1, ams, rel, "∽", "\\backsim", true);
defineSymbol(math$1, ams, rel, "⋍", "\\backsimeq", true);
defineSymbol(math$1, ams, rel, "⫅", "\\subseteqq", true);
defineSymbol(math$1, ams, rel, "⋐", "\\Subset", true);
defineSymbol(math$1, ams, rel, "⊏", "\\sqsubset", true);
defineSymbol(math$1, ams, rel, "≼", "\\preccurlyeq", true);
defineSymbol(math$1, ams, rel, "⋞", "\\curlyeqprec", true);
defineSymbol(math$1, ams, rel, "≾", "\\precsim", true);
defineSymbol(math$1, ams, rel, "⪷", "\\precapprox", true);
defineSymbol(math$1, ams, rel, "⊲", "\\vartriangleleft");
defineSymbol(math$1, ams, rel, "⊴", "\\trianglelefteq");
defineSymbol(math$1, ams, rel, "⊨", "\\vDash", true);
defineSymbol(math$1, ams, rel, "⊪", "\\Vvdash", true);
defineSymbol(math$1, ams, rel, "⌣", "\\smallsmile");
defineSymbol(math$1, ams, rel, "⌢", "\\smallfrown");
defineSymbol(math$1, ams, rel, "≏", "\\bumpeq", true);
defineSymbol(math$1, ams, rel, "≎", "\\Bumpeq", true);
defineSymbol(math$1, ams, rel, "≧", "\\geqq", true);
defineSymbol(math$1, ams, rel, "⩾", "\\geqslant", true);
defineSymbol(math$1, ams, rel, "⪖", "\\eqslantgtr", true);
defineSymbol(math$1, ams, rel, "≳", "\\gtrsim", true);
defineSymbol(math$1, ams, rel, "⪆", "\\gtrapprox", true);
defineSymbol(math$1, ams, bin, "⋗", "\\gtrdot");
defineSymbol(math$1, ams, rel, "⋙", "\\ggg", true);
defineSymbol(math$1, ams, rel, "≷", "\\gtrless", true);
defineSymbol(math$1, ams, rel, "⋛", "\\gtreqless", true);
defineSymbol(math$1, ams, rel, "⪌", "\\gtreqqless", true);
defineSymbol(math$1, ams, rel, "≖", "\\eqcirc", true);
defineSymbol(math$1, ams, rel, "≗", "\\circeq", true);
defineSymbol(math$1, ams, rel, "≜", "\\triangleq", true);
defineSymbol(math$1, ams, rel, "∼", "\\thicksim");
defineSymbol(math$1, ams, rel, "≈", "\\thickapprox");
defineSymbol(math$1, ams, rel, "⫆", "\\supseteqq", true);
defineSymbol(math$1, ams, rel, "⋑", "\\Supset", true);
defineSymbol(math$1, ams, rel, "⊐", "\\sqsupset", true);
defineSymbol(math$1, ams, rel, "≽", "\\succcurlyeq", true);
defineSymbol(math$1, ams, rel, "⋟", "\\curlyeqsucc", true);
defineSymbol(math$1, ams, rel, "≿", "\\succsim", true);
defineSymbol(math$1, ams, rel, "⪸", "\\succapprox", true);
defineSymbol(math$1, ams, rel, "⊳", "\\vartriangleright");
defineSymbol(math$1, ams, rel, "⊵", "\\trianglerighteq");
defineSymbol(math$1, ams, rel, "⊩", "\\Vdash", true);
defineSymbol(math$1, ams, rel, "∣", "\\shortmid");
defineSymbol(math$1, ams, rel, "∥", "\\shortparallel");
defineSymbol(math$1, ams, rel, "≬", "\\between", true);
defineSymbol(math$1, ams, rel, "⋔", "\\pitchfork", true);
defineSymbol(math$1, ams, rel, "∝", "\\varpropto");
defineSymbol(math$1, ams, rel, "◀", "\\blacktriangleleft");
defineSymbol(math$1, ams, rel, "∴", "\\therefore", true);
defineSymbol(math$1, ams, rel, "∍", "\\backepsilon");
defineSymbol(math$1, ams, rel, "▶", "\\blacktriangleright");
defineSymbol(math$1, ams, rel, "∵", "\\because", true);
defineSymbol(math$1, ams, rel, "⋘", "\\llless");
defineSymbol(math$1, ams, rel, "⋙", "\\gggtr");
defineSymbol(math$1, ams, bin, "⊲", "\\lhd");
defineSymbol(math$1, ams, bin, "⊳", "\\rhd");
defineSymbol(math$1, ams, rel, "≂", "\\eqsim", true);
defineSymbol(math$1, main, rel, "⋈", "\\Join");
defineSymbol(math$1, ams, rel, "≑", "\\Doteq", true);
defineSymbol(math$1, ams, bin, "∔", "\\dotplus", true);
defineSymbol(math$1, ams, bin, "∖", "\\smallsetminus");
defineSymbol(math$1, ams, bin, "⋒", "\\Cap", true);
defineSymbol(math$1, ams, bin, "⋓", "\\Cup", true);
defineSymbol(math$1, ams, bin, "⩞", "\\doublebarwedge", true);
defineSymbol(math$1, ams, bin, "⊟", "\\boxminus", true);
defineSymbol(math$1, ams, bin, "⊞", "\\boxplus", true);
defineSymbol(math$1, ams, bin, "⋇", "\\divideontimes", true);
defineSymbol(math$1, ams, bin, "⋉", "\\ltimes", true);
defineSymbol(math$1, ams, bin, "⋊", "\\rtimes", true);
defineSymbol(math$1, ams, bin, "⋋", "\\leftthreetimes", true);
defineSymbol(math$1, ams, bin, "⋌", "\\rightthreetimes", true);
defineSymbol(math$1, ams, bin, "⋏", "\\curlywedge", true);
defineSymbol(math$1, ams, bin, "⋎", "\\curlyvee", true);
defineSymbol(math$1, ams, bin, "⊝", "\\circleddash", true);
defineSymbol(math$1, ams, bin, "⊛", "\\circledast", true);
defineSymbol(math$1, ams, bin, "⋅", "\\centerdot");
defineSymbol(math$1, ams, bin, "⊺", "\\intercal", true);
defineSymbol(math$1, ams, bin, "⋒", "\\doublecap");
defineSymbol(math$1, ams, bin, "⋓", "\\doublecup");
defineSymbol(math$1, ams, bin, "⊠", "\\boxtimes", true);
defineSymbol(math$1, ams, rel, "⇢", "\\dashrightarrow", true);
defineSymbol(math$1, ams, rel, "⇠", "\\dashleftarrow", true);
defineSymbol(math$1, ams, rel, "⇇", "\\leftleftarrows", true);
defineSymbol(math$1, ams, rel, "⇆", "\\leftrightarrows", true);
defineSymbol(math$1, ams, rel, "⇚", "\\Lleftarrow", true);
defineSymbol(math$1, ams, rel, "↞", "\\twoheadleftarrow", true);
defineSymbol(math$1, ams, rel, "↢", "\\leftarrowtail", true);
defineSymbol(math$1, ams, rel, "↫", "\\looparrowleft", true);
defineSymbol(math$1, ams, rel, "⇋", "\\leftrightharpoons", true);
defineSymbol(math$1, ams, rel, "↶", "\\curvearrowleft", true);
defineSymbol(math$1, ams, rel, "↺", "\\circlearrowleft", true);
defineSymbol(math$1, ams, rel, "↰", "\\Lsh", true);
defineSymbol(math$1, ams, rel, "⇈", "\\upuparrows", true);
defineSymbol(math$1, ams, rel, "↿", "\\upharpoonleft", true);
defineSymbol(math$1, ams, rel, "⇃", "\\downharpoonleft", true);
defineSymbol(math$1, main, rel, "⊶", "\\origof", true);
defineSymbol(math$1, main, rel, "⊷", "\\imageof", true);
defineSymbol(math$1, ams, rel, "⊸", "\\multimap", true);
defineSymbol(math$1, ams, rel, "↭", "\\leftrightsquigarrow", true);
defineSymbol(math$1, ams, rel, "⇉", "\\rightrightarrows", true);
defineSymbol(math$1, ams, rel, "⇄", "\\rightleftarrows", true);
defineSymbol(math$1, ams, rel, "↠", "\\twoheadrightarrow", true);
defineSymbol(math$1, ams, rel, "↣", "\\rightarrowtail", true);
defineSymbol(math$1, ams, rel, "↬", "\\looparrowright", true);
defineSymbol(math$1, ams, rel, "↷", "\\curvearrowright", true);
defineSymbol(math$1, ams, rel, "↻", "\\circlearrowright", true);
defineSymbol(math$1, ams, rel, "↱", "\\Rsh", true);
defineSymbol(math$1, ams, rel, "⇊", "\\downdownarrows", true);
defineSymbol(math$1, ams, rel, "↾", "\\upharpoonright", true);
defineSymbol(math$1, ams, rel, "⇂", "\\downharpoonright", true);
defineSymbol(math$1, ams, rel, "⇝", "\\rightsquigarrow", true);
defineSymbol(math$1, ams, rel, "⇝", "\\leadsto");
defineSymbol(math$1, ams, rel, "⇛", "\\Rrightarrow", true);
defineSymbol(math$1, ams, rel, "↾", "\\restriction");
defineSymbol(math$1, main, textord, "‘", "`");
defineSymbol(math$1, main, textord, "$", "\\$");
defineSymbol(text, main, textord, "$", "\\$");
defineSymbol(text, main, textord, "$", "\\textdollar");
defineSymbol(math$1, main, textord, "%", "\\%");
defineSymbol(text, main, textord, "%", "\\%");
defineSymbol(math$1, main, textord, "_", "\\_");
defineSymbol(text, main, textord, "_", "\\_");
defineSymbol(text, main, textord, "_", "\\textunderscore");
defineSymbol(math$1, main, textord, "∠", "\\angle", true);
defineSymbol(math$1, main, textord, "∞", "\\infty", true);
defineSymbol(math$1, main, textord, "′", "\\prime");
defineSymbol(math$1, main, textord, "△", "\\triangle");
defineSymbol(math$1, main, textord, "Γ", "\\Gamma", true);
defineSymbol(math$1, main, textord, "Δ", "\\Delta", true);
defineSymbol(math$1, main, textord, "Θ", "\\Theta", true);
defineSymbol(math$1, main, textord, "Λ", "\\Lambda", true);
defineSymbol(math$1, main, textord, "Ξ", "\\Xi", true);
defineSymbol(math$1, main, textord, "Π", "\\Pi", true);
defineSymbol(math$1, main, textord, "Σ", "\\Sigma", true);
defineSymbol(math$1, main, textord, "Υ", "\\Upsilon", true);
defineSymbol(math$1, main, textord, "Φ", "\\Phi", true);
defineSymbol(math$1, main, textord, "Ψ", "\\Psi", true);
defineSymbol(math$1, main, textord, "Ω", "\\Omega", true);
defineSymbol(math$1, main, textord, "A", "Α");
defineSymbol(math$1, main, textord, "B", "Β");
defineSymbol(math$1, main, textord, "E", "Ε");
defineSymbol(math$1, main, textord, "Z", "Ζ");
defineSymbol(math$1, main, textord, "H", "Η");
defineSymbol(math$1, main, textord, "I", "Ι");
defineSymbol(math$1, main, textord, "K", "Κ");
defineSymbol(math$1, main, textord, "M", "Μ");
defineSymbol(math$1, main, textord, "N", "Ν");
defineSymbol(math$1, main, textord, "O", "Ο");
defineSymbol(math$1, main, textord, "P", "Ρ");
defineSymbol(math$1, main, textord, "T", "Τ");
defineSymbol(math$1, main, textord, "X", "Χ");
defineSymbol(math$1, main, textord, "¬", "\\neg", true);
defineSymbol(math$1, main, textord, "¬", "\\lnot");
defineSymbol(math$1, main, textord, "⊤", "\\top");
defineSymbol(math$1, main, textord, "⊥", "\\bot");
defineSymbol(math$1, main, textord, "∅", "\\emptyset");
defineSymbol(math$1, ams, textord, "∅", "\\varnothing");
defineSymbol(math$1, main, mathord, "α", "\\alpha", true);
defineSymbol(math$1, main, mathord, "β", "\\beta", true);
defineSymbol(math$1, main, mathord, "γ", "\\gamma", true);
defineSymbol(math$1, main, mathord, "δ", "\\delta", true);
defineSymbol(math$1, main, mathord, "ϵ", "\\epsilon", true);
defineSymbol(math$1, main, mathord, "ζ", "\\zeta", true);
defineSymbol(math$1, main, mathord, "η", "\\eta", true);
defineSymbol(math$1, main, mathord, "θ", "\\theta", true);
defineSymbol(math$1, main, mathord, "ι", "\\iota", true);
defineSymbol(math$1, main, mathord, "κ", "\\kappa", true);
defineSymbol(math$1, main, mathord, "λ", "\\lambda", true);
defineSymbol(math$1, main, mathord, "μ", "\\mu", true);
defineSymbol(math$1, main, mathord, "ν", "\\nu", true);
defineSymbol(math$1, main, mathord, "ξ", "\\xi", true);
defineSymbol(math$1, main, mathord, "ο", "\\omicron", true);
defineSymbol(math$1, main, mathord, "π", "\\pi", true);
defineSymbol(math$1, main, mathord, "ρ", "\\rho", true);
defineSymbol(math$1, main, mathord, "σ", "\\sigma", true);
defineSymbol(math$1, main, mathord, "τ", "\\tau", true);
defineSymbol(math$1, main, mathord, "υ", "\\upsilon", true);
defineSymbol(math$1, main, mathord, "ϕ", "\\phi", true);
defineSymbol(math$1, main, mathord, "χ", "\\chi", true);
defineSymbol(math$1, main, mathord, "ψ", "\\psi", true);
defineSymbol(math$1, main, mathord, "ω", "\\omega", true);
defineSymbol(math$1, main, mathord, "ε", "\\varepsilon", true);
defineSymbol(math$1, main, mathord, "ϑ", "\\vartheta", true);
defineSymbol(math$1, main, mathord, "ϖ", "\\varpi", true);
defineSymbol(math$1, main, mathord, "ϱ", "\\varrho", true);
defineSymbol(math$1, main, mathord, "ς", "\\varsigma", true);
defineSymbol(math$1, main, mathord, "φ", "\\varphi", true);
defineSymbol(math$1, main, bin, "∗", "*", true);
defineSymbol(math$1, main, bin, "+", "+");
defineSymbol(math$1, main, bin, "−", "-", true);
defineSymbol(math$1, main, bin, "⋅", "\\cdot", true);
defineSymbol(math$1, main, bin, "∘", "\\circ", true);
defineSymbol(math$1, main, bin, "÷", "\\div", true);
defineSymbol(math$1, main, bin, "±", "\\pm", true);
defineSymbol(math$1, main, bin, "×", "\\times", true);
defineSymbol(math$1, main, bin, "∩", "\\cap", true);
defineSymbol(math$1, main, bin, "∪", "\\cup", true);
defineSymbol(math$1, main, bin, "∖", "\\setminus", true);
defineSymbol(math$1, main, bin, "∧", "\\land");
defineSymbol(math$1, main, bin, "∨", "\\lor");
defineSymbol(math$1, main, bin, "∧", "\\wedge", true);
defineSymbol(math$1, main, bin, "∨", "\\vee", true);
defineSymbol(math$1, main, textord, "√", "\\surd");
defineSymbol(math$1, main, open, "⟨", "\\langle", true);
defineSymbol(math$1, main, open, "∣", "\\lvert");
defineSymbol(math$1, main, open, "∥", "\\lVert");
defineSymbol(math$1, main, close, "?", "?");
defineSymbol(math$1, main, close, "!", "!");
defineSymbol(math$1, main, close, "⟩", "\\rangle", true);
defineSymbol(math$1, main, close, "∣", "\\rvert");
defineSymbol(math$1, main, close, "∥", "\\rVert");
defineSymbol(math$1, main, rel, "=", "=");
defineSymbol(math$1, main, rel, ":", ":");
defineSymbol(math$1, main, rel, "≈", "\\approx", true);
defineSymbol(math$1, main, rel, "≅", "\\cong", true);
defineSymbol(math$1, main, rel, "≥", "\\ge");
defineSymbol(math$1, main, rel, "≥", "\\geq", true);
defineSymbol(math$1, main, rel, "←", "\\gets");
defineSymbol(math$1, main, rel, ">", "\\gt", true);
defineSymbol(math$1, main, rel, "∈", "\\in", true);
defineSymbol(math$1, main, rel, "", "\\@not");
defineSymbol(math$1, main, rel, "⊂", "\\subset", true);
defineSymbol(math$1, main, rel, "⊃", "\\supset", true);
defineSymbol(math$1, main, rel, "⊆", "\\subseteq", true);
defineSymbol(math$1, main, rel, "⊇", "\\supseteq", true);
defineSymbol(math$1, ams, rel, "⊈", "\\nsubseteq", true);
defineSymbol(math$1, ams, rel, "⊉", "\\nsupseteq", true);
defineSymbol(math$1, main, rel, "⊨", "\\models");
defineSymbol(math$1, main, rel, "←", "\\leftarrow", true);
defineSymbol(math$1, main, rel, "≤", "\\le");
defineSymbol(math$1, main, rel, "≤", "\\leq", true);
defineSymbol(math$1, main, rel, "<", "\\lt", true);
defineSymbol(math$1, main, rel, "→", "\\rightarrow", true);
defineSymbol(math$1, main, rel, "→", "\\to");
defineSymbol(math$1, ams, rel, "≱", "\\ngeq", true);
defineSymbol(math$1, ams, rel, "≰", "\\nleq", true);
defineSymbol(math$1, main, spacing, "\xA0", "\\ ");
defineSymbol(math$1, main, spacing, "\xA0", "\\space");
defineSymbol(math$1, main, spacing, "\xA0", "\\nobreakspace");
defineSymbol(text, main, spacing, "\xA0", "\\ ");
defineSymbol(text, main, spacing, "\xA0", " ");
defineSymbol(text, main, spacing, "\xA0", "\\space");
defineSymbol(text, main, spacing, "\xA0", "\\nobreakspace");
defineSymbol(math$1, main, spacing, "", "\\nobreak");
defineSymbol(math$1, main, spacing, "", "\\allowbreak");
defineSymbol(math$1, main, punct, ",", ",");
defineSymbol(math$1, main, punct, ";", ";");
defineSymbol(math$1, ams, bin, "⊼", "\\barwedge", true);
defineSymbol(math$1, ams, bin, "⊻", "\\veebar", true);
defineSymbol(math$1, main, bin, "⊙", "\\odot", true);
defineSymbol(math$1, main, bin, "⊕", "\\oplus", true);
defineSymbol(math$1, main, bin, "⊗", "\\otimes", true);
defineSymbol(math$1, main, textord, "∂", "\\partial", true);
defineSymbol(math$1, main, bin, "⊘", "\\oslash", true);
defineSymbol(math$1, ams, bin, "⊚", "\\circledcirc", true);
defineSymbol(math$1, ams, bin, "⊡", "\\boxdot", true);
defineSymbol(math$1, main, bin, "△", "\\bigtriangleup");
defineSymbol(math$1, main, bin, "▽", "\\bigtriangledown");
defineSymbol(math$1, main, bin, "†", "\\dagger");
defineSymbol(math$1, main, bin, "⋄", "\\diamond");
defineSymbol(math$1, main, bin, "⋆", "\\star");
defineSymbol(math$1, main, bin, "◃", "\\triangleleft");
defineSymbol(math$1, main, bin, "▹", "\\triangleright");
defineSymbol(math$1, main, open, "{", "\\{");
defineSymbol(text, main, textord, "{", "\\{");
defineSymbol(text, main, textord, "{", "\\textbraceleft");
defineSymbol(math$1, main, close, "}", "\\}");
defineSymbol(text, main, textord, "}", "\\}");
defineSymbol(text, main, textord, "}", "\\textbraceright");
defineSymbol(math$1, main, open, "{", "\\lbrace");
defineSymbol(math$1, main, close, "}", "\\rbrace");
defineSymbol(math$1, main, open, "[", "\\lbrack", true);
defineSymbol(text, main, textord, "[", "\\lbrack", true);
defineSymbol(math$1, main, close, "]", "\\rbrack", true);
defineSymbol(text, main, textord, "]", "\\rbrack", true);
defineSymbol(math$1, main, open, "(", "\\lparen", true);
defineSymbol(math$1, main, close, ")", "\\rparen", true);
defineSymbol(text, main, textord, "<", "\\textless", true);
defineSymbol(text, main, textord, ">", "\\textgreater", true);
defineSymbol(math$1, main, open, "⌊", "\\lfloor", true);
defineSymbol(math$1, main, close, "⌋", "\\rfloor", true);
defineSymbol(math$1, main, open, "⌈", "\\lceil", true);
defineSymbol(math$1, main, close, "⌉", "\\rceil", true);
defineSymbol(math$1, main, textord, "\\", "\\backslash");
defineSymbol(math$1, main, textord, "∣", "|");
defineSymbol(math$1, main, textord, "∣", "\\vert");
defineSymbol(text, main, textord, "|", "\\textbar", true);
defineSymbol(math$1, main, textord, "∥", "\\|");
defineSymbol(math$1, main, textord, "∥", "\\Vert");
defineSymbol(text, main, textord, "∥", "\\textbardbl");
defineSymbol(text, main, textord, "~", "\\textasciitilde");
defineSymbol(text, main, textord, "\\", "\\textbackslash");
defineSymbol(text, main, textord, "^", "\\textasciicircum");
defineSymbol(math$1, main, rel, "↑", "\\uparrow", true);
defineSymbol(math$1, main, rel, "⇑", "\\Uparrow", true);
defineSymbol(math$1, main, rel, "↓", "\\downarrow", true);
defineSymbol(math$1, main, rel, "⇓", "\\Downarrow", true);
defineSymbol(math$1, main, rel, "↕", "\\updownarrow", true);
defineSymbol(math$1, main, rel, "⇕", "\\Updownarrow", true);
defineSymbol(math$1, main, op, "∐", "\\coprod");
defineSymbol(math$1, main, op, "⋁", "\\bigvee");
defineSymbol(math$1, main, op, "⋀", "\\bigwedge");
defineSymbol(math$1, main, op, "⨄", "\\biguplus");
defineSymbol(math$1, main, op, "⋂", "\\bigcap");
defineSymbol(math$1, main, op, "⋃", "\\bigcup");
defineSymbol(math$1, main, op, "∫", "\\int");
defineSymbol(math$1, main, op, "∫", "\\intop");
defineSymbol(math$1, main, op, "∬", "\\iint");
defineSymbol(math$1, main, op, "∭", "\\iiint");
defineSymbol(math$1, main, op, "∏", "\\prod");
defineSymbol(math$1, main, op, "∑", "\\sum");
defineSymbol(math$1, main, op, "⨂", "\\bigotimes");
defineSymbol(math$1, main, op, "⨁", "\\bigoplus");
defineSymbol(math$1, main, op, "⨀", "\\bigodot");
defineSymbol(math$1, main, op, "∮", "\\oint");
defineSymbol(math$1, main, op, "∯", "\\oiint");
defineSymbol(math$1, main, op, "∰", "\\oiiint");
defineSymbol(math$1, main, op, "⨆", "\\bigsqcup");
defineSymbol(math$1, main, op, "∫", "\\smallint");
defineSymbol(text, main, inner, "…", "\\textellipsis");
defineSymbol(math$1, main, inner, "…", "\\mathellipsis");
defineSymbol(text, main, inner, "…", "\\ldots", true);
defineSymbol(math$1, main, inner, "…", "\\ldots", true);
defineSymbol(math$1, main, inner, "⋯", "\\@cdots", true);
defineSymbol(math$1, main, inner, "⋱", "\\ddots", true);
defineSymbol(math$1, main, textord, "⋮", "\\varvdots");
defineSymbol(text, main, textord, "⋮", "\\varvdots");
defineSymbol(math$1, main, accent, "ˊ", "\\acute");
defineSymbol(math$1, main, accent, "ˋ", "\\grave");
defineSymbol(math$1, main, accent, "¨", "\\ddot");
defineSymbol(math$1, main, accent, "~", "\\tilde");
defineSymbol(math$1, main, accent, "ˉ", "\\bar");
defineSymbol(math$1, main, accent, "˘", "\\breve");
defineSymbol(math$1, main, accent, "ˇ", "\\check");
defineSymbol(math$1, main, accent, "^", "\\hat");
defineSymbol(math$1, main, accent, "⃗", "\\vec");
defineSymbol(math$1, main, accent, "˙", "\\dot");
defineSymbol(math$1, main, accent, "˚", "\\mathring");
defineSymbol(math$1, main, mathord, "", "\\@imath");
defineSymbol(math$1, main, mathord, "", "\\@jmath");
defineSymbol(math$1, main, textord, "ı", "ı");
defineSymbol(math$1, main, textord, "ȷ", "ȷ");
defineSymbol(text, main, textord, "ı", "\\i", true);
defineSymbol(text, main, textord, "ȷ", "\\j", true);
defineSymbol(text, main, textord, "ß", "\\ss", true);
defineSymbol(text, main, textord, "æ", "\\ae", true);
defineSymbol(text, main, textord, "œ", "\\oe", true);
defineSymbol(text, main, textord, "ø", "\\o", true);
defineSymbol(text, main, textord, "Æ", "\\AE", true);
defineSymbol(text, main, textord, "Œ", "\\OE", true);
defineSymbol(text, main, textord, "Ø", "\\O", true);
defineSymbol(text, main, accent, "ˊ", "\\'");
defineSymbol(text, main, accent, "ˋ", "\\`");
defineSymbol(text, main, accent, "ˆ", "\\^");
defineSymbol(text, main, accent, "˜", "\\~");
defineSymbol(text, main, accent, "ˉ", "\\=");
defineSymbol(text, main, accent, "˘", "\\u");
defineSymbol(text, main, accent, "˙", "\\.");
defineSymbol(text, main, accent, "¸", "\\c");
defineSymbol(text, main, accent, "˚", "\\r");
defineSymbol(text, main, accent, "ˇ", "\\v");
defineSymbol(text, main, accent, "¨", "\\\"");
defineSymbol(text, main, accent, "˝", "\\H");
defineSymbol(text, main, accent, "◯", "\\textcircled");
var ligatures = {
	"--": true,
	"---": true,
	"``": true,
	"''": true
};
defineSymbol(text, main, textord, "–", "--", true);
defineSymbol(text, main, textord, "–", "\\textendash");
defineSymbol(text, main, textord, "—", "---", true);
defineSymbol(text, main, textord, "—", "\\textemdash");
defineSymbol(text, main, textord, "‘", "`", true);
defineSymbol(text, main, textord, "‘", "\\textquoteleft");
defineSymbol(text, main, textord, "’", "'", true);
defineSymbol(text, main, textord, "’", "\\textquoteright");
defineSymbol(text, main, textord, "“", "``", true);
defineSymbol(text, main, textord, "“", "\\textquotedblleft");
defineSymbol(text, main, textord, "”", "''", true);
defineSymbol(text, main, textord, "”", "\\textquotedblright");
defineSymbol(math$1, main, textord, "°", "\\degree", true);
defineSymbol(text, main, textord, "°", "\\degree");
defineSymbol(text, main, textord, "°", "\\textdegree", true);
defineSymbol(math$1, main, textord, "£", "\\pounds");
defineSymbol(math$1, main, textord, "£", "\\mathsterling", true);
defineSymbol(text, main, textord, "£", "\\pounds");
defineSymbol(text, main, textord, "£", "\\textsterling", true);
defineSymbol(math$1, ams, textord, "✠", "\\maltese");
defineSymbol(text, ams, textord, "✠", "\\maltese");
var mathTextSymbols = "0123456789/@.\"";
for (var i = 0; i < mathTextSymbols.length; i++) {
	var ch = mathTextSymbols.charAt(i);
	defineSymbol(math$1, main, textord, ch, ch);
}
var textSymbols = "0123456789!@*()-=+\";:?/.,";
for (var _i = 0; _i < textSymbols.length; _i++) {
	var _ch = textSymbols.charAt(_i);
	defineSymbol(text, main, textord, _ch, _ch);
}
var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
for (var _i2 = 0; _i2 < letters.length; _i2++) {
	var _ch2 = letters.charAt(_i2);
	defineSymbol(math$1, main, mathord, _ch2, _ch2);
	defineSymbol(text, main, textord, _ch2, _ch2);
}
defineSymbol(math$1, ams, textord, "C", "ℂ");
defineSymbol(text, ams, textord, "C", "ℂ");
defineSymbol(math$1, ams, textord, "H", "ℍ");
defineSymbol(text, ams, textord, "H", "ℍ");
defineSymbol(math$1, ams, textord, "N", "ℕ");
defineSymbol(text, ams, textord, "N", "ℕ");
defineSymbol(math$1, ams, textord, "P", "ℙ");
defineSymbol(text, ams, textord, "P", "ℙ");
defineSymbol(math$1, ams, textord, "Q", "ℚ");
defineSymbol(text, ams, textord, "Q", "ℚ");
defineSymbol(math$1, ams, textord, "R", "ℝ");
defineSymbol(text, ams, textord, "R", "ℝ");
defineSymbol(math$1, ams, textord, "Z", "ℤ");
defineSymbol(text, ams, textord, "Z", "ℤ");
defineSymbol(math$1, main, mathord, "h", "ℎ");
defineSymbol(text, main, mathord, "h", "ℎ");
var wideChar;
for (var _i3 = 0; _i3 < letters.length; _i3++) {
	var _ch3 = letters.charAt(_i3);
	wideChar = String.fromCharCode(55349, 56320 + _i3);
	defineSymbol(math$1, main, mathord, _ch3, wideChar);
	defineSymbol(text, main, textord, _ch3, wideChar);
	wideChar = String.fromCharCode(55349, 56372 + _i3);
	defineSymbol(math$1, main, mathord, _ch3, wideChar);
	defineSymbol(text, main, textord, _ch3, wideChar);
	wideChar = String.fromCharCode(55349, 56424 + _i3);
	defineSymbol(math$1, main, mathord, _ch3, wideChar);
	defineSymbol(text, main, textord, _ch3, wideChar);
	wideChar = String.fromCharCode(55349, 56580 + _i3);
	defineSymbol(math$1, main, mathord, _ch3, wideChar);
	defineSymbol(text, main, textord, _ch3, wideChar);
	wideChar = String.fromCharCode(55349, 56684 + _i3);
	defineSymbol(math$1, main, mathord, _ch3, wideChar);
	defineSymbol(text, main, textord, _ch3, wideChar);
	wideChar = String.fromCharCode(55349, 56736 + _i3);
	defineSymbol(math$1, main, mathord, _ch3, wideChar);
	defineSymbol(text, main, textord, _ch3, wideChar);
	wideChar = String.fromCharCode(55349, 56788 + _i3);
	defineSymbol(math$1, main, mathord, _ch3, wideChar);
	defineSymbol(text, main, textord, _ch3, wideChar);
	wideChar = String.fromCharCode(55349, 56840 + _i3);
	defineSymbol(math$1, main, mathord, _ch3, wideChar);
	defineSymbol(text, main, textord, _ch3, wideChar);
	wideChar = String.fromCharCode(55349, 56944 + _i3);
	defineSymbol(math$1, main, mathord, _ch3, wideChar);
	defineSymbol(text, main, textord, _ch3, wideChar);
	if (_i3 < 26) {
		wideChar = String.fromCharCode(55349, 56632 + _i3);
		defineSymbol(math$1, main, mathord, _ch3, wideChar);
		defineSymbol(text, main, textord, _ch3, wideChar);
		wideChar = String.fromCharCode(55349, 56476 + _i3);
		defineSymbol(math$1, main, mathord, _ch3, wideChar);
		defineSymbol(text, main, textord, _ch3, wideChar);
	}
}
wideChar = String.fromCharCode(55349, 56668);
defineSymbol(math$1, main, mathord, "k", wideChar);
defineSymbol(text, main, textord, "k", wideChar);
for (var _i4 = 0; _i4 < 10; _i4++) {
	var _ch4 = _i4.toString();
	wideChar = String.fromCharCode(55349, 57294 + _i4);
	defineSymbol(math$1, main, mathord, _ch4, wideChar);
	defineSymbol(text, main, textord, _ch4, wideChar);
	wideChar = String.fromCharCode(55349, 57314 + _i4);
	defineSymbol(math$1, main, mathord, _ch4, wideChar);
	defineSymbol(text, main, textord, _ch4, wideChar);
	wideChar = String.fromCharCode(55349, 57324 + _i4);
	defineSymbol(math$1, main, mathord, _ch4, wideChar);
	defineSymbol(text, main, textord, _ch4, wideChar);
	wideChar = String.fromCharCode(55349, 57334 + _i4);
	defineSymbol(math$1, main, mathord, _ch4, wideChar);
	defineSymbol(text, main, textord, _ch4, wideChar);
}
var extraLatin = "ÐÞþ";
for (var _i5 = 0; _i5 < extraLatin.length; _i5++) {
	var _ch5 = extraLatin.charAt(_i5);
	defineSymbol(math$1, main, mathord, _ch5, _ch5);
	defineSymbol(text, main, textord, _ch5, _ch5);
}
/**
* This file provides support for Unicode range U+1D400 to U+1D7FF,
* Mathematical Alphanumeric Symbols.
*
* Function wideCharacterFont takes a wide character as input and returns
* the font information necessary to render it properly.
*/
var boldUpright = {
	mathClass: "mathbf",
	textClass: "textbf",
	font: "Main-Bold"
};
var italic = {
	mathClass: "mathnormal",
	textClass: "textit",
	font: "Math-Italic"
};
var boldItalic = {
	mathClass: "boldsymbol",
	textClass: "boldsymbol",
	font: "Main-BoldItalic"
};
var script = {
	mathClass: "mathscr",
	textClass: "textscr",
	font: "Script-Regular"
};
var noFont = {
	mathClass: "",
	textClass: "",
	font: ""
};
var fraktur = {
	mathClass: "mathfrak",
	textClass: "textfrak",
	font: "Fraktur-Regular"
};
var doubleStruck = {
	mathClass: "mathbb",
	textClass: "textbb",
	font: "AMS-Regular"
};
var boldFraktur = {
	mathClass: "mathboldfrak",
	textClass: "textboldfrak",
	font: "Fraktur-Regular"
};
var sansSerif = {
	mathClass: "mathsf",
	textClass: "textsf",
	font: "SansSerif-Regular"
};
var boldSansSerif = {
	mathClass: "mathboldsf",
	textClass: "textboldsf",
	font: "SansSerif-Bold"
};
var italicSansSerif = {
	mathClass: "mathitsf",
	textClass: "textitsf",
	font: "SansSerif-Italic"
};
var monospace = {
	mathClass: "mathtt",
	textClass: "texttt",
	font: "Typewriter-Regular"
};
/**
* Data below is from https://www.unicode.org/charts/PDF/U1D400.pdf
* That document sorts characters into groups by font type, say bold or italic.
*
* In the arrays below, each object consists of three properties:
*      * The CSS class of that group when in math mode.
*      * The CSS class of that group when in text mode.
*      * The font name, so that KaTeX can get font metrics.
*/
var wideLatinLetterData = [
	boldUpright,
	boldUpright,
	italic,
	italic,
	boldItalic,
	boldItalic,
	script,
	noFont,
	noFont,
	noFont,
	fraktur,
	fraktur,
	doubleStruck,
	doubleStruck,
	boldFraktur,
	boldFraktur,
	sansSerif,
	sansSerif,
	boldSansSerif,
	boldSansSerif,
	italicSansSerif,
	italicSansSerif,
	noFont,
	noFont,
	monospace,
	monospace
];
var wideNumeralData = [
	boldUpright,
	noFont,
	sansSerif,
	boldSansSerif,
	monospace
];
var wideCharacterFont = (wideChar) => {
	var H = wideChar.charCodeAt(0);
	var L = wideChar.charCodeAt(1);
	var codePoint = (H - 55296) * 1024 + (L - 56320) + 65536;
	if (119808 <= codePoint && codePoint < 120484) return wideLatinLetterData[Math.floor((codePoint - 119808) / 26)];
	else if (120782 <= codePoint && codePoint <= 120831) return wideNumeralData[Math.floor((codePoint - 120782) / 10)];
	else if (codePoint === 120485 || codePoint === 120486) return wideLatinLetterData[0];
	else if (120486 < codePoint && codePoint < 120782) return noFont;
	else throw new ParseError("Unsupported character: " + wideChar);
};
/**
* Looks up the given symbol in fontMetrics, after applying any symbol
* replacements defined in symbol.js
*/
var lookupSymbol = function lookupSymbol(value, fontName, mode) {
	if (symbols[mode][value]) {
		var replacement = symbols[mode][value].replace;
		if (replacement) value = replacement;
	}
	return {
		value,
		metrics: getCharacterMetrics(value, fontName, mode)
	};
};
/**
* Makes a symbolNode after translation via the list of symbols in symbols.js.
* Correctly pulls out metrics for the character, and optionally takes a list of
* classes to be attached to the node.
*
* TODO: make argument order closer to makeSpan
* TODO: add a separate argument for math class (e.g. `mop`, `mbin`), which
* should if present come first in `classes`.
* TODO(#953): Make `options` mandatory and always pass it in.
*/
var makeSymbol = function makeSymbol(value, fontName, mode, options, classes) {
	var lookup = lookupSymbol(value, fontName, mode);
	var metrics = lookup.metrics;
	value = lookup.value;
	var symbolNode;
	if (metrics) {
		var italic = metrics.italic;
		if (mode === "text" || options && options.font === "mathit") italic = 0;
		symbolNode = new SymbolNode(value, metrics.height, metrics.depth, italic, metrics.skew, metrics.width, classes);
	} else {
		typeof console !== "undefined" && console.warn("No character metrics " + ("for '" + value + "' in style '" + fontName + "' and mode '" + mode + "'"));
		symbolNode = new SymbolNode(value, 0, 0, 0, 0, 0, classes);
	}
	if (options) {
		symbolNode.maxFontSize = options.sizeMultiplier;
		if (options.style.isTight()) symbolNode.classes.push("mtight");
		var color = options.getColor();
		if (color) symbolNode.style.color = color;
	}
	return symbolNode;
};
/**
* Makes a symbol in Main-Regular or AMS-Regular.
* Used for rel, bin, open, close, inner, and punct.
*/
var mathsym = function mathsym(value, mode, options, classes) {
	if (classes === void 0) classes = [];
	if (options.font === "boldsymbol" && lookupSymbol(value, "Main-Bold", mode).metrics) return makeSymbol(value, "Main-Bold", mode, options, classes.concat(["mathbf"]));
	else if (value === "\\" || symbols[mode][value].font === "main") return makeSymbol(value, "Main-Regular", mode, options, classes);
	else return makeSymbol(value, "AMS-Regular", mode, options, classes.concat(["amsrm"]));
};
/**
* Determines which of the two font names (Main-Bold and Math-BoldItalic) and
* corresponding style tags (mathbf or boldsymbol) to use for font "boldsymbol",
* depending on the symbol.  Use this function instead of fontMap for font
* "boldsymbol".
*/
var boldSymbol = function boldSymbol(value, mode, type) {
	if (type !== "textord" && lookupSymbol(value, "Math-BoldItalic", mode).metrics) return {
		fontName: "Math-BoldItalic",
		fontClass: "boldsymbol"
	};
	else return {
		fontName: "Main-Bold",
		fontClass: "mathbf"
	};
};
/**
* Makes either a mathord or textord in the correct font and color.
*/
var makeOrd = function makeOrd(group, options, type) {
	var mode = group.mode;
	var text = group.text;
	var classes = ["mord"];
	var { font, fontFamily, fontWeight, fontShape } = options;
	var useFont = mode === "math" || mode === "text" && !!font;
	var fontOrFamily = useFont ? font : fontFamily;
	var wideFontName = "";
	var wideFontClass = "";
	if (text.charCodeAt(0) === 55349) {
		var wideCharData = wideCharacterFont(text);
		wideFontName = wideCharData.font;
		wideFontClass = wideCharData[mode + "Class"];
	}
	if (wideFontName) return makeSymbol(text, wideFontName, mode, options, classes.concat(wideFontClass));
	else if (fontOrFamily) {
		var fontName;
		var fontClasses;
		if (fontOrFamily === "boldsymbol") {
			var fontData = boldSymbol(text, mode, type);
			fontName = fontData.fontName;
			fontClasses = [fontData.fontClass];
		} else if (useFont) {
			fontName = fontMap[font].fontName;
			fontClasses = [font];
		} else {
			fontName = retrieveTextFontName(fontFamily, fontWeight, fontShape);
			fontClasses = [
				fontFamily,
				fontWeight,
				fontShape
			];
		}
		if (lookupSymbol(text, fontName, mode).metrics) return makeSymbol(text, fontName, mode, options, classes.concat(fontClasses));
		else if (ligatures.hasOwnProperty(text) && fontName.slice(0, 10) === "Typewriter") {
			var parts = [];
			for (var i = 0; i < text.length; i++) parts.push(makeSymbol(text[i], fontName, mode, options, classes.concat(fontClasses)));
			return makeFragment(parts);
		}
	}
	if (type === "mathord") return makeSymbol(text, "Math-Italic", mode, options, classes.concat(["mathnormal"]));
	else if (type === "textord") {
		var _font = symbols[mode][text] && symbols[mode][text].font;
		if (_font === "ams") return makeSymbol(text, retrieveTextFontName("amsrm", fontWeight, fontShape), mode, options, classes.concat("amsrm", fontWeight, fontShape));
		else if (_font === "main" || !_font) return makeSymbol(text, retrieveTextFontName("textrm", fontWeight, fontShape), mode, options, classes.concat(fontWeight, fontShape));
		else {
			var _fontName3 = retrieveTextFontName(_font, fontWeight, fontShape);
			return makeSymbol(text, _fontName3, mode, options, classes.concat(_fontName3, fontWeight, fontShape));
		}
	} else throw new Error("unexpected type: " + type + " in makeOrd");
};
/**
* Returns true if subsequent symbolNodes have the same classes, skew, maxFont,
* and styles. For mathnormal text, the left node must also have zero italic
* correction so we don't lose spacing between combined glyphs.
*/
var canCombine = (prev, next) => {
	if (createClass(prev.classes) !== createClass(next.classes) || prev.skew !== next.skew || prev.maxFontSize !== next.maxFontSize || prev.italic !== 0 && prev.hasClass("mathnormal")) return false;
	if (prev.classes.length === 1) {
		var cls = prev.classes[0];
		if (cls === "mbin" || cls === "mord") return false;
	}
	for (var key of Object.keys(prev.style)) if (prev.style[key] !== next.style[key]) return false;
	for (var _key of Object.keys(next.style)) if (prev.style[_key] !== next.style[_key]) return false;
	return true;
};
/**
* Combine consecutive domTree.symbolNodes into a single symbolNode.
* Note: this function mutates the argument.
*/
var tryCombineChars = (chars) => {
	for (var i = 0; i < chars.length - 1; i++) {
		var prev = chars[i];
		var next = chars[i + 1];
		if (prev instanceof SymbolNode && next instanceof SymbolNode && canCombine(prev, next)) {
			prev.text += next.text;
			prev.height = Math.max(prev.height, next.height);
			prev.depth = Math.max(prev.depth, next.depth);
			prev.italic = next.italic;
			chars.splice(i + 1, 1);
			i--;
		}
	}
	return chars;
};
/**
* Calculate the height, depth, and maxFontSize of an element based on its
* children.
*/
var sizeElementFromChildren = function sizeElementFromChildren(elem) {
	var height = 0;
	var depth = 0;
	var maxFontSize = 0;
	for (var i = 0; i < elem.children.length; i++) {
		var child = elem.children[i];
		if (child.height > height) height = child.height;
		if (child.depth > depth) depth = child.depth;
		if (child.maxFontSize > maxFontSize) maxFontSize = child.maxFontSize;
	}
	elem.height = height;
	elem.depth = depth;
	elem.maxFontSize = maxFontSize;
};
/**
* Makes a span with the given list of classes, list of children, and options.
*
* TODO(#953): Ensure that `options` is always provided (currently some call
* sites don't pass it) and make the type below mandatory.
* TODO: add a separate argument for math class (e.g. `mop`, `mbin`), which
* should if present come first in `classes`.
*/
var makeSpan = function makeSpan(classes, children, options, style) {
	var span = new Span(classes, children, options, style);
	sizeElementFromChildren(span);
	return span;
};
var makeSvgSpan = (classes, children, options, style) => new Span(classes, children, options, style);
var makeLineSpan = function makeLineSpan(className, options, thickness) {
	var line = makeSpan([className], [], options);
	line.height = Math.max(thickness || options.fontMetrics().defaultRuleThickness, options.minRuleThickness);
	line.style.borderBottomWidth = makeEm(line.height);
	line.maxFontSize = 1;
	return line;
};
/**
* Makes an anchor with the given href, list of classes, list of children,
* and options.
*/
var makeAnchor = function makeAnchor(href, classes, children, options) {
	var anchor = new Anchor(href, classes, children, options);
	sizeElementFromChildren(anchor);
	return anchor;
};
/**
* Makes a document fragment with the given list of children.
*/
var makeFragment = function makeFragment(children) {
	var fragment = new DocumentFragment(children);
	sizeElementFromChildren(fragment);
	return fragment;
};
/**
* Wraps group in a span if it's a document fragment, allowing to apply classes
* and styles
*/
var wrapFragment = function wrapFragment(group, options) {
	if (group instanceof DocumentFragment) return makeSpan([], [group], options);
	return group;
};
var getVListChildrenAndDepth = function getVListChildrenAndDepth(params) {
	if (params.positionType === "individualShift") {
		var oldChildren = params.children;
		var children = [oldChildren[0]];
		var _depth = -oldChildren[0].shift - oldChildren[0].elem.depth;
		var currPos = _depth;
		for (var i = 1; i < oldChildren.length; i++) {
			var diff = -oldChildren[i].shift - currPos - oldChildren[i].elem.depth;
			var size = diff - (oldChildren[i - 1].elem.height + oldChildren[i - 1].elem.depth);
			currPos = currPos + diff;
			children.push({
				type: "kern",
				size
			});
			children.push(oldChildren[i]);
		}
		return {
			children,
			depth: _depth
		};
	}
	var depth;
	if (params.positionType === "top") {
		var bottom = params.positionData;
		for (var _i = 0; _i < params.children.length; _i++) {
			var child = params.children[_i];
			bottom -= child.type === "kern" ? child.size : child.elem.height + child.elem.depth;
		}
		depth = bottom;
	} else if (params.positionType === "bottom") depth = -params.positionData;
	else {
		var firstChild = params.children[0];
		if (firstChild.type !== "elem") throw new Error("First child must have type \"elem\".");
		if (params.positionType === "shift") depth = -firstChild.elem.depth - params.positionData;
		else if (params.positionType === "firstBaseline") depth = -firstChild.elem.depth;
		else throw new Error("Invalid positionType " + params.positionType + ".");
	}
	return {
		children: params.children,
		depth
	};
};
/**
* Makes a vertical list by stacking elements and kerns on top of each other.
* Allows for many different ways of specifying the positioning method.
*
* See VListParam documentation above.
*/
var makeVList = function makeVList(params, options) {
	var { children, depth } = getVListChildrenAndDepth(params);
	var pstrutSize = 0;
	for (var i = 0; i < children.length; i++) {
		var child = children[i];
		if (child.type === "elem") {
			var elem = child.elem;
			pstrutSize = Math.max(pstrutSize, elem.maxFontSize, elem.height);
		}
	}
	pstrutSize += 2;
	var pstrut = makeSpan(["pstrut"], []);
	pstrut.style.height = makeEm(pstrutSize);
	var realChildren = [];
	var minPos = depth;
	var maxPos = depth;
	var currPos = depth;
	for (var _i2 = 0; _i2 < children.length; _i2++) {
		var _child = children[_i2];
		if (_child.type === "kern") currPos += _child.size;
		else {
			var _elem = _child.elem;
			var classes = _child.wrapperClasses || [];
			var style = _child.wrapperStyle || {};
			var childWrap = makeSpan(classes, [pstrut, _elem], void 0, style);
			childWrap.style.top = makeEm(-pstrutSize - currPos - _elem.depth);
			if (_child.marginLeft) childWrap.style.marginLeft = _child.marginLeft;
			if (_child.marginRight) childWrap.style.marginRight = _child.marginRight;
			realChildren.push(childWrap);
			currPos += _elem.height + _elem.depth;
		}
		minPos = Math.min(minPos, currPos);
		maxPos = Math.max(maxPos, currPos);
	}
	var vlist = makeSpan(["vlist"], realChildren);
	vlist.style.height = makeEm(maxPos);
	var rows;
	if (minPos < 0) {
		var depthStrut = makeSpan(["vlist"], [makeSpan([], [])]);
		depthStrut.style.height = makeEm(-minPos);
		rows = [makeSpan(["vlist-r"], [vlist, makeSpan(["vlist-s"], [new SymbolNode("​")])]), makeSpan(["vlist-r"], [depthStrut])];
	} else rows = [makeSpan(["vlist-r"], [vlist])];
	var vtable = makeSpan(["vlist-t"], rows);
	if (rows.length === 2) vtable.classes.push("vlist-t2");
	vtable.height = maxPos;
	vtable.depth = -minPos;
	return vtable;
};
var makeGlue = (measurement, options) => {
	var rule = makeSpan(["mspace"], [], options);
	var size = calculateSize(measurement, options);
	rule.style.marginRight = makeEm(size);
	return rule;
};
var retrieveTextFontName = (fontFamily, fontWeight, fontShape) => {
	var baseFontName;
	var fontStylesName;
	switch (fontFamily) {
		case "amsrm":
			baseFontName = "AMS";
			break;
		case "textrm":
			baseFontName = "Main";
			break;
		case "textsf":
			baseFontName = "SansSerif";
			break;
		case "texttt":
			baseFontName = "Typewriter";
			break;
		default: baseFontName = fontFamily;
	}
	if (fontWeight === "textbf" && fontShape === "textit") fontStylesName = "BoldItalic";
	else if (fontWeight === "textbf") fontStylesName = "Bold";
	else if (fontShape === "textit") fontStylesName = "Italic";
	else fontStylesName = "Regular";
	return baseFontName + "-" + fontStylesName;
};
/**
* Maps TeX font commands to objects containing:
* - variant: string used for "mathvariant" attribute in buildMathML.js
* - fontName: the "style" parameter to fontMetrics.getCharacterMetrics
*/
var fontMap = {
	"mathbf": {
		variant: "bold",
		fontName: "Main-Bold"
	},
	"mathrm": {
		variant: "normal",
		fontName: "Main-Regular"
	},
	"textit": {
		variant: "italic",
		fontName: "Main-Italic"
	},
	"mathit": {
		variant: "italic",
		fontName: "Main-Italic"
	},
	"mathnormal": {
		variant: "italic",
		fontName: "Math-Italic"
	},
	"mathsfit": {
		variant: "sans-serif-italic",
		fontName: "SansSerif-Italic"
	},
	"mathbb": {
		variant: "double-struck",
		fontName: "AMS-Regular"
	},
	"mathcal": {
		variant: "script",
		fontName: "Caligraphic-Regular"
	},
	"mathfrak": {
		variant: "fraktur",
		fontName: "Fraktur-Regular"
	},
	"mathscr": {
		variant: "script",
		fontName: "Script-Regular"
	},
	"mathsf": {
		variant: "sans-serif",
		fontName: "SansSerif-Regular"
	},
	"mathtt": {
		variant: "monospace",
		fontName: "Typewriter-Regular"
	}
};
var svgData = {
	vec: [
		"vec",
		.471,
		.714
	],
	oiintSize1: [
		"oiintSize1",
		.957,
		.499
	],
	oiintSize2: [
		"oiintSize2",
		1.472,
		.659
	],
	oiiintSize1: [
		"oiiintSize1",
		1.304,
		.499
	],
	oiiintSize2: [
		"oiiintSize2",
		1.98,
		.659
	]
};
var staticSvg = function staticSvg(value, options) {
	var [pathName, width, height] = svgData[value];
	var span = makeSvgSpan(["overlay"], [new SvgNode([new PathNode(pathName)], {
		"width": makeEm(width),
		"height": makeEm(height),
		"style": "width:" + makeEm(width),
		"viewBox": "0 0 " + 1e3 * width + " " + 1e3 * height,
		"preserveAspectRatio": "xMinYMin"
	})], options);
	span.height = height;
	span.style.height = makeEm(height);
	span.style.width = makeEm(width);
	return span;
};
var thinspace = {
	number: 3,
	unit: "mu"
};
var mediumspace = {
	number: 4,
	unit: "mu"
};
var thickspace = {
	number: 5,
	unit: "mu"
};
var spacings = {
	mord: {
		mop: thinspace,
		mbin: mediumspace,
		mrel: thickspace,
		minner: thinspace
	},
	mop: {
		mord: thinspace,
		mop: thinspace,
		mrel: thickspace,
		minner: thinspace
	},
	mbin: {
		mord: mediumspace,
		mop: mediumspace,
		mopen: mediumspace,
		minner: mediumspace
	},
	mrel: {
		mord: thickspace,
		mop: thickspace,
		mopen: thickspace,
		minner: thickspace
	},
	mopen: {},
	mclose: {
		mop: thinspace,
		mbin: mediumspace,
		mrel: thickspace,
		minner: thinspace
	},
	mpunct: {
		mord: thinspace,
		mop: thinspace,
		mrel: thickspace,
		mopen: thinspace,
		mclose: thinspace,
		mpunct: thinspace,
		minner: thinspace
	},
	minner: {
		mord: thinspace,
		mop: thinspace,
		mbin: mediumspace,
		mrel: thickspace,
		mopen: thinspace,
		mpunct: thinspace,
		minner: thinspace
	}
};
var tightSpacings = {
	mord: { mop: thinspace },
	mop: {
		mord: thinspace,
		mop: thinspace
	},
	mbin: {},
	mrel: {},
	mopen: {},
	mclose: { mop: thinspace },
	mpunct: {},
	minner: { mop: thinspace }
};
/**
* All registered functions.
* `functions.js` just exports this same dictionary again and makes it public.
* `Parser.js` requires this dictionary.
*/
var _functions = {};
/**
* All HTML builders. Should be only used in the `define*` and the `build*ML`
* functions.
*
* Builders for different node types are stored side by side, but
* `HtmlBuilder<T>` is contravariant in `T`, so there is no single type
* argument that makes storing/retrieving them typecheck.  `any` is used
* as an existential-quantifier escape hatch.
*/
var _htmlGroupBuilders = {};
/**
* All MathML builders. Should be only used in the `define*` and the `build*ML`
* functions.  See `_htmlGroupBuilders` above for the rationale behind `any`.
*/
var _mathmlGroupBuilders = {};
function defineFunction(_ref) {
	var { type, names, props, handler, htmlBuilder, mathmlBuilder } = _ref;
	var data = {
		type,
		numArgs: props.numArgs,
		argTypes: props.argTypes,
		allowedInArgument: !!props.allowedInArgument,
		allowedInText: !!props.allowedInText,
		allowedInMath: props.allowedInMath === void 0 ? true : props.allowedInMath,
		numOptionalArgs: props.numOptionalArgs || 0,
		infix: !!props.infix,
		primitive: !!props.primitive,
		handler
	};
	for (var i = 0; i < names.length; ++i) _functions[names[i]] = data;
	if (type) {
		if (htmlBuilder) _htmlGroupBuilders[type] = htmlBuilder;
		if (mathmlBuilder) _mathmlGroupBuilders[type] = mathmlBuilder;
	}
}
/**
* Use this to register only the HTML and MathML builders for a function (e.g.
* if the function's ParseNode is generated in Parser.js rather than via a
* stand-alone handler provided to `defineFunction`).
*/
function defineFunctionBuilders(_ref2) {
	var { type, htmlBuilder, mathmlBuilder } = _ref2;
	defineFunction({
		type,
		names: [],
		props: { numArgs: 0 },
		handler() {
			throw new Error("Should never be called.");
		},
		htmlBuilder,
		mathmlBuilder
	});
}
var normalizeArgument = function normalizeArgument(arg) {
	return arg.type === "ordgroup" && arg.body.length === 1 ? arg.body[0] : arg;
};
var ordargument = function ordargument(arg) {
	return arg.type === "ordgroup" ? arg.body : [arg];
};
/**
* This file does the main work of building a domTree structure from a parse
* tree. The entry point is the `buildHTML` function, which takes a parse tree.
* Then, the buildExpression, buildGroup, and various groupBuilders functions
* are called, to produce a final HTML tree.
*/
var binLeftCanceller = /* @__PURE__ */ new Set([
	"leftmost",
	"mbin",
	"mopen",
	"mrel",
	"mop",
	"mpunct"
]);
var binRightCanceller = /* @__PURE__ */ new Set([
	"rightmost",
	"mrel",
	"mclose",
	"mpunct"
]);
var styleMap$1 = {
	"display": Style$1.DISPLAY,
	"text": Style$1.TEXT,
	"script": Style$1.SCRIPT,
	"scriptscript": Style$1.SCRIPTSCRIPT
};
var DomEnum = {
	mord: "mord",
	mop: "mop",
	mbin: "mbin",
	mrel: "mrel",
	mopen: "mopen",
	mclose: "mclose",
	mpunct: "mpunct",
	minner: "minner"
};
/**
* Take a list of nodes, build them in order, and return a list of the built
* nodes. documentFragments are flattened into their contents, so the
* returned list contains no fragments. `isRealGroup` is true if `expression`
* is a real group (no atoms will be added on either side), as opposed to
* a partial group (e.g. one created by \color). `surrounding` is an array
* consisting type of nodes that will be added to the left and right.
*/
var buildExpression$1 = function buildExpression(expression, options, isRealGroup, surrounding) {
	if (surrounding === void 0) surrounding = [null, null];
	var groups = [];
	for (var i = 0; i < expression.length; i++) {
		var output = buildGroup$1(expression[i], options);
		if (output instanceof DocumentFragment) {
			var children = output.children;
			groups.push(...children);
		} else groups.push(output);
	}
	tryCombineChars(groups);
	if (!isRealGroup) return groups;
	var glueOptions = options;
	if (expression.length === 1) {
		var node = expression[0];
		if (node.type === "sizing") glueOptions = options.havingSize(node.size);
		else if (node.type === "styling") glueOptions = options.havingStyle(styleMap$1[node.style]);
	}
	var dummyPrev = makeSpan([surrounding[0] || "leftmost"], [], options);
	var dummyNext = makeSpan([surrounding[1] || "rightmost"], [], options);
	var isRoot = isRealGroup === "root";
	_traverseNonSpaceNodes(groups, (node, prev) => {
		var prevType = prev.classes[0];
		var type = node.classes[0];
		if (prevType === "mbin" && binRightCanceller.has(type)) prev.classes[0] = "mord";
		else if (type === "mbin" && binLeftCanceller.has(prevType)) node.classes[0] = "mord";
	}, { node: dummyPrev }, dummyNext, isRoot);
	_traverseNonSpaceNodes(groups, (node, prev) => {
		var _tightSpacings$prevTy, _spacings$prevType;
		var prevType = getTypeOfDomTree(prev);
		var type = getTypeOfDomTree(node);
		var space = prevType && type ? node.hasClass("mtight") ? (_tightSpacings$prevTy = tightSpacings[prevType]) == null ? void 0 : _tightSpacings$prevTy[type] : (_spacings$prevType = spacings[prevType]) == null ? void 0 : _spacings$prevType[type] : null;
		if (space) return makeGlue(space, glueOptions);
	}, { node: dummyPrev }, dummyNext, isRoot);
	return groups;
};
var _traverseNonSpaceNodes = function traverseNonSpaceNodes(nodes, callback, prev, next, isRoot) {
	if (next) nodes.push(next);
	var i = 0;
	for (; i < nodes.length; i++) {
		var node = nodes[i];
		var partialGroup = checkPartialGroup(node);
		if (partialGroup) {
			_traverseNonSpaceNodes(partialGroup.children, callback, prev, null, isRoot);
			continue;
		}
		var nonspace = !node.hasClass("mspace");
		if (nonspace) {
			var result = callback(node, prev.node);
			if (result) {
				if (prev.insertAfter) prev.insertAfter(result);
				else {
					nodes.unshift(result);
					i++;
				}
			}
		}
		if (nonspace) prev.node = node;
		else if (isRoot && node.hasClass("newline")) prev.node = makeSpan(["leftmost"]);
		prev.insertAfter = ((index) => (n) => {
			nodes.splice(index + 1, 0, n);
			i++;
		})(i);
	}
	if (next) nodes.pop();
};
var checkPartialGroup = function checkPartialGroup(node) {
	if (node instanceof DocumentFragment || node instanceof Anchor || node instanceof Span && node.hasClass("enclosing")) return node;
	return null;
};
var _getOutermostNode = function getOutermostNode(node, side) {
	var partialGroup = checkPartialGroup(node);
	if (partialGroup) {
		var children = partialGroup.children;
		if (children.length) {
			if (side === "right") return _getOutermostNode(children[children.length - 1], "right");
			else if (side === "left") return _getOutermostNode(children[0], "left");
		}
	}
	return node;
};
var getTypeOfDomTree = function getTypeOfDomTree(node, side) {
	if (!node) return null;
	if (side) node = _getOutermostNode(node, side);
	return DomEnum[node.classes[0]] || null;
};
var makeNullDelimiter = function makeNullDelimiter(options, classes) {
	var moreClasses = ["nulldelimiter"].concat(options.baseSizingClasses());
	return makeSpan(classes.concat(moreClasses));
};
/**
* buildGroup is the function that takes a group and calls the correct groupType
* function for it. It also handles the interaction of size and style changes
* between parents and children.
*/
var buildGroup$1 = function buildGroup(group, options, baseOptions) {
	if (!group) return makeSpan();
	if (_htmlGroupBuilders[group.type]) {
		var groupNode = _htmlGroupBuilders[group.type](group, options);
		if (baseOptions && options.size !== baseOptions.size) {
			groupNode = makeSpan(options.sizingClasses(baseOptions), [groupNode], options);
			var multiplier = options.sizeMultiplier / baseOptions.sizeMultiplier;
			groupNode.height *= multiplier;
			groupNode.depth *= multiplier;
		}
		return groupNode;
	} else throw new ParseError("Got group of unknown type: '" + group.type + "'");
};
/**
* Combine an array of HTML DOM nodes (e.g., the output of `buildExpression`)
* into an unbreakable HTML node of class .base, with proper struts to
* guarantee correct vertical extent.  `buildHTML` calls this repeatedly to
* make up the entire expression as a sequence of unbreakable units.
*/
function buildHTMLUnbreakable(children, options) {
	var body = makeSpan(["base"], children, options);
	var strut = makeSpan(["strut"]);
	strut.style.height = makeEm(body.height + body.depth);
	if (body.depth) strut.style.verticalAlign = makeEm(-body.depth);
	body.children.unshift(strut);
	return body;
}
/**
* Take an entire parse tree, and build it into an appropriate set of HTML
* nodes.
*/
function buildHTML(tree, options) {
	var tag = null;
	if (tree.length === 1 && tree[0].type === "tag") {
		tag = tree[0].tag;
		tree = tree[0].body;
	}
	var expression = buildExpression$1(tree, options, "root");
	var eqnNum;
	if (expression.length === 2 && expression[1].hasClass("tag")) eqnNum = expression.pop();
	var children = [];
	var parts = [];
	for (var i = 0; i < expression.length; i++) {
		parts.push(expression[i]);
		if (expression[i].hasClass("mbin") || expression[i].hasClass("mrel") || expression[i].hasClass("allowbreak")) {
			var nobreak = false;
			while (i < expression.length - 1 && expression[i + 1].hasClass("mspace") && !expression[i + 1].hasClass("newline")) {
				i++;
				parts.push(expression[i]);
				if (expression[i].hasClass("nobreak")) nobreak = true;
			}
			if (!nobreak) {
				children.push(buildHTMLUnbreakable(parts, options));
				parts = [];
			}
		} else if (expression[i].hasClass("newline")) {
			parts.pop();
			if (parts.length > 0) {
				children.push(buildHTMLUnbreakable(parts, options));
				parts = [];
			}
			children.push(expression[i]);
		}
	}
	if (parts.length > 0) children.push(buildHTMLUnbreakable(parts, options));
	var tagChild;
	if (tag) {
		tagChild = buildHTMLUnbreakable(buildExpression$1(tag, options, true), options);
		tagChild.classes = ["tag"];
		children.push(tagChild);
	} else if (eqnNum) children.push(eqnNum);
	var htmlNode = makeSpan(["katex-html"], children);
	htmlNode.setAttribute("aria-hidden", "true");
	if (tagChild) {
		var strut = tagChild.children[0];
		strut.style.height = makeEm(htmlNode.height + htmlNode.depth);
		if (htmlNode.depth) strut.style.verticalAlign = makeEm(-htmlNode.depth);
	}
	return htmlNode;
}
/**
* These objects store data about MathML nodes. This is the MathML equivalent
* of the types in domTree.js. Since MathML handles its own rendering, and
* since we're mainly using MathML to improve accessibility, we don't manage
* any of the styling state that the plain DOM nodes do.
*
* The `toNode` and `toMarkup` functions work similarly to how they do in
* domTree.js, creating namespaced DOM nodes and HTML text markup respectively.
*/
function newDocumentFragment(children) {
	return new DocumentFragment(children);
}
/**
* This node represents a general purpose MathML node of any type. The
* constructor requires the type of node to create (for example, `"mo"` or
* `"mspace"`, corresponding to `<mo>` and `<mspace>` tags).
*/
var MathNode = class {
	constructor(type, children, classes) {
		this.type = void 0;
		this.attributes = void 0;
		this.children = void 0;
		this.classes = void 0;
		this.type = type;
		this.attributes = {};
		this.children = children || [];
		this.classes = classes || [];
	}
	/**
	* Sets an attribute on a MathML node. MathML depends on attributes to convey a
	* semantic content, so this is used heavily.
	*/
	setAttribute(name, value) {
		this.attributes[name] = value;
	}
	/**
	* Gets an attribute on a MathML node.
	*/
	getAttribute(name) {
		return this.attributes[name];
	}
	/**
	* Converts the math node into a MathML-namespaced DOM element.
	*/
	toNode() {
		var node = document.createElementNS("http://www.w3.org/1998/Math/MathML", this.type);
		for (var attr in this.attributes) if (Object.prototype.hasOwnProperty.call(this.attributes, attr)) node.setAttribute(attr, this.attributes[attr]);
		if (this.classes.length > 0) node.className = createClass(this.classes);
		for (var i = 0; i < this.children.length; i++) if (this.children[i] instanceof TextNode && this.children[i + 1] instanceof TextNode) {
			var text = this.children[i].toText() + this.children[++i].toText();
			while (this.children[i + 1] instanceof TextNode) text += this.children[++i].toText();
			node.appendChild(new TextNode(text).toNode());
		} else node.appendChild(this.children[i].toNode());
		return node;
	}
	/**
	* Converts the math node into an HTML markup string.
	*/
	toMarkup() {
		var markup = "<" + this.type;
		for (var attr in this.attributes) if (Object.prototype.hasOwnProperty.call(this.attributes, attr)) {
			markup += " " + attr + "=\"";
			markup += escape(this.attributes[attr]);
			markup += "\"";
		}
		if (this.classes.length > 0) markup += " class =\"" + escape(createClass(this.classes)) + "\"";
		markup += ">";
		for (var i = 0; i < this.children.length; i++) markup += this.children[i].toMarkup();
		markup += "</" + this.type + ">";
		return markup;
	}
	/**
	* Converts the math node into a string, similar to innerText, but escaped.
	*/
	toText() {
		return this.children.map((child) => child.toText()).join("");
	}
};
/**
* This node represents a piece of text.
*/
var TextNode = class {
	constructor(text) {
		this.text = void 0;
		this.text = text;
	}
	/**
	* Converts the text node into a DOM text node.
	*/
	toNode() {
		return document.createTextNode(this.text);
	}
	/**
	* Converts the text node into escaped HTML markup
	* (representing the text itself).
	*/
	toMarkup() {
		return escape(this.toText());
	}
	/**
	* Converts the text node into a string
	* (representing the text itself).
	*/
	toText() {
		return this.text;
	}
};
/**
* This node represents a space, but may render as <mspace.../> or as text,
* depending on the width.
*/
var SpaceNode = class {
	/**
	* Create a Space node with width given in CSS ems.
	*/
	constructor(width) {
		this.width = void 0;
		this.character = void 0;
		this.width = width;
		if (width >= .05555 && width <= .05556) this.character = " ";
		else if (width >= .1666 && width <= .1667) this.character = " ";
		else if (width >= .2222 && width <= .2223) this.character = " ";
		else if (width >= .2777 && width <= .2778) this.character = "  ";
		else if (width >= -.05556 && width <= -.05555) this.character = " ⁣";
		else if (width >= -.1667 && width <= -.1666) this.character = " ⁣";
		else if (width >= -.2223 && width <= -.2222) this.character = " ⁣";
		else if (width >= -.2778 && width <= -.2777) this.character = " ⁣";
		else this.character = null;
	}
	/**
	* Converts the math node into a MathML-namespaced DOM element.
	*/
	toNode() {
		if (this.character) return document.createTextNode(this.character);
		else {
			var node = document.createElementNS("http://www.w3.org/1998/Math/MathML", "mspace");
			node.setAttribute("width", makeEm(this.width));
			return node;
		}
	}
	/**
	* Converts the math node into an HTML markup string.
	*/
	toMarkup() {
		if (this.character) return "<mtext>" + this.character + "</mtext>";
		else return "<mspace width=\"" + makeEm(this.width) + "\"/>";
	}
	/**
	* Converts the math node into a string, similar to innerText.
	*/
	toText() {
		if (this.character) return this.character;
		else return " ";
	}
};
/**
* This file converts a parse tree into a corresponding MathML tree. The main
* entry point is the `buildMathML` function, which takes a parse tree from the
* parser.
*/
var noVariantSymbols = /* @__PURE__ */ new Set(["\\imath", "\\jmath"]);
var rowLikeTypes = /* @__PURE__ */ new Set(["mrow", "mtable"]);
/**
* Takes a symbol and converts it into a MathML text node after performing
* optional replacement from symbols.js.
*/
var makeText = function makeText(text, mode, options) {
	if (symbols[mode][text] && symbols[mode][text].replace && text.charCodeAt(0) !== 55349 && !(ligatures.hasOwnProperty(text) && options && (options.fontFamily && options.fontFamily.slice(4, 6) === "tt" || options.font && options.font.slice(4, 6) === "tt"))) text = symbols[mode][text].replace;
	return new TextNode(text);
};
/**
* Wrap the given array of nodes in an <mrow> node if needed, i.e.,
* unless the array has length 1.  Always returns a single node.
*/
var makeRow = function makeRow(body) {
	if (body.length === 1) return body[0];
	else return new MathNode("mrow", body);
};
var mathFontVariants = {
	mathit: "italic",
	boldsymbol: (group) => group.type === "textord" ? "bold" : "bold-italic",
	mathbf: "bold",
	mathbb: "double-struck",
	mathsfit: "sans-serif-italic",
	mathfrak: "fraktur",
	mathscr: "script",
	mathcal: "script",
	mathsf: "sans-serif",
	mathtt: "monospace"
};
/**
* Returns the math variant as a string or null if none is required.
*/
var getVariant = (group, options) => {
	if (group.mode === "text") {
		if (options.fontFamily === "texttt") return "monospace";
		else if (options.fontFamily === "textsf") {
			if (options.fontShape === "textit" && options.fontWeight === "textbf") return "sans-serif-bold-italic";
			else if (options.fontShape === "textit") return "sans-serif-italic";
			else if (options.fontWeight === "textbf") return "bold-sans-serif";
			else return "sans-serif";
		} else if (options.fontShape === "textit" && options.fontWeight === "textbf") return "bold-italic";
		else if (options.fontShape === "textit") return "italic";
		else if (options.fontWeight === "textbf") return "bold";
	}
	var font = options.font;
	if (!font || font === "mathnormal") return null;
	var mode = group.mode;
	var mathVariant = mathFontVariants[font];
	if (mathVariant) return typeof mathVariant === "function" ? mathVariant(group) : mathVariant;
	var text = group.text;
	if (noVariantSymbols.has(text)) return null;
	if (symbols[mode][text]) {
		var replacement = symbols[mode][text].replace;
		if (replacement) text = replacement;
	}
	var fontName = fontMap[font].fontName;
	if (getCharacterMetrics(text, fontName, mode)) return fontMap[font].variant;
	return null;
};
/**
* Check for <mi>.</mi> which is how a dot renders in MathML,
* or <mo separator="true" lspace="0em" rspace="0em">,</mo>
* which is how a braced comma {,} renders in MathML
*/
function isNumberPunctuation(group) {
	if (!group) return false;
	if (group.type === "mi" && group.children.length === 1) {
		var child = group.children[0];
		return child instanceof TextNode && child.text === ".";
	} else if (group.type === "mo" && group.children.length === 1 && group.getAttribute("separator") === "true" && group.getAttribute("lspace") === "0em" && group.getAttribute("rspace") === "0em") {
		var _child = group.children[0];
		return _child instanceof TextNode && _child.text === ",";
	} else return false;
}
/**
* Takes a list of nodes, builds them, and returns a list of the generated
* MathML nodes.  Also combine consecutive <mtext> outputs into a single
* <mtext> tag.
*/
var buildExpression = function buildExpression(expression, options, isOrdgroup) {
	if (expression.length === 1) {
		var group = buildGroup(expression[0], options);
		if (isOrdgroup && group instanceof MathNode && group.type === "mo") {
			group.setAttribute("lspace", "0em");
			group.setAttribute("rspace", "0em");
		}
		return [group];
	}
	var groups = [];
	var lastGroup;
	for (var i = 0; i < expression.length; i++) {
		var _group = buildGroup(expression[i], options);
		if (_group instanceof MathNode && lastGroup instanceof MathNode) {
			if (_group.type === "mtext" && lastGroup.type === "mtext" && _group.getAttribute("mathvariant") === lastGroup.getAttribute("mathvariant")) {
				lastGroup.children.push(..._group.children);
				continue;
			} else if (_group.type === "mn" && lastGroup.type === "mn") {
				lastGroup.children.push(..._group.children);
				continue;
			} else if (isNumberPunctuation(_group) && lastGroup.type === "mn") {
				lastGroup.children.push(..._group.children);
				continue;
			} else if (_group.type === "mn" && isNumberPunctuation(lastGroup)) {
				_group.children = [...lastGroup.children, ..._group.children];
				groups.pop();
			} else if ((_group.type === "msup" || _group.type === "msub") && _group.children.length >= 1 && (lastGroup.type === "mn" || isNumberPunctuation(lastGroup))) {
				var base = _group.children[0];
				if (base instanceof MathNode && base.type === "mn") {
					base.children = [...lastGroup.children, ...base.children];
					groups.pop();
				}
			} else if (lastGroup.type === "mi" && lastGroup.children.length === 1) {
				var lastChild = lastGroup.children[0];
				if (lastChild instanceof TextNode && lastChild.text === "̸" && (_group.type === "mo" || _group.type === "mi" || _group.type === "mn")) {
					var child = _group.children[0];
					if (child instanceof TextNode && child.text.length > 0) {
						child.text = child.text.slice(0, 1) + "̸" + child.text.slice(1);
						groups.pop();
					}
				}
			}
		}
		groups.push(_group);
		lastGroup = _group;
	}
	return groups;
};
/**
* Equivalent to buildExpression, but wraps the elements in an <mrow>
* if there's more than one.  Returns a single node instead of an array.
*/
var buildExpressionRow = function buildExpressionRow(expression, options, isOrdgroup) {
	return makeRow(buildExpression(expression, options, isOrdgroup));
};
/**
* Takes a group from the parser and calls the appropriate groupBuilders function
* on it to produce a MathML node.
*/
var buildGroup = function buildGroup(group, options) {
	if (!group) return new MathNode("mrow");
	if (_mathmlGroupBuilders[group.type]) return _mathmlGroupBuilders[group.type](group, options);
	else throw new ParseError("Got group of unknown type: '" + group.type + "'");
};
/**
* Takes a full parse tree and settings and builds a MathML representation of
* it. In particular, we put the elements from building the parse tree into a
* <semantics> tag so we can also include that TeX source as an annotation.
*
* Note that we actually return a domTree element with a `<math>` inside it so
* we can do appropriate styling.
*/
function buildMathML(tree, texExpression, options, isDisplayMode, forMathmlOnly) {
	var expression = buildExpression(tree, options);
	var wrapper;
	if (expression.length === 1 && expression[0] instanceof MathNode && rowLikeTypes.has(expression[0].type)) wrapper = expression[0];
	else wrapper = new MathNode("mrow", expression);
	var annotation = new MathNode("annotation", [new TextNode(texExpression)]);
	annotation.setAttribute("encoding", "application/x-tex");
	var math = new MathNode("math", [new MathNode("semantics", [wrapper, annotation])]);
	math.setAttribute("xmlns", "http://www.w3.org/1998/Math/MathML");
	if (isDisplayMode) math.setAttribute("display", "block");
	return makeSpan([forMathmlOnly ? "katex" : "katex-mathml"], [math]);
}
/**
* This file contains information about the options that the Parser carries
* around with it while parsing. Data is held in an `Options` object, and when
* recursing, a new `Options` object can be created with the `.with*` and
* `.reset` functions.
*/
var sizeStyleMap = [
	[
		1,
		1,
		1
	],
	[
		2,
		1,
		1
	],
	[
		3,
		1,
		1
	],
	[
		4,
		2,
		1
	],
	[
		5,
		2,
		1
	],
	[
		6,
		3,
		1
	],
	[
		7,
		4,
		2
	],
	[
		8,
		6,
		3
	],
	[
		9,
		7,
		6
	],
	[
		10,
		8,
		7
	],
	[
		11,
		10,
		9
	]
];
var sizeMultipliers = [
	.5,
	.6,
	.7,
	.8,
	.9,
	1,
	1.2,
	1.44,
	1.728,
	2.074,
	2.488
];
var sizeAtStyle = function sizeAtStyle(size, style) {
	return style.size < 2 ? size : sizeStyleMap[size - 1][style.size - 1];
};
/**
* This is the main options class. It contains the current style, size, color,
* and font.
*
* Options objects should not be modified. To create a new Options with
* different properties, call a `.having*` method.
*/
var Options = class Options {
	constructor(data) {
		this.style = void 0;
		this.color = void 0;
		this.size = void 0;
		this.textSize = void 0;
		this.phantom = void 0;
		this.font = void 0;
		this.fontFamily = void 0;
		this.fontWeight = void 0;
		this.fontShape = void 0;
		this.sizeMultiplier = void 0;
		this.maxSize = void 0;
		this.minRuleThickness = void 0;
		this._fontMetrics = void 0;
		this.style = data.style;
		this.color = data.color;
		this.size = data.size || Options.BASESIZE;
		this.textSize = data.textSize || this.size;
		this.phantom = !!data.phantom;
		this.font = data.font || "";
		this.fontFamily = data.fontFamily || "";
		this.fontWeight = data.fontWeight || "";
		this.fontShape = data.fontShape || "";
		this.sizeMultiplier = sizeMultipliers[this.size - 1];
		this.maxSize = data.maxSize;
		this.minRuleThickness = data.minRuleThickness;
		this._fontMetrics = void 0;
	}
	/**
	* Returns a new options object with the same properties as "this".  Properties
	* from "extension" will be copied to the new options object.
	*/
	extend(extension) {
		var data = {
			style: this.style,
			size: this.size,
			textSize: this.textSize,
			color: this.color,
			phantom: this.phantom,
			font: this.font,
			fontFamily: this.fontFamily,
			fontWeight: this.fontWeight,
			fontShape: this.fontShape,
			maxSize: this.maxSize,
			minRuleThickness: this.minRuleThickness
		};
		Object.assign(data, extension);
		return new Options(data);
	}
	/**
	* Return an options object with the given style. If `this.style === style`,
	* returns `this`.
	*/
	havingStyle(style) {
		if (this.style === style) return this;
		else return this.extend({
			style,
			size: sizeAtStyle(this.textSize, style)
		});
	}
	/**
	* Return an options object with a cramped version of the current style. If
	* the current style is cramped, returns `this`.
	*/
	havingCrampedStyle() {
		return this.havingStyle(this.style.cramp());
	}
	/**
	* Return an options object with the given size and in at least `\textstyle`.
	* Returns `this` if appropriate.
	*/
	havingSize(size) {
		if (this.size === size && this.textSize === size) return this;
		else return this.extend({
			style: this.style.text(),
			size,
			textSize: size,
			sizeMultiplier: sizeMultipliers[size - 1]
		});
	}
	/**
	* Like `this.havingSize(BASESIZE).havingStyle(style)`. If `style` is omitted,
	* changes to at least `\textstyle`.
	*/
	havingBaseStyle(style) {
		style = style || this.style.text();
		var wantSize = sizeAtStyle(Options.BASESIZE, style);
		if (this.size === wantSize && this.textSize === Options.BASESIZE && this.style === style) return this;
		else return this.extend({
			style,
			size: wantSize
		});
	}
	/**
	* Remove the effect of sizing changes such as \Huge.
	* Keep the effect of the current style, such as \scriptstyle.
	*/
	havingBaseSizing() {
		var size;
		switch (this.style.id) {
			case 4:
			case 5:
				size = 3;
				break;
			case 6:
			case 7:
				size = 1;
				break;
			default: size = 6;
		}
		return this.extend({
			style: this.style.text(),
			size
		});
	}
	/**
	* Create a new options object with the given color.
	*/
	withColor(color) {
		return this.extend({ color });
	}
	/**
	* Create a new options object with "phantom" set to true.
	*/
	withPhantom() {
		return this.extend({ phantom: true });
	}
	/**
	* Creates a new options object with the given math font or old text font.
	* @type {[type]}
	*/
	withFont(font) {
		return this.extend({ font });
	}
	/**
	* Create a new options objects with the given fontFamily.
	*/
	withTextFontFamily(fontFamily) {
		return this.extend({
			fontFamily,
			font: ""
		});
	}
	/**
	* Creates a new options object with the given font weight
	*/
	withTextFontWeight(fontWeight) {
		return this.extend({
			fontWeight,
			font: ""
		});
	}
	/**
	* Creates a new options object with the given font weight
	*/
	withTextFontShape(fontShape) {
		return this.extend({
			fontShape,
			font: ""
		});
	}
	/**
	* Return the CSS sizing classes required to switch from enclosing options
	* `oldOptions` to `this`. Returns an array of classes.
	*/
	sizingClasses(oldOptions) {
		if (oldOptions.size !== this.size) return [
			"sizing",
			"reset-size" + oldOptions.size,
			"size" + this.size
		];
		else return [];
	}
	/**
	* Return the CSS sizing classes required to switch to the base size. Like
	* `this.havingSize(BASESIZE).sizingClasses(this)`.
	*/
	baseSizingClasses() {
		if (this.size !== Options.BASESIZE) return [
			"sizing",
			"reset-size" + this.size,
			"size" + Options.BASESIZE
		];
		else return [];
	}
	/**
	* Return the font metrics for this size.
	*/
	fontMetrics() {
		if (!this._fontMetrics) this._fontMetrics = getGlobalMetrics(this.size);
		return this._fontMetrics;
	}
	/**
	* Gets the CSS color of the current options object
	*/
	getColor() {
		if (this.phantom) return "transparent";
		else return this.color;
	}
};
/**
* The base size index.
*/
Options.BASESIZE = 6;
var optionsFromSettings = function optionsFromSettings(settings) {
	return new Options({
		style: settings.displayMode ? Style$1.DISPLAY : Style$1.TEXT,
		maxSize: settings.maxSize,
		minRuleThickness: settings.minRuleThickness
	});
};
var displayWrap = function displayWrap(node, settings) {
	if (settings.displayMode) {
		var classes = ["katex-display"];
		if (settings.leqno) classes.push("leqno");
		if (settings.fleqn) classes.push("fleqn");
		node = makeSpan(classes, [node]);
	}
	return node;
};
var buildTree = function buildTree(tree, expression, settings) {
	var options = optionsFromSettings(settings);
	var katexNode;
	if (settings.output === "mathml") return buildMathML(tree, expression, options, settings.displayMode, true);
	else if (settings.output === "html") katexNode = makeSpan(["katex"], [buildHTML(tree, options)]);
	else katexNode = makeSpan(["katex"], [buildMathML(tree, expression, options, settings.displayMode, false), buildHTML(tree, options)]);
	return displayWrap(katexNode, settings);
};
var buildHTMLTree = function buildHTMLTree(tree, expression, settings) {
	return displayWrap(makeSpan(["katex"], [buildHTML(tree, optionsFromSettings(settings))]), settings);
};
/**
* This file provides support to buildMathML.js and buildHTML.js
* for stretchy wide elements rendered from SVG files
* and other CSS trickery.
*/
var stretchyCodePoint = {
	widehat: "^",
	widecheck: "ˇ",
	widetilde: "~",
	utilde: "~",
	overleftarrow: "←",
	underleftarrow: "←",
	xleftarrow: "←",
	overrightarrow: "→",
	underrightarrow: "→",
	xrightarrow: "→",
	underbrace: "⏟",
	overbrace: "⏞",
	underbracket: "⎵",
	overbracket: "⎴",
	overgroup: "⏠",
	undergroup: "⏡",
	overleftrightarrow: "↔",
	underleftrightarrow: "↔",
	xleftrightarrow: "↔",
	Overrightarrow: "⇒",
	xRightarrow: "⇒",
	overleftharpoon: "↼",
	xleftharpoonup: "↼",
	overrightharpoon: "⇀",
	xrightharpoonup: "⇀",
	xLeftarrow: "⇐",
	xLeftrightarrow: "⇔",
	xhookleftarrow: "↩",
	xhookrightarrow: "↪",
	xmapsto: "↦",
	xrightharpoondown: "⇁",
	xleftharpoondown: "↽",
	xrightleftharpoons: "⇌",
	xleftrightharpoons: "⇋",
	xtwoheadleftarrow: "↞",
	xtwoheadrightarrow: "↠",
	xlongequal: "=",
	xtofrom: "⇄",
	xrightleftarrows: "⇄",
	xrightequilibrium: "⇌",
	xleftequilibrium: "⇋",
	"\\cdrightarrow": "→",
	"\\cdleftarrow": "←",
	"\\cdlongequal": "="
};
var stretchyMathML = function stretchyMathML(label) {
	var node = new MathNode("mo", [new TextNode(stretchyCodePoint[label.replace(/^\\/, "")])]);
	node.setAttribute("stretchy", "true");
	return node;
};
var katexImagesData = {
	overrightarrow: [
		["rightarrow"],
		.888,
		522,
		"xMaxYMin"
	],
	overleftarrow: [
		["leftarrow"],
		.888,
		522,
		"xMinYMin"
	],
	underrightarrow: [
		["rightarrow"],
		.888,
		522,
		"xMaxYMin"
	],
	underleftarrow: [
		["leftarrow"],
		.888,
		522,
		"xMinYMin"
	],
	xrightarrow: [
		["rightarrow"],
		1.469,
		522,
		"xMaxYMin"
	],
	"\\cdrightarrow": [
		["rightarrow"],
		3,
		522,
		"xMaxYMin"
	],
	xleftarrow: [
		["leftarrow"],
		1.469,
		522,
		"xMinYMin"
	],
	"\\cdleftarrow": [
		["leftarrow"],
		3,
		522,
		"xMinYMin"
	],
	Overrightarrow: [
		["doublerightarrow"],
		.888,
		560,
		"xMaxYMin"
	],
	xRightarrow: [
		["doublerightarrow"],
		1.526,
		560,
		"xMaxYMin"
	],
	xLeftarrow: [
		["doubleleftarrow"],
		1.526,
		560,
		"xMinYMin"
	],
	overleftharpoon: [
		["leftharpoon"],
		.888,
		522,
		"xMinYMin"
	],
	xleftharpoonup: [
		["leftharpoon"],
		.888,
		522,
		"xMinYMin"
	],
	xleftharpoondown: [
		["leftharpoondown"],
		.888,
		522,
		"xMinYMin"
	],
	overrightharpoon: [
		["rightharpoon"],
		.888,
		522,
		"xMaxYMin"
	],
	xrightharpoonup: [
		["rightharpoon"],
		.888,
		522,
		"xMaxYMin"
	],
	xrightharpoondown: [
		["rightharpoondown"],
		.888,
		522,
		"xMaxYMin"
	],
	xlongequal: [
		["longequal"],
		.888,
		334,
		"xMinYMin"
	],
	"\\cdlongequal": [
		["longequal"],
		3,
		334,
		"xMinYMin"
	],
	xtwoheadleftarrow: [
		["twoheadleftarrow"],
		.888,
		334,
		"xMinYMin"
	],
	xtwoheadrightarrow: [
		["twoheadrightarrow"],
		.888,
		334,
		"xMaxYMin"
	],
	overleftrightarrow: [
		["leftarrow", "rightarrow"],
		.888,
		522
	],
	overbrace: [
		[
			"leftbrace",
			"midbrace",
			"rightbrace"
		],
		1.6,
		548
	],
	underbrace: [
		[
			"leftbraceunder",
			"midbraceunder",
			"rightbraceunder"
		],
		1.6,
		548
	],
	underleftrightarrow: [
		["leftarrow", "rightarrow"],
		.888,
		522
	],
	xleftrightarrow: [
		["leftarrow", "rightarrow"],
		1.75,
		522
	],
	xLeftrightarrow: [
		["doubleleftarrow", "doublerightarrow"],
		1.75,
		560
	],
	xrightleftharpoons: [
		["leftharpoondownplus", "rightharpoonplus"],
		1.75,
		716
	],
	xleftrightharpoons: [
		["leftharpoonplus", "rightharpoondownplus"],
		1.75,
		716
	],
	xhookleftarrow: [
		["leftarrow", "righthook"],
		1.08,
		522
	],
	xhookrightarrow: [
		["lefthook", "rightarrow"],
		1.08,
		522
	],
	overlinesegment: [
		["leftlinesegment", "rightlinesegment"],
		.888,
		522
	],
	underlinesegment: [
		["leftlinesegment", "rightlinesegment"],
		.888,
		522
	],
	overbracket: [
		["leftbracketover", "rightbracketover"],
		1.6,
		440
	],
	underbracket: [
		["leftbracketunder", "rightbracketunder"],
		1.6,
		410
	],
	overgroup: [
		["leftgroup", "rightgroup"],
		.888,
		342
	],
	undergroup: [
		["leftgroupunder", "rightgroupunder"],
		.888,
		342
	],
	xmapsto: [
		["leftmapsto", "rightarrow"],
		1.5,
		522
	],
	xtofrom: [
		["leftToFrom", "rightToFrom"],
		1.75,
		528
	],
	xrightleftarrows: [
		["baraboveleftarrow", "rightarrowabovebar"],
		1.75,
		901
	],
	xrightequilibrium: [
		["baraboveshortleftharpoon", "rightharpoonaboveshortbar"],
		1.75,
		716
	],
	xleftequilibrium: [
		["shortbaraboveleftharpoon", "shortrightharpoonabovebar"],
		1.75,
		716
	]
};
var wideAccentLabels = /* @__PURE__ */ new Set([
	"widehat",
	"widecheck",
	"widetilde",
	"utilde"
]);
var stretchySvg = function stretchySvg(group, options) {
	function buildSvgSpan_() {
		var viewBoxWidth = 4e5;
		var label = group.label.slice(1);
		if (wideAccentLabels.has(label) && "base" in group) {
			var numChars = group.base.type === "ordgroup" ? group.base.body.length : 1;
			var viewBoxHeight;
			var pathName;
			var _height;
			if (numChars > 5) {
				if (label === "widehat" || label === "widecheck") {
					viewBoxHeight = 420;
					viewBoxWidth = 2364;
					_height = .42;
					pathName = label + "4";
				} else {
					viewBoxHeight = 312;
					viewBoxWidth = 2340;
					_height = .34;
					pathName = "tilde4";
				}
			} else {
				var imgIndex = [
					1,
					1,
					2,
					2,
					3,
					3
				][numChars];
				if (label === "widehat" || label === "widecheck") {
					viewBoxWidth = [
						0,
						1062,
						2364,
						2364,
						2364
					][imgIndex];
					viewBoxHeight = [
						0,
						239,
						300,
						360,
						420
					][imgIndex];
					_height = [
						0,
						.24,
						.3,
						.3,
						.36,
						.42
					][imgIndex];
					pathName = label + imgIndex;
				} else {
					viewBoxWidth = [
						0,
						600,
						1033,
						2339,
						2340
					][imgIndex];
					viewBoxHeight = [
						0,
						260,
						286,
						306,
						312
					][imgIndex];
					_height = [
						0,
						.26,
						.286,
						.3,
						.306,
						.34
					][imgIndex];
					pathName = "tilde" + imgIndex;
				}
			}
			return {
				span: makeSvgSpan([], [new SvgNode([new PathNode(pathName)], {
					"width": "100%",
					"height": makeEm(_height),
					"viewBox": "0 0 " + viewBoxWidth + " " + viewBoxHeight,
					"preserveAspectRatio": "none"
				})], options),
				minWidth: 0,
				height: _height
			};
		} else {
			var spans = [];
			var data = katexImagesData[label];
			if (!data) throw new Error("No SVG data for \"" + label + "\".");
			var [paths, _minWidth, _viewBoxHeight] = data;
			var _height2 = _viewBoxHeight / 1e3;
			var numSvgChildren = paths.length;
			var widthClasses;
			var aligns;
			if (numSvgChildren === 1) {
				if (data.length !== 4) throw new Error("Expected 4-tuple for single-path SVG data \"" + label + "\".");
				widthClasses = ["hide-tail"];
				aligns = [data[3]];
			} else if (numSvgChildren === 2) {
				widthClasses = ["halfarrow-left", "halfarrow-right"];
				aligns = ["xMinYMin", "xMaxYMin"];
			} else if (numSvgChildren === 3) {
				widthClasses = [
					"brace-left",
					"brace-center",
					"brace-right"
				];
				aligns = [
					"xMinYMin",
					"xMidYMin",
					"xMaxYMin"
				];
			} else throw new Error("Correct katexImagesData or update code here to support\n                    " + numSvgChildren + " children.");
			for (var i = 0; i < numSvgChildren; i++) {
				var _svgNode = new SvgNode([new PathNode(paths[i])], {
					"width": "400em",
					"height": makeEm(_height2),
					"viewBox": "0 0 " + viewBoxWidth + " " + _viewBoxHeight,
					"preserveAspectRatio": aligns[i] + " slice"
				});
				var _span = makeSvgSpan([widthClasses[i]], [_svgNode], options);
				if (numSvgChildren === 1) return {
					span: _span,
					minWidth: _minWidth,
					height: _height2
				};
				else {
					_span.style.height = makeEm(_height2);
					spans.push(_span);
				}
			}
			return {
				span: makeSpan(["stretchy"], spans, options),
				minWidth: _minWidth,
				height: _height2
			};
		}
	}
	var { span, minWidth, height } = buildSvgSpan_();
	span.height = height;
	span.style.height = makeEm(height);
	if (minWidth > 0) span.style.minWidth = makeEm(minWidth);
	return span;
};
var stretchyEnclose = function stretchyEnclose(inner, label, topPad, bottomPad, options) {
	var img;
	var totalHeight = inner.height + inner.depth + topPad + bottomPad;
	if (/fbox|color|angl/.test(label)) {
		img = makeSpan(["stretchy", label], [], options);
		if (label === "fbox") {
			var color = options.color && options.getColor();
			if (color) img.style.borderColor = color;
		}
	} else {
		var lines = [];
		if (/^[bx]cancel$/.test(label)) lines.push(new LineNode({
			"x1": "0",
			"y1": "0",
			"x2": "100%",
			"y2": "100%",
			"stroke-width": "0.046em"
		}));
		if (/^x?cancel$/.test(label)) lines.push(new LineNode({
			"x1": "0",
			"y1": "100%",
			"x2": "100%",
			"y2": "0",
			"stroke-width": "0.046em"
		}));
		img = makeSvgSpan([], [new SvgNode(lines, {
			"width": "100%",
			"height": makeEm(totalHeight)
		})], options);
	}
	img.height = totalHeight;
	img.style.height = makeEm(totalHeight);
	return img;
};
/**
* Small module for atom-group constants and type guard.  Kept separate from
* `symbols.ts` so that consumers (notably `contrib/render-a11y-string`) can
* pull in `isAtom` without dragging in the ~870-line symbol tables.
*/
var ATOMS = {
	"bin": 1,
	"close": 1,
	"inner": 1,
	"open": 1,
	"punct": 1,
	"rel": 1
};
var NON_ATOMS = {
	"accent-token": 1,
	"mathord": 1,
	"op-token": 1,
	"spacing": 1,
	"textord": 1
};
function isAtom(value) {
	return value in ATOMS;
}
/**
* Asserts that the node is of the given type and returns it with stricter
* typing. Throws if the node's type does not match.
*/
function assertNodeType(node, type) {
	if (!node || node.type !== type) throw new Error("Expected node of type " + type + ", but got " + (node ? "node of type " + node.type : String(node)));
	return node;
}
/**
* Returns the node more strictly typed iff it is of the given type. Otherwise,
* returns null.
*/
function assertSymbolNodeType(node) {
	var typedNode = checkSymbolNodeType(node);
	if (!typedNode) throw new Error("Expected node of symbol group type, but got " + (node ? "node of type " + node.type : String(node)));
	return typedNode;
}
/**
* Returns the node more strictly typed iff it is of the given type. Otherwise,
* returns null.
*/
function checkSymbolNodeType(node) {
	if (node && (node.type === "atom" || NON_ATOMS.hasOwnProperty(node.type))) return node;
	return null;
}
var getBaseSymbol = (group) => {
	if (group instanceof SymbolNode) return group;
	if (hasHtmlDomChildren(group) && group.children.length === 1) return getBaseSymbol(group.children[0]);
};
var htmlBuilder$a = (grp, options) => {
	var base;
	var group;
	var supSubGroup;
	if (grp && grp.type === "supsub") {
		group = assertNodeType(grp.base, "accent");
		base = group.base;
		grp.base = base;
		supSubGroup = assertSpan(buildGroup$1(grp, options));
		grp.base = group;
	} else {
		group = assertNodeType(grp, "accent");
		base = group.base;
	}
	var body = buildGroup$1(base, options.havingCrampedStyle());
	var mustShift = group.isShifty && isCharacterBox(base);
	var skew = 0;
	if (mustShift) {
		var _getBaseSymbol$skew, _getBaseSymbol;
		skew = (_getBaseSymbol$skew = (_getBaseSymbol = getBaseSymbol(body)) == null ? void 0 : _getBaseSymbol.skew) != null ? _getBaseSymbol$skew : 0;
	}
	var accentBelow = group.label === "\\c";
	var clearance = accentBelow ? body.height + body.depth : Math.min(body.height, options.fontMetrics().xHeight);
	var accentBody;
	if (!group.isStretchy) {
		var accent;
		var width;
		if (group.label === "\\vec") {
			accent = staticSvg("vec", options);
			width = svgData.vec[1];
		} else {
			accent = makeOrd({
				type: "textord",
				mode: group.mode,
				text: group.label
			}, options, "textord");
			accent = assertSymbolDomNode(accent);
			accent.italic = 0;
			width = accent.width;
			if (accentBelow) clearance += accent.depth;
		}
		accentBody = makeSpan(["accent-body"], [accent]);
		var accentFull = group.label === "\\textcircled";
		if (accentFull) {
			accentBody.classes.push("accent-full");
			clearance = body.height;
		}
		var left = skew;
		if (!accentFull) left -= width / 2;
		accentBody.style.left = makeEm(left);
		if (group.label === "\\textcircled") accentBody.style.top = ".2em";
		accentBody = makeVList({
			positionType: "firstBaseline",
			children: [
				{
					type: "elem",
					elem: body
				},
				{
					type: "kern",
					size: -clearance
				},
				{
					type: "elem",
					elem: accentBody
				}
			]
		});
	} else {
		accentBody = stretchySvg(group, options);
		accentBody = makeVList({
			positionType: "firstBaseline",
			children: [{
				type: "elem",
				elem: body
			}, {
				type: "elem",
				elem: accentBody,
				wrapperClasses: ["svg-align"],
				wrapperStyle: skew > 0 ? {
					width: "calc(100% - " + makeEm(2 * skew) + ")",
					marginLeft: makeEm(2 * skew)
				} : void 0
			}]
		});
	}
	var accentWrap = makeSpan(["mord", "accent"], [accentBody], options);
	if (supSubGroup) {
		supSubGroup.children[0] = accentWrap;
		supSubGroup.height = Math.max(accentWrap.height, supSubGroup.height);
		supSubGroup.classes[0] = "mord";
		return supSubGroup;
	} else return accentWrap;
};
var mathmlBuilder$9 = (group, options) => {
	var accentNode = group.isStretchy ? stretchyMathML(group.label) : new MathNode("mo", [makeText(group.label, group.mode)]);
	var node = new MathNode("mover", [buildGroup(group.base, options), accentNode]);
	node.setAttribute("accent", "true");
	return node;
};
var NON_STRETCHY_ACCENT_REGEX = new RegExp([
	"\\acute",
	"\\grave",
	"\\ddot",
	"\\tilde",
	"\\bar",
	"\\breve",
	"\\check",
	"\\hat",
	"\\vec",
	"\\dot",
	"\\mathring"
].map((accent) => "\\" + accent).join("|"));
defineFunction({
	type: "accent",
	names: [
		"\\acute",
		"\\grave",
		"\\ddot",
		"\\tilde",
		"\\bar",
		"\\breve",
		"\\check",
		"\\hat",
		"\\vec",
		"\\dot",
		"\\mathring",
		"\\widecheck",
		"\\widehat",
		"\\widetilde",
		"\\overrightarrow",
		"\\overleftarrow",
		"\\Overrightarrow",
		"\\overleftrightarrow",
		"\\overgroup",
		"\\overlinesegment",
		"\\overleftharpoon",
		"\\overrightharpoon"
	],
	props: { numArgs: 1 },
	handler: (context, args) => {
		var base = normalizeArgument(args[0]);
		var isStretchy = !NON_STRETCHY_ACCENT_REGEX.test(context.funcName);
		var isShifty = !isStretchy || context.funcName === "\\widehat" || context.funcName === "\\widetilde" || context.funcName === "\\widecheck";
		return {
			type: "accent",
			mode: context.parser.mode,
			label: context.funcName,
			isStretchy,
			isShifty,
			base
		};
	},
	htmlBuilder: htmlBuilder$a,
	mathmlBuilder: mathmlBuilder$9
});
defineFunction({
	type: "accent",
	names: [
		"\\'",
		"\\`",
		"\\^",
		"\\~",
		"\\=",
		"\\u",
		"\\.",
		"\\\"",
		"\\c",
		"\\r",
		"\\H",
		"\\v",
		"\\textcircled"
	],
	props: {
		numArgs: 1,
		allowedInText: true,
		allowedInMath: true,
		argTypes: ["primitive"]
	},
	handler: (context, args) => {
		var base = args[0];
		var mode = context.parser.mode;
		if (mode === "math") {
			context.parser.settings.reportNonstrict("mathVsTextAccents", "LaTeX's accent " + context.funcName + " works only in text mode");
			mode = "text";
		}
		return {
			type: "accent",
			mode,
			label: context.funcName,
			isStretchy: false,
			isShifty: true,
			base
		};
	},
	htmlBuilder: htmlBuilder$a,
	mathmlBuilder: mathmlBuilder$9
});
defineFunction({
	type: "accentUnder",
	names: [
		"\\underleftarrow",
		"\\underrightarrow",
		"\\underleftrightarrow",
		"\\undergroup",
		"\\underlinesegment",
		"\\utilde"
	],
	props: { numArgs: 1 },
	handler: (_ref, args) => {
		var { parser, funcName } = _ref;
		var base = args[0];
		return {
			type: "accentUnder",
			mode: parser.mode,
			label: funcName,
			base
		};
	},
	htmlBuilder: (group, options) => {
		var innerGroup = buildGroup$1(group.base, options);
		var accentBody = stretchySvg(group, options);
		var kern = group.label === "\\utilde" ? .12 : 0;
		return makeSpan(["mord", "accentunder"], [makeVList({
			positionType: "top",
			positionData: innerGroup.height,
			children: [
				{
					type: "elem",
					elem: accentBody,
					wrapperClasses: ["svg-align"]
				},
				{
					type: "kern",
					size: kern
				},
				{
					type: "elem",
					elem: innerGroup
				}
			]
		})], options);
	},
	mathmlBuilder: (group, options) => {
		var accentNode = stretchyMathML(group.label);
		var node = new MathNode("munder", [buildGroup(group.base, options), accentNode]);
		node.setAttribute("accentunder", "true");
		return node;
	}
});
var paddedNode = (group) => {
	var node = new MathNode("mpadded", group ? [group] : []);
	node.setAttribute("width", "+0.6em");
	node.setAttribute("lspace", "0.3em");
	return node;
};
defineFunction({
	type: "xArrow",
	names: [
		"\\xleftarrow",
		"\\xrightarrow",
		"\\xLeftarrow",
		"\\xRightarrow",
		"\\xleftrightarrow",
		"\\xLeftrightarrow",
		"\\xhookleftarrow",
		"\\xhookrightarrow",
		"\\xmapsto",
		"\\xrightharpoondown",
		"\\xrightharpoonup",
		"\\xleftharpoondown",
		"\\xleftharpoonup",
		"\\xrightleftharpoons",
		"\\xleftrightharpoons",
		"\\xlongequal",
		"\\xtwoheadrightarrow",
		"\\xtwoheadleftarrow",
		"\\xtofrom",
		"\\xrightleftarrows",
		"\\xrightequilibrium",
		"\\xleftequilibrium",
		"\\\\cdrightarrow",
		"\\\\cdleftarrow",
		"\\\\cdlongequal"
	],
	props: {
		numArgs: 1,
		numOptionalArgs: 1
	},
	handler(_ref, args, optArgs) {
		var { parser, funcName } = _ref;
		return {
			type: "xArrow",
			mode: parser.mode,
			label: funcName,
			body: args[0],
			below: optArgs[0]
		};
	},
	htmlBuilder(group, options) {
		var style = options.style;
		var newOptions = options.havingStyle(style.sup());
		var upperGroup = wrapFragment(buildGroup$1(group.body, newOptions, options), options);
		var arrowPrefix = group.label.slice(0, 2) === "\\x" ? "x" : "cd";
		upperGroup.classes.push(arrowPrefix + "-arrow-pad");
		var lowerGroup;
		if (group.below) {
			newOptions = options.havingStyle(style.sub());
			lowerGroup = wrapFragment(buildGroup$1(group.below, newOptions, options), options);
			lowerGroup.classes.push(arrowPrefix + "-arrow-pad");
		}
		var arrowBody = stretchySvg(group, options);
		var arrowShift = -options.fontMetrics().axisHeight + .5 * arrowBody.height;
		var upperShift = -options.fontMetrics().axisHeight - .5 * arrowBody.height - .111;
		if (upperGroup.depth > .25 || group.label === "\\xleftequilibrium") upperShift -= upperGroup.depth;
		var vlist;
		if (lowerGroup) {
			var lowerShift = -options.fontMetrics().axisHeight + lowerGroup.height + .5 * arrowBody.height + .111;
			vlist = makeVList({
				positionType: "individualShift",
				children: [
					{
						type: "elem",
						elem: upperGroup,
						shift: upperShift
					},
					{
						type: "elem",
						elem: arrowBody,
						shift: arrowShift,
						wrapperClasses: ["svg-align"]
					},
					{
						type: "elem",
						elem: lowerGroup,
						shift: lowerShift
					}
				]
			});
		} else vlist = makeVList({
			positionType: "individualShift",
			children: [{
				type: "elem",
				elem: upperGroup,
				shift: upperShift
			}, {
				type: "elem",
				elem: arrowBody,
				shift: arrowShift,
				wrapperClasses: ["svg-align"]
			}]
		});
		return makeSpan(["mrel", "x-arrow"], [vlist], options);
	},
	mathmlBuilder(group, options) {
		var arrowNode = stretchyMathML(group.label);
		arrowNode.setAttribute("minsize", group.label.charAt(0) === "x" ? "1.75em" : "3.0em");
		var node;
		if (group.body) {
			var upperNode = paddedNode(buildGroup(group.body, options));
			if (group.below) node = new MathNode("munderover", [
				arrowNode,
				paddedNode(buildGroup(group.below, options)),
				upperNode
			]);
			else node = new MathNode("mover", [arrowNode, upperNode]);
		} else if (group.below) node = new MathNode("munder", [arrowNode, paddedNode(buildGroup(group.below, options))]);
		else {
			node = paddedNode();
			node = new MathNode("mover", [arrowNode, node]);
		}
		return node;
	}
});
function htmlBuilder$9(group, options) {
	var elements = buildExpression$1(group.body, options, true);
	return makeSpan([group.mclass], elements, options);
}
function mathmlBuilder$8(group, options) {
	var node;
	var inner = buildExpression(group.body, options);
	if (group.mclass === "minner") node = new MathNode("mpadded", inner);
	else if (group.mclass === "mord") {
		if (group.isCharacterBox) {
			node = inner[0];
			node.type = "mi";
		} else node = new MathNode("mi", inner);
	} else {
		if (group.isCharacterBox) {
			node = inner[0];
			node.type = "mo";
		} else node = new MathNode("mo", inner);
		if (group.mclass === "mbin") {
			node.attributes.lspace = "0.22em";
			node.attributes.rspace = "0.22em";
		} else if (group.mclass === "mpunct") {
			node.attributes.lspace = "0em";
			node.attributes.rspace = "0.17em";
		} else if (group.mclass === "mopen" || group.mclass === "mclose") {
			node.attributes.lspace = "0em";
			node.attributes.rspace = "0em";
		} else if (group.mclass === "minner") {
			node.attributes.lspace = "0.0556em";
			node.attributes.width = "+0.1111em";
		}
	}
	return node;
}
defineFunction({
	type: "mclass",
	names: [
		"\\mathord",
		"\\mathbin",
		"\\mathrel",
		"\\mathopen",
		"\\mathclose",
		"\\mathpunct",
		"\\mathinner"
	],
	props: {
		numArgs: 1,
		primitive: true
	},
	handler(_ref, args) {
		var { parser, funcName } = _ref;
		var body = args[0];
		return {
			type: "mclass",
			mode: parser.mode,
			mclass: "m" + funcName.slice(5),
			body: ordargument(body),
			isCharacterBox: isCharacterBox(body)
		};
	},
	htmlBuilder: htmlBuilder$9,
	mathmlBuilder: mathmlBuilder$8
});
var binrelClass = (arg) => {
	var atom = arg.type === "ordgroup" && arg.body.length ? arg.body[0] : arg;
	if (atom.type === "atom" && (atom.family === "bin" || atom.family === "rel")) return "m" + atom.family;
	else return "mord";
};
defineFunction({
	type: "mclass",
	names: ["\\@binrel"],
	props: { numArgs: 2 },
	handler(_ref2, args) {
		var { parser } = _ref2;
		return {
			type: "mclass",
			mode: parser.mode,
			mclass: binrelClass(args[0]),
			body: ordargument(args[1]),
			isCharacterBox: isCharacterBox(args[1])
		};
	}
});
defineFunction({
	type: "mclass",
	names: [
		"\\stackrel",
		"\\overset",
		"\\underset"
	],
	props: { numArgs: 2 },
	handler(_ref3, args) {
		var { parser, funcName } = _ref3;
		var baseArg = args[1];
		var shiftedArg = args[0];
		var mclass;
		if (funcName !== "\\stackrel") mclass = binrelClass(baseArg);
		else mclass = "mrel";
		var baseOp = {
			type: "op",
			mode: baseArg.mode,
			limits: true,
			alwaysHandleSupSub: true,
			parentIsSupSub: false,
			symbol: false,
			suppressBaseShift: funcName !== "\\stackrel",
			body: ordargument(baseArg)
		};
		var supsub = {
			type: "supsub",
			mode: shiftedArg.mode,
			base: baseOp,
			sup: funcName === "\\underset" ? null : shiftedArg,
			sub: funcName === "\\underset" ? shiftedArg : null
		};
		return {
			type: "mclass",
			mode: parser.mode,
			mclass,
			body: [supsub],
			isCharacterBox: isCharacterBox(supsub)
		};
	},
	htmlBuilder: htmlBuilder$9,
	mathmlBuilder: mathmlBuilder$8
});
defineFunction({
	type: "pmb",
	names: ["\\pmb"],
	props: {
		numArgs: 1,
		allowedInText: true
	},
	handler(_ref, args) {
		var { parser } = _ref;
		return {
			type: "pmb",
			mode: parser.mode,
			mclass: binrelClass(args[0]),
			body: ordargument(args[0])
		};
	},
	htmlBuilder(group, options) {
		var elements = buildExpression$1(group.body, options, true);
		var node = makeSpan([group.mclass], elements, options);
		node.style.textShadow = "0.02em 0.01em 0.04px";
		return node;
	},
	mathmlBuilder(group, style) {
		var node = new MathNode("mstyle", buildExpression(group.body, style));
		node.setAttribute("style", "text-shadow: 0.02em 0.01em 0.04px");
		return node;
	}
});
var cdArrowFunctionName = {
	">": "\\\\cdrightarrow",
	"<": "\\\\cdleftarrow",
	"=": "\\\\cdlongequal",
	"A": "\\uparrow",
	"V": "\\downarrow",
	"|": "\\Vert",
	".": "no arrow"
};
var newCell = () => {
	return {
		type: "styling",
		body: [],
		mode: "math",
		style: "display",
		resetFont: true
	};
};
var isStartOfArrow = (node) => {
	return node.type === "textord" && node.text === "@";
};
var isLabelEnd = (node, endChar) => {
	return (node.type === "mathord" || node.type === "atom") && node.text === endChar;
};
function cdArrow(arrowChar, labels, parser) {
	var funcName = cdArrowFunctionName[arrowChar];
	switch (funcName) {
		case "\\\\cdrightarrow":
		case "\\\\cdleftarrow": return parser.callFunction(funcName, [labels[0]], [labels[1]]);
		case "\\uparrow":
		case "\\downarrow":
			var leftLabel = parser.callFunction("\\\\cdleft", [labels[0]], []);
			var bareArrow = {
				type: "atom",
				text: funcName,
				mode: "math",
				family: "rel"
			};
			var arrowGroup = {
				type: "ordgroup",
				mode: "math",
				body: [
					leftLabel,
					parser.callFunction("\\Big", [bareArrow], []),
					parser.callFunction("\\\\cdright", [labels[1]], [])
				]
			};
			return parser.callFunction("\\\\cdparent", [arrowGroup], []);
		case "\\\\cdlongequal": return parser.callFunction("\\\\cdlongequal", [], []);
		case "\\Vert": return parser.callFunction("\\Big", [{
			type: "textord",
			text: "\\Vert",
			mode: "math"
		}], []);
		default: return {
			type: "textord",
			text: " ",
			mode: "math"
		};
	}
}
function parseCD(parser) {
	var parsedRows = [];
	parser.gullet.beginGroup();
	parser.gullet.macros.set("\\cr", "\\\\\\relax");
	parser.gullet.beginGroup();
	while (true) {
		parsedRows.push(parser.parseExpression(false, "\\\\"));
		parser.gullet.endGroup();
		parser.gullet.beginGroup();
		var next = parser.fetch().text;
		if (next === "&" || next === "\\\\") parser.consume();
		else if (next === "\\end") {
			if (parsedRows[parsedRows.length - 1].length === 0) parsedRows.pop();
			break;
		} else throw new ParseError("Expected \\\\ or \\cr or \\end", parser.nextToken);
	}
	var row = [];
	var body = [row];
	for (var i = 0; i < parsedRows.length; i++) {
		var rowNodes = parsedRows[i];
		var cell = newCell();
		for (var j = 0; j < rowNodes.length; j++) if (!isStartOfArrow(rowNodes[j])) cell.body.push(rowNodes[j]);
		else {
			row.push(cell);
			j += 1;
			var arrowChar = assertSymbolNodeType(rowNodes[j]).text;
			var labels = new Array(2);
			labels[0] = {
				type: "ordgroup",
				mode: "math",
				body: []
			};
			labels[1] = {
				type: "ordgroup",
				mode: "math",
				body: []
			};
			if ("=|.".includes(arrowChar));
			else if ("<>AV".includes(arrowChar)) for (var labelNum = 0; labelNum < 2; labelNum++) {
				var inLabel = true;
				for (var k = j + 1; k < rowNodes.length; k++) {
					if (isLabelEnd(rowNodes[k], arrowChar)) {
						inLabel = false;
						j = k;
						break;
					}
					if (isStartOfArrow(rowNodes[k])) throw new ParseError("Missing a " + arrowChar + " character to complete a CD arrow.", rowNodes[k]);
					labels[labelNum].body.push(rowNodes[k]);
				}
				if (inLabel) throw new ParseError("Missing a " + arrowChar + " character to complete a CD arrow.", rowNodes[j]);
			}
			else throw new ParseError("Expected one of \"<>AV=|.\" after @", rowNodes[j]);
			var wrappedArrow = {
				type: "styling",
				body: [cdArrow(arrowChar, labels, parser)],
				mode: "math",
				style: "display",
				resetFont: true
			};
			row.push(wrappedArrow);
			cell = newCell();
		}
		if (i % 2 === 0) row.push(cell);
		else row.shift();
		row = [];
		body.push(row);
	}
	parser.gullet.endGroup();
	parser.gullet.endGroup();
	return {
		type: "array",
		mode: "math",
		body,
		arraystretch: 1,
		addJot: true,
		rowGaps: [null],
		cols: new Array(body[0].length).fill({
			type: "align",
			align: "c",
			pregap: .25,
			postgap: .25
		}),
		colSeparationType: "CD",
		hLinesBeforeRow: new Array(body.length + 1).fill([])
	};
}
defineFunction({
	type: "cdlabel",
	names: ["\\\\cdleft", "\\\\cdright"],
	props: { numArgs: 1 },
	handler(_ref, args) {
		var { parser, funcName } = _ref;
		return {
			type: "cdlabel",
			mode: parser.mode,
			side: funcName.slice(4),
			label: args[0]
		};
	},
	htmlBuilder(group, options) {
		var newOptions = options.havingStyle(options.style.sup());
		var label = wrapFragment(buildGroup$1(group.label, newOptions, options), options);
		label.classes.push("cd-label-" + group.side);
		label.style.bottom = makeEm(.8 - label.depth);
		label.height = 0;
		label.depth = 0;
		return label;
	},
	mathmlBuilder(group, options) {
		var label = new MathNode("mrow", [buildGroup(group.label, options)]);
		label = new MathNode("mpadded", [label]);
		label.setAttribute("width", "0");
		if (group.side === "left") label.setAttribute("lspace", "-1width");
		label.setAttribute("voffset", "0.7em");
		label = new MathNode("mstyle", [label]);
		label.setAttribute("displaystyle", "false");
		label.setAttribute("scriptlevel", "1");
		return label;
	}
});
defineFunction({
	type: "cdlabelparent",
	names: ["\\\\cdparent"],
	props: { numArgs: 1 },
	handler(_ref2, args) {
		var { parser } = _ref2;
		return {
			type: "cdlabelparent",
			mode: parser.mode,
			fragment: args[0]
		};
	},
	htmlBuilder(group, options) {
		var parent = wrapFragment(buildGroup$1(group.fragment, options), options);
		parent.classes.push("cd-vert-arrow");
		return parent;
	},
	mathmlBuilder(group, options) {
		return new MathNode("mrow", [buildGroup(group.fragment, options)]);
	}
});
defineFunction({
	type: "textord",
	names: ["\\@char"],
	props: {
		numArgs: 1,
		allowedInText: true
	},
	handler(_ref, args) {
		var { parser } = _ref;
		var group = assertNodeType(args[0], "ordgroup").body;
		var number = "";
		for (var i = 0; i < group.length; i++) {
			var node = assertNodeType(group[i], "textord");
			number += node.text;
		}
		var code = parseInt(number);
		var text;
		if (isNaN(code)) throw new ParseError("\\@char has non-numeric argument " + number);
		else if (code < 0 || code >= 1114111) throw new ParseError("\\@char with invalid code point " + number);
		else if (code <= 65535) text = String.fromCharCode(code);
		else {
			code -= 65536;
			text = String.fromCharCode((code >> 10) + 55296, (code & 1023) + 56320);
		}
		return {
			type: "textord",
			mode: parser.mode,
			text
		};
	}
});
var htmlBuilder$8 = (group, options) => {
	return makeFragment(buildExpression$1(group.body, options.withColor(group.color), false));
};
var mathmlBuilder$7 = (group, options) => {
	var node = new MathNode("mstyle", buildExpression(group.body, options.withColor(group.color)));
	node.setAttribute("mathcolor", group.color);
	return node;
};
defineFunction({
	type: "color",
	names: ["\\textcolor"],
	props: {
		numArgs: 2,
		allowedInText: true,
		argTypes: ["color", "original"]
	},
	handler(_ref, args) {
		var { parser } = _ref;
		var color = assertNodeType(args[0], "color-token").color;
		var body = args[1];
		return {
			type: "color",
			mode: parser.mode,
			color,
			body: ordargument(body)
		};
	},
	htmlBuilder: htmlBuilder$8,
	mathmlBuilder: mathmlBuilder$7
});
defineFunction({
	type: "color",
	names: ["\\color"],
	props: {
		numArgs: 1,
		allowedInText: true,
		argTypes: ["color"]
	},
	handler(_ref2, args) {
		var { parser, breakOnTokenText } = _ref2;
		var color = assertNodeType(args[0], "color-token").color;
		parser.gullet.macros.set("\\current@color", color);
		var body = parser.parseExpression(true, breakOnTokenText);
		return {
			type: "color",
			mode: parser.mode,
			color,
			body
		};
	},
	htmlBuilder: htmlBuilder$8,
	mathmlBuilder: mathmlBuilder$7
});
defineFunction({
	type: "cr",
	names: ["\\\\"],
	props: {
		numArgs: 0,
		numOptionalArgs: 0,
		allowedInText: true
	},
	handler(_ref, args, optArgs) {
		var { parser } = _ref;
		var size = parser.gullet.future().text === "[" ? parser.parseSizeGroup(true) : null;
		var newLine = !parser.settings.displayMode || !parser.settings.useStrictBehavior("newLineInDisplayMode", "In LaTeX, \\\\ or \\newline does nothing in display mode");
		return {
			type: "cr",
			mode: parser.mode,
			newLine,
			size: size && assertNodeType(size, "size").value
		};
	},
	htmlBuilder(group, options) {
		var span = makeSpan(["mspace"], [], options);
		if (group.newLine) {
			span.classes.push("newline");
			if (group.size) span.style.marginTop = makeEm(calculateSize(group.size, options));
		}
		return span;
	},
	mathmlBuilder(group, options) {
		var node = new MathNode("mspace");
		if (group.newLine) {
			node.setAttribute("linebreak", "newline");
			if (group.size) node.setAttribute("height", makeEm(calculateSize(group.size, options)));
		}
		return node;
	}
});
var globalMap = {
	"\\global": "\\global",
	"\\long": "\\\\globallong",
	"\\\\globallong": "\\\\globallong",
	"\\def": "\\gdef",
	"\\gdef": "\\gdef",
	"\\edef": "\\xdef",
	"\\xdef": "\\xdef",
	"\\let": "\\\\globallet",
	"\\futurelet": "\\\\globalfuture"
};
var checkControlSequence = (tok) => {
	var name = tok.text;
	if (/^(?:[\\{}$&#^_]|EOF)$/.test(name)) throw new ParseError("Expected a control sequence", tok);
	return name;
};
var getRHS = (parser) => {
	var tok = parser.gullet.popToken();
	if (tok.text === "=") {
		tok = parser.gullet.popToken();
		if (tok.text === " ") tok = parser.gullet.popToken();
	}
	return tok;
};
var letCommand = (parser, name, tok, global) => {
	var macro = parser.gullet.macros.get(tok.text);
	if (macro == null) {
		tok.noexpand = true;
		macro = {
			tokens: [tok],
			numArgs: 0,
			unexpandable: !parser.gullet.isExpandable(tok.text)
		};
	}
	parser.gullet.macros.set(name, macro, global);
};
defineFunction({
	type: "internal",
	names: [
		"\\global",
		"\\long",
		"\\\\globallong"
	],
	props: {
		numArgs: 0,
		allowedInText: true
	},
	handler(_ref) {
		var { parser, funcName } = _ref;
		parser.consumeSpaces();
		var token = parser.fetch();
		if (globalMap[token.text]) {
			if (funcName === "\\global" || funcName === "\\\\globallong") token.text = globalMap[token.text];
			return assertNodeType(parser.parseFunction(), "internal");
		}
		throw new ParseError("Invalid token after macro prefix", token);
	}
});
defineFunction({
	type: "internal",
	names: [
		"\\def",
		"\\gdef",
		"\\edef",
		"\\xdef"
	],
	props: {
		numArgs: 0,
		allowedInText: true,
		primitive: true
	},
	handler(_ref2) {
		var { parser, funcName } = _ref2;
		var tok = parser.gullet.popToken();
		var name = tok.text;
		if (/^(?:[\\{}$&#^_]|EOF)$/.test(name)) throw new ParseError("Expected a control sequence", tok);
		var numArgs = 0;
		var insert;
		var delimiters = [[]];
		while (parser.gullet.future().text !== "{") {
			tok = parser.gullet.popToken();
			if (tok.text === "#") {
				if (parser.gullet.future().text === "{") {
					insert = parser.gullet.future();
					delimiters[numArgs].push("{");
					break;
				}
				tok = parser.gullet.popToken();
				if (!/^[1-9]$/.test(tok.text)) throw new ParseError("Invalid argument number \"" + tok.text + "\"");
				if (parseInt(tok.text) !== numArgs + 1) throw new ParseError("Argument number \"" + tok.text + "\" out of order");
				numArgs++;
				delimiters.push([]);
			} else if (tok.text === "EOF") throw new ParseError("Expected a macro definition");
			else delimiters[numArgs].push(tok.text);
		}
		var { tokens } = parser.gullet.consumeArg();
		if (insert) tokens.unshift(insert);
		if (funcName === "\\edef" || funcName === "\\xdef") {
			tokens = parser.gullet.expandTokens(tokens);
			tokens.reverse();
		}
		parser.gullet.macros.set(name, {
			tokens,
			numArgs,
			delimiters
		}, funcName === globalMap[funcName]);
		return {
			type: "internal",
			mode: parser.mode
		};
	}
});
defineFunction({
	type: "internal",
	names: ["\\let", "\\\\globallet"],
	props: {
		numArgs: 0,
		allowedInText: true,
		primitive: true
	},
	handler(_ref3) {
		var { parser, funcName } = _ref3;
		var name = checkControlSequence(parser.gullet.popToken());
		parser.gullet.consumeSpaces();
		letCommand(parser, name, getRHS(parser), funcName === "\\\\globallet");
		return {
			type: "internal",
			mode: parser.mode
		};
	}
});
defineFunction({
	type: "internal",
	names: ["\\futurelet", "\\\\globalfuture"],
	props: {
		numArgs: 0,
		allowedInText: true,
		primitive: true
	},
	handler(_ref4) {
		var { parser, funcName } = _ref4;
		var name = checkControlSequence(parser.gullet.popToken());
		var middle = parser.gullet.popToken();
		var tok = parser.gullet.popToken();
		letCommand(parser, name, tok, funcName === "\\\\globalfuture");
		parser.gullet.pushToken(tok);
		parser.gullet.pushToken(middle);
		return {
			type: "internal",
			mode: parser.mode
		};
	}
});
/**
* This file deals with creating delimiters of various sizes. The TeXbook
* discusses these routines on page 441-442, in the "Another subroutine sets box
* x to a specified variable delimiter" paragraph.
*
* There are three main routines here. `makeSmallDelim` makes a delimiter in the
* normal font, but in either text, script, or scriptscript style.
* `makeLargeDelim` makes a delimiter in textstyle, but in one of the Size1,
* Size2, Size3, or Size4 fonts. `makeStackedDelim` makes a delimiter out of
* smaller pieces that are stacked on top of one another.
*
* The functions take a parameter `center`, which determines if the delimiter
* should be centered around the axis.
*
* Then, there are three exposed functions. `sizedDelim` makes a delimiter in
* one of the given sizes. This is used for things like `\bigl`.
* `customSizedDelim` makes a delimiter with a given total height+depth. It is
* called in places like `\sqrt`. `leftRightDelim` makes an appropriate
* delimiter which surrounds an expression of a given height an depth. It is
* used in `\left` and `\right`.
*/
/**
* Get the metrics for a given symbol and font, after transformation (i.e.
* after following replacement from symbols.js)
*/
var getMetrics = function getMetrics(symbol, font, mode) {
	var metrics = getCharacterMetrics(symbols.math[symbol] && symbols.math[symbol].replace || symbol, font, mode);
	if (!metrics) throw new Error("Unsupported symbol " + symbol + " and font size " + font + ".");
	return metrics;
};
/**
* Puts a delimiter span in a given style, and adds appropriate height, depth,
* and maxFontSizes.
*/
var styleWrap = function styleWrap(delim, toStyle, options, classes) {
	var newOptions = options.havingBaseStyle(toStyle);
	var span = makeSpan(classes.concat(newOptions.sizingClasses(options)), [delim], options);
	var delimSizeMultiplier = newOptions.sizeMultiplier / options.sizeMultiplier;
	span.height *= delimSizeMultiplier;
	span.depth *= delimSizeMultiplier;
	span.maxFontSize = newOptions.sizeMultiplier;
	return span;
};
var centerSpan = function centerSpan(span, options, style) {
	var newOptions = options.havingBaseStyle(style);
	var shift = (1 - options.sizeMultiplier / newOptions.sizeMultiplier) * options.fontMetrics().axisHeight;
	span.classes.push("delimcenter");
	span.style.top = makeEm(shift);
	span.height -= shift;
	span.depth += shift;
};
/**
* Makes a small delimiter. This is a delimiter that comes in the Main-Regular
* font, but is restyled to either be in textstyle, scriptstyle, or
* scriptscriptstyle.
*/
var makeSmallDelim = function makeSmallDelim(delim, style, center, options, mode, classes) {
	var span = styleWrap(makeSymbol(delim, "Main-Regular", mode, options), style, options, classes);
	if (center) centerSpan(span, options, style);
	return span;
};
/**
* Builds a symbol in the given font size (note size is an integer)
*/
var mathrmSize = function mathrmSize(value, size, mode, options) {
	return makeSymbol(value, "Size" + size + "-Regular", mode, options);
};
/**
* Makes a large delimiter. This is a delimiter that comes in the Size1, Size2,
* Size3, or Size4 fonts. It is always rendered in textstyle.
*/
var makeLargeDelim = function makeLargeDelim(delim, size, center, options, mode, classes) {
	var inner = mathrmSize(delim, size, mode, options);
	var span = styleWrap(makeSpan(["delimsizing", "size" + size], [inner], options), Style$1.TEXT, options, classes);
	if (center) centerSpan(span, options, Style$1.TEXT);
	return span;
};
/**
* Make a span from a font glyph with the given offset and in the given font.
* This is used in makeStackedDelim to make the stacking pieces for the delimiter.
*/
var makeGlyphSpan = function makeGlyphSpan(symbol, font, mode) {
	var sizeClass;
	if (font === "Size1-Regular") sizeClass = "delim-size1";
	else sizeClass = "delim-size4";
	return {
		type: "elem",
		elem: makeSpan(["delimsizinginner", sizeClass], [makeSpan([], [makeSymbol(symbol, font, mode)])])
	};
};
var makeInner = function makeInner(ch, height, options) {
	var width = fontMetricsData["Size4-Regular"][ch.charCodeAt(0)] ? fontMetricsData["Size4-Regular"][ch.charCodeAt(0)][4] : fontMetricsData["Size1-Regular"][ch.charCodeAt(0)][4];
	var span = makeSvgSpan([], [new SvgNode([new PathNode("inner", innerPath(ch, Math.round(1e3 * height)))], {
		"width": makeEm(width),
		"height": makeEm(height),
		"style": "width:" + makeEm(width),
		"viewBox": "0 0 " + 1e3 * width + " " + Math.round(1e3 * height),
		"preserveAspectRatio": "xMinYMin"
	})], options);
	span.height = height;
	span.style.height = makeEm(height);
	span.style.width = makeEm(width);
	return {
		type: "elem",
		elem: span
	};
};
var lapInEms = .008;
var lap = {
	type: "kern",
	size: -1 * lapInEms
};
var verts = /* @__PURE__ */ new Set([
	"|",
	"\\lvert",
	"\\rvert",
	"\\vert"
]);
var doubleVerts = /* @__PURE__ */ new Set([
	"\\|",
	"\\lVert",
	"\\rVert",
	"\\Vert"
]);
/**
* Make a stacked delimiter out of a given delimiter, with the total height at
* least `heightTotal`. This routine is mentioned on page 442 of the TeXbook.
*/
var makeStackedDelim = function makeStackedDelim(delim, heightTotal, center, options, mode, classes) {
	var top;
	var middle;
	var repeat;
	var bottom;
	var svgLabel = "";
	var viewBoxWidth = 0;
	top = repeat = bottom = delim;
	middle = null;
	var font = "Size1-Regular";
	if (delim === "\\uparrow") repeat = bottom = "⏐";
	else if (delim === "\\Uparrow") repeat = bottom = "‖";
	else if (delim === "\\downarrow") top = repeat = "⏐";
	else if (delim === "\\Downarrow") top = repeat = "‖";
	else if (delim === "\\updownarrow") {
		top = "\\uparrow";
		repeat = "⏐";
		bottom = "\\downarrow";
	} else if (delim === "\\Updownarrow") {
		top = "\\Uparrow";
		repeat = "‖";
		bottom = "\\Downarrow";
	} else if (verts.has(delim)) {
		repeat = "∣";
		svgLabel = "vert";
		viewBoxWidth = 333;
	} else if (doubleVerts.has(delim)) {
		repeat = "∥";
		svgLabel = "doublevert";
		viewBoxWidth = 556;
	} else if (delim === "[" || delim === "\\lbrack") {
		top = "⎡";
		repeat = "⎢";
		bottom = "⎣";
		font = "Size4-Regular";
		svgLabel = "lbrack";
		viewBoxWidth = 667;
	} else if (delim === "]" || delim === "\\rbrack") {
		top = "⎤";
		repeat = "⎥";
		bottom = "⎦";
		font = "Size4-Regular";
		svgLabel = "rbrack";
		viewBoxWidth = 667;
	} else if (delim === "\\lfloor" || delim === "⌊") {
		repeat = top = "⎢";
		bottom = "⎣";
		font = "Size4-Regular";
		svgLabel = "lfloor";
		viewBoxWidth = 667;
	} else if (delim === "\\lceil" || delim === "⌈") {
		top = "⎡";
		repeat = bottom = "⎢";
		font = "Size4-Regular";
		svgLabel = "lceil";
		viewBoxWidth = 667;
	} else if (delim === "\\rfloor" || delim === "⌋") {
		repeat = top = "⎥";
		bottom = "⎦";
		font = "Size4-Regular";
		svgLabel = "rfloor";
		viewBoxWidth = 667;
	} else if (delim === "\\rceil" || delim === "⌉") {
		top = "⎤";
		repeat = bottom = "⎥";
		font = "Size4-Regular";
		svgLabel = "rceil";
		viewBoxWidth = 667;
	} else if (delim === "(" || delim === "\\lparen") {
		top = "⎛";
		repeat = "⎜";
		bottom = "⎝";
		font = "Size4-Regular";
		svgLabel = "lparen";
		viewBoxWidth = 875;
	} else if (delim === ")" || delim === "\\rparen") {
		top = "⎞";
		repeat = "⎟";
		bottom = "⎠";
		font = "Size4-Regular";
		svgLabel = "rparen";
		viewBoxWidth = 875;
	} else if (delim === "\\{" || delim === "\\lbrace") {
		top = "⎧";
		middle = "⎨";
		bottom = "⎩";
		repeat = "⎪";
		font = "Size4-Regular";
	} else if (delim === "\\}" || delim === "\\rbrace") {
		top = "⎫";
		middle = "⎬";
		bottom = "⎭";
		repeat = "⎪";
		font = "Size4-Regular";
	} else if (delim === "\\lgroup" || delim === "⟮") {
		top = "⎧";
		bottom = "⎩";
		repeat = "⎪";
		font = "Size4-Regular";
	} else if (delim === "\\rgroup" || delim === "⟯") {
		top = "⎫";
		bottom = "⎭";
		repeat = "⎪";
		font = "Size4-Regular";
	} else if (delim === "\\lmoustache" || delim === "⎰") {
		top = "⎧";
		bottom = "⎭";
		repeat = "⎪";
		font = "Size4-Regular";
	} else if (delim === "\\rmoustache" || delim === "⎱") {
		top = "⎫";
		bottom = "⎩";
		repeat = "⎪";
		font = "Size4-Regular";
	}
	var topMetrics = getMetrics(top, font, mode);
	var topHeightTotal = topMetrics.height + topMetrics.depth;
	var repeatMetrics = getMetrics(repeat, font, mode);
	var repeatHeightTotal = repeatMetrics.height + repeatMetrics.depth;
	var bottomMetrics = getMetrics(bottom, font, mode);
	var bottomHeightTotal = bottomMetrics.height + bottomMetrics.depth;
	var middleHeightTotal = 0;
	var middleFactor = 1;
	if (middle !== null) {
		var middleMetrics = getMetrics(middle, font, mode);
		middleHeightTotal = middleMetrics.height + middleMetrics.depth;
		middleFactor = 2;
	}
	var minHeight = topHeightTotal + bottomHeightTotal + middleHeightTotal;
	var realHeightTotal = minHeight + Math.max(0, Math.ceil((heightTotal - minHeight) / (middleFactor * repeatHeightTotal))) * middleFactor * repeatHeightTotal;
	var axisHeight = options.fontMetrics().axisHeight;
	if (center) axisHeight *= options.sizeMultiplier;
	var depth = realHeightTotal / 2 - axisHeight;
	var stack = [];
	if (svgLabel.length > 0) {
		var midHeight = realHeightTotal - topHeightTotal - bottomHeightTotal;
		var viewBoxHeight = Math.round(realHeightTotal * 1e3);
		var pathStr = tallDelim(svgLabel, Math.round(midHeight * 1e3));
		var path = new PathNode(svgLabel, pathStr);
		var width = makeEm(viewBoxWidth / 1e3);
		var height = makeEm(viewBoxHeight / 1e3);
		var wrapper = makeSvgSpan([], [new SvgNode([path], {
			"width": width,
			"height": height,
			"viewBox": "0 0 " + viewBoxWidth + " " + viewBoxHeight
		})], options);
		wrapper.height = viewBoxHeight / 1e3;
		wrapper.style.width = width;
		wrapper.style.height = height;
		stack.push({
			type: "elem",
			elem: wrapper
		});
	} else {
		stack.push(makeGlyphSpan(bottom, font, mode));
		stack.push(lap);
		if (middle === null) {
			var innerHeight = realHeightTotal - topHeightTotal - bottomHeightTotal + 2 * lapInEms;
			stack.push(makeInner(repeat, innerHeight, options));
		} else {
			var _innerHeight = (realHeightTotal - topHeightTotal - bottomHeightTotal - middleHeightTotal) / 2 + 2 * lapInEms;
			stack.push(makeInner(repeat, _innerHeight, options));
			stack.push(lap);
			stack.push(makeGlyphSpan(middle, font, mode));
			stack.push(lap);
			stack.push(makeInner(repeat, _innerHeight, options));
		}
		stack.push(lap);
		stack.push(makeGlyphSpan(top, font, mode));
	}
	var newOptions = options.havingBaseStyle(Style$1.TEXT);
	return styleWrap(makeSpan(["delimsizing", "mult"], [makeVList({
		positionType: "bottom",
		positionData: depth,
		children: stack
	})], newOptions), Style$1.TEXT, options, classes);
};
var vbPad = 80;
var emPad = .08;
var sqrtSvg = function sqrtSvg(sqrtName, height, viewBoxHeight, extraVinculum, options) {
	return makeSvgSpan(["hide-tail"], [new SvgNode([new PathNode(sqrtName, sqrtPath(sqrtName, extraVinculum, viewBoxHeight))], {
		"width": "400em",
		"height": makeEm(height),
		"viewBox": "0 0 400000 " + viewBoxHeight,
		"preserveAspectRatio": "xMinYMin slice"
	})], options);
};
/**
* Make a sqrt image of the given height,
*/
var makeSqrtImage = function makeSqrtImage(height, options) {
	var newOptions = options.havingBaseSizing();
	var delim = traverseSequence("\\surd", height * newOptions.sizeMultiplier, stackLargeDelimiterSequence, newOptions);
	var sizeMultiplier = newOptions.sizeMultiplier;
	var extraVinculum = Math.max(0, options.minRuleThickness - options.fontMetrics().sqrtRuleThickness);
	var span;
	var spanHeight;
	var texHeight;
	var viewBoxHeight;
	var advanceWidth;
	if (delim.type === "small") {
		viewBoxHeight = 1e3 + 1e3 * extraVinculum + vbPad;
		if (height < 1) sizeMultiplier = 1;
		else if (height < 1.4) sizeMultiplier = .7;
		spanHeight = (1 + extraVinculum + emPad) / sizeMultiplier;
		texHeight = (1 + extraVinculum) / sizeMultiplier;
		span = sqrtSvg("sqrtMain", spanHeight, viewBoxHeight, extraVinculum, options);
		span.style.minWidth = "0.853em";
		advanceWidth = .833 / sizeMultiplier;
	} else if (delim.type === "large") {
		viewBoxHeight = (1e3 + vbPad) * sizeToMaxHeight[delim.size];
		texHeight = (sizeToMaxHeight[delim.size] + extraVinculum) / sizeMultiplier;
		spanHeight = (sizeToMaxHeight[delim.size] + extraVinculum + emPad) / sizeMultiplier;
		span = sqrtSvg("sqrtSize" + delim.size, spanHeight, viewBoxHeight, extraVinculum, options);
		span.style.minWidth = "1.02em";
		advanceWidth = 1 / sizeMultiplier;
	} else {
		spanHeight = height + extraVinculum + emPad;
		texHeight = height + extraVinculum;
		viewBoxHeight = Math.floor(1e3 * height + extraVinculum) + vbPad;
		span = sqrtSvg("sqrtTall", spanHeight, viewBoxHeight, extraVinculum, options);
		span.style.minWidth = "0.742em";
		advanceWidth = 1.056;
	}
	span.height = texHeight;
	span.style.height = makeEm(spanHeight);
	return {
		span,
		advanceWidth,
		ruleWidth: (options.fontMetrics().sqrtRuleThickness + extraVinculum) * sizeMultiplier
	};
};
var stackLargeDelimiters = /* @__PURE__ */ new Set([
	"(",
	"\\lparen",
	")",
	"\\rparen",
	"[",
	"\\lbrack",
	"]",
	"\\rbrack",
	"\\{",
	"\\lbrace",
	"\\}",
	"\\rbrace",
	"\\lfloor",
	"\\rfloor",
	"⌊",
	"⌋",
	"\\lceil",
	"\\rceil",
	"⌈",
	"⌉",
	"\\surd"
]);
var stackAlwaysDelimiters = /* @__PURE__ */ new Set([
	"\\uparrow",
	"\\downarrow",
	"\\updownarrow",
	"\\Uparrow",
	"\\Downarrow",
	"\\Updownarrow",
	"|",
	"\\|",
	"\\vert",
	"\\Vert",
	"\\lvert",
	"\\rvert",
	"\\lVert",
	"\\rVert",
	"\\lgroup",
	"\\rgroup",
	"⟮",
	"⟯",
	"\\lmoustache",
	"\\rmoustache",
	"⎰",
	"⎱"
]);
var stackNeverDelimiters = /* @__PURE__ */ new Set([
	"<",
	">",
	"\\langle",
	"\\rangle",
	"/",
	"\\backslash",
	"\\lt",
	"\\gt"
]);
var sizeToMaxHeight = [
	0,
	1.2,
	1.8,
	2.4,
	3
];
/**
* Used to create a delimiter of a specific size, where `size` is 1, 2, 3, or 4.
*/
var makeSizedDelim = function makeSizedDelim(delim, size, options, mode, classes) {
	if (delim === "<" || delim === "\\lt" || delim === "⟨") delim = "\\langle";
	else if (delim === ">" || delim === "\\gt" || delim === "⟩") delim = "\\rangle";
	if (stackLargeDelimiters.has(delim) || stackNeverDelimiters.has(delim)) return makeLargeDelim(delim, size, false, options, mode, classes);
	else if (stackAlwaysDelimiters.has(delim)) return makeStackedDelim(delim, sizeToMaxHeight[size], false, options, mode, classes);
	else throw new ParseError("Illegal delimiter: '" + delim + "'");
};
var stackNeverDelimiterSequence = [
	{
		type: "small",
		style: Style$1.SCRIPTSCRIPT
	},
	{
		type: "small",
		style: Style$1.SCRIPT
	},
	{
		type: "small",
		style: Style$1.TEXT
	},
	{
		type: "large",
		size: 1
	},
	{
		type: "large",
		size: 2
	},
	{
		type: "large",
		size: 3
	},
	{
		type: "large",
		size: 4
	}
];
var stackAlwaysDelimiterSequence = [
	{
		type: "small",
		style: Style$1.SCRIPTSCRIPT
	},
	{
		type: "small",
		style: Style$1.SCRIPT
	},
	{
		type: "small",
		style: Style$1.TEXT
	},
	{ type: "stack" }
];
var stackLargeDelimiterSequence = [
	{
		type: "small",
		style: Style$1.SCRIPTSCRIPT
	},
	{
		type: "small",
		style: Style$1.SCRIPT
	},
	{
		type: "small",
		style: Style$1.TEXT
	},
	{
		type: "large",
		size: 1
	},
	{
		type: "large",
		size: 2
	},
	{
		type: "large",
		size: 3
	},
	{
		type: "large",
		size: 4
	},
	{ type: "stack" }
];
/**
* Get the font used in a delimiter based on what kind of delimiter it is.
* TODO(#963) Use more specific font family return type once that is introduced.
*/
var delimTypeToFont = function delimTypeToFont(type) {
	if (type.type === "small") return "Main-Regular";
	else if (type.type === "large") return "Size" + type.size + "-Regular";
	else if (type.type === "stack") return "Size4-Regular";
	else {
		var delimKind = type.type;
		throw new Error("Add support for delim type '" + delimKind + "' here.");
	}
};
/**
* Traverse a sequence of types of delimiters to decide what kind of delimiter
* should be used to create a delimiter of the given height+depth.
*/
var traverseSequence = function traverseSequence(delim, height, sequence, options) {
	for (var i = Math.min(2, 3 - options.style.size); i < sequence.length; i++) {
		var delimType = sequence[i];
		if (delimType.type === "stack") break;
		var metrics = getMetrics(delim, delimTypeToFont(delimType), "math");
		var heightDepth = metrics.height + metrics.depth;
		if (delimType.type === "small") {
			var newOptions = options.havingBaseStyle(delimType.style);
			heightDepth *= newOptions.sizeMultiplier;
		}
		if (heightDepth > height) return delimType;
	}
	return sequence[sequence.length - 1];
};
/**
* Make a delimiter of a given height+depth, with optional centering. Here, we
* traverse the sequences, and create a delimiter that the sequence tells us to.
*/
var makeCustomSizedDelim = function makeCustomSizedDelim(delim, height, center, options, mode, classes) {
	if (delim === "<" || delim === "\\lt" || delim === "⟨") delim = "\\langle";
	else if (delim === ">" || delim === "\\gt" || delim === "⟩") delim = "\\rangle";
	var sequence;
	if (stackNeverDelimiters.has(delim)) sequence = stackNeverDelimiterSequence;
	else if (stackLargeDelimiters.has(delim)) sequence = stackLargeDelimiterSequence;
	else sequence = stackAlwaysDelimiterSequence;
	var delimType = traverseSequence(delim, height, sequence, options);
	if (delimType.type === "small") return makeSmallDelim(delim, delimType.style, center, options, mode, classes);
	else if (delimType.type === "large") return makeLargeDelim(delim, delimType.size, center, options, mode, classes);
	else return makeStackedDelim(delim, height, center, options, mode, classes);
};
/**
* Make a delimiter for use with `\left` and `\right`, given a height and depth
* of an expression that the delimiters surround.
*/
var makeLeftRightDelim = function makeLeftRightDelim(delim, height, depth, options, mode, classes) {
	var axisHeight = options.fontMetrics().axisHeight * options.sizeMultiplier;
	var delimiterFactor = 901;
	var delimiterExtend = 5 / options.fontMetrics().ptPerEm;
	var maxDistFromAxis = Math.max(height - axisHeight, depth + axisHeight);
	return makeCustomSizedDelim(delim, Math.max(maxDistFromAxis / 500 * delimiterFactor, 2 * maxDistFromAxis - delimiterExtend), true, options, mode, classes);
};
var delimiterSizes = {
	"\\bigl": {
		mclass: "mopen",
		size: 1
	},
	"\\Bigl": {
		mclass: "mopen",
		size: 2
	},
	"\\biggl": {
		mclass: "mopen",
		size: 3
	},
	"\\Biggl": {
		mclass: "mopen",
		size: 4
	},
	"\\bigr": {
		mclass: "mclose",
		size: 1
	},
	"\\Bigr": {
		mclass: "mclose",
		size: 2
	},
	"\\biggr": {
		mclass: "mclose",
		size: 3
	},
	"\\Biggr": {
		mclass: "mclose",
		size: 4
	},
	"\\bigm": {
		mclass: "mrel",
		size: 1
	},
	"\\Bigm": {
		mclass: "mrel",
		size: 2
	},
	"\\biggm": {
		mclass: "mrel",
		size: 3
	},
	"\\Biggm": {
		mclass: "mrel",
		size: 4
	},
	"\\big": {
		mclass: "mord",
		size: 1
	},
	"\\Big": {
		mclass: "mord",
		size: 2
	},
	"\\bigg": {
		mclass: "mord",
		size: 3
	},
	"\\Bigg": {
		mclass: "mord",
		size: 4
	}
};
var delimiters = /* @__PURE__ */ new Set([
	"(",
	"\\lparen",
	")",
	"\\rparen",
	"[",
	"\\lbrack",
	"]",
	"\\rbrack",
	"\\{",
	"\\lbrace",
	"\\}",
	"\\rbrace",
	"\\lfloor",
	"\\rfloor",
	"⌊",
	"⌋",
	"\\lceil",
	"\\rceil",
	"⌈",
	"⌉",
	"<",
	">",
	"\\langle",
	"⟨",
	"\\rangle",
	"⟩",
	"\\lt",
	"\\gt",
	"\\lvert",
	"\\rvert",
	"\\lVert",
	"\\rVert",
	"\\lgroup",
	"\\rgroup",
	"⟮",
	"⟯",
	"\\lmoustache",
	"\\rmoustache",
	"⎰",
	"⎱",
	"/",
	"\\backslash",
	"|",
	"\\vert",
	"\\|",
	"\\Vert",
	"\\uparrow",
	"\\Uparrow",
	"\\downarrow",
	"\\Downarrow",
	"\\updownarrow",
	"\\Updownarrow",
	"."
]);
function isMiddleDelimNode(node) {
	return "isMiddle" in node;
}
function checkDelimiter(delim, context) {
	var symDelim = checkSymbolNodeType(delim);
	if (symDelim && delimiters.has(symDelim.text)) return symDelim;
	else if (symDelim) throw new ParseError("Invalid delimiter '" + symDelim.text + "' after '" + context.funcName + "'", delim);
	else throw new ParseError("Invalid delimiter type '" + delim.type + "'", delim);
}
defineFunction({
	type: "delimsizing",
	names: [
		"\\bigl",
		"\\Bigl",
		"\\biggl",
		"\\Biggl",
		"\\bigr",
		"\\Bigr",
		"\\biggr",
		"\\Biggr",
		"\\bigm",
		"\\Bigm",
		"\\biggm",
		"\\Biggm",
		"\\big",
		"\\Big",
		"\\bigg",
		"\\Bigg"
	],
	props: {
		numArgs: 1,
		argTypes: ["primitive"]
	},
	handler: (context, args) => {
		var delim = checkDelimiter(args[0], context);
		return {
			type: "delimsizing",
			mode: context.parser.mode,
			size: delimiterSizes[context.funcName].size,
			mclass: delimiterSizes[context.funcName].mclass,
			delim: delim.text
		};
	},
	htmlBuilder: (group, options) => {
		if (group.delim === ".") return makeSpan([group.mclass]);
		return makeSizedDelim(group.delim, group.size, options, group.mode, [group.mclass]);
	},
	mathmlBuilder: (group) => {
		var children = [];
		if (group.delim !== ".") children.push(makeText(group.delim, group.mode));
		var node = new MathNode("mo", children);
		if (group.mclass === "mopen" || group.mclass === "mclose") node.setAttribute("fence", "true");
		else node.setAttribute("fence", "false");
		node.setAttribute("stretchy", "true");
		var size = makeEm(sizeToMaxHeight[group.size]);
		node.setAttribute("minsize", size);
		node.setAttribute("maxsize", size);
		return node;
	}
});
function assertParsed(group) {
	if (!group.body) throw new Error("Bug: The leftright ParseNode wasn't fully parsed.");
}
defineFunction({
	type: "leftright-right",
	names: ["\\right"],
	props: {
		numArgs: 1,
		primitive: true
	},
	handler: (context, args) => {
		var color = context.parser.gullet.macros.get("\\current@color");
		if (color && typeof color !== "string") throw new ParseError("\\current@color set to non-string in \\right");
		return {
			type: "leftright-right",
			mode: context.parser.mode,
			delim: checkDelimiter(args[0], context).text,
			color
		};
	}
});
defineFunction({
	type: "leftright",
	names: ["\\left"],
	props: {
		numArgs: 1,
		primitive: true
	},
	handler: (context, args) => {
		var delim = checkDelimiter(args[0], context);
		var parser = context.parser;
		++parser.leftrightDepth;
		var body = parser.parseExpression(false);
		--parser.leftrightDepth;
		parser.expect("\\right", false);
		var right = assertNodeType(parser.parseFunction(), "leftright-right");
		return {
			type: "leftright",
			mode: parser.mode,
			body,
			left: delim.text,
			right: right.delim,
			rightColor: right.color
		};
	},
	htmlBuilder: (group, options) => {
		assertParsed(group);
		var inner = buildExpression$1(group.body, options, true, ["mopen", "mclose"]);
		var innerHeight = 0;
		var innerDepth = 0;
		var hadMiddle = false;
		for (var i = 0; i < inner.length; i++) {
			var node = inner[i];
			if (isMiddleDelimNode(node)) hadMiddle = true;
			else {
				innerHeight = Math.max(inner[i].height, innerHeight);
				innerDepth = Math.max(inner[i].depth, innerDepth);
			}
		}
		innerHeight *= options.sizeMultiplier;
		innerDepth *= options.sizeMultiplier;
		var leftDelim;
		if (group.left === ".") leftDelim = makeNullDelimiter(options, ["mopen"]);
		else leftDelim = makeLeftRightDelim(group.left, innerHeight, innerDepth, options, group.mode, ["mopen"]);
		inner.unshift(leftDelim);
		if (hadMiddle) for (var _i = 1; _i < inner.length; _i++) {
			var middleDelim = inner[_i];
			if (isMiddleDelimNode(middleDelim)) {
				var isMiddle = middleDelim.isMiddle;
				inner[_i] = makeLeftRightDelim(isMiddle.delim, innerHeight, innerDepth, isMiddle.options, group.mode, []);
			}
		}
		var rightDelim;
		if (group.right === ".") rightDelim = makeNullDelimiter(options, ["mclose"]);
		else {
			var colorOptions = group.rightColor ? options.withColor(group.rightColor) : options;
			rightDelim = makeLeftRightDelim(group.right, innerHeight, innerDepth, colorOptions, group.mode, ["mclose"]);
		}
		inner.push(rightDelim);
		return makeSpan(["minner"], inner, options);
	},
	mathmlBuilder: (group, options) => {
		assertParsed(group);
		var inner = buildExpression(group.body, options);
		if (group.left !== ".") {
			var leftNode = new MathNode("mo", [makeText(group.left, group.mode)]);
			leftNode.setAttribute("fence", "true");
			inner.unshift(leftNode);
		}
		if (group.right !== ".") {
			var rightNode = new MathNode("mo", [makeText(group.right, group.mode)]);
			rightNode.setAttribute("fence", "true");
			if (group.rightColor) rightNode.setAttribute("mathcolor", group.rightColor);
			inner.push(rightNode);
		}
		return makeRow(inner);
	}
});
defineFunction({
	type: "middle",
	names: ["\\middle"],
	props: {
		numArgs: 1,
		primitive: true
	},
	handler: (context, args) => {
		var delim = checkDelimiter(args[0], context);
		if (!context.parser.leftrightDepth) throw new ParseError("\\middle without preceding \\left", delim);
		return {
			type: "middle",
			mode: context.parser.mode,
			delim: delim.text
		};
	},
	htmlBuilder: (group, options) => {
		var middleDelim;
		if (group.delim === ".") middleDelim = makeNullDelimiter(options, []);
		else {
			middleDelim = makeSizedDelim(group.delim, 1, options, group.mode, []);
			middleDelim.isMiddle = {
				delim: group.delim,
				options
			};
		}
		return middleDelim;
	},
	mathmlBuilder: (group, options) => {
		var middleNode = new MathNode("mo", [group.delim === "\\vert" || group.delim === "|" ? makeText("|", "text") : makeText(group.delim, group.mode)]);
		middleNode.setAttribute("fence", "true");
		middleNode.setAttribute("lspace", "0.05em");
		middleNode.setAttribute("rspace", "0.05em");
		return middleNode;
	}
});
var htmlBuilder$7 = (group, options) => {
	var inner = wrapFragment(buildGroup$1(group.body, options), options);
	var label = group.label.slice(1);
	var scale = options.sizeMultiplier;
	var img;
	var imgShift;
	var isSingleChar = isCharacterBox(group.body);
	if (label === "sout") {
		img = makeSpan(["stretchy", "sout"]);
		img.height = options.fontMetrics().defaultRuleThickness / scale;
		imgShift = -.5 * options.fontMetrics().xHeight;
	} else if (label === "phase") {
		var lineWeight = calculateSize({
			number: .6,
			unit: "pt"
		}, options);
		var clearance = calculateSize({
			number: .35,
			unit: "ex"
		}, options);
		var newOptions = options.havingBaseSizing();
		scale = scale / newOptions.sizeMultiplier;
		var angleHeight = inner.height + inner.depth + lineWeight + clearance;
		inner.style.paddingLeft = makeEm(angleHeight / 2 + lineWeight);
		var viewBoxHeight = Math.floor(1e3 * angleHeight * scale);
		img = makeSvgSpan(["hide-tail"], [new SvgNode([new PathNode("phase", phasePath(viewBoxHeight))], {
			"width": "400em",
			"height": makeEm(viewBoxHeight / 1e3),
			"viewBox": "0 0 400000 " + viewBoxHeight,
			"preserveAspectRatio": "xMinYMin slice"
		})], options);
		img.style.height = makeEm(angleHeight);
		imgShift = inner.depth + lineWeight + clearance;
	} else {
		if (/cancel/.test(label)) {
			if (!isSingleChar) inner.classes.push("cancel-pad");
		} else if (label === "angl") inner.classes.push("anglpad");
		else inner.classes.push("boxpad");
		var topPad;
		var bottomPad;
		var ruleThickness = 0;
		if (/box/.test(label)) {
			ruleThickness = Math.max(options.fontMetrics().fboxrule, options.minRuleThickness);
			topPad = options.fontMetrics().fboxsep + (label === "colorbox" ? 0 : ruleThickness);
			bottomPad = topPad;
		} else if (label === "angl") {
			ruleThickness = Math.max(options.fontMetrics().defaultRuleThickness, options.minRuleThickness);
			topPad = 4 * ruleThickness;
			bottomPad = Math.max(0, .25 - inner.depth);
		} else {
			topPad = isSingleChar ? .2 : 0;
			bottomPad = topPad;
		}
		img = stretchyEnclose(inner, label, topPad, bottomPad, options);
		if (/fbox|boxed|fcolorbox/.test(label)) {
			img.style.borderStyle = "solid";
			img.style.borderWidth = makeEm(ruleThickness);
		} else if (label === "angl" && ruleThickness !== .049) {
			img.style.borderTopWidth = makeEm(ruleThickness);
			img.style.borderRightWidth = makeEm(ruleThickness);
		}
		imgShift = inner.depth + bottomPad;
		if (group.backgroundColor) {
			img.style.backgroundColor = group.backgroundColor;
			if (group.borderColor) img.style.borderColor = group.borderColor;
		}
	}
	var vlist;
	if (group.backgroundColor) vlist = makeVList({
		positionType: "individualShift",
		children: [{
			type: "elem",
			elem: img,
			shift: imgShift
		}, {
			type: "elem",
			elem: inner,
			shift: 0
		}]
	});
	else {
		var classes = /cancel|phase/.test(label) ? ["svg-align"] : [];
		vlist = makeVList({
			positionType: "individualShift",
			children: [{
				type: "elem",
				elem: inner,
				shift: 0
			}, {
				type: "elem",
				elem: img,
				shift: imgShift,
				wrapperClasses: classes
			}]
		});
	}
	if (/cancel/.test(label)) {
		vlist.height = inner.height;
		vlist.depth = inner.depth;
	}
	if (/cancel/.test(label) && !isSingleChar) return makeSpan(["mord", "cancel-lap"], [vlist], options);
	else return makeSpan(["mord"], [vlist], options);
};
var mathmlBuilder$6 = (group, options) => {
	var fboxsep;
	var node = new MathNode(group.label.includes("colorbox") ? "mpadded" : "menclose", [buildGroup(group.body, options)]);
	switch (group.label) {
		case "\\cancel":
			node.setAttribute("notation", "updiagonalstrike");
			break;
		case "\\bcancel":
			node.setAttribute("notation", "downdiagonalstrike");
			break;
		case "\\phase":
			node.setAttribute("notation", "phasorangle");
			break;
		case "\\sout":
			node.setAttribute("notation", "horizontalstrike");
			break;
		case "\\fbox":
			node.setAttribute("notation", "box");
			break;
		case "\\angl":
			node.setAttribute("notation", "actuarial");
			break;
		case "\\fcolorbox":
		case "\\colorbox":
			fboxsep = options.fontMetrics().fboxsep * options.fontMetrics().ptPerEm;
			node.setAttribute("width", "+" + 2 * fboxsep + "pt");
			node.setAttribute("height", "+" + 2 * fboxsep + "pt");
			node.setAttribute("lspace", fboxsep + "pt");
			node.setAttribute("voffset", fboxsep + "pt");
			if (group.label === "\\fcolorbox") {
				var thk = Math.max(options.fontMetrics().fboxrule, options.minRuleThickness);
				node.setAttribute("style", "border: " + makeEm(thk) + " solid " + group.borderColor);
			}
			break;
		case "\\xcancel": node.setAttribute("notation", "updiagonalstrike downdiagonalstrike");
	}
	if (group.backgroundColor) node.setAttribute("mathbackground", group.backgroundColor);
	return node;
};
defineFunction({
	type: "enclose",
	names: ["\\colorbox"],
	props: {
		numArgs: 2,
		allowedInText: true,
		argTypes: ["color", "hbox"]
	},
	handler(_ref, args, optArgs) {
		var { parser, funcName } = _ref;
		var color = assertNodeType(args[0], "color-token").color;
		var body = args[1];
		return {
			type: "enclose",
			mode: parser.mode,
			label: funcName,
			backgroundColor: color,
			body
		};
	},
	htmlBuilder: htmlBuilder$7,
	mathmlBuilder: mathmlBuilder$6
});
defineFunction({
	type: "enclose",
	names: ["\\fcolorbox"],
	props: {
		numArgs: 3,
		allowedInText: true,
		argTypes: [
			"color",
			"color",
			"hbox"
		]
	},
	handler(_ref2, args, optArgs) {
		var { parser, funcName } = _ref2;
		var borderColor = assertNodeType(args[0], "color-token").color;
		var backgroundColor = assertNodeType(args[1], "color-token").color;
		var body = args[2];
		return {
			type: "enclose",
			mode: parser.mode,
			label: funcName,
			backgroundColor,
			borderColor,
			body
		};
	},
	htmlBuilder: htmlBuilder$7,
	mathmlBuilder: mathmlBuilder$6
});
defineFunction({
	type: "enclose",
	names: ["\\fbox"],
	props: {
		numArgs: 1,
		argTypes: ["hbox"],
		allowedInText: true
	},
	handler(_ref3, args) {
		var { parser } = _ref3;
		return {
			type: "enclose",
			mode: parser.mode,
			label: "\\fbox",
			body: args[0]
		};
	}
});
defineFunction({
	type: "enclose",
	names: [
		"\\cancel",
		"\\bcancel",
		"\\xcancel",
		"\\phase"
	],
	props: { numArgs: 1 },
	handler(_ref4, args) {
		var { parser, funcName } = _ref4;
		var body = args[0];
		return {
			type: "enclose",
			mode: parser.mode,
			label: funcName,
			body
		};
	},
	htmlBuilder: htmlBuilder$7,
	mathmlBuilder: mathmlBuilder$6
});
defineFunction({
	type: "enclose",
	names: ["\\sout"],
	props: {
		numArgs: 1,
		allowedInText: true
	},
	handler(_ref5, args) {
		var { parser, funcName } = _ref5;
		if (parser.mode === "math") parser.settings.reportNonstrict("mathVsSout", "LaTeX's \\sout works only in text mode");
		var body = args[0];
		return {
			type: "enclose",
			mode: parser.mode,
			label: funcName,
			body
		};
	},
	htmlBuilder: htmlBuilder$7,
	mathmlBuilder: mathmlBuilder$6
});
defineFunction({
	type: "enclose",
	names: ["\\angl"],
	props: {
		numArgs: 1,
		argTypes: ["hbox"],
		allowedInText: false
	},
	handler(_ref6, args) {
		var { parser } = _ref6;
		return {
			type: "enclose",
			mode: parser.mode,
			label: "\\angl",
			body: args[0]
		};
	}
});
/**
* All registered environments.
* `environments.js` exports this same dictionary again and makes it public.
* `Parser.js` requires this dictionary via `environments.js`.
*/
var _environments = {};
function defineEnvironment(_ref) {
	var { type, names, props, handler, htmlBuilder, mathmlBuilder } = _ref;
	var data = {
		type,
		numArgs: props.numArgs || 0,
		allowedInText: false,
		numOptionalArgs: 0,
		handler
	};
	for (var i = 0; i < names.length; ++i) _environments[names[i]] = data;
	if (htmlBuilder) _htmlGroupBuilders[type] = htmlBuilder;
	if (mathmlBuilder) _mathmlGroupBuilders[type] = mathmlBuilder;
}
/**
* All registered global/built-in macros.
* `macros.js` exports this same dictionary again and makes it public.
* `Parser.js` requires this dictionary via `macros.js`.
*/
var _macros = {};
function defineMacro(name, body) {
	_macros[name] = body;
}
/**
* Lexing or parsing positional information for error reporting.
* This object is immutable.
*/
var SourceLocation = class SourceLocation {
	constructor(lexer, start, end) {
		this.lexer = void 0;
		this.start = void 0;
		this.end = void 0;
		this.lexer = lexer;
		this.start = start;
		this.end = end;
	}
	/**
	* Merges two `SourceLocation`s from location providers, given they are
	* provided in order of appearance.
	* - Returns the first one's location if only the first is provided.
	* - Returns a merged range of the first and the last if both are provided
	*   and their lexers match.
	* - Otherwise, returns null.
	*/
	static range(first, second) {
		if (!second) return first && first.loc;
		else if (!first || !first.loc || !second.loc || first.loc.lexer !== second.loc.lexer) return null;
		else return new SourceLocation(first.loc.lexer, first.loc.start, second.loc.end);
	}
};
/**
* The resulting token returned from `lex`.
*
* It consists of the token text plus some position information.
* The position information is essentially a range in an input string,
* but instead of referencing the bare input string, we refer to the lexer.
* That way it is possible to attach extra metadata to the input string,
* like for example a file name or similar.
*
* The position information is optional, so it is OK to construct synthetic
* tokens if appropriate. Not providing available position information may
* lead to degraded error reporting, though.
*/
var Token = class Token {
	constructor(text, loc) {
		this.text = void 0;
		this.loc = void 0;
		this.noexpand = void 0;
		this.treatAsRelax = void 0;
		this.text = text;
		this.loc = loc;
	}
	/**
	* Given a pair of tokens (this and endToken), compute a `Token` encompassing
	* the whole input range enclosed by these two.
	*/
	range(endToken, text) {
		return new Token(text, SourceLocation.range(this, endToken));
	}
};
function getHLines(parser) {
	var hlineInfo = [];
	parser.consumeSpaces();
	var nxt = parser.fetch().text;
	if (nxt === "\\relax") {
		parser.consume();
		parser.consumeSpaces();
		nxt = parser.fetch().text;
	}
	while (nxt === "\\hline" || nxt === "\\hdashline") {
		parser.consume();
		hlineInfo.push(nxt === "\\hdashline");
		parser.consumeSpaces();
		nxt = parser.fetch().text;
	}
	return hlineInfo;
}
var validateAmsEnvironmentContext = (context) => {
	if (!context.parser.settings.displayMode) throw new ParseError("{" + context.envName + "} can be used only in display mode.");
};
var gatherEnvironments = /* @__PURE__ */ new Set(["gather", "gather*"]);
function getAutoTag(name) {
	if (!name.includes("ed")) return !name.includes("*");
}
/**
* Parse the body of the environment, with rows delimited by \\ and
* columns delimited by &, and create a nested list in row-major order
* with one group per cell.  If given an optional argument style
* ("text", "display", etc.), then each cell is cast into that style.
*/
function parseArray(parser, _ref, style) {
	var { hskipBeforeAndAfter, addJot, cols, arraystretch, colSeparationType, autoTag, singleRow, emptySingleRow, maxNumCols, leqno } = _ref;
	parser.gullet.beginGroup();
	if (!singleRow) parser.gullet.macros.set("\\cr", "\\\\\\relax");
	if (!arraystretch) {
		var stretch = parser.gullet.expandMacroAsText("\\arraystretch");
		if (stretch == null) arraystretch = 1;
		else {
			arraystretch = parseFloat(stretch);
			if (!arraystretch || arraystretch < 0) throw new ParseError("Invalid \\arraystretch: " + stretch);
		}
	}
	parser.gullet.beginGroup();
	var row = [];
	var body = [row];
	var rowGaps = [];
	var hLinesBeforeRow = [];
	var tags = autoTag != null ? [] : void 0;
	function beginRow() {
		if (autoTag) parser.gullet.macros.set("\\@eqnsw", "1", true);
	}
	function endRow() {
		if (tags) {
			if (parser.gullet.macros.get("\\df@tag")) {
				tags.push(parser.subparse([new Token("\\df@tag")]));
				parser.gullet.macros.set("\\df@tag", void 0, true);
			} else tags.push(Boolean(autoTag) && parser.gullet.macros.get("\\@eqnsw") === "1");
		}
	}
	beginRow();
	hLinesBeforeRow.push(getHLines(parser));
	while (true) {
		var cellBody = parser.parseExpression(false, singleRow ? "\\end" : "\\\\");
		parser.gullet.endGroup();
		parser.gullet.beginGroup();
		var cell = {
			type: "ordgroup",
			mode: parser.mode,
			body: cellBody
		};
		if (style) cell = {
			type: "styling",
			mode: parser.mode,
			style,
			resetFont: true,
			body: [cell]
		};
		row.push(cell);
		var next = parser.fetch().text;
		if (next === "&") {
			if (maxNumCols && row.length === maxNumCols) {
				if (singleRow || colSeparationType) throw new ParseError("Too many tab characters: &", parser.nextToken);
				else parser.settings.reportNonstrict("textEnv", "Too few columns specified in the {array} column argument.");
			}
			parser.consume();
		} else if (next === "\\end") {
			endRow();
			if (row.length === 1 && cell.type === "styling" && cell.body.length === 1 && cell.body[0].type === "ordgroup" && cell.body[0].body.length === 0 && (body.length > 1 || !emptySingleRow)) body.pop();
			if (hLinesBeforeRow.length < body.length + 1) hLinesBeforeRow.push([]);
			break;
		} else if (next === "\\\\") {
			parser.consume();
			var size = void 0;
			if (parser.gullet.future().text !== " ") size = parser.parseSizeGroup(true);
			rowGaps.push(size ? size.value : null);
			endRow();
			hLinesBeforeRow.push(getHLines(parser));
			row = [];
			body.push(row);
			beginRow();
		} else throw new ParseError("Expected & or \\\\ or \\cr or \\end", parser.nextToken);
	}
	parser.gullet.endGroup();
	parser.gullet.endGroup();
	return {
		type: "array",
		mode: parser.mode,
		addJot,
		arraystretch,
		body,
		cols,
		rowGaps,
		hskipBeforeAndAfter,
		hLinesBeforeRow,
		colSeparationType,
		tags,
		leqno
	};
}
function dCellStyle(envName) {
	if (envName.slice(0, 1) === "d") return "display";
	else return "text";
}
var htmlBuilder$6 = function htmlBuilder(group, options) {
	var r;
	var c;
	var nr = group.body.length;
	var hLinesBeforeRow = group.hLinesBeforeRow;
	var nc = 0;
	var body = new Array(nr);
	var hlines = [];
	var ruleThickness = Math.max(options.fontMetrics().arrayRuleWidth, options.minRuleThickness);
	var pt = 1 / options.fontMetrics().ptPerEm;
	var arraycolsep = 5 * pt;
	if (group.colSeparationType && group.colSeparationType === "small") arraycolsep = .2778 * (options.havingStyle(Style$1.SCRIPT).sizeMultiplier / options.sizeMultiplier);
	var baselineskip = group.colSeparationType === "CD" ? calculateSize({
		number: 3,
		unit: "ex"
	}, options) : 12 * pt;
	var jot = 3 * pt;
	var arrayskip = group.arraystretch * baselineskip;
	var arstrutHeight = .7 * arrayskip;
	var arstrutDepth = .3 * arrayskip;
	var totalHeight = 0;
	function setHLinePos(hlinesInGap) {
		for (var i = 0; i < hlinesInGap.length; ++i) {
			if (i > 0) totalHeight += .25;
			hlines.push({
				pos: totalHeight,
				isDashed: hlinesInGap[i]
			});
		}
	}
	setHLinePos(hLinesBeforeRow[0]);
	for (r = 0; r < group.body.length; ++r) {
		var inrow = group.body[r];
		var height = arstrutHeight;
		var depth = arstrutDepth;
		if (nc < inrow.length) nc = inrow.length;
		var outrow = {
			cells: new Array(inrow.length),
			height: 0,
			depth: 0,
			pos: 0
		};
		for (c = 0; c < inrow.length; ++c) {
			var elt = buildGroup$1(inrow[c], options);
			if (depth < elt.depth) depth = elt.depth;
			if (height < elt.height) height = elt.height;
			outrow.cells[c] = elt;
		}
		var rowGap = group.rowGaps[r];
		var gap = 0;
		if (rowGap) {
			gap = calculateSize(rowGap, options);
			if (gap > 0) {
				gap += arstrutDepth;
				if (depth < gap) depth = gap;
				gap = 0;
			}
		}
		if (group.addJot && r < group.body.length - 1) depth += jot;
		outrow.height = height;
		outrow.depth = depth;
		totalHeight += height;
		outrow.pos = totalHeight;
		totalHeight += depth + gap;
		body[r] = outrow;
		setHLinePos(hLinesBeforeRow[r + 1]);
	}
	var offset = totalHeight / 2 + options.fontMetrics().axisHeight;
	var colDescriptions = group.cols || [];
	var cols = [];
	var colSep;
	var colDescrNum;
	var tagSpans = [];
	if (group.tags && group.tags.some((tag) => tag)) for (r = 0; r < nr; ++r) {
		var rw = body[r];
		var shift = rw.pos - offset;
		var tag = group.tags[r];
		var tagSpan = void 0;
		if (tag === true) tagSpan = makeSpan(["eqn-num"], [], options);
		else if (tag === false) tagSpan = makeSpan([], [], options);
		else tagSpan = makeSpan([], buildExpression$1(tag, options, true), options);
		tagSpan.depth = rw.depth;
		tagSpan.height = rw.height;
		tagSpans.push({
			type: "elem",
			elem: tagSpan,
			shift
		});
	}
	for (c = 0, colDescrNum = 0; c < nc || colDescrNum < colDescriptions.length; ++c, ++colDescrNum) {
		var _colDescr3;
		var colDescr = colDescriptions[colDescrNum];
		var firstSeparator = true;
		while (((_colDescr = colDescr) == null ? void 0 : _colDescr.type) === "separator") {
			var _colDescr;
			if (!firstSeparator) {
				colSep = makeSpan(["arraycolsep"], []);
				colSep.style.width = makeEm(options.fontMetrics().doubleRuleSep);
				cols.push(colSep);
			}
			if (colDescr.separator === "|" || colDescr.separator === ":") {
				var lineType = colDescr.separator === "|" ? "solid" : "dashed";
				var separator = makeSpan(["vertical-separator"], [], options);
				separator.style.height = makeEm(totalHeight);
				separator.style.borderRightWidth = makeEm(ruleThickness);
				separator.style.borderRightStyle = lineType;
				separator.style.margin = "0 " + makeEm(-ruleThickness / 2);
				var _shift = totalHeight - offset;
				if (_shift) separator.style.verticalAlign = makeEm(-_shift);
				cols.push(separator);
			} else throw new ParseError("Invalid separator type: " + colDescr.separator);
			colDescrNum++;
			colDescr = colDescriptions[colDescrNum];
			firstSeparator = false;
		}
		if (c >= nc) continue;
		var sepwidth = void 0;
		if (c > 0 || group.hskipBeforeAndAfter) {
			var _colDescr$pregap, _colDescr2;
			sepwidth = (_colDescr$pregap = (_colDescr2 = colDescr) == null ? void 0 : _colDescr2.pregap) != null ? _colDescr$pregap : arraycolsep;
			if (sepwidth !== 0) {
				colSep = makeSpan(["arraycolsep"], []);
				colSep.style.width = makeEm(sepwidth);
				cols.push(colSep);
			}
		}
		var colElems = [];
		for (r = 0; r < nr; ++r) {
			var row = body[r];
			var elem = row.cells[c];
			if (!elem) continue;
			var _shift2 = row.pos - offset;
			elem.depth = row.depth;
			elem.height = row.height;
			colElems.push({
				type: "elem",
				elem,
				shift: _shift2
			});
		}
		var colVList = makeVList({
			positionType: "individualShift",
			children: colElems
		});
		var colSpan = makeSpan(["col-align-" + (((_colDescr3 = colDescr) == null ? void 0 : _colDescr3.align) || "c")], [colVList]);
		cols.push(colSpan);
		if (c < nc - 1 || group.hskipBeforeAndAfter) {
			var _colDescr$postgap, _colDescr4;
			sepwidth = (_colDescr$postgap = (_colDescr4 = colDescr) == null ? void 0 : _colDescr4.postgap) != null ? _colDescr$postgap : arraycolsep;
			if (sepwidth !== 0) {
				colSep = makeSpan(["arraycolsep"], []);
				colSep.style.width = makeEm(sepwidth);
				cols.push(colSep);
			}
		}
	}
	var tableBody = makeSpan(["mtable"], cols);
	if (hlines.length > 0) {
		var line = makeLineSpan("hline", options, ruleThickness);
		var dashes = makeLineSpan("hdashline", options, ruleThickness);
		var vListElems = [{
			type: "elem",
			elem: tableBody,
			shift: 0
		}];
		while (hlines.length > 0) {
			var hline = hlines.pop();
			var lineShift = hline.pos - offset;
			if (hline.isDashed) vListElems.push({
				type: "elem",
				elem: dashes,
				shift: lineShift
			});
			else vListElems.push({
				type: "elem",
				elem: line,
				shift: lineShift
			});
		}
		tableBody = makeVList({
			positionType: "individualShift",
			children: vListElems
		});
	}
	if (tagSpans.length === 0) return makeSpan(["mord"], [tableBody], options);
	else {
		var tagCol = makeSpan(["tag"], [makeVList({
			positionType: "individualShift",
			children: tagSpans
		})], options);
		return makeFragment([tableBody, tagCol]);
	}
};
var alignMap = {
	c: "center ",
	l: "left ",
	r: "right "
};
var mathmlBuilder$5 = function mathmlBuilder(group, options) {
	var tbl = [];
	var glue = new MathNode("mtd", [], ["mtr-glue"]);
	var tag = new MathNode("mtd", [], ["mml-eqn-num"]);
	for (var i = 0; i < group.body.length; i++) {
		var rw = group.body[i];
		var row = [];
		for (var j = 0; j < rw.length; j++) row.push(new MathNode("mtd", [buildGroup(rw[j], options)]));
		if (group.tags && group.tags[i]) {
			row.unshift(glue);
			row.push(glue);
			if (group.leqno) row.unshift(tag);
			else row.push(tag);
		}
		tbl.push(new MathNode("mtr", row));
	}
	var table = new MathNode("mtable", tbl);
	var gap = group.arraystretch === .5 ? .1 : .16 + group.arraystretch - 1 + (group.addJot ? .09 : 0);
	table.setAttribute("rowspacing", makeEm(gap));
	var menclose = "";
	var align = "";
	if (group.cols && group.cols.length > 0) {
		var cols = group.cols;
		var columnLines = "";
		var prevTypeWasAlign = false;
		var iStart = 0;
		var iEnd = cols.length;
		if (cols[0].type === "separator") {
			menclose += "top ";
			iStart = 1;
		}
		if (cols[cols.length - 1].type === "separator") {
			menclose += "bottom ";
			iEnd -= 1;
		}
		for (var _i = iStart; _i < iEnd; _i++) {
			var col = cols[_i];
			if (col.type === "align") {
				align += alignMap[col.align];
				if (prevTypeWasAlign) columnLines += "none ";
				prevTypeWasAlign = true;
			} else if (col.type === "separator") {
				if (prevTypeWasAlign) {
					columnLines += col.separator === "|" ? "solid " : "dashed ";
					prevTypeWasAlign = false;
				}
			}
		}
		table.setAttribute("columnalign", align.trim());
		if (/[sd]/.test(columnLines)) table.setAttribute("columnlines", columnLines.trim());
	}
	if (group.colSeparationType === "align") {
		var _cols = group.cols || [];
		var spacing = "";
		for (var _i2 = 1; _i2 < _cols.length; _i2++) spacing += _i2 % 2 ? "0em " : "1em ";
		table.setAttribute("columnspacing", spacing.trim());
	} else if (group.colSeparationType === "alignat" || group.colSeparationType === "gather") table.setAttribute("columnspacing", "0em");
	else if (group.colSeparationType === "small") table.setAttribute("columnspacing", "0.2778em");
	else if (group.colSeparationType === "CD") table.setAttribute("columnspacing", "0.5em");
	else table.setAttribute("columnspacing", "1em");
	var rowLines = "";
	var hlines = group.hLinesBeforeRow;
	menclose += hlines[0].length > 0 ? "left " : "";
	menclose += hlines[hlines.length - 1].length > 0 ? "right " : "";
	for (var _i3 = 1; _i3 < hlines.length - 1; _i3++) rowLines += hlines[_i3].length === 0 ? "none " : hlines[_i3][0] ? "dashed " : "solid ";
	if (/[sd]/.test(rowLines)) table.setAttribute("rowlines", rowLines.trim());
	if (menclose !== "") {
		table = new MathNode("menclose", [table]);
		table.setAttribute("notation", menclose.trim());
	}
	if (group.arraystretch && group.arraystretch < 1) {
		table = new MathNode("mstyle", [table]);
		table.setAttribute("scriptlevel", "1");
	}
	return table;
};
var alignedHandler = function alignedHandler(context, args) {
	if (!context.envName.includes("ed")) validateAmsEnvironmentContext(context);
	var cols = [];
	var separationType = context.envName.includes("at") ? "alignat" : "align";
	var isSplit = context.envName === "split";
	var res = parseArray(context.parser, {
		cols,
		addJot: true,
		autoTag: isSplit ? void 0 : getAutoTag(context.envName),
		emptySingleRow: true,
		colSeparationType: separationType,
		maxNumCols: isSplit ? 2 : void 0,
		leqno: context.parser.settings.leqno
	}, "display");
	var numMaths = 0;
	var numCols = 0;
	var emptyGroup = {
		type: "ordgroup",
		mode: context.mode,
		body: []
	};
	if (args[0] && args[0].type === "ordgroup") {
		var arg0 = "";
		for (var i = 0; i < args[0].body.length; i++) {
			var textord = assertNodeType(args[0].body[i], "textord");
			arg0 += textord.text;
		}
		numMaths = Number(arg0);
		numCols = numMaths * 2;
	}
	var isAligned = !numCols;
	res.body.forEach(function(row) {
		for (var _i4 = 1; _i4 < row.length; _i4 += 2) assertNodeType(assertNodeType(row[_i4], "styling").body[0], "ordgroup").body.unshift(emptyGroup);
		if (!isAligned) {
			var curMaths = row.length / 2;
			if (numMaths < curMaths) throw new ParseError("Too many math in a row: " + ("expected " + numMaths + ", but got " + curMaths), row[0]);
		} else if (numCols < row.length) numCols = row.length;
	});
	for (var _i5 = 0; _i5 < numCols; ++_i5) {
		var align = "r";
		var pregap = 0;
		if (_i5 % 2 === 1) align = "l";
		else if (_i5 > 0 && isAligned) pregap = 1;
		cols[_i5] = {
			type: "align",
			align,
			pregap,
			postgap: 0
		};
	}
	res.colSeparationType = isAligned ? "align" : "alignat";
	return res;
};
defineEnvironment({
	type: "array",
	names: ["array", "darray"],
	props: { numArgs: 1 },
	handler(context, args) {
		var cols = (checkSymbolNodeType(args[0]) ? [args[0]] : assertNodeType(args[0], "ordgroup").body).map(function(nde) {
			var ca = assertSymbolNodeType(nde).text;
			if ("lcr".includes(ca)) return {
				type: "align",
				align: ca
			};
			else if (ca === "|") return {
				type: "separator",
				separator: "|"
			};
			else if (ca === ":") return {
				type: "separator",
				separator: ":"
			};
			throw new ParseError("Unknown column alignment: " + ca, nde);
		});
		var res = {
			cols,
			hskipBeforeAndAfter: true,
			maxNumCols: cols.length
		};
		return parseArray(context.parser, res, dCellStyle(context.envName));
	},
	htmlBuilder: htmlBuilder$6,
	mathmlBuilder: mathmlBuilder$5
});
defineEnvironment({
	type: "array",
	names: [
		"matrix",
		"pmatrix",
		"bmatrix",
		"Bmatrix",
		"vmatrix",
		"Vmatrix",
		"matrix*",
		"pmatrix*",
		"bmatrix*",
		"Bmatrix*",
		"vmatrix*",
		"Vmatrix*"
	],
	props: { numArgs: 0 },
	handler(context) {
		var delimiters = {
			"matrix": null,
			"pmatrix": ["(", ")"],
			"bmatrix": ["[", "]"],
			"Bmatrix": ["\\{", "\\}"],
			"vmatrix": ["|", "|"],
			"Vmatrix": ["\\Vert", "\\Vert"]
		}[context.envName.replace("*", "")];
		var colAlign = "c";
		var payload = {
			hskipBeforeAndAfter: false,
			cols: [{
				type: "align",
				align: colAlign
			}]
		};
		if (context.envName.charAt(context.envName.length - 1) === "*") {
			var parser = context.parser;
			parser.consumeSpaces();
			if (parser.fetch().text === "[") {
				parser.consume();
				parser.consumeSpaces();
				colAlign = parser.fetch().text;
				if (!"lcr".includes(colAlign)) throw new ParseError("Expected l or c or r", parser.nextToken);
				parser.consume();
				parser.consumeSpaces();
				parser.expect("]");
				parser.consume();
				payload.cols = [{
					type: "align",
					align: colAlign
				}];
			}
		}
		var res = parseArray(context.parser, payload, dCellStyle(context.envName));
		var numCols = Math.max(0, ...res.body.map((row) => row.length));
		res.cols = new Array(numCols).fill({
			type: "align",
			align: colAlign
		});
		return delimiters ? {
			type: "leftright",
			mode: context.mode,
			body: [res],
			left: delimiters[0],
			right: delimiters[1],
			rightColor: void 0
		} : res;
	},
	htmlBuilder: htmlBuilder$6,
	mathmlBuilder: mathmlBuilder$5
});
defineEnvironment({
	type: "array",
	names: ["smallmatrix"],
	props: { numArgs: 0 },
	handler(context) {
		var res = parseArray(context.parser, { arraystretch: .5 }, "script");
		res.colSeparationType = "small";
		return res;
	},
	htmlBuilder: htmlBuilder$6,
	mathmlBuilder: mathmlBuilder$5
});
defineEnvironment({
	type: "array",
	names: ["subarray"],
	props: { numArgs: 1 },
	handler(context, args) {
		var cols = (checkSymbolNodeType(args[0]) ? [args[0]] : assertNodeType(args[0], "ordgroup").body).map(function(nde) {
			var ca = assertSymbolNodeType(nde).text;
			if ("lc".includes(ca)) return {
				type: "align",
				align: ca
			};
			throw new ParseError("Unknown column alignment: " + ca, nde);
		});
		if (cols.length > 1) throw new ParseError("{subarray} can contain only one column");
		var payload = {
			cols,
			hskipBeforeAndAfter: false,
			arraystretch: .5
		};
		var res = parseArray(context.parser, payload, "script");
		if (res.body.length > 0 && res.body[0].length > 1) throw new ParseError("{subarray} can contain only one column");
		return res;
	},
	htmlBuilder: htmlBuilder$6,
	mathmlBuilder: mathmlBuilder$5
});
defineEnvironment({
	type: "array",
	names: [
		"cases",
		"dcases",
		"rcases",
		"drcases"
	],
	props: { numArgs: 0 },
	handler(context) {
		var res = parseArray(context.parser, {
			arraystretch: 1.2,
			cols: [{
				type: "align",
				align: "l",
				pregap: 0,
				postgap: 1
			}, {
				type: "align",
				align: "l",
				pregap: 0,
				postgap: 0
			}]
		}, dCellStyle(context.envName));
		return {
			type: "leftright",
			mode: context.mode,
			body: [res],
			left: context.envName.includes("r") ? "." : "\\{",
			right: context.envName.includes("r") ? "\\}" : ".",
			rightColor: void 0
		};
	},
	htmlBuilder: htmlBuilder$6,
	mathmlBuilder: mathmlBuilder$5
});
defineEnvironment({
	type: "array",
	names: [
		"align",
		"align*",
		"aligned",
		"split"
	],
	props: { numArgs: 0 },
	handler: alignedHandler,
	htmlBuilder: htmlBuilder$6,
	mathmlBuilder: mathmlBuilder$5
});
defineEnvironment({
	type: "array",
	names: [
		"gathered",
		"gather",
		"gather*"
	],
	props: { numArgs: 0 },
	handler(context) {
		if (gatherEnvironments.has(context.envName)) validateAmsEnvironmentContext(context);
		var res = {
			cols: [{
				type: "align",
				align: "c"
			}],
			addJot: true,
			colSeparationType: "gather",
			autoTag: getAutoTag(context.envName),
			emptySingleRow: true,
			leqno: context.parser.settings.leqno
		};
		return parseArray(context.parser, res, "display");
	},
	htmlBuilder: htmlBuilder$6,
	mathmlBuilder: mathmlBuilder$5
});
defineEnvironment({
	type: "array",
	names: [
		"alignat",
		"alignat*",
		"alignedat"
	],
	props: { numArgs: 1 },
	handler: alignedHandler,
	htmlBuilder: htmlBuilder$6,
	mathmlBuilder: mathmlBuilder$5
});
defineEnvironment({
	type: "array",
	names: ["equation", "equation*"],
	props: { numArgs: 0 },
	handler(context) {
		validateAmsEnvironmentContext(context);
		var res = {
			autoTag: getAutoTag(context.envName),
			emptySingleRow: true,
			singleRow: true,
			maxNumCols: 1,
			leqno: context.parser.settings.leqno
		};
		return parseArray(context.parser, res, "display");
	},
	htmlBuilder: htmlBuilder$6,
	mathmlBuilder: mathmlBuilder$5
});
defineEnvironment({
	type: "array",
	names: ["CD"],
	props: { numArgs: 0 },
	handler(context) {
		validateAmsEnvironmentContext(context);
		return parseCD(context.parser);
	},
	htmlBuilder: htmlBuilder$6,
	mathmlBuilder: mathmlBuilder$5
});
defineMacro("\\nonumber", "\\gdef\\@eqnsw{0}");
defineMacro("\\notag", "\\nonumber");
defineFunction({
	type: "text",
	names: ["\\hline", "\\hdashline"],
	props: {
		numArgs: 0,
		allowedInText: true,
		allowedInMath: true
	},
	handler(context, args) {
		throw new ParseError(context.funcName + " valid only within array environment");
	}
});
var environments = _environments;
defineFunction({
	type: "environment",
	names: ["\\begin", "\\end"],
	props: {
		numArgs: 1,
		argTypes: ["text"]
	},
	handler(_ref, args) {
		var { parser, funcName } = _ref;
		var nameGroup = args[0];
		if (nameGroup.type !== "ordgroup") throw new ParseError("Invalid environment name", nameGroup);
		var envName = "";
		for (var i = 0; i < nameGroup.body.length; ++i) envName += assertNodeType(nameGroup.body[i], "textord").text;
		if (funcName === "\\begin") {
			if (!environments.hasOwnProperty(envName)) throw new ParseError("No such environment: " + envName, nameGroup);
			var env = environments[envName];
			var { args: _args, optArgs } = parser.parseArguments("\\begin{" + envName + "}", env);
			var context = {
				mode: parser.mode,
				envName,
				parser
			};
			var result = env.handler(context, _args, optArgs);
			parser.expect("\\end", false);
			var endNameToken = parser.nextToken;
			var end = assertNodeType(parser.parseFunction(), "environment");
			if (end.name !== envName) throw new ParseError("Mismatch: \\begin{" + envName + "} matched by \\end{" + end.name + "}", endNameToken);
			return result;
		}
		return {
			type: "environment",
			mode: parser.mode,
			name: envName,
			nameGroup
		};
	}
});
var htmlBuilder$5 = (group, options) => {
	var font = group.font;
	var newOptions = options.withFont(font);
	return buildGroup$1(group.body, newOptions);
};
var mathmlBuilder$4 = (group, options) => {
	var font = group.font;
	var newOptions = options.withFont(font);
	return buildGroup(group.body, newOptions);
};
var fontAliases = {
	"\\Bbb": "\\mathbb",
	"\\bold": "\\mathbf",
	"\\frak": "\\mathfrak"
};
defineFunction({
	type: "font",
	names: [
		"\\mathrm",
		"\\mathit",
		"\\mathbf",
		"\\mathnormal",
		"\\mathsfit",
		"\\mathbb",
		"\\mathcal",
		"\\mathfrak",
		"\\mathscr",
		"\\mathsf",
		"\\mathtt",
		"\\Bbb",
		"\\bold",
		"\\frak"
	],
	props: {
		numArgs: 1,
		allowedInArgument: true
	},
	handler: (_ref, args) => {
		var { parser, funcName } = _ref;
		var body = normalizeArgument(args[0]);
		var func = funcName;
		if (func in fontAliases) func = fontAliases[func];
		return {
			type: "font",
			mode: parser.mode,
			font: func.slice(1),
			body
		};
	},
	htmlBuilder: htmlBuilder$5,
	mathmlBuilder: mathmlBuilder$4
});
defineFunction({
	type: "mclass",
	names: ["\\boldsymbol", "\\bm"],
	props: { numArgs: 1 },
	handler: (_ref2, args) => {
		var { parser } = _ref2;
		var body = args[0];
		return {
			type: "mclass",
			mode: parser.mode,
			mclass: binrelClass(body),
			body: [{
				type: "font",
				mode: parser.mode,
				font: "boldsymbol",
				body
			}],
			isCharacterBox: isCharacterBox(body)
		};
	}
});
defineFunction({
	type: "font",
	names: [
		"\\rm",
		"\\sf",
		"\\tt",
		"\\bf",
		"\\it",
		"\\cal"
	],
	props: {
		numArgs: 0,
		allowedInText: true
	},
	handler: (_ref3, args) => {
		var { parser, funcName, breakOnTokenText } = _ref3;
		var { mode } = parser;
		var body = parser.parseExpression(true, breakOnTokenText);
		return {
			type: "font",
			mode,
			font: "math" + funcName.slice(1),
			body: {
				type: "ordgroup",
				mode: parser.mode,
				body
			}
		};
	},
	htmlBuilder: htmlBuilder$5,
	mathmlBuilder: mathmlBuilder$4
});
var htmlBuilder$4 = (group, options) => {
	var style = options.style;
	var nstyle = style.fracNum();
	var dstyle = style.fracDen();
	var newOptions = options.havingStyle(nstyle);
	var numerm = buildGroup$1(group.numer, newOptions, options);
	if (group.continued) {
		var hStrut = 8.5 / options.fontMetrics().ptPerEm;
		var dStrut = 3.5 / options.fontMetrics().ptPerEm;
		numerm.height = numerm.height < hStrut ? hStrut : numerm.height;
		numerm.depth = numerm.depth < dStrut ? dStrut : numerm.depth;
	}
	newOptions = options.havingStyle(dstyle);
	var denomm = buildGroup$1(group.denom, newOptions, options);
	var rule;
	var ruleWidth;
	var ruleSpacing;
	if (group.hasBarLine) {
		if (group.barSize) {
			ruleWidth = calculateSize(group.barSize, options);
			rule = makeLineSpan("frac-line", options, ruleWidth);
		} else rule = makeLineSpan("frac-line", options);
		ruleWidth = rule.height;
		ruleSpacing = rule.height;
	} else {
		rule = null;
		ruleWidth = 0;
		ruleSpacing = options.fontMetrics().defaultRuleThickness;
	}
	var numShift;
	var clearance;
	var denomShift;
	if (style.size === Style$1.DISPLAY.size) {
		numShift = options.fontMetrics().num1;
		if (ruleWidth > 0) clearance = 3 * ruleSpacing;
		else clearance = 7 * ruleSpacing;
		denomShift = options.fontMetrics().denom1;
	} else {
		if (ruleWidth > 0) {
			numShift = options.fontMetrics().num2;
			clearance = ruleSpacing;
		} else {
			numShift = options.fontMetrics().num3;
			clearance = 3 * ruleSpacing;
		}
		denomShift = options.fontMetrics().denom2;
	}
	var frac;
	if (!rule) {
		var candidateClearance = numShift - numerm.depth - (denomm.height - denomShift);
		if (candidateClearance < clearance) {
			numShift += .5 * (clearance - candidateClearance);
			denomShift += .5 * (clearance - candidateClearance);
		}
		frac = makeVList({
			positionType: "individualShift",
			children: [{
				type: "elem",
				elem: denomm,
				shift: denomShift
			}, {
				type: "elem",
				elem: numerm,
				shift: -numShift
			}]
		});
	} else {
		var axisHeight = options.fontMetrics().axisHeight;
		if (numShift - numerm.depth - (axisHeight + .5 * ruleWidth) < clearance) numShift += clearance - (numShift - numerm.depth - (axisHeight + .5 * ruleWidth));
		if (axisHeight - .5 * ruleWidth - (denomm.height - denomShift) < clearance) denomShift += clearance - (axisHeight - .5 * ruleWidth - (denomm.height - denomShift));
		var midShift = -(axisHeight - .5 * ruleWidth);
		frac = makeVList({
			positionType: "individualShift",
			children: [
				{
					type: "elem",
					elem: denomm,
					shift: denomShift
				},
				{
					type: "elem",
					elem: rule,
					shift: midShift
				},
				{
					type: "elem",
					elem: numerm,
					shift: -numShift
				}
			]
		});
	}
	newOptions = options.havingStyle(style);
	frac.height *= newOptions.sizeMultiplier / options.sizeMultiplier;
	frac.depth *= newOptions.sizeMultiplier / options.sizeMultiplier;
	var delimSize;
	if (style.size === Style$1.DISPLAY.size) delimSize = options.fontMetrics().delim1;
	else if (style.size === Style$1.SCRIPTSCRIPT.size) delimSize = options.havingStyle(Style$1.SCRIPT).fontMetrics().delim2;
	else delimSize = options.fontMetrics().delim2;
	var leftDelim;
	var rightDelim;
	if (group.leftDelim == null) leftDelim = makeNullDelimiter(options, ["mopen"]);
	else leftDelim = makeCustomSizedDelim(group.leftDelim, delimSize, true, options.havingStyle(style), group.mode, ["mopen"]);
	if (group.continued) rightDelim = makeSpan([]);
	else if (group.rightDelim == null) rightDelim = makeNullDelimiter(options, ["mclose"]);
	else rightDelim = makeCustomSizedDelim(group.rightDelim, delimSize, true, options.havingStyle(style), group.mode, ["mclose"]);
	return makeSpan(["mord"].concat(newOptions.sizingClasses(options)), [
		leftDelim,
		makeSpan(["mfrac"], [frac]),
		rightDelim
	], options);
};
var mathmlBuilder$3 = (group, options) => {
	var node = new MathNode("mfrac", [buildGroup(group.numer, options), buildGroup(group.denom, options)]);
	if (!group.hasBarLine) node.setAttribute("linethickness", "0px");
	else if (group.barSize) {
		var ruleWidth = calculateSize(group.barSize, options);
		node.setAttribute("linethickness", makeEm(ruleWidth));
	}
	if (group.leftDelim != null || group.rightDelim != null) {
		var withDelims = [];
		if (group.leftDelim != null) {
			var leftOp = new MathNode("mo", [new TextNode(group.leftDelim.replace("\\", ""))]);
			leftOp.setAttribute("fence", "true");
			withDelims.push(leftOp);
		}
		withDelims.push(node);
		if (group.rightDelim != null) {
			var rightOp = new MathNode("mo", [new TextNode(group.rightDelim.replace("\\", ""))]);
			rightOp.setAttribute("fence", "true");
			withDelims.push(rightOp);
		}
		return makeRow(withDelims);
	}
	return node;
};
var wrapWithStyle = (frac, style) => {
	if (!style) return frac;
	return {
		type: "styling",
		mode: frac.mode,
		style,
		body: [frac]
	};
};
defineFunction({
	type: "genfrac",
	names: [
		"\\cfrac",
		"\\dfrac",
		"\\frac",
		"\\tfrac",
		"\\dbinom",
		"\\binom",
		"\\tbinom",
		"\\\\atopfrac",
		"\\\\bracefrac",
		"\\\\brackfrac"
	],
	props: {
		numArgs: 2,
		allowedInArgument: true
	},
	handler: (_ref, args) => {
		var { parser, funcName } = _ref;
		var numer = args[0];
		var denom = args[1];
		var hasBarLine;
		var leftDelim = null;
		var rightDelim = null;
		switch (funcName) {
			case "\\cfrac":
			case "\\dfrac":
			case "\\frac":
			case "\\tfrac":
				hasBarLine = true;
				break;
			case "\\\\atopfrac":
				hasBarLine = false;
				break;
			case "\\dbinom":
			case "\\binom":
			case "\\tbinom":
				hasBarLine = false;
				leftDelim = "(";
				rightDelim = ")";
				break;
			case "\\\\bracefrac":
				hasBarLine = false;
				leftDelim = "\\{";
				rightDelim = "\\}";
				break;
			case "\\\\brackfrac":
				hasBarLine = false;
				leftDelim = "[";
				rightDelim = "]";
				break;
			default: throw new Error("Unrecognized genfrac command");
		}
		var continued = funcName === "\\cfrac";
		var style = null;
		if (continued || funcName.startsWith("\\d")) style = "display";
		else if (funcName.startsWith("\\t")) style = "text";
		return wrapWithStyle({
			type: "genfrac",
			mode: parser.mode,
			numer,
			denom,
			continued,
			hasBarLine,
			leftDelim,
			rightDelim,
			barSize: null
		}, style);
	},
	htmlBuilder: htmlBuilder$4,
	mathmlBuilder: mathmlBuilder$3
});
defineFunction({
	type: "infix",
	names: [
		"\\over",
		"\\choose",
		"\\atop",
		"\\brace",
		"\\brack"
	],
	props: {
		numArgs: 0,
		infix: true
	},
	handler(_ref2) {
		var { parser, funcName, token } = _ref2;
		var replaceWith;
		switch (funcName) {
			case "\\over":
				replaceWith = "\\frac";
				break;
			case "\\choose":
				replaceWith = "\\binom";
				break;
			case "\\atop":
				replaceWith = "\\\\atopfrac";
				break;
			case "\\brace":
				replaceWith = "\\\\bracefrac";
				break;
			case "\\brack":
				replaceWith = "\\\\brackfrac";
				break;
			default: throw new Error("Unrecognized infix genfrac command");
		}
		return {
			type: "infix",
			mode: parser.mode,
			replaceWith,
			token
		};
	}
});
var stylArray = [
	"display",
	"text",
	"script",
	"scriptscript"
];
var delimFromValue = function delimFromValue(delimString) {
	var delim = null;
	if (delimString.length > 0) {
		delim = delimString;
		delim = delim === "." ? null : delim;
	}
	return delim;
};
defineFunction({
	type: "genfrac",
	names: ["\\genfrac"],
	props: {
		numArgs: 6,
		allowedInArgument: true,
		argTypes: [
			"math",
			"math",
			"size",
			"text",
			"math",
			"math"
		]
	},
	handler(_ref3, args) {
		var { parser } = _ref3;
		var numer = args[4];
		var denom = args[5];
		var leftNode = normalizeArgument(args[0]);
		var leftDelim = leftNode.type === "atom" && leftNode.family === "open" ? delimFromValue(leftNode.text) : null;
		var rightNode = normalizeArgument(args[1]);
		var rightDelim = rightNode.type === "atom" && rightNode.family === "close" ? delimFromValue(rightNode.text) : null;
		var barNode = assertNodeType(args[2], "size");
		var hasBarLine;
		var barSize = null;
		if (barNode.isBlank) hasBarLine = true;
		else {
			barSize = barNode.value;
			hasBarLine = barSize.number > 0;
		}
		var size = null;
		var styl = args[3];
		if (styl.type === "ordgroup") {
			if (styl.body.length > 0) {
				var textOrd = assertNodeType(styl.body[0], "textord");
				size = stylArray[Number(textOrd.text)];
			}
		} else {
			styl = assertNodeType(styl, "textord");
			size = stylArray[Number(styl.text)];
		}
		return wrapWithStyle({
			type: "genfrac",
			mode: parser.mode,
			numer,
			denom,
			continued: false,
			hasBarLine,
			barSize,
			leftDelim,
			rightDelim
		}, size);
	}
});
defineFunction({
	type: "infix",
	names: ["\\above"],
	props: {
		numArgs: 1,
		argTypes: ["size"],
		infix: true
	},
	handler(_ref4, args) {
		var { parser, funcName, token } = _ref4;
		return {
			type: "infix",
			mode: parser.mode,
			replaceWith: "\\\\abovefrac",
			size: assertNodeType(args[0], "size").value,
			token
		};
	}
});
defineFunction({
	type: "genfrac",
	names: ["\\\\abovefrac"],
	props: {
		numArgs: 3,
		argTypes: [
			"math",
			"size",
			"math"
		]
	},
	handler: (_ref5, args) => {
		var { parser, funcName } = _ref5;
		var numer = args[0];
		var barSize = assertNodeType(args[1], "infix").size;
		if (!barSize) throw new Error("\\\\abovefrac expected size, but got " + String(barSize));
		var denom = args[2];
		var hasBarLine = barSize.number > 0;
		return {
			type: "genfrac",
			mode: parser.mode,
			numer,
			denom,
			continued: false,
			hasBarLine,
			barSize,
			leftDelim: null,
			rightDelim: null
		};
	}
});
var htmlBuilder$3 = (grp, options) => {
	var style = options.style;
	var supSubGroup;
	var group;
	if (grp.type === "supsub") {
		supSubGroup = grp.sup ? buildGroup$1(grp.sup, options.havingStyle(style.sup()), options) : buildGroup$1(grp.sub, options.havingStyle(style.sub()), options);
		group = assertNodeType(grp.base, "horizBrace");
	} else group = assertNodeType(grp, "horizBrace");
	var body = buildGroup$1(group.base, options.havingBaseStyle(Style$1.DISPLAY));
	var braceBody = stretchySvg(group, options);
	var vlist;
	if (group.isOver) vlist = makeVList({
		positionType: "firstBaseline",
		children: [
			{
				type: "elem",
				elem: body
			},
			{
				type: "kern",
				size: .1
			},
			{
				type: "elem",
				elem: braceBody,
				wrapperClasses: ["svg-align"]
			}
		]
	});
	else vlist = makeVList({
		positionType: "bottom",
		positionData: body.depth + .1 + braceBody.height,
		children: [
			{
				type: "elem",
				elem: braceBody,
				wrapperClasses: ["svg-align"]
			},
			{
				type: "kern",
				size: .1
			},
			{
				type: "elem",
				elem: body
			}
		]
	});
	if (supSubGroup) {
		var vSpan = makeSpan(["minner", group.isOver ? "mover" : "munder"], [vlist], options);
		if (group.isOver) vlist = makeVList({
			positionType: "firstBaseline",
			children: [
				{
					type: "elem",
					elem: vSpan
				},
				{
					type: "kern",
					size: .2
				},
				{
					type: "elem",
					elem: supSubGroup
				}
			]
		});
		else vlist = makeVList({
			positionType: "bottom",
			positionData: vSpan.depth + .2 + supSubGroup.height + supSubGroup.depth,
			children: [
				{
					type: "elem",
					elem: supSubGroup
				},
				{
					type: "kern",
					size: .2
				},
				{
					type: "elem",
					elem: vSpan
				}
			]
		});
	}
	return makeSpan(["minner", group.isOver ? "mover" : "munder"], [vlist], options);
};
var mathmlBuilder$2 = (group, options) => {
	var accentNode = stretchyMathML(group.label);
	return new MathNode(group.isOver ? "mover" : "munder", [buildGroup(group.base, options), accentNode]);
};
defineFunction({
	type: "horizBrace",
	names: [
		"\\overbrace",
		"\\underbrace",
		"\\overbracket",
		"\\underbracket"
	],
	props: { numArgs: 1 },
	handler(_ref, args) {
		var { parser, funcName } = _ref;
		return {
			type: "horizBrace",
			mode: parser.mode,
			label: funcName,
			isOver: funcName.includes("\\over"),
			base: args[0]
		};
	},
	htmlBuilder: htmlBuilder$3,
	mathmlBuilder: mathmlBuilder$2
});
defineFunction({
	type: "href",
	names: ["\\href"],
	props: {
		numArgs: 2,
		argTypes: ["url", "original"],
		allowedInText: true
	},
	handler: (_ref, args) => {
		var { parser } = _ref;
		var body = args[1];
		var href = assertNodeType(args[0], "url").url;
		if (!parser.settings.isTrusted({
			command: "\\href",
			url: href
		})) return parser.formatUnsupportedCmd("\\href");
		return {
			type: "href",
			mode: parser.mode,
			href,
			body: ordargument(body)
		};
	},
	htmlBuilder: (group, options) => {
		var elements = buildExpression$1(group.body, options, false);
		return makeAnchor(group.href, [], elements, options);
	},
	mathmlBuilder: (group, options) => {
		var math = buildExpressionRow(group.body, options);
		if (!(math instanceof MathNode)) math = new MathNode("mrow", [math]);
		math.setAttribute("href", group.href);
		return math;
	}
});
defineFunction({
	type: "href",
	names: ["\\url"],
	props: {
		numArgs: 1,
		argTypes: ["url"],
		allowedInText: true
	},
	handler: (_ref2, args) => {
		var { parser } = _ref2;
		var href = assertNodeType(args[0], "url").url;
		if (!parser.settings.isTrusted({
			command: "\\url",
			url: href
		})) return parser.formatUnsupportedCmd("\\url");
		var chars = [];
		for (var i = 0; i < href.length; i++) {
			var c = href[i];
			if (c === "~") c = "\\textasciitilde";
			chars.push({
				type: "textord",
				mode: "text",
				text: c
			});
		}
		var body = {
			type: "text",
			mode: parser.mode,
			font: "\\texttt",
			body: chars
		};
		return {
			type: "href",
			mode: parser.mode,
			href,
			body: ordargument(body)
		};
	}
});
defineFunction({
	type: "hbox",
	names: ["\\hbox"],
	props: {
		numArgs: 1,
		argTypes: ["text"],
		allowedInText: true,
		primitive: true
	},
	handler(_ref, args) {
		var { parser } = _ref;
		return {
			type: "hbox",
			mode: parser.mode,
			body: ordargument(args[0])
		};
	},
	htmlBuilder(group, options) {
		return makeFragment(buildExpression$1(group.body, options.withFont(""), false));
	},
	mathmlBuilder(group, options) {
		return new MathNode("mrow", buildExpression(group.body, options.withFont("")));
	}
});
defineFunction({
	type: "html",
	names: [
		"\\htmlClass",
		"\\htmlId",
		"\\htmlStyle",
		"\\htmlData"
	],
	props: {
		numArgs: 2,
		argTypes: ["raw", "original"],
		allowedInText: true
	},
	handler: (_ref, args) => {
		var { parser, funcName, token } = _ref;
		var value = assertNodeType(args[0], "raw").string;
		var body = args[1];
		if (parser.settings.strict) parser.settings.reportNonstrict("htmlExtension", "HTML extension is disabled on strict mode");
		var trustContext;
		var attributes = {};
		switch (funcName) {
			case "\\htmlClass":
				attributes.class = value;
				trustContext = {
					command: "\\htmlClass",
					class: value
				};
				break;
			case "\\htmlId":
				attributes.id = value;
				trustContext = {
					command: "\\htmlId",
					id: value
				};
				break;
			case "\\htmlStyle":
				attributes.style = value;
				trustContext = {
					command: "\\htmlStyle",
					style: value
				};
				break;
			case "\\htmlData":
				var data = value.split(",");
				for (var i = 0; i < data.length; i++) {
					var item = data[i];
					var firstEquals = item.indexOf("=");
					if (firstEquals < 0) throw new ParseError("\\htmlData key/value '" + item + "' missing equals sign");
					var key = item.slice(0, firstEquals);
					var _value = item.slice(firstEquals + 1);
					attributes["data-" + key.trim()] = _value;
				}
				trustContext = {
					command: "\\htmlData",
					attributes
				};
				break;
			default: throw new Error("Unrecognized html command");
		}
		if (!parser.settings.isTrusted(trustContext)) return parser.formatUnsupportedCmd(funcName);
		return {
			type: "html",
			mode: parser.mode,
			attributes,
			body: ordargument(body)
		};
	},
	htmlBuilder: (group, options) => {
		var elements = buildExpression$1(group.body, options, false);
		var classes = ["enclosing"];
		if (group.attributes.class) classes.push(...group.attributes.class.trim().split(/\s+/));
		var span = makeSpan(classes, elements, options);
		for (var attr in group.attributes) if (attr !== "class" && group.attributes.hasOwnProperty(attr)) span.setAttribute(attr, group.attributes[attr]);
		return span;
	},
	mathmlBuilder: (group, options) => {
		return buildExpressionRow(group.body, options);
	}
});
defineFunction({
	type: "htmlmathml",
	names: ["\\html@mathml"],
	props: {
		numArgs: 2,
		allowedInArgument: true,
		allowedInText: true
	},
	handler: (_ref, args) => {
		var { parser } = _ref;
		return {
			type: "htmlmathml",
			mode: parser.mode,
			html: ordargument(args[0]),
			mathml: ordargument(args[1])
		};
	},
	htmlBuilder: (group, options) => {
		return makeFragment(buildExpression$1(group.html, options, false));
	},
	mathmlBuilder: (group, options) => {
		return buildExpressionRow(group.mathml, options);
	}
});
var sizeData = function sizeData(str) {
	if (/^[-+]? *(\d+(\.\d*)?|\.\d+)$/.test(str)) return {
		number: +str,
		unit: "bp"
	};
	else {
		var match = /([-+]?) *(\d+(?:\.\d*)?|\.\d+) *([a-z]{2})/.exec(str);
		if (!match) throw new ParseError("Invalid size: '" + str + "' in \\includegraphics");
		var data = {
			number: +(match[1] + match[2]),
			unit: match[3]
		};
		if (!validUnit(data)) throw new ParseError("Invalid unit: '" + data.unit + "' in \\includegraphics.");
		return data;
	}
};
defineFunction({
	type: "includegraphics",
	names: ["\\includegraphics"],
	props: {
		numArgs: 1,
		numOptionalArgs: 1,
		argTypes: ["raw", "url"],
		allowedInText: false
	},
	handler: (_ref, args, optArgs) => {
		var { parser } = _ref;
		var width = {
			number: 0,
			unit: "em"
		};
		var height = {
			number: .9,
			unit: "em"
		};
		var totalheight = {
			number: 0,
			unit: "em"
		};
		var alt = "";
		if (optArgs[0]) {
			var attributes = assertNodeType(optArgs[0], "raw").string.split(",");
			for (var i = 0; i < attributes.length; i++) {
				var keyVal = attributes[i].split("=");
				if (keyVal.length === 2) {
					var str = keyVal[1].trim();
					switch (keyVal[0].trim()) {
						case "alt":
							alt = str;
							break;
						case "width":
							width = sizeData(str);
							break;
						case "height":
							height = sizeData(str);
							break;
						case "totalheight":
							totalheight = sizeData(str);
							break;
						default: throw new ParseError("Invalid key: '" + keyVal[0] + "' in \\includegraphics.");
					}
				}
			}
		}
		var src = assertNodeType(args[0], "url").url;
		if (alt === "") {
			alt = src;
			alt = alt.replace(/^.*[\\/]/, "");
			alt = alt.substring(0, alt.lastIndexOf("."));
		}
		if (!parser.settings.isTrusted({
			command: "\\includegraphics",
			url: src
		})) return parser.formatUnsupportedCmd("\\includegraphics");
		return {
			type: "includegraphics",
			mode: parser.mode,
			alt,
			width,
			height,
			totalheight,
			src
		};
	},
	htmlBuilder: (group, options) => {
		var height = calculateSize(group.height, options);
		var depth = 0;
		if (group.totalheight.number > 0) depth = calculateSize(group.totalheight, options) - height;
		var width = 0;
		if (group.width.number > 0) width = calculateSize(group.width, options);
		var style = { height: makeEm(height + depth) };
		if (width > 0) style.width = makeEm(width);
		if (depth > 0) style.verticalAlign = makeEm(-depth);
		var node = new Img(group.src, group.alt, style);
		node.height = height;
		node.depth = depth;
		return node;
	},
	mathmlBuilder: (group, options) => {
		var node = new MathNode("mglyph", []);
		node.setAttribute("alt", group.alt);
		var height = calculateSize(group.height, options);
		var depth = 0;
		if (group.totalheight.number > 0) {
			depth = calculateSize(group.totalheight, options) - height;
			node.setAttribute("valign", makeEm(-depth));
		}
		node.setAttribute("height", makeEm(height + depth));
		if (group.width.number > 0) {
			var width = calculateSize(group.width, options);
			node.setAttribute("width", makeEm(width));
		}
		node.setAttribute("src", group.src);
		return node;
	}
});
defineFunction({
	type: "kern",
	names: [
		"\\kern",
		"\\mkern",
		"\\hskip",
		"\\mskip"
	],
	props: {
		numArgs: 1,
		argTypes: ["size"],
		primitive: true,
		allowedInText: true
	},
	handler(_ref, args) {
		var { parser, funcName } = _ref;
		var size = assertNodeType(args[0], "size");
		if (parser.settings.strict) {
			var mathFunction = funcName[1] === "m";
			var muUnit = size.value.unit === "mu";
			if (mathFunction) {
				if (!muUnit) parser.settings.reportNonstrict("mathVsTextUnits", "LaTeX's " + funcName + " supports only mu units, " + ("not " + size.value.unit + " units"));
				if (parser.mode !== "math") parser.settings.reportNonstrict("mathVsTextUnits", "LaTeX's " + funcName + " works only in math mode");
			} else if (muUnit) parser.settings.reportNonstrict("mathVsTextUnits", "LaTeX's " + funcName + " doesn't support mu units");
		}
		return {
			type: "kern",
			mode: parser.mode,
			dimension: size.value
		};
	},
	htmlBuilder(group, options) {
		return makeGlue(group.dimension, options);
	},
	mathmlBuilder(group, options) {
		return new SpaceNode(calculateSize(group.dimension, options));
	}
});
defineFunction({
	type: "lap",
	names: [
		"\\mathllap",
		"\\mathrlap",
		"\\mathclap"
	],
	props: {
		numArgs: 1,
		allowedInText: true
	},
	handler: (_ref, args) => {
		var { parser, funcName } = _ref;
		var body = args[0];
		return {
			type: "lap",
			mode: parser.mode,
			alignment: funcName.slice(5),
			body
		};
	},
	htmlBuilder: (group, options) => {
		var inner;
		if (group.alignment === "clap") {
			inner = makeSpan([], [buildGroup$1(group.body, options)]);
			inner = makeSpan(["inner"], [inner], options);
		} else inner = makeSpan(["inner"], [buildGroup$1(group.body, options)]);
		var fix = makeSpan(["fix"], []);
		var node = makeSpan([group.alignment], [inner, fix], options);
		var strut = makeSpan(["strut"]);
		strut.style.height = makeEm(node.height + node.depth);
		if (node.depth) strut.style.verticalAlign = makeEm(-node.depth);
		node.children.unshift(strut);
		node = makeSpan(["thinbox"], [node], options);
		return makeSpan(["mord", "vbox"], [node], options);
	},
	mathmlBuilder: (group, options) => {
		var node = new MathNode("mpadded", [buildGroup(group.body, options)]);
		if (group.alignment !== "rlap") {
			var offset = group.alignment === "llap" ? "-1" : "-0.5";
			node.setAttribute("lspace", offset + "width");
		}
		node.setAttribute("width", "0px");
		return node;
	}
});
defineFunction({
	type: "styling",
	names: ["\\(", "$"],
	props: {
		numArgs: 0,
		allowedInText: true,
		allowedInMath: false
	},
	handler(_ref, args) {
		var { funcName, parser } = _ref;
		var outerMode = parser.mode;
		parser.switchMode("math");
		var close = funcName === "\\(" ? "\\)" : "$";
		var body = parser.parseExpression(false, close);
		parser.expect(close);
		parser.switchMode(outerMode);
		return {
			type: "styling",
			mode: parser.mode,
			style: "text",
			resetFont: true,
			body
		};
	}
});
defineFunction({
	type: "text",
	names: ["\\)", "\\]"],
	props: {
		numArgs: 0,
		allowedInText: true,
		allowedInMath: false
	},
	handler(context, args) {
		throw new ParseError("Mismatched " + context.funcName);
	}
});
var chooseMathStyle = (group, options) => {
	switch (options.style.size) {
		case Style$1.DISPLAY.size: return group.display;
		case Style$1.TEXT.size: return group.text;
		case Style$1.SCRIPT.size: return group.script;
		case Style$1.SCRIPTSCRIPT.size: return group.scriptscript;
		default: return group.text;
	}
};
defineFunction({
	type: "mathchoice",
	names: ["\\mathchoice"],
	props: {
		numArgs: 4,
		primitive: true
	},
	handler: (_ref, args) => {
		var { parser } = _ref;
		return {
			type: "mathchoice",
			mode: parser.mode,
			display: ordargument(args[0]),
			text: ordargument(args[1]),
			script: ordargument(args[2]),
			scriptscript: ordargument(args[3])
		};
	},
	htmlBuilder: (group, options) => {
		return makeFragment(buildExpression$1(chooseMathStyle(group, options), options, false));
	},
	mathmlBuilder: (group, options) => {
		return buildExpressionRow(chooseMathStyle(group, options), options);
	}
});
var assembleSupSub = (base, supGroup, subGroup, options, style, slant, baseShift) => {
	base = makeSpan([], [base]);
	var subIsSingleCharacter = subGroup && isCharacterBox(subGroup);
	var sub;
	var sup;
	if (supGroup) {
		var elem = buildGroup$1(supGroup, options.havingStyle(style.sup()), options);
		sup = {
			elem,
			kern: Math.max(options.fontMetrics().bigOpSpacing1, options.fontMetrics().bigOpSpacing3 - elem.depth)
		};
	}
	if (subGroup) {
		var _elem = buildGroup$1(subGroup, options.havingStyle(style.sub()), options);
		sub = {
			elem: _elem,
			kern: Math.max(options.fontMetrics().bigOpSpacing2, options.fontMetrics().bigOpSpacing4 - _elem.height)
		};
	}
	var finalGroup;
	if (sup && sub) finalGroup = makeVList({
		positionType: "bottom",
		positionData: options.fontMetrics().bigOpSpacing5 + sub.elem.height + sub.elem.depth + sub.kern + base.depth + baseShift,
		children: [
			{
				type: "kern",
				size: options.fontMetrics().bigOpSpacing5
			},
			{
				type: "elem",
				elem: sub.elem,
				marginLeft: makeEm(-slant)
			},
			{
				type: "kern",
				size: sub.kern
			},
			{
				type: "elem",
				elem: base
			},
			{
				type: "kern",
				size: sup.kern
			},
			{
				type: "elem",
				elem: sup.elem,
				marginLeft: makeEm(slant)
			},
			{
				type: "kern",
				size: options.fontMetrics().bigOpSpacing5
			}
		]
	});
	else if (sub) finalGroup = makeVList({
		positionType: "top",
		positionData: base.height - baseShift,
		children: [
			{
				type: "kern",
				size: options.fontMetrics().bigOpSpacing5
			},
			{
				type: "elem",
				elem: sub.elem,
				marginLeft: makeEm(-slant)
			},
			{
				type: "kern",
				size: sub.kern
			},
			{
				type: "elem",
				elem: base
			}
		]
	});
	else if (sup) finalGroup = makeVList({
		positionType: "bottom",
		positionData: base.depth + baseShift,
		children: [
			{
				type: "elem",
				elem: base
			},
			{
				type: "kern",
				size: sup.kern
			},
			{
				type: "elem",
				elem: sup.elem,
				marginLeft: makeEm(slant)
			},
			{
				type: "kern",
				size: options.fontMetrics().bigOpSpacing5
			}
		]
	});
	else return base;
	var parts = [finalGroup];
	if (sub && slant !== 0 && !subIsSingleCharacter) {
		var spacer = makeSpan(["mspace"], [], options);
		spacer.style.marginRight = makeEm(slant);
		parts.unshift(spacer);
	}
	return makeSpan(["mop", "op-limits"], parts, options);
};
var noSuccessor = /* @__PURE__ */ new Set(["\\smallint"]);
var htmlBuilder$2 = (grp, options) => {
	var supGroup;
	var subGroup;
	var hasLimits = false;
	var group;
	if (grp.type === "supsub") {
		supGroup = grp.sup;
		subGroup = grp.sub;
		group = assertNodeType(grp.base, "op");
		hasLimits = true;
	} else group = assertNodeType(grp, "op");
	var style = options.style;
	var large = false;
	if (style.size === Style$1.DISPLAY.size && group.symbol && !noSuccessor.has(group.name)) large = true;
	var base;
	var symbolItalic;
	if (group.symbol) {
		var fontName = large ? "Size2-Regular" : "Size1-Regular";
		var stash = "";
		if (group.name === "\\oiint" || group.name === "\\oiiint") {
			stash = group.name.slice(1);
			group.name = stash === "oiint" ? "\\iint" : "\\iiint";
		}
		base = makeSymbol(group.name, fontName, "math", options, [
			"mop",
			"op-symbol",
			large ? "large-op" : "small-op"
		]);
		symbolItalic = base.italic;
		if (stash.length > 0) {
			var oval = staticSvg(stash + "Size" + (large ? "2" : "1"), options);
			base = makeVList({
				positionType: "individualShift",
				children: [{
					type: "elem",
					elem: base,
					shift: 0
				}, {
					type: "elem",
					elem: oval,
					shift: large ? .08 : 0
				}]
			});
			group.name = "\\" + stash;
			base.classes.unshift("mop");
			base.italic = symbolItalic;
		}
	} else if (group.body) {
		var inner = buildExpression$1(group.body, options, true);
		if (inner.length === 1 && inner[0] instanceof SymbolNode) {
			base = inner[0];
			base.classes[0] = "mop";
		} else base = makeSpan(["mop"], inner, options);
	} else {
		var output = [];
		for (var i = 1; i < group.name.length; i++) output.push(mathsym(group.name[i], group.mode, options));
		base = makeSpan(["mop"], output, options);
	}
	var baseShift = 0;
	var slant = 0;
	if ((base instanceof SymbolNode || group.name === "\\oiint" || group.name === "\\oiiint") && !group.suppressBaseShift) {
		var _base$italic;
		baseShift = (base.height - base.depth) / 2 - options.fontMetrics().axisHeight;
		slant = (_base$italic = base.italic) != null ? _base$italic : 0;
	}
	if (hasLimits) return assembleSupSub(base, supGroup, subGroup, options, style, slant, baseShift);
	else {
		if (baseShift) {
			base.style.position = "relative";
			base.style.top = makeEm(baseShift);
		}
		return base;
	}
};
var mathmlBuilder$1 = (group, options) => {
	var node;
	if (group.symbol) {
		node = new MathNode("mo", [makeText(group.name, group.mode)]);
		if (noSuccessor.has(group.name)) node.setAttribute("largeop", "false");
	} else if (group.body) node = new MathNode("mo", buildExpression(group.body, options));
	else {
		node = new MathNode("mi", [new TextNode(group.name.slice(1))]);
		var operator = new MathNode("mo", [makeText("⁡", "text")]);
		if (group.parentIsSupSub) node = new MathNode("mrow", [node, operator]);
		else node = newDocumentFragment([node, operator]);
	}
	return node;
};
var singleCharBigOps = {
	"∏": "\\prod",
	"∐": "\\coprod",
	"∑": "\\sum",
	"⋀": "\\bigwedge",
	"⋁": "\\bigvee",
	"⋂": "\\bigcap",
	"⋃": "\\bigcup",
	"⨀": "\\bigodot",
	"⨁": "\\bigoplus",
	"⨂": "\\bigotimes",
	"⨄": "\\biguplus",
	"⨆": "\\bigsqcup"
};
defineFunction({
	type: "op",
	names: [
		"\\coprod",
		"\\bigvee",
		"\\bigwedge",
		"\\biguplus",
		"\\bigcap",
		"\\bigcup",
		"\\intop",
		"\\prod",
		"\\sum",
		"\\bigotimes",
		"\\bigoplus",
		"\\bigodot",
		"\\bigsqcup",
		"\\smallint",
		"∏",
		"∐",
		"∑",
		"⋀",
		"⋁",
		"⋂",
		"⋃",
		"⨀",
		"⨁",
		"⨂",
		"⨄",
		"⨆"
	],
	props: { numArgs: 0 },
	handler: (_ref, args) => {
		var { parser, funcName } = _ref;
		var fName = funcName;
		if (fName.length === 1) fName = singleCharBigOps[fName];
		return {
			type: "op",
			mode: parser.mode,
			limits: true,
			parentIsSupSub: false,
			symbol: true,
			name: fName
		};
	},
	htmlBuilder: htmlBuilder$2,
	mathmlBuilder: mathmlBuilder$1
});
defineFunction({
	type: "op",
	names: ["\\mathop"],
	props: {
		numArgs: 1,
		primitive: true
	},
	handler: (_ref2, args) => {
		var { parser } = _ref2;
		var body = args[0];
		return {
			type: "op",
			mode: parser.mode,
			limits: false,
			parentIsSupSub: false,
			symbol: false,
			body: ordargument(body)
		};
	},
	htmlBuilder: htmlBuilder$2,
	mathmlBuilder: mathmlBuilder$1
});
var singleCharIntegrals = {
	"∫": "\\int",
	"∬": "\\iint",
	"∭": "\\iiint",
	"∮": "\\oint",
	"∯": "\\oiint",
	"∰": "\\oiiint"
};
defineFunction({
	type: "op",
	names: [
		"\\arcsin",
		"\\arccos",
		"\\arctan",
		"\\arctg",
		"\\arcctg",
		"\\arg",
		"\\ch",
		"\\cos",
		"\\cosec",
		"\\cosh",
		"\\cot",
		"\\cotg",
		"\\coth",
		"\\csc",
		"\\ctg",
		"\\cth",
		"\\deg",
		"\\dim",
		"\\exp",
		"\\hom",
		"\\ker",
		"\\lg",
		"\\ln",
		"\\log",
		"\\sec",
		"\\sin",
		"\\sinh",
		"\\sh",
		"\\tan",
		"\\tanh",
		"\\tg",
		"\\th"
	],
	props: { numArgs: 0 },
	handler(_ref3) {
		var { parser, funcName } = _ref3;
		return {
			type: "op",
			mode: parser.mode,
			limits: false,
			parentIsSupSub: false,
			symbol: false,
			name: funcName
		};
	},
	htmlBuilder: htmlBuilder$2,
	mathmlBuilder: mathmlBuilder$1
});
defineFunction({
	type: "op",
	names: [
		"\\det",
		"\\gcd",
		"\\inf",
		"\\lim",
		"\\max",
		"\\min",
		"\\Pr",
		"\\sup"
	],
	props: { numArgs: 0 },
	handler(_ref4) {
		var { parser, funcName } = _ref4;
		return {
			type: "op",
			mode: parser.mode,
			limits: true,
			parentIsSupSub: false,
			symbol: false,
			name: funcName
		};
	},
	htmlBuilder: htmlBuilder$2,
	mathmlBuilder: mathmlBuilder$1
});
defineFunction({
	type: "op",
	names: [
		"\\int",
		"\\iint",
		"\\iiint",
		"\\oint",
		"\\oiint",
		"\\oiiint",
		"∫",
		"∬",
		"∭",
		"∮",
		"∯",
		"∰"
	],
	props: {
		numArgs: 0,
		allowedInArgument: true
	},
	handler(_ref5) {
		var { parser, funcName } = _ref5;
		var fName = funcName;
		if (fName.length === 1) fName = singleCharIntegrals[fName];
		return {
			type: "op",
			mode: parser.mode,
			limits: false,
			parentIsSupSub: false,
			symbol: true,
			name: fName
		};
	},
	htmlBuilder: htmlBuilder$2,
	mathmlBuilder: mathmlBuilder$1
});
var htmlBuilder$1 = (grp, options) => {
	var supGroup;
	var subGroup;
	var hasLimits = false;
	var group;
	if (grp.type === "supsub") {
		supGroup = grp.sup;
		subGroup = grp.sub;
		group = assertNodeType(grp.base, "operatorname");
		hasLimits = true;
	} else group = assertNodeType(grp, "operatorname");
	var base;
	if (group.body.length > 0) {
		var expression = buildExpression$1(group.body.map((child) => {
			var childText = "text" in child ? child.text : void 0;
			if (typeof childText === "string") return {
				type: "textord",
				mode: child.mode,
				text: childText
			};
			else return child;
		}), options.withFont("mathrm"), true);
		for (var i = 0; i < expression.length; i++) {
			var child = expression[i];
			if (child instanceof SymbolNode) child.text = child.text.replace(/\u2212/, "-").replace(/\u2217/, "*");
		}
		base = makeSpan(["mop"], expression, options);
	} else base = makeSpan(["mop"], [], options);
	if (hasLimits) return assembleSupSub(base, supGroup, subGroup, options, options.style, 0, 0);
	else return base;
};
var mathmlBuilder = (group, options) => {
	var expression = buildExpression(group.body, options.withFont("mathrm"));
	var isAllString = true;
	for (var i = 0; i < expression.length; i++) {
		var node = expression[i];
		if (node instanceof SpaceNode);
		else if (node instanceof MathNode) switch (node.type) {
			case "mi":
			case "mn":
			case "mspace":
			case "mtext": break;
			case "mo":
				var child = node.children[0];
				if (node.children.length === 1 && child instanceof TextNode) child.text = child.text.replace(/\u2212/, "-").replace(/\u2217/, "*");
				else isAllString = false;
				break;
			default: isAllString = false;
		}
		else isAllString = false;
	}
	if (isAllString) expression = [new TextNode(expression.map((node) => node.toText()).join(""))];
	var identifier = new MathNode("mi", expression);
	identifier.setAttribute("mathvariant", "normal");
	var operator = new MathNode("mo", [makeText("⁡", "text")]);
	if (group.parentIsSupSub) return new MathNode("mrow", [identifier, operator]);
	else return newDocumentFragment([identifier, operator]);
};
defineFunction({
	type: "operatorname",
	names: ["\\operatorname@", "\\operatornamewithlimits"],
	props: { numArgs: 1 },
	handler: (_ref, args) => {
		var { parser, funcName } = _ref;
		var body = args[0];
		return {
			type: "operatorname",
			mode: parser.mode,
			body: ordargument(body),
			alwaysHandleSupSub: funcName === "\\operatornamewithlimits",
			limits: false,
			parentIsSupSub: false
		};
	},
	htmlBuilder: htmlBuilder$1,
	mathmlBuilder
});
defineMacro("\\operatorname", "\\@ifstar\\operatornamewithlimits\\operatorname@");
defineFunctionBuilders({
	type: "ordgroup",
	htmlBuilder(group, options) {
		if (group.semisimple) return makeFragment(buildExpression$1(group.body, options, false));
		return makeSpan(["mord"], buildExpression$1(group.body, options, true), options);
	},
	mathmlBuilder(group, options) {
		return buildExpressionRow(group.body, options, true);
	}
});
defineFunction({
	type: "overline",
	names: ["\\overline"],
	props: { numArgs: 1 },
	handler(_ref, args) {
		var { parser } = _ref;
		var body = args[0];
		return {
			type: "overline",
			mode: parser.mode,
			body
		};
	},
	htmlBuilder(group, options) {
		var innerGroup = buildGroup$1(group.body, options.havingCrampedStyle());
		var line = makeLineSpan("overline-line", options);
		var defaultRuleThickness = options.fontMetrics().defaultRuleThickness;
		return makeSpan(["mord", "overline"], [makeVList({
			positionType: "firstBaseline",
			children: [
				{
					type: "elem",
					elem: innerGroup
				},
				{
					type: "kern",
					size: 3 * defaultRuleThickness
				},
				{
					type: "elem",
					elem: line
				},
				{
					type: "kern",
					size: defaultRuleThickness
				}
			]
		})], options);
	},
	mathmlBuilder(group, options) {
		var operator = new MathNode("mo", [new TextNode("‾")]);
		operator.setAttribute("stretchy", "true");
		var node = new MathNode("mover", [buildGroup(group.body, options), operator]);
		node.setAttribute("accent", "true");
		return node;
	}
});
defineFunction({
	type: "phantom",
	names: ["\\phantom"],
	props: {
		numArgs: 1,
		allowedInText: true
	},
	handler: (_ref, args) => {
		var { parser } = _ref;
		var body = args[0];
		return {
			type: "phantom",
			mode: parser.mode,
			body: ordargument(body)
		};
	},
	htmlBuilder: (group, options) => {
		return makeFragment(buildExpression$1(group.body, options.withPhantom(), false));
	},
	mathmlBuilder: (group, options) => {
		return new MathNode("mphantom", buildExpression(group.body, options));
	}
});
defineMacro("\\hphantom", "\\smash{\\phantom{#1}}");
defineFunction({
	type: "vphantom",
	names: ["\\vphantom"],
	props: {
		numArgs: 1,
		allowedInText: true
	},
	handler: (_ref2, args) => {
		var { parser } = _ref2;
		var body = args[0];
		return {
			type: "vphantom",
			mode: parser.mode,
			body
		};
	},
	htmlBuilder: (group, options) => {
		return makeSpan(["mord", "rlap"], [makeSpan(["inner"], [buildGroup$1(group.body, options.withPhantom())]), makeSpan(["fix"], [])], options);
	},
	mathmlBuilder: (group, options) => {
		var node = new MathNode("mpadded", [new MathNode("mphantom", buildExpression(ordargument(group.body), options))]);
		node.setAttribute("width", "0px");
		return node;
	}
});
defineFunction({
	type: "raisebox",
	names: ["\\raisebox"],
	props: {
		numArgs: 2,
		argTypes: ["size", "hbox"],
		allowedInText: true
	},
	handler(_ref, args) {
		var { parser } = _ref;
		var amount = assertNodeType(args[0], "size").value;
		var body = args[1];
		return {
			type: "raisebox",
			mode: parser.mode,
			dy: amount,
			body
		};
	},
	htmlBuilder(group, options) {
		var body = buildGroup$1(group.body, options);
		return makeVList({
			positionType: "shift",
			positionData: -calculateSize(group.dy, options),
			children: [{
				type: "elem",
				elem: body
			}]
		});
	},
	mathmlBuilder(group, options) {
		var node = new MathNode("mpadded", [buildGroup(group.body, options)]);
		var dy = group.dy.number + group.dy.unit;
		node.setAttribute("voffset", dy);
		return node;
	}
});
defineFunction({
	type: "internal",
	names: ["\\relax"],
	props: {
		numArgs: 0,
		allowedInText: true,
		allowedInArgument: true
	},
	handler(_ref) {
		var { parser } = _ref;
		return {
			type: "internal",
			mode: parser.mode
		};
	}
});
defineFunction({
	type: "rule",
	names: ["\\rule"],
	props: {
		numArgs: 2,
		numOptionalArgs: 1,
		allowedInText: true,
		allowedInMath: true,
		argTypes: [
			"size",
			"size",
			"size"
		]
	},
	handler(_ref, args, optArgs) {
		var { parser } = _ref;
		var shift = optArgs[0];
		var width = assertNodeType(args[0], "size");
		var height = assertNodeType(args[1], "size");
		return {
			type: "rule",
			mode: parser.mode,
			shift: shift && assertNodeType(shift, "size").value,
			width: width.value,
			height: height.value
		};
	},
	htmlBuilder(group, options) {
		var rule = makeSpan(["mord", "rule"], [], options);
		var width = calculateSize(group.width, options);
		var height = calculateSize(group.height, options);
		var shift = group.shift ? calculateSize(group.shift, options) : 0;
		rule.style.borderRightWidth = makeEm(width);
		rule.style.borderTopWidth = makeEm(height);
		rule.style.bottom = makeEm(shift);
		rule.width = width;
		rule.height = height + shift;
		rule.depth = -shift;
		rule.maxFontSize = height * 1.125 * options.sizeMultiplier;
		return rule;
	},
	mathmlBuilder(group, options) {
		var width = calculateSize(group.width, options);
		var height = calculateSize(group.height, options);
		var shift = group.shift ? calculateSize(group.shift, options) : 0;
		var color = options.color && options.getColor() || "black";
		var rule = new MathNode("mspace");
		rule.setAttribute("mathbackground", color);
		rule.setAttribute("width", makeEm(width));
		rule.setAttribute("height", makeEm(height));
		var wrapper = new MathNode("mpadded", [rule]);
		if (shift >= 0) wrapper.setAttribute("height", makeEm(shift));
		else {
			wrapper.setAttribute("height", makeEm(shift));
			wrapper.setAttribute("depth", makeEm(-shift));
		}
		wrapper.setAttribute("voffset", makeEm(shift));
		return wrapper;
	}
});
function sizingGroup(value, options, baseOptions) {
	var inner = buildExpression$1(value, options, false);
	var multiplier = options.sizeMultiplier / baseOptions.sizeMultiplier;
	for (var i = 0; i < inner.length; i++) {
		var pos = inner[i].classes.indexOf("sizing");
		if (pos < 0) Array.prototype.push.apply(inner[i].classes, options.sizingClasses(baseOptions));
		else if (inner[i].classes[pos + 1] === "reset-size" + options.size) inner[i].classes[pos + 1] = "reset-size" + baseOptions.size;
		inner[i].height *= multiplier;
		inner[i].depth *= multiplier;
	}
	return makeFragment(inner);
}
var sizeFuncs = [
	"\\tiny",
	"\\sixptsize",
	"\\scriptsize",
	"\\footnotesize",
	"\\small",
	"\\normalsize",
	"\\large",
	"\\Large",
	"\\LARGE",
	"\\huge",
	"\\Huge"
];
var htmlBuilder = (group, options) => {
	var newOptions = options.havingSize(group.size);
	return sizingGroup(group.body, newOptions, options);
};
defineFunction({
	type: "sizing",
	names: sizeFuncs,
	props: {
		numArgs: 0,
		allowedInText: true
	},
	handler: (_ref, args) => {
		var { breakOnTokenText, funcName, parser } = _ref;
		var body = parser.parseExpression(false, breakOnTokenText);
		return {
			type: "sizing",
			mode: parser.mode,
			size: sizeFuncs.indexOf(funcName) + 1,
			body
		};
	},
	htmlBuilder,
	mathmlBuilder: (group, options) => {
		var newOptions = options.havingSize(group.size);
		var node = new MathNode("mstyle", buildExpression(group.body, newOptions));
		node.setAttribute("mathsize", makeEm(newOptions.sizeMultiplier));
		return node;
	}
});
defineFunction({
	type: "smash",
	names: ["\\smash"],
	props: {
		numArgs: 1,
		numOptionalArgs: 1,
		allowedInText: true
	},
	handler: (_ref, args, optArgs) => {
		var { parser } = _ref;
		var smashHeight = false;
		var smashDepth = false;
		var tbArg = optArgs[0] && assertNodeType(optArgs[0], "ordgroup");
		if (tbArg) {
			var letter;
			for (var i = 0; i < tbArg.body.length; ++i) {
				var node = tbArg.body[i];
				letter = assertSymbolNodeType(node).text;
				if (letter === "t") smashHeight = true;
				else if (letter === "b") smashDepth = true;
				else {
					smashHeight = false;
					smashDepth = false;
					break;
				}
			}
		} else {
			smashHeight = true;
			smashDepth = true;
		}
		var body = args[0];
		return {
			type: "smash",
			mode: parser.mode,
			body,
			smashHeight,
			smashDepth
		};
	},
	htmlBuilder: (group, options) => {
		var node = makeSpan([], [buildGroup$1(group.body, options)]);
		if (!group.smashHeight && !group.smashDepth) return node;
		if (group.smashHeight) node.height = 0;
		if (group.smashDepth) node.depth = 0;
		if (group.smashHeight && group.smashDepth) return makeSpan(["mord", "smash"], [node], options);
		if (node.children) for (var i = 0; i < node.children.length; i++) {
			if (group.smashHeight) node.children[i].height = 0;
			if (group.smashDepth) node.children[i].depth = 0;
		}
		return makeSpan(["mord"], [makeVList({
			positionType: "firstBaseline",
			children: [{
				type: "elem",
				elem: node
			}]
		})], options);
	},
	mathmlBuilder: (group, options) => {
		var node = new MathNode("mpadded", [buildGroup(group.body, options)]);
		if (group.smashHeight) node.setAttribute("height", "0px");
		if (group.smashDepth) node.setAttribute("depth", "0px");
		return node;
	}
});
defineFunction({
	type: "sqrt",
	names: ["\\sqrt"],
	props: {
		numArgs: 1,
		numOptionalArgs: 1
	},
	handler(_ref, args, optArgs) {
		var { parser } = _ref;
		var index = optArgs[0];
		var body = args[0];
		return {
			type: "sqrt",
			mode: parser.mode,
			body,
			index
		};
	},
	htmlBuilder(group, options) {
		var inner = buildGroup$1(group.body, options.havingCrampedStyle());
		if (inner.height === 0) inner.height = options.fontMetrics().xHeight;
		inner = wrapFragment(inner, options);
		var theta = options.fontMetrics().defaultRuleThickness;
		var phi = theta;
		if (options.style.id < Style$1.TEXT.id) phi = options.fontMetrics().xHeight;
		var lineClearance = theta + phi / 4;
		var { span: img, ruleWidth, advanceWidth } = makeSqrtImage(inner.height + inner.depth + lineClearance + theta, options);
		var delimDepth = img.height - ruleWidth;
		if (delimDepth > inner.height + inner.depth + lineClearance) lineClearance = (lineClearance + delimDepth - inner.height - inner.depth) / 2;
		var imgShift = img.height - inner.height - lineClearance - ruleWidth;
		inner.style.paddingLeft = makeEm(advanceWidth);
		var body = makeVList({
			positionType: "firstBaseline",
			children: [
				{
					type: "elem",
					elem: inner,
					wrapperClasses: ["svg-align"]
				},
				{
					type: "kern",
					size: -(inner.height + imgShift)
				},
				{
					type: "elem",
					elem: img
				},
				{
					type: "kern",
					size: ruleWidth
				}
			]
		});
		if (!group.index) return makeSpan(["mord", "sqrt"], [body], options);
		else {
			var newOptions = options.havingStyle(Style$1.SCRIPTSCRIPT);
			var rootm = buildGroup$1(group.index, newOptions, options);
			return makeSpan(["mord", "sqrt"], [makeSpan(["root"], [makeVList({
				positionType: "shift",
				positionData: -(.6 * (body.height - body.depth)),
				children: [{
					type: "elem",
					elem: rootm
				}]
			})]), body], options);
		}
	},
	mathmlBuilder(group, options) {
		var { body, index } = group;
		return index ? new MathNode("mroot", [buildGroup(body, options), buildGroup(index, options)]) : new MathNode("msqrt", [buildGroup(body, options)]);
	}
});
var styleMap = {
	"display": Style$1.DISPLAY,
	"text": Style$1.TEXT,
	"script": Style$1.SCRIPT,
	"scriptscript": Style$1.SCRIPTSCRIPT
};
function isStyleStr(s) {
	return s in styleMap;
}
defineFunction({
	type: "styling",
	names: [
		"\\displaystyle",
		"\\textstyle",
		"\\scriptstyle",
		"\\scriptscriptstyle"
	],
	props: {
		numArgs: 0,
		allowedInText: true,
		primitive: true
	},
	handler(_ref, args) {
		var { breakOnTokenText, funcName, parser } = _ref;
		var body = parser.parseExpression(true, breakOnTokenText);
		var style = funcName.slice(1, funcName.length - 5);
		if (!isStyleStr(style)) throw new Error("Unknown style: " + style);
		return {
			type: "styling",
			mode: parser.mode,
			style,
			body
		};
	},
	htmlBuilder(group, options) {
		var newStyle = styleMap[group.style];
		var newOptions = options.havingStyle(newStyle);
		if (group.resetFont) newOptions = newOptions.withFont("");
		return sizingGroup(group.body, newOptions, options);
	},
	mathmlBuilder(group, options) {
		var newStyle = styleMap[group.style];
		var newOptions = options.havingStyle(newStyle);
		if (group.resetFont) newOptions = newOptions.withFont("");
		var node = new MathNode("mstyle", buildExpression(group.body, newOptions));
		var attr = {
			"display": ["0", "true"],
			"text": ["0", "false"],
			"script": ["1", "false"],
			"scriptscript": ["2", "false"]
		}[group.style];
		node.setAttribute("scriptlevel", attr[0]);
		node.setAttribute("displaystyle", attr[1]);
		return node;
	}
});
/**
* Sometimes, groups perform special rules when they have superscripts or
* subscripts attached to them. This function lets the `supsub` group know that
* Sometimes, groups perform special rules when they have superscripts or
* its inner element should handle the superscripts and subscripts instead of
* handling them itself.
*/
var htmlBuilderDelegate = function htmlBuilderDelegate(group, options) {
	var base = group.base;
	if (!base) return null;
	else if (base.type === "op") return base.limits && (options.style.size === Style$1.DISPLAY.size || base.alwaysHandleSupSub) ? htmlBuilder$2 : null;
	else if (base.type === "operatorname") return base.alwaysHandleSupSub && (options.style.size === Style$1.DISPLAY.size || base.limits) ? htmlBuilder$1 : null;
	else if (base.type === "accent") return isCharacterBox(base.base) ? htmlBuilder$a : null;
	else if (base.type === "horizBrace") return !group.sub === base.isOver ? htmlBuilder$3 : null;
	else return null;
};
defineFunctionBuilders({
	type: "supsub",
	htmlBuilder(group, options) {
		var builderDelegate = htmlBuilderDelegate(group, options);
		if (builderDelegate) return builderDelegate(group, options);
		var { base: valueBase, sup: valueSup, sub: valueSub } = group;
		var base = buildGroup$1(valueBase, options);
		var supm;
		var subm;
		var metrics = options.fontMetrics();
		var supShift = 0;
		var subShift = 0;
		var isCharBox = valueBase && isCharacterBox(valueBase);
		if (valueSup) {
			var newOptions = options.havingStyle(options.style.sup());
			supm = buildGroup$1(valueSup, newOptions, options);
			if (!isCharBox) supShift = base.height - newOptions.fontMetrics().supDrop * newOptions.sizeMultiplier / options.sizeMultiplier;
		}
		if (valueSub) {
			var _newOptions = options.havingStyle(options.style.sub());
			subm = buildGroup$1(valueSub, _newOptions, options);
			if (!isCharBox) subShift = base.depth + _newOptions.fontMetrics().subDrop * _newOptions.sizeMultiplier / options.sizeMultiplier;
		}
		var minSupShift;
		if (options.style === Style$1.DISPLAY) minSupShift = metrics.sup1;
		else if (options.style.cramped) minSupShift = metrics.sup3;
		else minSupShift = metrics.sup2;
		var multiplier = options.sizeMultiplier;
		var marginRight = makeEm(.5 / metrics.ptPerEm / multiplier);
		var marginLeft = null;
		if (subm) {
			var isOiint = group.base && group.base.type === "op" && group.base.name && (group.base.name === "\\oiint" || group.base.name === "\\oiiint");
			if (base instanceof SymbolNode || isOiint) {
				var _base$italic;
				marginLeft = makeEm(-((_base$italic = base.italic) != null ? _base$italic : 0));
			}
		}
		var supsub;
		if (supm && subm) {
			supShift = Math.max(supShift, minSupShift, supm.depth + .25 * metrics.xHeight);
			subShift = Math.max(subShift, metrics.sub2);
			var maxWidth = 4 * metrics.defaultRuleThickness;
			if (supShift - supm.depth - (subm.height - subShift) < maxWidth) {
				subShift = maxWidth - (supShift - supm.depth) + subm.height;
				var psi = .8 * metrics.xHeight - (supShift - supm.depth);
				if (psi > 0) {
					supShift += psi;
					subShift -= psi;
				}
			}
			supsub = makeVList({
				positionType: "individualShift",
				children: [{
					type: "elem",
					elem: subm,
					shift: subShift,
					marginRight,
					marginLeft
				}, {
					type: "elem",
					elem: supm,
					shift: -supShift,
					marginRight
				}]
			});
		} else if (subm) {
			subShift = Math.max(subShift, metrics.sub1, subm.height - .8 * metrics.xHeight);
			supsub = makeVList({
				positionType: "shift",
				positionData: subShift,
				children: [{
					type: "elem",
					elem: subm,
					marginLeft,
					marginRight
				}]
			});
		} else if (supm) {
			supShift = Math.max(supShift, minSupShift, supm.depth + .25 * metrics.xHeight);
			supsub = makeVList({
				positionType: "shift",
				positionData: -supShift,
				children: [{
					type: "elem",
					elem: supm,
					marginRight
				}]
			});
		} else throw new Error("supsub must have either sup or sub.");
		return makeSpan([getTypeOfDomTree(base, "right") || "mord"], [base, makeSpan(["msupsub"], [supsub])], options);
	},
	mathmlBuilder(group, options) {
		var isBrace = false;
		var isOver;
		var isSup;
		if (group.base && group.base.type === "horizBrace") {
			isSup = !!group.sup;
			if (isSup === group.base.isOver) {
				isBrace = true;
				isOver = group.base.isOver;
			}
		}
		if (group.base && (group.base.type === "op" || group.base.type === "operatorname")) group.base.parentIsSupSub = true;
		var children = [buildGroup(group.base, options)];
		if (group.sub) children.push(buildGroup(group.sub, options));
		if (group.sup) children.push(buildGroup(group.sup, options));
		var nodeType;
		if (isBrace) nodeType = isOver ? "mover" : "munder";
		else if (!group.sub) {
			var base = group.base;
			if (base && base.type === "op" && base.limits && (options.style === Style$1.DISPLAY || base.alwaysHandleSupSub)) nodeType = "mover";
			else if (base && base.type === "operatorname" && base.alwaysHandleSupSub && (base.limits || options.style === Style$1.DISPLAY)) nodeType = "mover";
			else nodeType = "msup";
		} else if (!group.sup) {
			var _base = group.base;
			if (_base && _base.type === "op" && _base.limits && (options.style === Style$1.DISPLAY || _base.alwaysHandleSupSub)) nodeType = "munder";
			else if (_base && _base.type === "operatorname" && _base.alwaysHandleSupSub && (_base.limits || options.style === Style$1.DISPLAY)) nodeType = "munder";
			else nodeType = "msub";
		} else {
			var _base2 = group.base;
			if (_base2 && _base2.type === "op" && _base2.limits && options.style === Style$1.DISPLAY) nodeType = "munderover";
			else if (_base2 && _base2.type === "operatorname" && _base2.alwaysHandleSupSub && (options.style === Style$1.DISPLAY || _base2.limits)) nodeType = "munderover";
			else nodeType = "msubsup";
		}
		return new MathNode(nodeType, children);
	}
});
defineFunctionBuilders({
	type: "atom",
	htmlBuilder(group, options) {
		return mathsym(group.text, group.mode, options, ["m" + group.family]);
	},
	mathmlBuilder(group, options) {
		var node = new MathNode("mo", [makeText(group.text, group.mode)]);
		if (group.family === "bin") {
			var variant = getVariant(group, options);
			if (variant === "bold-italic") node.setAttribute("mathvariant", variant);
		} else if (group.family === "punct") node.setAttribute("separator", "true");
		else if (group.family === "open" || group.family === "close") node.setAttribute("stretchy", "false");
		return node;
	}
});
var defaultVariant = {
	"mi": "italic",
	"mn": "normal",
	"mtext": "normal"
};
defineFunctionBuilders({
	type: "mathord",
	htmlBuilder(group, options) {
		return makeOrd(group, options, "mathord");
	},
	mathmlBuilder(group, options) {
		var node = new MathNode("mi", [makeText(group.text, group.mode, options)]);
		var variant = getVariant(group, options) || "italic";
		if (variant !== defaultVariant[node.type]) node.setAttribute("mathvariant", variant);
		return node;
	}
});
defineFunctionBuilders({
	type: "textord",
	htmlBuilder(group, options) {
		return makeOrd(group, options, "textord");
	},
	mathmlBuilder(group, options) {
		var text = makeText(group.text, group.mode, options);
		var variant = getVariant(group, options) || "normal";
		var node;
		if (group.mode === "text") node = new MathNode("mtext", [text]);
		else if (/[0-9]/.test(group.text)) node = new MathNode("mn", [text]);
		else if (group.text === "\\prime") node = new MathNode("mo", [text]);
		else node = new MathNode("mi", [text]);
		if (variant !== defaultVariant[node.type]) node.setAttribute("mathvariant", variant);
		return node;
	}
});
var cssSpace = {
	"\\nobreak": "nobreak",
	"\\allowbreak": "allowbreak"
};
var regularSpace = {
	" ": {},
	"\\ ": {},
	"~": { className: "nobreak" },
	"\\space": {},
	"\\nobreakspace": { className: "nobreak" }
};
defineFunctionBuilders({
	type: "spacing",
	htmlBuilder(group, options) {
		if (regularSpace.hasOwnProperty(group.text)) {
			var className = regularSpace[group.text].className || "";
			if (group.mode === "text") {
				var ord = makeOrd(group, options, "textord");
				ord.classes.push(className);
				return ord;
			} else return makeSpan(["mspace", className], [mathsym(group.text, group.mode, options)], options);
		} else if (cssSpace.hasOwnProperty(group.text)) return makeSpan(["mspace", cssSpace[group.text]], [], options);
		else throw new ParseError("Unknown type of space \"" + group.text + "\"");
	},
	mathmlBuilder(group, options) {
		var node;
		if (regularSpace.hasOwnProperty(group.text)) node = new MathNode("mtext", [new TextNode("\xA0")]);
		else if (cssSpace.hasOwnProperty(group.text)) return new MathNode("mspace");
		else throw new ParseError("Unknown type of space \"" + group.text + "\"");
		return node;
	}
});
var pad = () => {
	var padNode = new MathNode("mtd", []);
	padNode.setAttribute("width", "50%");
	return padNode;
};
defineFunctionBuilders({
	type: "tag",
	mathmlBuilder(group, options) {
		var table = new MathNode("mtable", [new MathNode("mtr", [
			pad(),
			new MathNode("mtd", [buildExpressionRow(group.body, options)]),
			pad(),
			new MathNode("mtd", [buildExpressionRow(group.tag, options)])
		])]);
		table.setAttribute("width", "100%");
		return table;
	}
});
var textFontFamilies = {
	"\\text": void 0,
	"\\textrm": "textrm",
	"\\textsf": "textsf",
	"\\texttt": "texttt",
	"\\textnormal": "textrm"
};
var textFontWeights = {
	"\\textbf": "textbf",
	"\\textmd": "textmd"
};
var textFontShapes = {
	"\\textit": "textit",
	"\\textup": "textup"
};
var optionsWithFont = (group, options) => {
	var font = group.font;
	if (!font) return options;
	else if (textFontFamilies[font]) return options.withTextFontFamily(textFontFamilies[font]);
	else if (textFontWeights[font]) return options.withTextFontWeight(textFontWeights[font]);
	else if (font === "\\emph") return options.fontShape === "textit" ? options.withTextFontShape("textup") : options.withTextFontShape("textit");
	return options.withTextFontShape(textFontShapes[font]);
};
defineFunction({
	type: "text",
	names: [
		"\\text",
		"\\textrm",
		"\\textsf",
		"\\texttt",
		"\\textnormal",
		"\\textbf",
		"\\textmd",
		"\\textit",
		"\\textup",
		"\\emph"
	],
	props: {
		numArgs: 1,
		argTypes: ["text"],
		allowedInArgument: true,
		allowedInText: true
	},
	handler(_ref, args) {
		var { parser, funcName } = _ref;
		var body = args[0];
		return {
			type: "text",
			mode: parser.mode,
			body: ordargument(body),
			font: funcName
		};
	},
	htmlBuilder(group, options) {
		var newOptions = optionsWithFont(group, options);
		return makeSpan(["mord", "text"], buildExpression$1(group.body, newOptions, true), newOptions);
	},
	mathmlBuilder(group, options) {
		var newOptions = optionsWithFont(group, options);
		return buildExpressionRow(group.body, newOptions);
	}
});
defineFunction({
	type: "underline",
	names: ["\\underline"],
	props: {
		numArgs: 1,
		allowedInText: true
	},
	handler(_ref, args) {
		var { parser } = _ref;
		return {
			type: "underline",
			mode: parser.mode,
			body: args[0]
		};
	},
	htmlBuilder(group, options) {
		var innerGroup = buildGroup$1(group.body, options);
		var line = makeLineSpan("underline-line", options);
		var defaultRuleThickness = options.fontMetrics().defaultRuleThickness;
		return makeSpan(["mord", "underline"], [makeVList({
			positionType: "top",
			positionData: innerGroup.height,
			children: [
				{
					type: "kern",
					size: defaultRuleThickness
				},
				{
					type: "elem",
					elem: line
				},
				{
					type: "kern",
					size: 3 * defaultRuleThickness
				},
				{
					type: "elem",
					elem: innerGroup
				}
			]
		})], options);
	},
	mathmlBuilder(group, options) {
		var operator = new MathNode("mo", [new TextNode("‾")]);
		operator.setAttribute("stretchy", "true");
		var node = new MathNode("munder", [buildGroup(group.body, options), operator]);
		node.setAttribute("accentunder", "true");
		return node;
	}
});
defineFunction({
	type: "vcenter",
	names: ["\\vcenter"],
	props: {
		numArgs: 1,
		argTypes: ["original"],
		allowedInText: false
	},
	handler(_ref, args) {
		var { parser } = _ref;
		return {
			type: "vcenter",
			mode: parser.mode,
			body: args[0]
		};
	},
	htmlBuilder(group, options) {
		var body = buildGroup$1(group.body, options);
		var axisHeight = options.fontMetrics().axisHeight;
		return makeVList({
			positionType: "shift",
			positionData: .5 * (body.height - axisHeight - (body.depth + axisHeight)),
			children: [{
				type: "elem",
				elem: body
			}]
		});
	},
	mathmlBuilder(group, options) {
		return new MathNode("mrow", [new MathNode("mpadded", [buildGroup(group.body, options)], ["vcenter"])]);
	}
});
defineFunction({
	type: "verb",
	names: ["\\verb"],
	props: {
		numArgs: 0,
		allowedInText: true
	},
	handler(context, args, optArgs) {
		throw new ParseError("\\verb ended by end of line instead of matching delimiter");
	},
	htmlBuilder(group, options) {
		var text = makeVerb(group);
		var body = [];
		var newOptions = options.havingStyle(options.style.text());
		for (var i = 0; i < text.length; i++) {
			var c = text[i];
			if (c === "~") c = "\\textasciitilde";
			body.push(makeSymbol(c, "Typewriter-Regular", group.mode, newOptions, ["mord", "texttt"]));
		}
		return makeSpan(["mord", "text"].concat(newOptions.sizingClasses(options)), tryCombineChars(body), newOptions);
	},
	mathmlBuilder(group, options) {
		var node = new MathNode("mtext", [new TextNode(makeVerb(group))]);
		node.setAttribute("mathvariant", "monospace");
		return node;
	}
});
/**
* Converts verb group into body string.
*
* \verb* replaces each space with an open box \u2423
* \verb replaces each space with a no-break space \xA0
*/
var makeVerb = (group) => group.body.replace(/ /g, group.star ? "␣" : "\xA0");
/** Include this to ensure that all functions are defined. */
var functions = _functions;
/**
* The Lexer class handles tokenizing the input in various ways. Since our
* parser expects us to be able to backtrack, the lexer allows lexing from any
* given starting point.
*
* Its main exposed function is the `lex` function, which takes a position to
* lex from and a type of token to lex. It defers to the appropriate `_innerLex`
* function.
*
* The various `_innerLex` functions perform the actual lexing of different
* kinds.
*/
var spaceRegexString = "[ \r\n	]";
var controlWordRegexString = "\\\\[a-zA-Z@]+";
var controlSymbolRegexString = "\\\\[^\ud800-\udfff]";
var controlWordWhitespaceRegexString = "(" + controlWordRegexString + ")" + spaceRegexString + "*";
var controlSpaceRegexString = "\\\\(\n|[ \r	]+\n?)[ \r	]*";
var combiningDiacriticalMarkString = "[̀-ͯ]";
var combiningDiacriticalMarksEndRegex = new RegExp(combiningDiacriticalMarkString + "+$");
var tokenRegexString = "(" + spaceRegexString + "+)|" + (controlSpaceRegexString + "|") + "([!-\\[\\]-‧‪-퟿豈-￿]" + (combiningDiacriticalMarkString + "*") + "|[\ud800-\udbff][\udc00-\udfff]" + (combiningDiacriticalMarkString + "*") + "|\\\\verb\\*([^]).*?\\4|\\\\verb([^*a-zA-Z]).*?\\5" + ("|" + controlWordWhitespaceRegexString) + ("|" + controlSymbolRegexString + ")");
/** Main Lexer class */
var Lexer = class {
	constructor(input, settings) {
		this.input = void 0;
		this.settings = void 0;
		this.tokenRegex = void 0;
		this.catcodes = void 0;
		this.input = input;
		this.settings = settings;
		this.tokenRegex = new RegExp(tokenRegexString, "g");
		this.catcodes = {
			"%": 14,
			"~": 13
		};
	}
	setCatcode(char, code) {
		this.catcodes[char] = code;
	}
	/**
	* This function lexes a single token.
	*/
	lex() {
		var input = this.input;
		var pos = this.tokenRegex.lastIndex;
		if (pos === input.length) return new Token("EOF", new SourceLocation(this, pos, pos));
		var match = this.tokenRegex.exec(input);
		if (match === null || match.index !== pos) throw new ParseError("Unexpected character: '" + input[pos] + "'", new Token(input[pos], new SourceLocation(this, pos, pos + 1)));
		var text = match[6] || match[3] || (match[2] ? "\\ " : " ");
		if (this.catcodes[text] === 14) {
			var nlIndex = input.indexOf("\n", this.tokenRegex.lastIndex);
			if (nlIndex === -1) {
				this.tokenRegex.lastIndex = input.length;
				this.settings.reportNonstrict("commentAtEnd", "% comment has no terminating newline; LaTeX would fail because of commenting the end of math mode (e.g. $)");
			} else this.tokenRegex.lastIndex = nlIndex + 1;
			return this.lex();
		}
		return new Token(text, new SourceLocation(this, pos, this.tokenRegex.lastIndex));
	}
};
/**
* A `Namespace` refers to a space of nameable things like macros or lengths,
* which can be `set` either globally or local to a nested group, using an
* undo stack similar to how TeX implements this functionality.
* Performance-wise, `get` and local `set` take constant time, while global
* `set` takes time proportional to the depth of group nesting.
*/
var Namespace = class {
	/**
	* Both arguments are optional.  The first argument is an object of
	* built-in mappings which never change.  The second argument is an object
	* of initial (global-level) mappings, which will constantly change
	* according to any global/top-level `set`s done.
	*/
	constructor(builtins, globalMacros) {
		if (builtins === void 0) builtins = {};
		if (globalMacros === void 0) globalMacros = {};
		this.current = void 0;
		this.builtins = void 0;
		this.undefStack = void 0;
		this.current = globalMacros;
		this.builtins = builtins;
		this.undefStack = [];
	}
	/**
	* Start a new nested group, affecting future local `set`s.
	*/
	beginGroup() {
		this.undefStack.push({});
	}
	/**
	* End current nested group, restoring values before the group began.
	*/
	endGroup() {
		if (this.undefStack.length === 0) throw new ParseError("Unbalanced namespace destruction: attempt to pop global namespace; please report this as a bug");
		var undefs = this.undefStack.pop();
		for (var undef in undefs) if (undefs.hasOwnProperty(undef)) {
			if (undefs[undef] == null) delete this.current[undef];
			else this.current[undef] = undefs[undef];
		}
	}
	/**
	* Ends all currently nested groups (if any), restoring values before the
	* groups began.  Useful in case of an error in the middle of parsing.
	*/
	endGroups() {
		while (this.undefStack.length > 0) this.endGroup();
	}
	/**
	* Detect whether `name` has a definition.  Equivalent to
	* `get(name) != null`.
	*/
	has(name) {
		return this.current.hasOwnProperty(name) || this.builtins.hasOwnProperty(name);
	}
	/**
	* Get the current value of a name, or `undefined` if there is no value.
	*
	* Note: Do not use `if (namespace.get(...))` to detect whether a macro
	* is defined, as the definition may be the empty string which evaluates
	* to `false` in JavaScript.  Use `if (namespace.get(...) != null)` or
	* `if (namespace.has(...))`.
	*/
	get(name) {
		if (this.current.hasOwnProperty(name)) return this.current[name];
		else return this.builtins[name];
	}
	/**
	* Set the current value of a name, and optionally set it globally too.
	* Local set() sets the current value and (when appropriate) adds an undo
	* operation to the undo stack.  Global set() may change the undo
	* operation at every level, so takes time linear in their number.
	* A value of undefined means to delete existing definitions.
	*/
	set(name, value, global) {
		if (global === void 0) global = false;
		if (global) {
			for (var i = 0; i < this.undefStack.length; i++) delete this.undefStack[i][name];
			if (this.undefStack.length > 0) this.undefStack[this.undefStack.length - 1][name] = value;
		} else {
			var top = this.undefStack[this.undefStack.length - 1];
			if (top && !top.hasOwnProperty(name)) top[name] = this.current[name];
		}
		if (value == null) delete this.current[name];
		else this.current[name] = value;
	}
};
/**
* Predefined macros for KaTeX.
* This can be used to define some commands in terms of others.
*/
var macros = _macros;
defineMacro("\\noexpand", function(context) {
	var t = context.popToken();
	if (context.isExpandable(t.text)) {
		t.noexpand = true;
		t.treatAsRelax = true;
	}
	return {
		tokens: [t],
		numArgs: 0
	};
});
defineMacro("\\expandafter", function(context) {
	var t = context.popToken();
	context.expandOnce(true);
	return {
		tokens: [t],
		numArgs: 0
	};
});
defineMacro("\\@firstoftwo", function(context) {
	return {
		tokens: context.consumeArgs(2)[0],
		numArgs: 0
	};
});
defineMacro("\\@secondoftwo", function(context) {
	return {
		tokens: context.consumeArgs(2)[1],
		numArgs: 0
	};
});
defineMacro("\\@ifnextchar", function(context) {
	var args = context.consumeArgs(3);
	context.consumeSpaces();
	var nextToken = context.future();
	if (args[0].length === 1 && args[0][0].text === nextToken.text) return {
		tokens: args[1],
		numArgs: 0
	};
	else return {
		tokens: args[2],
		numArgs: 0
	};
});
defineMacro("\\@ifstar", "\\@ifnextchar *{\\@firstoftwo{#1}}");
defineMacro("\\TextOrMath", function(context) {
	var args = context.consumeArgs(2);
	if (context.mode === "text") return {
		tokens: args[0],
		numArgs: 0
	};
	else return {
		tokens: args[1],
		numArgs: 0
	};
});
var digitToNumber = {
	"0": 0,
	"1": 1,
	"2": 2,
	"3": 3,
	"4": 4,
	"5": 5,
	"6": 6,
	"7": 7,
	"8": 8,
	"9": 9,
	"a": 10,
	"A": 10,
	"b": 11,
	"B": 11,
	"c": 12,
	"C": 12,
	"d": 13,
	"D": 13,
	"e": 14,
	"E": 14,
	"f": 15,
	"F": 15
};
defineMacro("\\char", function(context) {
	var token = context.popToken();
	var base;
	var number = 0;
	if (token.text === "'") {
		base = 8;
		token = context.popToken();
	} else if (token.text === "\"") {
		base = 16;
		token = context.popToken();
	} else if (token.text === "`") {
		token = context.popToken();
		if (token.text[0] === "\\") number = token.text.charCodeAt(1);
		else if (token.text === "EOF") throw new ParseError("\\char` missing argument");
		else number = token.text.charCodeAt(0);
	} else base = 10;
	if (base) {
		number = digitToNumber[token.text];
		if (number == null || number >= base) throw new ParseError("Invalid base-" + base + " digit " + token.text);
		var digit;
		while ((digit = digitToNumber[context.future().text]) != null && digit < base) {
			number *= base;
			number += digit;
			context.popToken();
		}
	}
	return "\\@char{" + number + "}";
});
var newcommand = (context, existsOK, nonexistsOK, skipIfExists) => {
	var arg = context.consumeArg().tokens;
	if (arg.length !== 1) throw new ParseError("\\newcommand's first argument must be a macro name");
	var name = arg[0].text;
	var exists = context.isDefined(name);
	if (exists && !existsOK) throw new ParseError("\\newcommand{" + name + "} attempting to redefine " + (name + "; use \\renewcommand"));
	if (!exists && !nonexistsOK) throw new ParseError("\\renewcommand{" + name + "} when command " + name + " does not yet exist; use \\newcommand");
	var numArgs = 0;
	arg = context.consumeArg().tokens;
	if (arg.length === 1 && arg[0].text === "[") {
		var argText = "";
		var token = context.expandNextToken();
		while (token.text !== "]" && token.text !== "EOF") {
			argText += token.text;
			token = context.expandNextToken();
		}
		if (!argText.match(/^\s*[0-9]+\s*$/)) throw new ParseError("Invalid number of arguments: " + argText);
		numArgs = parseInt(argText);
		arg = context.consumeArg().tokens;
	}
	if (!(exists && skipIfExists)) context.macros.set(name, {
		tokens: arg,
		numArgs
	});
	return "";
};
defineMacro("\\newcommand", (context) => newcommand(context, false, true, false));
defineMacro("\\renewcommand", (context) => newcommand(context, true, false, false));
defineMacro("\\providecommand", (context) => newcommand(context, true, true, true));
defineMacro("\\message", (context) => {
	var arg = context.consumeArgs(1)[0];
	console.log(arg.reverse().map((token) => token.text).join(""));
	return "";
});
defineMacro("\\errmessage", (context) => {
	var arg = context.consumeArgs(1)[0];
	console.error(arg.reverse().map((token) => token.text).join(""));
	return "";
});
defineMacro("\\show", (context) => {
	var tok = context.popToken();
	var name = tok.text;
	console.log(tok, context.macros.get(name), functions[name], symbols.math[name], symbols.text[name]);
	return "";
});
defineMacro("\\bgroup", "{");
defineMacro("\\egroup", "}");
defineMacro("~", "\\nobreakspace");
defineMacro("\\lq", "`");
defineMacro("\\rq", "'");
defineMacro("\\aa", "\\r a");
defineMacro("\\AA", "\\r A");
defineMacro("\\textcopyright", "\\html@mathml{\\textcircled{c}}{\\char`©}");
defineMacro("\\copyright", "\\TextOrMath{\\textcopyright}{\\text{\\textcopyright}}");
defineMacro("\\textregistered", "\\html@mathml{\\textcircled{\\scriptsize R}}{\\char`®}");
defineMacro("ℬ", "\\mathscr{B}");
defineMacro("ℰ", "\\mathscr{E}");
defineMacro("ℱ", "\\mathscr{F}");
defineMacro("ℋ", "\\mathscr{H}");
defineMacro("ℐ", "\\mathscr{I}");
defineMacro("ℒ", "\\mathscr{L}");
defineMacro("ℳ", "\\mathscr{M}");
defineMacro("ℛ", "\\mathscr{R}");
defineMacro("ℭ", "\\mathfrak{C}");
defineMacro("ℌ", "\\mathfrak{H}");
defineMacro("ℨ", "\\mathfrak{Z}");
defineMacro("\\Bbbk", "\\Bbb{k}");
defineMacro("\\llap", "\\mathllap{\\textrm{#1}}");
defineMacro("\\rlap", "\\mathrlap{\\textrm{#1}}");
defineMacro("\\clap", "\\mathclap{\\textrm{#1}}");
defineMacro("\\mathstrut", "\\vphantom{(}");
defineMacro("\\underbar", "\\underline{\\text{#1}}");
defineMacro("\\not", "\\html@mathml{\\mathrel{\\mathrlap\\@not}\\nobreak}{\\char\"338}");
defineMacro("\\neq", "\\html@mathml{\\mathrel{\\not=}}{\\mathrel{\\char`≠}}");
defineMacro("\\ne", "\\neq");
defineMacro("≠", "\\neq");
defineMacro("\\notin", "\\html@mathml{\\mathrel{{\\in}\\mathllap{/\\mskip1mu}}}{\\mathrel{\\char`∉}}");
defineMacro("∉", "\\notin");
defineMacro("≘", "\\html@mathml{\\mathrel{=\\kern{-1em}\\raisebox{0.4em}{$\\scriptsize\\frown$}}}{\\mathrel{\\char`≘}}");
defineMacro("≙", "\\html@mathml{\\stackrel{\\tiny\\wedge}{=}}{\\mathrel{\\char`≘}}");
defineMacro("≚", "\\html@mathml{\\stackrel{\\tiny\\vee}{=}}{\\mathrel{\\char`≚}}");
defineMacro("≛", "\\html@mathml{\\stackrel{\\scriptsize\\star}{=}}{\\mathrel{\\char`≛}}");
defineMacro("≝", "\\html@mathml{\\stackrel{\\tiny\\mathrm{def}}{=}}{\\mathrel{\\char`≝}}");
defineMacro("≞", "\\html@mathml{\\stackrel{\\tiny\\mathrm{m}}{=}}{\\mathrel{\\char`≞}}");
defineMacro("≟", "\\html@mathml{\\stackrel{\\tiny?}{=}}{\\mathrel{\\char`≟}}");
defineMacro("⟂", "\\perp");
defineMacro("‼", "\\mathclose{!\\mkern-0.8mu!}");
defineMacro("∌", "\\notni");
defineMacro("⌜", "\\ulcorner");
defineMacro("⌝", "\\urcorner");
defineMacro("⌞", "\\llcorner");
defineMacro("⌟", "\\lrcorner");
defineMacro("©", "\\copyright");
defineMacro("®", "\\textregistered");
defineMacro("\\ulcorner", "\\html@mathml{\\@ulcorner}{\\mathop{\\char\"231c}}");
defineMacro("\\urcorner", "\\html@mathml{\\@urcorner}{\\mathop{\\char\"231d}}");
defineMacro("\\llcorner", "\\html@mathml{\\@llcorner}{\\mathop{\\char\"231e}}");
defineMacro("\\lrcorner", "\\html@mathml{\\@lrcorner}{\\mathop{\\char\"231f}}");
defineMacro("\\vdots", "{\\varvdots\\rule{0pt}{15pt}}");
defineMacro("⋮", "\\vdots");
defineMacro("\\varGamma", "\\mathit{\\Gamma}");
defineMacro("\\varDelta", "\\mathit{\\Delta}");
defineMacro("\\varTheta", "\\mathit{\\Theta}");
defineMacro("\\varLambda", "\\mathit{\\Lambda}");
defineMacro("\\varXi", "\\mathit{\\Xi}");
defineMacro("\\varPi", "\\mathit{\\Pi}");
defineMacro("\\varSigma", "\\mathit{\\Sigma}");
defineMacro("\\varUpsilon", "\\mathit{\\Upsilon}");
defineMacro("\\varPhi", "\\mathit{\\Phi}");
defineMacro("\\varPsi", "\\mathit{\\Psi}");
defineMacro("\\varOmega", "\\mathit{\\Omega}");
defineMacro("\\substack", "\\begin{subarray}{c}#1\\end{subarray}");
defineMacro("\\colon", "\\nobreak\\mskip2mu\\mathpunct{}\\mathchoice{\\mkern-3mu}{\\mkern-3mu}{}{}{:}\\mskip6mu\\relax");
defineMacro("\\boxed", "\\fbox{$\\displaystyle{#1}$}");
defineMacro("\\iff", "\\DOTSB\\;\\Longleftrightarrow\\;");
defineMacro("\\implies", "\\DOTSB\\;\\Longrightarrow\\;");
defineMacro("\\impliedby", "\\DOTSB\\;\\Longleftarrow\\;");
defineMacro("\\dddot", "{\\overset{\\raisebox{-0.1ex}{\\normalsize ...}}{#1}}");
defineMacro("\\ddddot", "{\\overset{\\raisebox{-0.1ex}{\\normalsize ....}}{#1}}");
var dotsByToken = {
	",": "\\dotsc",
	"\\not": "\\dotsb",
	"+": "\\dotsb",
	"=": "\\dotsb",
	"<": "\\dotsb",
	">": "\\dotsb",
	"-": "\\dotsb",
	"*": "\\dotsb",
	":": "\\dotsb",
	"\\DOTSB": "\\dotsb",
	"\\coprod": "\\dotsb",
	"\\bigvee": "\\dotsb",
	"\\bigwedge": "\\dotsb",
	"\\biguplus": "\\dotsb",
	"\\bigcap": "\\dotsb",
	"\\bigcup": "\\dotsb",
	"\\prod": "\\dotsb",
	"\\sum": "\\dotsb",
	"\\bigotimes": "\\dotsb",
	"\\bigoplus": "\\dotsb",
	"\\bigodot": "\\dotsb",
	"\\bigsqcup": "\\dotsb",
	"\\And": "\\dotsb",
	"\\longrightarrow": "\\dotsb",
	"\\Longrightarrow": "\\dotsb",
	"\\longleftarrow": "\\dotsb",
	"\\Longleftarrow": "\\dotsb",
	"\\longleftrightarrow": "\\dotsb",
	"\\Longleftrightarrow": "\\dotsb",
	"\\mapsto": "\\dotsb",
	"\\longmapsto": "\\dotsb",
	"\\hookrightarrow": "\\dotsb",
	"\\doteq": "\\dotsb",
	"\\mathbin": "\\dotsb",
	"\\mathrel": "\\dotsb",
	"\\relbar": "\\dotsb",
	"\\Relbar": "\\dotsb",
	"\\xrightarrow": "\\dotsb",
	"\\xleftarrow": "\\dotsb",
	"\\DOTSI": "\\dotsi",
	"\\int": "\\dotsi",
	"\\oint": "\\dotsi",
	"\\iint": "\\dotsi",
	"\\iiint": "\\dotsi",
	"\\iiiint": "\\dotsi",
	"\\idotsint": "\\dotsi",
	"\\DOTSX": "\\dotsx"
};
var dotsbGroups = /* @__PURE__ */ new Set(["bin", "rel"]);
defineMacro("\\dots", function(context) {
	var thedots = "\\dotso";
	var next = context.expandAfterFuture().text;
	if (next in dotsByToken) thedots = dotsByToken[next];
	else if (next.slice(0, 4) === "\\not") thedots = "\\dotsb";
	else if (next in symbols.math) {
		if (dotsbGroups.has(symbols.math[next].group)) thedots = "\\dotsb";
	}
	return thedots;
});
var spaceAfterDots = {
	")": true,
	"]": true,
	"\\rbrack": true,
	"\\}": true,
	"\\rbrace": true,
	"\\rangle": true,
	"\\rceil": true,
	"\\rfloor": true,
	"\\rgroup": true,
	"\\rmoustache": true,
	"\\right": true,
	"\\bigr": true,
	"\\biggr": true,
	"\\Bigr": true,
	"\\Biggr": true,
	"$": true,
	";": true,
	".": true,
	",": true
};
defineMacro("\\dotso", function(context) {
	if (context.future().text in spaceAfterDots) return "\\ldots\\,";
	else return "\\ldots";
});
defineMacro("\\dotsc", function(context) {
	var next = context.future().text;
	if (next in spaceAfterDots && next !== ",") return "\\ldots\\,";
	else return "\\ldots";
});
defineMacro("\\cdots", function(context) {
	if (context.future().text in spaceAfterDots) return "\\@cdots\\,";
	else return "\\@cdots";
});
defineMacro("\\dotsb", "\\cdots");
defineMacro("\\dotsm", "\\cdots");
defineMacro("\\dotsi", "\\!\\cdots");
defineMacro("\\dotsx", "\\ldots\\,");
defineMacro("\\DOTSI", "\\relax");
defineMacro("\\DOTSB", "\\relax");
defineMacro("\\DOTSX", "\\relax");
defineMacro("\\tmspace", "\\TextOrMath{\\kern#1#3}{\\mskip#1#2}\\relax");
defineMacro("\\,", "\\tmspace+{3mu}{.1667em}");
defineMacro("\\thinspace", "\\,");
defineMacro("\\>", "\\mskip{4mu}");
defineMacro("\\:", "\\tmspace+{4mu}{.2222em}");
defineMacro("\\medspace", "\\:");
defineMacro("\\;", "\\tmspace+{5mu}{.2777em}");
defineMacro("\\thickspace", "\\;");
defineMacro("\\!", "\\tmspace-{3mu}{.1667em}");
defineMacro("\\negthinspace", "\\!");
defineMacro("\\negmedspace", "\\tmspace-{4mu}{.2222em}");
defineMacro("\\negthickspace", "\\tmspace-{5mu}{.277em}");
defineMacro("\\enspace", "\\kern.5em ");
defineMacro("\\enskip", "\\hskip.5em\\relax");
defineMacro("\\quad", "\\hskip1em\\relax");
defineMacro("\\qquad", "\\hskip2em\\relax");
defineMacro("\\tag", "\\@ifstar\\tag@literal\\tag@paren");
defineMacro("\\tag@paren", "\\tag@literal{({#1})}");
defineMacro("\\tag@literal", (context) => {
	if (context.macros.get("\\df@tag")) throw new ParseError("Multiple \\tag");
	return "\\gdef\\df@tag{\\text{#1}}";
});
defineMacro("\\bmod", "\\mathchoice{\\mskip1mu}{\\mskip1mu}{\\mskip5mu}{\\mskip5mu}\\mathbin{\\rm mod}\\mathchoice{\\mskip1mu}{\\mskip1mu}{\\mskip5mu}{\\mskip5mu}");
defineMacro("\\pod", "\\allowbreak\\mathchoice{\\mkern18mu}{\\mkern8mu}{\\mkern8mu}{\\mkern8mu}(#1)");
defineMacro("\\pmod", "\\pod{{\\rm mod}\\mkern6mu#1}");
defineMacro("\\mod", "\\allowbreak\\mathchoice{\\mkern18mu}{\\mkern12mu}{\\mkern12mu}{\\mkern12mu}{\\rm mod}\\,\\,#1");
defineMacro("\\newline", "\\\\\\relax");
defineMacro("\\TeX", "\\textrm{\\html@mathml{T\\kern-.1667em\\raisebox{-.5ex}{E}\\kern-.125emX}{TeX}}");
var latexRaiseA = makeEm(fontMetricsData["Main-Regular"]["T".charCodeAt(0)][1] - .7 * fontMetricsData["Main-Regular"]["A".charCodeAt(0)][1]);
defineMacro("\\LaTeX", "\\textrm{\\html@mathml{" + ("L\\kern-.36em\\raisebox{" + latexRaiseA + "}{\\scriptstyle A}") + "\\kern-.15em\\TeX}{LaTeX}}");
defineMacro("\\KaTeX", "\\textrm{\\html@mathml{" + ("K\\kern-.17em\\raisebox{" + latexRaiseA + "}{\\scriptstyle A}") + "\\kern-.15em\\TeX}{KaTeX}}");
defineMacro("\\hspace", "\\@ifstar\\@hspacer\\@hspace");
defineMacro("\\@hspace", "\\hskip #1\\relax");
defineMacro("\\@hspacer", "\\rule{0pt}{0pt}\\hskip #1\\relax");
defineMacro("\\ordinarycolon", ":");
defineMacro("\\vcentcolon", "\\mathrel{\\mathop\\ordinarycolon}");
defineMacro("\\dblcolon", "\\html@mathml{\\mathrel{\\vcentcolon\\mathrel{\\mkern-.9mu}\\vcentcolon}}{\\mathop{\\char\"2237}}");
defineMacro("\\coloneqq", "\\html@mathml{\\mathrel{\\vcentcolon\\mathrel{\\mkern-1.2mu}=}}{\\mathop{\\char\"2254}}");
defineMacro("\\Coloneqq", "\\html@mathml{\\mathrel{\\dblcolon\\mathrel{\\mkern-1.2mu}=}}{\\mathop{\\char\"2237\\char\"3d}}");
defineMacro("\\coloneq", "\\html@mathml{\\mathrel{\\vcentcolon\\mathrel{\\mkern-1.2mu}\\mathrel{-}}}{\\mathop{\\char\"3a\\char\"2212}}");
defineMacro("\\Coloneq", "\\html@mathml{\\mathrel{\\dblcolon\\mathrel{\\mkern-1.2mu}\\mathrel{-}}}{\\mathop{\\char\"2237\\char\"2212}}");
defineMacro("\\eqqcolon", "\\html@mathml{\\mathrel{=\\mathrel{\\mkern-1.2mu}\\vcentcolon}}{\\mathop{\\char\"2255}}");
defineMacro("\\Eqqcolon", "\\html@mathml{\\mathrel{=\\mathrel{\\mkern-1.2mu}\\dblcolon}}{\\mathop{\\char\"3d\\char\"2237}}");
defineMacro("\\eqcolon", "\\html@mathml{\\mathrel{\\mathrel{-}\\mathrel{\\mkern-1.2mu}\\vcentcolon}}{\\mathop{\\char\"2239}}");
defineMacro("\\Eqcolon", "\\html@mathml{\\mathrel{\\mathrel{-}\\mathrel{\\mkern-1.2mu}\\dblcolon}}{\\mathop{\\char\"2212\\char\"2237}}");
defineMacro("\\colonapprox", "\\html@mathml{\\mathrel{\\vcentcolon\\mathrel{\\mkern-1.2mu}\\approx}}{\\mathop{\\char\"3a\\char\"2248}}");
defineMacro("\\Colonapprox", "\\html@mathml{\\mathrel{\\dblcolon\\mathrel{\\mkern-1.2mu}\\approx}}{\\mathop{\\char\"2237\\char\"2248}}");
defineMacro("\\colonsim", "\\html@mathml{\\mathrel{\\vcentcolon\\mathrel{\\mkern-1.2mu}\\sim}}{\\mathop{\\char\"3a\\char\"223c}}");
defineMacro("\\Colonsim", "\\html@mathml{\\mathrel{\\dblcolon\\mathrel{\\mkern-1.2mu}\\sim}}{\\mathop{\\char\"2237\\char\"223c}}");
defineMacro("∷", "\\dblcolon");
defineMacro("∹", "\\eqcolon");
defineMacro("≔", "\\coloneqq");
defineMacro("≕", "\\eqqcolon");
defineMacro("⩴", "\\Coloneqq");
defineMacro("\\ratio", "\\vcentcolon");
defineMacro("\\coloncolon", "\\dblcolon");
defineMacro("\\colonequals", "\\coloneqq");
defineMacro("\\coloncolonequals", "\\Coloneqq");
defineMacro("\\equalscolon", "\\eqqcolon");
defineMacro("\\equalscoloncolon", "\\Eqqcolon");
defineMacro("\\colonminus", "\\coloneq");
defineMacro("\\coloncolonminus", "\\Coloneq");
defineMacro("\\minuscolon", "\\eqcolon");
defineMacro("\\minuscoloncolon", "\\Eqcolon");
defineMacro("\\coloncolonapprox", "\\Colonapprox");
defineMacro("\\coloncolonsim", "\\Colonsim");
defineMacro("\\simcolon", "\\mathrel{\\sim\\mathrel{\\mkern-1.2mu}\\vcentcolon}");
defineMacro("\\simcoloncolon", "\\mathrel{\\sim\\mathrel{\\mkern-1.2mu}\\dblcolon}");
defineMacro("\\approxcolon", "\\mathrel{\\approx\\mathrel{\\mkern-1.2mu}\\vcentcolon}");
defineMacro("\\approxcoloncolon", "\\mathrel{\\approx\\mathrel{\\mkern-1.2mu}\\dblcolon}");
defineMacro("\\notni", "\\html@mathml{\\not\\ni}{\\mathrel{\\char`∌}}");
defineMacro("\\limsup", "\\DOTSB\\operatorname*{lim\\,sup}");
defineMacro("\\liminf", "\\DOTSB\\operatorname*{lim\\,inf}");
defineMacro("\\injlim", "\\DOTSB\\operatorname*{inj\\,lim}");
defineMacro("\\projlim", "\\DOTSB\\operatorname*{proj\\,lim}");
defineMacro("\\varlimsup", "\\DOTSB\\operatorname*{\\overline{lim}}");
defineMacro("\\varliminf", "\\DOTSB\\operatorname*{\\underline{lim}}");
defineMacro("\\varinjlim", "\\DOTSB\\operatorname*{\\underrightarrow{lim}}");
defineMacro("\\varprojlim", "\\DOTSB\\operatorname*{\\underleftarrow{lim}}");
defineMacro("\\gvertneqq", "\\html@mathml{\\@gvertneqq}{≩}");
defineMacro("\\lvertneqq", "\\html@mathml{\\@lvertneqq}{≨}");
defineMacro("\\ngeqq", "\\html@mathml{\\@ngeqq}{≱}");
defineMacro("\\ngeqslant", "\\html@mathml{\\@ngeqslant}{≱}");
defineMacro("\\nleqq", "\\html@mathml{\\@nleqq}{≰}");
defineMacro("\\nleqslant", "\\html@mathml{\\@nleqslant}{≰}");
defineMacro("\\nshortmid", "\\html@mathml{\\@nshortmid}{∤}");
defineMacro("\\nshortparallel", "\\html@mathml{\\@nshortparallel}{∦}");
defineMacro("\\nsubseteqq", "\\html@mathml{\\@nsubseteqq}{⊈}");
defineMacro("\\nsupseteqq", "\\html@mathml{\\@nsupseteqq}{⊉}");
defineMacro("\\varsubsetneq", "\\html@mathml{\\@varsubsetneq}{⊊}");
defineMacro("\\varsubsetneqq", "\\html@mathml{\\@varsubsetneqq}{⫋}");
defineMacro("\\varsupsetneq", "\\html@mathml{\\@varsupsetneq}{⊋}");
defineMacro("\\varsupsetneqq", "\\html@mathml{\\@varsupsetneqq}{⫌}");
defineMacro("\\imath", "\\html@mathml{\\@imath}{ı}");
defineMacro("\\jmath", "\\html@mathml{\\@jmath}{ȷ}");
defineMacro("\\llbracket", "\\html@mathml{\\mathopen{[\\mkern-3.2mu[}}{\\mathopen{\\char`⟦}}");
defineMacro("\\rrbracket", "\\html@mathml{\\mathclose{]\\mkern-3.2mu]}}{\\mathclose{\\char`⟧}}");
defineMacro("⟦", "\\llbracket");
defineMacro("⟧", "\\rrbracket");
defineMacro("\\lBrace", "\\html@mathml{\\mathopen{\\{\\mkern-3.2mu[}}{\\mathopen{\\char`⦃}}");
defineMacro("\\rBrace", "\\html@mathml{\\mathclose{]\\mkern-3.2mu\\}}}{\\mathclose{\\char`⦄}}");
defineMacro("⦃", "\\lBrace");
defineMacro("⦄", "\\rBrace");
defineMacro("\\minuso", "\\mathbin{\\html@mathml{{\\mathrlap{\\mathchoice{\\kern{0.145em}}{\\kern{0.145em}}{\\kern{0.1015em}}{\\kern{0.0725em}}\\circ}{-}}}{\\char`⦵}}");
defineMacro("⦵", "\\minuso");
defineMacro("\\darr", "\\downarrow");
defineMacro("\\dArr", "\\Downarrow");
defineMacro("\\Darr", "\\Downarrow");
defineMacro("\\lang", "\\langle");
defineMacro("\\rang", "\\rangle");
defineMacro("\\uarr", "\\uparrow");
defineMacro("\\uArr", "\\Uparrow");
defineMacro("\\Uarr", "\\Uparrow");
defineMacro("\\N", "\\mathbb{N}");
defineMacro("\\R", "\\mathbb{R}");
defineMacro("\\Z", "\\mathbb{Z}");
defineMacro("\\alef", "\\aleph");
defineMacro("\\alefsym", "\\aleph");
defineMacro("\\Alpha", "\\mathrm{A}");
defineMacro("\\Beta", "\\mathrm{B}");
defineMacro("\\bull", "\\bullet");
defineMacro("\\Chi", "\\mathrm{X}");
defineMacro("\\clubs", "\\clubsuit");
defineMacro("\\cnums", "\\mathbb{C}");
defineMacro("\\Complex", "\\mathbb{C}");
defineMacro("\\Dagger", "\\ddagger");
defineMacro("\\diamonds", "\\diamondsuit");
defineMacro("\\empty", "\\emptyset");
defineMacro("\\Epsilon", "\\mathrm{E}");
defineMacro("\\Eta", "\\mathrm{H}");
defineMacro("\\exist", "\\exists");
defineMacro("\\harr", "\\leftrightarrow");
defineMacro("\\hArr", "\\Leftrightarrow");
defineMacro("\\Harr", "\\Leftrightarrow");
defineMacro("\\hearts", "\\heartsuit");
defineMacro("\\image", "\\Im");
defineMacro("\\infin", "\\infty");
defineMacro("\\Iota", "\\mathrm{I}");
defineMacro("\\isin", "\\in");
defineMacro("\\Kappa", "\\mathrm{K}");
defineMacro("\\larr", "\\leftarrow");
defineMacro("\\lArr", "\\Leftarrow");
defineMacro("\\Larr", "\\Leftarrow");
defineMacro("\\lrarr", "\\leftrightarrow");
defineMacro("\\lrArr", "\\Leftrightarrow");
defineMacro("\\Lrarr", "\\Leftrightarrow");
defineMacro("\\Mu", "\\mathrm{M}");
defineMacro("\\natnums", "\\mathbb{N}");
defineMacro("\\Nu", "\\mathrm{N}");
defineMacro("\\Omicron", "\\mathrm{O}");
defineMacro("\\plusmn", "\\pm");
defineMacro("\\rarr", "\\rightarrow");
defineMacro("\\rArr", "\\Rightarrow");
defineMacro("\\Rarr", "\\Rightarrow");
defineMacro("\\real", "\\Re");
defineMacro("\\reals", "\\mathbb{R}");
defineMacro("\\Reals", "\\mathbb{R}");
defineMacro("\\Rho", "\\mathrm{P}");
defineMacro("\\sdot", "\\cdot");
defineMacro("\\sect", "\\S");
defineMacro("\\spades", "\\spadesuit");
defineMacro("\\sub", "\\subset");
defineMacro("\\sube", "\\subseteq");
defineMacro("\\supe", "\\supseteq");
defineMacro("\\Tau", "\\mathrm{T}");
defineMacro("\\thetasym", "\\vartheta");
defineMacro("\\weierp", "\\wp");
defineMacro("\\Zeta", "\\mathrm{Z}");
defineMacro("\\argmin", "\\DOTSB\\operatorname*{arg\\,min}");
defineMacro("\\argmax", "\\DOTSB\\operatorname*{arg\\,max}");
defineMacro("\\plim", "\\DOTSB\\mathop{\\operatorname{plim}}\\limits");
defineMacro("\\bra", "\\mathinner{\\langle{#1}|}");
defineMacro("\\ket", "\\mathinner{|{#1}\\rangle}");
defineMacro("\\braket", "\\mathinner{\\langle{#1}\\rangle}");
defineMacro("\\Bra", "\\left\\langle#1\\right|");
defineMacro("\\Ket", "\\left|#1\\right\\rangle");
var braketHelper = (one) => (context) => {
	var left = context.consumeArg().tokens;
	var middle = context.consumeArg().tokens;
	var middleDouble = context.consumeArg().tokens;
	var right = context.consumeArg().tokens;
	var oldMiddle = context.macros.get("|");
	var oldMiddleDouble = context.macros.get("\\|");
	context.macros.beginGroup();
	var midMacro = (double) => (context) => {
		if (one) {
			context.macros.set("|", oldMiddle);
			if (middleDouble.length) context.macros.set("\\|", oldMiddleDouble);
		}
		var doubled = double;
		if (!double && middleDouble.length) {
			if (context.future().text === "|") {
				context.popToken();
				doubled = true;
			}
		}
		return {
			tokens: doubled ? middleDouble : middle,
			numArgs: 0
		};
	};
	context.macros.set("|", midMacro(false));
	if (middleDouble.length) context.macros.set("\\|", midMacro(true));
	var arg = context.consumeArg().tokens;
	var expanded = context.expandTokens([
		...right,
		...arg,
		...left
	]);
	context.macros.endGroup();
	return {
		tokens: expanded.reverse(),
		numArgs: 0
	};
};
defineMacro("\\bra@ket", braketHelper(false));
defineMacro("\\bra@set", braketHelper(true));
defineMacro("\\Braket", "\\bra@ket{\\left\\langle}{\\,\\middle\\vert\\,}{\\,\\middle\\vert\\,}{\\right\\rangle}");
defineMacro("\\Set", "\\bra@set{\\left\\{\\:}{\\;\\middle\\vert\\;}{\\;\\middle\\Vert\\;}{\\:\\right\\}}");
defineMacro("\\set", "\\bra@set{\\{\\,}{\\mid}{}{\\,\\}}");
defineMacro("\\angln", "{\\angl n}");
defineMacro("\\blue", "\\textcolor{##6495ed}{#1}");
defineMacro("\\orange", "\\textcolor{##ffa500}{#1}");
defineMacro("\\pink", "\\textcolor{##ff00af}{#1}");
defineMacro("\\red", "\\textcolor{##df0030}{#1}");
defineMacro("\\green", "\\textcolor{##28ae7b}{#1}");
defineMacro("\\gray", "\\textcolor{gray}{#1}");
defineMacro("\\purple", "\\textcolor{##9d38bd}{#1}");
defineMacro("\\blueA", "\\textcolor{##ccfaff}{#1}");
defineMacro("\\blueB", "\\textcolor{##80f6ff}{#1}");
defineMacro("\\blueC", "\\textcolor{##63d9ea}{#1}");
defineMacro("\\blueD", "\\textcolor{##11accd}{#1}");
defineMacro("\\blueE", "\\textcolor{##0c7f99}{#1}");
defineMacro("\\tealA", "\\textcolor{##94fff5}{#1}");
defineMacro("\\tealB", "\\textcolor{##26edd5}{#1}");
defineMacro("\\tealC", "\\textcolor{##01d1c1}{#1}");
defineMacro("\\tealD", "\\textcolor{##01a995}{#1}");
defineMacro("\\tealE", "\\textcolor{##208170}{#1}");
defineMacro("\\greenA", "\\textcolor{##b6ffb0}{#1}");
defineMacro("\\greenB", "\\textcolor{##8af281}{#1}");
defineMacro("\\greenC", "\\textcolor{##74cf70}{#1}");
defineMacro("\\greenD", "\\textcolor{##1fab54}{#1}");
defineMacro("\\greenE", "\\textcolor{##0d923f}{#1}");
defineMacro("\\goldA", "\\textcolor{##ffd0a9}{#1}");
defineMacro("\\goldB", "\\textcolor{##ffbb71}{#1}");
defineMacro("\\goldC", "\\textcolor{##ff9c39}{#1}");
defineMacro("\\goldD", "\\textcolor{##e07d10}{#1}");
defineMacro("\\goldE", "\\textcolor{##a75a05}{#1}");
defineMacro("\\redA", "\\textcolor{##fca9a9}{#1}");
defineMacro("\\redB", "\\textcolor{##ff8482}{#1}");
defineMacro("\\redC", "\\textcolor{##f9685d}{#1}");
defineMacro("\\redD", "\\textcolor{##e84d39}{#1}");
defineMacro("\\redE", "\\textcolor{##bc2612}{#1}");
defineMacro("\\maroonA", "\\textcolor{##ffbde0}{#1}");
defineMacro("\\maroonB", "\\textcolor{##ff92c6}{#1}");
defineMacro("\\maroonC", "\\textcolor{##ed5fa6}{#1}");
defineMacro("\\maroonD", "\\textcolor{##ca337c}{#1}");
defineMacro("\\maroonE", "\\textcolor{##9e034e}{#1}");
defineMacro("\\purpleA", "\\textcolor{##ddd7ff}{#1}");
defineMacro("\\purpleB", "\\textcolor{##c6b9fc}{#1}");
defineMacro("\\purpleC", "\\textcolor{##aa87ff}{#1}");
defineMacro("\\purpleD", "\\textcolor{##7854ab}{#1}");
defineMacro("\\purpleE", "\\textcolor{##543b78}{#1}");
defineMacro("\\mintA", "\\textcolor{##f5f9e8}{#1}");
defineMacro("\\mintB", "\\textcolor{##edf2df}{#1}");
defineMacro("\\mintC", "\\textcolor{##e0e5cc}{#1}");
defineMacro("\\grayA", "\\textcolor{##f6f7f7}{#1}");
defineMacro("\\grayB", "\\textcolor{##f0f1f2}{#1}");
defineMacro("\\grayC", "\\textcolor{##e3e5e6}{#1}");
defineMacro("\\grayD", "\\textcolor{##d6d8da}{#1}");
defineMacro("\\grayE", "\\textcolor{##babec2}{#1}");
defineMacro("\\grayF", "\\textcolor{##888d93}{#1}");
defineMacro("\\grayG", "\\textcolor{##626569}{#1}");
defineMacro("\\grayH", "\\textcolor{##3b3e40}{#1}");
defineMacro("\\grayI", "\\textcolor{##21242c}{#1}");
defineMacro("\\kaBlue", "\\textcolor{##314453}{#1}");
defineMacro("\\kaGreen", "\\textcolor{##71B307}{#1}");
/**
* This file contains the “gullet” where macros are expanded
* until only non-macro tokens remain.
*/
var implicitCommands = {
	"^": true,
	"_": true,
	"\\limits": true,
	"\\nolimits": true
};
var MacroExpander = class {
	constructor(input, settings, mode) {
		this.settings = void 0;
		this.expansionCount = void 0;
		this.lexer = void 0;
		this.macros = void 0;
		this.stack = void 0;
		this.mode = void 0;
		this.settings = settings;
		this.expansionCount = 0;
		this.feed(input);
		this.macros = new Namespace(macros, settings.macros);
		this.mode = mode;
		this.stack = [];
	}
	/**
	* Feed a new input string to the same MacroExpander
	* (with existing macros etc.).
	*/
	feed(input) {
		this.lexer = new Lexer(input, this.settings);
	}
	/**
	* Switches between "text" and "math" modes.
	*/
	switchMode(newMode) {
		this.mode = newMode;
	}
	/**
	* Start a new group nesting within all namespaces.
	*/
	beginGroup() {
		this.macros.beginGroup();
	}
	/**
	* End current group nesting within all namespaces.
	*/
	endGroup() {
		this.macros.endGroup();
	}
	/**
	* Ends all currently nested groups (if any), restoring values before the
	* groups began.  Useful in case of an error in the middle of parsing.
	*/
	endGroups() {
		this.macros.endGroups();
	}
	/**
	* Returns the topmost token on the stack, without expanding it.
	* Similar in behavior to TeX's `\futurelet`.
	*/
	future() {
		if (this.stack.length === 0) this.pushToken(this.lexer.lex());
		return this.stack[this.stack.length - 1];
	}
	/**
	* Remove and return the next unexpanded token.
	*/
	popToken() {
		this.future();
		return this.stack.pop();
	}
	/**
	* Add a given token to the token stack.  In particular, this get be used
	* to put back a token returned from one of the other methods.
	*/
	pushToken(token) {
		this.stack.push(token);
	}
	/**
	* Append an array of tokens to the token stack.
	*/
	pushTokens(tokens) {
		this.stack.push(...tokens);
	}
	/**
	* Find an macro argument without expanding tokens and append the array of
	* tokens to the token stack. Uses Token as a container for the result.
	*/
	scanArgument(isOptional) {
		var start;
		var end;
		var tokens;
		if (isOptional) {
			this.consumeSpaces();
			if (this.future().text !== "[") return null;
			start = this.popToken();
			({tokens, end} = this.consumeArg(["]"]));
		} else ({tokens, start, end} = this.consumeArg());
		this.pushToken(new Token("EOF", end.loc));
		this.pushTokens(tokens);
		return new Token("", SourceLocation.range(start, end));
	}
	/**
	* Consume all following space tokens, without expansion.
	*/
	consumeSpaces() {
		for (;;) if (this.future().text === " ") this.stack.pop();
		else break;
	}
	/**
	* Consume an argument from the token stream, and return the resulting array
	* of tokens and start/end token.
	*/
	consumeArg(delims) {
		var tokens = [];
		var isDelimited = delims && delims.length > 0;
		if (!isDelimited) this.consumeSpaces();
		var start = this.future();
		var tok;
		var depth = 0;
		var match = 0;
		do {
			tok = this.popToken();
			tokens.push(tok);
			if (tok.text === "{") ++depth;
			else if (tok.text === "}") {
				--depth;
				if (depth === -1) throw new ParseError("Extra }", tok);
			} else if (tok.text === "EOF") throw new ParseError("Unexpected end of input in a macro argument, expected '" + (delims && isDelimited ? delims[match] : "}") + "'", tok);
			if (delims && isDelimited) {
				if ((depth === 0 || depth === 1 && delims[match] === "{") && tok.text === delims[match]) {
					++match;
					if (match === delims.length) {
						tokens.splice(-match, match);
						break;
					}
				} else match = 0;
			}
		} while (depth !== 0 || isDelimited);
		if (start.text === "{" && tokens[tokens.length - 1].text === "}") {
			tokens.pop();
			tokens.shift();
		}
		tokens.reverse();
		return {
			tokens,
			start,
			end: tok
		};
	}
	/**
	* Consume the specified number of (delimited) arguments from the token
	* stream and return the resulting array of arguments.
	*/
	consumeArgs(numArgs, delimiters) {
		if (delimiters) {
			if (delimiters.length !== numArgs + 1) throw new ParseError("The length of delimiters doesn't match the number of args!");
			var delims = delimiters[0];
			for (var i = 0; i < delims.length; i++) {
				var tok = this.popToken();
				if (delims[i] !== tok.text) throw new ParseError("Use of the macro doesn't match its definition", tok);
			}
		}
		var args = [];
		for (var _i = 0; _i < numArgs; _i++) args.push(this.consumeArg(delimiters && delimiters[_i + 1]).tokens);
		return args;
	}
	/**
	* Increment `expansionCount` by the specified amount.
	* Throw an error if it exceeds `maxExpand`.
	*/
	countExpansion(amount) {
		this.expansionCount += amount;
		if (this.expansionCount > this.settings.maxExpand) throw new ParseError("Too many expansions: infinite loop or need to increase maxExpand setting");
	}
	/**
	* Expand the next token only once if possible.
	*
	* If the token is expanded, the resulting tokens will be pushed onto
	* the stack in reverse order, and the number of such tokens will be
	* returned.  This number might be zero or positive.
	*
	* If not, the return value is `false`, and the next token remains at the
	* top of the stack.
	*
	* In either case, the next token will be on the top of the stack,
	* or the stack will be empty (in case of empty expansion
	* and no other tokens).
	*
	* Used to implement `expandAfterFuture` and `expandNextToken`.
	*
	* If expandableOnly, only expandable tokens are expanded and
	* an undefined control sequence results in an error.
	*/
	expandOnce(expandableOnly) {
		var topToken = this.popToken();
		var name = topToken.text;
		var expansion = !topToken.noexpand ? this._getExpansion(name) : null;
		if (expansion == null || expandableOnly && expansion.unexpandable) {
			if (expandableOnly && expansion == null && name[0] === "\\" && !this.isDefined(name)) throw new ParseError("Undefined control sequence: " + name);
			this.pushToken(topToken);
			return false;
		}
		this.countExpansion(1);
		var tokens = expansion.tokens;
		var args = this.consumeArgs(expansion.numArgs, expansion.delimiters);
		if (expansion.numArgs) {
			tokens = tokens.slice();
			for (var i = tokens.length - 1; i >= 0; --i) {
				var tok = tokens[i];
				if (tok.text === "#") {
					if (i === 0) throw new ParseError("Incomplete placeholder at end of macro body", tok);
					tok = tokens[--i];
					if (tok.text === "#") tokens.splice(i + 1, 1);
					else if (/^[1-9]$/.test(tok.text)) tokens.splice(i, 2, ...args[+tok.text - 1]);
					else throw new ParseError("Not a valid argument number", tok);
				}
			}
		}
		this.pushTokens(tokens);
		return tokens.length;
	}
	/**
	* Expand the next token only once (if possible), and return the resulting
	* top token on the stack (without removing anything from the stack).
	* Similar in behavior to TeX's `\expandafter\futurelet`.
	* Equivalent to expandOnce() followed by future().
	*/
	expandAfterFuture() {
		this.expandOnce();
		return this.future();
	}
	/**
	* Recursively expand first token, then return first non-expandable token.
	*/
	expandNextToken() {
		for (;;) if (this.expandOnce() === false) {
			var token = this.stack.pop();
			if (token.treatAsRelax) token.text = "\\relax";
			return token;
		}
	}
	/**
	* Fully expand the given macro name and return the resulting list of
	* tokens, or return `undefined` if no such macro is defined.
	*/
	expandMacro(name) {
		return this.macros.has(name) ? this.expandTokens([new Token(name)]) : void 0;
	}
	/**
	* Fully expand the given token stream and return the resulting list of
	* tokens.  Note that the input tokens are in reverse order, but the
	* output tokens are in forward order.
	*/
	expandTokens(tokens) {
		var output = [];
		var oldStackLength = this.stack.length;
		this.pushTokens(tokens);
		while (this.stack.length > oldStackLength) if (this.expandOnce(true) === false) {
			var token = this.stack.pop();
			if (token.treatAsRelax) {
				token.noexpand = false;
				token.treatAsRelax = false;
			}
			output.push(token);
		}
		this.countExpansion(output.length);
		return output;
	}
	/**
	* Fully expand the given macro name and return the result as a string,
	* or return `undefined` if no such macro is defined.
	*/
	expandMacroAsText(name) {
		var tokens = this.expandMacro(name);
		if (tokens) return tokens.map((token) => token.text).join("");
		else return tokens;
	}
	/**
	* Returns the expanded macro as a reversed array of tokens and a macro
	* argument count.  Or returns `null` if no such macro.
	*/
	_getExpansion(name) {
		var definition = this.macros.get(name);
		if (definition == null) return definition;
		if (name.length === 1) {
			var catcode = this.lexer.catcodes[name];
			if (catcode != null && catcode !== 13) return;
		}
		var expansion = typeof definition === "function" ? definition(this) : definition;
		if (typeof expansion === "string") {
			var numArgs = 0;
			if (expansion.includes("#")) {
				var stripped = expansion.replace(/##/g, "");
				while (stripped.includes("#" + (numArgs + 1))) ++numArgs;
			}
			var bodyLexer = new Lexer(expansion, this.settings);
			var tokens = [];
			var tok = bodyLexer.lex();
			while (tok.text !== "EOF") {
				tokens.push(tok);
				tok = bodyLexer.lex();
			}
			tokens.reverse();
			return {
				tokens,
				numArgs
			};
		}
		return expansion;
	}
	/**
	* Determine whether a command is currently "defined" (has some
	* functionality), meaning that it's a macro (in the current group),
	* a function, a symbol, or one of the special commands listed in
	* `implicitCommands`.
	*/
	isDefined(name) {
		return this.macros.has(name) || functions.hasOwnProperty(name) || symbols.math.hasOwnProperty(name) || symbols.text.hasOwnProperty(name) || implicitCommands.hasOwnProperty(name);
	}
	/**
	* Determine whether a command is expandable.
	*/
	isExpandable(name) {
		var macro = this.macros.get(name);
		return macro != null ? typeof macro === "string" || typeof macro === "function" || !macro.unexpandable : functions.hasOwnProperty(name) && !functions[name].primitive;
	}
};
var unicodeSubRegEx = /^[₊₋₌₍₎₀₁₂₃₄₅₆₇₈₉ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓᵦᵧᵨᵩᵪ]/;
var uSubsAndSups = Object.freeze({
	"₊": "+",
	"₋": "-",
	"₌": "=",
	"₍": "(",
	"₎": ")",
	"₀": "0",
	"₁": "1",
	"₂": "2",
	"₃": "3",
	"₄": "4",
	"₅": "5",
	"₆": "6",
	"₇": "7",
	"₈": "8",
	"₉": "9",
	"ₐ": "a",
	"ₑ": "e",
	"ₕ": "h",
	"ᵢ": "i",
	"ⱼ": "j",
	"ₖ": "k",
	"ₗ": "l",
	"ₘ": "m",
	"ₙ": "n",
	"ₒ": "o",
	"ₚ": "p",
	"ᵣ": "r",
	"ₛ": "s",
	"ₜ": "t",
	"ᵤ": "u",
	"ᵥ": "v",
	"ₓ": "x",
	"ᵦ": "β",
	"ᵧ": "γ",
	"ᵨ": "ρ",
	"ᵩ": "ϕ",
	"ᵪ": "χ",
	"⁺": "+",
	"⁻": "-",
	"⁼": "=",
	"⁽": "(",
	"⁾": ")",
	"⁰": "0",
	"¹": "1",
	"²": "2",
	"³": "3",
	"⁴": "4",
	"⁵": "5",
	"⁶": "6",
	"⁷": "7",
	"⁸": "8",
	"⁹": "9",
	"ᴬ": "A",
	"ᴮ": "B",
	"ᴰ": "D",
	"ᴱ": "E",
	"ᴳ": "G",
	"ᴴ": "H",
	"ᴵ": "I",
	"ᴶ": "J",
	"ᴷ": "K",
	"ᴸ": "L",
	"ᴹ": "M",
	"ᴺ": "N",
	"ᴼ": "O",
	"ᴾ": "P",
	"ᴿ": "R",
	"ᵀ": "T",
	"ᵁ": "U",
	"ⱽ": "V",
	"ᵂ": "W",
	"ᵃ": "a",
	"ᵇ": "b",
	"ᶜ": "c",
	"ᵈ": "d",
	"ᵉ": "e",
	"ᶠ": "f",
	"ᵍ": "g",
	"ʰ": "h",
	"ⁱ": "i",
	"ʲ": "j",
	"ᵏ": "k",
	"ˡ": "l",
	"ᵐ": "m",
	"ⁿ": "n",
	"ᵒ": "o",
	"ᵖ": "p",
	"ʳ": "r",
	"ˢ": "s",
	"ᵗ": "t",
	"ᵘ": "u",
	"ᵛ": "v",
	"ʷ": "w",
	"ˣ": "x",
	"ʸ": "y",
	"ᶻ": "z",
	"ᵝ": "β",
	"ᵞ": "γ",
	"ᵟ": "δ",
	"ᵠ": "ϕ",
	"ᵡ": "χ",
	"ᶿ": "θ"
});
var unicodeAccents = {
	"́": {
		"text": "\\'",
		"math": "\\acute"
	},
	"̀": {
		"text": "\\`",
		"math": "\\grave"
	},
	"̈": {
		"text": "\\\"",
		"math": "\\ddot"
	},
	"̃": {
		"text": "\\~",
		"math": "\\tilde"
	},
	"̄": {
		"text": "\\=",
		"math": "\\bar"
	},
	"̆": {
		"text": "\\u",
		"math": "\\breve"
	},
	"̌": {
		"text": "\\v",
		"math": "\\check"
	},
	"̂": {
		"text": "\\^",
		"math": "\\hat"
	},
	"̇": {
		"text": "\\.",
		"math": "\\dot"
	},
	"̊": {
		"text": "\\r",
		"math": "\\mathring"
	},
	"̋": { "text": "\\H" },
	"̧": { "text": "\\c" }
};
var unicodeSymbols = {
	"á": "á",
	"à": "à",
	"ä": "ä",
	"ǟ": "ǟ",
	"ã": "ã",
	"ā": "ā",
	"ă": "ă",
	"ắ": "ắ",
	"ằ": "ằ",
	"ẵ": "ẵ",
	"ǎ": "ǎ",
	"â": "â",
	"ấ": "ấ",
	"ầ": "ầ",
	"ẫ": "ẫ",
	"ȧ": "ȧ",
	"ǡ": "ǡ",
	"å": "å",
	"ǻ": "ǻ",
	"ḃ": "ḃ",
	"ć": "ć",
	"ḉ": "ḉ",
	"č": "č",
	"ĉ": "ĉ",
	"ċ": "ċ",
	"ç": "ç",
	"ď": "ď",
	"ḋ": "ḋ",
	"ḑ": "ḑ",
	"é": "é",
	"è": "è",
	"ë": "ë",
	"ẽ": "ẽ",
	"ē": "ē",
	"ḗ": "ḗ",
	"ḕ": "ḕ",
	"ĕ": "ĕ",
	"ḝ": "ḝ",
	"ě": "ě",
	"ê": "ê",
	"ế": "ế",
	"ề": "ề",
	"ễ": "ễ",
	"ė": "ė",
	"ȩ": "ȩ",
	"ḟ": "ḟ",
	"ǵ": "ǵ",
	"ḡ": "ḡ",
	"ğ": "ğ",
	"ǧ": "ǧ",
	"ĝ": "ĝ",
	"ġ": "ġ",
	"ģ": "ģ",
	"ḧ": "ḧ",
	"ȟ": "ȟ",
	"ĥ": "ĥ",
	"ḣ": "ḣ",
	"ḩ": "ḩ",
	"í": "í",
	"ì": "ì",
	"ï": "ï",
	"ḯ": "ḯ",
	"ĩ": "ĩ",
	"ī": "ī",
	"ĭ": "ĭ",
	"ǐ": "ǐ",
	"î": "î",
	"ǰ": "ǰ",
	"ĵ": "ĵ",
	"ḱ": "ḱ",
	"ǩ": "ǩ",
	"ķ": "ķ",
	"ĺ": "ĺ",
	"ľ": "ľ",
	"ļ": "ļ",
	"ḿ": "ḿ",
	"ṁ": "ṁ",
	"ń": "ń",
	"ǹ": "ǹ",
	"ñ": "ñ",
	"ň": "ň",
	"ṅ": "ṅ",
	"ņ": "ņ",
	"ó": "ó",
	"ò": "ò",
	"ö": "ö",
	"ȫ": "ȫ",
	"õ": "õ",
	"ṍ": "ṍ",
	"ṏ": "ṏ",
	"ȭ": "ȭ",
	"ō": "ō",
	"ṓ": "ṓ",
	"ṑ": "ṑ",
	"ŏ": "ŏ",
	"ǒ": "ǒ",
	"ô": "ô",
	"ố": "ố",
	"ồ": "ồ",
	"ỗ": "ỗ",
	"ȯ": "ȯ",
	"ȱ": "ȱ",
	"ő": "ő",
	"ṕ": "ṕ",
	"ṗ": "ṗ",
	"ŕ": "ŕ",
	"ř": "ř",
	"ṙ": "ṙ",
	"ŗ": "ŗ",
	"ś": "ś",
	"ṥ": "ṥ",
	"š": "š",
	"ṧ": "ṧ",
	"ŝ": "ŝ",
	"ṡ": "ṡ",
	"ş": "ş",
	"ẗ": "ẗ",
	"ť": "ť",
	"ṫ": "ṫ",
	"ţ": "ţ",
	"ú": "ú",
	"ù": "ù",
	"ü": "ü",
	"ǘ": "ǘ",
	"ǜ": "ǜ",
	"ǖ": "ǖ",
	"ǚ": "ǚ",
	"ũ": "ũ",
	"ṹ": "ṹ",
	"ū": "ū",
	"ṻ": "ṻ",
	"ŭ": "ŭ",
	"ǔ": "ǔ",
	"û": "û",
	"ů": "ů",
	"ű": "ű",
	"ṽ": "ṽ",
	"ẃ": "ẃ",
	"ẁ": "ẁ",
	"ẅ": "ẅ",
	"ŵ": "ŵ",
	"ẇ": "ẇ",
	"ẘ": "ẘ",
	"ẍ": "ẍ",
	"ẋ": "ẋ",
	"ý": "ý",
	"ỳ": "ỳ",
	"ÿ": "ÿ",
	"ỹ": "ỹ",
	"ȳ": "ȳ",
	"ŷ": "ŷ",
	"ẏ": "ẏ",
	"ẙ": "ẙ",
	"ź": "ź",
	"ž": "ž",
	"ẑ": "ẑ",
	"ż": "ż",
	"Á": "Á",
	"À": "À",
	"Ä": "Ä",
	"Ǟ": "Ǟ",
	"Ã": "Ã",
	"Ā": "Ā",
	"Ă": "Ă",
	"Ắ": "Ắ",
	"Ằ": "Ằ",
	"Ẵ": "Ẵ",
	"Ǎ": "Ǎ",
	"Â": "Â",
	"Ấ": "Ấ",
	"Ầ": "Ầ",
	"Ẫ": "Ẫ",
	"Ȧ": "Ȧ",
	"Ǡ": "Ǡ",
	"Å": "Å",
	"Ǻ": "Ǻ",
	"Ḃ": "Ḃ",
	"Ć": "Ć",
	"Ḉ": "Ḉ",
	"Č": "Č",
	"Ĉ": "Ĉ",
	"Ċ": "Ċ",
	"Ç": "Ç",
	"Ď": "Ď",
	"Ḋ": "Ḋ",
	"Ḑ": "Ḑ",
	"É": "É",
	"È": "È",
	"Ë": "Ë",
	"Ẽ": "Ẽ",
	"Ē": "Ē",
	"Ḗ": "Ḗ",
	"Ḕ": "Ḕ",
	"Ĕ": "Ĕ",
	"Ḝ": "Ḝ",
	"Ě": "Ě",
	"Ê": "Ê",
	"Ế": "Ế",
	"Ề": "Ề",
	"Ễ": "Ễ",
	"Ė": "Ė",
	"Ȩ": "Ȩ",
	"Ḟ": "Ḟ",
	"Ǵ": "Ǵ",
	"Ḡ": "Ḡ",
	"Ğ": "Ğ",
	"Ǧ": "Ǧ",
	"Ĝ": "Ĝ",
	"Ġ": "Ġ",
	"Ģ": "Ģ",
	"Ḧ": "Ḧ",
	"Ȟ": "Ȟ",
	"Ĥ": "Ĥ",
	"Ḣ": "Ḣ",
	"Ḩ": "Ḩ",
	"Í": "Í",
	"Ì": "Ì",
	"Ï": "Ï",
	"Ḯ": "Ḯ",
	"Ĩ": "Ĩ",
	"Ī": "Ī",
	"Ĭ": "Ĭ",
	"Ǐ": "Ǐ",
	"Î": "Î",
	"İ": "İ",
	"Ĵ": "Ĵ",
	"Ḱ": "Ḱ",
	"Ǩ": "Ǩ",
	"Ķ": "Ķ",
	"Ĺ": "Ĺ",
	"Ľ": "Ľ",
	"Ļ": "Ļ",
	"Ḿ": "Ḿ",
	"Ṁ": "Ṁ",
	"Ń": "Ń",
	"Ǹ": "Ǹ",
	"Ñ": "Ñ",
	"Ň": "Ň",
	"Ṅ": "Ṅ",
	"Ņ": "Ņ",
	"Ó": "Ó",
	"Ò": "Ò",
	"Ö": "Ö",
	"Ȫ": "Ȫ",
	"Õ": "Õ",
	"Ṍ": "Ṍ",
	"Ṏ": "Ṏ",
	"Ȭ": "Ȭ",
	"Ō": "Ō",
	"Ṓ": "Ṓ",
	"Ṑ": "Ṑ",
	"Ŏ": "Ŏ",
	"Ǒ": "Ǒ",
	"Ô": "Ô",
	"Ố": "Ố",
	"Ồ": "Ồ",
	"Ỗ": "Ỗ",
	"Ȯ": "Ȯ",
	"Ȱ": "Ȱ",
	"Ő": "Ő",
	"Ṕ": "Ṕ",
	"Ṗ": "Ṗ",
	"Ŕ": "Ŕ",
	"Ř": "Ř",
	"Ṙ": "Ṙ",
	"Ŗ": "Ŗ",
	"Ś": "Ś",
	"Ṥ": "Ṥ",
	"Š": "Š",
	"Ṧ": "Ṧ",
	"Ŝ": "Ŝ",
	"Ṡ": "Ṡ",
	"Ş": "Ş",
	"Ť": "Ť",
	"Ṫ": "Ṫ",
	"Ţ": "Ţ",
	"Ú": "Ú",
	"Ù": "Ù",
	"Ü": "Ü",
	"Ǘ": "Ǘ",
	"Ǜ": "Ǜ",
	"Ǖ": "Ǖ",
	"Ǚ": "Ǚ",
	"Ũ": "Ũ",
	"Ṹ": "Ṹ",
	"Ū": "Ū",
	"Ṻ": "Ṻ",
	"Ŭ": "Ŭ",
	"Ǔ": "Ǔ",
	"Û": "Û",
	"Ů": "Ů",
	"Ű": "Ű",
	"Ṽ": "Ṽ",
	"Ẃ": "Ẃ",
	"Ẁ": "Ẁ",
	"Ẅ": "Ẅ",
	"Ŵ": "Ŵ",
	"Ẇ": "Ẇ",
	"Ẍ": "Ẍ",
	"Ẋ": "Ẋ",
	"Ý": "Ý",
	"Ỳ": "Ỳ",
	"Ÿ": "Ÿ",
	"Ỹ": "Ỹ",
	"Ȳ": "Ȳ",
	"Ŷ": "Ŷ",
	"Ẏ": "Ẏ",
	"Ź": "Ź",
	"Ž": "Ž",
	"Ẑ": "Ẑ",
	"Ż": "Ż",
	"ά": "ά",
	"ὰ": "ὰ",
	"ᾱ": "ᾱ",
	"ᾰ": "ᾰ",
	"έ": "έ",
	"ὲ": "ὲ",
	"ή": "ή",
	"ὴ": "ὴ",
	"ί": "ί",
	"ὶ": "ὶ",
	"ϊ": "ϊ",
	"ΐ": "ΐ",
	"ῒ": "ῒ",
	"ῑ": "ῑ",
	"ῐ": "ῐ",
	"ό": "ό",
	"ὸ": "ὸ",
	"ύ": "ύ",
	"ὺ": "ὺ",
	"ϋ": "ϋ",
	"ΰ": "ΰ",
	"ῢ": "ῢ",
	"ῡ": "ῡ",
	"ῠ": "ῠ",
	"ώ": "ώ",
	"ὼ": "ὼ",
	"Ύ": "Ύ",
	"Ὺ": "Ὺ",
	"Ϋ": "Ϋ",
	"Ῡ": "Ῡ",
	"Ῠ": "Ῠ",
	"Ώ": "Ώ",
	"Ὼ": "Ὼ"
};
/**
* This file contains the parser used to parse out a TeX expression from the
* input. Since TeX isn't context-free, standard parsers don't work particularly
* well.
*
* The strategy of this parser is as such:
*
* The main functions (the `.parse...` ones) take a position in the current
* parse string to parse tokens from. The lexer (found in Lexer.js, stored at
* this.gullet.lexer) also supports pulling out tokens at arbitrary places. When
* individual tokens are needed at a position, the lexer is called to pull out a
* token, which is then used.
*
* The parser has a property called "mode" indicating the mode that
* the parser is currently in. Currently it has to be one of "math" or
* "text", which denotes whether the current environment is a math-y
* one or a text-y one (e.g. inside \text). Currently, this serves to
* limit the functions which can be used in text mode.
*
* The main functions then return an object which contains the useful data that
* was parsed at its given point, and a new position at the end of the parsed
* data. The main functions can call each other and continue the parsing by
* using the returned position as a new starting point.
*
* There are also extra `.handle...` functions, which pull out some reused
* functionality into self-contained functions.
*
* The functions return ParseNodes.
*/
var Parser = class Parser {
	constructor(input, settings) {
		this.mode = void 0;
		this.gullet = void 0;
		this.settings = void 0;
		this.leftrightDepth = void 0;
		this.nextToken = void 0;
		this.mode = "math";
		this.gullet = new MacroExpander(input, settings, this.mode);
		this.settings = settings;
		this.leftrightDepth = 0;
		this.nextToken = null;
	}
	/**
	* Checks a result to make sure it has the right type, and throws an
	* appropriate error otherwise.
	*/
	expect(text, consume) {
		if (consume === void 0) consume = true;
		if (this.fetch().text !== text) throw new ParseError("Expected '" + text + "', got '" + this.fetch().text + "'", this.fetch());
		if (consume) this.consume();
	}
	/**
	* Discards the current lookahead token, considering it consumed.
	*/
	consume() {
		this.nextToken = null;
	}
	/**
	* Return the current lookahead token, or if there isn't one (at the
	* beginning, or if the previous lookahead token was consume()d),
	* fetch the next token as the new lookahead token and return it.
	*/
	fetch() {
		if (this.nextToken == null) this.nextToken = this.gullet.expandNextToken();
		return this.nextToken;
	}
	/**
	* Switches between "text" and "math" modes.
	*/
	switchMode(newMode) {
		this.mode = newMode;
		this.gullet.switchMode(newMode);
	}
	/**
	* Main parsing function, which parses an entire input.
	*/
	parse() {
		if (!this.settings.globalGroup) this.gullet.beginGroup();
		if (this.settings.colorIsTextColor) this.gullet.macros.set("\\color", "\\textcolor");
		try {
			var parse = this.parseExpression(false);
			this.expect("EOF");
			if (!this.settings.globalGroup) this.gullet.endGroup();
			return parse;
		} finally {
			this.gullet.endGroups();
		}
	}
	/**
	* Fully parse a separate sequence of tokens as a separate job.
	* Tokens should be specified in reverse order, as in a MacroDefinition.
	*/
	subparse(tokens) {
		var oldToken = this.nextToken;
		this.consume();
		this.gullet.pushToken(new Token("}"));
		this.gullet.pushTokens(tokens);
		var parse = this.parseExpression(false);
		this.expect("}");
		this.nextToken = oldToken;
		return parse;
	}
	/**
	* Parses an "expression", which is a list of atoms.
	*
	* `breakOnInfix`: Should the parsing stop when we hit infix nodes? This
	*                 happens when functions have higher precedence than infix
	*                 nodes in implicit parses.
	*
	* `breakOnTokenText`: The text of the token that the expression should end
	*                     with, or `null` if something else should end the
	*                     expression.
	*/
	parseExpression(breakOnInfix, breakOnTokenText) {
		var body = [];
		while (true) {
			if (this.mode === "math") this.consumeSpaces();
			var lex = this.fetch();
			if (Parser.endOfExpression.has(lex.text)) break;
			if (breakOnTokenText && lex.text === breakOnTokenText) break;
			if (breakOnInfix && functions[lex.text] && functions[lex.text].infix) break;
			var atom = this.parseAtom(breakOnTokenText);
			if (!atom) break;
			else if (atom.type === "internal") continue;
			body.push(atom);
		}
		if (this.mode === "text") this.formLigatures(body);
		return this.handleInfixNodes(body);
	}
	/**
	* Rewrites infix operators such as \over with corresponding commands such
	* as \frac.
	*
	* There can only be one infix operator per group.  If there's more than one
	* then the expression is ambiguous.  This can be resolved by adding {}.
	*/
	handleInfixNodes(body) {
		var overIndex = -1;
		var funcName;
		for (var i = 0; i < body.length; i++) {
			var node = body[i];
			if (node.type === "infix") {
				if (overIndex !== -1) throw new ParseError("only one infix operator per group", node.token);
				overIndex = i;
				funcName = node.replaceWith;
			}
		}
		if (overIndex !== -1 && funcName) {
			var numerNode;
			var denomNode;
			var numerBody = body.slice(0, overIndex);
			var denomBody = body.slice(overIndex + 1);
			if (numerBody.length === 1 && numerBody[0].type === "ordgroup") numerNode = numerBody[0];
			else numerNode = {
				type: "ordgroup",
				mode: this.mode,
				body: numerBody
			};
			if (denomBody.length === 1 && denomBody[0].type === "ordgroup") denomNode = denomBody[0];
			else denomNode = {
				type: "ordgroup",
				mode: this.mode,
				body: denomBody
			};
			var _node;
			if (funcName === "\\\\abovefrac") _node = this.callFunction(funcName, [
				numerNode,
				body[overIndex],
				denomNode
			], []);
			else _node = this.callFunction(funcName, [numerNode, denomNode], []);
			return [_node];
		} else return body;
	}
	/**
	* Handle a subscript or superscript with nice errors.
	*/
	handleSupSubscript(name) {
		var symbolToken = this.fetch();
		var symbol = symbolToken.text;
		this.consume();
		this.consumeSpaces();
		var group;
		do {
			var _group;
			group = this.parseGroup(name);
		} while (((_group = group) == null ? void 0 : _group.type) === "internal");
		if (!group) throw new ParseError("Expected group after '" + symbol + "'", symbolToken);
		return group;
	}
	/**
	* Converts the textual input of an unsupported command into a text node
	* contained within a color node whose color is determined by errorColor
	*/
	formatUnsupportedCmd(text) {
		var textordArray = [];
		for (var i = 0; i < text.length; i++) textordArray.push({
			type: "textord",
			mode: "text",
			text: text[i]
		});
		var textNode = {
			type: "text",
			mode: this.mode,
			body: textordArray
		};
		return {
			type: "color",
			mode: this.mode,
			color: this.settings.errorColor,
			body: [textNode]
		};
	}
	/**
	* Parses a group with optional super/subscripts.
	*/
	parseAtom(breakOnTokenText) {
		var base = this.parseGroup("atom", breakOnTokenText);
		if ((base == null ? void 0 : base.type) === "internal") return base;
		if (this.mode === "text") return base;
		var superscript;
		var subscript;
		while (true) {
			this.consumeSpaces();
			var lex = this.fetch();
			if (lex.text === "\\limits" || lex.text === "\\nolimits") {
				if (base && base.type === "op") {
					base.limits = lex.text === "\\limits";
					base.alwaysHandleSupSub = true;
				} else if (base && base.type === "operatorname") {
					if (base.alwaysHandleSupSub) base.limits = lex.text === "\\limits";
				} else throw new ParseError("Limit controls must follow a math operator", lex);
				this.consume();
			} else if (lex.text === "^") {
				if (superscript) throw new ParseError("Double superscript", lex);
				superscript = this.handleSupSubscript("superscript");
			} else if (lex.text === "_") {
				if (subscript) throw new ParseError("Double subscript", lex);
				subscript = this.handleSupSubscript("subscript");
			} else if (lex.text === "'") {
				if (superscript) throw new ParseError("Double superscript", lex);
				var prime = {
					type: "textord",
					mode: this.mode,
					text: "\\prime"
				};
				var primes = [prime];
				this.consume();
				while (this.fetch().text === "'") {
					primes.push(prime);
					this.consume();
				}
				if (this.fetch().text === "^") primes.push(this.handleSupSubscript("superscript"));
				superscript = {
					type: "ordgroup",
					mode: this.mode,
					body: primes
				};
			} else if (uSubsAndSups[lex.text]) {
				var isSub = unicodeSubRegEx.test(lex.text);
				var subsupTokens = [];
				subsupTokens.push(new Token(uSubsAndSups[lex.text]));
				this.consume();
				while (true) {
					var token = this.fetch().text;
					if (!uSubsAndSups[token]) break;
					if (unicodeSubRegEx.test(token) !== isSub) break;
					subsupTokens.unshift(new Token(uSubsAndSups[token]));
					this.consume();
				}
				var body = this.subparse(subsupTokens);
				if (isSub) subscript = {
					type: "ordgroup",
					mode: "math",
					body
				};
				else superscript = {
					type: "ordgroup",
					mode: "math",
					body
				};
			} else break;
		}
		if (superscript || subscript) return {
			type: "supsub",
			mode: this.mode,
			base,
			sup: superscript,
			sub: subscript
		};
		else return base;
	}
	/**
	* Parses an entire function, including its base and all of its arguments.
	*/
	parseFunction(breakOnTokenText, name) {
		var token = this.fetch();
		var func = token.text;
		var funcData = functions[func];
		if (!funcData) return null;
		this.consume();
		if (name && name !== "atom" && !funcData.allowedInArgument) throw new ParseError("Got function '" + func + "' with no arguments" + (name ? " as " + name : ""), token);
		else if (this.mode === "text" && !funcData.allowedInText) throw new ParseError("Can't use function '" + func + "' in text mode", token);
		else if (this.mode === "math" && funcData.allowedInMath === false) throw new ParseError("Can't use function '" + func + "' in math mode", token);
		var { args, optArgs } = this.parseArguments(func, funcData);
		return this.callFunction(func, args, optArgs, token, breakOnTokenText);
	}
	/**
	* Call a function handler with a suitable context and arguments.
	*/
	callFunction(name, args, optArgs, token, breakOnTokenText) {
		var context = {
			funcName: name,
			parser: this,
			token,
			breakOnTokenText
		};
		var func = functions[name];
		if (func && func.handler) return func.handler(context, args, optArgs);
		else throw new ParseError("No function handler for " + name);
	}
	/**
	* Parses the arguments of a function or environment
	*/
	parseArguments(func, funcData) {
		var totalArgs = funcData.numArgs + funcData.numOptionalArgs;
		if (totalArgs === 0) return {
			args: [],
			optArgs: []
		};
		var args = [];
		var optArgs = [];
		for (var i = 0; i < totalArgs; i++) {
			var argType = funcData.argTypes && funcData.argTypes[i];
			var isOptional = i < funcData.numOptionalArgs;
			if ("primitive" in funcData && funcData.primitive && argType == null || funcData.type === "sqrt" && i === 1 && optArgs[0] == null) argType = "primitive";
			var arg = this.parseGroupOfType("argument to '" + func + "'", argType, isOptional);
			if (isOptional) optArgs.push(arg);
			else if (arg != null) args.push(arg);
			else throw new ParseError("Null argument, please report this as a bug");
		}
		return {
			args,
			optArgs
		};
	}
	/**
	* Parses a group when the mode is changing.
	*/
	parseGroupOfType(name, type, optional) {
		switch (type) {
			case "color": return this.parseColorGroup(optional);
			case "size": return this.parseSizeGroup(optional);
			case "url": return this.parseUrlGroup(optional);
			case "math":
			case "text": return this.parseArgumentGroup(optional, type);
			case "hbox":
				var group = this.parseArgumentGroup(optional, "text");
				return group != null ? {
					type: "styling",
					mode: group.mode,
					body: [group],
					style: "text",
					resetFont: true
				} : null;
			case "raw":
				var token = this.parseStringGroup("raw", optional);
				return token != null ? {
					type: "raw",
					mode: "text",
					string: token.text
				} : null;
			case "primitive":
				if (optional) throw new ParseError("A primitive argument cannot be optional");
				var _group2 = this.parseGroup(name);
				if (_group2 == null) throw new ParseError("Expected group as " + name, this.fetch());
				return _group2;
			case "original":
			case null:
			case void 0: return this.parseArgumentGroup(optional);
			default: throw new ParseError("Unknown group type as " + name, this.fetch());
		}
	}
	/**
	* Discard any space tokens, fetching the next non-space token.
	*/
	consumeSpaces() {
		while (this.fetch().text === " ") this.consume();
	}
	/**
	* Parses a group, essentially returning the string formed by the
	* brace-enclosed tokens plus some position information.
	*/
	parseStringGroup(modeName, optional) {
		var argToken = this.gullet.scanArgument(optional);
		if (argToken == null) return null;
		var str = "";
		var nextToken;
		while ((nextToken = this.fetch()).text !== "EOF") {
			str += nextToken.text;
			this.consume();
		}
		this.consume();
		argToken.text = str;
		return argToken;
	}
	/**
	* Parses a regex-delimited group: the largest sequence of tokens
	* whose concatenated strings match `regex`. Returns the string
	* formed by the tokens plus some position information.
	*/
	parseRegexGroup(regex, modeName) {
		var firstToken = this.fetch();
		var lastToken = firstToken;
		var str = "";
		var nextToken;
		while ((nextToken = this.fetch()).text !== "EOF" && regex.test(str + nextToken.text)) {
			lastToken = nextToken;
			str += lastToken.text;
			this.consume();
		}
		if (str === "") throw new ParseError("Invalid " + modeName + ": '" + firstToken.text + "'", firstToken);
		return firstToken.range(lastToken, str);
	}
	/**
	* Parses a color description.
	*/
	parseColorGroup(optional) {
		var res = this.parseStringGroup("color", optional);
		if (res == null) return null;
		var match = /^(#[a-f0-9]{3,4}|#[a-f0-9]{6}|#[a-f0-9]{8}|[a-f0-9]{6}|[a-z]+)$/i.exec(res.text);
		if (!match) throw new ParseError("Invalid color: '" + res.text + "'", res);
		var color = match[0];
		if (/^[0-9a-f]{6}$/i.test(color)) color = "#" + color;
		return {
			type: "color-token",
			mode: this.mode,
			color
		};
	}
	/**
	* Parses a size specification, consisting of magnitude and unit.
	*/
	parseSizeGroup(optional) {
		var res;
		var isBlank = false;
		this.gullet.consumeSpaces();
		if (!optional && this.gullet.future().text !== "{") res = this.parseRegexGroup(/^[-+]? *(?:$|\d+|\d+\.\d*|\.\d*) *[a-z]{0,2} *$/, "size");
		else res = this.parseStringGroup("size", optional);
		if (!res) return null;
		if (!optional && res.text.length === 0) {
			res.text = "0pt";
			isBlank = true;
		}
		var match = /([-+]?) *(\d+(?:\.\d*)?|\.\d+) *([a-z]{2})/.exec(res.text);
		if (!match) throw new ParseError("Invalid size: '" + res.text + "'", res);
		var data = {
			number: +(match[1] + match[2]),
			unit: match[3]
		};
		if (!validUnit(data)) throw new ParseError("Invalid unit: '" + data.unit + "'", res);
		return {
			type: "size",
			mode: this.mode,
			value: data,
			isBlank
		};
	}
	/**
	* Parses an URL, checking escaped letters and allowed protocols,
	* and setting the catcode of % as an active character (as in \hyperref).
	*/
	parseUrlGroup(optional) {
		this.gullet.lexer.setCatcode("%", 13);
		this.gullet.lexer.setCatcode("~", 12);
		var res = this.parseStringGroup("url", optional);
		this.gullet.lexer.setCatcode("%", 14);
		this.gullet.lexer.setCatcode("~", 13);
		if (res == null) return null;
		var url = res.text.replace(/\\([#$%&~_^{}])/g, "$1");
		return {
			type: "url",
			mode: this.mode,
			url
		};
	}
	/**
	* Parses an argument with the mode specified.
	*/
	parseArgumentGroup(optional, mode) {
		var argToken = this.gullet.scanArgument(optional);
		if (argToken == null) return null;
		var outerMode = this.mode;
		if (mode) this.switchMode(mode);
		this.gullet.beginGroup();
		var expression = this.parseExpression(false, "EOF");
		this.expect("EOF");
		this.gullet.endGroup();
		var result = {
			type: "ordgroup",
			mode: this.mode,
			loc: argToken.loc,
			body: expression
		};
		if (mode) this.switchMode(outerMode);
		return result;
	}
	/**
	* Parses an ordinary group, which is either a single nucleus (like "x")
	* or an expression in braces (like "{x+y}") or an implicit group, a group
	* that starts at the current position, and ends right before a higher explicit
	* group ends, or at EOF.
	*/
	parseGroup(name, breakOnTokenText) {
		var firstToken = this.fetch();
		var text = firstToken.text;
		var result;
		if (text === "{" || text === "\\begingroup") {
			this.consume();
			var groupEnd = text === "{" ? "}" : "\\endgroup";
			this.gullet.beginGroup();
			var expression = this.parseExpression(false, groupEnd);
			var lastToken = this.fetch();
			this.expect(groupEnd);
			this.gullet.endGroup();
			result = {
				type: "ordgroup",
				mode: this.mode,
				loc: SourceLocation.range(firstToken, lastToken),
				body: expression,
				semisimple: text === "\\begingroup" || void 0
			};
		} else {
			result = this.parseFunction(breakOnTokenText, name) || this.parseSymbol();
			if (result == null && text[0] === "\\" && !implicitCommands.hasOwnProperty(text)) {
				if (this.settings.throwOnError) throw new ParseError("Undefined control sequence: " + text, firstToken);
				result = this.formatUnsupportedCmd(text);
				this.consume();
			}
		}
		return result;
	}
	/**
	* Form ligature-like combinations of characters for text mode.
	* This includes inputs like "--", "---", "``" and "''".
	* The result will simply replace multiple textord nodes with a single
	* character in each value by a single textord node having multiple
	* characters in its value.  The representation is still ASCII source.
	* The group will be modified in place.
	*/
	formLigatures(group) {
		var n = group.length - 1;
		for (var i = 0; i < n; ++i) {
			var a = group[i];
			if (a.type !== "textord") continue;
			var v = a.text;
			var next = group[i + 1];
			if (!next || next.type !== "textord") continue;
			if (v === "-" && next.text === "-") {
				var afterNext = group[i + 2];
				if (i + 1 < n && afterNext && afterNext.type === "textord" && afterNext.text === "-") {
					group.splice(i, 3, {
						type: "textord",
						mode: "text",
						loc: SourceLocation.range(a, afterNext),
						text: "---"
					});
					n -= 2;
				} else {
					group.splice(i, 2, {
						type: "textord",
						mode: "text",
						loc: SourceLocation.range(a, next),
						text: "--"
					});
					n -= 1;
				}
			}
			if ((v === "'" || v === "`") && next.text === v) {
				group.splice(i, 2, {
					type: "textord",
					mode: "text",
					loc: SourceLocation.range(a, next),
					text: v + v
				});
				n -= 1;
			}
		}
	}
	/**
	* Parse a single symbol out of the string. Here, we handle single character
	* symbols and special functions like \verb.
	*/
	parseSymbol() {
		var nucleus = this.fetch();
		var text = nucleus.text;
		if (/^\\verb[^a-zA-Z]/.test(text)) {
			this.consume();
			var arg = text.slice(5);
			var star = arg.charAt(0) === "*";
			if (star) arg = arg.slice(1);
			if (arg.length < 2 || arg.charAt(0) !== arg.slice(-1)) throw new ParseError("\\verb assertion failed --\n                    please report what input caused this bug");
			arg = arg.slice(1, -1);
			return {
				type: "verb",
				mode: "text",
				body: arg,
				star
			};
		}
		if (unicodeSymbols.hasOwnProperty(text[0]) && !symbols[this.mode][text[0]]) {
			if (this.settings.strict && this.mode === "math") this.settings.reportNonstrict("unicodeTextInMathMode", "Accented Unicode text character \"" + text[0] + "\" used in math mode", nucleus);
			text = unicodeSymbols[text[0]] + text.slice(1);
		}
		var match = combiningDiacriticalMarksEndRegex.exec(text);
		if (match) {
			text = text.substring(0, match.index);
			if (text === "i") text = "ı";
			else if (text === "j") text = "ȷ";
		}
		var symbol;
		if (symbols[this.mode][text]) {
			if (this.settings.strict && this.mode === "math" && extraLatin.includes(text)) this.settings.reportNonstrict("unicodeTextInMathMode", "Latin-1/Unicode text character \"" + text[0] + "\" used in math mode", nucleus);
			var group = symbols[this.mode][text].group;
			var loc = SourceLocation.range(nucleus);
			var s;
			if (isAtom(group)) s = {
				type: "atom",
				mode: this.mode,
				family: group,
				loc,
				text
			};
			else s = {
				type: group,
				mode: this.mode,
				loc,
				text
			};
			symbol = s;
		} else if (text.charCodeAt(0) >= 128) {
			if (this.settings.strict) {
				if (!supportedCodepoint(text.charCodeAt(0))) this.settings.reportNonstrict("unknownSymbol", "Unrecognized Unicode character \"" + text[0] + "\"" + (" (" + text.charCodeAt(0) + ")"), nucleus);
				else if (this.mode === "math") this.settings.reportNonstrict("unicodeTextInMathMode", "Unicode text character \"" + text[0] + "\" used in math mode", nucleus);
			}
			symbol = {
				type: "textord",
				mode: "text",
				loc: SourceLocation.range(nucleus),
				text
			};
		} else return null;
		this.consume();
		if (match) for (var i = 0; i < match[0].length; i++) {
			var accent = match[0][i];
			if (!unicodeAccents[accent]) throw new ParseError("Unknown accent ' " + accent + "'", nucleus);
			var command = unicodeAccents[accent][this.mode] || unicodeAccents[accent].text;
			if (!command) throw new ParseError("Accent " + accent + " unsupported in " + this.mode + " mode", nucleus);
			symbol = {
				type: "accent",
				mode: this.mode,
				loc: SourceLocation.range(nucleus),
				label: command,
				isStretchy: false,
				isShifty: true,
				base: symbol
			};
		}
		return symbol;
	}
};
Parser.endOfExpression = /* @__PURE__ */ new Set([
	"}",
	"\\endgroup",
	"\\end",
	"\\right",
	"&"
]);
/**
* Provides a single function for parsing an expression using a Parser
* TODO(emily): Remove this
*/
/**
* Parses an expression using a Parser, then returns the parsed result.
*/
var parseTree = function parseTree(toParse, settings) {
	if (!(typeof toParse === "string" || toParse instanceof String)) throw new TypeError("KaTeX can only parse string typed expression");
	var parser = new Parser(toParse, settings);
	delete parser.gullet.macros.current["\\df@tag"];
	var tree = parser.parse();
	delete parser.gullet.macros.current["\\current@color"];
	delete parser.gullet.macros.current["\\color"];
	if (parser.gullet.macros.get("\\df@tag")) {
		if (!settings.displayMode) throw new ParseError("\\tag works only in display equations");
		tree = [{
			type: "tag",
			mode: "text",
			body: tree,
			tag: parser.subparse([new Token("\\df@tag")])
		}];
	}
	return tree;
};
/**
* Parse and build an expression, and place that expression in the DOM node
* given.
*/
var render = function render(expression, baseNode, options) {
	baseNode.textContent = "";
	var node = renderToDomTree(expression, options).toNode();
	baseNode.appendChild(node);
};
if (typeof document !== "undefined") {
	if (document.compatMode !== "CSS1Compat") {
		typeof console !== "undefined" && console.warn("Warning: KaTeX doesn't work in quirks mode. Make sure your website has a suitable doctype.");
		render = function render() {
			throw new ParseError("KaTeX doesn't work in quirks mode.");
		};
	}
}
/**
* Parse and build an expression, and return the markup for that.
*/
var renderToString = function renderToString(expression, options) {
	return renderToDomTree(expression, options).toMarkup();
};
/**
* Parse an expression and return the parse tree.
*/
var generateParseTree = function generateParseTree(expression, options) {
	return parseTree(expression, new Settings(options));
};
/**
* If the given error is a KaTeX ParseError and options.throwOnError is false,
* renders the invalid LaTeX as a span with hover title giving the KaTeX
* error message.  Otherwise, simply throws the error.
*/
var renderError = function renderError(error, expression, options) {
	if (options.throwOnError || !(error instanceof ParseError)) throw error;
	var node = makeSpan(["katex-error"], [new SymbolNode(expression)]);
	node.setAttribute("title", error.toString());
	node.setAttribute("style", "color:" + options.errorColor);
	return node;
};
/**
* Generates and returns the katex build tree. This is used for advanced
* use cases (like rendering to custom output).
*/
var renderToDomTree = function renderToDomTree(expression, options) {
	var settings = new Settings(options);
	try {
		return buildTree(parseTree(expression, settings), expression, settings);
	} catch (error) {
		return renderError(error, expression, settings);
	}
};
var katex$1 = {
	/**
	* Current KaTeX version
	*/
	version: "0.16.47",
	/**
	* Renders the given LaTeX into an HTML+MathML combination, and adds
	* it as a child to the specified DOM node.
	*/
	render,
	/**
	* Renders the given LaTeX into an HTML+MathML combination string,
	* for sending to the client.
	*/
	renderToString,
	/**
	* KaTeX error, usually during parsing.
	*/
	ParseError,
	/**
	* The schema of Settings
	*/
	SETTINGS_SCHEMA,
	/**
	* Parses the given LaTeX into KaTeX's internal parse tree structure,
	* without rendering to HTML or MathML.
	*
	* NOTE: This method is not currently recommended for public use.
	* The internal tree representation is unstable and is very likely
	* to change. Use at your own risk.
	*/
	__parse: generateParseTree,
	/**
	* Renders the given LaTeX into an HTML+MathML internal DOM tree
	* representation, without flattening that representation to a string.
	*
	* NOTE: This method is not currently recommended for public use.
	* The internal tree representation is unstable and is very likely
	* to change. Use at your own risk.
	*/
	__renderToDomTree: renderToDomTree,
	/**
	* Renders the given LaTeX into an HTML internal DOM tree representation,
	* without MathML and without flattening that representation to a string.
	*
	* NOTE: This method is not currently recommended for public use.
	* The internal tree representation is unstable and is very likely
	* to change. Use at your own risk.
	*/
	__renderToHTMLTree: function renderToHTMLTree(expression, options) {
		var settings = new Settings(options);
		try {
			return buildHTMLTree(parseTree(expression, settings), expression, settings);
		} catch (error) {
			return renderError(error, expression, settings);
		}
	},
	/**
	* extends internal font metrics object with a new object
	* each key in the new object represents a font name
	*/
	__setFontMetrics: setFontMetrics,
	/**
	* adds a new symbol to builtin symbols table
	*/
	__defineSymbol: defineSymbol,
	/**
	* adds a new function to builtin function list,
	* which directly produce parse tree elements
	* and have their own html/mathml builders
	*/
	__defineFunction: defineFunction,
	/**
	* adds a new macro to builtin macro list
	*/
	__defineMacro: defineMacro,
	/**
	* Expose the dom tree node types, which can be useful for type checking nodes.
	*
	* NOTE: These methods are not currently recommended for public use.
	* The internal tree representation is unstable and is very likely
	* to change. Use at your own risk.
	*/
	__domTree: {
		Span,
		Anchor,
		SymbolNode,
		SvgNode,
		PathNode,
		LineNode
	}
};
//#endregion
//#region node_modules/katex/dist/contrib/mhchem.mjs
/*************************************************************
*
*  KaTeX mhchem.js
*
*  This file implements a KaTeX version of mhchem version 3.3.0.
*  It is adapted from MathJax/extensions/TeX/mhchem.js
*  It differs from the MathJax version as follows:
*    1. The interface is changed so that it can be called from KaTeX, not MathJax.
*    2. \rlap and \llap are replaced with \mathrlap and \mathllap.
*    3. Four lines of code are edited in order to use \raisebox instead of \raise.
*    4. The reaction arrow code is simplified. All reaction arrows are rendered
*       using KaTeX extensible arrows instead of building non-extensible arrows.
*    5. \tripledash vertical alignment is slightly adjusted.
*
*    This code, as other KaTeX code, is released under the MIT license.
* 
* /*************************************************************
*
*  MathJax/extensions/TeX/mhchem.js
*
*  Implements the \ce command for handling chemical formulas
*  from the mhchem LaTeX package.
*
*  ---------------------------------------------------------------------
*
*  Copyright (c) 2011-2015 The MathJax Consortium
*  Copyright (c) 2015-2018 Martin Hensel
*
*  Licensed under the Apache License, Version 2.0 (the "License");
*  you may not use this file except in compliance with the License.
*  You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
*  Unless required by applicable law or agreed to in writing, software
*  distributed under the License is distributed on an "AS IS" BASIS,
*  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
*  See the License for the specific language governing permissions and
*  limitations under the License.
*/
katex$1.__defineMacro("\\ce", function(context) {
	return chemParse(context.consumeArgs(1)[0], "ce");
});
katex$1.__defineMacro("\\pu", function(context) {
	return chemParse(context.consumeArgs(1)[0], "pu");
});
katex$1.__defineMacro("\\tripledash", "{\\vphantom{-}\\raisebox{2.56mu}{$\\mkern2mu\\tiny\\text{-}\\mkern1mu\\text{-}\\mkern1mu\\text{-}\\mkern2mu$}}");
var chemParse = function chemParse(tokens, stateMachine) {
	var str = "";
	var expectedLoc = tokens.length && tokens[tokens.length - 1].loc.start;
	for (var i = tokens.length - 1; i >= 0; i--) {
		if (tokens[i].loc.start > expectedLoc) {
			str += " ";
			expectedLoc = tokens[i].loc.start;
		}
		str += tokens[i].text;
		expectedLoc += tokens[i].text.length;
	}
	return texify.go(mhchemParser.go(str, stateMachine));
};
/** @type {MhchemParser} */
var mhchemParser = {
	go: function go(input, stateMachine) {
		if (!input) return [];
		if (stateMachine === void 0) stateMachine = "ce";
		var state = "0";
		/** @type {Buffer} */
		var buffer = {};
		buffer["parenthesisLevel"] = 0;
		input = input.replace(/\n/g, " ");
		input = input.replace(/[\u2212\u2013\u2014\u2010]/g, "-");
		input = input.replace(/[\u2026]/g, "...");
		var lastInput;
		var watchdog = 10;
		/** @type {ParserOutput[]} */
		var output = [];
		while (true) {
			if (lastInput !== input) {
				watchdog = 10;
				lastInput = input;
			} else watchdog--;
			var machine = mhchemParser.stateMachines[stateMachine];
			var t = machine.transitions[state] || machine.transitions["*"];
			iterateTransitions: for (var i = 0; i < t.length; i++) {
				var matches = mhchemParser.patterns.match_(t[i].pattern, input);
				if (matches) {
					var task = t[i].task;
					for (var iA = 0; iA < task.action_.length; iA++) {
						var o;
						if (machine.actions[task.action_[iA].type_]) o = machine.actions[task.action_[iA].type_](buffer, matches.match_, task.action_[iA].option);
						else if (mhchemParser.actions[task.action_[iA].type_]) o = mhchemParser.actions[task.action_[iA].type_](buffer, matches.match_, task.action_[iA].option);
						else throw ["MhchemBugA", "mhchem bug A. Please report. (" + task.action_[iA].type_ + ")"];
						mhchemParser.concatArray(output, o);
					}
					state = task.nextState || state;
					if (input.length > 0) {
						if (!task.revisit) input = matches.remainder;
						if (!task.toContinue) break iterateTransitions;
					} else return output;
				}
			}
			if (watchdog <= 0) throw ["MhchemBugU", "mhchem bug U. Please report."];
		}
	},
	concatArray: function concatArray(a, b) {
		if (b) {
			if (Array.isArray(b)) for (var iB = 0; iB < b.length; iB++) a.push(b[iB]);
			else a.push(b);
		}
	},
	patterns: {
		patterns: {
			"empty": /^$/,
			"else": /^./,
			"else2": /^./,
			"space": /^\s/,
			"space A": /^\s(?=[A-Z\\$])/,
			"space$": /^\s$/,
			"a-z": /^[a-z]/,
			"x": /^x/,
			"x$": /^x$/,
			"i$": /^i$/,
			"letters": /^(?:[a-zA-Z\u03B1-\u03C9\u0391-\u03A9?@]|(?:\\(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)(?:\s+|\{\}|(?![a-zA-Z]))))+/,
			"\\greek": /^\\(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)(?:\s+|\{\}|(?![a-zA-Z]))/,
			"one lowercase latin letter $": /^(?:([a-z])(?:$|[^a-zA-Z]))$/,
			"$one lowercase latin letter$ $": /^\$(?:([a-z])(?:$|[^a-zA-Z]))\$$/,
			"one lowercase greek letter $": /^(?:\$?[\u03B1-\u03C9]\$?|\$?\\(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega)\s*\$?)(?:\s+|\{\}|(?![a-zA-Z]))$/,
			"digits": /^[0-9]+/,
			"-9.,9": /^[+\-]?(?:[0-9]+(?:[,.][0-9]+)?|[0-9]*(?:\.[0-9]+))/,
			"-9.,9 no missing 0": /^[+\-]?[0-9]+(?:[.,][0-9]+)?/,
			"(-)(9.,9)(e)(99)": function e99(input) {
				var m = input.match(/^(\+\-|\+\/\-|\+|\-|\\pm\s?)?([0-9]+(?:[,.][0-9]+)?|[0-9]*(?:\.[0-9]+))?(\((?:[0-9]+(?:[,.][0-9]+)?|[0-9]*(?:\.[0-9]+))\))?(?:([eE]|\s*(\*|x|\\times|\u00D7)\s*10\^)([+\-]?[0-9]+|\{[+\-]?[0-9]+\}))?/);
				if (m && m[0]) return {
					match_: m.splice(1),
					remainder: input.substr(m[0].length)
				};
				return null;
			},
			"(-)(9)^(-9)": function _(input) {
				var m = input.match(/^(\+\-|\+\/\-|\+|\-|\\pm\s?)?([0-9]+(?:[,.][0-9]+)?|[0-9]*(?:\.[0-9]+)?)\^([+\-]?[0-9]+|\{[+\-]?[0-9]+\})/);
				if (m && m[0]) return {
					match_: m.splice(1),
					remainder: input.substr(m[0].length)
				};
				return null;
			},
			"state of aggregation $": function state_of_aggregation_$(input) {
				var a = mhchemParser.patterns.findObserveGroups(input, "", /^\([a-z]{1,3}(?=[\),])/, ")", "");
				if (a && a.remainder.match(/^($|[\s,;\)\]\}])/)) return a;
				var m = input.match(/^(?:\((?:\\ca\s?)?\$[amothc]\$\))/);
				if (m) return {
					match_: m[0],
					remainder: input.substr(m[0].length)
				};
				return null;
			},
			"_{(state of aggregation)}$": /^_\{(\([a-z]{1,3}\))\}/,
			"{[(": /^(?:\\\{|\[|\()/,
			")]}": /^(?:\)|\]|\\\})/,
			", ": /^[,;]\s*/,
			",": /^[,;]/,
			".": /^[.]/,
			". ": /^([.\u22C5\u00B7\u2022])\s*/,
			"...": /^\.\.\.(?=$|[^.])/,
			"* ": /^([*])\s*/,
			"^{(...)}": function _(input) {
				return mhchemParser.patterns.findObserveGroups(input, "^{", "", "", "}");
			},
			"^($...$)": function $$(input) {
				return mhchemParser.patterns.findObserveGroups(input, "^", "$", "$", "");
			},
			"^a": /^\^([0-9]+|[^\\_])/,
			"^\\x{}{}": function x(input) {
				return mhchemParser.patterns.findObserveGroups(input, "^", /^\\[a-zA-Z]+\{/, "}", "", "", "{", "}", "", true);
			},
			"^\\x{}": function x(input) {
				return mhchemParser.patterns.findObserveGroups(input, "^", /^\\[a-zA-Z]+\{/, "}", "");
			},
			"^\\x": /^\^(\\[a-zA-Z]+)\s*/,
			"^(-1)": /^\^(-?\d+)/,
			"'": /^'/,
			"_{(...)}": function _(input) {
				return mhchemParser.patterns.findObserveGroups(input, "_{", "", "", "}");
			},
			"_($...$)": function _$$(input) {
				return mhchemParser.patterns.findObserveGroups(input, "_", "$", "$", "");
			},
			"_9": /^_([+\-]?[0-9]+|[^\\])/,
			"_\\x{}{}": function _X(input) {
				return mhchemParser.patterns.findObserveGroups(input, "_", /^\\[a-zA-Z]+\{/, "}", "", "", "{", "}", "", true);
			},
			"_\\x{}": function _X(input) {
				return mhchemParser.patterns.findObserveGroups(input, "_", /^\\[a-zA-Z]+\{/, "}", "");
			},
			"_\\x": /^_(\\[a-zA-Z]+)\s*/,
			"^_": /^(?:\^(?=_)|\_(?=\^)|[\^_]$)/,
			"{}": /^\{\}/,
			"{...}": function _(input) {
				return mhchemParser.patterns.findObserveGroups(input, "", "{", "}", "");
			},
			"{(...)}": function _(input) {
				return mhchemParser.patterns.findObserveGroups(input, "{", "", "", "}");
			},
			"$...$": function $$(input) {
				return mhchemParser.patterns.findObserveGroups(input, "", "$", "$", "");
			},
			"${(...)}$": function $$(input) {
				return mhchemParser.patterns.findObserveGroups(input, "${", "", "", "}$");
			},
			"$(...)$": function $$(input) {
				return mhchemParser.patterns.findObserveGroups(input, "$", "", "", "$");
			},
			"=<>": /^[=<>]/,
			"#": /^[#\u2261]/,
			"+": /^\+/,
			"-$": /^-(?=[\s_},;\]/]|$|\([a-z]+\))/,
			"-9": /^-(?=[0-9])/,
			"- orbital overlap": /^-(?=(?:[spd]|sp)(?:$|[\s,;\)\]\}]))/,
			"-": /^-/,
			"pm-operator": /^(?:\\pm|\$\\pm\$|\+-|\+\/-)/,
			"operator": /^(?:\+|(?:[\-=<>]|<<|>>|\\approx|\$\\approx\$)(?=\s|$|-?[0-9]))/,
			"arrowUpDown": /^(?:v|\(v\)|\^|\(\^\))(?=$|[\s,;\)\]\}])/,
			"\\bond{(...)}": function bond(input) {
				return mhchemParser.patterns.findObserveGroups(input, "\\bond{", "", "", "}");
			},
			"->": /^(?:<->|<-->|->|<-|<=>>|<<=>|<=>|[\u2192\u27F6\u21CC])/,
			"CMT": /^[CMT](?=\[)/,
			"[(...)]": function _(input) {
				return mhchemParser.patterns.findObserveGroups(input, "[", "", "", "]");
			},
			"1st-level escape": /^(&|\\\\|\\hline)\s*/,
			"\\,": /^(?:\\[,\ ;:])/,
			"\\x{}{}": function x(input) {
				return mhchemParser.patterns.findObserveGroups(input, "", /^\\[a-zA-Z]+\{/, "}", "", "", "{", "}", "", true);
			},
			"\\x{}": function x(input) {
				return mhchemParser.patterns.findObserveGroups(input, "", /^\\[a-zA-Z]+\{/, "}", "");
			},
			"\\ca": /^\\ca(?:\s+|(?![a-zA-Z]))/,
			"\\x": /^(?:\\[a-zA-Z]+\s*|\\[_&{}%])/,
			"orbital": /^(?:[0-9]{1,2}[spdfgh]|[0-9]{0,2}sp)(?=$|[^a-zA-Z])/,
			"others": /^[\/~|]/,
			"\\frac{(...)}": function frac(input) {
				return mhchemParser.patterns.findObserveGroups(input, "\\frac{", "", "", "}", "{", "", "", "}");
			},
			"\\overset{(...)}": function overset(input) {
				return mhchemParser.patterns.findObserveGroups(input, "\\overset{", "", "", "}", "{", "", "", "}");
			},
			"\\underset{(...)}": function underset(input) {
				return mhchemParser.patterns.findObserveGroups(input, "\\underset{", "", "", "}", "{", "", "", "}");
			},
			"\\underbrace{(...)}": function underbrace(input) {
				return mhchemParser.patterns.findObserveGroups(input, "\\underbrace{", "", "", "}_", "{", "", "", "}");
			},
			"\\color{(...)}0": function color0(input) {
				return mhchemParser.patterns.findObserveGroups(input, "\\color{", "", "", "}");
			},
			"\\color{(...)}{(...)}1": function color1(input) {
				return mhchemParser.patterns.findObserveGroups(input, "\\color{", "", "", "}", "{", "", "", "}");
			},
			"\\color(...){(...)}2": function color2(input) {
				return mhchemParser.patterns.findObserveGroups(input, "\\color", "\\", "", /^(?=\{)/, "{", "", "", "}");
			},
			"\\ce{(...)}": function ce(input) {
				return mhchemParser.patterns.findObserveGroups(input, "\\ce{", "", "", "}");
			},
			"oxidation$": /^(?:[+-][IVX]+|\\pm\s*0|\$\\pm\$\s*0)$/,
			"d-oxidation$": /^(?:[+-]?\s?[IVX]+|\\pm\s*0|\$\\pm\$\s*0)$/,
			"roman numeral": /^[IVX]+/,
			"1/2$": /^[+\-]?(?:[0-9]+|\$[a-z]\$|[a-z])\/[0-9]+(?:\$[a-z]\$|[a-z])?$/,
			"amount": function amount(input) {
				var match = input.match(/^(?:(?:(?:\([+\-]?[0-9]+\/[0-9]+\)|[+\-]?(?:[0-9]+|\$[a-z]\$|[a-z])\/[0-9]+|[+\-]?[0-9]+[.,][0-9]+|[+\-]?\.[0-9]+|[+\-]?[0-9]+)(?:[a-z](?=\s*[A-Z]))?)|[+\-]?[a-z](?=\s*[A-Z])|\+(?!\s))/);
				if (match) return {
					match_: match[0],
					remainder: input.substr(match[0].length)
				};
				var a = mhchemParser.patterns.findObserveGroups(input, "", "$", "$", "");
				if (a) {
					match = a.match_.match(/^\$(?:\(?[+\-]?(?:[0-9]*[a-z]?[+\-])?[0-9]*[a-z](?:[+\-][0-9]*[a-z]?)?\)?|\+|-)\$$/);
					if (match) return {
						match_: match[0],
						remainder: input.substr(match[0].length)
					};
				}
				return null;
			},
			"amount2": function amount2(input) {
				return this["amount"](input);
			},
			"(KV letters),": /^(?:[A-Z][a-z]{0,2}|i)(?=,)/,
			"formula$": function formula$(input) {
				if (input.match(/^\([a-z]+\)$/)) return null;
				var match = input.match(/^(?:[a-z]|(?:[0-9\ \+\-\,\.\(\)]+[a-z])+[0-9\ \+\-\,\.\(\)]*|(?:[a-z][0-9\ \+\-\,\.\(\)]+)+[a-z]?)$/);
				if (match) return {
					match_: match[0],
					remainder: input.substr(match[0].length)
				};
				return null;
			},
			"uprightEntities": /^(?:pH|pOH|pC|pK|iPr|iBu)(?=$|[^a-zA-Z])/,
			"/": /^\s*(\/)\s*/,
			"//": /^\s*(\/\/)\s*/,
			"*": /^\s*[*.]\s*/
		},
		findObserveGroups: function findObserveGroups(input, begExcl, begIncl, endIncl, endExcl, beg2Excl, beg2Incl, end2Incl, end2Excl, combine) {
			/** @type {{(input: string, pattern: string | RegExp): string | string[] | null;}} */
			var _match = function _match(input, pattern) {
				if (typeof pattern === "string") {
					if (input.indexOf(pattern) !== 0) return null;
					return pattern;
				} else {
					var match = input.match(pattern);
					if (!match) return null;
					return match[0];
				}
			};
			/** @type {{(input: string, i: number, endChars: string | RegExp): {endMatchBegin: number, endMatchEnd: number} | null;}} */
			var _findObserveGroups = function _findObserveGroups(input, i, endChars) {
				var braces = 0;
				while (i < input.length) {
					var a = input.charAt(i);
					var match = _match(input.substr(i), endChars);
					if (match !== null && braces === 0) return {
						endMatchBegin: i,
						endMatchEnd: i + match.length
					};
					else if (a === "{") braces++;
					else if (a === "}") {
						if (braces === 0) throw ["ExtraCloseMissingOpen", "Extra close brace or missing open brace"];
						else braces--;
					}
					i++;
				}
				if (braces > 0) return null;
				return null;
			};
			var match = _match(input, begExcl);
			if (match === null) return null;
			input = input.substr(match.length);
			match = _match(input, begIncl);
			if (match === null) return null;
			var e = _findObserveGroups(input, match.length, endIncl || endExcl);
			if (e === null) return null;
			var match1 = input.substring(0, endIncl ? e.endMatchEnd : e.endMatchBegin);
			if (!(beg2Excl || beg2Incl)) return {
				match_: match1,
				remainder: input.substr(e.endMatchEnd)
			};
			else {
				var group2 = this.findObserveGroups(input.substr(e.endMatchEnd), beg2Excl, beg2Incl, end2Incl, end2Excl);
				if (group2 === null) return null;
				/** @type {string[]} */
				var matchRet = [match1, group2.match_];
				return {
					match_: combine ? matchRet.join("") : matchRet,
					remainder: group2.remainder
				};
			}
		},
		match_: function match_(m, input) {
			var pattern = mhchemParser.patterns.patterns[m];
			if (pattern === void 0) throw ["MhchemBugP", "mhchem bug P. Please report. (" + m + ")"];
			else if (typeof pattern === "function") return mhchemParser.patterns.patterns[m](input);
			else {
				var match = input.match(pattern);
				if (match) {
					var mm;
					if (match[2]) mm = [match[1], match[2]];
					else if (match[1]) mm = match[1];
					else mm = match[0];
					return {
						match_: mm,
						remainder: input.substr(match[0].length)
					};
				}
				return null;
			}
		}
	},
	actions: {
		"a=": function a(buffer, m) {
			buffer.a = (buffer.a || "") + m;
		},
		"b=": function b(buffer, m) {
			buffer.b = (buffer.b || "") + m;
		},
		"p=": function p(buffer, m) {
			buffer.p = (buffer.p || "") + m;
		},
		"o=": function o(buffer, m) {
			buffer.o = (buffer.o || "") + m;
		},
		"q=": function q(buffer, m) {
			buffer.q = (buffer.q || "") + m;
		},
		"d=": function d(buffer, m) {
			buffer.d = (buffer.d || "") + m;
		},
		"rm=": function rm(buffer, m) {
			buffer.rm = (buffer.rm || "") + m;
		},
		"text=": function text(buffer, m) {
			buffer.text_ = (buffer.text_ || "") + m;
		},
		"insert": function insert(buffer, m, a) {
			return { type_: a };
		},
		"insert+p1": function insertP1(buffer, m, a) {
			return {
				type_: a,
				p1: m
			};
		},
		"insert+p1+p2": function insertP1P2(buffer, m, a) {
			return {
				type_: a,
				p1: m[0],
				p2: m[1]
			};
		},
		"copy": function copy(buffer, m) {
			return m;
		},
		"rm": function rm(buffer, m) {
			return {
				type_: "rm",
				p1: m || ""
			};
		},
		"text": function text(buffer, m) {
			return mhchemParser.go(m, "text");
		},
		"{text}": function text(buffer, m) {
			var ret = ["{"];
			mhchemParser.concatArray(ret, mhchemParser.go(m, "text"));
			ret.push("}");
			return ret;
		},
		"tex-math": function texMath(buffer, m) {
			return mhchemParser.go(m, "tex-math");
		},
		"tex-math tight": function texMath_tight(buffer, m) {
			return mhchemParser.go(m, "tex-math tight");
		},
		"bond": function bond(buffer, m, k) {
			return {
				type_: "bond",
				kind_: k || m
			};
		},
		"color0-output": function color0Output(buffer, m) {
			return {
				type_: "color0",
				color: m[0]
			};
		},
		"ce": function ce(buffer, m) {
			return mhchemParser.go(m);
		},
		"1/2": function _2(buffer, m) {
			/** @type {ParserOutput[]} */
			var ret = [];
			if (m.match(/^[+\-]/)) {
				ret.push(m.substr(0, 1));
				m = m.substr(1);
			}
			var n = m.match(/^([0-9]+|\$[a-z]\$|[a-z])\/([0-9]+)(\$[a-z]\$|[a-z])?$/);
			n[1] = n[1].replace(/\$/g, "");
			ret.push({
				type_: "frac",
				p1: n[1],
				p2: n[2]
			});
			if (n[3]) {
				n[3] = n[3].replace(/\$/g, "");
				ret.push({
					type_: "tex-math",
					p1: n[3]
				});
			}
			return ret;
		},
		"9,9": function _(buffer, m) {
			return mhchemParser.go(m, "9,9");
		}
	},
	createTransitions: function createTransitions(o) {
		var pattern, state;
		/** @type {string[]} */
		var stateArray;
		var i;
		/** @type {Transitions} */
		var transitions = {};
		for (pattern in o) for (state in o[pattern]) {
			stateArray = state.split("|");
			o[pattern][state].stateArray = stateArray;
			for (i = 0; i < stateArray.length; i++) transitions[stateArray[i]] = [];
		}
		for (pattern in o) for (state in o[pattern]) {
			stateArray = o[pattern][state].stateArray || [];
			for (i = 0; i < stateArray.length; i++) {
				/** @type {any} */
				var p = o[pattern][state];
				if (p.action_) {
					p.action_ = [].concat(p.action_);
					for (var k = 0; k < p.action_.length; k++) if (typeof p.action_[k] === "string") p.action_[k] = { type_: p.action_[k] };
				} else p.action_ = [];
				var patternArray = pattern.split("|");
				for (var j = 0; j < patternArray.length; j++) if (stateArray[i] === "*") for (var t in transitions) transitions[t].push({
					pattern: patternArray[j],
					task: p
				});
				else transitions[stateArray[i]].push({
					pattern: patternArray[j],
					task: p
				});
			}
		}
		return transitions;
	},
	stateMachines: {}
};
mhchemParser.stateMachines = {
	"ce": {
		transitions: mhchemParser.createTransitions({
			"empty": { "*": { action_: "output" } },
			"else": { "0|1|2": {
				action_: "beginsWithBond=false",
				revisit: true,
				toContinue: true
			} },
			"oxidation$": { "0": { action_: "oxidation-output" } },
			"CMT": {
				"r": {
					action_: "rdt=",
					nextState: "rt"
				},
				"rd": {
					action_: "rqt=",
					nextState: "rdt"
				}
			},
			"arrowUpDown": { "0|1|2|as": {
				action_: [
					"sb=false",
					"output",
					"operator"
				],
				nextState: "1"
			} },
			"uprightEntities": { "0|1|2": {
				action_: ["o=", "output"],
				nextState: "1"
			} },
			"orbital": { "0|1|2|3": {
				action_: "o=",
				nextState: "o"
			} },
			"->": {
				"0|1|2|3": {
					action_: "r=",
					nextState: "r"
				},
				"a|as": {
					action_: ["output", "r="],
					nextState: "r"
				},
				"*": {
					action_: ["output", "r="],
					nextState: "r"
				}
			},
			"+": {
				"o": {
					action_: "d= kv",
					nextState: "d"
				},
				"d|D": {
					action_: "d=",
					nextState: "d"
				},
				"q": {
					action_: "d=",
					nextState: "qd"
				},
				"qd|qD": {
					action_: "d=",
					nextState: "qd"
				},
				"dq": {
					action_: ["output", "d="],
					nextState: "d"
				},
				"3": {
					action_: [
						"sb=false",
						"output",
						"operator"
					],
					nextState: "0"
				}
			},
			"amount": { "0|2": {
				action_: "a=",
				nextState: "a"
			} },
			"pm-operator": { "0|1|2|a|as": {
				action_: [
					"sb=false",
					"output",
					{
						type_: "operator",
						option: "\\pm"
					}
				],
				nextState: "0"
			} },
			"operator": { "0|1|2|a|as": {
				action_: [
					"sb=false",
					"output",
					"operator"
				],
				nextState: "0"
			} },
			"-$": {
				"o|q": {
					action_: ["charge or bond", "output"],
					nextState: "qd"
				},
				"d": {
					action_: "d=",
					nextState: "d"
				},
				"D": {
					action_: ["output", {
						type_: "bond",
						option: "-"
					}],
					nextState: "3"
				},
				"q": {
					action_: "d=",
					nextState: "qd"
				},
				"qd": {
					action_: "d=",
					nextState: "qd"
				},
				"qD|dq": {
					action_: ["output", {
						type_: "bond",
						option: "-"
					}],
					nextState: "3"
				}
			},
			"-9": { "3|o": {
				action_: ["output", {
					type_: "insert",
					option: "hyphen"
				}],
				nextState: "3"
			} },
			"- orbital overlap": {
				"o": {
					action_: ["output", {
						type_: "insert",
						option: "hyphen"
					}],
					nextState: "2"
				},
				"d": {
					action_: ["output", {
						type_: "insert",
						option: "hyphen"
					}],
					nextState: "2"
				}
			},
			"-": {
				"0|1|2": {
					action_: [
						{
							type_: "output",
							option: 1
						},
						"beginsWithBond=true",
						{
							type_: "bond",
							option: "-"
						}
					],
					nextState: "3"
				},
				"3": { action_: {
					type_: "bond",
					option: "-"
				} },
				"a": {
					action_: ["output", {
						type_: "insert",
						option: "hyphen"
					}],
					nextState: "2"
				},
				"as": {
					action_: [{
						type_: "output",
						option: 2
					}, {
						type_: "bond",
						option: "-"
					}],
					nextState: "3"
				},
				"b": { action_: "b=" },
				"o": {
					action_: {
						type_: "- after o/d",
						option: false
					},
					nextState: "2"
				},
				"q": {
					action_: {
						type_: "- after o/d",
						option: false
					},
					nextState: "2"
				},
				"d|qd|dq": {
					action_: {
						type_: "- after o/d",
						option: true
					},
					nextState: "2"
				},
				"D|qD|p": {
					action_: ["output", {
						type_: "bond",
						option: "-"
					}],
					nextState: "3"
				}
			},
			"amount2": { "1|3": {
				action_: "a=",
				nextState: "a"
			} },
			"letters": {
				"0|1|2|3|a|as|b|p|bp|o": {
					action_: "o=",
					nextState: "o"
				},
				"q|dq": {
					action_: ["output", "o="],
					nextState: "o"
				},
				"d|D|qd|qD": {
					action_: "o after d",
					nextState: "o"
				}
			},
			"digits": {
				"o": {
					action_: "q=",
					nextState: "q"
				},
				"d|D": {
					action_: "q=",
					nextState: "dq"
				},
				"q": {
					action_: ["output", "o="],
					nextState: "o"
				},
				"a": {
					action_: "o=",
					nextState: "o"
				}
			},
			"space A": { "b|p|bp": {} },
			"space": {
				"a": { nextState: "as" },
				"0": { action_: "sb=false" },
				"1|2": { action_: "sb=true" },
				"r|rt|rd|rdt|rdq": {
					action_: "output",
					nextState: "0"
				},
				"*": {
					action_: ["output", "sb=true"],
					nextState: "1"
				}
			},
			"1st-level escape": {
				"1|2": { action_: ["output", {
					type_: "insert+p1",
					option: "1st-level escape"
				}] },
				"*": {
					action_: ["output", {
						type_: "insert+p1",
						option: "1st-level escape"
					}],
					nextState: "0"
				}
			},
			"[(...)]": {
				"r|rt": {
					action_: "rd=",
					nextState: "rd"
				},
				"rd|rdt": {
					action_: "rq=",
					nextState: "rdq"
				}
			},
			"...": {
				"o|d|D|dq|qd|qD": {
					action_: ["output", {
						type_: "bond",
						option: "..."
					}],
					nextState: "3"
				},
				"*": {
					action_: [{
						type_: "output",
						option: 1
					}, {
						type_: "insert",
						option: "ellipsis"
					}],
					nextState: "1"
				}
			},
			". |* ": { "*": {
				action_: ["output", {
					type_: "insert",
					option: "addition compound"
				}],
				nextState: "1"
			} },
			"state of aggregation $": { "*": {
				action_: ["output", "state of aggregation"],
				nextState: "1"
			} },
			"{[(": {
				"a|as|o": {
					action_: [
						"o=",
						"output",
						"parenthesisLevel++"
					],
					nextState: "2"
				},
				"0|1|2|3": {
					action_: [
						"o=",
						"output",
						"parenthesisLevel++"
					],
					nextState: "2"
				},
				"*": {
					action_: [
						"output",
						"o=",
						"output",
						"parenthesisLevel++"
					],
					nextState: "2"
				}
			},
			")]}": {
				"0|1|2|3|b|p|bp|o": {
					action_: ["o=", "parenthesisLevel--"],
					nextState: "o"
				},
				"a|as|d|D|q|qd|qD|dq": {
					action_: [
						"output",
						"o=",
						"parenthesisLevel--"
					],
					nextState: "o"
				}
			},
			", ": { "*": {
				action_: ["output", "comma"],
				nextState: "0"
			} },
			"^_": { "*": {} },
			"^{(...)}|^($...$)": {
				"0|1|2|as": {
					action_: "b=",
					nextState: "b"
				},
				"p": {
					action_: "b=",
					nextState: "bp"
				},
				"3|o": {
					action_: "d= kv",
					nextState: "D"
				},
				"q": {
					action_: "d=",
					nextState: "qD"
				},
				"d|D|qd|qD|dq": {
					action_: ["output", "d="],
					nextState: "D"
				}
			},
			"^a|^\\x{}{}|^\\x{}|^\\x|'": {
				"0|1|2|as": {
					action_: "b=",
					nextState: "b"
				},
				"p": {
					action_: "b=",
					nextState: "bp"
				},
				"3|o": {
					action_: "d= kv",
					nextState: "d"
				},
				"q": {
					action_: "d=",
					nextState: "qd"
				},
				"d|qd|D|qD": { action_: "d=" },
				"dq": {
					action_: ["output", "d="],
					nextState: "d"
				}
			},
			"_{(state of aggregation)}$": { "d|D|q|qd|qD|dq": {
				action_: ["output", "q="],
				nextState: "q"
			} },
			"_{(...)}|_($...$)|_9|_\\x{}{}|_\\x{}|_\\x": {
				"0|1|2|as": {
					action_: "p=",
					nextState: "p"
				},
				"b": {
					action_: "p=",
					nextState: "bp"
				},
				"3|o": {
					action_: "q=",
					nextState: "q"
				},
				"d|D": {
					action_: "q=",
					nextState: "dq"
				},
				"q|qd|qD|dq": {
					action_: ["output", "q="],
					nextState: "q"
				}
			},
			"=<>": { "0|1|2|3|a|as|o|q|d|D|qd|qD|dq": {
				action_: [{
					type_: "output",
					option: 2
				}, "bond"],
				nextState: "3"
			} },
			"#": { "0|1|2|3|a|as|o": {
				action_: [{
					type_: "output",
					option: 2
				}, {
					type_: "bond",
					option: "#"
				}],
				nextState: "3"
			} },
			"{}": { "*": {
				action_: {
					type_: "output",
					option: 1
				},
				nextState: "1"
			} },
			"{...}": {
				"0|1|2|3|a|as|b|p|bp": {
					action_: "o=",
					nextState: "o"
				},
				"o|d|D|q|qd|qD|dq": {
					action_: ["output", "o="],
					nextState: "o"
				}
			},
			"$...$": {
				"a": { action_: "a=" },
				"0|1|2|3|as|b|p|bp|o": {
					action_: "o=",
					nextState: "o"
				},
				"as|o": { action_: "o=" },
				"q|d|D|qd|qD|dq": {
					action_: ["output", "o="],
					nextState: "o"
				}
			},
			"\\bond{(...)}": { "*": {
				action_: [{
					type_: "output",
					option: 2
				}, "bond"],
				nextState: "3"
			} },
			"\\frac{(...)}": { "*": {
				action_: [{
					type_: "output",
					option: 1
				}, "frac-output"],
				nextState: "3"
			} },
			"\\overset{(...)}": { "*": {
				action_: [{
					type_: "output",
					option: 2
				}, "overset-output"],
				nextState: "3"
			} },
			"\\underset{(...)}": { "*": {
				action_: [{
					type_: "output",
					option: 2
				}, "underset-output"],
				nextState: "3"
			} },
			"\\underbrace{(...)}": { "*": {
				action_: [{
					type_: "output",
					option: 2
				}, "underbrace-output"],
				nextState: "3"
			} },
			"\\color{(...)}{(...)}1|\\color(...){(...)}2": { "*": {
				action_: [{
					type_: "output",
					option: 2
				}, "color-output"],
				nextState: "3"
			} },
			"\\color{(...)}0": { "*": { action_: [{
				type_: "output",
				option: 2
			}, "color0-output"] } },
			"\\ce{(...)}": { "*": {
				action_: [{
					type_: "output",
					option: 2
				}, "ce"],
				nextState: "3"
			} },
			"\\,": { "*": {
				action_: [{
					type_: "output",
					option: 1
				}, "copy"],
				nextState: "1"
			} },
			"\\x{}{}|\\x{}|\\x": {
				"0|1|2|3|a|as|b|p|bp|o|c0": {
					action_: ["o=", "output"],
					nextState: "3"
				},
				"*": {
					action_: [
						"output",
						"o=",
						"output"
					],
					nextState: "3"
				}
			},
			"others": { "*": {
				action_: [{
					type_: "output",
					option: 1
				}, "copy"],
				nextState: "3"
			} },
			"else2": {
				"a": {
					action_: "a to o",
					nextState: "o",
					revisit: true
				},
				"as": {
					action_: ["output", "sb=true"],
					nextState: "1",
					revisit: true
				},
				"r|rt|rd|rdt|rdq": {
					action_: ["output"],
					nextState: "0",
					revisit: true
				},
				"*": {
					action_: ["output", "copy"],
					nextState: "3"
				}
			}
		}),
		actions: {
			"o after d": function o_after_d(buffer, m) {
				var ret;
				if ((buffer.d || "").match(/^[0-9]+$/)) {
					var tmp = buffer.d;
					buffer.d = void 0;
					ret = this["output"](buffer);
					buffer.b = tmp;
				} else ret = this["output"](buffer);
				mhchemParser.actions["o="](buffer, m);
				return ret;
			},
			"d= kv": function d_kv(buffer, m) {
				buffer.d = m;
				buffer.dType = "kv";
			},
			"charge or bond": function charge_or_bond(buffer, m) {
				if (buffer["beginsWithBond"]) {
					/** @type {ParserOutput[]} */
					var ret = [];
					mhchemParser.concatArray(ret, this["output"](buffer));
					mhchemParser.concatArray(ret, mhchemParser.actions["bond"](buffer, m, "-"));
					return ret;
				} else buffer.d = m;
			},
			"- after o/d": function _after_o_d(buffer, m, isAfterD) {
				var c1 = mhchemParser.patterns.match_("orbital", buffer.o || "");
				var c2 = mhchemParser.patterns.match_("one lowercase greek letter $", buffer.o || "");
				var c3 = mhchemParser.patterns.match_("one lowercase latin letter $", buffer.o || "");
				var c4 = mhchemParser.patterns.match_("$one lowercase latin letter$ $", buffer.o || "");
				var hyphenFollows = m === "-" && (c1 && c1.remainder === "" || c2 || c3 || c4);
				if (hyphenFollows && !buffer.a && !buffer.b && !buffer.p && !buffer.d && !buffer.q && !c1 && c3) buffer.o = "$" + buffer.o + "$";
				/** @type {ParserOutput[]} */
				var ret = [];
				if (hyphenFollows) {
					mhchemParser.concatArray(ret, this["output"](buffer));
					ret.push({ type_: "hyphen" });
				} else {
					c1 = mhchemParser.patterns.match_("digits", buffer.d || "");
					if (isAfterD && c1 && c1.remainder === "") {
						mhchemParser.concatArray(ret, mhchemParser.actions["d="](buffer, m));
						mhchemParser.concatArray(ret, this["output"](buffer));
					} else {
						mhchemParser.concatArray(ret, this["output"](buffer));
						mhchemParser.concatArray(ret, mhchemParser.actions["bond"](buffer, m, "-"));
					}
				}
				return ret;
			},
			"a to o": function a_to_o(buffer) {
				buffer.o = buffer.a;
				buffer.a = void 0;
			},
			"sb=true": function sbTrue(buffer) {
				buffer.sb = true;
			},
			"sb=false": function sbFalse(buffer) {
				buffer.sb = false;
			},
			"beginsWithBond=true": function beginsWithBondTrue(buffer) {
				buffer["beginsWithBond"] = true;
			},
			"beginsWithBond=false": function beginsWithBondFalse(buffer) {
				buffer["beginsWithBond"] = false;
			},
			"parenthesisLevel++": function parenthesisLevel(buffer) {
				buffer["parenthesisLevel"]++;
			},
			"parenthesisLevel--": function parenthesisLevel(buffer) {
				buffer["parenthesisLevel"]--;
			},
			"state of aggregation": function state_of_aggregation(buffer, m) {
				return {
					type_: "state of aggregation",
					p1: mhchemParser.go(m, "o")
				};
			},
			"comma": function comma(buffer, m) {
				var a = m.replace(/\s*$/, "");
				if (a !== m && buffer["parenthesisLevel"] === 0) return {
					type_: "comma enumeration L",
					p1: a
				};
				else return {
					type_: "comma enumeration M",
					p1: a
				};
			},
			"output": function output(buffer, m, entityFollows) {
				/** @type {ParserOutput | ParserOutput[]} */
				var ret;
				if (!buffer.r) {
					ret = [];
					if (!buffer.a && !buffer.b && !buffer.p && !buffer.o && !buffer.q && !buffer.d && !entityFollows);
					else {
						if (buffer.sb) ret.push({ type_: "entitySkip" });
						if (!buffer.o && !buffer.q && !buffer.d && !buffer.b && !buffer.p && entityFollows !== 2) {
							buffer.o = buffer.a;
							buffer.a = void 0;
						} else if (!buffer.o && !buffer.q && !buffer.d && (buffer.b || buffer.p)) {
							buffer.o = buffer.a;
							buffer.d = buffer.b;
							buffer.q = buffer.p;
							buffer.a = buffer.b = buffer.p = void 0;
						} else if (buffer.o && buffer.dType === "kv" && mhchemParser.patterns.match_("d-oxidation$", buffer.d || "")) buffer.dType = "oxidation";
						else if (buffer.o && buffer.dType === "kv" && !buffer.q) buffer.dType = void 0;
						ret.push({
							type_: "chemfive",
							a: mhchemParser.go(buffer.a, "a"),
							b: mhchemParser.go(buffer.b, "bd"),
							p: mhchemParser.go(buffer.p, "pq"),
							o: mhchemParser.go(buffer.o, "o"),
							q: mhchemParser.go(buffer.q, "pq"),
							d: mhchemParser.go(buffer.d, buffer.dType === "oxidation" ? "oxidation" : "bd"),
							dType: buffer.dType
						});
					}
				} else {
					/** @type {ParserOutput[]} */
					var rd;
					if (buffer.rdt === "M") rd = mhchemParser.go(buffer.rd, "tex-math");
					else if (buffer.rdt === "T") rd = [{
						type_: "text",
						p1: buffer.rd || ""
					}];
					else rd = mhchemParser.go(buffer.rd);
					/** @type {ParserOutput[]} */
					var rq;
					if (buffer.rqt === "M") rq = mhchemParser.go(buffer.rq, "tex-math");
					else if (buffer.rqt === "T") rq = [{
						type_: "text",
						p1: buffer.rq || ""
					}];
					else rq = mhchemParser.go(buffer.rq);
					ret = {
						type_: "arrow",
						r: buffer.r,
						rd,
						rq
					};
				}
				for (var p in buffer) if (p !== "parenthesisLevel" && p !== "beginsWithBond") delete buffer[p];
				return ret;
			},
			"oxidation-output": function oxidationOutput(buffer, m) {
				var ret = ["{"];
				mhchemParser.concatArray(ret, mhchemParser.go(m, "oxidation"));
				ret.push("}");
				return ret;
			},
			"frac-output": function fracOutput(buffer, m) {
				return {
					type_: "frac-ce",
					p1: mhchemParser.go(m[0]),
					p2: mhchemParser.go(m[1])
				};
			},
			"overset-output": function oversetOutput(buffer, m) {
				return {
					type_: "overset",
					p1: mhchemParser.go(m[0]),
					p2: mhchemParser.go(m[1])
				};
			},
			"underset-output": function undersetOutput(buffer, m) {
				return {
					type_: "underset",
					p1: mhchemParser.go(m[0]),
					p2: mhchemParser.go(m[1])
				};
			},
			"underbrace-output": function underbraceOutput(buffer, m) {
				return {
					type_: "underbrace",
					p1: mhchemParser.go(m[0]),
					p2: mhchemParser.go(m[1])
				};
			},
			"color-output": function colorOutput(buffer, m) {
				return {
					type_: "color",
					color1: m[0],
					color2: mhchemParser.go(m[1])
				};
			},
			"r=": function r(buffer, m) {
				buffer.r = m;
			},
			"rdt=": function rdt(buffer, m) {
				buffer.rdt = m;
			},
			"rd=": function rd(buffer, m) {
				buffer.rd = m;
			},
			"rqt=": function rqt(buffer, m) {
				buffer.rqt = m;
			},
			"rq=": function rq(buffer, m) {
				buffer.rq = m;
			},
			"operator": function operator(buffer, m, p1) {
				return {
					type_: "operator",
					kind_: p1 || m
				};
			}
		}
	},
	"a": {
		transitions: mhchemParser.createTransitions({
			"empty": { "*": {} },
			"1/2$": { "0": { action_: "1/2" } },
			"else": { "0": {
				nextState: "1",
				revisit: true
			} },
			"$(...)$": { "*": {
				action_: "tex-math tight",
				nextState: "1"
			} },
			",": { "*": { action_: {
				type_: "insert",
				option: "commaDecimal"
			} } },
			"else2": { "*": { action_: "copy" } }
		}),
		actions: {}
	},
	"o": {
		transitions: mhchemParser.createTransitions({
			"empty": { "*": {} },
			"1/2$": { "0": { action_: "1/2" } },
			"else": { "0": {
				nextState: "1",
				revisit: true
			} },
			"letters": { "*": { action_: "rm" } },
			"\\ca": { "*": { action_: {
				type_: "insert",
				option: "circa"
			} } },
			"\\x{}{}|\\x{}|\\x": { "*": { action_: "copy" } },
			"${(...)}$|$(...)$": { "*": { action_: "tex-math" } },
			"{(...)}": { "*": { action_: "{text}" } },
			"else2": { "*": { action_: "copy" } }
		}),
		actions: {}
	},
	"text": {
		transitions: mhchemParser.createTransitions({
			"empty": { "*": { action_: "output" } },
			"{...}": { "*": { action_: "text=" } },
			"${(...)}$|$(...)$": { "*": { action_: "tex-math" } },
			"\\greek": { "*": { action_: ["output", "rm"] } },
			"\\,|\\x{}{}|\\x{}|\\x": { "*": { action_: ["output", "copy"] } },
			"else": { "*": { action_: "text=" } }
		}),
		actions: { "output": function output(buffer) {
			if (buffer.text_) {
				/** @type {ParserOutput} */
				var ret = {
					type_: "text",
					p1: buffer.text_
				};
				for (var p in buffer) delete buffer[p];
				return ret;
			}
		} }
	},
	"pq": {
		transitions: mhchemParser.createTransitions({
			"empty": { "*": {} },
			"state of aggregation $": { "*": { action_: "state of aggregation" } },
			"i$": { "0": {
				nextState: "!f",
				revisit: true
			} },
			"(KV letters),": { "0": {
				action_: "rm",
				nextState: "0"
			} },
			"formula$": { "0": {
				nextState: "f",
				revisit: true
			} },
			"1/2$": { "0": { action_: "1/2" } },
			"else": { "0": {
				nextState: "!f",
				revisit: true
			} },
			"${(...)}$|$(...)$": { "*": { action_: "tex-math" } },
			"{(...)}": { "*": { action_: "text" } },
			"a-z": { "f": { action_: "tex-math" } },
			"letters": { "*": { action_: "rm" } },
			"-9.,9": { "*": { action_: "9,9" } },
			",": { "*": { action_: {
				type_: "insert+p1",
				option: "comma enumeration S"
			} } },
			"\\color{(...)}{(...)}1|\\color(...){(...)}2": { "*": { action_: "color-output" } },
			"\\color{(...)}0": { "*": { action_: "color0-output" } },
			"\\ce{(...)}": { "*": { action_: "ce" } },
			"\\,|\\x{}{}|\\x{}|\\x": { "*": { action_: "copy" } },
			"else2": { "*": { action_: "copy" } }
		}),
		actions: {
			"state of aggregation": function state_of_aggregation(buffer, m) {
				return {
					type_: "state of aggregation subscript",
					p1: mhchemParser.go(m, "o")
				};
			},
			"color-output": function colorOutput(buffer, m) {
				return {
					type_: "color",
					color1: m[0],
					color2: mhchemParser.go(m[1], "pq")
				};
			}
		}
	},
	"bd": {
		transitions: mhchemParser.createTransitions({
			"empty": { "*": {} },
			"x$": { "0": {
				nextState: "!f",
				revisit: true
			} },
			"formula$": { "0": {
				nextState: "f",
				revisit: true
			} },
			"else": { "0": {
				nextState: "!f",
				revisit: true
			} },
			"-9.,9 no missing 0": { "*": { action_: "9,9" } },
			".": { "*": { action_: {
				type_: "insert",
				option: "electron dot"
			} } },
			"a-z": { "f": { action_: "tex-math" } },
			"x": { "*": { action_: {
				type_: "insert",
				option: "KV x"
			} } },
			"letters": { "*": { action_: "rm" } },
			"'": { "*": { action_: {
				type_: "insert",
				option: "prime"
			} } },
			"${(...)}$|$(...)$": { "*": { action_: "tex-math" } },
			"{(...)}": { "*": { action_: "text" } },
			"\\color{(...)}{(...)}1|\\color(...){(...)}2": { "*": { action_: "color-output" } },
			"\\color{(...)}0": { "*": { action_: "color0-output" } },
			"\\ce{(...)}": { "*": { action_: "ce" } },
			"\\,|\\x{}{}|\\x{}|\\x": { "*": { action_: "copy" } },
			"else2": { "*": { action_: "copy" } }
		}),
		actions: { "color-output": function colorOutput(buffer, m) {
			return {
				type_: "color",
				color1: m[0],
				color2: mhchemParser.go(m[1], "bd")
			};
		} }
	},
	"oxidation": {
		transitions: mhchemParser.createTransitions({
			"empty": { "*": {} },
			"roman numeral": { "*": { action_: "roman-numeral" } },
			"${(...)}$|$(...)$": { "*": { action_: "tex-math" } },
			"else": { "*": { action_: "copy" } }
		}),
		actions: { "roman-numeral": function romanNumeral(buffer, m) {
			return {
				type_: "roman numeral",
				p1: m || ""
			};
		} }
	},
	"tex-math": {
		transitions: mhchemParser.createTransitions({
			"empty": { "*": { action_: "output" } },
			"\\ce{(...)}": { "*": { action_: ["output", "ce"] } },
			"{...}|\\,|\\x{}{}|\\x{}|\\x": { "*": { action_: "o=" } },
			"else": { "*": { action_: "o=" } }
		}),
		actions: { "output": function output(buffer) {
			if (buffer.o) {
				/** @type {ParserOutput} */
				var ret = {
					type_: "tex-math",
					p1: buffer.o
				};
				for (var p in buffer) delete buffer[p];
				return ret;
			}
		} }
	},
	"tex-math tight": {
		transitions: mhchemParser.createTransitions({
			"empty": { "*": { action_: "output" } },
			"\\ce{(...)}": { "*": { action_: ["output", "ce"] } },
			"{...}|\\,|\\x{}{}|\\x{}|\\x": { "*": { action_: "o=" } },
			"-|+": { "*": { action_: "tight operator" } },
			"else": { "*": { action_: "o=" } }
		}),
		actions: {
			"tight operator": function tight_operator(buffer, m) {
				buffer.o = (buffer.o || "") + "{" + m + "}";
			},
			"output": function output(buffer) {
				if (buffer.o) {
					/** @type {ParserOutput} */
					var ret = {
						type_: "tex-math",
						p1: buffer.o
					};
					for (var p in buffer) delete buffer[p];
					return ret;
				}
			}
		}
	},
	"9,9": {
		transitions: mhchemParser.createTransitions({
			"empty": { "*": {} },
			",": { "*": { action_: "comma" } },
			"else": { "*": { action_: "copy" } }
		}),
		actions: { "comma": function comma() {
			return { type_: "commaDecimal" };
		} }
	},
	"pu": {
		transitions: mhchemParser.createTransitions({
			"empty": { "*": { action_: "output" } },
			"space$": { "*": { action_: ["output", "space"] } },
			"{[(|)]}": { "0|a": { action_: "copy" } },
			"(-)(9)^(-9)": { "0": {
				action_: "number^",
				nextState: "a"
			} },
			"(-)(9.,9)(e)(99)": { "0": {
				action_: "enumber",
				nextState: "a"
			} },
			"space": { "0|a": {} },
			"pm-operator": { "0|a": {
				action_: {
					type_: "operator",
					option: "\\pm"
				},
				nextState: "0"
			} },
			"operator": { "0|a": {
				action_: "copy",
				nextState: "0"
			} },
			"//": { "d": {
				action_: "o=",
				nextState: "/"
			} },
			"/": { "d": {
				action_: "o=",
				nextState: "/"
			} },
			"{...}|else": {
				"0|d": {
					action_: "d=",
					nextState: "d"
				},
				"a": {
					action_: ["space", "d="],
					nextState: "d"
				},
				"/|q": {
					action_: "q=",
					nextState: "q"
				}
			}
		}),
		actions: {
			"enumber": function enumber(buffer, m) {
				/** @type {ParserOutput[]} */
				var ret = [];
				if (m[0] === "+-" || m[0] === "+/-") ret.push("\\pm ");
				else if (m[0]) ret.push(m[0]);
				if (m[1]) {
					mhchemParser.concatArray(ret, mhchemParser.go(m[1], "pu-9,9"));
					if (m[2]) {
						if (m[2].match(/[,.]/)) mhchemParser.concatArray(ret, mhchemParser.go(m[2], "pu-9,9"));
						else ret.push(m[2]);
					}
					m[3] = m[4] || m[3];
					if (m[3]) {
						m[3] = m[3].trim();
						if (m[3] === "e" || m[3].substr(0, 1) === "*") ret.push({ type_: "cdot" });
						else ret.push({ type_: "times" });
					}
				}
				if (m[3]) ret.push("10^{" + m[5] + "}");
				return ret;
			},
			"number^": function number(buffer, m) {
				/** @type {ParserOutput[]} */
				var ret = [];
				if (m[0] === "+-" || m[0] === "+/-") ret.push("\\pm ");
				else if (m[0]) ret.push(m[0]);
				mhchemParser.concatArray(ret, mhchemParser.go(m[1], "pu-9,9"));
				ret.push("^{" + m[2] + "}");
				return ret;
			},
			"operator": function operator(buffer, m, p1) {
				return {
					type_: "operator",
					kind_: p1 || m
				};
			},
			"space": function space() {
				return { type_: "pu-space-1" };
			},
			"output": function output(buffer) {
				/** @type {ParserOutput | ParserOutput[]} */
				var ret;
				var md = mhchemParser.patterns.match_("{(...)}", buffer.d || "");
				if (md && md.remainder === "") buffer.d = md.match_;
				var mq = mhchemParser.patterns.match_("{(...)}", buffer.q || "");
				if (mq && mq.remainder === "") buffer.q = mq.match_;
				if (buffer.d) {
					buffer.d = buffer.d.replace(/\u00B0C|\^oC|\^{o}C/g, "{}^{\\circ}C");
					buffer.d = buffer.d.replace(/\u00B0F|\^oF|\^{o}F/g, "{}^{\\circ}F");
				}
				if (buffer.q) {
					buffer.q = buffer.q.replace(/\u00B0C|\^oC|\^{o}C/g, "{}^{\\circ}C");
					buffer.q = buffer.q.replace(/\u00B0F|\^oF|\^{o}F/g, "{}^{\\circ}F");
					var b5 = {
						d: mhchemParser.go(buffer.d, "pu"),
						q: mhchemParser.go(buffer.q, "pu")
					};
					if (buffer.o === "//") ret = {
						type_: "pu-frac",
						p1: b5.d,
						p2: b5.q
					};
					else {
						ret = b5.d;
						if (b5.d.length > 1 || b5.q.length > 1) ret.push({ type_: " / " });
						else ret.push({ type_: "/" });
						mhchemParser.concatArray(ret, b5.q);
					}
				} else ret = mhchemParser.go(buffer.d, "pu-2");
				for (var p in buffer) delete buffer[p];
				return ret;
			}
		}
	},
	"pu-2": {
		transitions: mhchemParser.createTransitions({
			"empty": { "*": { action_: "output" } },
			"*": { "*": {
				action_: ["output", "cdot"],
				nextState: "0"
			} },
			"\\x": { "*": { action_: "rm=" } },
			"space": { "*": {
				action_: ["output", "space"],
				nextState: "0"
			} },
			"^{(...)}|^(-1)": { "1": { action_: "^(-1)" } },
			"-9.,9": {
				"0": {
					action_: "rm=",
					nextState: "0"
				},
				"1": {
					action_: "^(-1)",
					nextState: "0"
				}
			},
			"{...}|else": { "*": {
				action_: "rm=",
				nextState: "1"
			} }
		}),
		actions: {
			"cdot": function cdot() {
				return { type_: "tight cdot" };
			},
			"^(-1)": function _(buffer, m) {
				buffer.rm += "^{" + m + "}";
			},
			"space": function space() {
				return { type_: "pu-space-2" };
			},
			"output": function output(buffer) {
				/** @type {ParserOutput | ParserOutput[]} */
				var ret = [];
				if (buffer.rm) {
					var mrm = mhchemParser.patterns.match_("{(...)}", buffer.rm || "");
					if (mrm && mrm.remainder === "") ret = mhchemParser.go(mrm.match_, "pu");
					else ret = {
						type_: "rm",
						p1: buffer.rm
					};
				}
				for (var p in buffer) delete buffer[p];
				return ret;
			}
		}
	},
	"pu-9,9": {
		transitions: mhchemParser.createTransitions({
			"empty": {
				"0": { action_: "output-0" },
				"o": { action_: "output-o" }
			},
			",": { "0": {
				action_: ["output-0", "comma"],
				nextState: "o"
			} },
			".": { "0": {
				action_: ["output-0", "copy"],
				nextState: "o"
			} },
			"else": { "*": { action_: "text=" } }
		}),
		actions: {
			"comma": function comma() {
				return { type_: "commaDecimal" };
			},
			"output-0": function output0(buffer) {
				/** @type {ParserOutput[]} */
				var ret = [];
				buffer.text_ = buffer.text_ || "";
				if (buffer.text_.length > 4) {
					var a = buffer.text_.length % 3;
					if (a === 0) a = 3;
					for (var i = buffer.text_.length - 3; i > 0; i -= 3) {
						ret.push(buffer.text_.substr(i, 3));
						ret.push({ type_: "1000 separator" });
					}
					ret.push(buffer.text_.substr(0, a));
					ret.reverse();
				} else ret.push(buffer.text_);
				for (var p in buffer) delete buffer[p];
				return ret;
			},
			"output-o": function outputO(buffer) {
				/** @type {ParserOutput[]} */
				var ret = [];
				buffer.text_ = buffer.text_ || "";
				if (buffer.text_.length > 4) {
					var a = buffer.text_.length - 3;
					for (var i = 0; i < a; i += 3) {
						ret.push(buffer.text_.substr(i, 3));
						ret.push({ type_: "1000 separator" });
					}
					ret.push(buffer.text_.substr(i));
				} else ret.push(buffer.text_);
				for (var p in buffer) delete buffer[p];
				return ret;
			}
		}
	}
};
/** @type {Texify} */
var texify = {
	go: function go(input, isInner) {
		if (!input) return "";
		var res = "";
		var cee = false;
		for (var i = 0; i < input.length; i++) {
			var inputi = input[i];
			if (typeof inputi === "string") res += inputi;
			else {
				res += texify._go2(inputi);
				if (inputi.type_ === "1st-level escape") cee = true;
			}
		}
		if (!isInner && !cee && res) res = "{" + res + "}";
		return res;
	},
	_goInner: function _goInner(input) {
		if (!input) return input;
		return texify.go(input, true);
	},
	_go2: function _go2(buf) {
		/** @type {undefined | string} */
		var res;
		switch (buf.type_) {
			case "chemfive":
				res = "";
				var b5 = {
					a: texify._goInner(buf.a),
					b: texify._goInner(buf.b),
					p: texify._goInner(buf.p),
					o: texify._goInner(buf.o),
					q: texify._goInner(buf.q),
					d: texify._goInner(buf.d)
				};
				if (b5.a) {
					if (b5.a.match(/^[+\-]/)) b5.a = "{" + b5.a + "}";
					res += b5.a + "\\,";
				}
				if (b5.b || b5.p) {
					res += "{\\vphantom{X}}";
					res += "^{\\hphantom{" + (b5.b || "") + "}}_{\\hphantom{" + (b5.p || "") + "}}";
					res += "{\\vphantom{X}}";
					res += "^{\\smash[t]{\\vphantom{2}}\\mathllap{" + (b5.b || "") + "}}";
					res += "_{\\vphantom{2}\\mathllap{\\smash[t]{" + (b5.p || "") + "}}}";
				}
				if (b5.o) {
					if (b5.o.match(/^[+\-]/)) b5.o = "{" + b5.o + "}";
					res += b5.o;
				}
				if (buf.dType === "kv") {
					if (b5.d || b5.q) res += "{\\vphantom{X}}";
					if (b5.d) res += "^{" + b5.d + "}";
					if (b5.q) res += "_{\\smash[t]{" + b5.q + "}}";
				} else if (buf.dType === "oxidation") {
					if (b5.d) {
						res += "{\\vphantom{X}}";
						res += "^{" + b5.d + "}";
					}
					if (b5.q) {
						res += "{\\vphantom{X}}";
						res += "_{\\smash[t]{" + b5.q + "}}";
					}
				} else {
					if (b5.q) {
						res += "{\\vphantom{X}}";
						res += "_{\\smash[t]{" + b5.q + "}}";
					}
					if (b5.d) {
						res += "{\\vphantom{X}}";
						res += "^{" + b5.d + "}";
					}
				}
				break;
			case "rm":
				res = "\\mathrm{" + buf.p1 + "}";
				break;
			case "text":
				if (buf.p1.match(/[\^_]/)) {
					buf.p1 = buf.p1.replace(" ", "~").replace("-", "\\text{-}");
					res = "\\mathrm{" + buf.p1 + "}";
				} else res = "\\text{" + buf.p1 + "}";
				break;
			case "roman numeral":
				res = "\\mathrm{" + buf.p1 + "}";
				break;
			case "state of aggregation":
				res = "\\mskip2mu " + texify._goInner(buf.p1);
				break;
			case "state of aggregation subscript":
				res = "\\mskip1mu " + texify._goInner(buf.p1);
				break;
			case "bond":
				res = texify._getBond(buf.kind_);
				if (!res) throw ["MhchemErrorBond", "mhchem Error. Unknown bond type (" + buf.kind_ + ")"];
				break;
			case "frac":
				var c = "\\frac{" + buf.p1 + "}{" + buf.p2 + "}";
				res = "\\mathchoice{\\textstyle" + c + "}{" + c + "}{" + c + "}{" + c + "}";
				break;
			case "pu-frac":
				var d = "\\frac{" + texify._goInner(buf.p1) + "}{" + texify._goInner(buf.p2) + "}";
				res = "\\mathchoice{\\textstyle" + d + "}{" + d + "}{" + d + "}{" + d + "}";
				break;
			case "tex-math":
				res = buf.p1 + " ";
				break;
			case "frac-ce":
				res = "\\frac{" + texify._goInner(buf.p1) + "}{" + texify._goInner(buf.p2) + "}";
				break;
			case "overset":
				res = "\\overset{" + texify._goInner(buf.p1) + "}{" + texify._goInner(buf.p2) + "}";
				break;
			case "underset":
				res = "\\underset{" + texify._goInner(buf.p1) + "}{" + texify._goInner(buf.p2) + "}";
				break;
			case "underbrace":
				res = "\\underbrace{" + texify._goInner(buf.p1) + "}_{" + texify._goInner(buf.p2) + "}";
				break;
			case "color":
				res = "{\\color{" + buf.color1 + "}{" + texify._goInner(buf.color2) + "}}";
				break;
			case "color0":
				res = "\\color{" + buf.color + "}";
				break;
			case "arrow":
				var b6 = {
					rd: texify._goInner(buf.rd),
					rq: texify._goInner(buf.rq)
				};
				var arrow = "\\x" + texify._getArrow(buf.r);
				if (b6.rq) arrow += "[{" + b6.rq + "}]";
				if (b6.rd) arrow += "{" + b6.rd + "}";
				else arrow += "{}";
				res = arrow;
				break;
			case "operator":
				res = texify._getOperator(buf.kind_);
				break;
			case "1st-level escape":
				res = buf.p1 + " ";
				break;
			case "space":
				res = " ";
				break;
			case "entitySkip":
				res = "~";
				break;
			case "pu-space-1":
				res = "~";
				break;
			case "pu-space-2":
				res = "\\mkern3mu ";
				break;
			case "1000 separator":
				res = "\\mkern2mu ";
				break;
			case "commaDecimal":
				res = "{,}";
				break;
			case "comma enumeration L":
				res = "{" + buf.p1 + "}\\mkern6mu ";
				break;
			case "comma enumeration M":
				res = "{" + buf.p1 + "}\\mkern3mu ";
				break;
			case "comma enumeration S":
				res = "{" + buf.p1 + "}\\mkern1mu ";
				break;
			case "hyphen":
				res = "\\text{-}";
				break;
			case "addition compound":
				res = "\\,{\\cdot}\\,";
				break;
			case "electron dot":
				res = "\\mkern1mu \\bullet\\mkern1mu ";
				break;
			case "KV x":
				res = "{\\times}";
				break;
			case "prime":
				res = "\\prime ";
				break;
			case "cdot":
				res = "\\cdot ";
				break;
			case "tight cdot":
				res = "\\mkern1mu{\\cdot}\\mkern1mu ";
				break;
			case "times":
				res = "\\times ";
				break;
			case "circa":
				res = "{\\sim}";
				break;
			case "^":
				res = "uparrow";
				break;
			case "v":
				res = "downarrow";
				break;
			case "ellipsis":
				res = "\\ldots ";
				break;
			case "/":
				res = "/";
				break;
			case " / ":
				res = "\\,/\\,";
				break;
			default: throw ["MhchemBugT", "mhchem bug T. Please report."];
		}
		return res;
	},
	_getArrow: function _getArrow(a) {
		switch (a) {
			case "->": return "rightarrow";
			case "→": return "rightarrow";
			case "⟶": return "rightarrow";
			case "<-": return "leftarrow";
			case "<->": return "leftrightarrow";
			case "<-->": return "rightleftarrows";
			case "<=>": return "rightleftharpoons";
			case "⇌": return "rightleftharpoons";
			case "<=>>": return "rightequilibrium";
			case "<<=>": return "leftequilibrium";
			default: throw ["MhchemBugT", "mhchem bug T. Please report."];
		}
	},
	_getBond: function _getBond(a) {
		switch (a) {
			case "-": return "{-}";
			case "1": return "{-}";
			case "=": return "{=}";
			case "2": return "{=}";
			case "#": return "{\\equiv}";
			case "3": return "{\\equiv}";
			case "~": return "{\\tripledash}";
			case "~-": return "{\\mathrlap{\\raisebox{-.1em}{$-$}}\\raisebox{.1em}{$\\tripledash$}}";
			case "~=": return "{\\mathrlap{\\raisebox{-.2em}{$-$}}\\mathrlap{\\raisebox{.2em}{$\\tripledash$}}-}";
			case "~--": return "{\\mathrlap{\\raisebox{-.2em}{$-$}}\\mathrlap{\\raisebox{.2em}{$\\tripledash$}}-}";
			case "-~-": return "{\\mathrlap{\\raisebox{-.2em}{$-$}}\\mathrlap{\\raisebox{.2em}{$-$}}\\tripledash}";
			case "...": return "{{\\cdot}{\\cdot}{\\cdot}}";
			case "....": return "{{\\cdot}{\\cdot}{\\cdot}{\\cdot}}";
			case "->": return "{\\rightarrow}";
			case "<-": return "{\\leftarrow}";
			case "<": return "{<}";
			case ">": return "{>}";
			default: throw ["MhchemBugT", "mhchem bug T. Please report."];
		}
	},
	_getOperator: function _getOperator(a) {
		switch (a) {
			case "+": return " {}+{} ";
			case "-": return " {}-{} ";
			case "=": return " {}={} ";
			case "<": return " {}<{} ";
			case ">": return " {}>{} ";
			case "<<": return " {}\\ll{} ";
			case ">>": return " {}\\gg{} ";
			case "\\pm": return " {}\\pm{} ";
			case "\\approx": return " {}\\approx{} ";
			case "$\\approx$": return " {}\\approx{} ";
			case "v": return " \\downarrow{} ";
			case "(v)": return " \\downarrow{} ";
			case "^": return " \\uparrow{} ";
			case "(^)": return " \\uparrow{} ";
			default: throw ["MhchemBugT", "mhchem bug T. Please report."];
		}
	}
};
//#endregion
//#region src/renderers/math.ts
function escapeHtml(value) {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function renderMathToHtml(tex, displayMode) {
	try {
		const html = katex.renderToString(tex, {
			displayMode,
			throwOnError: false,
			trust: false,
			output: "htmlAndMathml"
		});
		return !html.includes("katex-error") ? {
			ok: true,
			html
		} : {
			ok: false,
			html: `<span class="math-error">${escapeHtml(tex)}</span>`,
			message: "Invalid TeX"
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			ok: false,
			html: `<span class="math-error">${escapeHtml(tex)}</span>`,
			message
		};
	}
}
//#endregion
//#region src/features/math.ts
var MATH_DRAFT_RE = /^\$\$$/;
function escaped(text, pos) {
	let count = 0;
	for (let i = pos - 1; i >= 0 && text[i] === "\\"; i--) count++;
	return count % 2 === 1;
}
var scanInlineMath = (text, consumed) => {
	const out = [];
	for (let i = 0; i < text.length; i++) {
		if (text[i] !== "$" || consumed[i] || escaped(text, i)) continue;
		if (text[i + 1] === "$" || text[i - 1] === "$") continue;
		for (let j = i + 1; j < text.length; j++) {
			if (text[j] !== "$" || consumed[j] || escaped(text, j)) continue;
			if (text[j + 1] === "$" || text[j - 1] === "$") continue;
			const inner = text.slice(i + 1, j);
			if (!inner || /^\s|\s$/.test(inner)) break;
			let blocked = false;
			for (let k = i; k <= j; k++) if (consumed[k]) {
				blocked = true;
				break;
			}
			if (blocked) break;
			markConsumed(consumed, i, j + 1);
			out.push({
				type: "math_inline",
				from: i + 1,
				to: j,
				openFrom: i,
				openTo: i + 1,
				closeFrom: j,
				closeTo: j + 1,
				delimRanges: [
					{
						from: i,
						to: i + 1
					},
					{
						from: i + 1,
						to: j,
						softInside: true
					},
					{
						from: j,
						to: j + 1
					}
				],
				widgetDecorations: [{
					pos: i + 1,
					when: "outside",
					kind: "math-inline",
					attrs: { tex: inner },
					side: -1
				}]
			});
			i = j;
			break;
		}
	}
	return out;
};
function mathBlockRule(state, startLine, endLine, silent) {
	const start = state.bMarks[startLine] + state.tShift[startLine];
	const max = state.eMarks[startLine];
	if (state.src.slice(start, max).trim() !== "$$") return false;
	if (silent) return true;
	let nextLine = startLine + 1;
	let content = "";
	let found = false;
	for (; nextLine < endLine; nextLine++) {
		const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
		const lineMax = state.eMarks[nextLine];
		const raw = state.src.slice(lineStart, lineMax);
		if (raw.trim() === "$$") {
			found = true;
			break;
		}
		content += raw;
		if (nextLine < endLine - 1) content += "\n";
	}
	if (!found) return false;
	const token = state.push("math_block", "math-block", 0);
	token.block = true;
	token.content = content.replace(/\n$/, "");
	token.map = [startLine, nextLine + 1];
	state.line = nextLine + 1;
	return true;
}
function mathBlockPlugin(md) {
	md.block.ruler.before("fence", "math_block", mathBlockRule, { alt: [
		"paragraph",
		"reference",
		"blockquote",
		"list"
	] });
}
var MathBlockView = class {
	dom;
	contentDOM;
	preview;
	constructor(node) {
		const root = document.createElement("math-block");
		const source = document.createElement("math-source");
		const preview = document.createElement("math-preview");
		root.append(source, preview);
		this.dom = root;
		this.contentDOM = source;
		this.preview = preview;
		preview.setAttribute("contenteditable", "false");
		this.render(node);
	}
	render(node) {
		const result = renderMathToHtml(node.textContent, true);
		this.preview.dataset.mathState = result.ok ? "success" : "error";
		this.preview.innerHTML = result.html;
	}
	update(node, _decorations) {
		if (node.type.name !== "math_block") return false;
		this.render(node);
		return true;
	}
	stopEvent(event) {
		const target = event.target;
		return this.preview.contains(target);
	}
};
function mathBlockNodeViewPlugin() {
	return new Plugin({ props: { nodeViews: { math_block: (node) => new MathBlockView(node) } } });
}
function mathDraftPlugin() {
	return new Plugin({ props: { decorations(state) {
		const sel = state.selection;
		if (!sel.empty) return null;
		const $from = sel.$from;
		if ($from.parent.type.name !== "paragraph") return null;
		if (!MATH_DRAFT_RE.test($from.parent.textContent)) return null;
		const start = $from.start();
		return DecorationSet.create(state.doc, [Decoration.inline(start, start + 2, { class: "syntax-hint" })]);
	} } });
}
function insertMathBlockCommand(schema) {
	return (state, dispatch) => {
		const node = schema.nodes.math_block.create();
		if (dispatch) {
			const tr = state.tr.replaceSelectionWith(node);
			tr.setSelection(TextSelection.create(tr.doc, tr.selection.from - 1));
			dispatch(tr);
		}
		return true;
	};
}
var math = {
	name: "math",
	nodes: { math_block: {
		group: "block",
		content: "text*",
		marks: "",
		code: true,
		defining: true,
		parseDOM: [{
			tag: "math-block",
			preserveWhitespace: "full"
		}],
		toDOM: () => ["math-block", ["math-source", 0]]
	} },
	mdItPlugins: [mathBlockPlugin],
	parserTokens: { math_block: (state, tok, schema) => {
		const textNodes = tok.content ? [schema.text(tok.content)] : [];
		state.push(schema.nodes.math_block.createChecked(null, textNodes));
	} },
	blockHandlers: { math_block: (state, node) => {
		state.write("$$\n");
		state.tick("inner");
		for (const ch of node.textContent) {
			state.tick("inner");
			if (ch === "\n") {
				state.out += "\n";
				if (state.delim) state.out += state.delim;
			} else state.out += ch;
			state.advance(1);
		}
		state.tick("inner");
		state.write("\n$$");
		state.closeBlock(node);
	} },
	keymap: (schema) => ({
		Enter: (state, dispatch) => {
			const sel = state.selection;
			if (!sel.empty) return false;
			const $from = sel.$from;
			const para = $from.parent;
			if (para.type.name !== "paragraph") return false;
			if (!MATH_DRAFT_RE.test(para.textContent)) return false;
			if (dispatch) {
				const pos = $from.before();
				const block = schema.nodes.math_block.create();
				const tr = state.tr.replaceWith(pos, pos + para.nodeSize, block);
				tr.setSelection(TextSelection.create(tr.doc, pos + 1));
				dispatch(tr);
			}
			return true;
		},
		Backspace: (state, dispatch) => {
			const sel = state.selection;
			if (!sel.empty) return false;
			const $from = sel.$from;
			if ($from.parent.type.name !== "math_block") return false;
			if ($from.parent.content.size > 0) return false;
			if (dispatch) {
				const pos = $from.before();
				const tr = state.tr.delete(pos, pos + $from.parent.nodeSize);
				if (tr.doc.content.size === 0) {
					const p = schema.nodes.paragraph.createAndFill();
					if (p) tr.insert(0, p);
				}
				dispatch(tr);
			}
			return true;
		}
	}),
	plugins: () => [mathBlockNodeViewPlugin(), mathDraftPlugin()],
	inline: {
		priority: .8,
		scan: scanInlineMath,
		markNames: [],
		extRanges: () => []
	}
};
//#endregion
//#region src/features/strike.ts
var strike = {
	name: "strike",
	marks: { strike: {
		parseDOM: [{ tag: "s" }, { tag: "del" }],
		toDOM: () => ["s", 0]
	} },
	mdItPlugins: [(md) => md.enable("strikethrough")],
	parserTokens: {
		s_open: (state, _tok, schema) => {
			state.addText("~~");
			state.openMark(schema.marks.strike.create());
		},
		s_close: (state, _tok, schema) => {
			state.closeMarkType(schema.marks.strike);
			state.addText("~~");
		}
	},
	markDelims: { strike: {
		open: "",
		close: ""
	} },
	inline: {
		priority: 1,
		scan: (text, consumed) => scanFixedDelim(text, "~", 2, "strike", consumed),
		markNames: ["strike"],
		extRanges: (parent) => markExtRanges(parent, "strike", 2)
	}
};
//#endregion
//#region src/features/sub-sup.ts
var subSup = {
	name: "sub-sup",
	marks: {
		sub: {
			parseDOM: [{ tag: "sub" }],
			toDOM: () => ["sub", 0]
		},
		sup: {
			parseDOM: [{ tag: "sup" }],
			toDOM: () => ["sup", 0]
		}
	},
	markDelims: {
		sub: {
			open: "",
			close: ""
		},
		sup: {
			open: "",
			close: ""
		}
	},
	inline: {
		priority: 1.2,
		scan: (text, consumed) => {
			const subs = scanFixedDelim(text, "~", 1, "sub", consumed);
			const sups = scanFixedDelim(text, "^", 1, "sup", consumed);
			return [...subs, ...sups];
		},
		markNames: ["sub", "sup"],
		extRanges: (parent) => [...markExtRanges(parent, "sub", 1), ...markExtRanges(parent, "sup", 1)]
	}
};
//#endregion
//#region src/features/underline.ts
var OPEN = "<u>";
var CLOSE = "</u>";
var scan = (text, consumed) => {
	const out = [];
	let pos = 0;
	while (pos < text.length) {
		const openFrom = text.indexOf(OPEN, pos);
		if (openFrom === -1) break;
		const openTo = openFrom + 3;
		const closeFrom = text.indexOf(CLOSE, openTo);
		if (closeFrom === -1) break;
		const closeTo = closeFrom + 4;
		let blocked = false;
		for (let i = openFrom; i < closeTo; i++) if (consumed[i]) {
			blocked = true;
			break;
		}
		if (!blocked && openTo < closeFrom) {
			markConsumed(consumed, openFrom, closeTo);
			out.push({
				type: "underline",
				from: openTo,
				to: closeFrom,
				openFrom,
				openTo,
				closeFrom,
				closeTo
			});
		}
		pos = closeTo;
	}
	return out;
};
var underline = {
	name: "underline",
	marks: { underline: {
		parseDOM: [{ tag: "u" }],
		toDOM: () => ["u", 0]
	} },
	markDelims: { underline: {
		open: "",
		close: ""
	} },
	inline: {
		priority: 2.2,
		scan,
		markNames: ["underline"],
		extRanges: (parent) => markExtRanges(parent, "underline", 3, 4)
	}
};
//#endregion
//#region src/features/table.ts
function parseAlignFromStyle(style) {
	if (!style) return null;
	const m = /text-align:\s*(left|center|right)/.exec(style);
	return m ? m[1] : null;
}
function alignDelim(align, width) {
	const w = Math.max(3, width);
	if (align === "left") return ":" + "-".repeat(w - 1);
	if (align === "right") return "-".repeat(w - 1) + ":";
	if (align === "center") return ":" + "-".repeat(w - 2) + ":";
	return "-".repeat(w);
}
function findTableAtSelection(state) {
	const $from = state.selection.$from;
	let cellDepth = -1;
	for (let d = $from.depth; d >= 0; d--) if ($from.node(d).type.name === "table_cell") {
		cellDepth = d;
		break;
	}
	if (cellDepth === -1) return null;
	const tableDepth = cellDepth - 2;
	return {
		pos: $from.before(tableDepth),
		node: $from.node(tableDepth),
		rowIdx: $from.index(tableDepth),
		cellIdx: $from.index(cellDepth - 1)
	};
}
function applyAlignToColumn(view, info, align) {
	const tr = view.state.tr;
	let pos = info.pos + 1;
	info.node.forEach((row) => {
		let cellPos = pos + 1;
		row.forEach((cell, _o, idx) => {
			if (idx === info.cellIdx) tr.setNodeMarkup(cellPos, null, {
				...cell.attrs,
				align
			});
			cellPos += cell.nodeSize;
		});
		pos += row.nodeSize;
	});
	view.dispatch(tr);
	view.focus();
}
function deleteTable(view, info) {
	const schema = view.state.schema;
	const tr = view.state.tr;
	const start = info.pos;
	const end = start + info.node.nodeSize;
	const para = schema.nodes.paragraph.create();
	tr.replaceWith(start, end, para);
	tr.setSelection(TextSelection.create(tr.doc, start + 1));
	view.dispatch(tr);
	view.focus();
}
function resizeTable(view, info, rows, cols) {
	if (rows < 1 || cols < 1) return;
	const schema = view.state.schema;
	const old = info.node;
	const oldRows = [];
	old.forEach((r) => oldRows.push(r));
	const newRows = [];
	for (let r = 0; r < rows; r++) {
		const oldRow = oldRows[r];
		const oldCells = [];
		if (oldRow) oldRow.forEach((c) => oldCells.push(c));
		const cells = [];
		for (let c = 0; c < cols; c++) {
			const oldCell = oldCells[c];
			const isHeader = r === 0;
			const headerRowOld = oldRows[0];
			const align = headerRowOld && c < headerRowOld.childCount ? headerRowOld.child(c).attrs.align : null;
			const content = oldCell ? oldCell.content : null;
			cells.push(schema.nodes.table_cell.create({
				header: isHeader,
				align
			}, content));
		}
		newRows.push(schema.nodes.table_row.create(null, cells));
	}
	const newTable = schema.nodes.table.create(null, newRows);
	const tr = view.state.tr;
	const start = info.pos;
	const end = start + old.nodeSize;
	tr.replaceWith(start, end, newTable);
	const firstBodyCell = start + 1 + newRows[0].nodeSize + (rows > 1 ? 2 : -newRows[0].nodeSize + 2);
	const safePos = Math.min(firstBodyCell, tr.doc.content.size);
	tr.setSelection(TextSelection.create(tr.doc, safePos));
	view.dispatch(tr);
	view.focus();
}
function svgIcon(paths, viewBox = "0 0 24 24") {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", viewBox);
	svg.setAttribute("width", "16");
	svg.setAttribute("height", "16");
	svg.innerHTML = paths;
	return svg;
}
function buildToolbar(view, getInfo) {
	const root = document.createElement("div");
	root.className = "table-toolbar";
	const grid = document.createElement("button");
	grid.type = "button";
	grid.className = "table-tb-btn";
	grid.title = "Resize";
	grid.appendChild(svgIcon(`<rect x='4' y='4' width='6' height='6' fill='currentColor'/>
       <rect x='14' y='4' width='6' height='6' fill='currentColor'/>
       <rect x='4' y='14' width='6' height='6' fill='currentColor'/>
       <rect x='14' y='14' width='6' height='6' fill='currentColor'/>`));
	const sep = document.createElement("span");
	sep.className = "table-tb-sep";
	const mkAlign = (a, lines) => {
		const b = document.createElement("button");
		b.type = "button";
		b.className = "table-tb-btn";
		b.title = `Align ${a}`;
		b.dataset.align = a;
		b.appendChild(svgIcon(lines));
		b.addEventListener("mousedown", (e) => e.preventDefault());
		b.addEventListener("click", () => {
			const info = getInfo();
			if (info) applyAlignToColumn(view, info, a);
		});
		return b;
	};
	const alignL = mkAlign("left", `<line x1='4' y1='6' x2='20' y2='6' stroke='currentColor' stroke-width='2'/>
     <line x1='4' y1='12' x2='14' y2='12' stroke='currentColor' stroke-width='2'/>
     <line x1='4' y1='18' x2='18' y2='18' stroke='currentColor' stroke-width='2'/>`);
	const alignC = mkAlign("center", `<line x1='4' y1='6' x2='20' y2='6' stroke='currentColor' stroke-width='2'/>
     <line x1='7' y1='12' x2='17' y2='12' stroke='currentColor' stroke-width='2'/>
     <line x1='5' y1='18' x2='19' y2='18' stroke='currentColor' stroke-width='2'/>`);
	const alignR = mkAlign("right", `<line x1='4' y1='6' x2='20' y2='6' stroke='currentColor' stroke-width='2'/>
     <line x1='10' y1='12' x2='20' y2='12' stroke='currentColor' stroke-width='2'/>
     <line x1='6' y1='18' x2='20' y2='18' stroke='currentColor' stroke-width='2'/>`);
	const spacer = document.createElement("span");
	spacer.className = "table-tb-spacer";
	const trash = document.createElement("button");
	trash.type = "button";
	trash.className = "table-tb-btn table-tb-trash";
	trash.title = "Delete table";
	trash.appendChild(svgIcon(`<path d='M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12'
        stroke='currentColor' stroke-width='1.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/>`));
	trash.addEventListener("mousedown", (e) => e.preventDefault());
	trash.addEventListener("click", () => {
		const info = getInfo();
		if (info) deleteTable(view, info);
	});
	root.append(grid, sep, alignL, alignC, alignR, spacer, trash);
	let popupSnapshot = null;
	const popup = document.createElement("div");
	popup.className = "table-resize-popup";
	popup.style.display = "none";
	popup.addEventListener("mousedown", (e) => {
		if (e.target.tagName !== "INPUT") e.preventDefault();
	});
	const gridEl = document.createElement("div");
	gridEl.className = "table-resize-grid";
	const MAX_R = 10;
	const MAX_C = 10;
	const cells = [];
	for (let r = 0; r < MAX_R; r++) {
		const row = [];
		for (let c = 0; c < MAX_C; c++) {
			const cell = document.createElement("div");
			cell.className = "table-resize-cell";
			cell.dataset.r = String(r + 1);
			cell.dataset.c = String(c + 1);
			gridEl.appendChild(cell);
			row.push(cell);
		}
		cells.push(row);
	}
	const inputs = document.createElement("div");
	inputs.className = "table-resize-inputs";
	const rIn = document.createElement("input");
	rIn.type = "number";
	rIn.min = "1";
	rIn.max = "20";
	const xLabel = document.createElement("span");
	xLabel.textContent = "×";
	const cIn = document.createElement("input");
	cIn.type = "number";
	cIn.min = "1";
	cIn.max = "20";
	inputs.append(rIn, xLabel, cIn);
	const setHighlight = (R, C) => {
		for (let r = 0; r < MAX_R; r++) for (let c = 0; c < MAX_C; c++) cells[r][c].classList.toggle("hover", r < R && c < C);
		rIn.value = String(R);
		cIn.value = String(C);
	};
	gridEl.addEventListener("mousemove", (e) => {
		const t = e.target.closest(".table-resize-cell");
		if (!t) return;
		setHighlight(Number(t.dataset.r), Number(t.dataset.c));
	});
	gridEl.addEventListener("click", (e) => {
		const t = e.target.closest(".table-resize-cell");
		if (!t) return;
		const target = popupSnapshot ?? getInfo();
		if (!target) return;
		resizeTable(view, target, Number(t.dataset.r), Number(t.dataset.c));
		popup.style.display = "none";
		popupSnapshot = null;
	});
	const commitInputs = () => {
		const target = popupSnapshot ?? getInfo();
		if (!target) return;
		resizeTable(view, target, Math.max(1, Math.min(20, Number(rIn.value) || 1)), Math.max(1, Math.min(20, Number(cIn.value) || 1)));
		popup.style.display = "none";
		popupSnapshot = null;
	};
	rIn.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			commitInputs();
		}
	});
	cIn.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			commitInputs();
		}
	});
	popup.append(gridEl, inputs);
	grid.addEventListener("mousedown", (e) => e.preventDefault());
	grid.addEventListener("click", () => {
		const liveInfo = getInfo();
		if (!liveInfo) return;
		if (popup.style.display === "block") {
			popup.style.display = "none";
			popupSnapshot = null;
			return;
		}
		popupSnapshot = liveInfo;
		let R = 0, C = 0;
		liveInfo.node.forEach((row) => {
			R++;
			C = Math.max(C, row.childCount);
		});
		setHighlight(Math.min(R, MAX_R), Math.min(C, MAX_C));
		const r = grid.getBoundingClientRect();
		popup.style.top = `${r.bottom + 4}px`;
		popup.style.left = `${r.left}px`;
		popup.style.display = "block";
	});
	return {
		root,
		popup
	};
}
function tableToolbarPlugin() {
	return new Plugin({ view(view) {
		let info = null;
		let toolbar = null;
		const ensureMounted = () => {
			if (!toolbar) toolbar = buildToolbar(view, () => info);
			if (!toolbar.root.isConnected) {
				document.body.appendChild(toolbar.root);
				document.body.appendChild(toolbar.popup);
			}
			return toolbar;
		};
		const unmount = () => {
			if (toolbar?.root.isConnected) {
				toolbar.root.remove();
				toolbar.popup.remove();
			}
		};
		const update = () => {
			info = findTableAtSelection(view.state);
			if (!info || !view.hasFocus()) {
				unmount();
				return;
			}
			const dom = view.nodeDOM(info.pos);
			if (!dom) {
				unmount();
				return;
			}
			const tb = ensureMounted();
			const rect = dom.getBoundingClientRect();
			tb.root.style.display = "flex";
			tb.root.style.top = `${rect.top - 32}px`;
			tb.root.style.left = `${rect.left}px`;
			const cur = info.node.child(info.rowIdx).child(info.cellIdx).attrs.align;
			tb.root.querySelectorAll("[data-align]").forEach((b) => {
				b.classList.toggle("active", b.dataset.align === cur);
			});
		};
		const onScroll = () => update();
		window.addEventListener("scroll", onScroll, true);
		window.addEventListener("resize", onScroll);
		view.dom.addEventListener("focusin", update);
		view.dom.addEventListener("focusout", update);
		return {
			update() {
				update();
			},
			destroy() {
				window.removeEventListener("scroll", onScroll, true);
				window.removeEventListener("resize", onScroll);
				view.dom.removeEventListener("focusin", update);
				view.dom.removeEventListener("focusout", update);
				unmount();
			}
		};
	} });
}
function tabCellNav(dir) {
	return (state, dispatch) => {
		const $from = state.selection.$from;
		let cellDepth = -1;
		for (let d = $from.depth; d >= 0; d--) if ($from.node(d).type.name === "table_cell") {
			cellDepth = d;
			break;
		}
		if (cellDepth === -1) return false;
		const rowDepth = cellDepth - 1;
		const tableDepth = cellDepth - 2;
		const cellIdx = $from.index(rowDepth);
		const rowIdx = $from.index(tableDepth);
		const tableNode = $from.node(tableDepth);
		const row = $from.node(rowDepth);
		let nextRow = rowIdx;
		let nextCell = cellIdx + dir;
		if (nextCell < 0) {
			nextRow = rowIdx - 1;
			if (nextRow < 0) return true;
			nextCell = tableNode.child(nextRow).childCount - 1;
		} else if (nextCell >= row.childCount) {
			nextRow = rowIdx + 1;
			if (nextRow >= tableNode.childCount) return true;
			nextCell = 0;
		}
		if (dispatch) {
			let pos = $from.before(tableDepth) + 1;
			for (let r = 0; r < nextRow; r++) pos += tableNode.child(r).nodeSize;
			pos += 1;
			const targetRow = tableNode.child(nextRow);
			for (let c = 0; c < nextCell; c++) pos += targetRow.child(c).nodeSize;
			pos += 1;
			dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)));
		}
		return true;
	};
}
function renderCellInline(cell) {
	let out = "";
	cell.content.forEach((child) => {
		if (child.isText) out += child.text ?? "";
	});
	return out.replace(/\|/g, "\\|");
}
var table = {
	name: "table",
	nodes: {
		table: {
			group: "block",
			content: "table_row+",
			defining: true,
			isolating: true,
			parseDOM: [{ tag: "table" }],
			toDOM: () => ["table", ["tbody", 0]]
		},
		table_row: {
			content: "table_cell+",
			parseDOM: [{ tag: "tr" }],
			toDOM: () => ["tr", 0]
		},
		table_cell: {
			content: "inline*",
			attrs: {
				header: { default: false },
				align: { default: null }
			},
			isolating: true,
			parseDOM: [{
				tag: "th",
				getAttrs: (el) => ({
					header: true,
					align: parseAlignFromStyle(el.getAttribute("style"))
				})
			}, {
				tag: "td",
				getAttrs: (el) => ({
					header: false,
					align: parseAlignFromStyle(el.getAttribute("style"))
				})
			}],
			toDOM: (node) => {
				const tag = node.attrs.header ? "th" : "td";
				const align = node.attrs.align;
				return [
					tag,
					align ? { style: `text-align:${align}` } : {},
					0
				];
			}
		}
	},
	mdItPlugins: [(md) => md.enable("table")],
	plugins: () => [tableToolbarPlugin()],
	keymap: (schema) => ({
		Tab: tabCellNav(1),
		"Shift-Tab": tabCellNav(-1),
		"Mod-Enter": (state, dispatch) => {
			const $from = state.selection.$from;
			let cellDepth = -1;
			for (let d = $from.depth; d >= 0; d--) if ($from.node(d).type.name === "table_cell") {
				cellDepth = d;
				break;
			}
			if (cellDepth === -1) return false;
			const tableDepth = cellDepth - 2;
			const tableNode = $from.node(tableDepth);
			const rowIdx = $from.index(tableDepth);
			const cellIdx = $from.index(cellDepth - 1);
			const colCount = tableNode.child(rowIdx).childCount;
			if (dispatch) {
				const headerRow = tableNode.child(0);
				const newCells = [];
				for (let c = 0; c < colCount; c++) {
					const align = headerRow.child(c)?.attrs.align ?? null;
					newCells.push(schema.nodes.table_cell.create({
						header: false,
						align
					}, []));
				}
				const newRow = schema.nodes.table_row.create(null, newCells);
				let insertAt = $from.before(tableDepth) + 1;
				for (let r = 0; r <= rowIdx; r++) insertAt += tableNode.child(r).nodeSize;
				const tr = state.tr.insert(insertAt, newRow);
				let cursorPos = insertAt + 1;
				for (let c = 0; c < cellIdx; c++) cursorPos += newRow.child(c).nodeSize;
				cursorPos += 1;
				tr.setSelection(TextSelection.create(tr.doc, cursorPos));
				dispatch(tr);
			}
			return true;
		},
		"Mod-Shift-Backspace": (state, dispatch) => {
			const $from = state.selection.$from;
			let cellDepth = -1;
			for (let d = $from.depth; d >= 0; d--) if ($from.node(d).type.name === "table_cell") {
				cellDepth = d;
				break;
			}
			if (cellDepth === -1) return false;
			const tableDepth = cellDepth - 2;
			const tableNode = $from.node(tableDepth);
			const rowIdx = $from.index(tableDepth);
			const cellIdx = $from.index(cellDepth - 1);
			if (tableNode.childCount <= 1) return true;
			if (dispatch) {
				const tableStart = $from.before(tableDepth);
				let rowStart = tableStart + 1;
				for (let r = 0; r < rowIdx; r++) rowStart += tableNode.child(r).nodeSize;
				const row = tableNode.child(rowIdx);
				const tr = state.tr.delete(rowStart, rowStart + row.nodeSize);
				const newTable = tr.doc.nodeAt(tableStart);
				const targetRowIdx = Math.min(rowIdx, newTable.childCount - 1);
				let cursorPos = tableStart + 1;
				for (let r = 0; r < targetRowIdx; r++) cursorPos += newTable.child(r).nodeSize;
				cursorPos += 1;
				const targetRow = newTable.child(targetRowIdx);
				const targetCol = Math.min(cellIdx, targetRow.childCount - 1);
				for (let c = 0; c < targetCol; c++) cursorPos += targetRow.child(c).nodeSize;
				cursorPos += 1;
				tr.setSelection(TextSelection.create(tr.doc, cursorPos));
				dispatch(tr);
			}
			return true;
		},
		Enter: (state, dispatch) => {
			const sel = state.selection;
			if (!sel.empty) return false;
			const $from = sel.$from;
			if ($from.parent.type.name !== "paragraph") return false;
			const text = $from.parent.textContent;
			if (!/^\|.+\|$/.test(text)) return false;
			const cells = text.split("|").slice(1, -1).map((c) => c.trim());
			if (cells.length < 2) return false;
			if (dispatch) {
				const headerRow = schema.nodes.table_row.create(null, cells.map((c) => schema.nodes.table_cell.create({
					header: true,
					align: null
				}, c ? [schema.text(c)] : [])));
				const bodyRow = schema.nodes.table_row.create(null, cells.map(() => schema.nodes.table_cell.create({
					header: false,
					align: null
				}, [])));
				const tableNode = schema.nodes.table.create(null, [headerRow, bodyRow]);
				const paraStart = $from.before();
				const paraEnd = $from.after();
				const tr = state.tr;
				tr.replaceWith(paraStart, paraEnd, tableNode);
				const firstBodyCell = paraStart + 1 + headerRow.nodeSize + 2;
				tr.setSelection(TextSelection.create(tr.doc, firstBodyCell));
				dispatch(tr);
			}
			return true;
		}
	}),
	parserTokens: {
		table_open: (state, _tok, schema) => {
			state.openNode(schema.nodes.table);
		},
		table_close: (state) => {
			state.closeNode();
		},
		thead_open: () => {},
		thead_close: () => {},
		tbody_open: () => {},
		tbody_close: () => {},
		tr_open: (state, _tok, schema) => {
			state.openNode(schema.nodes.table_row);
		},
		tr_close: (state) => {
			state.closeNode();
		},
		th_open: (state, tok, schema) => {
			const align = parseAlignFromStyle(tok.attrGet("style"));
			state.openNode(schema.nodes.table_cell, {
				header: true,
				align
			});
		},
		th_close: (state) => {
			state.closeNode();
		},
		td_open: (state, tok, schema) => {
			const align = parseAlignFromStyle(tok.attrGet("style"));
			state.openNode(schema.nodes.table_cell, {
				header: false,
				align
			});
		},
		td_close: (state) => {
			state.closeNode();
		}
	},
	blockHandlers: { table: (state, node) => {
		const rows = [];
		const aligns = [];
		node.forEach((row, _, rowIdx) => {
			const cells = [];
			row.forEach((cell, _o, cellIdx) => {
				if (rowIdx === 0) aligns[cellIdx] = cell.attrs.align;
				cells.push(renderCellInline(cell));
			});
			rows.push(cells);
		});
		const colCount = aligns.length;
		const widths = new Array(colCount).fill(3);
		for (const r of rows) for (let i = 0; i < colCount; i++) widths[i] = Math.max(widths[i], (r[i] ?? "").length);
		const formatRow = (cells) => {
			return "|" + cells.map((c, i) => " " + c.padEnd(widths[i]) + " ").join("|") + "|";
		};
		const dividerRow = () => {
			return "|" + aligns.map((a, i) => " " + alignDelim(a, widths[i]) + " ").join("|") + "|";
		};
		state.write(formatRow(rows[0] ?? []));
		state.out += "\n";
		if (state.delim) state.out += state.delim;
		state.out += dividerRow();
		for (let i = 1; i < rows.length; i++) {
			state.out += "\n";
			if (state.delim) state.out += state.delim;
			state.out += formatRow(rows[i]);
		}
		state.closeBlock(node);
	} }
};
//#endregion
//#region src/features/task.ts
var TASK_RE = /^(\[ \]|\[x\]) /;
var nodes$1 = { task_marker: {
	group: "inline",
	inline: true,
	atom: true,
	selectable: false,
	attrs: { checked: { default: false } },
	parseDOM: [{
		tag: "span.task-marker",
		getAttrs: (el) => ({ checked: el.getAttribute("data-checked") === "1" })
	}],
	toDOM: (node) => ["span", {
		class: "task-marker",
		"data-checked": node.attrs.checked ? "1" : "0"
	}]
} };
function transformListItem(li) {
	const firstChild = li.firstChild;
	let foldedFirst = null;
	if (firstChild && firstChild.type.name === "paragraph") {
		const firstText = firstChild.firstChild;
		if (firstText && firstText.isText) {
			const m = TASK_RE.exec(firstText.text);
			if (m) {
				const checked = m[1] === "[x]";
				const sch = li.type.schema;
				const marker = sch.nodes.task_marker.create({ checked });
				const remainingText = firstText.text.slice(m[0].length);
				const newInline = [marker];
				if (remainingText) newInline.push(sch.text(remainingText, firstText.marks));
				firstChild.forEach((child, _, idx) => {
					if (idx > 0) newInline.push(child);
				});
				foldedFirst = firstChild.type.createAndFill(firstChild.attrs, newInline);
			}
		}
	}
	const newChildren = [];
	let changed = foldedFirst !== null;
	li.forEach((child, _, idx) => {
		let next;
		if (idx === 0 && foldedFirst) next = foldedFirst;
		else {
			next = transformBlock(child);
			if (next !== child) changed = true;
		}
		newChildren.push(next);
	});
	if (!changed) return li;
	return li.type.createAndFill(li.attrs, newChildren);
}
function transformBlock(node) {
	if (node.type.name === "list_item") return transformListItem(node);
	if (!node.isBlock || node.childCount === 0) return node;
	const newChildren = [];
	let changed = false;
	node.forEach((child) => {
		const t = transformBlock(child);
		if (t !== child) changed = true;
		newChildren.push(t);
	});
	if (!changed) return node;
	return node.type.createAndFill(node.attrs, newChildren);
}
var parserPostProcess = (doc) => transformBlock(doc);
var inlineNodeHandlers$1 = { task_marker: (state, node) => {
	state.write(node.attrs.checked ? "[x] " : "[ ] ");
} };
function buildNodeView() {
	return (node, view, getPos) => {
		const dom = document.createElement("span");
		dom.className = "checkbox-frame";
		dom.setAttribute("contenteditable", "false");
		const cb = document.createElement("span");
		cb.className = "checkbox";
		cb.setAttribute("data-checked", node.attrs.checked ? "1" : "0");
		dom.appendChild(cb);
		const onMousedown = (e) => {
			e.preventDefault();
		};
		const onClick = (e) => {
			if (!cb.contains(e.target) && e.target !== cb) return;
			e.preventDefault();
			e.stopPropagation();
			const pos = getPos();
			if (pos == null) return;
			const cur = view.state.doc.nodeAt(pos);
			if (!cur) return;
			view.dispatch(view.state.tr.setNodeMarkup(pos, void 0, { checked: !cur.attrs.checked }));
		};
		dom.addEventListener("mousedown", onMousedown);
		dom.addEventListener("click", onClick);
		return {
			dom,
			update(updated) {
				if (updated.type !== node.type) return false;
				cb.setAttribute("data-checked", updated.attrs.checked ? "1" : "0");
				return true;
			},
			destroy() {
				dom.removeEventListener("mousedown", onMousedown);
				dom.removeEventListener("click", onClick);
			}
		};
	};
}
function nodeViewPlugin() {
	return new Plugin({ props: { nodeViews: { task_marker: buildNodeView() } } });
}
var taskInputRule = new InputRule(/^(\[ \]|\[x\]) $/, (state, match, start, end) => {
	const $start = state.doc.resolve(start);
	if ($start.parent.type.name !== "paragraph") return null;
	if ($start.depth < 2) return null;
	if ($start.node($start.depth - 1).type.name !== "list_item") return null;
	if ($start.parentOffset !== 0) return null;
	const checked = match[1] === "[x]";
	return state.tr.replaceWith(start, end, state.schema.nodes.task_marker.create({ checked }));
});
function cursorTrapPlugin() {
	return new Plugin({ appendTransaction(_, _oldState, newState) {
		const sel = newState.selection;
		if (!sel.empty) return null;
		const $pos = newState.doc.resolve(sel.from);
		if ($pos.parent.type.name !== "paragraph") return null;
		if ($pos.parentOffset !== 0) return null;
		const firstChild = $pos.parent.firstChild;
		if (!firstChild || firstChild.type.name !== "task_marker") return null;
		return newState.tr.setSelection(TextSelection.create(newState.doc, sel.from + 1));
	} });
}
function isTaskListItem(li) {
	const first = li.firstChild;
	if (!first || first.type.name !== "paragraph") return false;
	const inner = first.firstChild;
	return !!inner && inner.type.name === "task_marker";
}
function doSplitPropagate(state, dispatch, checked) {
	const splitCmd = splitListItem(state.schema.nodes.list_item);
	let combined = null;
	splitCmd(state, (splitTr) => {
		const tr = state.tr;
		for (const step of splitTr.steps) tr.step(step);
		const newCursor = splitTr.selection.from;
		tr.replaceWith(newCursor, newCursor, state.schema.nodes.task_marker.create({ checked }));
		tr.setSelection(TextSelection.create(tr.doc, newCursor + 1));
		combined = tr;
	});
	if (!combined) return false;
	if (dispatch) dispatch(combined);
	return true;
}
function doDeleteAndFollow(state, dispatch, view, pStart, follow) {
	const trDelete = state.tr.delete(pStart, pStart + 1);
	if (!dispatch) return follow(state.apply(trDelete), void 0);
	if (!view) {
		dispatch(trDelete);
		return true;
	}
	trDelete.setMeta(NO_PROPAGATE_META, true);
	dispatch(trDelete);
	const next = view.state;
	follow(next, (followTr) => {
		followTr.setMeta(NO_PROPAGATE_META, true);
		view.dispatch(followTr);
	});
	return true;
}
var NO_PROPAGATE_META = "task-no-propagate";
var taskEnter = (state, dispatch, view) => {
	const sel = state.selection;
	if (!sel.empty) return false;
	const $from = sel.$from;
	let liDepth = -1;
	for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "list_item") {
		liDepth = d;
		break;
	}
	if (liDepth < 0) return false;
	const li = $from.node(liDepth);
	if (!isTaskListItem(li)) return false;
	if ($from.index(liDepth) !== 0) return false;
	const para = li.firstChild;
	const checked = para.firstChild.attrs.checked === true;
	if (!(para.content.size === 1)) return doSplitPropagate(state, dispatch, checked);
	const isTopLevel = liDepth === 2;
	const pStart = $from.before(liDepth) + 2;
	if (isTopLevel) {
		if ($from.index(liDepth - 1) > 0) return doDeleteAndFollow(state, dispatch, view, pStart, liftListItem(state.schema.nodes.list_item));
		return doSplitPropagate(state, dispatch, checked);
	}
	return doDeleteAndFollow(state, dispatch, view, pStart, liftNestedEmptyItemToBulletless(state.schema.nodes.list_item, state.schema.nodes.paragraph));
};
function selectionTouchesListItem(doc, selection, listItemType) {
	const { $from } = selection;
	for (let depth = $from.depth; depth > 0; depth -= 1) if ($from.node(depth).type === listItemType) return true;
	let found = false;
	doc.nodesBetween(selection.from, selection.to, (node) => {
		if (node.type === listItemType) found = true;
		return !found;
	});
	return found;
}
function taskMarkerPositions(doc, selection, schema) {
	const positions = [];
	if (selection.empty) {
		const { $from } = selection;
		for (let depth = $from.depth; depth > 0; depth -= 1) {
			const node = $from.node(depth);
			if (node.type !== schema.nodes.list_item) continue;
			if (node.firstChild?.firstChild?.type !== schema.nodes.task_marker) positions.push($from.before(depth) + 2);
			break;
		}
		return positions;
	}
	doc.nodesBetween(selection.from, selection.to, (node, position) => {
		if (node.type !== schema.nodes.list_item) return true;
		const paragraph = node.firstChild;
		if (paragraph?.type === schema.nodes.paragraph && paragraph.firstChild?.type !== schema.nodes.task_marker) positions.push(position + 2);
		return true;
	});
	return positions;
}
function insertTaskListCommand(schema) {
	return (state, dispatch, view) => {
		let transaction = state.tr;
		if (!selectionTouchesListItem(state.doc, state.selection, schema.nodes.list_item)) {
			let wrappedTransaction = null;
			if (!wrapInList(schema.nodes.bullet_list)(state, (next) => {
				wrappedTransaction = next;
			}, view)) return false;
			if (!dispatch || !wrappedTransaction) return true;
			for (const step of wrappedTransaction.steps) transaction.step(step);
		}
		const positions = taskMarkerPositions(transaction.doc, transaction.selection, schema);
		if (!dispatch) return positions.length > 0;
		for (const position of positions.reverse()) transaction.insert(position, schema.nodes.task_marker.create({ checked: false }));
		dispatch(transaction.scrollIntoView());
		return true;
	};
}
function propagateMarkerPlugin() {
	return new Plugin({ appendTransaction(transactions, _oldState, newState) {
		if (!transactions.some((t) => t.docChanged)) return null;
		if (transactions.some((t) => t.getMeta(NO_PROPAGATE_META))) return null;
		const tr = newState.tr;
		let changed = false;
		newState.doc.descendants((node, pos) => {
			if (node.type.name !== "bullet_list" && node.type.name !== "ordered_list") return true;
			let off = pos + 1;
			let prevIsTask = false;
			for (let i = 0; i < node.childCount; i++) {
				const li = node.child(i);
				const liEnd = off + li.nodeSize;
				const firstChild = li.firstChild;
				const isEmpty = li.childCount === 1 && firstChild?.type.name === "paragraph" && firstChild.content.size === 0;
				const isTask = isTaskListItem(li);
				if (prevIsTask && isEmpty && !isTask) {
					const insertPos = off + 2;
					const mapped = tr.mapping.map(insertPos);
					tr.replaceWith(mapped, mapped, newState.schema.nodes.task_marker.create({ checked: false }));
					changed = true;
				}
				prevIsTask = isTask;
				off = liEnd;
			}
			return true;
		});
		return changed ? tr : null;
	} });
}
var task = {
	name: "task",
	nodes: nodes$1,
	parserPostProcess,
	inlineNodeHandlers: inlineNodeHandlers$1,
	inputRules: () => [taskInputRule],
	keymap: () => ({ Enter: taskEnter }),
	plugins: () => [
		nodeViewPlugin(),
		cursorTrapPlugin(),
		propagateMarkerPlugin()
	]
};
//#endregion
//#region src/features/toc.ts
var liveViews = /* @__PURE__ */ new Set();
var TocNodeView = class {
	dom;
	view;
	lastDoc = null;
	lastSig = "";
	constructor(_node, view) {
		this.view = view;
		this.dom = document.createElement("div");
		this.dom.className = "toc";
		this.dom.setAttribute("contenteditable", "false");
		this.render();
		liveViews.add(this);
	}
	render() {
		const doc = this.view.state.doc;
		if (doc === this.lastDoc) return;
		const items = [];
		doc.descendants((node, pos) => {
			if (node.type.name === "heading") items.push({
				level: node.attrs.level,
				text: node.textContent,
				pos
			});
		});
		const sig = items.map((it) => `${it.pos}\t${it.level}\t${it.text}`).join("\n");
		if (sig === this.lastSig && this.lastDoc !== null) {
			this.lastDoc = doc;
			return;
		}
		this.lastDoc = doc;
		this.lastSig = sig;
		this.dom.innerHTML = "";
		if (items.length === 0) {
			const empty = document.createElement("div");
			empty.className = "toc-empty";
			empty.textContent = "(no headings yet)";
			this.dom.appendChild(empty);
			return;
		}
		const ul = document.createElement("ul");
		ul.className = "toc-list";
		for (const it of items) {
			const li = document.createElement("li");
			li.className = `toc-item toc-h${it.level}`;
			li.textContent = it.text || "(empty heading)";
			li.addEventListener("mousedown", (e) => {
				e.preventDefault();
			});
			li.addEventListener("click", () => this.jumpTo(it.pos));
			ul.appendChild(li);
		}
		this.dom.appendChild(ul);
	}
	jumpTo(headingPos) {
		const tr = this.view.state.tr;
		tr.setSelection(TextSelection.near(tr.doc.resolve(headingPos + 1)));
		this.view.dispatch(tr);
		this.view.nodeDOM(headingPos)?.scrollIntoView({
			block: "start",
			behavior: "smooth"
		});
		this.view.focus();
	}
	update() {
		return true;
	}
	destroy() {
		liveViews.delete(this);
	}
	stopEvent() {
		return false;
	}
	ignoreMutation() {
		return true;
	}
};
function tocRefreshPlugin() {
	return new Plugin({ view() {
		const tick = () => {
			for (const v of liveViews) v.render();
		};
		tick();
		return { update() {
			tick();
		} };
	} });
}
//#endregion
//#region src/features/index.ts
var ALL_FEATURES = [
	htmlComment,
	emoji,
	math,
	emphasis,
	code,
	strike,
	subSup,
	underline,
	highlight,
	autolink,
	link,
	image,
	hr,
	htmlBlock,
	blockquote,
	heading,
	task,
	list,
	fencedCode,
	frontMatter,
	refDef,
	table,
	{
		name: "toc",
		nodes: { toc: {
			group: "block",
			atom: true,
			selectable: true,
			defining: true,
			parseDOM: [{ tag: "div.toc" }],
			toDOM: () => ["div", { class: "toc" }]
		} },
		plugins: () => [tocRefreshPlugin(), new Plugin({ props: { nodeViews: { toc: (node, view) => new TocNodeView(node, view) } } })],
		keymap: () => ({ Enter: (state, dispatch) => {
			const sel = state.selection;
			if (!sel.empty) return false;
			const $from = sel.$from;
			if ($from.parent.type.name !== "paragraph") return false;
			const text = $from.parent.textContent;
			if (text !== "[toc]" && text !== "[TOC]") return false;
			if (dispatch) {
				const schema = state.schema;
				const tocNode = schema.nodes.toc.create();
				const paraStart = $from.before();
				const paraEnd = $from.after();
				const tr = state.tr;
				tr.replaceWith(paraStart, paraEnd, [tocNode, schema.nodes.paragraph.create()]);
				const newPos = paraStart + tocNode.nodeSize + 1;
				tr.setSelection(TextSelection.create(tr.doc, newPos));
				dispatch(tr);
			}
			return true;
		} }),
		parserPostProcess: (doc) => {
			const out = [];
			let changed = false;
			const tocType = doc.type.schema.nodes.toc;
			if (!tocType) return doc;
			doc.forEach((child) => {
				if (child.type.name === "paragraph" && (child.textContent === "[toc]" || child.textContent === "[TOC]")) {
					out.push(tocType.create());
					changed = true;
				} else out.push(child);
			});
			if (!changed) return doc;
			return doc.type.create(doc.attrs, out, doc.marks);
		},
		blockHandlers: { toc: (state, node) => {
			state.write("[toc]");
			state.closeBlock(node);
		} }
	},
	autoPair
];
function collectMarks() {
	return Object.assign({}, ...ALL_FEATURES.map((f) => f.marks ?? {}));
}
function collectNodes() {
	return Object.assign({}, ...ALL_FEATURES.map((f) => f.nodes ?? {}));
}
function collectMdItPlugins() {
	return ALL_FEATURES.flatMap((f) => f.mdItPlugins ?? []);
}
function collectParserTokens() {
	return Object.assign({}, ...ALL_FEATURES.map((f) => f.parserTokens ?? {}));
}
function collectMarkDelims() {
	return Object.assign({}, ...ALL_FEATURES.map((f) => f.markDelims ?? {}));
}
function collectInputRules(schema) {
	return ALL_FEATURES.flatMap((f) => f.inputRules?.(schema) ?? []);
}
function collectBlockHandlers() {
	return Object.assign({}, ...ALL_FEATURES.map((f) => f.blockHandlers ?? {}));
}
function collectInlineNodeHandlers() {
	return Object.assign({}, ...ALL_FEATURES.map((f) => f.inlineNodeHandlers ?? {}));
}
function collectParserPostProcessors() {
	return ALL_FEATURES.flatMap((f) => f.parserPostProcess ? [f.parserPostProcess] : []);
}
function collectKeymaps(schema) {
	const byKey = /* @__PURE__ */ new Map();
	for (const f of ALL_FEATURES) {
		const km = f.keymap?.(schema);
		if (!km) continue;
		for (const [key, cmd] of Object.entries(km)) {
			const arr = byKey.get(key) ?? [];
			arr.push(cmd);
			byKey.set(key, arr);
		}
	}
	const out = {};
	for (const [key, cmds] of byKey) out[key] = cmds.length === 1 ? cmds[0] : chainCommands(...cmds);
	return out;
}
function collectPlugins(schema) {
	return ALL_FEATURES.flatMap((f) => f.plugins?.(schema) ?? []);
}
function collectInlineFeatures() {
	return ALL_FEATURES.map((f) => f.inline).filter((x) => x !== void 0).sort((a, b) => a.priority - b.priority);
}
//#endregion
//#region src/schema.ts
var coreNodes = {
	doc: { content: "block+" },
	paragraph: {
		group: "block",
		content: "inline*",
		parseDOM: [{ tag: "p" }],
		toDOM: () => ["p", 0]
	},
	heading: {
		group: "block",
		content: "inline*",
		attrs: {
			level: { default: 1 },
			style: { default: "atx" }
		},
		defining: true,
		parseDOM: [
			1,
			2,
			3,
			4,
			5,
			6
		].map((level) => ({
			tag: `h${level}`,
			attrs: { level }
		})),
		toDOM: (node) => [`h${node.attrs.level}`, 0]
	},
	blockquote: {
		group: "block",
		content: "block+",
		defining: true,
		attrs: {
			alert: { default: null },
			alertSource: { default: null }
		},
		parseDOM: [{
			tag: "blockquote",
			getAttrs: (el) => getCalloutAttrsFromElement(el) ?? {}
		}],
		toDOM: (node) => {
			const alert = node.attrs.alert;
			const source = node.attrs.alertSource;
			if (!alert || !source) return ["blockquote", 0];
			return [
				"blockquote",
				{
					class: `md-alert md-alert-${alert}`,
					"data-alert": alert,
					"data-alert-source": source
				},
				0
			];
		}
	},
	code_block: {
		group: "block",
		content: "text*",
		marks: "",
		code: true,
		defining: true,
		attrs: { lang: { default: "" } },
		parseDOM: [{
			tag: "pre",
			preserveWhitespace: "full",
			getAttrs: (el) => ({ lang: el.getAttribute("data-lang") ?? "" })
		}],
		toDOM: (node) => [
			"pre",
			node.attrs.lang ? { "data-lang": node.attrs.lang } : {},
			["code", 0]
		]
	},
	horizontal_rule: {
		group: "block",
		parseDOM: [{ tag: "hr" }],
		toDOM: () => ["hr"]
	},
	bullet_list: {
		group: "block",
		content: "list_item+",
		parseDOM: [{ tag: "ul" }],
		toDOM: () => ["ul", 0]
	},
	ordered_list: {
		group: "block",
		content: "list_item+",
		attrs: { start: { default: 1 } },
		parseDOM: [{
			tag: "ol",
			getAttrs: (el) => {
				const start = el.getAttribute("start");
				return { start: start ? Number(start) : 1 };
			}
		}],
		toDOM: (node) => {
			const start = node.attrs.start;
			return [
				"ol",
				start === 1 ? {} : { start },
				0
			];
		}
	},
	list_item: {
		content: "paragraph block*",
		defining: true,
		parseDOM: [{ tag: "li" }],
		toDOM: () => ["li", 0]
	},
	text: { group: "inline" },
	hard_break: {
		group: "inline",
		inline: true,
		selectable: false,
		parseDOM: [{ tag: "br" }],
		toDOM: () => ["br"]
	}
};
var coreMarks = {};
var nodes = {
	...coreNodes,
	...collectNodes()
};
var marks = {
	...coreMarks,
	...collectMarks()
};
var schema = new Schema({
	nodes,
	marks
});
//#endregion
//#region src/normalize.ts
function textSegments(node) {
	const segments = [];
	let textOffset = 0;
	let pmOffset = 0;
	node.forEach((child) => {
		if (child.isText) {
			const len = child.text?.length ?? 0;
			segments.push({
				textFrom: textOffset,
				textTo: textOffset + len,
				pmFrom: pmOffset,
				pmTo: pmOffset + child.nodeSize
			});
			textOffset += len;
		}
		pmOffset += child.nodeSize;
	});
	return segments;
}
function textOffsetToPm(segments, offset, assoc) {
	for (const segment of segments) {
		if (offset > segment.textFrom && offset < segment.textTo) return segment.pmFrom + offset - segment.textFrom;
		if (offset === segment.textFrom && assoc > 0) return segment.pmFrom;
		if (offset === segment.textTo && assoc < 0) return segment.pmTo;
	}
	if (segments.length === 0) return 0;
	const first = segments[0];
	const last = segments[segments.length - 1];
	if (offset <= first.textFrom) return first.pmFrom;
	return last.pmTo;
}
function computePlan(doc, state) {
	const blocks = [];
	const delims = [];
	const extras = [];
	const widgets = [];
	doc.descendants((node, pos, parent) => {
		if (!node.isTextblock) return true;
		if (node.type.spec.code) return false;
		const text = node.textContent;
		const spans = parseInline(text, parent, state ? { state } : void 0);
		const blockStart = pos + 1;
		const segments = textSegments(node);
		const startPos = (offset) => blockStart + textOffsetToPm(segments, offset, 1);
		const endPos = (offset) => blockStart + textOffsetToPm(segments, offset, -1);
		blocks.push({
			blockPos: pos,
			plan: {
				blockStart,
				spans
			}
		});
		for (const s of spans) {
			const spanFrom = startPos(s.openFrom);
			const spanTo = endPos(s.closeTo);
			if (s.delimRanges) for (const dr of s.delimRanges) delims.push({
				from: startPos(dr.from),
				to: endPos(dr.to),
				spanFrom,
				spanTo,
				forceVisible: dr.forceVisible,
				softInside: dr.softInside,
				forceHidden: dr.forceHidden,
				className: dr.className
			});
			else {
				delims.push({
					from: startPos(s.openFrom),
					to: endPos(s.openTo),
					spanFrom,
					spanTo
				});
				delims.push({
					from: startPos(s.closeFrom),
					to: endPos(s.closeTo),
					spanFrom,
					spanTo
				});
			}
			if (s.extraDecorations) for (const ex of s.extraDecorations) extras.push({
				from: startPos(ex.from),
				to: endPos(ex.to),
				nodeName: ex.nodeName,
				attrs: ex.attrs
			});
			if (s.widgetDecorations) for (const w of s.widgetDecorations) widgets.push({
				pos: startPos(w.pos),
				spanFrom,
				spanTo,
				when: w.when,
				kind: w.kind,
				attrs: w.attrs,
				side: w.side
			});
		}
		return false;
	});
	return {
		blocks,
		delims,
		extras,
		widgets
	};
}
var normalizeKey = new PluginKey("normalize-inline");
function normalizeInlinePlugin() {
	return new Plugin({
		key: normalizeKey,
		state: {
			init: (_, state) => computePlan(state.doc, state),
			apply: (tr, prev, _oldState, newState) => tr.docChanged ? computePlan(newState.doc, newState) : prev
		},
		appendTransaction(_transactions, _oldState, newState) {
			const planState = normalizeKey.getState(newState);
			if (!planState) return null;
			const { blocks } = planState;
			const tr = newState.tr;
			const managedTypes = collectInlineFeatures().flatMap((f) => f.markNames).map((n) => schema.marks[n]).filter((t) => !!t);
			let changed = false;
			for (const { blockPos, plan } of blocks) {
				const blockNode = newState.doc.nodeAt(blockPos);
				if (!blockNode || !blockNode.isTextblock) continue;
				const { blockStart, spans } = plan;
				const blockEnd = blockStart + blockNode.content.size;
				const size = blockNode.content.size;
				const segments = textSegments(blockNode);
				const startPos = (offset) => textOffsetToPm(segments, offset, 1);
				const endPos = (offset) => textOffsetToPm(segments, offset, -1);
				if (spans.length === 0) {
					let hasManaged = false;
					blockNode.content.forEach((child) => {
						for (const mk of child.marks) if (managedTypes.includes(mk.type)) {
							hasManaged = true;
							return;
						}
					});
					if (!hasManaged) continue;
				}
				for (const markType of managedTypes) {
					const name = markType.name;
					let spansOfType = false;
					for (const s of spans) if (s.type === name) {
						spansOfType = true;
						break;
					}
					let hasMarkOfType = false;
					if (!spansOfType) {
						blockNode.content.forEach((child) => {
							if (hasMarkOfType) return;
							if (child.marks.some((mk) => mk.type === markType)) hasMarkOfType = true;
						});
						if (!hasMarkOfType) continue;
					}
					const targetMarks = new Array(size).fill(null);
					for (const s of spans) {
						if (s.type !== name) continue;
						const m = markType.create(s.attrs);
						const from = startPos(s.from);
						const to = endPos(s.to);
						for (let i = from; i < to; i++) targetMarks[i] = m;
					}
					const currentMarks = new Array(size).fill(null);
					{
						let cOff = 0;
						blockNode.content.forEach((child) => {
							const m = child.marks.find((mk) => mk.type === markType) ?? null;
							for (let i = 0; i < child.nodeSize; i++) currentMarks[cOff + i] = m;
							cOff += child.nodeSize;
						});
					}
					let same = true;
					for (let i = 0; i < size; i++) {
						const a = targetMarks[i];
						const b = currentMarks[i];
						if (a === b) continue;
						if (!a || !b || !a.eq(b)) {
							same = false;
							break;
						}
					}
					if (same) continue;
					tr.removeMark(blockStart, blockEnd, markType);
					for (const s of spans) if (s.type === name) tr.addMark(blockStart + startPos(s.from), blockStart + endPos(s.to), markType.create(s.attrs));
					changed = true;
				}
			}
			return changed ? tr : null;
		}
	});
}
function getDelims(state) {
	return normalizeKey.getState(state)?.delims ?? [];
}
function getExtras(state) {
	return normalizeKey.getState(state)?.extras ?? [];
}
function getWidgets(state) {
	return normalizeKey.getState(state)?.widgets ?? [];
}
//#endregion
//#region src/decorations.ts
var widgetBuilders = {
	"image-icon": (attrs) => {
		const el = document.createElement("span");
		el.className = attrs.broken ? "image-icon broken" : "image-icon";
		return el;
	},
	emoji: (attrs) => {
		const el = document.createElement("span");
		el.className = "emoji-glyph";
		el.textContent = attrs.glyph ?? "";
		if (attrs.len) el.setAttribute("data-len", attrs.len);
		return el;
	},
	"image-render": (attrs) => {
		const img = document.createElement("img");
		img.className = "image-render";
		if (attrs.src) img.setAttribute("src", attrs.src);
		if (attrs.alt) img.setAttribute("alt", attrs.alt);
		if (attrs.title) img.setAttribute("title", attrs.title);
		return img;
	},
	"math-inline": (attrs) => {
		const el = document.createElement("math-inline");
		const tex = attrs.tex ?? "";
		el.dataset.tex = tex;
		const result = renderMathToHtml(tex, false);
		el.dataset.mathState = result.ok ? "success" : "error";
		el.innerHTML = result.html;
		return el;
	},
	checkbox: (attrs) => {
		const el = document.createElement("span");
		el.className = "checkbox";
		el.setAttribute("data-checked", attrs.checked === "1" ? "1" : "0");
		return el;
	},
	"file-input": (attrs) => {
		const el = document.createElement("span");
		el.className = "file-input";
		el.setAttribute("contenteditable", "false");
		el.textContent = "📎";
		el.addEventListener("mousedown", (e) => {
			e.preventDefault();
		});
		el.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			const input = document.createElement("input");
			input.type = "file";
			if (attrs.accept) input.accept = attrs.accept;
			input.style.display = "none";
			input.addEventListener("change", () => {
				el.dispatchEvent(new CustomEvent("file-input-pick", {
					bubbles: true,
					detail: { files: input.files }
				}));
				document.body.removeChild(input);
			});
			document.body.appendChild(input);
			input.click();
		});
		return el;
	}
};
function buildWidget(w) {
	const builder = widgetBuilders[w.kind];
	const el = builder ? builder(w.attrs ?? {}) : (() => {
		const span = document.createElement("span");
		span.className = w.kind;
		return span;
	})();
	el.setAttribute("contenteditable", "false");
	el.setAttribute("data-pos", String(w.pos));
	return el;
}
function buildDecorationSet(state) {
	const decos = [];
	const cursor = state.selection.empty ? state.selection.from : null;
	for (const d of getDelims(state)) {
		const cursorInside = cursor !== null && cursor >= d.spanFrom && cursor <= d.spanTo;
		if (d.forceHidden) {
			decos.push(Decoration.inline(d.from, d.to, { class: d.className ?? "syntax-hidden" }));
			continue;
		}
		if (d.softInside) {
			if (!cursorInside) decos.push(Decoration.inline(d.from, d.to, { class: "syntax-hidden" }));
			continue;
		}
		if (d.className) {
			decos.push(Decoration.inline(d.from, d.to, { class: d.className }));
			continue;
		}
		const cls = d.forceVisible || cursorInside ? "syntax-hint" : "syntax-hidden";
		decos.push(Decoration.inline(d.from, d.to, { class: cls }));
	}
	for (const ex of getExtras(state)) decos.push(Decoration.inline(ex.from, ex.to, {
		nodeName: ex.nodeName,
		...ex.attrs ?? {}
	}));
	for (const w of getWidgets(state)) {
		const cursorInsideSpan = cursor !== null && cursor >= w.spanFrom && cursor <= w.spanTo;
		if (w.when === "inside" && !cursorInsideSpan) continue;
		if (w.when === "outside" && cursorInsideSpan) continue;
		const dom = buildWidget(w);
		decos.push(Decoration.widget(w.pos, dom, {
			side: w.side ?? -1,
			key: `${w.kind}@${w.pos}`,
			ignoreSelection: true,
			stopEvent: (e) => e.type !== "click"
		}));
	}
	return decos.length > 0 ? DecorationSet.create(state.doc, decos) : DecorationSet.empty;
}
var syntaxHintsKey = new PluginKey("syntaxHints");
function syntaxHintsPlugin() {
	return new Plugin({
		key: syntaxHintsKey,
		state: {
			init: (_, state) => buildDecorationSet(state),
			apply: (_tr, _old, _oldState, newState) => buildDecorationSet(newState)
		},
		props: { decorations(state) {
			return syntaxHintsKey.getState(state);
		} }
	});
}
//#endregion
//#region src/modes.ts
var focusModeKey = new PluginKey("focus-mode");
function focusModePlugin() {
	return new Plugin({
		key: focusModeKey,
		state: {
			init: () => ({ enabled: false }),
			apply(tr, value) {
				return tr.getMeta(focusModeKey) ?? value;
			}
		},
		props: { decorations(state) {
			if (!focusModeKey.getState(state)?.enabled || !state.selection.empty) return null;
			const activePos = state.selection.from;
			const decos = [];
			state.doc.descendants((node, pos) => {
				if (!node.isBlock) return true;
				const active = activePos >= pos && activePos <= pos + node.nodeSize;
				decos.push(Decoration.node(pos, pos + node.nodeSize, { class: active ? "tw-focus-active" : "tw-focus-muted" }));
				return false;
			});
			return DecorationSet.create(state.doc, decos);
		} }
	});
}
function setFocusMode(state, dispatch, enabled) {
	dispatch(state.tr.setMeta(focusModeKey, { enabled }));
}
function isFocusMode(state) {
	return focusModeKey.getState(state)?.enabled ?? false;
}
//#endregion
//#region src/input-rules.ts
function markdownInputRules() {
	return inputRules({ rules: collectInputRules(schema) });
}
function spaceBreaksStoredMarks() {
	return new Plugin({ props: { handleTextInput(view, from, to, text) {
		if (text !== " ") return false;
		const stored = view.state.storedMarks;
		if (!stored || stored.length === 0) return false;
		const spaceNode = view.state.schema.text(" ");
		const tr = view.state.tr.replaceWith(from, to, spaceNode).setStoredMarks(null);
		view.dispatch(tr);
		return true;
	} } });
}
//#endregion
//#region src/shortcuts.ts
function insertHardBreak(schema) {
	return (state, dispatch) => {
		if (convertCurrentBlockquoteCallout(state, dispatch)) return true;
		if (dispatch) {
			const node = schema.nodes.hard_break.create();
			dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
		}
		return true;
	};
}
function wrapSelection(open, close = open) {
	return (state, dispatch) => {
		const { from, to, empty } = state.selection;
		if (dispatch) {
			const selected = empty ? "" : state.doc.textBetween(from, to, "\n", "\n");
			const tr = state.tr.insertText(`${open}${selected}${close}`, from, to);
			const cursor = empty ? from + open.length : from + open.length + selected.length + close.length;
			tr.setSelection(TextSelection.create(tr.doc, cursor));
			dispatch(tr);
		}
		return true;
	};
}
function insertEmptyLink() {
	return wrapSelection("[", "](url)");
}
function setHeading(schema, level) {
	return setBlockType(schema.nodes.heading, {
		level,
		style: "atx"
	});
}
function insertCodeBlockCommand(schema) {
	return (state, dispatch) => {
		const node = schema.nodes.code_block.create({ lang: "" });
		if (dispatch) {
			const tr = state.tr.replaceSelectionWith(node);
			tr.setSelection(TextSelection.create(tr.doc, tr.selection.from - 1));
			dispatch(tr);
		}
		return true;
	};
}
function commonShortcutKeymap(schema) {
	return {
		"Mod-b": wrapSelection("**"),
		"Mod-i": wrapSelection("*"),
		"Mod-u": wrapSelection("<u>", "</u>"),
		"Mod-Shift-`": wrapSelection("`"),
		"Alt-Shift-5": wrapSelection("~~"),
		"Mod-k": insertEmptyLink(),
		"Shift-Enter": insertHardBreak(schema),
		"Mod-0": setBlockType(schema.nodes.paragraph),
		"Mod-1": setHeading(schema, 1),
		"Mod-2": setHeading(schema, 2),
		"Mod-3": setHeading(schema, 3),
		"Mod-4": setHeading(schema, 4),
		"Mod-5": setHeading(schema, 5),
		"Mod-6": setHeading(schema, 6),
		"Mod-Shift-q": wrapIn(schema.nodes.blockquote),
		"Mod-Shift-8": wrapInList(schema.nodes.bullet_list),
		"Mod-Shift-x": insertTaskListCommand(schema),
		"Mod-Shift-7": wrapInList(schema.nodes.ordered_list),
		"Mod-Shift-k": insertCodeBlockCommand(schema),
		"Mod-Shift-m": insertMathBlockCommand(schema)
	};
}
//#endregion
//#region src/editor.ts
function openLinkOnModClickPlugin() {
	return new Plugin({ props: { handleClick(_view, _pos, event) {
		if (!(/Mac|iPhone|iPad/.test(navigator.platform) ? event.metaKey : event.ctrlKey)) return false;
		const a = event.target?.closest("a");
		if (!a) return false;
		const href = a.getAttribute("href");
		if (!href) return false;
		event.preventDefault();
		window.open(href, "_blank", "noopener,noreferrer");
		return true;
	} } });
}
function defaultPlugins(options = {}) {
	const { cursorWidget = true } = options;
	const featureKeymap = collectKeymaps(schema);
	const plugins = [
		history$1(),
		keymap$1({
			"Mod-z": undo,
			"Mod-y": redo,
			"Mod-Shift-z": redo
		}),
		keymap$1(commonShortcutKeymap(schema)),
		focusModePlugin(),
		markdownInputRules(),
		spaceBreaksStoredMarks(),
		documentMetadataPlugin(),
		normalizeInlinePlugin(),
		...collectPlugins(schema),
		syntaxHintsPlugin(),
		openLinkOnModClickPlugin()
	];
	if (cursorWidget) plugins.push(cursorRenderPlugin());
	if (Object.keys(featureKeymap).length > 0) plugins.push(keymap$1(featureKeymap));
	plugins.push(keymap$1(baseKeymap));
	return plugins;
}
//#endregion
//#region src/local-files.ts
async function pickMarkdownFile() {
	if (!window.showOpenFilePicker) return pickMarkdownFileWithInput();
	try {
		const handle = (await window.showOpenFilePicker({
			multiple: false,
			types: [{
				description: "Markdown",
				accept: { "text/markdown": [
					".md",
					".markdown",
					".mdown"
				] }
			}]
		}))[0];
		if (!handle) return { status: "cancelled" };
		return {
			status: "picked",
			handle,
			file: await handle.getFile()
		};
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") return { status: "cancelled" };
		return {
			status: "error",
			message: error instanceof Error ? error.message : String(error)
		};
	}
}
async function readMarkdownFileHandle(handle) {
	try {
		const file = await handle.getFile();
		return {
			status: "opened",
			handle,
			name: handle.name || file.name,
			text: await file.text()
		};
	} catch (error) {
		return {
			status: "error",
			message: error instanceof Error ? error.message : String(error)
		};
	}
}
async function createMarkdownFile() {
	if (!window.showSaveFilePicker) return { status: "unsupported" };
	try {
		const handle = await window.showSaveFilePicker({
			suggestedName: "untitled.md",
			types: [{
				description: "Markdown",
				accept: { "text/markdown": [
					".md",
					".markdown",
					".mdown"
				] }
			}]
		});
		const result = await writeMarkdownFile(handle, "");
		if (result.status === "saved") return {
			status: "created",
			handle,
			name: result.name
		};
		if (result.status === "error") return result;
		return {
			status: "error",
			message: "Unable to create file"
		};
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") return { status: "cancelled" };
		return {
			status: "error",
			message: error instanceof Error ? error.message : String(error)
		};
	}
}
function pickMarkdownFileWithInput() {
	if (typeof document === "undefined") return Promise.resolve({ status: "unsupported" });
	return new Promise((resolve) => {
		const input = document.createElement("input");
		let settled = false;
		let cancelTimer = 0;
		input.type = "file";
		input.accept = ".md,.markdown,.mdown,text/markdown,text/plain";
		input.style.display = "none";
		const cleanup = () => {
			window.clearTimeout(cancelTimer);
			window.removeEventListener("focus", onWindowFocus);
			input.remove();
		};
		const finish = (result) => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(result);
		};
		const onWindowFocus = () => {
			cancelTimer = window.setTimeout(() => {
				if (!input.files?.length) finish({ status: "cancelled" });
			}, 0);
		};
		input.addEventListener("change", () => {
			const file = input.files?.[0] ?? null;
			finish(file ? {
				status: "picked",
				handle: null,
				file
			} : { status: "cancelled" });
		}, { once: true });
		window.addEventListener("focus", onWindowFocus);
		document.body.appendChild(input);
		try {
			input.click();
		} catch (error) {
			finish({
				status: "error",
				message: error instanceof Error ? error.message : String(error)
			});
		}
	});
}
async function writeMarkdownFile(handle, markdown) {
	try {
		const writable = await handle.createWritable();
		await writable.write(markdown);
		await writable.close();
		return {
			status: "saved",
			name: handle.name,
			handle
		};
	} catch (error) {
		return {
			status: "error",
			message: error instanceof Error ? error.message : String(error)
		};
	}
}
async function saveMarkdownFileAs(markdown, suggestedName = "untitled.md") {
	if (!window.showSaveFilePicker) return downloadMarkdown(markdown, suggestedName);
	try {
		return writeMarkdownFile(await window.showSaveFilePicker({
			suggestedName,
			types: [{
				description: "Markdown",
				accept: { "text/markdown": [
					".md",
					".markdown",
					".mdown"
				] }
			}]
		}), markdown);
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") return { status: "cancelled" };
		return {
			status: "error",
			message: error instanceof Error ? error.message : String(error)
		};
	}
}
function downloadMarkdown(markdown, name) {
	const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.style.display = "none";
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
	return {
		status: "downloaded",
		name
	};
}
//#endregion
//#region src/parser.ts
var md = new MarkdownIt("commonmark", { html: true });
for (const plugin of collectMdItPlugins()) md.use(plugin);
md.block.ruler.at("paragraph", function paragraphPreserveTrailing(state, startLine, endLine) {
	const terminatorRules = state.md.block.ruler.getRules("paragraph");
	const oldParentType = state.parentType;
	let nextLine = startLine + 1;
	state.parentType = "paragraph";
	for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
		if (state.sCount[nextLine] - state.blkIndent > 3) continue;
		if (state.sCount[nextLine] < 0) continue;
		let terminate = false;
		for (let i = 0; i < terminatorRules.length; i++) if (terminatorRules[i](state, nextLine, endLine, true)) {
			terminate = true;
			break;
		}
		if (terminate) break;
	}
	const content = state.getLines(startLine, nextLine, state.blkIndent, false);
	state.line = nextLine;
	state.push("paragraph_open", "p", 1).map = [startLine, state.line];
	const token_i = state.push("inline", "", 0);
	token_i.content = content;
	token_i.map = [startLine, state.line];
	token_i.children = [];
	state.push("paragraph_close", "p", -1);
	state.parentType = oldParentType;
	return true;
});
var featureTokens = collectParserTokens();
var ParserState = class {
	stack = [{
		type: schema.nodes.doc,
		attrs: null,
		content: []
	}];
	marks = Mark.none;
	top() {
		return this.stack[this.stack.length - 1];
	}
	push(node) {
		this.top().content.push(node);
	}
	addText(text) {
		if (!text) return;
		this.top().content.push(schema.text(text, this.marks));
	}
	openMark(mark) {
		this.marks = mark.addToSet(this.marks);
	}
	closeMarkType(type) {
		this.marks = this.marks.filter((m) => m.type !== type);
	}
	topMark(type) {
		return this.marks.find((m) => m.type === type);
	}
	openNode(type, attrs = null) {
		this.stack.push({
			type,
			attrs,
			content: []
		});
	}
	closeNode() {
		const frame = this.stack.pop();
		if (!frame) throw new Error("closeNode: stack underflow");
		const node = frame.type.createAndFill(frame.attrs, frame.content);
		if (!node) throw new Error(`parser: cannot fill <${frame.type.name}>`);
		this.top().content.push(node);
	}
	finish() {
		while (this.stack.length > 1) this.closeNode();
		const root = this.stack[0];
		const doc = root.type.createAndFill(null, root.content);
		if (!doc) throw new Error("parser: cannot build doc");
		return doc;
	}
};
function handleBlock(state, token) {
	const { nodes } = schema;
	switch (token.type) {
		case "paragraph_open":
			state.openNode(nodes.paragraph);
			return;
		case "paragraph_close":
			state.closeNode();
			return;
		case "heading_open": {
			const markup = token.markup;
			const style = markup === "=" || markup === "-" ? "setext" : "atx";
			state.openNode(nodes.heading, {
				level: Number(token.tag.slice(1)),
				style
			});
			return;
		}
		case "heading_close":
			state.closeNode();
			return;
		case "blockquote_open":
			state.openNode(nodes.blockquote);
			return;
		case "blockquote_close":
			state.closeNode();
			return;
		case "bullet_list_open":
			state.openNode(nodes.bullet_list);
			return;
		case "bullet_list_close":
			state.closeNode();
			return;
		case "ordered_list_open": {
			const raw = token.attrGet("start");
			state.openNode(nodes.ordered_list, { start: raw ? Number(raw) : 1 });
			return;
		}
		case "ordered_list_close":
			state.closeNode();
			return;
		case "list_item_open":
			state.openNode(nodes.list_item);
			return;
		case "list_item_close":
			state.closeNode();
			return;
		case "fence": {
			const content = token.content.replace(/\n$/, "");
			const textNodes = content ? [schema.text(content)] : [];
			state.push(nodes.code_block.createChecked({ lang: token.info.trim() }, textNodes));
			return;
		}
		case "code_block": {
			const content = token.content.replace(/\n$/, "");
			const textNodes = content ? [schema.text(content)] : [];
			state.push(nodes.code_block.createChecked({ lang: "" }, textNodes));
			return;
		}
		case "hr":
			state.push(nodes.horizontal_rule.create());
			return;
		case "inline":
			for (const child of token.children ?? []) handleInline(state, child);
			return;
		default: {
			const handler = featureTokens[token.type];
			if (handler) handler(state, token, schema);
			return;
		}
	}
}
function handleInline(state, token) {
	const { nodes } = schema;
	switch (token.type) {
		case "text":
			state.addText(token.content);
			return;
		case "softbreak":
			state.addText("\n");
			return;
		case "hardbreak":
			state.push(nodes.hard_break.create());
			return;
		default: {
			const handler = featureTokens[token.type];
			if (handler) handler(state, token, schema);
			return;
		}
	}
}
function parse(src) {
	const tokens = md.parse(src, {});
	const state = new ParserState();
	for (const token of tokens) handleBlock(state, token);
	let doc = foldMarkdownCallouts(state.finish());
	for (const f of collectParserPostProcessors()) doc = f(doc);
	return doc;
}
//#endregion
//#region src/serializer.ts
var mdEscapeInline = (ch) => /[\\`*_\[\]<>]/.test(ch) ? `\\${ch}` : ch;
var mdEscapeBlockStart = (ch) => /[#\->+*_]/.test(ch) ? `\\${ch}` : mdEscapeInline(ch);
var mdConfig = {
	marks: { ...collectMarkDelims() },
	escapeInline: mdEscapeInline,
	escapeBlockStart: mdEscapeBlockStart,
	codeMarkAsBacktickFence: false
};
var SerializerState = class {
	out = "";
	delim = "";
	closed = null;
	pmPos = 0;
	markers;
	config;
	constructor(config, markers = []) {
		this.config = config;
		this.markers = markers.map((m) => ({
			...m,
			side: m.side ?? "inner",
			done: false
		}));
	}
	tick(side) {
		for (const m of this.markers) if (!m.done && m.side === side && m.pos === this.pmPos) {
			this.out += m.char;
			m.done = true;
		}
	}
	advance(n) {
		this.pmPos += n;
	}
	atBlankLine() {
		return this.out === "" || this.out.endsWith("\n");
	}
	flushClose(tight = false) {
		if (!this.closed) return;
		if (!this.atBlankLine()) this.out += "\n";
		if (!tight) {
			const trimmed = this.delim.replace(/\s+$/, "");
			this.out += trimmed + "\n";
		}
		this.closed = null;
	}
	/** True when the previous block was a list (used to avoid list-list blank lines). */
	closedIsList() {
		const name = this.closed?.type.name;
		return name === "bullet_list" || name === "ordered_list" || name === "list_item";
	}
	write(content = "") {
		this.flushClose();
		if (this.delim && this.atBlankLine()) this.out += this.delim;
		if (content) this.out += content;
	}
	closeBlock(node) {
		this.closed = node;
	}
	wrapBlock(delim, firstDelim, node, f) {
		const old = this.delim;
		this.write(firstDelim ?? delim);
		this.delim += delim;
		f();
		this.delim = old;
		this.closeBlock(node);
	}
	renderDoc(doc) {
		doc.forEach((child) => this.renderBlock(child));
	}
	renderBlock(node) {
		this.advance(1);
		const handler = blockHandlers[node.type.name];
		if (!handler) throw new Error(`serializer: no handler for <${node.type.name}>`);
		handler(this, node);
		this.advance(1);
	}
	renderBlockChildren(parent) {
		this.tick("inner");
		parent.forEach((child) => this.renderBlock(child));
		this.tick("inner");
	}
	renderInline(parent) {
		this.tick("inner");
		let active = [];
		const marks = this.config.marks;
		const extRanges = collectInlineFeatures().flatMap((f) => f.extRanges(parent));
		let blockOffset = 0;
		const insideEmStrong = (o) => {
			for (const [a, b] of extRanges) if (o >= a && o < b) return true;
			return false;
		};
		const closeMarks = (next) => {
			while (active.length > 0) {
				const innermost = active[active.length - 1];
				if (next.some((m) => m.eq(innermost))) break;
				const sp = marks[innermost.type.name];
				if (sp) this.out += typeof sp.close === "function" ? sp.close(innermost) : sp.close;
				active = active.slice(0, -1);
				this.tick("outer");
			}
		};
		const openMarks = (next, forNode) => {
			for (const mark of next) {
				if (active.some((m) => m.eq(mark))) continue;
				this.tick("outer");
				const sp = marks[mark.type.name];
				if (sp) this.out += typeof sp.open === "function" ? sp.open(forNode) : sp.open;
				active = [...active, mark];
			}
		};
		parent.forEach((child) => {
			if (child.marks.find((m) => m.type === schema.marks.code) && this.config.codeMarkAsBacktickFence) {
				closeMarks([]);
				this.write();
				const content = child.text ?? "";
				const fenceLen = (content.match(/`+/g) ?? []).reduce((max, r) => Math.max(max, r.length), 0) + 1;
				const fence = "`".repeat(fenceLen);
				const pad = content.startsWith("`") || content.endsWith("`") ? " " : "";
				this.out += fence + pad;
				this.tick("inner");
				for (const ch of content) {
					this.tick("inner");
					this.out += ch;
					this.advance(1);
					blockOffset++;
				}
				this.tick("inner");
				this.out += pad + fence;
				return;
			}
			const inlineHandler = inlineNodeHandlers[child.type.name];
			if (inlineHandler) {
				closeMarks([]);
				this.write();
				inlineHandler(this, child);
				return;
			}
			if (child.type === schema.nodes.hard_break) {
				closeMarks([]);
				this.write();
				this.tick("inner");
				this.out += "  \n";
				if (this.delim) this.out += this.delim;
				this.advance(1);
				return;
			}
			if (!child.isText) return;
			closeMarks(child.marks);
			this.write();
			openMarks(child.marks, child);
			const raw = child.text ?? "";
			const atBlockStart = this.atBlankLine() && active.length === 0;
			let sawNonNewline = false;
			for (const ch of raw) {
				this.tick("inner");
				if (ch === "\n") {
					this.out += "\n";
					if (this.delim) this.out += this.delim;
				} else if (insideEmStrong(blockOffset)) {
					this.out += ch;
					sawNonNewline = true;
				} else {
					const needBlockEsc = atBlockStart && !sawNonNewline;
					this.out += needBlockEsc ? this.config.escapeBlockStart(ch) : this.config.escapeInline(ch);
					sawNonNewline = true;
				}
				blockOffset++;
				this.advance(1);
			}
		});
		closeMarks([]);
		this.tick("inner");
	}
};
var coreBlockHandlers = {
	paragraph: (state, node) => {
		state.renderInline(node);
		state.closeBlock(node);
	},
	heading: (state, node) => {
		const level = node.attrs.level;
		if (node.attrs.style === "setext" && (level === 1 || level === 2)) {
			state.renderInline(node);
			state.write(`\n${level === 1 ? "===" : "---"}`);
			state.closeBlock(node);
			return;
		}
		state.write(`${"#".repeat(level)} `);
		state.renderInline(node);
		state.closeBlock(node);
	},
	blockquote: (state, node) => {
		const source = node.attrs.alertSource;
		state.wrapBlock("> ", null, node, () => {
			if (node.attrs.alert && source) state.write(`[!${source}]\n`);
			state.renderBlockChildren(node);
		});
	},
	code_block: (state, node) => {
		const lang = String(node.attrs.lang ?? "");
		state.write("```" + lang + "\n");
		state.tick("inner");
		for (const ch of node.textContent) {
			state.tick("inner");
			if (ch === "\n") {
				state.out += "\n";
				if (state.delim) state.out += state.delim;
			} else state.out += ch;
			state.advance(1);
		}
		state.tick("inner");
		state.write("\n```");
		state.closeBlock(node);
	},
	horizontal_rule: (state, node) => {
		state.write("---");
		state.closeBlock(node);
	},
	bullet_list: (state, node) => {
		if (state.closedIsList()) state.flushClose(true);
		state.tick("inner");
		node.forEach((item, _, i) => {
			if (i > 0) state.flushClose(true);
			state.wrapBlock("  ", "- ", item, () => state.renderBlockChildren(item));
		});
		state.tick("inner");
		state.closeBlock(node);
	},
	ordered_list: (state, node) => {
		if (state.closedIsList()) state.flushClose(true);
		const start = node.attrs.start ?? 1;
		const pad = String(start + node.childCount - 1).length;
		state.tick("inner");
		node.forEach((item, _, i) => {
			if (i > 0) state.flushClose(true);
			const label = String(start + i);
			const padded = `${label}. ${" ".repeat(Math.max(0, pad - label.length))}`;
			const delim = " ".repeat(pad + 2);
			state.wrapBlock(delim, padded, item, () => state.renderBlockChildren(item));
		});
		state.tick("inner");
		state.closeBlock(node);
	},
	list_item: (state, node) => {
		state.renderBlockChildren(node);
	}
};
var inlineNodeHandlers = collectInlineNodeHandlers();
var blockHandlers = {
	...coreBlockHandlers,
	...collectBlockHandlers()
};
function serialize(doc) {
	const state = new SerializerState(mdConfig);
	state.renderDoc(doc);
	return state.out.replace(/\n+$/, "\n");
}
//#endregion
//#region src/editor-api.ts
function createEditor(host, options = {}) {
	const wrap = document.createElement("div");
	wrap.className = "typora-web-wrap";
	const editorHost = document.createElement("div");
	editorHost.className = "typora-web-editor-host";
	const sourceHost = document.createElement("div");
	sourceHost.className = "typora-web-source-editor";
	sourceHost.hidden = true;
	wrap.append(editorHost, sourceHost);
	host.append(wrap);
	let view;
	let sourceView = null;
	let inSource = false;
	let typewriterMode = false;
	let currentFileHandle = null;
	let currentFileName = null;
	function buildView(initialMd) {
		const doc = initialMd ? parse(initialMd) : schema.nodes.doc.createAndFill();
		const base = EditorState.create({
			schema,
			doc,
			plugins: defaultPlugins({ cursorWidget: false })
		});
		const state = base.apply(base.tr.setSelection(TextSelection.atStart(doc)));
		const v = new EditorView(editorHost, {
			state,
			dispatchTransaction(tr) {
				const next = v.state.apply(tr);
				v.updateState(next);
				if (typewriterMode) scrollRenderedCursorToCenter();
				if (tr.docChanged) options.onChange?.(serialize(next.doc));
			},
			handleDOMEvents: {
				focus: () => {
					options.onFocus?.();
					return false;
				},
				blur: () => {
					options.onBlur?.();
					return false;
				}
			}
		});
		return v;
	}
	function rebuild(md) {
		const focusMode = isFocusMode(view.state);
		view.destroy();
		editorHost.innerHTML = "";
		view = buildView(md);
		if (focusMode) setFocusMode(view.state, (tr) => view.updateState(view.state.apply(tr)), true);
		syncModeClasses();
	}
	function syncModeClasses() {
		wrap.classList.toggle("tw-focus-mode", isFocusMode(view.state));
		wrap.classList.toggle("tw-typewriter-mode", typewriterMode);
	}
	function scrollRenderedCursorToCenter() {
		try {
			const pageY = view.coordsAtPos(view.state.selection.head).top + window.scrollY;
			const target = Math.max(0, pageY - window.innerHeight / 2);
			window.scrollTo({
				top: target,
				behavior: "smooth"
			});
		} catch {}
	}
	function restorePageScroll(top) {
		try {
			window.scrollTo({
				top,
				behavior: "instant"
			});
		} catch {
			try {
				window.scrollTo(0, top);
			} catch {}
		}
	}
	function preservePageScroll(fn) {
		const top = window.scrollY;
		const result = fn();
		restorePageScroll(top);
		return result;
	}
	function getSourceMarkdown() {
		return sourceView?.view.state.doc.toString() ?? "";
	}
	function setSourceMarkdown(md) {
		if (!sourceView) return;
		sourceView.setDoc(md);
	}
	function renderedCursorToMdOffset() {
		const sel = view.state.selection;
		try {
			return serialize(view.state.doc.cut(0, sel.from)).length;
		} catch {
			return serialize(view.state.doc).length;
		}
	}
	function mdOffsetToRenderedPos(md, offset) {
		try {
			return parse(md.slice(0, Math.max(0, offset))).content.size;
		} catch {
			return 0;
		}
	}
	function enterSource() {
		preservePageScroll(() => {
			const md = serialize(view.state.doc);
			const mdCursor = renderedCursorToMdOffset();
			sourceHost.replaceChildren();
			sourceView = createEmbeddedCodeMirrorEditor({
				parent: sourceHost,
				doc: md,
				markdownSource: true,
				className: "typora-web-cm-source",
				onChange: (next) => options.onChange?.(next)
			});
			editorHost.hidden = true;
			sourceHost.hidden = false;
			const clamped = Math.min(mdCursor, md.length);
			sourceView.view.dispatch({ selection: { anchor: clamped } });
			sourceView.view.focus();
			inSource = true;
		});
	}
	function exitSource() {
		preservePageScroll(() => {
			const md = getSourceMarkdown();
			const targetRaw = mdOffsetToRenderedPos(md, sourceView?.view.state.selection.main.head ?? md.length);
			rebuild(md);
			const target = Math.min(targetRaw, view.state.doc.content.size);
			try {
				const sel = TextSelection.near(view.state.doc.resolve(target));
				view.dispatch(view.state.tr.setSelection(sel));
			} catch {}
			sourceView?.destroy();
			sourceView = null;
			sourceHost.replaceChildren();
			sourceHost.hidden = true;
			editorHost.hidden = false;
			view.focus();
			inSource = false;
		});
	}
	const onKey = (e) => {
		if (e.key === "F8") {
			const t = e.target;
			if (t && (editorHost.contains(t) || sourceHost.contains(t))) {
				e.preventDefault();
				e.stopPropagation();
				controller.toggleFocusMode();
			}
			return;
		}
		if (e.key === "F9") {
			const t = e.target;
			if (t && (editorHost.contains(t) || sourceHost.contains(t))) {
				e.preventDefault();
				e.stopPropagation();
				controller.toggleTypewriterMode();
			}
			return;
		}
		if (e.key !== "/") return;
		if (!(/Mac/.test(navigator.platform) ? e.metaKey : e.ctrlKey)) return;
		if (e.shiftKey || e.altKey) return;
		const t = e.target;
		if (!t) return;
		if (!editorHost.contains(t) && !sourceHost.contains(t)) return;
		e.preventDefault();
		e.stopPropagation();
		if (inSource) exitSource();
		else enterSource();
	};
	window.addEventListener("keydown", onKey, true);
	if (options.onFocus) sourceHost.addEventListener("focusin", () => options.onFocus());
	if (options.onBlur) sourceHost.addEventListener("focusout", () => options.onBlur());
	view = buildView(options.initialContent ?? "");
	const controller = {
		getMarkdown() {
			return inSource ? getSourceMarkdown() : serialize(view.state.doc);
		},
		setMarkdown(md) {
			if (inSource) setSourceMarkdown(md);
			else rebuild(md);
		},
		toggleSource() {
			if (inSource) exitSource();
			else enterSource();
		},
		isSourceMode() {
			return inSource;
		},
		toggleFocusMode() {
			this.setFocusMode(!this.isFocusMode());
		},
		setFocusMode(enabled) {
			setFocusMode(view.state, (tr) => view.dispatch(tr), enabled);
			syncModeClasses();
		},
		isFocusMode() {
			return isFocusMode(view.state);
		},
		toggleTypewriterMode() {
			this.setTypewriterMode(!typewriterMode);
		},
		setTypewriterMode(enabled) {
			typewriterMode = enabled;
			syncModeClasses();
			if (enabled) {
				if (!inSource) scrollRenderedCursorToCenter();
			}
		},
		isTypewriterMode() {
			return typewriterMode;
		},
		async openMarkdownFile() {
			const picked = await pickMarkdownFile();
			if (picked.status !== "picked") return picked;
			try {
				const text = await picked.file.text();
				currentFileHandle = picked.handle;
				currentFileName = picked.handle?.name || picked.file.name;
				this.setMarkdown(text);
				return {
					status: "opened",
					name: currentFileName
				};
			} catch (error) {
				return {
					status: "error",
					message: error instanceof Error ? error.message : String(error)
				};
			}
		},
		async openMarkdownFileHandle(handle) {
			const result = await readMarkdownFileHandle(handle);
			if (result.status === "error") return result;
			currentFileHandle = result.handle;
			currentFileName = result.name;
			this.setMarkdown(result.text);
			return {
				status: "opened",
				name: result.name
			};
		},
		newMarkdownFile() {
			currentFileHandle = null;
			currentFileName = null;
			this.setMarkdown("");
		},
		async createMarkdownFile() {
			const result = await createMarkdownFile();
			if (result.status !== "created") return result;
			currentFileHandle = result.handle;
			currentFileName = result.name;
			this.setMarkdown("");
			return {
				status: "saved",
				name: result.name
			};
		},
		async saveMarkdownFile() {
			if (!currentFileHandle) return this.saveMarkdownFileAs();
			return writeMarkdownFile(currentFileHandle, this.getMarkdown());
		},
		async saveMarkdownFileAs() {
			const result = await saveMarkdownFileAs(this.getMarkdown(), currentFileName ?? "untitled.md");
			if (result.status === "saved") {
				currentFileHandle = result.handle ?? null;
				currentFileName = result.name;
			} else if (result.status === "downloaded") {
				currentFileHandle = null;
				currentFileName = result.name;
			}
			return result;
		},
		getCurrentFileName() {
			return currentFileName;
		},
		focus() {
			if (inSource) sourceView?.view.focus();
			else view.focus();
		},
		destroy() {
			window.removeEventListener("keydown", onKey, true);
			sourceView?.destroy();
			view.destroy();
			wrap.remove();
		},
		get view() {
			return view;
		}
	};
	syncModeClasses();
	return controller;
}
//#endregion
export { createEditor };
