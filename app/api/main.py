"""uvicorn entrypoint: `python -m app.api.main`."""
from __future__ import annotations

import uvicorn


def main() -> None:
    uvicorn.run("app.api:app", host="0.0.0.0", port=47131, reload=False, log_level="info")


if __name__ == "__main__":
    main()
