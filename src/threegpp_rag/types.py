from dataclasses import dataclass, field
from typing import Literal, Any

CragAction = Literal["correct", "ambiguous", "incorrect"]

@dataclass
class Chunk:
    id: str
    text: str
    spec: str        # "TS 28.552"
    clause: str      # "5.1.1.2"
    title: str       # "Number of RRC connection establishment attempts"

    @property
    def citation(self) -> str:
        return f"{self.spec} §{self.clause}"

@dataclass
class ScoredChunk:
    chunk: Chunk
    score: float     # normalised relevance, 0..1

@dataclass
class TraceEvent:
    step: str
    data: dict[str, Any] = field(default_factory=dict)
