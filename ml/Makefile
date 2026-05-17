# ml/Makefile — one-shot entry points for the ML pipeline.
#
# Two real targets:
#
#   make models        # train geographic + cluster + build HTML report
#   make performance   # held-out perf metrics + categorical sanity, writes .txt
#
# `make` (no args) prints the help. All recipes cd to the repo root for you,
# so this Makefile works from any cwd:
#
#   cd ml && make models
#   make -C ml performance
#   (cd /path/to/UncommonHacks/ml && make models)

ML_DIR    := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
REPO_ROOT := $(abspath $(ML_DIR)/..)
PY        := $(ML_DIR).venv/bin/python
EVAL_OUT  := $(ML_DIR)artifacts/eval

.DEFAULT_GOAL := help
.PHONY: help train models performance

help:  ## Show available targets.
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(firstword $(MAKEFILE_LIST)) | \
	  awk 'BEGIN{FS = ":.*?## "}; {printf "  make %-12s  %s\n", $$1, $$2}'
	@echo ""
	@echo "First-time setup: \`make train\` to fit the models, or \`make models\`"
	@echo "to also build the HTML report. Then \`make performance\` for the eval txts."

train:  ## Retrain geographic + cluster models from the real-data panel (no report).
	@echo "==> training geographic model"
	cd $(REPO_ROOT) && $(PY) -m ml.pipelines.train_geographic
	@echo "==> training cluster model"
	cd $(REPO_ROOT) && $(PY) -m ml.pipelines.train_cluster
	@echo "==> done. summaries: $(ML_DIR)artifacts/{geographic,cluster}/summary.json"

models: train  ## Retrain + build the real-data HTML report.
	@echo "==> building real-data HTML report"
	cd $(REPO_ROOT) && $(PY) -m ml.app.build_report
	@echo "==> done. open $(ML_DIR)artifacts/report/index.html"

performance:  ## Held-out test metrics + categorical sanity test (-> artifacts/eval/).
	@mkdir -p $(EVAL_OUT)
	@echo "==> held-out performance"
	cd $(REPO_ROOT) && $(PY) -m ml.eval.performance --out $(EVAL_OUT)/performance.txt
	@echo "==> categorical sanity"
	cd $(REPO_ROOT) && $(PY) -m ml.eval.sanity      --out $(EVAL_OUT)/sanity.txt
	@echo "==> done. reports in $(EVAL_OUT)/"
