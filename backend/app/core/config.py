from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://shiv:123456@localhost:5432/buildable_db"

    working_srid: int = 32614
    display_srid: int = 4326

    max_query_area_m2: float = 5_000_000_000.0

    constraints_config_path: str = "app/core/constraints.yaml"


@lru_cache
def get_settings() -> Settings:
    return Settings()
