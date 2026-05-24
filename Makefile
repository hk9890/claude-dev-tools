# Makefile — discoverable entry point for the local development stack.
#
# Usage:  make [target]  (bare `make` prints this help)
# Extra args for targets that accept them: make <target> ARGS="--flag value"

.DEFAULT_GOAL := help
.PHONY: help test test-html check-consistency analyze-sessions lint

help: ## Show available targets
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

test: ## Run the full test suite (all plugins)
	bash tests/run-all.sh

test-html: ## Run html-visualization browser/server tests only
	bash tests/html-visualization/script-tests/run-all.sh

check-consistency: ## Validate internal cross-references and version mirrors
	python3 scripts/check-internal-consistency.py $(ARGS)

analyze-sessions: ## Analyse Claude Code session transcripts (use ARGS= for options)
	python3 scripts/analyze-sessions.py $(ARGS)

lint: ## (no linter configured — placeholder target)
	@echo "No linter configured for this repo."
