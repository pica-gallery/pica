# syntax=docker/dockerfile:1

FROM node:21.5.0-bookworm AS js-builder
COPY frontend/ /app/

RUN --mount=type=cache,target=/app/node_modules/ \
    --mount=type=cache,target=/.npm/ \
    cd /app \
 && npm install \
 && npm run -- ng build


FROM rust:1.75.0-bookworm AS rust-builder

RUN apt update && apt install -y nasm

COPY . /app/

# copy files as they are to be embedded into the binary
COPY --from=js-builder /app/dist/pica/browser/ /app/frontend/dist/pica/browser/

RUN --mount=type=cache,target=/app/target/ \
    --mount=type=cache,target=/.cargo/ \
    cd /app && env RUSTFLAGS="-C target-cpu=x86-64-v3" cargo build --release \
 && cp /app/target/release/pica /app/pica

FROM debian:bookworm-20240110

RUN apt update \
 && apt install -y imagemagick \
 && rm -rf /var/lib/apt/lists/

WORKDIR /app/

COPY pica.docker-config.yaml ./pica.config.yaml
COPY --from=rust-builder /app/pica ./pica

EXPOSE 3000

ENTRYPOINT ["/app/pica"]
