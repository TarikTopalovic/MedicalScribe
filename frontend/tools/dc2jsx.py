#!/usr/bin/env python3
"""Transpile a Claude Design Canvas export (.dc.html) into a React component.

The design export is the single source of truth for the interface. It is never
edited by hand: re-export it from Design Canvas, re-run this script, and the
rendered UI follows. All application behaviour lives outside the generated file
and reaches the markup through one view-model object.

    python frontend/tools/dc2jsx.py design/MediScribe.dc.html \
        --out-jsx src/generated/Screen.jsx --out-css src/generated/design.css

Supported template syntax (the whole grammar the export uses):
    {{ expr }}                      text and attribute interpolation
    <sc-if value="{{ x }}">         conditional subtree
    <sc-for list="{{ xs }}" as="i"> repeated subtree
    style="a:b;c:{{ d }}"           inline style, interpolated
    style-hover="a:b"               hover state, lifted into a CSS class
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr", "path", "circle", "rect",
        "line", "polygon", "polyline", "ellipse", "stop", "use"}

# Attributes React spells differently from HTML. HTMLParser lower-cases every
# attribute name, so the camel-case spellings have to be restored here.
ATTR_MAP = {
    "onclick": "onClick", "onchange": "onChange", "oninput": "onInput",
    "onsubmit": "onSubmit", "onfocus": "onFocus", "onblur": "onBlur",
    "onkeydown": "onKeyDown", "onkeyup": "onKeyUp", "onmousedown": "onMouseDown",
    "onmouseup": "onMouseUp", "onmouseenter": "onMouseEnter",
    "onmouseleave": "onMouseLeave", "onscroll": "onScroll", "viewbox": "viewBox",
    "class": "className", "for": "htmlFor", "readonly": "readOnly",
    "colspan": "colSpan", "rowspan": "rowSpan", "tabindex": "tabIndex",
    "maxlength": "maxLength", "autocomplete": "autoComplete",
    "stroke-width": "strokeWidth", "stroke-linecap": "strokeLinecap",
    "stroke-linejoin": "strokeLinejoin", "stroke-dasharray": "strokeDasharray",
    "stroke-opacity": "strokeOpacity", "fill-rule": "fillRule",
    "clip-rule": "clipRule", "fill-opacity": "fillOpacity",
    "stop-color": "stopColor", "text-anchor": "textAnchor",
    "font-size": "fontSize", "font-weight": "fontWeight",
}
# Dropped: Design Canvas editor hints, and attributes React controls instead.
DROP_ATTRS = {"hint-placeholder-val", "hint-placeholder-count", "data-dc-script"}
# Design Canvas wraps its own host chrome in <helmet>. React renders that as an
# unknown element and warns on every render, so it stays out of the interface.
HOST_TAGS = {"helmet"}
# Elements whose text content must become a `value` prop instead of children.
VALUE_ELEMENTS = {"textarea"}

EXPR = re.compile(r"\{\{(.*?)\}\}", re.S)
IDENT = re.compile(r"^[A-Za-z_$][\w$]*")


class Node:
    __slots__ = ("tag", "attrs", "children", "text")

    def __init__(self, tag, attrs=None, text=None):
        self.tag = tag
        self.attrs = attrs or []
        self.children = []
        self.text = text


class Parser(HTMLParser):
    """Builds a tree. `convert_charrefs` stays on so text arrives decoded."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root")
        self.stack = [self.root]
        self.skip_depth = 0          # inside <script>/<style>/<head>
        self.captured = {"script": [], "style": []}
        self.capturing = None

    def handle_starttag(self, tag, attrs):
        if tag in HOST_TAGS:
            self.skip_depth += 1
            return
        if tag in ("script", "style"):
            self.capturing = tag
            return
        if self.skip_depth:
            return
        if tag in VOID:
            self.stack[-1].children.append(Node(tag, attrs))
            return
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        if tag in ("script", "style") or self.skip_depth:
            return
        self.stack[-1].children.append(Node(tag, attrs))

    def handle_endtag(self, tag):
        if tag in HOST_TAGS:
            self.skip_depth = max(0, self.skip_depth - 1)
            return
        if tag in ("script", "style"):
            self.capturing = None
            return
        if self.skip_depth:
            return
        if tag in VOID:
            return
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        if self.capturing:
            self.captured[self.capturing].append(data)
            return
        if self.skip_depth:
            return
        if data:
            self.stack[-1].children.append(Node("#text", text=data))


