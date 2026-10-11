#!/bin/bash
# usage: run.sh <job-name> <harbor run args...>
# Loads model.env (copy model-settings.sh) and, if present, ~/.aelion-key.env (a file with `export AELION_API_KEY=...`).
set -a; . ~/bench/model.env; [ -f ~/.aelion-key.env ] && . ~/.aelion-key.env; set +a
export PATH=$HOME/.local/bin:$PATH PYTHONPATH=$HOME/bench
name=$1; shift
cd ~/bench && exec harbor run -a aelion_agent:AelionAgent --ak version=0.42.2 -y -o ~/jobs --job-name "$name" "$@"
