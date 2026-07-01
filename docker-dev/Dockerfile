FROM oven/bun:1.3.14

# Build tools for native modules (node-pty, tree-sitter, protobufjs)
# python-is-python3: node-gyp requires 'python' binary (not 'python3')
RUN apt-get update && apt-get install -y \
    bash \
    build-essential \
    ca-certificates \
    curl \
    git \
    jq \
    nodejs \
    npm \
    python3 \
    python-is-python3 \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g node-gyp
RUN git config --global --add safe.directory '*'
COPY docker-dev/config /root/.config/opencode
RUN cd /root/.config/opencode && npm install --no-audit --no-fund
WORKDIR /workspace/src
COPY docker-dev/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["bash"]
