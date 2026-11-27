"""Run the participant's original app on a dedicated loopback port."""

import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "app"))
from app import make_server


def main():
    data_dir = Path(sys.argv[1])
    data_dir.mkdir(parents=True, exist_ok=True)
    server = make_server(0, data_dir)

    def wait_for_shutdown():
        sys.stdin.buffer.read()
        server.shutdown()

    threading.Thread(target=wait_for_shutdown, daemon=True).start()
    print(server.server_port, flush=True)
    try:
        server.serve_forever(poll_interval=0.2)
    finally:
        server.app.close_all()
        server.app.ai.close()
        server.server_close()


if __name__ == "__main__":
    main()
