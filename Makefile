.PHONY: help init-submodules update-submodules status-submodules

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

init-submodules: ## Initialize and clone all git submodules (run after first clone)
	@echo "Initializing git submodules..."
	git submodule update --init --recursive
	@echo "✓ Submodules initialized"

update-submodules: ## Update all submodules to their latest commits
	@echo "Updating git submodules..."
	git submodule update --remote --recursive
	@echo "✓ Submodules updated"

status-submodules: ## Show status of all submodules
	@echo "Submodule status:"
	@git submodule status --recursive

dev-be: ## Run backend in HTTP mode
	cd apps/specly-server && pnpm run dev:http

dev-fe: ## Run frontend
	cd apps/specly-ui && pnpm run dev

dev: ## Run both backend and frontend concurrently
	make -j2 dev-be dev-fe
