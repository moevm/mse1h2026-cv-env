#!/bin/bash

SESSION_NAME="yolo_dev"

tmux has-session -t $SESSION_NAME 2>/dev/null
if [ $? == 0 ]; then
  echo "Сессия $SESSION_NAME уже запущена. Подключаемся..."
  tmux attach-session -t $SESSION_NAME
  exit 0
fi

tmux new-session -d -s $SESSION_NAME -x 160 -y 40

tmux split-window -v -l 10 -t $SESSION_NAME:0
tmux split-window -h -t $SESSION_NAME:0.0

tmux send-keys -t $SESSION_NAME:0.0 'source venv/bin/activate && cd backend && uvicorn main:app --reload' C-m

tmux send-keys -t $SESSION_NAME:0.1 'cd frontend && npm install && npm run dev' C-m

tmux send-keys -t $SESSION_NAME:0.2 "bash -c \"trap 'tmux kill-session -t $SESSION_NAME' INT TERM EXIT; clear; echo -e 'Для остановки и выхода нажмите Ctrl+C'; cat\"" C-m

tmux select-pane -t $SESSION_NAME:0.2
tmux attach-session -t $SESSION_NAME