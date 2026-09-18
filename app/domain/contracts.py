from decimal import Decimal
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Column = Annotated[str, StringConstraints(min_length=1, max_length=255, pattern=r"\S")]
PairName = Annotated[str, StringConstraints(pattern=r"^[A-Za-z][A-Za-z0-9_-]{0,63}$")]


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


def validate_key_map(key_map: dict[str, str]) -> None:
    if any(not key.strip() or not value.strip() for key, value in key_map.items()):
        raise ValueError("ID mappings must contain non-empty IDs")
    if len(set(key_map.values())) != len(key_map):
        raise ValueError("ID mappings must be one-to-one; record merges are not supported")


class ParentDatasetPair(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_dataset_id: UUID
    target_dataset_id: UUID
    source_key: Column
    target_key: Column
    key_map: dict[str, str] = Field(default_factory=dict, max_length=25_000)

    @model_validator(mode="after")
    def validate_mapping(self) -> Self:
        validate_key_map(self.key_map)
        return self


class RelationshipRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: Column
    target: Column
    parent_pair: PairName
    allow_empty: bool = False


class AuditContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal["1"] = "1"
    source_key: Column
    target_key: Column
    fields: list[FieldRule] = Field(default_factory=list, max_length=50)
    # Keys are exact strings. Target IDs can differ if an explicit one-to-one map is supplied.
    key_map: dict[str, str] = Field(default_factory=dict, max_length=25_000)
    parent_pairs: dict[PairName, ParentDatasetPair] = Field(default_factory=dict, max_length=10)
    relationships: list[RelationshipRule] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def validate_mapping(self) -> Self:
        validate_key_map(self.key_map)
        if not self.fields and not self.relationships:
            raise ValueError("At least one field or relationship rule is required")
        referenced_pairs = {rule.parent_pair for rule in self.relationships}
        if referenced_pairs != set(self.parent_pairs):
            raise ValueError("Parent pairs must match the pairs referenced by relationship rules")
        relationships = [(rule.source, rule.target) for rule in self.relationships]
        if len(set(relationships)) != len(relationships):
            raise ValueError("Duplicate relationship rules are not allowed")
        pairs = [(rule.source, rule.target) for rule in self.fields]
        if len(set(pairs)) != len(pairs):
            raise ValueError("Duplicate field rules are not allowed")
        return self

    def validate_headers(self, source: list[str], target: list[str]) -> None:
        rules = [*self.fields, *self.relationships]
        required_source = {self.source_key} | {rule.source for rule in rules}
        required_target = {self.target_key} | {rule.target for rule in rules}
        if not required_source.issubset(source) or not required_target.issubset(target):
            raise ValueError("A key or mapped field is absent from the selected dataset headers")
