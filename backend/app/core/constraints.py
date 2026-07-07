from functools import lru_cache
from pathlib import Path
import yaml
from pydantic import BaseModel

from app.core.config import get_settings


class ConstraintDef(BaseModel):
    key: str
    label: str
    table: str
    default_setback_m: float
    enabled: bool = True
    source: str = ""


class ConstraintCatalog(BaseModel):
    constraints: list[ConstraintDef]

    def by_key(self, key: str) -> ConstraintDef | None:
        return next((c for c in self.constraints if c.key == key), None)


@lru_cache
def load_catalog() -> ConstraintCatalog:
    settings = get_settings()
    path = Path(settings.constraints_config_path)
    with path.open() as fh:
        raw = yaml.safe_load(fh)
    return ConstraintCatalog(**raw)
