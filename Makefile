# Point Quest Docker image builds
# Usage:
#   make build-amd64 IMAGE_REGISTRY=registry.example.com/ns IMAGE_TAG=v1.0.0
#   make build-arm64
#   make build

IMAGE_REGISTRY ?= registry.cn-hangzhou.aliyuncs.com/your-namespace
IMAGE_TAG ?= v0.0.0

TARGETS := migrate api web

.PHONY: help build build-amd64 build-arm64

help:
	@echo "Docker image builds + push (migrate / api / web)"
	@echo ""
	@echo "  make build              Build & push for the host platform"
	@echo "  make build-amd64        Build & push for linux/amd64"
	@echo "  make build-arm64        Build & push for linux/arm64"
	@echo ""
	@echo "Variables (override on the command line):"
	@echo "  IMAGE_REGISTRY=$(IMAGE_REGISTRY)"
	@echo "  IMAGE_TAG=$(IMAGE_TAG)"
	@echo ""
	@echo "Example:"
	@echo "  make build-amd64 IMAGE_REGISTRY=registry.cn-hangzhou.aliyuncs.com/my-ns IMAGE_TAG=v1.0.0"

build:
	@$(MAKE) _build-platform PLATFORM=

build-amd64:
	@$(MAKE) _build-platform PLATFORM=linux/amd64

build-arm64:
	@$(MAKE) _build-platform PLATFORM=linux/arm64

.PHONY: _build-platform
_build-platform:
	@set -e; \
	if [ -z "$(IMAGE_REGISTRY)" ]; then \
	  echo "ERROR: IMAGE_REGISTRY is required (e.g. registry.example.com/ns)"; \
	  exit 1; \
	fi; \
	for target in $(TARGETS); do \
	  image="$(IMAGE_REGISTRY)/point-quest-$${target}:$(IMAGE_TAG)"; \
	  echo "==> Building $${image}$(if $(PLATFORM), ($(PLATFORM)))"; \
	  if [ -n "$(PLATFORM)" ]; then \
	    docker buildx build --platform "$(PLATFORM)" --target "$${target}" -t "$${image}" --load .; \
	  else \
	    docker buildx build --target "$${target}" -t "$${image}" --load .; \
	  fi; \
	  echo "==> Pushing $${image}"; \
	  docker push "$${image}"; \
	done; \
	echo "==> Done. Images built and pushed under $(IMAGE_REGISTRY) : $(IMAGE_TAG)"
