from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    GEMINI_MODEL: str = "gemini-3.6-flash"
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    MAX_SOURCES: int = 5
    MAX_FILE_MB: int = 25
    MAX_IMAGES_TO_AI: int = 20
    TOKEN_WARN_LIMIT: int = 150_000

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def max_file_bytes(self) -> int:
        return self.MAX_FILE_MB * 1024 * 1024


settings = Settings()
