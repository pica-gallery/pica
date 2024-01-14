FROM node:21.5.0-bookworm AS js-builder
COPY frontend/ /app/

RUN cd /app \
 && npm install \
 && npm run -- ng build


FROM rust:1.75.0-bookworm AS rust-builder

RUN apt update && apt install -y nasm

COPY . /app/

COPY --from=js-builder /app/dist/pica/browser/ /app/frontend/dist/pica/browser/

RUN cd /app && cargo build --release

FROM debian:bookworm-20240110

RUN apt update \
 && apt install -y imagemagick \
 && rm -rf /var/lib/apt/lists/

WORKDIR /app/

COPY pica.docker-config.yaml ./pica.config.yaml
COPY --from=rust-builder /app/target/release/pica ./pica

EXPOSE 3000

ENTRYPOINT ["/app/pica"]
