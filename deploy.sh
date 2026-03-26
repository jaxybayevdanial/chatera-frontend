#!/usr/bin/env sh
set -eu

IMAGE_NAME="try-chatera"
IMAGE_TAG="${IMAGE_TAG:-v16}"
LOCAL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"
REGISTRY_IMAGE="registry.gitlab.com/galamat/chatbots/playground/${IMAGE_NAME}:${IMAGE_TAG}"
EXPO_PUBLIC_CHATERA_API_URL="${EXPO_PUBLIC_CHATERA_API_URL:-/}"

docker build \
	--build-arg EXPO_PUBLIC_CHATERA_API_URL="${EXPO_PUBLIC_CHATERA_API_URL}" \
	-t "${LOCAL_IMAGE}" \
	.

docker tag "${LOCAL_IMAGE}" "${REGISTRY_IMAGE}"

docker push "${REGISTRY_IMAGE}"