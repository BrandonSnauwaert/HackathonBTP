# Serveur STT Kyutai (moshi-server, Rust/candle) avec le modèle stt-1b-en_fr.
# Adapté de kyutai-labs/unmute (services/moshi-server/public.Dockerfile), mais
# compilé au build plutôt qu'au démarrage du conteneur.

ARG CUDA_VERSION=12.8.1

FROM nvidia/cuda:${CUDA_VERSION}-devel-ubuntu22.04 AS build

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates build-essential pkg-config libssl-dev cmake git python3-dev \
    && rm -rf /var/lib/apt/lists/*

RUN curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"

# Architecture GPU ciblée par les kernels CUDA (pas de GPU visible pendant `docker build`).
# 75 = Turing (GTX 16xx / RTX 20xx), 86 = Ampere (RTX 30xx), 89 = Ada (RTX 40xx).
ARG CUDA_COMPUTE_CAP=75
ENV CUDA_COMPUTE_CAP=${CUDA_COMPUTE_CAP}

ARG MOSHI_SERVER_VERSION=0.6.4
RUN --mount=type=cache,target=/root/.cargo/registry \
    cargo install --locked --features cuda moshi-server@${MOSHI_SERVER_VERSION}


FROM nvidia/cuda:${CUDA_VERSION}-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
# moshi-server est lié à libpython (pyo3), même si le module ASR n'utilise pas Python.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl libssl3 libpython3.10 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /root/.cargo/bin/moshi-server /usr/local/bin/moshi-server

WORKDIR /app
RUN mkdir -p static logs
COPY config.toml ./config.toml

EXPOSE 8080
ENV RUST_BACKTRACE=1
# Premier démarrage : téléchargement du modèle (~2 Go) depuis Hugging Face.
HEALTHCHECK --start-period=5m CMD curl -fs http://localhost:8080/api/build_info || exit 1

ENTRYPOINT ["moshi-server", "worker", "--config", "config.toml"]
