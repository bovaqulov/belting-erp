#!/bin/zsh
# Tekshiruv (loyiha standarti: uv + ruff + ty + pytest-testmon).
#   scripts/check.sh            # hammasi: ruff format → ruff check --fix → ty → pytest --testmon (o'zgargan kodga tegishli testlar)
#   NO_TESTS=1 scripts/check.sh # testlarsiz
#   scripts/check.sh --all      # testmon'siz — barcha testlar
set -u
cd "$(dirname "$0")/.."
echo "▶ ruff format"; uv run --quiet ruff format . || exit 1
echo "▶ ruff check --fix"; uv run --quiet ruff check --fix --output-format concise .; rc_ruff=$?
echo "▶ ty"; uv run --quiet ty check --output-format concise | tail -n 40; rc_ty=${pipestatus[1]}
rc_t=0
if [[ -z "${NO_TESTS:-}" ]]; then
  if [[ "${1:-}" == "--all" ]]; then echo "▶ pytest"; uv run --quiet pytest -q || rc_t=1
  else echo "▶ pytest --testmon"; uv run --quiet pytest --testmon --testmon-forceselect -q || rc_t=1; fi
fi
echo
echo "ruff: $([[ $rc_ruff == 0 ]] && echo toza || echo xatolar) · ty: $([[ $rc_ty == 0 ]] && echo toza || echo xabarlar) · testlar: $([[ $rc_t == 0 ]] && echo o\'tdi || echo YIQILDI)"
exit $(( rc_ruff || rc_ty || rc_t ))
