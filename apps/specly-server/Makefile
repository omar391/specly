# Makefile for apps/specly-server - Test-Coverage-Maximizer
REPORT ?= coverage/coverage-final.json
TOP ?= 12
QUIET ?= 1
FILE ?=
TEST_GLOB ?= src/**/*.test.ts
SHELL := /bin/bash

# detect-coverage: generate and summarise coverage report
.PHONY: detect-coverage single-file-coverage

# Detect package manager + test runner once (vitest), keeping minimal logic
PKG_MGR = $(shell command -v pnpm >/dev/null 2>&1 && echo "pnpm exec vitest" || \
	(command -v npm >/dev/null 2>&1 && echo "npx vitest" || \
	(command -v yarn >/dev/null 2>&1 && echo "yarn vitest" || echo "")))

# Respect QUIET: when QUIET=1 (default), silence test output
SILENT = $(if $(filter 1,$(QUIET)),>/dev/null 2>&1,)

detect-coverage:
	@[ -n "$(PKG_MGR)" ] || { echo "ERR:no-pkg-manager"; exit 2; }; \
	$(PKG_MGR) --run --coverage --reporter=dot --include '$(TEST_GLOB)' $(SILENT) || true; \
	node scripts/parse-coverage.js --report "$(REPORT)" --top $(TOP); \
	node scripts/print-uncovered-min.cjs --report "$(REPORT)" --top $(TOP)

single-file-coverage:
	@[ -n "$(PKG_MGR)" ] || { echo "ERR:no-pkg-manager"; exit 2; }; \
	[ -n "$(FILE)" ] || { echo "ERR:FILE-required"; exit 2; }; \
	echo "TARGET_FILE=$(FILE)"; \
	$(PKG_MGR) --run --coverage --reporter=dot --include '$(TEST_GLOB)' $(SILENT) || true; \
	node scripts/parse-coverage.js --report "$(REPORT)" --target-file "$(FILE)" --emit-updated; \
	node scripts/print-uncovered-min.cjs --report "$(REPORT)" --target-file "$(FILE)"