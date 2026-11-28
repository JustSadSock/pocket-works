#!/usr/bin/env bash
# Linux CI only. A separate session contains Wrangler, Miniflare and workerd.
# Never use a global pkill or change the application's security configuration.
worker_pid=""
worker_port=""
worker_group_live() {
  [[ -n "$worker_pid" ]] && ps -eo pgid=,stat= | awk -v pg="$worker_pid" '$1 == pg && $2 !~ /^Z/ {live=1} END {exit !live}'
}
worker_port_free() {
  local listeners
  listeners=$(ss -H -ltn "sport = :$worker_port") || return 1
  [[ -z "$listeners" ]]
}
worker_start() {
  local executable=$1 port=$2 logfile=$3
  shift 3
  if [[ -n "$worker_pid" ]]; then echo "Previous Worker has not been stopped" >&2; return 1; fi
  worker_port=$port
  if ! worker_port_free; then echo "Worker port $port is already occupied" >&2; return 1; fi
  # In non-interactive Bash the asynchronous child is not a process-group leader,
  # so setsid execs Wrangler without an extra fork; $! is its session/PGID.
  setsid "$executable" dev --local --ip 127.0.0.1 --port "$port" "$@" >"$logfile" 2>&1 &
  worker_pid=$!
}
worker_stop() {
  [[ -n "$worker_pid" ]] || return 0
  local pid=$worker_pid i
  # The original process may already have exited while workerd is still alive.
  # Signal the entire group rather than merely the Wrangler wrapper.
  kill -TERM -- "-$pid" 2>/dev/null || true
  # Also cover termination immediately after spawn, before setsid has executed.
  kill -TERM "$pid" 2>/dev/null || true
  for ((i=0;i<50;i++)); do
    if ! worker_group_live; then break; fi
    sleep 0.1
  done
  if worker_group_live; then
    echo "Worker group $pid did not stop on TERM; escalating to KILL" >&2
    kill -KILL -- "-$pid" 2>/dev/null || true
  fi
  for ((i=0;i<50;i++)); do
    if ! worker_group_live && worker_port_free; then break; fi
    sleep 0.1
  done
  if worker_group_live || ! worker_port_free; then
    echo "Worker cleanup failed: group=$pid port=$worker_port" >&2
    return 1
  fi
  wait "$pid" 2>/dev/null || true
  echo "WORKER_STOPPED group=$pid port=$worker_port"
  worker_pid=""
  worker_port=""
}
