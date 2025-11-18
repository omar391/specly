# Makefile for apps/specly-server - Test-Coverage-Maximizer
REPORT ?= coverage/coverage-final.json
TOP ?= 12
QUIET ?= 1
FILE ?=
TEST_GLOB ?= src/**/*.test.ts
SHELL := /bin/bash

# detect-coverage: generate and summarise coverage report
.PHONY: detect-coverage single-file-coverage

detect-coverage:
	@set -e; \
	RUN=$$(command -v pnpm >/dev/null 2>&1 && echo "pnpm exec vitest --" || (command -v npm >/dev/null 2>&1 && echo "npx vitest" || (command -v yarn >/dev/null 2>&1 && echo "yarn vitest" || echo ""))); \
	if [ -z "$$RUN" ]; then echo "ERR:no-pkg-manager"; exit 2; fi; \
	if [ "$(QUIET)" = "1" ]; then QUIET_FLAGS="--run --coverage --reporter=dot"; else QUIET_FLAGS="--run --coverage"; fi; \
	# run tests to produce coverage report; ignore failures but continue
	eval "$$RUN $$QUIET_FLAGS" >/dev/null 2>&1 || true; \
	# parse and emit stable, machine-parseable lines
	node scripts/parse-coverage.js --report "$(REPORT)" --top $(TOP)

single-file-coverage:
	@set -e; \
	if [ -z "$(FILE)" ]; then echo "ERR:FILE-required"; exit 2; fi; \
	RUN=$$(command -v pnpm >/dev/null 2>&1 && echo "pnpm exec vitest --" || (command -v npm >/dev/null 2>&1 && echo "npx vitest" || (command -v yarn >/dev/null 2>&1 && echo "yarn vitest" || echo ""))); \
	if [ -z "$$RUN" ]; then echo "ERR:no-pkg-manager"; exit 2; fi; \
	if [ "$(QUIET)" = "1" ]; then QUIET_FLAGS="--run --coverage --reporter=dot"; else QUIET_FLAGS="--run --coverage"; fi; \
	# run a focused test pass (best-effort using TEST_GLOB)
	echo "TARGET_FILE=$(FILE)"; \
	eval "$$RUN $$QUIET_FLAGS --include '$(TEST_GLOB)'" >/dev/null 2>&1 || true; \
	# parse report and emit file-level coverage after the focused run
	node scripts/parse-coverage.js --report "$(REPORT)" --target-file "$(FILE)" --emit-updated