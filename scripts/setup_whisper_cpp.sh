#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
runtime_dir=${MEDISCRIBE_RUNTIME_DIR:-"$repo_root/.runtime"}
source_dir="$runtime_dir/whisper.cpp"
cmake_venv="$runtime_dir/cmake-venv"
whisper_commit=1da4dc82fa7996d4edda05890dca65aeceaafd6d
build_jobs=${MEDISCRIBE_BUILD_JOBS:-2}

if ! [[ "$build_jobs" =~ ^[1-9][0-9]*$ ]]; then
    echo "MEDISCRIBE_BUILD_JOBS must be a positive integer" >&2
    exit 1
fi

mkdir -p "$runtime_dir"
if [[ ! -d "$source_dir/.git" ]]; then
    git init "$source_dir"
    git -C "$source_dir" remote add origin https://github.com/ggml-org/whisper.cpp.git
    git -C "$source_dir" fetch --depth 1 origin "$whisper_commit"
    git -C "$source_dir" checkout --detach FETCH_HEAD
fi
if [[ $(git -C "$source_dir" rev-parse HEAD) != "$whisper_commit" ]]; then
    echo "Unexpected whisper.cpp revision in $source_dir" >&2
    exit 1
fi

python -m venv "$cmake_venv"
"$cmake_venv/bin/pip" install --quiet "cmake==4.4.3"
"$cmake_venv/bin/cmake" \
    -S "$source_dir" \
    -B "$source_dir/build" \
    -DCMAKE_BUILD_TYPE=Release \
    -DWHISPER_SDL2=OFF
"$cmake_venv/bin/cmake" \
    --build "$source_dir/build" \
    --config Release \
    --target whisper-cli \
    -j "$build_jobs"

download_model() {
    local name=$1
    local sha=$2
    local target="$source_dir/models/ggml-$name.bin"
    local partial="$target.part"
    if [[ -f "$target" ]] && echo "$sha  $target" | sha1sum --check --status; then
        return
    fi
    if [[ -f "$target" ]]; then
        echo "Model checksum failed: $target" >&2
        exit 1
    fi
    curl --location --fail --retry 5 --continue-at - \
        --output "$partial" \
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$name.bin"
    echo "$sha  $partial" | sha1sum --check --status
    mv "$partial" "$target"
}

download_model small-q5_1 6fe57ddcfdd1c6b07cdcc73aaf620810ce5fc771
download_model large-v3-turbo-q5_0 e050f7970618a659205450ad97eb95a18d69c9ee

printf '\nSetup complete. Configure the backend with:\n'
printf 'MEDISCRIBE_WHISPER_CPP_BINARY=%s\n' "$source_dir/build/bin/whisper-cli"
printf 'MEDISCRIBE_WHISPER_LIVE_MODEL=%s\n' "$source_dir/models/ggml-small-q5_1.bin"
printf 'MEDISCRIBE_WHISPER_FINAL_MODEL=%s\n' "$source_dir/models/ggml-large-v3-turbo-q5_0.bin"
