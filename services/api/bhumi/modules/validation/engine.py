"""The rules engine.

Rules are data, not code. An admin adds or disables one in the UI and it takes
effect on the next record — no redeploy. Expressions are evaluated in a
restricted namespace with no builtins, so a rule can compute but cannot reach
the filesystem, the network, or the ORM.
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Callable

from rapidfuzz import fuzz

from bhumi.core.enums import RuleStatus, Severity


# ── Safe expression evaluation ──────────────────────────────────────
_ALLOWED_NODES = (
    ast.Expression, ast.BoolOp, ast.BinOp, ast.UnaryOp, ast.Compare, ast.Call,
    ast.Name, ast.Load, ast.Constant, ast.List, ast.Tuple, ast.Dict, ast.Set,
    ast.Subscript, ast.Slice, ast.IfExp, ast.And, ast.Or, ast.Not,
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.In, ast.NotIn,
    ast.Is, ast.IsNot, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv,
    ast.Mod, ast.Pow, ast.USub, ast.UAdd, ast.Attribute, ast.comprehension,
    ast.GeneratorExp, ast.ListComp,
)


def _safe_len(x: Any) -> int:
    return len(x) if x is not None else 0


def _is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def _to_float(value: Any, default: float | None = None) -> float | None:
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return default


def _matches(value: Any, pattern: str) -> bool:
    if _is_blank(value):
        return False
    return bool(re.fullmatch(pattern, str(value).strip()))


def _similar(a: Any, b: Any) -> float:
    if _is_blank(a) or _is_blank(b):
        return 0.0
    return fuzz.token_sort_ratio(str(a), str(b)) / 100.0


def _parse_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    if _is_blank(value):
        return None
    from dateutil import parser

    try:
        return parser.parse(str(value), dayfirst=True).date()
    except Exception:
        return None


SAFE_FUNCTIONS: dict[str, Callable] = {
    "abs": abs,
    "min": min,
    "max": max,
    "len": _safe_len,
    "sum": sum,
    "round": round,
    "float": _to_float,
    "str": str,
    "int": lambda v, d=None: int(_to_float(v, d) or 0),
    "any": any,
    "all": all,
    "sorted": sorted,
    "is_blank": _is_blank,
    "not_blank": lambda v: not _is_blank(v),
    "matches": _matches,
    "similar": _similar,
    "parse_date": _parse_date,
    "today": date.today,
    "lower": lambda v: str(v).lower() if v is not None else "",
    "strip": lambda v: str(v).strip() if v is not None else "",
}


class UnsafeExpression(ValueError):
    pass


def compile_expression(expression: str):
    tree = ast.parse(expression, mode="eval")
    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_NODES):
            raise UnsafeExpression(
                f"{type(node).__name__} is not permitted in a validation rule."
            )
        if isinstance(node, ast.Attribute) and node.attr.startswith("_"):
            raise UnsafeExpression("Private attribute access is not permitted.")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id not in SAFE_FUNCTIONS:
                raise UnsafeExpression(f"Function '{node.func.id}' is not available to rules.")
    return compile(tree, "<rule>", "eval")


# ── Rule definition & result ────────────────────────────────────────
@dataclass(slots=True)
class Rule:
    key: str
    name: str
    category: str
    severity: Severity
    expression: str
    requires: list[str] = field(default_factory=list)
    applies_to_document_types: list[str] = field(default_factory=list)
    applies_to_states: list[str] = field(default_factory=list)
    params: dict[str, Any] = field(default_factory=dict)
    message_en: str = ""
    message_hi: str = ""
    fix_hint: str = ""
    description_en: str = ""
    enabled: bool = True
    execution_order: int = 100
    affected_fields: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "Rule":
        return cls(
            key=raw["id"],
            name=raw.get("name", raw["id"]),
            category=raw.get("category", "general"),
            severity=Severity(raw.get("severity", "ERROR")),
            expression=raw["expression"],
            requires=raw.get("requires", []),
            applies_to_document_types=raw.get("applies_to", []),
            applies_to_states=raw.get("applies_to_states", []),
            params=raw.get("params", {}),
            message_en=raw.get("message_en", ""),
            message_hi=raw.get("message_hi", ""),
            fix_hint=raw.get("fix_hint", ""),
            description_en=raw.get("description", ""),
            enabled=raw.get("enabled", True),
            execution_order=raw.get("order", 100),
            affected_fields=raw.get("affected_fields", raw.get("requires", [])),
        )


@dataclass(slots=True)
class RuleOutcome:
    rule_key: str
    status: RuleStatus
    severity: Severity
    message: str = ""
    fix_hint: str = ""
    observed: dict[str, Any] = field(default_factory=dict)
    affected_fields: list[str] = field(default_factory=list)

    @property
    def is_failure(self) -> bool:
        return self.status in (RuleStatus.FAIL, RuleStatus.WARN)

    @property
    def is_blocking(self) -> bool:
        return self.status is RuleStatus.FAIL and self.severity is Severity.BLOCKING


# ── Engine ──────────────────────────────────────────────────────────
class ValidationEngine:
    def __init__(self, rules: list[Rule]) -> None:
        self.rules = sorted(
            [r for r in rules if r.enabled], key=lambda r: (r.execution_order, r.key)
        )
        self._compiled: dict[str, Any] = {}
        for rule in self.rules:
            try:
                self._compiled[rule.key] = compile_expression(rule.expression)
            except (SyntaxError, UnsafeExpression):
                # A malformed rule must never take the pipeline down; it is
                # skipped and surfaced on the rules admin screen instead.
                self._compiled[rule.key] = None

    def evaluate(self, context: dict[str, Any]) -> list[RuleOutcome]:
        outcomes: list[RuleOutcome] = []
        doc_type = context.get("document_type")
        state = context.get("state_code")

        for rule in self.rules:
            if rule.applies_to_document_types and doc_type not in rule.applies_to_document_types:
                continue
            if rule.applies_to_states and state not in rule.applies_to_states:
                continue

            missing = [f for f in rule.requires if _is_blank(context.get(f))]
            if missing:
                outcomes.append(
                    RuleOutcome(
                        rule_key=rule.key,
                        status=RuleStatus.FAIL
                        if rule.severity is Severity.BLOCKING
                        else RuleStatus.SKIPPED,
                        severity=rule.severity,
                        message=(
                            f"Required field(s) missing: {', '.join(missing)}."
                            if rule.severity is Severity.BLOCKING
                            else f"Not evaluated — missing {', '.join(missing)}."
                        ),
                        fix_hint=rule.fix_hint,
                        observed={"missing": missing},
                        affected_fields=missing,
                    )
                )
                continue

            code = self._compiled.get(rule.key)
            if code is None:
                outcomes.append(
                    RuleOutcome(
                        rule_key=rule.key,
                        status=RuleStatus.ERROR,
                        severity=Severity.INFO,
                        message="Rule expression is invalid and was skipped.",
                    )
                )
                continue

            namespace = {**SAFE_FUNCTIONS, **context, **rule.params}
            try:
                passed = bool(eval(code, {"__builtins__": {}}, namespace))  # noqa: S307
            except Exception as exc:
                outcomes.append(
                    RuleOutcome(
                        rule_key=rule.key,
                        status=RuleStatus.ERROR,
                        severity=Severity.INFO,
                        message=f"Rule could not be evaluated: {exc}",
                    )
                )
                continue

            if passed:
                outcomes.append(
                    RuleOutcome(
                        rule_key=rule.key,
                        status=RuleStatus.PASS,
                        severity=rule.severity,
                        affected_fields=rule.affected_fields,
                    )
                )
            else:
                status = (
                    RuleStatus.WARN
                    if rule.severity in (Severity.WARNING, Severity.REVIEW, Severity.INFO)
                    else RuleStatus.FAIL
                )
                outcomes.append(
                    RuleOutcome(
                        rule_key=rule.key,
                        status=status,
                        severity=rule.severity,
                        message=_render(rule.message_en, context, rule.params),
                        fix_hint=rule.fix_hint,
                        observed={f: context.get(f) for f in rule.requires},
                        affected_fields=rule.affected_fields,
                    )
                )
        return outcomes

    @staticmethod
    def summarize(outcomes: list[RuleOutcome]) -> dict[str, Any]:
        blocking = sum(1 for o in outcomes if o.is_blocking)
        errors = sum(
            1 for o in outcomes if o.status is RuleStatus.FAIL and o.severity is Severity.ERROR
        )
        warnings = sum(1 for o in outcomes if o.status is RuleStatus.WARN)
        passed = sum(1 for o in outcomes if o.status is RuleStatus.PASS)

        if blocking:
            overall = "BLOCKED"
        elif errors:
            overall = "ERROR"
        elif warnings:
            overall = "WARNING"
        else:
            overall = "PASS"

        return {
            "status": overall,
            "blocking": blocking,
            "errors": errors,
            "warnings": warnings,
            "passed": passed,
            "evaluated": len(outcomes),
        }


def _render(template: str, context: dict[str, Any], params: dict[str, Any]) -> str:
    """Message templates use {field} placeholders. A missing key must never
    raise — a rule failure should not become a 500."""
    if not template:
        return ""
    out = template
    for key, value in {**context, **params}.items():
        token = "{" + key + "}"
        if token in out:
            out = out.replace(token, "—" if value is None else str(value))
    return re.sub(r"\{[a-zA-Z_][a-zA-Z0-9_]*\}", "—", out)
