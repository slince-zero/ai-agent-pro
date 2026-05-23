#!/usr/bin/env sh
set -eu

image_name="${IMAGE_NAME:-registry.gitlab.dipeak.com/dipeak/generic-repository/ask-bi-node}"
default_build_tag="$(date +%Y%m%d-%H%M%S)-ai-pro-agent"
build_tag="${1:-${BUILD_TAG:-$default_build_tag}}"
docker_platform="${DOCKER_PLATFORM:-linux/amd64}"
build_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
push_image="${PUSH_IMAGE:-1}"
save_archive="${SAVE_ARCHIVE:-0}"
archive_dir="${ARCHIVE_DIR:-dist/docker}"
safe_image_name="$(printf '%s' "$image_name" | tr '/:' '__')"
safe_platform="$(printf '%s' "$docker_platform" | tr '/:' '__')"
archive_file="${ARCHIVE_FILE:-$archive_dir/${safe_image_name}_${build_tag}_${safe_platform}.tar.gz}"

if docker buildx version >/dev/null 2>&1; then
  docker buildx build \
    --platform "$docker_platform" \
    --load \
    --build-arg BUILD_TAG="$build_tag" \
    --build-arg BUILD_TIME="$build_time" \
    -t "$image_name:$build_tag" \
    .
else
  docker build \
    --platform "$docker_platform" \
    --build-arg BUILD_TAG="$build_tag" \
    --build-arg BUILD_TIME="$build_time" \
    -t "$image_name:$build_tag" \
    .
fi

printf 'Built %s:%s for %s\n' "$image_name" "$build_tag" "$docker_platform"

if [ "$push_image" = "1" ]; then
  docker push "$image_name:$build_tag"
  printf 'Pushed %s:%s\n' "$image_name" "$build_tag"
fi

if [ "$save_archive" = "1" ]; then
  mkdir -p "$archive_dir"
  docker save "$image_name:$build_tag" | gzip -c > "$archive_file"
  printf 'Saved image archive to %s\n' "$archive_file"
fi
