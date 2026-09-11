from decimal import Decimal
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Column = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


class FieldRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: Column
    target: Column
    normalizers: list[Literal["strip", "casefold"]] = Field(default_factory=list, max_length=2)
    value_map: dict[str, str] = Field(default_factory=dict, max_length=1000)
    comparison: Literal["text", "decimal"] = "text"
    tolerance: Decimal = Field(
        default=Decimal("0"),
        ge=0,
        allow_inf_nan=False,
        max_digits=38,
        decimal_places=18,
    )


class AuditContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal["1"] = "1"
    source_key: Column
    target_key: Column
    fields: list[FieldRule] = Field(min_length=1, max_length=50)
    # Keys are exact strings. Target IDs can differ if an explicit one-to-one map is supplied.
    key_map: dict[str, str] = Field(default_factory=dict, max_length=25_000)

    @model_validator(mode="after")
    def validate_mapping(self) -> Self:
        if any(not key.strip() or not value.strip() for key, value in self.key_map.items()):
            raise ValueError("ID mappings must contain non-empty IDs")
        if len(set(self.key_map.values())) != len(self.key_map):
            raise ValueError("ID mappings must be one-to-one; record merges are not supported yet")
        pairs = [(rule.source, rule.target) for rule in self.fields]
        if len(set(pairs)) != len(pairs):
            raise ValueError("Duplicate field rules are not allowed")
        return self

    def validate_headers(self, source: list[str], target: list[str]) -> None:
        required_source = {self.source_key} | {field.source for field in self.fields}
        required_target = {self.target_key} | {field.target for field in self.fields}
        if not required_source.issubset(source) or not required_target.issubset(target):
            raise ValueError("A key or mapped field is absent from the selected dataset headers")