def camel(prop: str) -> str:
    if prop.startswith("--"):
        return prop
    head, *rest = prop.split("-")
    return head + "".join(w[:1].upper() + w[1:] for w in rest)


def js_string(text: str) -> str:
    return json.dumps(text, ensure_ascii=False)


class Emitter:
    def __init__(self):
        self.hover_rules: list[tuple[str, str]] = []
        self.hover_index: dict[str, str] = {}
        self.roots: set[str] = set()

    # -- expressions ------------------------------------------------------
    def resolve(self, expr: str, scope: list[str]) -> str:
        """Record which identifiers come from the view-model, not a loop."""
        expr = expr.strip()
        match = IDENT.match(expr)
        if match:
            name = match.group(0)
            if name not in scope and name not in ("true", "false", "null", "undefined"):
                self.roots.add(name)
        return expr

    def interpolate(self, raw: str, scope: list[str]) -> str | None:
        """A JS expression for a string that may contain {{ }} holes."""
        parts = EXPR.split(raw)
        if len(parts) == 1:
            return None                                   # no interpolation
        out = []
        for i, part in enumerate(parts):
            if i % 2:
                out.append("${" + self.resolve(part, scope) + "}")
            else:
                out.append(part.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${"))
        return "`" + "".join(out) + "`"

    def whole_expr(self, raw: str, scope: list[str]) -> str | None:
        """If the value is exactly one {{ expr }}, return the bare expression."""
        stripped = raw.strip()
        match = EXPR.fullmatch(stripped)
        return self.resolve(match.group(1), scope) if match else None

    # -- styles -----------------------------------------------------------
    def style_object(self, raw: str, scope: list[str]) -> str:
        pairs = []
        for decl in raw.split(";"):
            if ":" not in decl:
                continue
            prop, _, value = decl.partition(":")
            prop, value = prop.strip(), value.strip()
            if not prop:
                continue
            expr = self.whole_expr(value, scope) or self.interpolate(value, scope)
            pairs.append(f'"{camel(prop)}": {expr or js_string(value)}')
        return "{ " + ", ".join(pairs) + " }"

    def hover_class(self, raw: str) -> str:
        """Hover declarations become a CSS class; !important beats inline style."""
        key = raw.strip()
        if key in self.hover_index:
            return self.hover_index[key]
        name = f"dch-{len(self.hover_index) + 1}"
        body = "; ".join(
            f"{prop.strip()}: {value.strip()} !important"
            for prop, _, value in (d.partition(":") for d in key.split(";"))
            if prop.strip() and value.strip()
        )
        self.hover_index[key] = name
        self.hover_rules.append((name, body))
        return name

    # -- elements ---------------------------------------------------------
    def attributes(self, node: Node, scope: list[str]) -> tuple[list[str], str | None]:
        props, class_names, value_prop = [], [], None
        for name, raw in node.attrs:
            raw = raw if raw is not None else name
            if name in DROP_ATTRS:
                continue
            if name == "style-hover":
                class_names.append(self.hover_class(raw))
                continue
            if name == "style":
                props.append(f"style={{{self.style_object(raw, scope)}}}")
                continue
            prop = ATTR_MAP.get(name, name)
            expr = self.whole_expr(raw, scope)
            if expr is None:
                interpolated = self.interpolate(raw, scope)
                literal = f"{{{interpolated}}}" if interpolated else js_string(raw)
            else:
                literal = f"{{{expr}}}"
            if prop == "value":
                value_prop = literal
            props.append(f"{prop}={literal}")
        if class_names:
            props.append(f'className="{" ".join(class_names)}"')
        return props, value_prop

    def children_of(self, node: Node, scope: list[str], depth: int) -> list[str]:
        out = []
        for child in node.children:
            out.extend(self.node(child, scope, depth))
        return out

    def node(self, node: Node, scope: list[str], depth: int) -> list[str]:
        pad = "  " * depth
        if node.tag == "#text":
            text = node.text
            if not text.strip():
                # React drops whitespace that spans lines, keeps a plain space.
                return [] if "\n" in text else [f'{pad}{{" "}}']
            lines = []
            for i, part in enumerate(EXPR.split(text)):
                if i % 2:
                    lines.append(f"{pad}{{{self.resolve(part, scope)}}}")
                elif part:
                    lines.append(f"{pad}{{{js_string(part)}}}")
            return lines

        if node.tag == "sc-if":
            value = dict(node.attrs).get("value", "")
            test = self.whole_expr(value, scope) or "false"
            body = self.children_of(node, scope, depth + 1)
            return [f"{pad}{{({test}) ? (", f"{pad}  <>", *body, f"{pad}  </>", f"{pad}) : null}}"]

        if node.tag == "sc-for":
            attrs = dict(node.attrs)
            items = self.whole_expr(attrs.get("list", ""), scope) or "[]"
            var = attrs.get("as", "item")
            body = self.children_of(node, scope + [var], depth + 2)
            return [
                f"{pad}{{({items} || []).map(({var}, {var}__i) => (",
                f"{pad}  <React.Fragment key={{{var}__i}}>",
                *body,
                f"{pad}  </React.Fragment>",
                f"{pad}))}}",
            ]

        props, value_prop = self.attributes(node, scope)
        tag = node.tag
        attr_text = (" " + " ".join(props)) if props else ""
        if tag in VOID or (tag in VALUE_ELEMENTS and value_prop is not None) or not node.children:
            return [f"{pad}<{tag}{attr_text} />"]
        body = self.children_of(node, scope, depth + 1)
        if not body:
            return [f"{pad}<{tag}{attr_text} />"]
        return [f"{pad}<{tag}{attr_text}>", *body, f"{pad}</{tag}>"]


def find(node: Node, tag: str) -> Node | None:
    if node.tag == tag:
        return node
    for child in node.children:
        found = find(child, tag)
        if found:
            return found
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("source", type=Path, help="path to the .dc.html export")
    ap.add_argument("--out-jsx", type=Path, required=True)
    ap.add_argument("--out-css", type=Path, required=True)
    ap.add_argument("--component", default="Screen")
    ap.add_argument("--out-logic", type=Path,
                    help="also write the export's own script, for reference")
    args = ap.parse_args()

    html = args.source.read_text(encoding="utf-8")
    parser = Parser()
    parser.feed(html)
    root = find(parser.root, "x-dc") or parser.root

    emitter = Emitter()
    body = emitter.children_of(root, [], 3)
    keys = sorted(emitter.roots)

    base_css = "".join(parser.captured["style"]).strip()
    hover_css = "\n".join(f".{name} {{ {body} }}" for name, body in emitter.hover_rules)
    args.out_css.parent.mkdir(parents=True, exist_ok=True)
    args.out_css.write_text(
        "/* GENERATED by frontend/tools/dc2jsx.py — do not edit. */\n"
        f"{base_css}\n\n/* hover states lifted out of style-hover */\n{hover_css}\n",
        encoding="utf-8")

    destructure = ",\n    ".join(keys)
    args.out_jsx.parent.mkdir(parents=True, exist_ok=True)
    args.out_jsx.write_text(
        "/* GENERATED by frontend/tools/dc2jsx.py from "
        f"{args.source.name} — do not edit.\n"
        " * Change the design in Design Canvas, re-export, re-run the script. */\n"
        "/* eslint-disable */\n"
        "import React from \"react\";\n"
        "import \"./design.css\";\n\n"
        f"export const VIEW_MODEL_KEYS = {json.dumps(keys, ensure_ascii=False, indent=2)};\n\n"
        f"export default function {args.component}(vm) {{\n"
        f"  const {{\n    {destructure},\n  }} = vm;\n"
        "  return (\n    <>\n"
        + "\n".join(body) +
        "\n    </>\n  );\n}\n",
        encoding="utf-8")

    if args.out_logic:
        args.out_logic.parent.mkdir(parents=True, exist_ok=True)
        args.out_logic.write_text("".join(parser.captured["script"]), encoding="utf-8")

    print(f"{args.out_jsx}: {len(body)} lines, {len(keys)} view-model keys, "
          f"{len(emitter.hover_rules)} hover classes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
