"""Entry point: python -m wolfquant

Starts the WolfQuant server with uvicorn.
All configuration via environment variables (see .env.example).
"""

import os
import sys


def main():
    port = int(os.getenv("WOLFQUANT_PORT", "8080"))
    host = os.getenv("WOLFQUANT_HOST", "0.0.0.0")

    try:
        import uvicorn
    except ImportError:
        print("uvicorn not installed. Run: pip install uvicorn")
        sys.exit(1)

    print(f"🐺 WolfQuant → http://{host}:{port}")
    uvicorn.run(
        "wolfquant.server:app",
        host=host,
        port=port,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
