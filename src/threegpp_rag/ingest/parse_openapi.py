import re
from pathlib import Path
import yaml
from threegpp_rag.ingest.parse import Section

FILENAME = re.compile(r"TS(\d{2})(\d{3})_(\w+)")

def spec_from_filename(path: Path) -> tuple[str, str]:
    """'TS28111_FaultNrm.yaml' -> ('TS 28.111', 'FaultNrm')"""
    m = FILENAME.match(path.stem)
    if not m:
        raise ValueError(f"Unexpected OpenAPI filename: {path.name}")
    return f"TS {m.group(1)}.{m.group(2)}", m.group(3)

def _render_schema(name: str, schema: dict) -> str:
    """Flatten schema to prose so the reranker can score it against natural-language queries."""
    lines = [f"Schema: {name}"]
    if desc := schema.get("description"):
        lines.append(desc)
    if required := schema.get("required"):
        lines.append(f"Required properties: {', '.join(required)}")
    for prop, meta in (schema.get("properties") or {}).items():
        meta = meta if isinstance(meta, dict) else {}
        bits = [f"- {prop}"]
        if t := meta.get("type"):
            bits.append(f"({t})")
        if d := meta.get("description"):
            bits.append(f": {d}")
        if enum := meta.get("enum"):
            bits.append(f"[allowed values: {', '.join(map(str, enum))}]")
        if ref := meta.get("$ref"):
            bits.append(f"(reference: {ref.split('/')[-1]})")
        lines.append(" ".join(bits))
    return "\n".join(lines)

def parse_openapi(path: Path) -> list[Section]:
    spec_num, doc = spec_from_filename(path)
    data = yaml.safe_load(path.read_text()) or {}
    sections: list[Section] = []

    for name, schema in ((data.get("components") or {}).get("schemas") or {}).items():
        if not isinstance(schema, dict):
            continue
        sections.append(Section(
            spec=spec_num,
            clause=f"OpenAPI/{doc}#{name}",
            title=f"{name} schema",
            body=_render_schema(name, schema),
        ))

    for route, ops in (data.get("paths") or {}).items():
        if not isinstance(ops, dict):
            continue
        for method, op in ops.items():
            if not isinstance(op, dict):
                continue
            body = [f"{method.upper()} {route}"]
            if s := op.get("summary"):
                body.append(s)
            if d := op.get("description"):
                body.append(d)
            if oid := op.get("operationId"):
                body.append(f"operationId: {oid}")
            sections.append(Section(
                spec=spec_num,
                clause=f"OpenAPI/{doc}#{method.upper()}{route}",
                title=f"{method.upper()} {route}",
                body="\n".join(body),
            ))
    return sections
