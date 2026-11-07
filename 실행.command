#!/bin/zsh
# Croco Phonics — 더블클릭 실행: 로컬 서버(5211)를 띄우고 브라우저를 연다.
cd "$(dirname "$0")"
PORT=5211
if ! curl -s -o /dev/null "http://127.0.0.1:$PORT/index.html"; then
  nohup python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
  sleep 0.8
fi
open "http://127.0.0.1:$PORT/?v=$(date +%s)"
