# 中繼伺服器容器：跑 Godot headless，只當 WebSocket 轉送用。
# 可部署到任何支援 Docker 的平台（Render / Railway / Fly.io / 自架 VPS）。
#
#   docker build -f deploy/Dockerfile -t stickman-relay .
#   docker run -p 24570:24570 stickman-relay
#
# 雲端平台通常會用環境變數 PORT 指定連接埠並自動附上 TLS（wss://），
# 玩家端填該平台給的 wss:// 網址即可。

FROM debian:bookworm-slim

ARG GODOT_VERSION=4.7-stable
ARG GODOT_FILE=Godot_v4.7-stable_linux.x86_64

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /tmp/godot.zip \
      "https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}/${GODOT_FILE}.zip" \
    && unzip -q /tmp/godot.zip -d /usr/local/bin \
    && mv "/usr/local/bin/${GODOT_FILE}" /usr/local/bin/godot \
    && chmod +x /usr/local/bin/godot \
    && rm /tmp/godot.zip

WORKDIR /app
COPY project.godot ./
COPY scenes ./scenes
COPY scripts ./scripts
COPY assets ./assets
COPY icon.svg icon.svg.import ./

# 先匯入一次，避免每次啟動都重建 .godot 快取
RUN godot --headless --path /app --import 2>/dev/null || true

EXPOSE 24570
ENV RELAY_PORT=24570

CMD ["godot", "--headless", "--path", "/app", "--", "--relay"]
