"""Chạy web luyện thi trong mạng nội bộ để mở trên điện thoại (cùng Wi-Fi với máy tính).

Cách dùng:
    python scripts/serve.py          # cổng mặc định 8000
    python scripts/serve.py 9000
"""
import functools
import http.server
import socket
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent / "web"


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # không gửi gói tin, chỉ để lấy IP card mạng đang dùng
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    sys.stdout.reconfigure(errors="replace")  # console Windows không phải UTF-8
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(WEB))
    with http.server.ThreadingHTTPServer(("0.0.0.0", port), handler) as httpd:
        print(f"Máy tính : http://localhost:{port}")
        print(f"Điện thoại (cùng Wi-Fi): http://{lan_ip()}:{port}")
        print("Nhấn Ctrl+C để dừng.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
