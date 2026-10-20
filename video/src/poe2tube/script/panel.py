"""POE2Tube 側で描く図 (ExileDesk に頼まない物): アイコンの並び・表.

台本の ``scene.panel`` に入れる。``kind: icons`` は ``icons`` (NameBook のキー) を並べ、
``kind: table`` は ``rows`` (1 行目が見出し) を表にする (2026-10-02、エンドのクラフト素材の回)。
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Panel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    title: str | None = Field(default=None, max_length=24, description="図の見出し")
    icons: list[str] | None = Field(
        default=None,
        min_length=1,
        max_length=12,
        description="icons: 並べる小道具のキー (NameBook。カレンシー・エッセンス・骨・お告げ)",
    )
    names: list[str] | None = Field(
        default=None, description="icons: アイコンの下の名前 (無ければ公式名)。icons と同じ数"
    )
    rows: list[list[str]] | None = Field(
        default=None, min_length=2, max_length=13, description="table: 1 行目が見出し (12 行まで)"
    )

    @model_validator(mode="after")
    def _shape(self) -> Panel:
        if (self.icons is None) == (self.rows is None):
            raise ValueError("panel は icons か rows のどちらか 1 つ")
        if self.names is not None and (self.icons is None or len(self.names) != len(self.icons)):
            raise ValueError("panel.names は icons と同じ数")
        if self.rows is not None and len({len(r) for r in self.rows}) != 1:
            raise ValueError("panel.rows は全部の行で列の数をそろえる")
        return self

    def key(self) -> tuple[object, ...]:
        return (
            self.title,
            tuple(self.icons or ()),
            tuple(self.names or ()),
            tuple(tuple(r) for r in self.rows or ()),
        )
